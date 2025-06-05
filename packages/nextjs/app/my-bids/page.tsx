"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { MetaHeader } from "~~/components/MetaHeader";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { formatEther } from 'viem';

type BidRecord = {
  value: string;
  fake: boolean;
  secret: string;
  blindedBid: string;
  deposit: string;
  timestamp: number;
  contractIndex: number;
  auctionAddress: string;
  biddingEnd?: number;
  revealEnd?: number;
};

type AuctionInfo = {
  address: string;
  metadata: {
    name: string;
    description: string;
    image: string;
    minPrice: string;
  };
  state: "pending" | "bidding" | "revealing" | "ended";
  biddingEnd: bigint;
  revealEnd: bigint;
  phase: number;
};

const MyBids = () => {
  const { address } = useAccount();
  const [bidRecords, setBidRecords] = useState<BidRecord[]>([]);
  const [auctionInfos, setAuctionInfos] = useState<{ [key: string]: AuctionInfo }>({});
  const [loading, setLoading] = useState(true);

  // 获取合约信息
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { data: blindAuctionData } = useDeployedContractInfo("BlindAuction");
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });

  // 加载用户的竞拍记录
  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }

    const loadBidRecords = async () => {
      try {
        // 从localStorage获取竞拍记录
        const storedBids = localStorage.getItem(`bids_${address}`);
        if (!storedBids) {
          setBidRecords([]);
          setLoading(false);
          return;
        }

        const bids: BidRecord[] = JSON.parse(storedBids);
        setBidRecords(bids);

        // 获取每个拍卖的详细信息
        if (bids.length > 0 && publicClient && factoryContractData && blindAuctionData) {
          const uniqueAddresses = [...new Set(bids.map(bid => bid.auctionAddress))];
          const auctionInfoPromises = uniqueAddresses.map(async (auctionAddress) => {
            try {
              // 获取拍卖阶段
              const phase = await publicClient.readContract({
                address: auctionAddress as `0x${string}`,
                abi: blindAuctionData.abi,
                functionName: 'getAuctionPhase',
              });

              // 获取时间信息
              const [biddingEnd, revealEnd] = await Promise.all([
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
              ]);

              // 获取元数据
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

              // 确定状态
              const currentPhase = Number(phase);
              let state: "pending" | "bidding" | "revealing" | "ended" = "bidding";

              if (currentPhase === 0) {
                state = "pending";
              } else if (currentPhase === 1) {
                state = "bidding";
              } else if (currentPhase === 2) {
                state = "revealing";
              } else {
                state = "ended";
              }

              return {
                address: auctionAddress,
                metadata,
                state,
                biddingEnd: biddingEnd as bigint,
                revealEnd: revealEnd as bigint,
                phase: currentPhase,
              };
            } catch (error) {
              console.error(`获取拍卖 ${auctionAddress} 信息失败:`, error);
              return null;
            }
          });

          const auctionInfoResults = await Promise.all(auctionInfoPromises);
          const auctionInfoMap: { [key: string]: AuctionInfo } = {};

          auctionInfoResults.forEach((info) => {
            if (info) {
              auctionInfoMap[info.address] = info;
            }
          });

          setAuctionInfos(auctionInfoMap);
        }
      } catch (error) {
        console.error("加载竞拍记录失败:", error);
        notification.error("加载竞拍记录失败");
      } finally {
        setLoading(false);
      }
    };

    loadBidRecords();
  }, [address, publicClient, factoryContractData, blindAuctionData]);

  // 获取状态文本
  const getStateText = (state: string) => {
    switch (state) {
      case "pending": return "未开始";
      case "bidding": return "竞拍中";
      case "revealing": return "揭示中";
      case "ended": return "已结束";
      default: return "未知";
    }
  };

  // 获取状态样式
  const getStateClass = (state: string) => {
    switch (state) {
      case "pending":
        return "bg-blue-600/30 border border-blue-500/50 text-blue-300";
      case "bidding":
        return "bg-emerald-600/30 border border-emerald-500/50 text-emerald-300";
      case "revealing":
        return "bg-yellow-600/30 border border-yellow-500/50 text-yellow-300";
      case "ended":
        return "bg-gray-600/30 border border-gray-500/50 text-gray-300";
      default:
        return "bg-slate-600/30 border border-slate-500/50 text-slate-300";
    }
  };

  // 复制到剪贴板
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        notification.success(`${label}已复制到剪贴板`);
      },
      (err) => {
        console.error("复制失败:", err);
        notification.error("复制失败");
      }
    );
  };

  return (
    <>
      <MetaHeader
        title="我的竞拍记录 | 区块链盲拍平台"
        description="查看您参与的所有盲拍竞拍记录"
      />
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
        {/* 背景装饰 */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 -left-40 w-96 h-96 bg-purple-700 rounded-full filter blur-[120px] animate-pulse"></div>
          <div className="absolute bottom-0 -right-40 w-96 h-96 bg-indigo-700 rounded-full filter blur-[120px] animate-pulse delay-1000"></div>
        </div>

        <div className="absolute inset-0 bg-[linear-gradient(rgba(102,0,255,0.05)_1.5px,transparent_1.5px),linear-gradient(90deg,rgba(102,0,255,0.05)_1.5px,transparent_1.5px)] bg-[size:30px_30px]"></div>

        <div className="relative z-10 container mx-auto px-4 py-8">
          <div className="max-w-6xl mx-auto">
            {/* 页面标题 */}
            <div className="text-center mb-10">
              <h1 className="text-5xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-500 neon-text inline-block">
                我的竞拍记录
              </h1>
              <div className="h-1 w-40 bg-gradient-to-r from-purple-600 via-indigo-500 to-blue-600 mx-auto mt-4 rounded-full"></div>
              <p className="mt-4 text-slate-300 max-w-2xl mx-auto">
                查看您参与的所有盲拍竞拍记录，管理您的出价和揭示信息
              </p>
            </div>

            {!address ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-10 text-center border border-slate-700/60 shadow-lg">
                <div className="text-6xl mb-6 opacity-80">🔒</div>
                <h3 className="text-2xl font-semibold mb-4 text-white">请连接钱包</h3>
                <p className="text-slate-300 mb-6">连接您的以太坊钱包以查看竞拍记录</p>
                <button className="btn btn-primary bg-gradient-to-r from-blue-600 to-purple-600 border-0 btn-lg">
                  连接钱包
                </button>
              </div>
            ) : loading ? (
              <div className="flex flex-col justify-center items-center py-20">
                <div className="w-16 h-16 relative mb-4">
                  <div className="w-16 h-16 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin"></div>
                  </div>
                </div>
                <p className="text-purple-300/70">加载竞拍记录中...</p>
              </div>
            ) : bidRecords.length === 0 ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-10 text-center border border-slate-700/60 shadow-lg">
                <div className="text-6xl mb-6 opacity-80">📝</div>
                <h3 className="text-2xl font-semibold mb-4 text-white">暂无竞拍记录</h3>
                <p className="text-slate-300 mb-6">您还没有参与任何竞拍，去浏览拍卖并参与竞拍吧！</p>
                <Link
                  href="/all-auctions"
                  className="btn btn-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0"
                >
                  浏览所有拍卖
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                {bidRecords.map((bid, index) => {
                  const auctionInfo = auctionInfos[bid.auctionAddress];
                  return (
                    <div
                      key={index}
                      className="bg-slate-900/70 backdrop-blur-md rounded-xl border border-slate-700/60 shadow-lg overflow-hidden"
                    >
                      <div className="p-6">
                        <div className="flex flex-col lg:flex-row gap-6">
                          {/* 左侧：拍卖信息 */}
                          <div className="lg:w-1/2">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-xl font-semibold text-white">
                                {auctionInfo?.metadata.name || "加载中..."}
                              </h3>
                              {auctionInfo && (
                                <div className={`px-3 py-1 rounded-md text-sm font-semibold ${getStateClass(auctionInfo.state)}`}>
                                  {getStateText(auctionInfo.state)}
                                </div>
                              )}
                            </div>

                            <div className="space-y-3">
                              <div>
                                <p className="text-sm text-slate-400">拍卖地址</p>
                                <div className="flex items-center justify-between bg-slate-800/50 p-2 rounded">
                                  <Address address={bid.auctionAddress as `0x${string}`} format="short" />
                                  <button
                                    onClick={() => copyToClipboard(bid.auctionAddress, "拍卖地址")}
                                    className="text-blue-400 hover:text-blue-300 text-sm"
                                  >
                                    复制
                                  </button>
                                </div>
                              </div>

                              <div>
                                <p className="text-sm text-slate-400">拍卖描述</p>
                                <p className="text-white">
                                  {auctionInfo?.metadata.description || "加载中..."}
                                </p>
                              </div>

                              <div>
                                <p className="text-sm text-slate-400">最低出价</p>
                                <p className="text-green-400 font-medium">
                                  {auctionInfo
                                    ? `${formatEther(BigInt(auctionInfo.metadata.minPrice))} ETH`
                                    : "加载中..."
                                  }
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* 右侧：出价信息 */}
                          <div className="lg:w-1/2">
                            <h4 className="text-lg font-semibold text-white mb-4">您的出价信息</h4>

                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm text-slate-400">出价金额</p>
                                  <p className="text-white font-medium">{bid.value} ETH</p>
                                </div>
                                <div>
                                  <p className="text-sm text-slate-400">押金</p>
                                  <p className="text-white font-medium">{bid.deposit} ETH</p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm text-slate-400">出价类型</p>
                                  <p className={`font-medium ${bid.fake ? 'text-orange-400' : 'text-green-400'}`}>
                                    {bid.fake ? '假出价' : '真实出价'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm text-slate-400">出价时间</p>
                                  <p className="text-white text-sm">
                                    {new Date(bid.timestamp).toLocaleString()}
                                  </p>
                                </div>
                              </div>

                              <div>
                                <p className="text-sm text-slate-400">密钥</p>
                                <div className="flex items-center justify-between bg-slate-800/50 p-2 rounded">
                                  <span className="text-white font-mono text-sm truncate max-w-[70%]">
                                    {bid.secret}
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(bid.secret, "密钥")}
                                    className="text-blue-400 hover:text-blue-300 text-sm"
                                  >
                                    复制
                                  </button>
                                </div>
                              </div>

                              <div>
                                <p className="text-sm text-slate-400">加密出价</p>
                                <div className="flex items-center justify-between bg-slate-800/50 p-2 rounded">
                                  <span className="text-green-400 font-mono text-xs truncate max-w-[70%]">
                                    {bid.blindedBid}
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(bid.blindedBid, "加密出价")}
                                    className="text-blue-400 hover:text-blue-300 text-sm"
                                  >
                                    复制
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 操作按钮 */}
                        <div className="mt-6 pt-4 border-t border-slate-700/50 flex flex-wrap gap-3">
                          <Link
                            href={`/auction/${bid.auctionAddress}`}
                            className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-0"
                          >
                            查看拍卖详情
                          </Link>

                          {auctionInfo?.state === "revealing" && (
                            <Link
                              href={`/reveal?address=${bid.auctionAddress}`}
                              className="btn btn-sm bg-amber-600 hover:bg-amber-700 text-white border-0"
                            >
                              揭示出价
                            </Link>
                          )}

                          {auctionInfo?.state === "ended" && (
                            <Link
                              href={`/results?address=${bid.auctionAddress}`}
                              className="btn btn-sm bg-green-600 hover:bg-green-700 text-white border-0"
                            >
                              查看结果
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 导航链接 */}
            <div className="mt-8 flex justify-center space-x-6">
              <Link href="/" className="text-slate-400 hover:text-blue-400 transition-colors">
                返回首页
              </Link>
              <Link href="/all-auctions" className="text-slate-400 hover:text-purple-400 transition-colors">
                浏览所有拍卖
              </Link>
              <Link href="/my-auctions" className="text-slate-400 hover:text-cyan-400 transition-colors">
                我的拍卖
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MyBids; 