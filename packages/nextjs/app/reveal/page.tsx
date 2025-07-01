'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth/useScaffoldReadContract";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth/useScaffoldWriteContract";
import { notification } from "~~/utils/scaffold-eth";
import { useDeployedContractInfo } from '~~/hooks/scaffold-eth';
import { useTargetNetwork } from '~~/hooks/scaffold-eth';
import MeteorRain from "../../components/MeteorRain";
import StarryBackground from "../../components/StarryBackground";
import { MetaHeader } from '~~/components/MetaHeader';
import { ethers } from 'ethers';

interface BidInfo {
  value: string;
  fake: boolean;
  secret: string;
  blindedBid: string;
  deposit: string;
  timestamp: number;
  revealed?: boolean;
  contractIndex?: number;
  auctionAddress?: string;
}

function RevealContent() {
  const searchParams = useSearchParams();
  const { address: connectedAddress } = useAccount();
  const [bids, setBids] = useState<BidInfo[]>([]);
  const [selectedBids, setSelectedBids] = useState<number[]>([]);
  const [phase, setPhase] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isClient, setIsClient] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [auctionName, setAuctionName] = useState("未知拍卖");
  const [revealStartTime, setRevealStartTime] = useState<number>(0);
  const [revealEndTime, setRevealEndTime] = useState<number>(0);
  const [revealSuccess, setRevealSuccess] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  const [hasRevealed, setHasRevealed] = useState(false);

  const auctionAddress = searchParams.get('address') as `0x${string}` | null;

  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const { data: blindAuctionData } = useDeployedContractInfo("BlindAuction");
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { data: nftContractData } = useDeployedContractInfo("AuctionNFT");
  const { data: walletClient } = useWalletClient();

  useEffect(() => {
    const fetchAuctionInfo = async () => {
      if (!publicClient || !blindAuctionData || !auctionAddress || !factoryContractData || !nftContractData) return;

      try {
        const [biddingEndResult, revealEndResult, endedResult] = await Promise.all([
          publicClient.readContract({ address: auctionAddress, abi: blindAuctionData.abi, functionName: 'biddingEnd' }),
          publicClient.readContract({ address: auctionAddress, abi: blindAuctionData.abi, functionName: 'revealEnd' }),
          publicClient.readContract({ address: auctionAddress, abi: blindAuctionData.abi, functionName: 'ended' }),
        ]);

        const now = BigInt(Math.floor(Date.now() / 1000));
        const biddingEndTime = BigInt(biddingEndResult.toString());
        const revealEndTimeValue = BigInt(revealEndResult.toString());
        const ended = Boolean(endedResult);

        // 保存揭示阶段的开始和结束时间
        setRevealStartTime(Number(biddingEndTime));
        setRevealEndTime(Number(revealEndTimeValue));

        let currentPhase;
        if (ended || now >= revealEndTimeValue) currentPhase = 2; // ended
        else if (now >= biddingEndTime) currentPhase = 1; // revealing
        else currentPhase = 0; // bidding
        setPhase(currentPhase);

        // 🔧 修复：完善拍卖元数据获取逻辑，与首页和竞拍记录页面保持一致
        let auctionNameFound = "未命名拍卖";

        try {
          // 首先尝试检查是否为NFT拍卖
          const isNFTAuction = await publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'isNFTAuction',
          }) as boolean;

          console.log(`揭示页面拍卖 ${auctionAddress} 是否为NFT拍卖:`, isNFTAuction);

          if (isNFTAuction && nftContractData) {
            // 获取NFT Token ID和合约地址
            const [nftTokenId, nftContractAddress] = await Promise.all([
              publicClient.readContract({
                address: auctionAddress,
                abi: blindAuctionData.abi,
                functionName: 'nftTokenId',
              }) as Promise<bigint>,
              publicClient.readContract({
                address: auctionAddress,
                abi: blindAuctionData.abi,
                functionName: 'nftContract',
              }) as Promise<`0x${string}`>
            ]);

            console.log(`揭示页面NFT拍卖 - Token ID: ${nftTokenId}, 合约地址: ${nftContractAddress}`);

            if (nftContractAddress && nftTokenId > 0n) {
              try {
                // 从NFT合约获取元数据
                const nftMetadata = await publicClient.readContract({
                  address: nftContractAddress,
                  abi: nftContractData.abi,
                  functionName: 'nftMetadata',
                  args: [nftTokenId],
                }) as readonly [string, string, string, bigint, `0x${string}`, boolean, `0x${string}`, bigint];

                const [name] = nftMetadata;
                auctionNameFound = name || `NFT #${Number(nftTokenId)}`;
                console.log("从NFT合约获取到揭示页面拍卖名称:", auctionNameFound);
              } catch (nftError) {
                console.error("从NFT合约获取揭示页面拍卖元数据失败:", nftError);
              }
            }
          }

          // 如果从NFT合约获取失败或不是NFT拍卖，尝试从事件日志获取
          if (auctionNameFound === "未命名拍卖") {
            console.log("尝试从事件日志获取揭示页面拍卖的元数据...");
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
                  const metadata = JSON.parse(metadataStr);
                  auctionNameFound = metadata.name || "未命名拍卖";
                  console.log("从事件日志获取到揭示页面拍卖名称:", auctionNameFound);
                } catch (e) {
                  console.error("解析揭示页面拍卖元数据字符串失败:", e);
                }
              }
            }
          }

          setAuctionName(auctionNameFound);
        } catch (e) {
          console.error("获取揭示页面拍卖元数据失败:", e);
          setAuctionName("未命名拍卖");
        }

      } catch (error) {
        console.error("获取揭示页面拍卖状态失败:", error);
      }
    };

    if (auctionAddress) {
      fetchAuctionInfo();
      const interval = setInterval(fetchAuctionInfo, 10000);
      return () => clearInterval(interval);
    } else {
      setPhase(1);
      setTimeLeft("未知");
    }
  }, [publicClient, blindAuctionData, factoryContractData, nftContractData, auctionAddress]);

  useEffect(() => {
    if (phase !== 1 || !auctionAddress) return;

    const interval = setInterval(async () => {
      try {
        const now = BigInt(Math.floor(Date.now() / 1000));
        const remaining = Number(BigInt(revealEndTime) - now);

        if (remaining <= 0) {
          setTimeLeft("00:00:00");
          // 如果揭示阶段已结束，自动更新阶段
          if (now >= BigInt(revealEndTime)) {
            setPhase(2);
            setRevealSuccess(true);
            setRevealedCount(selectedBids.length);

            // 提示用户可以查看结果
            setTimeout(() => {
              notification.info("您可以前往结果页面查看最新的拍卖状态");
            }, 2000);
          }
        } else {
          const hours = Math.floor(remaining / 3600);
          const minutes = Math.floor((remaining % 3600) / 60);
          const seconds = remaining % 60;
          setTimeLeft(
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
          );
        }
      } catch (error) {
        // 忽略更新倒计时错误
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, auctionAddress, revealEndTime]);


  useEffect(() => {
    setIsClient(true);
    if (connectedAddress && auctionAddress) {
      try {
        const normalizedAddress = connectedAddress.toLowerCase();
        const storedBids = localStorage.getItem(`bids_${normalizedAddress}`);
        if (storedBids) {
          const parsedBids = JSON.parse(storedBids);

          // 严格过滤：只显示当前拍卖地址的出价记录
          const filteredBids = parsedBids.filter((bid: BidInfo) =>
            bid.auctionAddress &&
            bid.auctionAddress.toLowerCase() === auctionAddress.toLowerCase()
          );

          // 如果用户没有参与当前拍卖，设置空数组
          if (filteredBids.length === 0) {
            setBids([]);
            return;
          }

          const revealedKey = `revealed_bids_${normalizedAddress}_${auctionAddress}`;
          const revealedBids = localStorage.getItem(revealedKey);
          const revealedIndices = revealedBids ? JSON.parse(revealedBids) : [];

          const updatedBids = filteredBids.map((bid: BidInfo, index: number) => ({
            ...bid,
            revealed: revealedIndices.includes(index),
          }));

          setBids(updatedBids);

          // 检查是否已经揭示过出价（用于首次加载时判断是否显示成功界面）
          const hasRevealedAny = updatedBids.some((bid: BidInfo) => bid.revealed);
          setHasRevealed(hasRevealedAny);

          // 如果所有出价都已揭示，直接显示成功界面
          if (updatedBids.length > 0 && updatedBids.every((bid: BidInfo) => bid.revealed)) {
            setRevealSuccess(true);
            setRevealedCount(updatedBids.filter((bid: BidInfo) => bid.revealed).length);
          }
        } else {
          setBids([]);
        }
      } catch (error) {
        // 加载出价记录失败，设置空数组
        setBids([]);
      }
    } else {
      setBids([]);
    }
  }, [connectedAddress, auctionAddress]);

  const handleReveal = async () => {
    if (!connectedAddress || !walletClient) {
      notification.error("请先连接钱包");
      return;
    }
    if (!auctionAddress) {
      notification.error("未指定拍卖地址");
      return;
    }
    if (selectedBids.length === 0) {
      notification.error("请至少选择一个出价进行揭示");
      return;
    }
    if (bids.length === 0) {
      notification.error("您没有参与此拍卖，无法进行揭示操作");
      return;
    }

    // 验证选中的出价是否属于当前拍卖
    const bidsToReveal = selectedBids.map(index => bids[index]);
    const invalidBids = bidsToReveal.filter(bid =>
      !bid.auctionAddress ||
      bid.auctionAddress.toLowerCase() !== auctionAddress.toLowerCase()
    );

    if (invalidBids.length > 0) {
      notification.error("选中的出价不属于当前拍卖，请重新选择");
      return;
    }

    setIsRevealing(true);
    notification.info("正在准备揭示您的出价...");

    try {
      // 验证并准备参数
      const values = bidsToReveal.map(bid => {
        try {
          // 使用viem库，与出价时保持一致
          const { parseEther } = require('viem');
          return parseEther(bid.value);
        } catch (error) {
          throw new Error(`出价金额格式错误: ${bid.value}`);
        }
      });

      const fakes = bidsToReveal.map(bid => bid.fake);

      const secrets = bidsToReveal.map(bid => {
        const secret = bid.secret as string;

        // 将原始密钥字符串转换为bytes32格式
        try {
          const { keccak256, toBytes } = require('viem');
          const secretBytes32 = keccak256(toBytes(secret));
          return secretBytes32 as `0x${string}`;
        } catch (error) {
          throw new Error(`密钥处理错误: ${secret}`);
        }
      }) as `0x${string}`[];

      // 发送交易并等待确认
      notification.info("正在发送揭示交易...");
      const txHash = await walletClient.writeContract({
        address: auctionAddress,
        abi: blindAuctionData!.abi,
        functionName: 'reveal',
        args: [values, fakes, secrets],
      });

      notification.info(`交易已发送，哈希: ${txHash.slice(0, 10)}...`);

      // 等待交易确认
      if (publicClient) {
        notification.info("等待交易确认中...");
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 60000 // 60秒超时
        });

        if (receipt.status === 'success') {
          notification.success("揭示交易已成功确认！");

          // 只有在交易成功确认后才更新本地状态
          const normalizedAddress = connectedAddress.toLowerCase();
          const revealedKey = `revealed_bids_${normalizedAddress}_${auctionAddress}`;
          const revealedBids = localStorage.getItem(revealedKey);
          const revealedIndices = revealedBids ? JSON.parse(revealedBids) : [];
          const updatedRevealedIndices = [...revealedIndices, ...selectedBids];
          localStorage.setItem(revealedKey, JSON.stringify(updatedRevealedIndices));

          setBids(prevBids =>
            prevBids.map((bid, index) =>
              selectedBids.includes(index) ? { ...bid, revealed: true } : bid
            )
          );
          setSelectedBids([]);

          // 提示用户可以查看结果
          setTimeout(() => {
            notification.info("您可以前往结果页面查看最新的拍卖状态");
          }, 2000);

          // 设置揭示成功状态
          setRevealSuccess(true);
          setRevealedCount(selectedBids.length);

        } else {
          notification.error("交易失败，请重试");
        }
      } else {
        // 如果没有 publicClient，只能发送交易但无法确认
        notification.warning("无法确认交易状态，请稍后检查结果页面");
      }

    } catch (error: any) {
      // 提供更详细的错误信息
      let errorMessage = "揭示失败";
      if (error.message) {
        if (error.message.includes("User rejected")) {
          errorMessage = "用户取消了交易";
        } else if (error.message.includes("insufficient funds")) {
          errorMessage = "余额不足，无法支付Gas费用";
        } else if (error.shortMessage) {
          errorMessage = `揭示失败: ${error.shortMessage}`;
        } else {
          errorMessage = `揭示失败: ${error.message}`;
        }
      }

      notification.error(errorMessage);
    } finally {
      setIsRevealing(false);
    }
  };

  const toggleBidSelection = (index: number) => {
    if (bids[index].revealed) return;
    setSelectedBids(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const timestampToDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('zh-CN');
  };

  const calculateRevealProgress = () => {
    if (phase !== 1 || !revealStartTime || !revealEndTime) return '0%';

    try {
      // 获取当前时间
      const now = Math.floor(Date.now() / 1000);

      // 计算揭示阶段总时长
      const totalRevealDuration = revealEndTime - revealStartTime;

      // 如果总时长为0或负数，返回0%
      if (totalRevealDuration <= 0) return '0%';

      // 计算已经过去的时间
      const elapsedTime = now - revealStartTime;

      // 计算进度百分比
      const progressPercentage = (elapsedTime / totalRevealDuration) * 100;

      // 确保百分比在0-100之间
      return `${Math.min(Math.max(progressPercentage, 0), 100)}%`;
    } catch (error) {
      // 计算进度条出错，返回0%
      return '0%';
    }
  };

  if (!isClient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden text-white">
      <MetaHeader title="揭示出价 | 区块链盲拍平台" />

      {/* 星空背景 */}
      <StarryBackground
        meteorCount={20}
        starCount={25}
        asteroidCount={15}
        theme="blue-purple"
        showGradients={true}
      />

      <div className="relative z-10 container mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 neon-text-yellow inline-block">
            揭示您的出价
          </h1>
          <p className="mt-4 text-slate-300 max-w-2xl mx-auto">
            对于拍卖: <span className="font-semibold text-orange-300">{auctionName}</span>
          </p>

          {/* 添加进度条和倒计时显示 */}
          {phase === 1 && (
            <div className="mt-6 max-w-md mx-auto">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>揭示阶段</span>
                <span>剩余时间: {timeLeft}</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 transition-all duration-1000"
                  style={{ width: calculateRevealProgress() }}
                ></div>
              </div>
            </div>
          )}
          {phase === 0 && (
            <div className="mt-4 px-4 py-2 bg-blue-500/20 rounded-full text-blue-300 inline-block">
              竞拍阶段尚未结束
            </div>
          )}
          {phase === 2 && (
            <div className="mt-4 px-4 py-2 bg-green-500/20 rounded-full text-green-300 inline-block">
              揭示阶段已结束
            </div>
          )}
        </div>

        {!connectedAddress ? (
          <div className="text-center p-8 bg-slate-900/50 rounded-xl">请先连接钱包</div>
        ) : phase === 0 ? (
          <div className="text-center p-8 bg-slate-900/50 rounded-xl">拍卖尚未进入揭示阶段。</div>
        ) : phase === 2 ? (
          <div className="text-center p-8 bg-slate-900/50 rounded-xl">揭示阶段已结束。</div>
        ) : bids.length === 0 ? (
          // 用户没有参与当前拍卖的提示
          <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-10 text-center border border-slate-700/60 shadow-lg">
            <div className="text-6xl mb-6 opacity-80">🚫</div>
            <h3 className="text-2xl font-semibold mb-4 text-white">您未参与此拍卖</h3>
            <p className="text-slate-300 mb-6">
              您没有在这个拍卖中提交任何出价，因此无法进行揭示操作。
              <br />
              如果您想参与其他拍卖的揭示，请前往相应的拍卖页面。
            </p>
            <div className="flex justify-center gap-4">
              <Link
                href={`/auction/${auctionAddress}`}
                className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 hover:from-blue-500 hover:via-blue-400 hover:to-purple-500 text-white font-bold rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-2xl shadow-blue-500/40 hover:shadow-blue-500/60 overflow-hidden border border-blue-400/30"
              >
                <div className="relative z-10 flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-300 group-hover:-translate-x-1 group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span className="text-lg">返回拍卖详情</span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-600/30 to-purple-600/30 blur-xl -z-10"></div>
              </Link>
              <Link
                href="/all-auctions"
                className="btn btn-lg bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white border-0"
              >
                浏览所有拍卖
              </Link>
              <Link
                href="/my-bids"
                className="btn btn-lg bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white border-0"
              >
                我的竞拍记录
              </Link>
            </div>
          </div>
        ) : revealSuccess ? (
          // 揭示成功的简洁界面
          <div className="text-center">
            <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 border border-green-500/50">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-3xl font-bold text-green-400 mb-4">揭示成功！</h2>
              <p className="text-slate-300 mb-6">
                您已成功揭示了 {revealedCount} 个出价，交易已确认到区块链上。
              </p>

              <div className="flex justify-center gap-4">
                {/* <Link
                      href={`/results?address=${auctionAddress}`}
                  className="btn btn-primary"
                    >
                      查看拍卖结果
                    </Link> */}
                <Link
                  href={`/auction/${auctionAddress}`}
                  className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 hover:from-blue-500 hover:via-purple-500 hover:to-blue-500 text-white font-bold rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 overflow-hidden border border-blue-400/30"
                >
                  <div className="relative z-10 flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-300 group-hover:-translate-x-1 group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span className="text-lg">返回拍卖详情</span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-600/30 to-purple-600/30 blur-xl -z-10"></div>
                </Link>

                <Link
                  href="/my-bids"
                  className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-green-600 via-emerald-500 to-teal-600 hover:from-green-500 hover:via-emerald-400 hover:to-teal-500 text-white font-bold rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-xl shadow-green-500/30 hover:shadow-green-500/50 overflow-hidden border border-green-400/30"
                >
                  <div className="relative z-10 flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-lg">查看竞拍记录</span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-green-600/30 to-teal-600/30 blur-xl -z-10"></div>
                </Link>

                {bids.some(bid => !bid.revealed) && (
                  <button
                    onClick={() => setRevealSuccess(false)}
                    className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-amber-600 via-orange-500 to-red-600 hover:from-amber-500 hover:via-orange-400 hover:to-red-500 text-white font-bold rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-xl shadow-amber-500/30 hover:shadow-amber-500/50 overflow-hidden border border-amber-400/30"
                  >
                    <div className="relative z-10 flex items-center gap-3">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <span className="text-lg">继续揭示其他出价</span>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-amber-600/30 to-red-600/30 blur-xl -z-10"></div>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <div className="bg-slate-900/50 backdrop-blur-md rounded-2xl p-6 border border-slate-700/50">
                  <h2 className="text-2xl font-semibold mb-4 text-orange-300">选择要揭示的出价</h2>
                  <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                    {bids.length > 0 ? (
                      bids.map((bid, index) => (
                        <div
                          key={index}
                          onClick={() => toggleBidSelection(index)}
                          className={`p-4 rounded-lg border-2 transition-all duration-300 cursor-pointer ${selectedBids.includes(index) ? 'border-orange-500 bg-orange-500/10' : 'border-slate-700 hover:border-orange-500/50'
                            } ${bid.revealed ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-bold text-lg">
                                {bid.value} ETH {bid.fake && <span className="text-sm text-slate-400">(虚假出价)</span>}
                              </p>
                              <p className="text-xs text-slate-400">时间: {timestampToDate(bid.timestamp)}</p>
                            </div>
                            {bid.revealed ? (
                              <span className="px-3 py-1 text-xs font-semibold text-green-300 bg-green-500/10 rounded-full">已揭示</span>
                            ) : (
                              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedBids.includes(index) ? 'border-orange-500 bg-orange-500' : 'border-slate-500'}`}>
                                {selectedBids.includes(index) && <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p>没有找到您的出价记录。</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-1">
                <div className="bg-slate-900/50 backdrop-blur-md rounded-2xl p-6 border border-slate-700/50 sticky top-24">
                  <div className="text-center mb-6">
                    <p className="text-slate-400 text-sm">揭示剩余时间</p>
                    <p className="text-4xl font-mono tracking-widest mt-1">{timeLeft}</p>
                  </div>
                  <div className="mt-6 flex gap-4">
                    <button
                      onClick={handleReveal}
                      disabled={selectedBids.length === 0 || isRevealing}
                      className="flex-1 bg-purple-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isRevealing ? "揭示中..." : `揭示选中的 ${selectedBids.length} 个出价`}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-4 text-center">揭示后，您的出价和金额将被公开验证。</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RevealPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    }>
      <RevealContent />
    </Suspense>
  );
} 