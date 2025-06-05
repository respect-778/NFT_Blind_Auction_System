"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import { formatEther } from "viem";
import { Address } from "~~/components/scaffold-eth";
import { MetaHeader } from "~~/components/MetaHeader";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

type AuctionState = "pending" | "bidding" | "revealing" | "ended";
type AuctionData = {
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
  highestBid: bigint;
  highestBidder: `0x${string}`;
  ended: boolean;
  state: AuctionState;
  phase: number;
  biddingTimeLeft: number;
  revealTimeLeft: number;
  biddingStartTimeLeft?: number;
  biddingEndTime?: string;
  revealEndTime?: string;
  blockchainTime?: string;
};

const AuctionDetail = () => {
  const params = useParams();
  const router = useRouter();
  const { address } = useAccount();
  const auctionAddress = params?.address as `0x${string}`;
  const [auctionData, setAuctionData] = useState<AuctionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 获取合约信息
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { data: blindAuctionData } = useDeployedContractInfo("BlindAuction");
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });

  // 加载拍卖详情
  useEffect(() => {
    const loadAuctionDetails = async () => {
      if (!factoryContractData || !blindAuctionData || !publicClient || !auctionAddress) return;

      try {
        setIsLoading(true);

        // 获取拍卖基本信息
        const [phaseResult, biddingStartTimeLeftResult, biddingTimeLeftResult, revealTimeLeftResult, highestBidderResult,
          highestBidResult, beneficiaryResult, endedResult, biddingStartResult, biddingEndResult, revealEndResult] = await Promise.all([
            // 获取当前阶段
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionData.abi,
              functionName: 'getAuctionPhase',
            }),
            // 获取竞拍开始剩余时间
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionData.abi,
              functionName: 'biddingStartTimeLeft',
            }),
            // 获取竞拍剩余时间
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionData.abi,
              functionName: 'biddingTimeLeft',
            }),
            // 获取揭示剩余时间
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionData.abi,
              functionName: 'revealTimeLeft',
            }),
            // 获取最高出价者
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionData.abi,
              functionName: 'highestBidder',
            }),
            // 获取最高出价
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionData.abi,
              functionName: 'highestBid',
            }),
            // 获取受益人
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionData.abi,
              functionName: 'beneficiary',
            }),
            // 获取是否已结束
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionData.abi,
              functionName: 'ended',
            }),
            // 获取竞拍开始时间戳
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionData.abi,
              functionName: 'biddingStart',
            }),
            // 获取竞拍结束时间戳
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionData.abi,
              functionName: 'biddingEnd',
            }),
            // 获取揭示结束时间戳
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionData.abi,
              functionName: 'revealEnd',
            }),
          ]);

        // 获取区块链当前时间
        const blockNumber = await publicClient.getBlockNumber();
        const block = await publicClient.getBlock({ blockNumber });
        const blockchainTimestamp = block.timestamp;

        // 格式化时间显示
        const biddingStartDate = new Date(Number(biddingStartResult) * 1000);
        const biddingEndDate = new Date(Number(biddingEndResult) * 1000);
        const revealEndDate = new Date(Number(revealEndResult) * 1000);
        const blockchainDate = new Date(Number(blockchainTimestamp) * 1000);

        console.log("区块链当前时间:", blockchainDate.toLocaleString());
        console.log("竞拍开始时间:", biddingStartDate.toLocaleString());
        console.log("竞拍结束时间:", biddingEndDate.toLocaleString());
        console.log("揭示结束时间:", revealEndDate.toLocaleString());

        // 设置拍卖状态
        const currentPhase = Number(phaseResult);
        const ended = Boolean(endedResult);

        // 使用合约返回的阶段状态：0-未开始 1-竞拍阶段 2-揭示阶段 3-拍卖结束
        let actualPhase = currentPhase;
        let stateText: AuctionState = "pending";

        if (ended || currentPhase === 3) {
          actualPhase = 3;
          stateText = "ended";
        } else if (currentPhase === 2) {
          actualPhase = 2;
          stateText = "revealing";
        } else if (currentPhase === 1) {
          actualPhase = 1;
          stateText = "bidding";
        } else {
          actualPhase = 0;
          stateText = "pending";
        }

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

        setAuctionData({
          metadata,
          beneficiary: beneficiaryResult as `0x${string}`,
          biddingStart: biddingStartResult,
          biddingEnd: biddingEndResult,
          revealEnd: revealEndResult,
          highestBid: highestBidResult,
          highestBidder: highestBidderResult as `0x${string}`,
          ended,
          state: stateText,
          phase: actualPhase,
          biddingTimeLeft: biddingTimeLeftResult ? Number(biddingTimeLeftResult) : 0,
          revealTimeLeft: revealTimeLeftResult ? Number(revealTimeLeftResult) : 0,
          biddingStartTimeLeft: biddingStartTimeLeftResult ? Number(biddingStartTimeLeftResult) : 0,
          biddingEndTime: biddingEndDate.toLocaleString(),
          revealEndTime: revealEndDate.toLocaleString(),
          blockchainTime: blockchainDate.toLocaleString()
        });
      } catch (error: any) {
        console.error("详细错误信息:", error);
        setError(`无法加载拍卖详情: ${error instanceof Error ? error.message : "未知错误"}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadAuctionDetails();
  }, [auctionAddress, factoryContractData, blindAuctionData, publicClient]);

  // 获取倒计时信息
  const getCountdownText = () => {
    if (!auctionData) return "";

    const now = BigInt(Math.floor(Date.now() / 1000));

    if (auctionData.state === "pending") {
      const remainingTime = Number(auctionData.biddingStart! - now);
      if (remainingTime <= 0) return "竞标即将开始";

      const days = Math.floor(remainingTime / 86400);
      const hours = Math.floor((remainingTime % 86400) / 3600);
      const minutes = Math.floor((remainingTime % 3600) / 60);

      return `竞标开始倒计时: ${days > 0 ? `${days}天 ` : ''}${hours}小时 ${minutes}分钟`;
    } else if (auctionData.state === "bidding") {
      const remainingTime = Number(auctionData.biddingEnd - now);
      if (remainingTime <= 0) return "竞标已结束";

      const days = Math.floor(remainingTime / 86400);
      const hours = Math.floor((remainingTime % 86400) / 3600);
      const minutes = Math.floor((remainingTime % 3600) / 60);

      return `竞标结束: ${days > 0 ? `${days}天 ` : ''}${hours}小时 ${minutes}分钟`;
    } else if (auctionData.state === "revealing") {
      const remainingTime = Number(auctionData.revealEnd - now);
      if (remainingTime <= 0) return "揭示已结束";

      const days = Math.floor(remainingTime / 86400);
      const hours = Math.floor((remainingTime % 86400) / 3600);
      const minutes = Math.floor((remainingTime % 3600) / 60);

      return `揭示结束: ${days > 0 ? `${days}天 ` : ''}${hours}小时 ${minutes}分钟`;
    } else {
      return "拍卖已结束";
    }
  };

  // 处理结束拍卖
  const handleEndAuction = async () => {
    notification.info("结束拍卖功能正在开发中");
  };

  return (
    <>
      <MetaHeader
        title="拍卖详情 | 区块链盲拍平台"
        description="查看拍卖详情和参与竞拍"
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

        <div className="relative z-10 flex flex-col items-center pt-10 pb-20 px-5 sm:px-0 lg:px-5 xl:px-0">
          <div className="max-w-5xl w-full bg-slate-900/70 backdrop-blur-md rounded-xl border border-slate-700/60 shadow-[0_0_25px_rgba(59,130,246,0.15)] p-8 relative overflow-hidden">
            {/* 装饰光效 */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"></div>
            <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-blue-500/30 via-transparent to-transparent"></div>

            {isLoading ? (
              <div className="flex flex-col justify-center items-center py-24">
                <div className="w-24 h-24 relative mb-8">
                  <div className="w-24 h-24 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }}></div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" style={{ animationDuration: "1s" }}></div>
                  </div>

                  {/* 闪烁的星光 */}
                  <div className="absolute top-1 right-3 w-2 h-2 bg-white rounded-full animate-ping" style={{ animationDuration: "1.5s" }}></div>
                  <div className="absolute bottom-3 left-2 w-1 h-1 bg-blue-400 rounded-full animate-ping" style={{ animationDuration: "2s" }}></div>
                  <div className="absolute top-5 left-2 w-1.5 h-1.5 bg-purple-400 rounded-full animate-ping" style={{ animationDuration: "2.5s" }}></div>
                </div>

                <div className="text-center">
                  <h3 className="text-xl font-semibold mb-2 text-white">拍卖信息加载中</h3>
                  <p className="text-slate-300 max-w-md mx-auto mb-6">请稍等片刻，正在从区块链获取拍卖详情...</p>
                  <div className="inline-block h-1.5 w-32 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 rounded-full overflow-hidden">
                    <div className="h-full w-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-shimmer"></div>
                  </div>
                </div>
              </div>
            ) : error ? (
              <div className="text-center py-16 relative overflow-hidden">
                {/* 错误页面背景效果 */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute top-0 -left-20 w-40 h-40 bg-red-600 rounded-full filter blur-[50px]"></div>
                  <div className="absolute bottom-0 -right-20 w-40 h-40 bg-orange-600 rounded-full filter blur-[50px]"></div>
                </div>

                <div className="relative">
                  <div className="inline-block p-6 rounded-full bg-red-500/10 mb-6 relative">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="absolute inset-0 rounded-full border border-red-500/20 animate-pulse"></div>
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-white">出现错误</h3>
                  <p className="text-red-300 mb-8 max-w-md mx-auto">{error}</p>
                  <Link href="/all-auctions" className="btn bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 border-0 text-white shadow-lg">
                    返回拍卖列表
                  </Link>
                </div>
              </div>
            ) : auctionData && auctionData.state === "ended" ? (
              // 如果拍卖已结束，则显示结果页面
              <div className="text-center py-16 relative overflow-hidden">
                {/* 装饰背景 */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute top-0 -left-20 w-40 h-40 bg-green-600 rounded-full filter blur-[50px]"></div>
                  <div className="absolute bottom-0 -right-20 w-40 h-40 bg-cyan-600 rounded-full filter blur-[50px]"></div>
                </div>

                <div className="relative">
                  <div className="inline-block p-6 rounded-full bg-green-500/10 mb-6 relative">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="absolute inset-0 rounded-full border border-green-500/20 animate-pulse"></div>
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-white">拍卖已结束</h3>
                  <p className="text-slate-300 mb-8 max-w-md mx-auto">此拍卖已经结束，您可以查看最终的拍卖结果与中标信息</p>
                  <Link
                    href={`/results?address=${auctionAddress}`}
                    className="btn btn-lg bg-gradient-to-r from-green-600 to-cyan-600 hover:from-green-500 hover:to-cyan-500 text-white border-0 shadow-lg relative overflow-hidden group"
                  >
                    <span className="relative z-10">查看拍卖结果</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-green-400/0 via-green-400/30 to-cyan-400/0 opacity-0 group-hover:opacity-100 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-all duration-1000"></div>
                  </Link>
                </div>
              </div>
            ) : auctionData ? (
              <>
                <div className="flex flex-col lg:flex-row gap-8">
                  <div className="lg:w-1/2">
                    <div className="relative aspect-square bg-base-200 rounded-xl overflow-hidden">
                      {auctionData.metadata.image ? (
                        <img
                          src={auctionData.metadata.image}
                          alt={auctionData.metadata.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full text-gray-400">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex justify-between items-center">
                      <div
                        className={`badge ${auctionData.state === "pending" ? "badge-info" :
                          auctionData.state === "bidding" ? "badge-primary" :
                            auctionData.state === "revealing" ? "badge-secondary" :
                              "badge-accent"
                          }`}
                      >
                        {auctionData.state === "pending" ? "未开始" :
                          auctionData.state === "bidding" ? "竞拍中" :
                            auctionData.state === "revealing" ? "揭示中" :
                              "已结束"}
                      </div>
                      <div className="text-sm opacity-70">
                        {getCountdownText()}
                      </div>
                    </div>
                  </div>

                  <div className="lg:w-1/2">
                    <h1 className="text-3xl font-bold mb-4">{auctionData.metadata.name}</h1>

                    <div className="mb-6">
                      <p className="text-base-content/80">{auctionData.metadata.description}</p>
                    </div>

                    <div className="divider"></div>

                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="text-base-content/70">拍卖合约地址:</span>
                        <Address address={auctionAddress} size="sm" />
                      </div>

                      <div className="flex justify-between">
                        <span className="text-base-content/70">创建者:</span>
                        <Address address={auctionData.beneficiary} size="sm" />
                      </div>

                      <div className="flex justify-between">
                        <span className="text-base-content/70">最低价格:</span>
                        <span className="font-semibold">{formatEther(BigInt(auctionData.metadata.minPrice))} ETH</span>
                      </div>

                      {auctionData.state === "ended" && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-base-content/70">最高出价:</span>
                            <span className="font-semibold">{formatEther(auctionData.highestBid)} ETH</span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-base-content/70">中标者:</span>
                            <Address address={auctionData.highestBidder} size="sm" />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="divider"></div>

                    <div className="flex flex-col gap-4">
                      {auctionData.state === "pending" && (
                        <div className="alert alert-info">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-info shrink-0 w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                          </svg>
                          <span>拍卖尚未开始，请等待竞拍开始时间到达后再参与</span>
                        </div>
                      )}

                      {auctionData.state === "pending" && (
                        <button
                          className="btn btn-disabled btn-block"
                          disabled
                        >
                          拍卖未开始
                        </button>
                      )}

                      {auctionData.state === "bidding" && (
                        <Link
                          href={`/bid?address=${auctionAddress}`}
                          className="btn btn-primary btn-block bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 glow-on-hover"
                        >
                          参与竞拍
                        </Link>
                      )}

                      {auctionData.state === "revealing" && (
                        <Link
                          href={`/reveal?address=${auctionAddress}`}
                          className="btn btn-secondary btn-block bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white border-0 glow-on-hover"
                        >
                          揭示出价
                        </Link>
                      )}

                      {auctionData.state === "ended" && (
                        <button
                          className="btn btn-accent btn-block"
                          disabled
                        >
                          拍卖已结束
                        </button>
                      )}

                      {address && address === auctionData.beneficiary && auctionData.state === "ended" && !auctionData.ended && (
                        <button
                          className="btn btn-neutral btn-block"
                          onClick={handleEndAuction}
                        >
                          结束拍卖并收取资金
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between mt-8">
                  <Link href="/all-auctions" className="btn btn-outline">
                    返回拍卖列表
                  </Link>
                </div>

                <div className="text-center mb-8">
                  <h1 className="text-4xl font-bold text-white mb-4">{auctionData.metadata.name}</h1>

                  {/* 状态和时间显示 */}
                  <div className="flex flex-wrap justify-center gap-4 mb-4">
                    <div className={`badge badge-lg ${auctionData.state === "pending" ? 'badge-info' :
                        auctionData.state === "bidding" ? 'badge-primary' :
                          auctionData.state === "revealing" ? 'badge-secondary' :
                            'badge-accent'
                      }`}>
                      {auctionData.state === "pending" ? '未开始' :
                        auctionData.state === "bidding" ? '竞拍中' :
                          auctionData.state === "revealing" ? '揭示中' :
                            '已结束'}
                    </div>
                  </div>

                  {/* 区块链时间信息 */}
                  <div className="bg-slate-800/50 p-3 rounded-lg inline-block text-xs text-slate-300 mb-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-2">
                      <div><span className="font-medium text-blue-400">区块链时间:</span> {auctionData.blockchainTime || '未知'}</div>
                      <div><span className="font-medium text-green-400">竞拍结束:</span> {auctionData.biddingEndTime || '未知'}</div>
                      <div><span className="font-medium text-yellow-400">揭示结束:</span> {auctionData.revealEndTime || '未知'}</div>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
};

export default AuctionDetail; 