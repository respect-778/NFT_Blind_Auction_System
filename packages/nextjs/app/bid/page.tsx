'use client';

import { useState, useEffect, Suspense } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { notification } from "~~/utils/scaffold-eth";
import { useSearchParams } from 'next/navigation';
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { useRouter } from 'next/navigation';
import { formatEther, parseEther, keccak256, encodePacked, toBytes, Hex } from 'viem';
import MeteorRain from '~~/components/MeteorRain';
import StarryBackground from '~~/components/StarryBackground';
import { MetaHeader } from '~~/components/MetaHeader';
import { handleTransactionError, handleTransactionStatus } from "~~/utils/transactionErrorHandler";

function BidContent() {
  const { address: connectedAddress } = useAccount();
  const searchParams = useSearchParams();
  const auctionAddress = searchParams?.get('address') as `0x${string}` | undefined;
  const [value, setValue] = useState<string>('');
  const [fake, setFake] = useState<boolean>(false);
  const [secret, setSecret] = useState<string>('');
  const [blindedBid, setBlindedBid] = useState<Hex | ''>('');
  const [deposit, setDeposit] = useState<string>('');
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [phase, setPhase] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [hasParticipated, setHasParticipated] = useState<boolean>(false);
  const [minPrice, setMinPrice] = useState<string>('0');
  const [minPriceWei, setMinPriceWei] = useState<bigint>(BigInt(0));
  const [auctionMetadata, setAuctionMetadata] = useState<any>(null);
  const [txHash, setTxHash] = useState<string>('');
  const [isWaitingConfirmation, setIsWaitingConfirmation] = useState<boolean>(false);
  const [txConfirmed, setTxConfirmed] = useState<boolean>(false);
  const router = useRouter();

  const publicClient = usePublicClient();
  const { data: blindAuctionInfo } = useDeployedContractInfo("BlindAuction");
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { data: nftContractData } = useDeployedContractInfo("AuctionNFT");
  const { data: walletClient } = useWalletClient();

  useEffect(() => {
    if (!auctionAddress) {
      setError("未指定拍卖地址，请从正确的拍卖详情页进入");
      setLoading(false);
    }
  }, [auctionAddress]);

  useEffect(() => {
    const fetchAuctionData = async () => {
      if (!auctionAddress || !publicClient || !blindAuctionInfo) return;

      try {
        const [biddingStartData, biddingEndData, revealEndData, endedData] = await Promise.all([
          publicClient.readContract({ address: auctionAddress, abi: blindAuctionInfo.abi, functionName: 'biddingStart' }),
          publicClient.readContract({ address: auctionAddress, abi: blindAuctionInfo.abi, functionName: 'biddingEnd' }),
          publicClient.readContract({ address: auctionAddress, abi: blindAuctionInfo.abi, functionName: 'revealEnd' }),
          publicClient.readContract({ address: auctionAddress, abi: blindAuctionInfo.abi, functionName: 'ended' })
        ]);

        // 🔧 增强元数据和最低价格获取逻辑
        let metadata = {
          name: "未命名拍卖",
          description: "无描述",
          image: "",
          minPrice: "0",
        };

        try {
          // 首先尝试检查是否为NFT拍卖
          const isNFTAuction = await publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionInfo.abi,
            functionName: 'isNFTAuction',
          }) as boolean;

          console.log(`竞拍页面拍卖 ${auctionAddress} 是否为NFT拍卖:`, isNFTAuction);

          if (isNFTAuction && nftContractData) {
            // 获取NFT Token ID和合约地址
            const [nftTokenId, nftContractAddress] = await Promise.all([
              publicClient.readContract({
                address: auctionAddress,
                abi: blindAuctionInfo.abi,
                functionName: 'nftTokenId',
              }) as Promise<bigint>,
              publicClient.readContract({
                address: auctionAddress,
                abi: blindAuctionInfo.abi,
                functionName: 'nftContract',
              }) as Promise<`0x${string}`>
            ]);

            console.log(`竞拍页面NFT拍卖 - Token ID: ${nftTokenId}, 合约地址: ${nftContractAddress}`);

            if (nftContractAddress && nftTokenId > 0n) {
              try {
                // 从NFT合约获取元数据
                const nftMetadata = await publicClient.readContract({
                  address: nftContractAddress,
                  abi: nftContractData.abi,
                  functionName: 'nftMetadata',
                  args: [nftTokenId],
                }) as readonly [string, string, string, bigint, `0x${string}`, boolean, `0x${string}`, bigint];

                const [name, description, imageHash, minPriceWei] = nftMetadata;

                // 构建图片URL
                let imageUrl = "";
                if (imageHash) {
                  if (imageHash.startsWith('http')) {
                    imageUrl = imageHash;
                  } else if (imageHash.startsWith('ipfs://')) {
                    const hash = imageHash.replace('ipfs://', '');
                    imageUrl = `https://ipfs.io/ipfs/${hash}`;
                  } else if (imageHash.trim()) {
                    imageUrl = `https://ipfs.io/ipfs/${imageHash}`;
                  }
                }

                // 转换价格
                const minPriceValue = minPriceWei ? minPriceWei.toString() : "0";

                metadata = {
                  name: name || `NFT #${Number(nftTokenId)}`,
                  description: description || "无描述",
                  image: imageUrl,
                  minPrice: minPriceValue,
                };

                console.log("从NFT合约获取到竞拍页面拍卖的元数据:", metadata);
              } catch (nftError) {
                console.error("从NFT合约获取竞拍页面拍卖元数据失败:", nftError);
              }
            }
          }

          // 如果从NFT合约获取失败或不是NFT拍卖，尝试从事件日志获取
          if (metadata.minPrice === "0" && factoryContractData) {
            console.log("尝试从事件日志获取竞拍页面拍卖的元数据...");
            const logs = await publicClient.getContractEvents({
              address: factoryContractData.address,
              abi: factoryContractData.abi,
              eventName: 'AuctionCreated',
              args: { auctionAddress: auctionAddress },
              fromBlock: BigInt(0),
            });

            if (logs && logs.length > 0 && logs[0].args) {
              const metadataStr = logs[0].args.metadata as string;
              if (metadataStr) {
                try {
                  const parsedMetadata = JSON.parse(metadataStr);
                  metadata = {
                    ...parsedMetadata,
                    // 确保图片URL正确格式化
                    image: parsedMetadata.imageHash
                      ? `https://ipfs.io/ipfs/${parsedMetadata.imageHash}`
                      : parsedMetadata.image || ""
                  };
                  console.log("从事件日志获取到竞拍页面拍卖的元数据:", metadata);
                } catch (e) {
                  console.error("解析竞拍页面拍卖元数据字符串失败:", e);
                }
              }
            }
          }
        } catch (error) {
          console.error("获取竞拍页面拍卖元数据失败:", error);
        }

        // 设置拍卖元数据和最低价格
        setAuctionMetadata(metadata);
        const minPriceWei = BigInt(metadata.minPrice || '0');
        const formattedMinPrice = minPriceWei > 0n ? formatEther(minPriceWei) : "0";
        setMinPrice(formattedMinPrice);
        setMinPriceWei(minPriceWei);

        console.log(`竞拍页面设置最低价格: ${formattedMinPrice} ETH (Wei: ${minPriceWei.toString()})`);

        const now = Math.floor(Date.now() / 1000);
        const ended = Boolean(endedData);
        let calculatedPhase = 0;

        if (ended) calculatedPhase = 3;
        else if (now > Number(revealEndData)) calculatedPhase = 3;
        else if (now > Number(biddingEndData)) calculatedPhase = 2;
        else if (now < Number(biddingStartData)) calculatedPhase = 0;
        else calculatedPhase = 1;

        setPhase(calculatedPhase);

        let remaining = 0;
        if (calculatedPhase === 0) remaining = Math.max(0, Number(biddingStartData) - now);
        else if (calculatedPhase === 1) remaining = Math.max(0, Number(biddingEndData) - now);
        else if (calculatedPhase === 2) remaining = Math.max(0, Number(revealEndData) - now);

        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        setTimeLeft(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);

        // 数据加载完成，设置loading为false
        setLoading(false);

      } catch (error) {
        console.error("获取竞拍页面拍卖数据失败:", error);
        setError("获取拍卖数据失败，该拍卖可能不存在");
        setLoading(false);
      }
    };

    fetchAuctionData();
    const intervalId = setInterval(fetchAuctionData, 10000);
    return () => clearInterval(intervalId);
  }, [auctionAddress, publicClient, blindAuctionInfo, factoryContractData, nftContractData]);

  useEffect(() => {
    if (connectedAddress && auctionAddress) {
      try {
        const normalizedAddress = connectedAddress.toLowerCase();
        const existingBids = JSON.parse(localStorage.getItem(`bids_${normalizedAddress}`) || '[]');
        setHasParticipated(existingBids.some((bid: any) => bid.auctionAddress === auctionAddress));
      } catch (error) {
        // 检查参与状态出错，忽略错误
      }
    }
  }, [connectedAddress, auctionAddress]);

  const generateBlindedBid = async () => {
    if (!value.trim() || !secret.trim()) {
      notification.error("请填写出价金额和密钥");
      return;
    }
    try {
      setIsCalculating(true);
      const valueInWei = parseEther(value);

      // 按照合约要求计算哈希
      const secretBytes32 = keccak256(toBytes(secret));
      const encodedData = encodePacked(
        ["uint256", "bool", "bytes32"],
        [valueInWei, fake, secretBytes32]
      );
      const hash = keccak256(encodedData);
      setBlindedBid(hash);
    } catch (error) {
      notification.error("计算哈希失败，请检查输入值");
    } finally {
      setIsCalculating(false);
    }
  };

  const handleBid = async () => {
    if (!connectedAddress || !walletClient) {
      notification.error("请先连接钱包");
      return;
    }
    if (!auctionAddress || !blindAuctionInfo) {
      notification.error("拍卖信息不完整");
      return;
    }
    if (!blindedBid) {
      notification.error("请先生成盲拍哈希");
      return;
    }
    if (hasParticipated) {
      notification.warning("您已经在此拍卖中出价，每个用户只能出价一次");
      return;
    }

    try {
      const valueInWei = parseEther(value);
      const depositInWei = parseEther(deposit);

      if (fake && depositInWei < minPriceWei) {
        notification.error(`虚假出价时，押金必须至少为最低价 (${minPrice} ETH)`);
        return;
      }
      if (!fake && depositInWei < valueInWei) {
        notification.error("真实出价时，押金必须大于或等于您的出价");
        return;
      }
      if (!fake && valueInWei < minPriceWei) {
        notification.error(`真实出价必须大于或等于最低价 (${minPrice} ETH)`);
        return;
      }

      setIsSubmitting(true);
      handleTransactionStatus.submitted("出价");

      // 第一步：提交交易
      const hash = await walletClient.writeContract({
        address: auctionAddress,
        abi: blindAuctionInfo.abi,
        functionName: 'bid',
        args: [blindedBid],
        value: depositInWei,
      });

      // 保存交易哈希并设置等待确认状态
      setTxHash(hash);
      setIsWaitingConfirmation(true);
      setIsSubmitting(false);

      handleTransactionStatus.pending("出价");

      // 第二步：等待交易确认
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: hash,
          timeout: 120000, // 2分钟超时
        });

        // 交易确认成功
        if (receipt.status === 'success') {
          setTxConfirmed(true);
          setIsWaitingConfirmation(false);

          handleTransactionStatus.confirmed("出价");

          // 保存竞拍信息到本地
          const bidInfo = {
            value,
            fake,
            secret,
            blindedBid,
            deposit,
            timestamp: Math.floor(Date.now() / 1000),
            auctionAddress,
            txHash: hash,
          };

          const normalizedAddress = connectedAddress.toLowerCase();
          const existingBids = JSON.parse(localStorage.getItem(`bids_${normalizedAddress}`) || '[]');
          existingBids.push(bidInfo);
          localStorage.setItem(`bids_${normalizedAddress}`, JSON.stringify(existingBids));

          setHasParticipated(true);
        } else {
          // 交易失败
          setIsWaitingConfirmation(false);
          setTxHash('');
          notification.error("交易失败，请重试");
        }
      }

    } catch (error: any) {
      setIsSubmitting(false);
      setIsWaitingConfirmation(false);
      setTxHash('');

      // 使用统一的错误处理
      handleTransactionError(error, "出价");
    }
  };

  const generateRandomSecret = () => {
    const randomBytes = new Uint8Array(32);
    window.crypto.getRandomValues(randomBytes);
    const secretHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    setSecret(`0x${secretHex}`);
  };

  const getPhaseInfo = () => {
    switch (phase) {
      case 0: return { text: "拍卖未开始", color: "text-blue-400", label: "竞拍开始倒计时" };
      case 1: return { text: "竞拍中", color: "text-green-400", label: "竞拍剩余时间" };
      case 2: return { text: "揭示中", color: "text-yellow-400", label: "已进入揭示阶段" };
      case 3: return { text: "已结束", color: "text-red-400", label: "拍卖已结束" };
      default: return { text: "加载中", color: "text-slate-400", label: "正在获取状态" };
    }
  };

  const phaseInfo = getPhaseInfo();

  if (loading || phase === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg text-primary mb-4"></span>
          <p className="text-slate-300">正在加载拍卖数据...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
        <div className="text-center p-8 bg-slate-900/50 rounded-xl">
          <h2 className="text-2xl text-red-500">错误</h2>
          <p className="mt-4">{error}</p>
          <button onClick={() => router.back()} className="mt-6 btn btn-primary">返回</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <MetaHeader title="参与竞拍 | 区块链盲拍平台" />
      <div className="min-h-screen relative overflow-hidden text-white">
        {/* 星空背景 */}
        <StarryBackground
          meteorCount={25}
          starCount={30}
          asteroidCount={20}
          theme="blue-purple"
          showGradients={true}
        />

        {/* 装饰线条 */}
        <div className="absolute top-[30%] left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent"></div>
        <div className="absolute top-[70%] left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
        <div className="absolute top-0 left-[20%] w-px h-full bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent"></div>
        <div className="absolute top-0 left-[80%] w-px h-full bg-gradient-to-b from-transparent via-purple-500/20 to-transparent"></div>

        {/* 流星雨效果 */}
        <MeteorRain count={12} />

        {/* 主内容区 */}
        <div className="relative z-10 w-full min-h-screen flex">
          {/* 左侧边栏 */}
          <div className="w-80 bg-slate-900/60 backdrop-blur-lg border-r border-slate-700/50 flex flex-col">
            {/* 左侧顶部 - 页面标题 */}
            <div className="p-6 border-b border-slate-700/50">
              <h1 className="text-3xl font-bold text-white mb-2">参与竞拍</h1>
              <div className="h-1 w-20 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mb-3"></div>
              <p className="text-slate-300 text-sm">
                项目:
                <span className="font-medium ml-1 text-white">
                  {auctionMetadata?.name || "加载中..."}
                </span>
              </p>
              <p className="text-slate-300 text-sm mt-1">
                最低出价:
                <span className="font-medium ml-1 text-green-400">{minPrice} ETH</span>
              </p>
            </div>

            {/* 左侧拍卖状态信息 */}
            <div className="p-8 border-b border-slate-700/50 flex-1">
              <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
                <span className="mr-3">📊</span> 拍卖状态
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-400 text-base">当前阶段</span>
                  <span className={`font-bold ${phaseInfo.color} px-4 py-2 rounded-full bg-white/5 border border-current/30 text-sm`}>
                    {phaseInfo.text}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-400 text-base">剩余时间</span>
                  <span className="text-cyan-400 text-base font-mono font-semibold">{timeLeft}</span>
                </div>
                {!connectedAddress && (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-400 text-base">钱包状态</span>
                    <span className="text-red-400 text-sm">未连接</span>
                  </div>
                )}
                {connectedAddress && hasParticipated && (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-400 text-base">参与状态</span>
                    <span className="text-green-400 text-sm">已参与</span>
                  </div>
                )}
              </div>
            </div>

            {/* 左侧快捷操作 */}
            <div className="p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <span className="mr-2">🚀</span> 快捷操作
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => router.push('/my-bids')}
                  className="btn btn-sm btn-primary w-full"
                >
                  我的竞拍记录
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="btn btn-sm btn-ghost w-full"
                >
                  返回首页
                </button>
              </div>
            </div>
          </div>

          {/* 中间主内容区域 */}
          <div className="flex-1 flex flex-col">
            {!connectedAddress ? (
              <div className="flex items-center justify-center h-full p-8">
                <div className="bg-slate-900/60 backdrop-blur-lg rounded-2xl p-8 border border-slate-700/50 shadow-xl max-w-2xl w-full text-center">
                  <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>

                  <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 mb-4">
                    连接钱包参与竞拍
                  </h2>

                  <p className="text-slate-300 text-lg mb-8 leading-relaxed">
                    您需要连接以太坊钱包才能参与区块链竞拍。连接后可以安全地提交出价、揭示结果并管理您的竞拍资产。
                  </p>

                  {/* 功能特性 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-slate-800/50 rounded-lg p-4 border border-blue-500/20">
                      <div className="text-blue-400 text-2xl mb-2">🔐</div>
                      <h4 className="font-semibold text-blue-300 mb-1">盲拍机制</h4>
                      <p className="text-slate-400 text-sm">出价加密保护隐私</p>
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-4 border border-purple-500/20">
                      <div className="text-purple-400 text-2xl mb-2">💰</div>
                      <h4 className="font-semibold text-purple-300 mb-1">押金保护</h4>
                      <p className="text-slate-400 text-sm">智能合约管理资金</p>
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-4 border border-cyan-500/20">
                      <div className="text-cyan-400 text-2xl mb-2">⚡</div>
                      <h4 className="font-semibold text-cyan-300 mb-1">即时交易</h4>
                      <p className="text-slate-400 text-sm">区块链透明可信</p>
                    </div>
                  </div>

                  {/* 连接按钮 */}
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 p-1 rounded-xl">
                      <button className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 transform hover:scale-[1.02]">
                        <span className="text-xl mr-3">🦄</span>
                        连接钱包开始竞拍
                      </button>
                    </div>

                    <p className="text-slate-400 text-xs">
                      点击上方按钮将打开钱包连接选项
                    </p>
                  </div>
                </div>
              </div>
            ) : isWaitingConfirmation ? (
              <div className="flex items-center justify-center h-full p-8">
                <div className="bg-gradient-to-br from-blue-900/80 via-indigo-800/70 to-purple-900/80 backdrop-blur-md rounded-2xl border border-blue-500/50 shadow-2xl relative overflow-hidden max-w-4xl w-full">
                  {/* 背景装饰 */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:20px_20px]"></div>

                  {/* 顶部装饰条 */}
                  <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 animate-pulse"></div>

                  <div className="p-8 relative z-10 text-center">
                    {/* 等待图标和标题 */}
                    <div className="mb-8">
                      <div className="w-20 h-20 mx-auto mb-6 relative">
                        <div className="absolute inset-0 border-4 border-blue-500/30 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <div className="absolute inset-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                          <span className="text-2xl">⏳</span>
                        </div>
                      </div>
                      <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 mb-4">
                        等待交易确认
                      </h2>
                      <div className="w-32 h-1 bg-gradient-to-r from-blue-500 to-purple-500 mx-auto rounded-full"></div>
                    </div>

                    {/* 等待信息卡片 */}
                    <div className="bg-gradient-to-r from-blue-800/40 to-indigo-800/40 rounded-xl p-6 mb-8 border border-blue-500/30">
                      <h3 className="text-xl font-semibold text-blue-300 mb-4 flex items-center justify-center">
                        <span className="mr-2">📡</span> 交易正在处理中
                      </h3>
                      <p className="text-blue-100/90 mb-4">
                        您的出价交易已成功提交到区块链网络，正在等待矿工确认。
                        这个过程通常需要几秒到几分钟的时间，请耐心等待。
                      </p>

                      {/* 交易哈希 */}
                      {txHash && (
                        <div className="bg-slate-800/60 rounded-lg p-3 border border-blue-500/30 mb-4">
                          <p className="text-slate-400 text-sm mb-1">交易哈希:</p>
                          <p className="font-mono text-blue-400 text-sm break-all leading-relaxed">
                            {txHash}
                          </p>
                        </div>
                      )}

                      {/* 进度指示器 */}
                      <div className="flex items-center justify-center space-x-4 mt-6">
                        <div className="flex items-center text-green-300">
                          <div className="w-3 h-3 bg-green-400 rounded-full mr-2"></div>
                          <span className="text-sm">交易已提交</span>
                        </div>
                        <div className="w-8 h-0.5 bg-blue-500"></div>
                        <div className="flex items-center text-blue-300">
                          <div className="w-3 h-3 bg-blue-400 rounded-full mr-2 animate-pulse"></div>
                          <span className="text-sm">等待确认中</span>
                        </div>
                        <div className="w-8 h-0.5 bg-slate-500/50"></div>
                        <div className="flex items-center text-slate-400">
                          <div className="w-3 h-3 bg-slate-500 rounded-full mr-2"></div>
                          <span className="text-sm">完成</span>
                        </div>
                      </div>
                    </div>

                    {/* 提醒信息 */}
                    <div className="bg-gradient-to-r from-amber-900/40 to-yellow-900/40 rounded-xl p-6 mb-8 border border-amber-500/40">
                      <h4 className="text-lg font-semibold text-amber-300 mb-3 flex items-center justify-center">
                        <span className="mr-2">💡</span> 温馨提示
                      </h4>
                      <div className="text-amber-100/90 text-sm space-y-2">
                        <div className="flex items-start justify-center">
                          <span className="text-amber-400 mr-2 mt-1">•</span>
                          <p>请不要关闭此页面，等待交易确认完成</p>
                        </div>
                        <div className="flex items-start justify-center">
                          <span className="text-amber-400 mr-2 mt-1">•</span>
                          <p>确认时间取决于网络拥堵程度，请耐心等待</p>
                        </div>
                        <div className="flex items-start justify-center">
                          <span className="text-amber-400 mr-2 mt-1">•</span>
                          <p>如果长时间未确认，可以在钱包中查看交易状态</p>
                        </div>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="space-y-4">
                      <button
                        onClick={() => router.push(`/auction/${auctionAddress}`)}
                        className="btn btn-lg bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 border-0 text-white"
                      >
                        <span className="mr-2">🔙</span>
                        返回拍卖详情
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : hasParticipated ? (
              <div className="flex items-center justify-center h-full p-8">
                <div className="bg-gradient-to-br from-green-900/80 via-emerald-800/70 to-teal-900/80 backdrop-blur-md rounded-2xl border border-green-500/50 shadow-2xl relative overflow-hidden max-w-4xl w-full">
                  {/* 背景装饰 */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.05)_1px,transparent_1px)] bg-[size:20px_20px]"></div>

                  {/* 顶部装饰条 */}
                  <div className="h-1 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500"></div>

                  <div className="p-8 relative z-10 text-center">
                    {/* 成功图标和标题 */}
                    <div className="mb-8">
                      <div className="text-6xl mb-4 animate-float">🎉</div>
                      <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 mb-4">
                        竞拍提交成功！
                      </h2>
                      <div className="w-32 h-1 bg-gradient-to-r from-green-500 to-emerald-500 mx-auto rounded-full"></div>
                    </div>

                    {/* 成功信息卡片 */}
                    <div className="bg-gradient-to-r from-green-800/40 to-emerald-800/40 rounded-xl p-6 mb-8 border border-green-500/30">
                      <h3 className="text-xl font-semibold text-green-300 mb-4 flex items-center justify-center">
                        <span className="mr-2">🏆</span> 您的出价已成功记录
                      </h3>
                      <p className="text-green-100/90 mb-4">
                        您的出价已经安全地记录在区块链上，现在请耐心等待揭示阶段开始。
                        在揭示阶段，您需要揭示您的真实出价来参与最终的竞拍结果。
                      </p>

                      {/* 状态指示器 */}
                      <div className="flex items-center justify-center space-x-4 mt-6">
                        <div className="flex items-center text-green-300">
                          <div className="w-3 h-3 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                          <span className="text-sm">已提交出价</span>
                        </div>
                        <div className="w-8 h-0.5 bg-green-500/50"></div>
                        <div className="flex items-center text-yellow-300">
                          <div className="w-3 h-3 bg-yellow-400 rounded-full mr-2"></div>
                          <span className="text-sm">等待揭示阶段</span>
                        </div>
                        <div className="w-8 h-0.5 bg-slate-500/50"></div>
                        <div className="flex items-center text-slate-400">
                          <div className="w-3 h-3 bg-slate-500 rounded-full mr-2"></div>
                          <span className="text-sm">查看最终结果</span>
                        </div>
                      </div>
                    </div>

                    {/* 重要提醒 */}
                    <div className="bg-gradient-to-r from-amber-900/40 to-orange-900/40 rounded-xl p-6 mb-8 border border-amber-500/40">
                      <h4 className="text-lg font-semibold text-amber-300 mb-3 flex items-center justify-center">
                        <span className="mr-2">⚠️</span> 重要提醒
                      </h4>
                      <div className="text-amber-100/90 text-sm space-y-2">
                        <div className="flex items-start justify-center">
                          <span className="text-amber-400 mr-2 mt-1">•</span>
                          <p>请务必在揭示阶段开始后及时揭示您的出价</p>
                        </div>
                        <div className="flex items-start justify-center">
                          <span className="text-amber-400 mr-2 mt-1">•</span>
                          <p>未在规定时间内揭示将导致押金被没收</p>
                        </div>
                        <div className="flex items-start justify-center">
                          <span className="text-amber-400 mr-2 mt-1">•</span>
                          <p>请保存好您的密钥，揭示时需要用到</p>
                        </div>
                      </div>
                    </div>

                    {/* 操作按钮组 */}
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button
                          onClick={() => router.push(`/auction/${auctionAddress}`)}
                          className="btn btn-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 border-0 flex-1 sm:flex-none transform hover:scale-105 transition-all duration-300 shadow-lg"
                        >
                          <span className="mr-2">🔍</span>
                          返回拍卖详情
                        </button>
                        <button
                          onClick={() => router.push('/my-bids')}
                          className="btn btn-lg bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 border-0 flex-1 sm:flex-none transform hover:scale-105 transition-all duration-300 shadow-lg"
                        >
                          <span className="mr-2">📋</span>
                          查看我的竞拍记录
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : phase !== null && phase !== 1 ? (
              <div className="flex items-center justify-center h-full p-8">
                <div className="bg-gradient-to-br from-yellow-900/80 via-amber-800/70 to-orange-900/80 backdrop-blur-md rounded-2xl border border-yellow-700/50 shadow-2xl relative overflow-hidden max-w-4xl w-full">
                  {/* 背景装饰 */}
                  <div className="absolute inset-0 bg-gradient-to-r from-yellow-600/10 to-orange-600/10 animate-pulse"></div>
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-yellow-500/20 rounded-full blur-xl"></div>
                  <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-orange-500/20 rounded-full blur-xl"></div>

                  <div className="relative z-10 text-center p-8">
                    <div className="text-6xl mb-6 opacity-80 animate-float">⏱️</div>
                    <h3 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400 mb-4">
                      当前无法出价
                    </h3>
                    <p className="mt-4 text-slate-300 text-lg mb-8 max-w-lg mx-auto">
                      {phase === 0 ? "拍卖尚未开始，请耐心等待竞拍阶段开始。" : "竞拍阶段已结束，正在等待揭示阶段开始。"}
                    </p>

                    {/* 时间显示 */}
                    <div className="bg-slate-800/50 rounded-xl p-6 mb-8 border border-yellow-600/30">
                      <div className="grid grid-cols-1 gap-4">
                        <div className="text-center">
                          <p className="text-slate-400 text-sm mb-2">
                            {phase === 0 ? "距离竞拍开始" : "距离下一阶段"}
                          </p>
                          <p className="text-5xl font-mono text-cyan-400 font-bold glow-text">
                            {timeLeft}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <button
                        onClick={() => router.push(`/auction/${auctionAddress}`)}
                        className="btn btn-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 shadow-lg transform hover:scale-105 transition-all duration-300"
                      >
                        返回拍卖详情
                      </button>
                      <button
                        onClick={() => router.push('/my-bids')}
                        className="btn btn-lg bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white border-0 shadow-lg transform hover:scale-105 transition-all duration-300"
                      >
                        我的竞拍记录
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/60 backdrop-blur-lg p-8 h-full overflow-y-auto">
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 mb-2">
                    提交出价
                  </h2>
                  <div className="w-24 h-1 bg-gradient-to-r from-blue-500 to-purple-500 mx-auto rounded-full"></div>
                </div>

                <div className="space-y-6 max-w-2xl mx-auto">
                  {/* 出价金额 */}
                  <div className="space-y-3">
                    <label className="flex items-center text-lg font-semibold text-white">
                      <span className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>
                      出价金额
                    </label>
                    <div className="relative group">
                      <input
                        type="text"
                        placeholder={`最低出价: ${minPrice} ETH`}
                        className="w-full h-14 bg-slate-800/60 border-2 border-slate-600/50 rounded-xl px-4 pr-16 text-white placeholder-slate-400 focus:border-blue-500/70 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-300 group-hover:border-slate-500/70"
                        value={value}
                        onChange={e => setValue(e.target.value)}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">ETH</span>
                    </div>
                    <p className="text-xs text-slate-400 flex items-center">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                      最低出价: {minPrice} ETH
                    </p>
                  </div>

                  {/* 虚假出价选项 */}
                  <div className="bg-gradient-to-r from-slate-800/40 to-slate-700/40 rounded-xl p-4 border border-slate-600/30">
                    <label className="flex items-start space-x-4 cursor-pointer group">
                      <div className="relative">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={fake}
                          onChange={e => setFake(e.target.checked)}
                        />
                        <div className={`w-6 h-6 rounded-lg border-2 transition-all duration-300 flex items-center justify-center ${fake
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 border-purple-400'
                          : 'border-slate-500 group-hover:border-slate-400'
                          }`}>
                          {fake && (
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <div className="flex-1">
                        <span className="text-lg font-semibold text-white block">这是一个虚假出价</span>
                        <p className="text-sm text-slate-400 mt-1">
                          虚假出价用于迷惑对手，押金需大于等于最低价 {minPrice} ETH
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* 密钥输入 */}
                  <div className="space-y-3">
                    <label className="flex items-center text-lg font-semibold text-white">
                      <span className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>
                      安全密钥
                    </label>
                    <div className="flex space-x-3">
                      <div className="flex-1 relative group">
                        <input
                          type="text"
                          placeholder="输入或生成安全密钥"
                          className="w-full h-14 bg-slate-800/60 border-2 border-slate-600/50 rounded-xl px-4 text-white placeholder-slate-400 focus:border-purple-500/70 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all duration-300 group-hover:border-slate-500/70"
                          value={secret}
                          onChange={e => setSecret(e.target.value)}
                        />
                      </div>
                      <button
                        className="h-14 px-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-purple-500/25"
                        onClick={generateRandomSecret}
                      >
                        随机生成
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 flex items-center">
                      <span className="w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
                      请务必保存好密钥，揭示阶段需要使用
                    </p>
                  </div>

                  {/* 生成哈希按钮 */}
                  <div className="relative">
                    <button
                      className="w-full h-16 bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 hover:from-blue-700 hover:via-purple-700 hover:to-cyan-700 text-white text-lg font-bold rounded-xl transition-all duration-300 transform hover:scale-[1.02] shadow-xl hover:shadow-2xl relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                      onClick={generateBlindedBid}
                      disabled={isCalculating || !value || !secret}
                    >
                      <div className="relative z-10 flex items-center justify-center">
                        {isCalculating ? (
                          <>
                            <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin mr-3"></div>
                            计算中...
                          </>
                        ) : (
                          <>
                            <span className="mr-3 text-xl">🔐</span>
                            生成盲拍哈希
                          </>
                        )}
                      </div>
                    </button>
                  </div>

                  {/* 生成的哈希显示 */}
                  {blindedBid && (
                    <div className="relative">
                      <div className="bg-gradient-to-r from-green-900/40 to-emerald-900/40 rounded-xl p-4 border-2 border-green-500/40 shadow-lg animate-fadeIn">
                        <div className="flex items-center mb-2">
                          <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                          <span className="text-green-300 font-semibold">生成的哈希:</span>
                        </div>
                        <div className="bg-slate-800/60 rounded-lg p-3 border border-green-500/30">
                          <p className="font-mono text-green-400 text-sm break-all leading-relaxed">
                            {blindedBid}
                          </p>
                        </div>
                        <div className="flex items-center mt-2 text-xs text-green-200/80">
                          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          哈希生成成功，可以继续设置押金
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 押金设置 */}
                  <div className="space-y-3">
                    <label className="flex items-center text-lg font-semibold text-white">
                      <span className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full flex items-center justify-center text-sm font-bold mr-3">3</span>
                      押金金额
                    </label>
                    <div className="relative group">
                      <input
                        type="text"
                        placeholder={fake ? `最低: ${minPrice} ETH` : "必须 >= 出价金额"}
                        className="w-full h-14 bg-slate-800/60 border-2 border-slate-600/50 rounded-xl px-4 pr-16 text-white placeholder-slate-400 focus:border-cyan-500/70 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 group-hover:border-slate-500/70"
                        value={deposit}
                        onChange={e => setDeposit(e.target.value)}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">ETH</span>
                    </div>
                    <p className="text-xs text-slate-400 flex items-center">
                      <span className="w-2 h-2 bg-cyan-400 rounded-full mr-2"></span>
                      {fake ? `虚假出价押金需≥最低价 ${minPrice} ETH` : "真实出价押金需≥出价金额"}
                    </p>
                  </div>

                  {/* 提交按钮 */}
                  <div className="pt-6 border-t border-slate-700/50">
                    <button
                      className="w-full h-16 bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 hover:from-blue-700 hover:via-purple-700 hover:to-cyan-700 text-white text-xl font-bold rounded-xl transition-all duration-300 transform hover:scale-[1.02] shadow-xl hover:shadow-2xl relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                      onClick={handleBid}
                      disabled={isSubmitting || !blindedBid || !deposit}
                    >
                      <div className="relative z-10 flex items-center justify-center">
                        {isSubmitting ? (
                          <>
                            <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin mr-3"></div>
                            提交中...
                          </>
                        ) : (
                          <>
                            <span className="mr-3 text-2xl">🚀</span>
                            提交出价
                          </>
                        )}
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 右侧边栏 */}
          <div className="w-80 bg-slate-900/60 backdrop-blur-lg border-l border-slate-700/50 flex flex-col">
            {/* 竞拍进度 */}
            <div className="p-6 border-b border-slate-700/50">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <span className="mr-2">📋</span> 竞拍进度
              </h3>
              <div className="space-y-3">
                <div className={`flex items-center p-3 rounded-lg transition-all duration-300 ${(value || hasParticipated) ? 'bg-green-500/20 border border-green-500/40' : 'bg-slate-800/40 border border-slate-600/30'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3 transition-colors ${(value || hasParticipated) ? 'bg-green-500 text-white' : 'bg-slate-600 text-slate-300'}`}>
                    {(value || hasParticipated) ? '✓' : '1'}
                  </div>
                  <span className={`font-medium text-sm ${(value || hasParticipated) ? 'text-green-300' : 'text-slate-300'}`}>
                    设置出价金额
                  </span>
                </div>

                <div className={`flex items-center p-3 rounded-lg transition-all duration-300 ${(secret || hasParticipated) ? 'bg-green-500/20 border border-green-500/40' : 'bg-slate-800/40 border border-slate-600/30'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3 transition-colors ${(secret || hasParticipated) ? 'bg-green-500 text-white' : 'bg-slate-600 text-slate-300'}`}>
                    {(secret || hasParticipated) ? '✓' : '2'}
                  </div>
                  <span className={`font-medium text-sm ${(secret || hasParticipated) ? 'text-green-300' : 'text-slate-300'}`}>
                    生成安全密钥
                  </span>
                </div>

                <div className={`flex items-center p-3 rounded-lg transition-all duration-300 ${(blindedBid || hasParticipated) ? 'bg-green-500/20 border border-green-500/40' : 'bg-slate-800/40 border border-slate-600/30'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3 transition-colors ${(blindedBid || hasParticipated) ? 'bg-green-500 text-white' : 'bg-slate-600 text-slate-300'}`}>
                    {(blindedBid || hasParticipated) ? '✓' : '3'}
                  </div>
                  <span className={`font-medium text-sm ${(blindedBid || hasParticipated) ? 'text-green-300' : 'text-slate-300'}`}>
                    生成盲拍哈希
                  </span>
                </div>

                <div className={`flex items-center p-3 rounded-lg transition-all duration-300 ${(deposit || hasParticipated) ? 'bg-green-500/20 border border-green-500/40' : 'bg-slate-800/40 border border-slate-600/30'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3 transition-colors ${(deposit || hasParticipated) ? 'bg-green-500 text-white' : 'bg-slate-600 text-slate-300'}`}>
                    {(deposit || hasParticipated) ? '✓' : '4'}
                  </div>
                  <span className={`font-medium text-sm ${(deposit || hasParticipated) ? 'text-green-300' : 'text-slate-300'}`}>
                    设置押金金额
                  </span>
                </div>
              </div>
            </div>

            {/* 快速操作 */}
            <div className="p-6 border-b border-slate-700/50">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <span className="mr-2">⚡</span> 快速操作
              </h3>
              {hasParticipated ? (
                <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-4 text-center">
                  <div className="text-green-400 text-2xl mb-2">✅</div>
                  <p className="text-green-300 font-semibold text-sm mb-1">竞拍已完成</p>
                  <p className="text-green-200/80 text-xs">您已成功参与此次竞拍</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => setValue(minPrice)}
                    className="w-full p-3 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-600/30 hover:border-indigo-500/50 rounded-lg text-slate-300 hover:text-white transition-all duration-300 text-sm"
                  >
                    使用最低出价 ({minPrice} ETH)
                  </button>

                  <button
                    onClick={() => setDeposit(value || minPrice)}
                    disabled={!value}
                    className="w-full p-3 bg-slate-800/40 hover:bg-slate-700/60 border border-slate-600/30 hover:border-purple-500/50 rounded-lg text-slate-300 hover:text-white transition-all duration-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    押金等于出价金额
                  </button>
                </div>
              )}
            </div>

            {/* 竞拍小贴士 */}
            <div className="p-6 flex-1">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <span className="mr-2">💡</span> 竞拍小贴士
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-start">
                  <span className="text-green-400 mr-2 mt-1">•</span>
                  <p className="text-slate-300">使用虚假出价可以迷惑对手，增加获胜概率</p>
                </div>
                <div className="flex items-start">
                  <span className="text-green-400 mr-2 mt-1">•</span>
                  <p className="text-slate-300">押金设置合理，既要保证有效又要控制风险</p>
                </div>
                <div className="flex items-start">
                  <span className="text-green-400 mr-2 mt-1">•</span>
                  <p className="text-slate-300">密钥请务必备份，丢失将无法揭示出价</p>
                </div>
                <div className="flex items-start">
                  <span className="text-blue-400 mr-2 mt-1">•</span>
                  <p className="text-slate-300">盲拍机制确保出价隐私，他人无法获知您的真实出价</p>
                </div>
                <div className="flex items-start">
                  <span className="text-purple-400 mr-2 mt-1">•</span>
                  <p className="text-slate-300">在揭示阶段必须及时揭示出价，否则押金被没收</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 添加一些自定义CSS */}
      <style jsx global>{`
        .glow-text {
          text-shadow: 0 0 10px rgba(66, 153, 225, 0.5), 0 0 20px rgba(66, 153, 225, 0.3);
        }
        
        @keyframes pulse-border {
          0%, 100% { border-color: rgba(102, 0, 255, 0.3); }
          50% { border-color: rgba(102, 0, 255, 0.6); }
        }
        
        .neon-text {
          text-shadow: 0 0 5px rgba(102, 0, 255, 0.8), 0 0 20px rgba(102, 0, 255, 0.5);
        }

        @keyframes fadeIn {
          from { 
            opacity: 0; 
            transform: translateY(10px) scale(0.95); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0) scale(1); 
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }

        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        .animate-gradient {
          background: linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab);
          background-size: 400% 400%;
          animation: gradientShift 4s ease infinite;
        }

        .group:hover .group-hover\\:scale-110 {
          transform: scale(1.1);
        }

        .group:hover .group-hover\\:rotate-3 {
          transform: rotate(3deg);
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }

        .border-gradient {
          border: 2px solid transparent;
          background: linear-gradient(45deg, rgba(59, 130, 246, 0.3), rgba(147, 51, 234, 0.3)) border-box;
          mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
        }
      `}</style>
    </>
  );
}

export default function BidPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    }>
      <BidContent />
    </Suspense>
  );
} 