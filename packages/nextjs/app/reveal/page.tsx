'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { ethers } from 'ethers';
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth/useScaffoldReadContract";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth/useScaffoldWriteContract";
import { notification } from "~~/utils/scaffold-eth";
import { useDeployedContractInfo } from '~~/hooks/scaffold-eth';
import { useTargetNetwork } from '~~/hooks/scaffold-eth';

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
  biddingEnd?: number;  // 竞拍结束时间
  revealEnd?: number;   // 揭示结束时间
}

export default function RevealPage() {
  const searchParams = useSearchParams();
  const { address: connectedAddress } = useAccount();
  const [bids, setBids] = useState<BidInfo[]>([]);
  const [selectedBids, setSelectedBids] = useState<number[]>([]);
  const [phase, setPhase] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isClient, setIsClient] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);

  // 从URL参数获取预选的出价
  const preselectedIndex = searchParams.get('index');

  // 从URL参数获取拍卖地址
  const auctionAddress = searchParams.get('address') as `0x${string}` | null;

  // 获取网络和合约信息
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const { data: blindAuctionData } = useDeployedContractInfo("BlindAuction");
  const { data: walletClient } = useWalletClient();

  // 获取合约状态
  useEffect(() => {
    const fetchAuctionStatus = async () => {
      if (!publicClient || !blindAuctionData || !auctionAddress) return;

      try {
        // 获取竞拍阶段和时间信息
        const [biddingEndResult, revealEndResult, endedResult] = await Promise.all([
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'biddingEnd',
          }),
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'revealEnd',
          }),
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'ended',
          }),
        ]);

        // 获取区块链当前时间 (以太坊的区块时间)
        const blockNumber = await publicClient.getBlockNumber();
        const block = await publicClient.getBlock({ blockNumber });
        const blockchainTimestamp = block.timestamp;

        // 设置阶段
        const biddingEndTime = BigInt(biddingEndResult.toString());
        const revealEndTime = BigInt(revealEndResult.toString());
        const ended = Boolean(endedResult);

        console.log("区块链时间:", new Date(Number(blockchainTimestamp) * 1000).toLocaleString());
        console.log("竞拍结束时间:", new Date(Number(biddingEndTime) * 1000).toLocaleString());
        console.log("揭示结束时间:", new Date(Number(revealEndTime) * 1000).toLocaleString());

        // 根据区块链时间判断当前阶段
        let currentPhase;
        if (ended || blockchainTimestamp > revealEndTime) {
          currentPhase = 2; // 已结束
        } else if (blockchainTimestamp > biddingEndTime) {
          currentPhase = 1; // 揭示阶段
        } else {
          currentPhase = 0; // 竞拍阶段
        }

        setPhase(currentPhase);

        // 计算揭示阶段剩余时间
        if (currentPhase === 1) {
          const remaining = Number(revealEndTime - blockchainTimestamp);
          if (remaining <= 0) {
            setTimeLeft("揭示已结束");
          } else {
            const hours = Math.floor(remaining / 3600);
            const minutes = Math.floor((remaining % 3600) / 60);
            const seconds = remaining % 60;
            setTimeLeft(`${hours}小时 ${minutes}分钟 ${seconds}秒`);
          }
        } else if (currentPhase === 0) {
          setTimeLeft("竞拍阶段尚未结束");
        } else {
          setTimeLeft("揭示已结束");
        }
      } catch (error) {
        console.error("获取拍卖状态失败:", error);
      }
    };

    if (auctionAddress) {
      fetchAuctionStatus();
      const interval = setInterval(fetchAuctionStatus, 10000); // 每10秒更新一次
      return () => clearInterval(interval);
    } else {
      // 如果没有指定拍卖地址，则设置为通用状态
      setPhase(1); // 假设处于揭示阶段
      setTimeLeft("未知");
    }
  }, [publicClient, blindAuctionData, auctionAddress]);

  // 获取用户的竞拍数量函数
  const { data: bidCount, refetch: refetchBidCount } = useScaffoldReadContract({
    contractName: "BlindAuction",
    functionName: "getBidCount",
    args: [connectedAddress],
  });

  // 直接从合约读取用户的出价数量
  const getBidCountFromContract = async () => {
    if (!publicClient || !blindAuctionData || !auctionAddress || !connectedAddress) {
      console.error("无法获取合约数据或地址");
      return 0;
    }

    try {
      const count = await publicClient.readContract({
        address: auctionAddress,
        abi: blindAuctionData.abi,
        functionName: 'getBidCount',
        args: [connectedAddress],
      });

      console.log("合约中的出价数量:", count);
      return Number(count);
    } catch (error) {
      console.error("获取出价数量失败:", error);
      return 0;
    }
  };

  // 加载出价记录
  useEffect(() => {
    setIsClient(true);
    if (connectedAddress) {
      try {
        const storedBids = localStorage.getItem(`bids_${connectedAddress}`);
        console.log("从LocalStorage加载的原始出价数据:", storedBids);

        if (storedBids) {
          const parsedBids = JSON.parse(storedBids);
          console.log("所有解析的出价记录:", parsedBids);

          // 过滤出价记录
          let filteredBids;
          if (auctionAddress) {
            // 如果指定了拍卖地址，只显示该拍卖的出价
            filteredBids = parsedBids.filter((bid: BidInfo) =>
              bid.auctionAddress && bid.auctionAddress.toLowerCase() === auctionAddress.toLowerCase()
            );
            console.log(`过滤后与拍卖地址 ${auctionAddress} 匹配的出价记录:`, filteredBids);

            // 如果没有找到匹配的出价记录，则显示所有出价
            if (filteredBids.length === 0) {
              console.log("未找到匹配的出价记录，显示所有出价");
              filteredBids = parsedBids;
            }
          } else {
            // 如果未指定拍卖地址，显示所有出价
            filteredBids = parsedBids;
          }

          // 检查已揭示的出价
          const revealedKey = auctionAddress
            ? `revealed_bids_${connectedAddress}_${auctionAddress}`
            : `revealed_bids_${connectedAddress}`;
          const revealedBids = localStorage.getItem(revealedKey);
          const revealedIndices = revealedBids ? JSON.parse(revealedBids) : [];
          console.log("已揭示的出价索引:", revealedIndices);

          // 标记已揭示的出价
          const updatedBids = filteredBids.map((bid: BidInfo, index: number) => ({
            ...bid,
            revealed: revealedIndices.includes(index)
          }));

          console.log("加载的出价记录:", updatedBids); // 添加调试信息
          setBids(updatedBids);

          // 如果有预选的出价，则选中它
          if (preselectedIndex !== null) {
            const index = parseInt(preselectedIndex);
            if (!isNaN(index) && index >= 0 && index < filteredBids.length && !revealedIndices.includes(index)) {
              setSelectedBids([index]);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load bids:", error);
      }
    }
  }, [connectedAddress, preselectedIndex, auctionAddress]);

  // 获取合约写入函数
  // const { writeContractAsync } = useScaffoldWriteContract("BlindAuction");

  // 处理揭示功能
  const handleReveal = async () => {
    if (!connectedAddress) {
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

    // 确保有钱包客户端和合约数据
    if (!publicClient || !blindAuctionData || !walletClient) {
      notification.error("获取合约客户端失败");
      return;
    }

    // 再次检查当前是否仍在揭示阶段
    try {
      // 获取区块链当前时间 (以太坊的区块时间)
      const blockNumber = await publicClient.getBlockNumber();
      const block = await publicClient.getBlock({ blockNumber });
      const blockchainTimestamp = block.timestamp;

      const [biddingEndTime, revealEndTime, endedStatus] = await Promise.all([
        publicClient.readContract({
          address: auctionAddress,
          abi: blindAuctionData.abi,
          functionName: 'biddingEnd',
        }),
        publicClient.readContract({
          address: auctionAddress,
          abi: blindAuctionData.abi,
          functionName: 'revealEnd',
        }),
        publicClient.readContract({
          address: auctionAddress,
          abi: blindAuctionData.abi,
          functionName: 'ended',
        })
      ]);

      // 检查合约是否已标记为结束
      if (endedStatus) {
        notification.error("拍卖已结束，无法再揭示出价");
        setPhase(2); // 更新状态为已结束
        return;
      }

      // 检查揭示阶段是否已结束
      if (blockchainTimestamp >= BigInt(revealEndTime.toString())) {
        notification.error(`揭示阶段已结束，无法再揭示出价。区块链时间: ${new Date(Number(blockchainTimestamp) * 1000).toLocaleString()}, 揭示结束时间: ${new Date(Number(revealEndTime) * 1000).toLocaleString()}`);
        setPhase(2); // 更新状态为已结束
        return;
      }

      // 检查竞拍阶段是否已结束
      if (blockchainTimestamp < BigInt(biddingEndTime.toString())) {
        notification.error("竞拍阶段尚未结束，请等待竞拍结束后再进行揭示");
        setPhase(0);
        return;
      }

      // 显示时间信息，帮助用户理解
      console.log("区块链当前时间:", new Date(Number(blockchainTimestamp) * 1000).toLocaleString());
      console.log("竞拍结束时间:", new Date(Number(biddingEndTime) * 1000).toLocaleString());
      console.log("揭示结束时间:", new Date(Number(revealEndTime) * 1000).toLocaleString());

      const timeBeforeEnd = Number(BigInt(revealEndTime.toString()) - blockchainTimestamp);
      notification.info(`揭示阶段剩余时间: ${Math.floor(timeBeforeEnd / 3600)}小时 ${Math.floor((timeBeforeEnd % 3600) / 60)}分钟 ${timeBeforeEnd % 60}秒`);
    } catch (error) {
      console.error("检查揭示状态失败:", error);
      notification.error("检查揭示状态失败，请稍后再试");
      return;
    }

    if (phase !== 1) {
      notification.error(phase === 0 ? "当前仍是竞拍阶段，请等待竞拍结束后再进行揭示" : "揭示阶段已结束");
      return;
    }

    try {
      setIsRevealing(true);
      // 获取用户在合约中的出价数量
      // const result = await refetchBidCount();
      // const currentBidCount = result.data;

      // 使用新的方法直接从指定的合约地址获取出价数量
      const currentBidCount = await getBidCountFromContract();

      if (currentBidCount === undefined || currentBidCount === 0) {
        notification.error("无法获取您在合约中的出价数量，或者您在该合约中没有出价记录");
        setIsRevealing(false);
        return;
      }

      // 准备揭示数据
      const values: bigint[] = [];
      const fakes: boolean[] = [];
      const secrets: `0x${string}`[] = [];

      // 初始化数组，与合约中存储的出价数量相同
      // 对于未选中的出价，使用占位符数据
      for (let i = 0; i < Number(currentBidCount); i++) {
        values.push(ethers.parseEther("0"));
        fakes.push(true); // 设为假出价
        secrets.push(ethers.keccak256(ethers.toUtf8Bytes("dummy")) as `0x${string}`);
      }

      // 将选中的出价填入对应位置
      // 添加更多日志记录，帮助诊断问题
      console.log("开始处理选中的出价...");
      console.log("当前用户的合约出价数量:", currentBidCount);
      console.log("选中的出价索引:", selectedBids);

      for (const bidIndex of selectedBids) {
        const bid = bids[bidIndex];
        console.log(`处理出价 #${bidIndex}:`, {
          value: bid.value,
          fake: bid.fake,
          secret: bid.secret,
          timestamp: new Date(bid.timestamp).toLocaleString(),
          storedContractIndex: bid.contractIndex
        });

        // 使用投标时记录的合约索引，如果没有则使用列表索引
        // 重要：确保contractIndex正确
        const contractIndex = bid.contractIndex !== undefined && !isNaN(bid.contractIndex)
          ? bid.contractIndex
          : bidIndex;

        console.log(`出价 #${bidIndex} 将使用合约索引:`, contractIndex);

        // 确保索引在有效范围内
        if (contractIndex >= 0 && contractIndex < Number(currentBidCount)) {
          // 将出价值转换为ETH单位的BigInt
          try {
            const bidValueEth = ethers.parseEther(bid.value);
            console.log(`出价 #${bidIndex} 的ETH值:`, bidValueEth.toString());
            values[contractIndex] = bidValueEth;
          } catch (error) {
            console.error(`处理出价 #${bidIndex} 的值时出错:`, error);
            // 使用一个安全的默认值
            values[contractIndex] = ethers.parseEther("0");
          }

          fakes[contractIndex] = bid.fake;

          // 确保secret是正确的字符串格式
          try {
            const secretHash = ethers.keccak256(ethers.toUtf8Bytes(bid.secret)) as `0x${string}`;
            console.log(`出价 #${bidIndex} 的密钥哈希:`, secretHash);
            secrets[contractIndex] = secretHash;
          } catch (error) {
            console.error(`处理出价 #${bidIndex} 的密钥时出错:`, error);
            // 使用一个安全的默认值
            secrets[contractIndex] = ethers.keccak256(ethers.toUtf8Bytes("error")) as `0x${string}`;
          }
        } else {
          console.warn(`出价索引 ${contractIndex} 超出有效范围 (0-${Number(currentBidCount) - 1})`);
        }
      }

      // 打印最终的揭示数据
      console.log("最终的揭示数据:");
      console.log("Values:", values.map(v => ethers.formatEther(v)));
      console.log("Fakes:", fakes);
      console.log("Secrets:", secrets);
      console.log("Current bid count:", currentBidCount);
      console.log("Using auction address:", auctionAddress);

      // 使用walletClient直接调用合约，确保使用正确的合约地址
      if (!walletClient || !blindAuctionData || !auctionAddress) {
        notification.error("钱包连接或合约数据缺失");
        setIsRevealing(false);
        return;
      }

      // 执行合约调用前再次验证
      try {
        // 验证合约存在并且方法可用
        const code = await publicClient.getBytecode({ address: auctionAddress });
        if (!code || code === '0x') {
          notification.error("指定的拍卖合约地址无效");
          setIsRevealing(false);
          return;
        }

        // 执行合约调用
        const txHash = await walletClient.writeContract({
          address: auctionAddress,
          abi: blindAuctionData.abi,
          functionName: "reveal",
          args: [values, fakes, secrets],
        });

        console.log("Transaction hash:", txHash);
        notification.success("揭示出价成功！");

        // 提示用户需要查看结果
        notification.info("请稍后在拍卖结果页面查看最终结果", { duration: 8000 });

        // 更新本地存储，标记已揭示的出价
        const revealedKey = auctionAddress
          ? `revealed_bids_${connectedAddress}_${auctionAddress}`
          : `revealed_bids_${connectedAddress}`;
        const revealedBids = localStorage.getItem(revealedKey);
        const revealedIndices = revealedBids ? JSON.parse(revealedBids) : [];
        const updatedRevealedIndices = [...revealedIndices, ...selectedBids];
        localStorage.setItem(revealedKey, JSON.stringify(updatedRevealedIndices));

        // 更新UI状态
        const updatedBids = bids.map((bid, index) => ({
          ...bid,
          revealed: updatedRevealedIndices.includes(index)
        }));
        setBids(updatedBids);
        setSelectedBids([]);
      } catch (error) {
        console.error("揭示出价合约调用出错:", error);
        notification.error("揭示出价时出错，请确保您的出价数据正确");
      }
    } catch (error) {
      console.error("Error revealing bids:", error);
      notification.error("揭示出价时出错");
    } finally {
      setIsRevealing(false);
    }
  };

  // 选择或取消选择出价
  const toggleBidSelection = (index: number) => {
    setSelectedBids(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  // 时间戳转换成时间
  const timestampToDate = (timestamp: number) => {
    if (!timestamp) return "未知";

    // 检查是否为区块链时间戳（区块链时间戳通常为10位数，小于等于2^32）
    if (timestamp < 2147483648) {
      // 区块链时间戳是以秒为单位
      console.log("区块链时间戳转换:", timestamp, new Date(timestamp * 1000).toLocaleString());
      return new Date(timestamp * 1000).toLocaleString();
    }

    // 浏览器时间戳是以毫秒为单位，通常为13位数
    console.log("浏览器时间戳转换:", timestamp, new Date(timestamp).toLocaleString());
    return new Date(timestamp).toLocaleString();
  };

  if (!isClient) {
    return <div className="flex justify-center items-center min-h-[60vh]">
      <span className="loading loading-spinner loading-lg"></span>
    </div>;
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
      {/* 添加额外的渐变装饰层 */}
      <div className="absolute inset-0">
        {/* 左上角渐变 */}
        <div className="absolute top-0 left-0 w-1/3 h-1/3 bg-gradient-radial from-[#0a0058]/30 to-transparent"></div>

        {/* 右下角渐变 */}
        <div className="absolute bottom-0 right-0 w-1/3 h-1/3 bg-gradient-radial from-[#0a0058]/30 to-transparent"></div>

        {/* 中心光晕 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-radial from-[#060050]/50 via-[#040045]/30 to-transparent"></div>
      </div>

      {/* 添加微妙的网格纹理 */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,0,81,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(6,0,81,0.1)_1px,transparent_1px)] bg-[size:100px_100px]"></div>

      {/* 星光效果容器 */}
      <div className="star-container absolute inset-0 pointer-events-none z-10"></div>

      {/* 流星效果 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="shooting-star"
            style={{
              top: `${Math.random() * 50}%`,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 20}s`,
              animationDuration: `${45 + Math.random() * 20}s`
            }}
          ></div>
        ))}
      </div>

      {/* 科技感背景装饰 */}
      <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-transparent to-purple-500"></div>

      {/* 光晕效果 */}
      <div className="absolute top-20 -left-40 w-80 h-80 bg-cyan-500/20 rounded-full filter blur-[100px] animate-pulse"></div>
      <div className="absolute bottom-20 -right-40 w-80 h-80 bg-purple-500/20 rounded-full filter blur-[100px] animate-pulse"></div>

      {/* 装饰线条 */}
      <div className="absolute left-4 top-1/4 w-40 h-[2px] bg-cyan-500/50"></div>
      <div className="absolute right-4 top-1/3 w-40 h-[2px] bg-purple-500/50"></div>
      <div className="absolute left-8 bottom-1/4 w-20 h-[2px] bg-pink-500/50"></div>

      {/* 科技装饰元素 */}
      <div className="absolute left-6 top-40 w-20 h-20 border-l-2 border-t-2 border-cyan-500/50"></div>
      <div className="absolute right-6 bottom-40 w-20 h-20 border-r-2 border-b-2 border-purple-500/50"></div>

      <div className="relative z-10 container mx-auto px-4 py-12">
        <div className="flex flex-col items-center">
          <div className="w-full max-w-4xl">
            {/* 页面标题 */}
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-500 neon-text">
                揭示出价
              </h1>
              <p className="mt-2 text-slate-300">
                当前状态:
                <span className={`font-medium ml-2 ${phase === 1 ? 'text-green-400' : 'text-red-400'}`}>
                  {phase === 0
                    ? "竞拍阶段（需等待竞拍结束后才能揭示）"
                    : phase === 1
                      ? `揭示阶段（剩余时间: ${timeLeft}）`
                      : "拍卖已结束（无法再揭示出价）"}
                </span>
              </p>
            </div>

            {!connectedAddress ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-slate-700 shadow-lg hologram">
                <div className="scan-line"></div>
                <div className="text-6xl mb-6 opacity-80">🔒</div>
                <h3 className="text-xl font-semibold mb-4 text-white">请连接钱包</h3>
                <p className="text-slate-300 mb-6">您需要连接以太坊钱包来揭示您的出价</p>
                <button className="btn btn-primary bg-gradient-to-r from-blue-600 to-purple-600 border-0 btn-cyber">
                  连接钱包
                </button>
              </div>
            ) : phase !== 1 ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-slate-700 shadow-lg scan-container">
                <div className="scan-line"></div>
                <div className="text-6xl mb-6 opacity-80 encrypt-icon">
                  {phase === 0 ? "⏳" : "🏁"}
                </div>
                <h3 className="text-xl font-semibold mb-4 text-white">
                  {phase === 0 ? "竞拍阶段尚未结束" : "揭示阶段已结束"}
                </h3>
                <p className="mb-6 text-slate-300">
                  {phase === 0
                    ? "请等待竞拍阶段结束后再来揭示您的出价。"
                    : "揭示阶段已结束，无法再揭示出价。您可以查看拍卖结果。"}
                </p>
                <a
                  href={phase === 0
                    ? "/my-bids"
                    : auctionAddress
                      ? `/results?address=${auctionAddress}`
                      : "/results"}
                  className="btn btn-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 glow-on-hover"
                >
                  {phase === 0 ? "查看我的出价" : "查看拍卖结果"}
                </a>
              </div>
            ) : bids.length === 0 ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-slate-700 shadow-lg hologram">
                <div className="scan-line"></div>
                <div className="text-6xl mb-6 opacity-80">📭</div>
                <h3 className="text-xl font-semibold mb-4 text-white">暂无出价记录</h3>
                <p className="text-slate-300 mb-6">您没有参与过任何竞拍，无法进行揭示</p>
                <a href="/bid" className="btn btn-primary bg-gradient-to-r from-blue-600 to-purple-600 border-0 glow-on-hover">
                  立即参与竞拍
                </a>
              </div>
            ) : (
              <div>
                {/* 揭示说明 */}
                <div className="bg-slate-800/70 backdrop-blur-md rounded-xl p-5 mb-6 border border-slate-700 shadow-md">
                  <h2 className="text-xl font-semibold mb-3 text-white flex items-center">
                    <span className="mystery-icon mr-2">🔓</span> 揭示说明
                  </h2>
                  <ul className="list-disc pl-5 space-y-2 text-slate-300">
                    <li>在揭示阶段，您需要提供您在竞拍阶段提交的出价的具体信息</li>
                    <li>系统会验证您提供的信息与竞拍阶段提交的加密数据是否匹配</li>
                    <li>如果信息匹配且出价有效，您的出价将被考虑，最高出价者将获得拍品</li>
                    <li><span className="font-semibold text-yellow-400">重要：确保您输入的出价金额、是否虚假竞拍和密钥与竞拍时完全一致，否则您的押金将被没收</span></li>
                    <li><span className="font-semibold text-yellow-400">重要：如果您未在揭示阶段提交您的出价，您的押金将被没收</span></li>
                  </ul>
                </div>

                {/* 出价列表 */}
                <div className="bg-slate-900/70 backdrop-blur-md rounded-xl overflow-hidden border border-slate-700 shadow-lg mb-6">
                  <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4">
                    <h2 className="text-xl font-bold text-white">选择要揭示的出价</h2>
                    <p className="text-sm text-blue-100 mt-1">
                      {auctionAddress ? (
                        <>
                          拍卖地址: <span className="font-mono">{auctionAddress}</span>
                          <br />
                          当前状态: <span className={"text-" + (Number(phase) === 0 ? "cyan" : Number(phase) === 1 ? "yellow" : "red") + "-300"}>
                            {Number(phase) === 0 ? '竞拍阶段' : Number(phase) === 1 ? '揭示阶段' : '已结束'}
                          </span>
                        </>
                      ) : (
                        "请选择一个拍卖"
                      )}
                    </p>
                  </div>

                  <div className="p-4">
                    {selectedBids.length === 0 ? (
                      <div className="text-center text-slate-400 py-4">
                        请选择要揭示的出价
                      </div>
                    ) : (
                      <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
                        <h3 className="text-lg font-medium text-white mb-2">已选择 {selectedBids.length} 个出价</h3>
                        <p className="text-sm text-slate-300">
                          点击下方的"揭示出价"按钮提交您的真实出价信息。这将会向区块链提交您的原始出价数据用于验证。
                        </p>
                      </div>
                    )}

                    {/* 添加出价列表展示 */}
                    {bids.length > 0 && (
                      <div className="my-4">
                        <h3 className="text-lg font-medium text-white mb-3">您的出价记录</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                            <thead className="text-xs uppercase bg-slate-800/80">
                              <tr>
                                <th className="px-4 py-3">选择</th>
                                <th className="px-4 py-3">时间</th>
                                <th className="px-4 py-3">拍卖地址</th>
                                <th className="px-4 py-3">出价金额</th>
                                <th className="px-4 py-3">状态</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bids.map((bid, index) => (
                                <tr key={index} className={`border-b border-slate-700/30 hover:bg-slate-800/40 ${selectedBids.includes(index) ? 'bg-blue-900/20' : ''}`}>
                                  <td className="px-4 py-3">
                                    <input
                                      type="checkbox"
                                      checked={selectedBids.includes(index)}
                                      onChange={() => toggleBidSelection(index)}
                                      disabled={bid.revealed || phase !== 1}
                                      className="checkbox checkbox-sm checkbox-primary"
                                    />
                                  </td>
                                  <td className="px-4 py-3">{timestampToDate(bid.timestamp)}</td>
                                  <td className="px-4 py-3 font-mono text-xs">
                                    {bid.auctionAddress ? `${bid.auctionAddress.substring(0, 6)}...${bid.auctionAddress.substring(bid.auctionAddress.length - 4)}` : "未知"}
                                  </td>
                                  <td className="px-4 py-3">{bid.value} ETH</td>
                                  <td className="px-4 py-3">
                                    {bid.revealed ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        已揭示
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                        未揭示
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex justify-between items-center">
                      <div className="text-slate-300 text-sm">
                        <p>
                          提示：揭示出价需要消耗一定的Gas费用。未能正确揭示的出价将无法参与竞拍，且押金不予退还。
                        </p>
                        {/* 添加拍卖时间信息展示 */}
                        {auctionAddress && bids.length > 0 && bids[0].revealEnd && (
                          <div className="mt-2 p-2 bg-blue-900/30 rounded-lg text-blue-200 text-xs">
                            <p>拍卖揭示结束时间: {timestampToDate(bids[0].revealEnd)}</p>
                            <p>请务必在此时间前完成揭示操作，否则将无法参与竞拍结果。</p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleReveal}
                        disabled={selectedBids.length === 0 || phase !== 1 || isRevealing}
                        className={`btn btn-lg ${selectedBids.length === 0 || phase !== 1 ? 'btn-disabled' : 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700 text-white border-0'}`}
                      >
                        {isRevealing ? (
                          <>
                            <span className="loading loading-spinner"></span>
                            揭示中...
                          </>
                        ) : (
                          '揭示出价'
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 已揭示出价的摘要 */}
                {bids.some(bid => bid.revealed) && (
                  <div className="mt-10 bg-green-900/20 rounded-xl p-5 border border-green-800/40 shadow-inner">
                    <h3 className="text-lg font-semibold mb-4 text-green-300 flex items-center">
                      <span className="mr-2">✅</span> 已揭示的出价
                    </h3>
                    <div className="flex items-center justify-between">
                      <p className="text-slate-300">
                        您已成功揭示 <span className="font-semibold text-green-300">{bids.filter(bid => bid.revealed).length}</span> 个出价
                      </p>
                      <a
                        href={auctionAddress ? `/results?address=${auctionAddress}` : "/results"}
                        className="btn btn-sm bg-green-700 hover:bg-green-600 text-white border-0 glow-on-hover"
                      >
                        查看拍卖结果
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 导航链接 */}
            <div className="mt-8 flex justify-center space-x-4">
              <a href="/" className="text-slate-400 hover:text-blue-400 transition-colors">
                返回首页
              </a>
              <a href="/my-bids" className="text-slate-400 hover:text-purple-400 transition-colors">
                我的竞拍记录
              </a>
              <a href="/bid" className="text-slate-400 hover:text-cyan-400 transition-colors">
                竞拍页面
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 