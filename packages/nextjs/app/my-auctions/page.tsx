"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { MetaHeader } from "~~/components/MetaHeader";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { useRouter } from "next/navigation";
import {
  cacheUserCreatedAuction,
  cacheUserParticipatedAuction,
  getCachedUserCreatedAuctions,
  getCachedUserParticipatedAuctions,
  shouldRefreshCache
} from "~~/services/store/auctionCache";
import { formatEther } from 'viem';

type AuctionTab = "created" | "participated";
type AuctionData = {
  address: `0x${string}`;
  metadata: {
    name: string;
    description: string;
    image: string;
    minPrice: string;
  };
  beneficiary: `0x${string}`;
  biddingStart?: bigint;
  biddingEnd: bigint;
  revealEnd: bigint;
  ended: boolean;
  state: "pending" | "bidding" | "revealing" | "ended";
};

const MyAuctions = () => {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<AuctionTab>("created");
  const [loading, setLoading] = useState(false);
  const [createdAuctions, setCreatedAuctions] = useState<AuctionData[]>([]);
  const [participatedAuctions, setParticipatedAuctions] = useState<AuctionData[]>([]);
  const router = useRouter();

  // 获取合约信息
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { data: blindAuctionData } = useDeployedContractInfo("BlindAuction");
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });

  // 加载用户的拍卖数据
  useEffect(() => {
    if (!address || !factoryContractData || !blindAuctionData || !publicClient) return;

    const loadUserAuctions = async () => {
      setLoading(true);
      try {
        console.log("开始获取用户拍卖数据...");
        console.log("当前用户地址:", address);
        console.log("工厂合约地址:", factoryContractData.address);

        // 首先尝试通过事件日志获取用户创建的拍卖（更可靠的方法）
        let userAuctions: `0x${string}`[] = [];

        try {
          console.log("通过事件日志获取用户创建的拍卖...");
          const createdLogs = await publicClient.getContractEvents({
            address: factoryContractData.address,
            abi: factoryContractData.abi,
            eventName: 'AuctionCreated',
            args: {
              beneficiary: address
            },
            fromBlock: BigInt(0),
          });

          console.log("通过事件日志找到的拍卖创建记录:", createdLogs);

          if (createdLogs.length > 0) {
            // 从事件日志中提取拍卖地址
            const auctionAddressesFromLogs = createdLogs.map(log => log.args?.auctionAddress).filter(Boolean) as `0x${string}`[];
            console.log("从事件日志提取的拍卖地址:", auctionAddressesFromLogs);
            userAuctions = auctionAddressesFromLogs;
          }
        } catch (logError) {
          console.error("通过事件日志查找拍卖失败:", logError);
        }

        // 如果事件日志方法失败或没有结果，尝试getUserAuctions方法
        if (userAuctions.length === 0) {
          try {
            console.log("事件日志方法无结果，尝试getUserAuctions方法...");
            const contractUserAuctions = await publicClient.readContract({
              address: factoryContractData.address,
              abi: factoryContractData.abi,
              functionName: 'getUserAuctions',
              args: [address],
            }) as `0x${string}`[];

            console.log("工厂合约getUserAuctions返回:", contractUserAuctions);
            userAuctions = contractUserAuctions;
          } catch (contractError) {
            console.error("getUserAuctions调用失败:", contractError);
          }
        }

        console.log("最终确定的用户拍卖列表:", userAuctions);
        console.log("用户拍卖数量:", userAuctions.length);

        // 获取缓存的用户创建的已结束拍卖
        const cachedCreatedAuctions = getCachedUserCreatedAuctions(address);
        const cachedCreatedAuctionsArray: AuctionData[] = [];
        const createdAddressesToFetch: `0x${string}`[] = [];

        // 检查哪些拍卖可以从缓存中获取，哪些需要从链上获取
        userAuctions.forEach(auctionAddress => {
          const cached = cachedCreatedAuctions[auctionAddress];
          if (cached && cached.state === "ended" && !shouldRefreshCache(cached.cachedAt || 0)) {
            // 使用缓存数据
            cachedCreatedAuctionsArray.push({
              address: cached.address,
              metadata: cached.metadata,
              beneficiary: cached.beneficiary,
              biddingEnd: cached.biddingEnd,
              revealEnd: cached.revealEnd,
              ended: cached.ended || false,
              state: cached.state
            });
          } else {
            // 需要从链上获取
            createdAddressesToFetch.push(auctionAddress);
          }
        });

        console.log(`用户创建的拍卖 - 使用缓存: ${cachedCreatedAuctionsArray.length}个, 从链上获取: ${createdAddressesToFetch.length}个`);

        // 获取每个需要从链上获取的拍卖的详细信息
        const fetchedCreatedAuctions = await Promise.all(
          createdAddressesToFetch.map(async (auctionAddress) => {
            try {
              // 获取拍卖基本信息
              const [beneficiary, biddingStart, biddingEnd, revealEnd, ended] = await Promise.all([
                publicClient.readContract({
                  address: auctionAddress,
                  abi: blindAuctionData.abi,
                  functionName: 'beneficiary',
                }),
                publicClient.readContract({
                  address: auctionAddress,
                  abi: blindAuctionData.abi,
                  functionName: 'biddingStart',
                }),
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
              ]) as [`0x${string}`, bigint, bigint, bigint, boolean];

              // 尝试获取拍卖元数据
              let metadata = {
                name: "未命名拍卖",
                description: "无描述",
                image: "",
                minPrice: "0",
              };

              try {
                // 通过过滤区块日志方式获取创建事件
                const logs = await publicClient.getContractEvents({
                  address: factoryContractData.address,
                  abi: factoryContractData.abi,
                  eventName: 'AuctionCreated',
                  args: {
                    auctionAddress: auctionAddress
                  },
                  fromBlock: BigInt(0),
                });

                if (logs && logs.length > 0 && logs[0].args) {
                  const metadataStr = logs[0].args.metadata as string;
                  if (metadataStr) {
                    try {
                      metadata = JSON.parse(metadataStr);
                    } catch (e) {
                      console.error("解析元数据字符串失败:", e);
                    }
                  }
                }
              } catch (error) {
                console.error("获取拍卖元数据失败:", error);
              }

              // 确定拍卖状态
              let state: "pending" | "bidding" | "revealing" | "ended" = "bidding";
              const now = BigInt(Math.floor(Date.now() / 1000));

              if (ended) {
                state = "ended";
              } else if (now > revealEnd) {
                // 如果揭示阶段已过但合约的ended状态还没更新，仍然标记为已结束
                state = "ended";
              } else if (now > biddingEnd) {
                state = "revealing";
              } else if (now < biddingStart) {
                // 如果当前时间早于竞拍开始时间，标记为未开始
                state = "pending";
              } else {
                // 当前时间在竞拍开始和结束之间
                state = "bidding";
              }

              const auctionData = {
                address: auctionAddress,
                metadata,
                beneficiary,
                biddingStart,
                biddingEnd,
                revealEnd,
                ended,
                state,
              };

              // 如果是已结束拍卖，缓存它
              if (state === "ended") {
                cacheUserCreatedAuction(address, auctionData);
              }

              return auctionData;
            } catch (error) {
            }
          })
        );

        // 合并缓存和新获取的创建的拍卖数据
        const allCreatedAuctions = [
          ...cachedCreatedAuctionsArray,
          ...fetchedCreatedAuctions.filter(Boolean) as AuctionData[]
        ];

        setCreatedAuctions(allCreatedAuctions);

        // 从本地存储获取用户参与过的拍卖
        try {
          // 从localStorage获取用户的竞拍记录
          const storedBids = localStorage.getItem(`bids_${address}`);
          if (storedBids) {
            const parsedBids = JSON.parse(storedBids);

            // 获取用户参与过的拍卖地址
            const participatedAddresses = new Set<string>();
            parsedBids.forEach((bid: any) => {
              if (bid.auctionAddress) {
                participatedAddresses.add(bid.auctionAddress);
              }
            });

            // 获取缓存的用户参与的已结束拍卖
            const cachedParticipatedAuctions = getCachedUserParticipatedAuctions(address);
            const cachedParticipatedAuctionsArray: AuctionData[] = [];
            const participatedAddressesToFetch: `0x${string}`[] = [];

            // 检查哪些拍卖可以从缓存中获取，哪些需要从链上获取
            Array.from(participatedAddresses).forEach(auctionAddress => {
              const cached = cachedParticipatedAuctions[auctionAddress];
              if (cached && cached.state === "ended" && !shouldRefreshCache(cached.cachedAt || 0)) {
                // 使用缓存数据
                cachedParticipatedAuctionsArray.push({
                  address: cached.address,
                  metadata: cached.metadata,
                  beneficiary: cached.beneficiary,
                  biddingEnd: cached.biddingEnd,
                  revealEnd: cached.revealEnd,
                  ended: cached.ended || false,
                  state: cached.state
                });
              } else {
                // 需要从链上获取
                participatedAddressesToFetch.push(auctionAddress as `0x${string}`);
              }
            });

            console.log(`用户参与的拍卖 - 使用缓存: ${cachedParticipatedAuctionsArray.length}个, 从链上获取: ${participatedAddressesToFetch.length}个`);

            // 获取这些拍卖的详细信息
            const fetchedParticipatedData = await Promise.all(
              participatedAddressesToFetch.map(async (auctionAddress) => {
                try {
                  // 重用上面的拍卖信息获取逻辑
                  const [beneficiary, biddingStart, biddingEnd, revealEnd, ended] = await Promise.all([
                    publicClient.readContract({
                      address: auctionAddress as `0x${string}`,
                      abi: blindAuctionData.abi,
                      functionName: 'beneficiary',
                    }),
                    publicClient.readContract({
                      address: auctionAddress as `0x${string}`,
                      abi: blindAuctionData.abi,
                      functionName: 'biddingStart',
                    }),
                    publicClient.readContract({
                      address: auctionAddress as `0x${string}`,
                      abi: blindAuctionData.abi,
                      functionName: 'biddingEnd',
                    }),
                    publicClient.readContract({
                      address: auctionAddress as `0x${string}`,
                      abi: blindAuctionData.abi,
                      functionName: 'revealEnd',
                    }),
                    publicClient.readContract({
                      address: auctionAddress as `0x${string}`,
                      abi: blindAuctionData.abi,
                      functionName: 'ended',
                    }),
                  ]) as [`0x${string}`, bigint, bigint, bigint, boolean];

                  // 尝试获取拍卖元数据
                  let metadata = {
                    name: "未命名拍卖",
                    description: "无描述",
                    image: "",
                    minPrice: "0",
                  };

                  try {
                    const logs = await publicClient.getContractEvents({
                      address: factoryContractData.address,
                      abi: factoryContractData.abi,
                      eventName: 'AuctionCreated',
                      args: {
                        auctionAddress: auctionAddress as `0x${string}`
                      },
                      fromBlock: BigInt(0),
                    });

                    if (logs && logs.length > 0 && logs[0].args) {
                      const metadataStr = logs[0].args.metadata as string;
                      if (metadataStr) {
                        try {
                          metadata = JSON.parse(metadataStr);
                        } catch (e) {
                          console.error("解析元数据字符串失败:", e);
                        }
                      }
                    }
                  } catch (error) {
                    console.error("获取拍卖元数据失败:", error);
                  }

                  // 确定拍卖状态
                  let state: "pending" | "bidding" | "revealing" | "ended" = "bidding";
                  const now = BigInt(Math.floor(Date.now() / 1000));

                  if (ended) {
                    state = "ended";
                  } else if (now > revealEnd) {
                    // 如果揭示阶段已过但合约的ended状态还没更新，仍然标记为已结束
                    state = "ended";
                  } else if (now > biddingEnd) {
                    state = "revealing";
                  } else if (now < biddingStart) {
                    // 如果当前时间早于竞拍开始时间，标记为未开始
                    state = "pending";
                  } else {
                    // 当前时间在竞拍开始和结束之间
                    state = "bidding";
                  }

                  const auctionData = {
                    address: auctionAddress as `0x${string}`,
                    metadata,
                    beneficiary: beneficiary as `0x${string}`,
                    biddingEnd,
                    revealEnd,
                    ended,
                    state,
                  };

                  // 如果是已结束拍卖，缓存它
                  if (state === "ended") {
                    cacheUserParticipatedAuction(address, auctionData);
                  }

                  return auctionData;
                } catch (error) {
                  console.error(`获取拍卖 ${auctionAddress} 信息失败:`, error);
                  return null;
                }
              })
            );

            // 合并缓存和新获取的参与的拍卖数据
            const allParticipatedAuctions = [
              ...cachedParticipatedAuctionsArray,
              ...fetchedParticipatedData.filter(Boolean) as AuctionData[]
            ];

            setParticipatedAuctions(allParticipatedAuctions);
          }
        } catch (error) {
          console.error("加载参与的拍卖失败:", error);
        }

      } catch (error) {
        console.error("加载用户拍卖列表失败:", error);
        notification.error("加载拍卖列表失败，请刷新页面重试");
      } finally {
        setLoading(false);
      }
    };

    loadUserAuctions();
  }, [address, factoryContractData, blindAuctionData, publicClient]);

  // 格式化时间显示
  const formatTimeLeft = (auction: any) => {
    const now = Math.floor(Date.now() / 1000);
    if (auction.state === "pending") {
      const timeLeft = Number(auction.biddingStart) - now;
      if (timeLeft <= 0) return "竞拍即将开始";
      return new Date(Number(auction.biddingStart) * 1000).toLocaleString();
    } else if (auction.state === "bidding") {
      const timeLeft = Number(auction.biddingEnd) - now;
      if (timeLeft <= 0) return "竞拍已结束";
      return new Date(Number(auction.biddingEnd) * 1000).toLocaleString();
    } else if (auction.state === "revealing") {
      const timeLeft = Number(auction.revealEnd) - now;
      if (timeLeft <= 0) return "揭示已结束";
      return new Date(Number(auction.revealEnd) * 1000).toLocaleString();
    } else {
      return "拍卖已结束";
    }
  };

  // 获取状态样式类
  const getStatusClass = (state: string) => {
    switch (state) {
      case "pending":
        return "bg-blue-600/30 border border-blue-500/50 text-blue-300";
      case "bidding":
        return "bg-emerald-600/30 border border-emerald-500/50 text-emerald-300";
      case "revealing":
        return "bg-yellow-600/30 border border-yellow-500/50 text-yellow-300";
      case "ended":
        return "bg-green-600/30 border border-green-500/50 text-green-300";
      default:
        return "bg-slate-600/30 border border-slate-500/50 text-slate-300";
    }
  };

  // 获取状态文本
  const getStatusText = (state: string) => {
    switch (state) {
      case "pending":
        return "未开始";
      case "bidding":
        return "竞拍中";
      case "revealing":
        return "揭示中";
      case "ended":
        return "已结束";
      default:
        return "未知";
    }
  };

  // 复制地址到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        notification.success("地址已复制到剪贴板");
      },
      (err) => {
        console.error("无法复制地址: ", err);
        notification.error("复制地址失败");
      }
    );
  };

  // 查看结果或提取资金
  const handleWithdraw = (auctionAddress: string) => {
    router.push(`/results?address=${auctionAddress}`);
  };

  // 设置加载状态
  const isLoading = loading;

  return (
    <>
      <MetaHeader
        title="我的拍卖 | 区块链盲拍平台"
        description="查看您参与和创建的所有盲拍拍卖"
      />
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
          <div className="w-full max-w-6xl mx-auto">
            {/* 页面标题 */}
            <div className="text-center mb-10">
              <h1 className="text-5xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-500 neon-text inline-block">
                我的拍卖
              </h1>
              <div className="h-1 w-40 bg-gradient-to-r from-purple-600 via-indigo-500 to-blue-600 mx-auto mt-4 rounded-full"></div>
              <p className="mt-4 text-slate-300 max-w-2xl mx-auto">
                管理您创建和参与的所有区块链盲拍拍卖
              </p>
            </div>

            {!address ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-10 text-center border border-slate-700/60 shadow-[0_0_15px_rgba(59,130,246,0.2)] relative overflow-hidden">
                {/* 装饰元素 */}
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/10 rounded-full filter blur-3xl"></div>
                <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/10 rounded-full filter blur-3xl"></div>
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"></div>

                <div className="text-7xl mb-6 opacity-80 text-blue-400 glow-text">🔒</div>
                <h3 className="text-2xl font-semibold mb-4 text-white">请连接钱包</h3>
                <p className="text-slate-300 mb-6 max-w-md mx-auto">连接您的以太坊钱包以查看您创建和参与的所有拍卖</p>
                <div className="mockup-code bg-slate-800/60 mb-6 max-w-md mx-auto border border-slate-700/50">
                  <pre><code className="text-blue-400">// 需要连接钱包以继续</code></pre>
                  <pre><code className="text-white">connect wallet to view your auctions</code></pre>
                </div>
                <button className="btn btn-primary bg-gradient-to-r from-blue-600 to-purple-600 border-0 btn-lg shadow-lg hover:shadow-blue-500/20 transition-all duration-300 relative overflow-hidden group">
                  <span className="relative z-10">连接钱包</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-blue-400/30 to-purple-400/0 opacity-0 group-hover:opacity-100 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-all duration-1000"></div>
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {/* 顶部数据统计卡片 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-6 border border-slate-700/50 shadow-lg hover:shadow-blue-500/10 transition-all duration-300 hover:-translate-y-1">
                    <div className="flex items-center mb-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center mr-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-slate-400">我创建的拍卖</h3>
                        <p className="text-2xl font-bold text-white">{createdAuctions.length}</p>
                      </div>
                    </div>
                    <div className="h-1 w-full bg-gradient-to-r from-blue-500/50 to-purple-500/20 rounded-full"></div>
                  </div>

                  <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-6 border border-slate-700/50 shadow-lg hover:shadow-purple-500/10 transition-all duration-300 hover:-translate-y-1">
                    <div className="flex items-center mb-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center mr-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-slate-400">我参与的拍卖</h3>
                        <p className="text-2xl font-bold text-white">{participatedAuctions.length}</p>
                      </div>
                    </div>
                    <div className="h-1 w-full bg-gradient-to-r from-purple-500/50 to-pink-500/20 rounded-full"></div>
                  </div>

                  <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-6 border border-slate-700/50 shadow-lg hover:shadow-cyan-500/10 transition-all duration-300 hover:-translate-y-1">
                    <div className="flex items-center mb-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-500/30 flex items-center justify-center mr-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-slate-400">活跃的拍卖</h3>
                        <p className="text-2xl font-bold text-white">
                          {createdAuctions.filter(a => a.state !== "ended").length +
                            participatedAuctions.filter(a => a.state !== "ended").length}
                        </p>
                      </div>
                    </div>
                    <div className="h-1 w-full bg-gradient-to-r from-cyan-500/50 to-blue-500/20 rounded-full"></div>
                  </div>
                </div>

                {/* 我创建的拍卖 */}
                <div className="bg-slate-900/70 backdrop-blur-md rounded-xl overflow-hidden border border-slate-700/60 shadow-xl relative">
                  {/* 装饰光效 */}
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"></div>
                  <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-blue-500/30 via-transparent to-transparent"></div>

                  <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-white flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      我创建的拍卖
                    </h2>

                    <Link href="/create-auction" className="btn btn-sm bg-blue-500/30 hover:bg-blue-500/50 border border-blue-400/30 text-white">
                      创建新拍卖
                    </Link>
                  </div>

                  <div className="p-6">
                    {createdAuctions.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {createdAuctions.map((auction, index) => (
                          <div key={index} className="bg-slate-800/50 rounded-xl border border-slate-700/60 shadow-md hover:shadow-blue-500/10 transition-all overflow-hidden hover:-translate-y-1 hover:border-blue-500/50 group relative">
                            {/* 卡片内光效 */}
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"></div>
                              <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-blue-500/30 via-transparent to-transparent"></div>
                            </div>

                            <div className="relative h-40 bg-slate-700/50 overflow-hidden">
                              {auction.metadata.image ? (
                                <img
                                  src={auction.metadata.image}
                                  alt={auction.metadata.name}
                                  className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                                />
                              ) : (
                                <div className="flex items-center justify-center h-full text-slate-400 bg-gradient-to-br from-slate-800 to-slate-900">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              )}
                              <div className={`absolute top-2 right-2 px-2 py-1 rounded-md text-xs font-semibold ${getStatusClass(auction.state)}`}>
                                {getStatusText(auction.state)}
                              </div>
                            </div>
                            <div className="p-4">
                              <h3 className="text-lg font-semibold text-white mb-2 truncate group-hover:text-blue-400 transition-colors">
                                {auction.metadata.name || "未命名拍卖"}
                              </h3>
                              <p className="text-slate-400 text-sm mb-3 line-clamp-2 h-10">
                                {auction.metadata.description || "无描述"}
                              </p>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-300">起拍价:</span>
                                <span className="text-green-400 font-medium">
                                  {typeof auction.metadata.minPrice === 'string' && auction.metadata.minPrice.includes('.')
                                    ? `${auction.metadata.minPrice} ETH`
                                    : `${formatEther(BigInt(auction.metadata.minPrice))} ETH`}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-sm mt-1">
                                <span className="text-slate-300">结束时间:</span>
                                <span className="text-blue-300">{formatTimeLeft(auction)}</span>
                              </div>
                              <div className="mt-4 pt-3 border-t border-slate-700/50 flex justify-between items-center">
                                <Link
                                  href={`/auction/${auction.address}`}
                                  className="text-blue-400 hover:text-blue-300 text-sm flex items-center group-hover:translate-x-1 transition-transform"
                                >
                                  查看详情
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </Link>
                                <div className="flex gap-2">
                                  {auction.state === "revealing" && (
                                    <button
                                      className="btn btn-xs bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 border-0 text-xs text-white shadow-md"
                                      onClick={() => handleWithdraw(auction.address)}
                                    >
                                      查看结果
                                    </button>
                                  )}
                                  <button
                                    className="btn btn-xs bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 border-0 text-xs text-white shadow-md"
                                    onClick={() => copyToClipboard(auction.address)}
                                  >
                                    复制地址
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : isLoading ? (
                      <div className="flex flex-col justify-center items-center py-16">
                        <div className="w-16 h-16 relative">
                          <div className="w-16 h-16 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin"></div>
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-6 h-6 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin"></div>
                          </div>
                        </div>
                        <p className="mt-4 text-slate-300 animate-pulse">加载中...</p>
                      </div>
                    ) : (
                      <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-slate-700/50 relative overflow-hidden">
                        {/* 装饰背景 */}
                        <div className="absolute inset-0 opacity-10">
                          <div className="absolute top-0 -left-20 w-40 h-40 bg-blue-600 rounded-full filter blur-[50px]"></div>
                          <div className="absolute bottom-0 -right-20 w-40 h-40 bg-purple-600 rounded-full filter blur-[50px]"></div>
                        </div>

                        <div className="relative z-10">
                          <div className="inline-block p-4 bg-blue-500/10 rounded-full mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <h3 className="text-xl font-semibold mb-2 text-white">您还没有创建任何拍卖</h3>
                          <p className="text-slate-400 mb-8 max-w-md mx-auto">
                            创建您的第一个盲拍拍卖，所有出价信息将被加密存储在区块链上。
                          </p>
                          <Link
                            href="/create-auction"
                            className="btn btn-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 border-0 text-white shadow-lg hover:shadow-blue-500/20 transition-all duration-300 relative overflow-hidden group"
                          >
                            <span className="relative z-10">创建拍卖</span>
                            <div className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-blue-400/30 to-purple-400/0 opacity-0 group-hover:opacity-100 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-all duration-1000"></div>
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 我参与的拍卖 */}
                <div className="bg-slate-900/70 backdrop-blur-md rounded-xl overflow-hidden border border-slate-700/60 shadow-xl relative">
                  {/* 装饰光效 */}
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
                  <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-purple-500/30 via-transparent to-transparent"></div>

                  <div className="bg-gradient-to-r from-purple-600 to-cyan-600 p-4 flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-white flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      我参与的拍卖
                    </h2>

                    <Link href="/all-auctions" className="btn btn-sm bg-purple-500/30 hover:bg-purple-500/50 border border-purple-400/30 text-white">
                      浏览更多拍卖
                    </Link>
                  </div>

                  <div className="p-6">
                    {participatedAuctions.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {participatedAuctions.map((auction, index) => (
                          <div key={index} className="bg-slate-800/50 rounded-xl border border-slate-700/60 shadow-md hover:shadow-purple-500/10 transition-all overflow-hidden hover:-translate-y-1 hover:border-purple-500/50 group relative">
                            {/* 卡片内光效 */}
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
                              <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-purple-500/30 via-transparent to-transparent"></div>
                            </div>

                            <div className="relative h-40 bg-slate-700/50 overflow-hidden">
                              {auction.metadata.image ? (
                                <img
                                  src={auction.metadata.image}
                                  alt={auction.metadata.name}
                                  className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                                />
                              ) : (
                                <div className="flex items-center justify-center h-full text-slate-400 bg-gradient-to-br from-slate-800 to-slate-900">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              )}
                              <div className={`absolute top-2 right-2 px-2 py-1 rounded-md text-xs font-semibold ${getStatusClass(auction.state)}`}>
                                {getStatusText(auction.state)}
                              </div>
                            </div>
                            <div className="p-4">
                              <h3 className="text-lg font-semibold text-white mb-2 truncate group-hover:text-purple-400 transition-colors">
                                {auction.metadata.name || "未命名拍卖"}
                              </h3>
                              <p className="text-slate-400 text-sm mb-3 line-clamp-2 h-10">
                                {auction.metadata.description || "无描述"}
                              </p>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-300">起拍价:</span>
                                <span className="text-green-400 font-medium">
                                  {typeof auction.metadata.minPrice === 'string' && auction.metadata.minPrice.includes('.')
                                    ? `${auction.metadata.minPrice} ETH`
                                    : `${formatEther(BigInt(auction.metadata.minPrice))} ETH`}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-sm mt-1">
                                <span className="text-slate-300">结束时间:</span>
                                <span className="text-purple-300">{formatTimeLeft(auction)}</span>
                              </div>
                              <div className="mt-4 pt-3 border-t border-slate-700/50 flex justify-between items-center">
                                <Link
                                  href={`/auction/${auction.address}`}
                                  className="text-purple-400 hover:text-purple-300 text-sm flex items-center group-hover:translate-x-1 transition-transform"
                                >
                                  查看详情
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </Link>
                                <div className="flex gap-2">
                                  {auction.state === "bidding" && (
                                    <Link
                                      href={`/bid?address=${auction.address}`}
                                      className="btn btn-xs bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 border-0 text-xs text-white shadow-md"
                                    >
                                      出价
                                    </Link>
                                  )}
                                  {auction.state === "revealing" && (
                                    <Link
                                      href={`/reveal?address=${auction.address}`}
                                      className="btn btn-xs bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 border-0 text-xs text-white shadow-md"
                                    >
                                      揭示
                                    </Link>
                                  )}
                                  {auction.state === "ended" && (
                                    <Link
                                      href={`/results?address=${auction.address}`}
                                      className="btn btn-xs bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 border-0 text-xs text-white shadow-md"
                                    >
                                      结果
                                    </Link>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : isLoading ? (
                      <div className="flex flex-col justify-center items-center py-16">
                        <div className="w-16 h-16 relative">
                          <div className="w-16 h-16 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full border-2 border-pink-500/20 border-t-pink-500 animate-spin"></div>
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-6 h-6 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin"></div>
                          </div>
                        </div>
                        <p className="mt-4 text-slate-300 animate-pulse">加载中...</p>
                      </div>
                    ) : (
                      <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-slate-700/50 relative overflow-hidden">
                        {/* 装饰背景 */}
                        <div className="absolute inset-0 opacity-10">
                          <div className="absolute top-0 -left-20 w-40 h-40 bg-purple-600 rounded-full filter blur-[50px]"></div>
                          <div className="absolute bottom-0 -right-20 w-40 h-40 bg-cyan-600 rounded-full filter blur-[50px]"></div>
                        </div>

                        <div className="relative z-10">
                          <div className="inline-block p-4 bg-purple-500/10 rounded-full mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </div>
                          <h3 className="text-xl font-semibold mb-2 text-white">您还没有参与任何拍卖</h3>
                          <p className="text-slate-400 mb-8 max-w-md mx-auto">
                            浏览所有可用的拍卖，并使用加密出价参与竞拍。
                          </p>
                          <Link
                            href="/all-auctions"
                            className="btn btn-lg bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 border-0 text-white shadow-lg hover:shadow-purple-500/20 transition-all duration-300 relative overflow-hidden group"
                          >
                            <span className="relative z-10">浏览拍卖</span>
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-400/0 via-purple-400/30 to-cyan-400/0 opacity-0 group-hover:opacity-100 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-all duration-1000"></div>
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 导航链接 */}
            <div className="mt-8 flex justify-center space-x-6">
              <Link href="/" className="text-slate-400 hover:text-blue-400 transition-colors flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                返回首页
              </Link>
              <Link href="/all-auctions" className="text-slate-400 hover:text-purple-400 transition-colors flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                所有拍卖
              </Link>
              <Link href="/create-auction" className="text-slate-400 hover:text-cyan-400 transition-colors flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                创建拍卖
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* CSS 动画定义 */}
      <style jsx global>{`
        @keyframes glow {
          0%, 100% { text-shadow: 0 0 10px rgba(59, 130, 246, 0.5), 0 0 20px rgba(59, 130, 246, 0.3); }
          50% { text-shadow: 0 0 15px rgba(139, 92, 246, 0.8), 0 0 30px rgba(139, 92, 246, 0.5); }
        }
        .glow-text {
          animation: glow 2s ease-in-out infinite;
        }
        .neon-text {
          text-shadow: 0 0 10px rgba(59, 130, 246, 0.7), 0 0 20px rgba(59, 130, 246, 0.5);
        }
      `}</style>
    </>
  );
};

export default MyAuctions; 