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
import MeteorRain from "~~/components/MeteorRain";
import SimpleImageShowcase3D from "../../../components/SimpleImageShowcase3D";

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
};

const AuctionDetail = () => {
  const params = useParams();
  const router = useRouter();
  const { address } = useAccount();
  const auctionAddress = params?.address as `0x${string}`;
  const [auctionData, setAuctionData] = useState<AuctionData | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImageShowcase, setShowImageShowcase] = useState(false);

  // 获取合约信息
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { data: blindAuctionData } = useDeployedContractInfo("BlindAuction");
  const { data: nftContractData } = useDeployedContractInfo("AuctionNFT");
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });

  // 格式化时间
  const formatTime = (timestamp: bigint) => {
    return new Date(Number(timestamp) * 1000).toLocaleString();
  };

  // 加载拍卖详情
  useEffect(() => {
    const loadAuctionDetails = async () => {
      if (!factoryContractData || !blindAuctionData || !publicClient || !auctionAddress) return;

      try {
        setIsLoading(true);

        // 获取拍卖基本信息
        const [endedResult, biddingStartResult, biddingEndResult, revealEndResult] = await Promise.all([
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'ended',
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
        ]);

        const ended = Boolean(endedResult);
        const now = BigInt(Math.floor(Date.now() / 1000));

        let stateText: AuctionState = "pending";
        let actualPhase = 0;

        if (ended) {
          stateText = "ended";
          actualPhase = 3;
        } else if (now > revealEndResult) {
          stateText = "ended";
          actualPhase = 3;
        } else if (now > biddingEndResult) {
          stateText = "revealing";
          actualPhase = 2;
        } else if (now < biddingStartResult) {
          stateText = "pending";
          actualPhase = 0;
        } else {
          stateText = "bidding";
          actualPhase = 1;
        }

        // 获取受益人
        const beneficiaryResult = await publicClient.readContract({
          address: auctionAddress,
          abi: blindAuctionData.abi,
          functionName: 'beneficiary',
        });

        // 尝试获取拍卖元数据
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
            abi: blindAuctionData.abi,
            functionName: 'isNFTAuction',
          }) as boolean;

          console.log(`拍卖 ${auctionAddress} 是否为NFT拍卖:`, isNFTAuction);

          if (isNFTAuction) {
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

            console.log(`NFT Token ID: ${nftTokenId}, NFT合约地址: ${nftContractAddress}`);

            if (nftContractAddress && nftTokenId > 0n) {
              try {
                // 从NFT合约获取元数据
                if (nftContractData) {
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
                    } else {
                      imageUrl = `https://ipfs.io/ipfs/${imageHash}`;
                    }
                  }

                  // 转换价格
                  const minPriceValue = minPriceWei ? (Number(minPriceWei) / 10 ** 18).toString() : "0";

                  metadata = {
                    name: name || `NFT #${Number(nftTokenId)}`,
                    description: description || "无描述",
                    image: imageUrl,
                    minPrice: minPriceValue,
                  };

                  console.log("从NFT合约获取到元数据:", metadata);
                }
              } catch (nftError) {
                console.error("从NFT合约获取元数据失败:", nftError);
              }
            }
          }

          // 如果从NFT合约获取失败或不是NFT拍卖，尝试从事件日志获取
          if (!metadata.name || metadata.name === "未命名拍卖") {
            console.log("尝试从事件日志获取元数据...");
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
                const parsedMetadata = JSON.parse(metadataStr);
                // 处理价格显示
                let minPrice = parsedMetadata.minPrice;
                if (minPrice) {
                  // 如果是字符串且包含小数点，直接使用
                  if (typeof minPrice === 'string' && minPrice.includes('.')) {
                    // 保持原样
                  } else {
                    // 检查是否是整数形式的ETH值
                    const numValue = Number(minPrice);
                    if (!isNaN(numValue) && numValue >= 1) {
                      minPrice = numValue.toString();
                    } else {
                      // 否则将其视为Wei值并转换
                      try {
                        const priceInWei = BigInt(minPrice);
                        const formattedPrice = formatEther(priceInWei);
                        minPrice = parseFloat(formattedPrice).toString();
                      } catch (e) {
                        minPrice = "0";
                      }
                    }
                  }
                }

                  metadata = {
                    ...parsedMetadata,
                  minPrice: minPrice || "0",
                    // 确保图片URL正确格式化
                    image: parsedMetadata.imageHash
                      ? `https://ipfs.io/ipfs/${parsedMetadata.imageHash}`
                      : parsedMetadata.image || ""
                  };
                  console.log("从事件日志获取到元数据:", metadata);
              }
            }
          }
        } catch (e) {
          console.error("获取或解析元数据失败:", e);
        }

        setAuctionData({
          metadata,
          beneficiary: beneficiaryResult as `0x${string}`,
          biddingStart: biddingStartResult,
          biddingEnd: biddingEndResult,
          revealEnd: revealEndResult,
          highestBid: BigInt(0), // 在需要时获取
          highestBidder: '0x0', // 在需要时获取
          ended,
          state: stateText,
          phase: actualPhase,
        });

      } catch (error: any) {
        console.error("详细错误信息:", error);
        setError(`无法加载拍卖详情: ${error instanceof Error ? error.message : "未知错误"}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadAuctionDetails();
  }, [auctionAddress, factoryContractData, blindAuctionData, publicClient, nftContractData]);

  // 更新倒计时
  useEffect(() => {
    if (!auctionData) return;

    const interval = setInterval(() => {
      const now = BigInt(Math.floor(Date.now() / 1000));
      let remaining = 0;
      let newState = auctionData.state;
      let newPhase = auctionData.phase;

      if (auctionData.state === "pending") {
        remaining = Number(auctionData.biddingStart! - now);
        // 如果竞拍开始时间已到，自动更新状态
        if (remaining <= 0 && now >= auctionData.biddingStart!) {
          newState = "bidding";
          newPhase = 1;
        }
      } else if (auctionData.state === "bidding") {
        remaining = Number(auctionData.biddingEnd - now);
        // 如果竞拍结束时间已到，自动更新状态
        if (remaining <= 0 && now >= auctionData.biddingEnd) {
          newState = "revealing";
          newPhase = 2;
        }
      } else if (auctionData.state === "revealing") {
        remaining = Number(auctionData.revealEnd - now);
        // 如果揭示结束时间已到，自动更新状态
        if (remaining <= 0 && now >= auctionData.revealEnd) {
          newState = "ended";
          newPhase = 3;
        }
      }

      // 如果状态发生变化，更新auctionData
      if (newState !== auctionData.state) {
        console.log(`状态自动更新: ${auctionData.state} -> ${newState}`);
        setAuctionData({
          ...auctionData,
          state: newState,
          phase: newPhase
        });
      }

      if (remaining <= 0) {
        setTimeLeft("00:00:00");
        return;
      }

      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;
      setTimeLeft(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [auctionData]);

  const getStatusInfo = () => {
    if (!auctionData) return { text: "加载中", color: "text-slate-400", label: "状态" };

    switch (auctionData.state) {
      case "pending":
        return { text: "未开始", color: "text-blue-400", label: "竞拍开始倒计时" };
      case "bidding":
        return { text: "竞拍中", color: "text-green-400", label: "竞拍剩余时间" };
      case "revealing":
        return { text: "揭示中", color: "text-yellow-400", label: "揭示剩余时间" };
      case "ended":
        return { text: "已结束", color: "text-red-400", label: "拍卖已结束" };
      default:
        return { text: "未知", color: "text-slate-400", label: "状态" };
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (error || !auctionData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
        <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-red-500 shadow-lg max-w-md">
          <div className="text-4xl mb-4 text-red-500">⚠️</div>
          <h3 className="text-xl font-semibold mb-4 text-white">错误</h3>
          <p className="text-slate-300 mb-6">{error || "无法加载拍卖数据"}</p>
          <a href="/all-auctions" className="btn btn-primary">浏览所有拍卖</a>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo();

  // 安全处理最低价格转换
  let minPriceEth = "0";
  try {
    const minPriceValue = auctionData.metadata.minPrice || '0';
    // 如果已经是ETH格式的字符串，直接使用
    if (typeof minPriceValue === 'string' && minPriceValue.includes('.')) {
      minPriceEth = minPriceValue;
    } else {
      // 检查是否是整数形式的ETH值
      const numValue = Number(minPriceValue);
      if (!isNaN(numValue) && numValue >= 1) {
        minPriceEth = numValue.toString();
    } else {
      // 否则从wei转换为ETH
      const priceWei = BigInt(minPriceValue || '0');
      minPriceEth = formatEther(priceWei);
      }
    }
  } catch (error) {
    console.error("转换最低价格失败:", error);
    minPriceEth = "0";
  }

  // 计算进度条宽度
  const calculateProgressWidth = () => {
    const now = Math.floor(Date.now() / 1000);
    const biddingStart = Number(auctionData.biddingStart);
    const biddingEnd = Number(auctionData.biddingEnd);
    const revealEnd = Number(auctionData.revealEnd);

    // 时间线分为4个阶段：开始(0%) -> 竞拍结束(33.33%) -> 揭示结束(66.66%) -> 拍卖完成(100%)

    if (auctionData.phase === 3 || now >= revealEnd) {
      // 已结束 - 进度条到达100%
      return '100%';
    } else if (now < biddingStart) {
      // 未开始 - 进度条为0%
      return '0%';
    } else if (now >= biddingStart && now < biddingEnd) {
      // 竞拍阶段 - 进度条从0%到33.33%
      const biddingDuration = biddingEnd - biddingStart;
      const elapsed = now - biddingStart;
      const biddingProgress = (elapsed / biddingDuration) * 33.33;
      return `${Math.min(biddingProgress, 33.33)}%`;
    } else if (now >= biddingEnd && now < revealEnd) {
      // 揭示阶段 - 进度条从33.33%到66.66%
      const revealDuration = revealEnd - biddingEnd;
      const elapsed = now - biddingEnd;
      const revealProgress = 33.33 + (elapsed / revealDuration) * 33.33;
      return `${Math.min(revealProgress, 66.66)}%`;
    } else {
      // 拍卖结束 - 进度条到达100%
      return '100%';
    }
  };

  return (
    <>
      <MetaHeader
        title={`${auctionData.metadata.name} | 拍卖详情`}
        description={auctionData.metadata.description}
      />
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033] text-white">
        {/* 背景特效 */}
        <div className="absolute inset-0 opacity-50">
          <div className="absolute top-0 -left-40 w-96 h-96 bg-purple-700 rounded-full filter blur-[150px] animate-pulse"></div>
          <div className="absolute bottom-0 -right-40 w-96 h-96 bg-blue-700 rounded-full filter blur-[150px] animate-pulse delay-1000"></div>
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(102,0,255,0.07)_1.5px,transparent_1.5px),linear-gradient(90deg,rgba(102,0,255,0.07)_1.5px,transparent_1.5px)] bg-[size:40px_40px]"></div>
        <MeteorRain count={12} />

        <div className="relative z-10 container mx-auto px-4 py-12">
          {/* 返回按钮 */}
          <div className="mb-8">
            <Link href="/all-auctions" className="text-blue-400 hover:text-blue-300 transition-colors flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              返回所有拍卖
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
            {/* 左侧 - 图片 */}
            <div className="lg:col-span-2">
              <div className="bg-slate-900/50 backdrop-blur-md rounded-2xl p-4 border border-slate-700/50 shadow-2xl shadow-blue-500/10 relative group">
                <div
                  className="relative cursor-pointer"
                  onClick={() => setShowImageShowcase(true)}
                >
                  <img
                    src={auctionData.metadata.image}
                    alt={auctionData.metadata.name}
                    className="w-full h-auto object-cover rounded-xl transition-transform duration-300 group-hover:scale-105"
                  />
                  {/* 3D展示提示 */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg">
                      <span className="text-slate-800 font-medium text-sm">🎭 点击查看3D展示</span>
                    </div>
                  </div>
                </div>
                <div className="absolute inset-0 border-2 border-transparent rounded-2xl group-hover:border-blue-500/50 transition-all pointer-events-none"></div>
                <div className="absolute -top-2 -left-2 w-16 h-16 border-t-2 border-l-2 border-blue-500/50 rounded-tl-2xl"></div>
                <div className="absolute -bottom-2 -right-2 w-16 h-16 border-b-2 border-r-2 border-purple-500/50 rounded-br-2xl"></div>
              </div>
            </div>

            {/* 右侧 - 信息和操作 */}
            <div className="lg:col-span-3">
              <div className="bg-slate-900/50 backdrop-blur-md rounded-2xl p-6 border border-slate-700/50 shadow-2xl shadow-purple-500/10 flex flex-col h-full">
                {/* 状态和倒计时 */}
                <div className="text-center mb-6">
                  <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold mb-3 ${statusInfo.color} bg-white/5`}>
                    {statusInfo.text}
                  </div>
                  <p className="text-slate-400 text-sm">{statusInfo.label}</p>
                  <p className="text-4xl font-mono tracking-widest mt-1">{timeLeft}</p>
                </div>

                <div className="flex-grow space-y-4">
                  <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-2">
                    {auctionData.metadata.name}
                  </h1>
                  <p className="text-slate-300 text-sm leading-relaxed h-20 overflow-y-auto">
                    {auctionData.metadata.description}
                  </p>

                  <div className="pt-4 border-t border-slate-700/50 space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">最低价格:</span>
                      <span className="font-semibold text-green-400">{minPriceEth} ETH</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">创建者:</span>
                      <Address address={auctionData.beneficiary} format="short" />
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">拍卖合约地址:</span>
                      <Address address={auctionAddress} format="short" />
                    </div>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="mt-6 pt-6 border-t border-slate-700/50">
                  {auctionData.phase === 1 && (
                    <button
                      onClick={() => router.push(`/bid?address=${auctionAddress}`)}
                      className="w-full btn btn-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 shadow-lg hover:shadow-blue-500/20 transition-all duration-300 glow-on-hover"
                    >
                      参与竞拍
                    </button>
                  )}
                  {auctionData.phase === 2 && (
                    <button
                      onClick={() => router.push(`/reveal?address=${auctionAddress}`)}
                      className="w-full btn btn-lg bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white border-0 shadow-lg hover:shadow-yellow-500/20 transition-all duration-300 glow-on-hover"
                    >
                      前往揭示
                    </button>
                  )}
                  {auctionData.phase === 3 && (
                    <button
                      onClick={() => router.push(`/results?address=${auctionAddress}`)}
                      className="w-full btn btn-lg bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white border-0 shadow-lg hover:shadow-green-500/20 transition-all duration-300"
                    >
                      查看结果
                    </button>
                  )}
                  {auctionData.phase === 0 && (
                    <button
                      disabled
                      className="w-full btn btn-lg btn-disabled bg-slate-800 text-slate-500"
                    >
                      拍卖未开始
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 时间线 */}
          <div className="mt-12 bg-slate-900/50 backdrop-blur-md rounded-2xl p-6 border border-slate-700/50">
            <h2 className="text-xl font-semibold mb-6 text-center">拍卖时间线</h2>
            <div className="flex justify-between items-center relative">
              {/* 背景线 */}
              <div className="absolute left-0 top-1/2 w-full h-0.5 bg-slate-700 -translate-y-1/2"></div>
              {/* 动态进度条 */}
              <div
                className="absolute left-0 top-1/2 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 -translate-y-1/2 transition-all duration-1000 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                style={{ width: calculateProgressWidth() }}
              ></div>

              <div className="flex flex-col items-center relative z-10">
                <div className={`w-5 h-5 rounded-full transition-all duration-500 ${auctionData.phase >= 0 ? 'bg-blue-500 ring-4 ring-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.7)]' : 'bg-slate-600'}`}></div>
                <p className="mt-2 text-xs text-center">开始</p>
                <p className="text-xs text-slate-400 mt-1">{formatTime(auctionData.biddingStart!)}</p>
              </div>
              <div className="flex flex-col items-center relative z-10">
                <div className={`w-5 h-5 rounded-full transition-all duration-500 ${auctionData.phase >= 2 ? 'bg-green-500 ring-4 ring-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.7)]' : 'bg-slate-600'}`}></div>
                <p className="mt-2 text-xs text-center">竞拍结束</p>
                <p className="text-xs text-slate-400 mt-1">{formatTime(auctionData.biddingEnd)}</p>
              </div>
              <div className="flex flex-col items-center relative z-10">
                <div className={`w-5 h-5 rounded-full transition-all duration-500 ${auctionData.phase >= 3 ? 'bg-yellow-500 ring-4 ring-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.7)]' : 'bg-slate-600'}`}></div>
                <p className="mt-2 text-xs text-center">揭示结束</p>
                <p className="text-xs text-slate-400 mt-1">{formatTime(auctionData.revealEnd)}</p>
              </div>
              <div className="flex flex-col items-center relative z-10">
                <div className={`w-5 h-5 rounded-full transition-all duration-500 ${auctionData.phase >= 3 ? 'bg-red-500 ring-4 ring-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.7)]' : 'bg-slate-600'}`}></div>
                <p className="mt-2 text-xs text-center">拍卖完成</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3D图片展示模态框 */}
      {showImageShowcase && auctionData && (
        <SimpleImageShowcase3D
          isOpen={showImageShowcase}
          onClose={() => setShowImageShowcase(false)}
          imageUrl={auctionData.metadata.image}
          itemName={auctionData.metadata.name}
          description={auctionData.metadata.description}
        />
      )}
    </>
  );
};

export default AuctionDetail; 