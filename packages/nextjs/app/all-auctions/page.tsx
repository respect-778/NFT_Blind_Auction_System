"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePublicClient, useReadContract } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { MetaHeader } from "~~/components/MetaHeader";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { decodeEventLog, formatEther } from 'viem';
import {
  cacheEndedAuction,
  getCachedEndedAuctions,
  shouldRefreshCache,
  clearAllAuctionCache
} from "~~/services/store/auctionCache";

type AuctionState = "pending" | "bidding" | "revealing" | "ended";
type Auction = {
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
  state: AuctionState;
};

const AllAuctions = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<AuctionState | "all">("all");
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(9); // 每页显示9个拍卖
  const [previewAuction, setPreviewAuction] = useState<Auction | null>(null); // 添加预览状态

  // 获取合约信息
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { data: blindAuctionData } = useDeployedContractInfo("BlindAuction");
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });

  // 加载拍卖列表
  useEffect(() => {
    const loadAuctions = async () => {
      if (!factoryContractData || !blindAuctionData || !publicClient) return;

      try {
        setLoading(true);

        // 获取拍卖总数
        const count = await publicClient.readContract({
          address: factoryContractData.address,
          abi: factoryContractData.abi,
          functionName: 'getAuctionCount',
        }) as bigint;

        // 分页获取拍卖地址列表
        const auctionAddresses = await publicClient.readContract({
          address: factoryContractData.address,
          abi: factoryContractData.abi,
          functionName: 'getAuctions',
          args: [BigInt(0), count],
        }) as `0x${string}`[];

        if (!auctionAddresses || auctionAddresses.length === 0) {
          setAuctions([]);
          setLoading(false);
          return;
        }

        // 获取缓存的已结束拍卖
        const cachedAuctions = getCachedEndedAuctions();
        const cachedAuctionsArray: Auction[] = [];
        const addressesToFetch: `0x${string}`[] = [];

        // 检查哪些拍卖可以从缓存中获取，哪些需要从链上获取
        auctionAddresses.forEach(address => {
          const cached = cachedAuctions[address];
          if (cached && cached.state === "ended" && !shouldRefreshCache(cached.cachedAt || 0)) {
            // 使用缓存数据
            cachedAuctionsArray.push({
              address: cached.address,
              metadata: cached.metadata,
              beneficiary: cached.beneficiary,
              biddingEnd: cached.biddingEnd,
              revealEnd: cached.revealEnd,
              state: cached.state
            });
          } else {
            // 需要从链上获取
            addressesToFetch.push(address);
          }
        });

        console.log(`使用缓存: ${cachedAuctionsArray.length}个拍卖, 从链上获取: ${addressesToFetch.length}个拍卖`);

        // 如果有需要从链上获取的拍卖，则执行批量获取
        let fetchedAuctionsData: (Auction | null)[] = [];
        let errorCount = 0;

        if (addressesToFetch.length > 0) {
          // 动态确定批处理大小，根据拍卖数量调整
          // 拍卖数量越多，批次越小，延迟越长
          let batchSize = 3; // 默认批次大小
          let batchDelay = 2000; // 默认批次间隔 (2秒)

          // 根据地址数量动态调整批次大小和延迟
          if (addressesToFetch.length > 20) {
            batchSize = 2;
            batchDelay = 3000; // 拍卖多时增加延迟
          } else if (addressesToFetch.length <= 10) {
            batchSize = 5;
            batchDelay = 1500; // 拍卖少时减少延迟
          }

          // 将地址分成小批次
          const batches = [];
          for (let i = 0; i < addressesToFetch.length; i += batchSize) {
            batches.push(addressesToFetch.slice(i, i + batchSize));
          }

          console.log(`将${addressesToFetch.length}个拍卖地址分成${batches.length}批获取，每批${batchSize}个，间隔${batchDelay / 1000}秒`);

          // 按批次处理，每批次之间间隔一段时间
          for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];

            // 如果不是第一批，等待一会儿再继续
            if (batchIndex > 0) {
              // 如果错误数量增加，加大延迟
              const adjustedDelay = errorCount > 3 ? batchDelay * 2 : batchDelay;
              console.log(`等待${adjustedDelay / 1000}秒后处理下一批${errorCount > 3 ? ' (由于错误增加了延迟)' : ''}`);
              await new Promise(resolve => setTimeout(resolve, adjustedDelay));
            }

            console.log(`处理第${batchIndex + 1}批，包含${batch.length}个拍卖地址`);

            try {
              const batchResults = await Promise.all(
                batch.map(async (address) => {
                  try {
                    return await fetchAuctionWithRetry(address, publicClient, blindAuctionData, factoryContractData);
                  } catch (error) {
                    errorCount++;
                    console.error(`获取拍卖 ${address} 时发生未捕获的错误:`, error);
                    return null;
                  }
                })
              );

              fetchedAuctionsData = [...fetchedAuctionsData, ...batchResults];

              // 统计本批次错误数量
              const batchErrorCount = batchResults.filter(result => result === null).length;
              if (batchErrorCount > 0) {
                errorCount += batchErrorCount;
                console.warn(`本批次有${batchErrorCount}个拍卖获取失败，总失败数: ${errorCount}`);
              }
            } catch (batchError) {
              console.error(`处理批次${batchIndex + 1}时发生错误:`, batchError);
              errorCount += batch.length;
              // 批处理失败，但继续处理下一批
            }

            // 如果错误过多，减小批次大小并增加延迟
            if (errorCount > 5 && batchSize > 1) {
              const newBatchSize = batchSize - 1;
              const newDelay = batchDelay + 1000;
              console.warn(`由于错误数量过多(${errorCount})，调整批次大小从${batchSize}到${newBatchSize}，延迟从${batchDelay / 1000}秒到${newDelay / 1000}秒`);
              batchSize = newBatchSize;
              batchDelay = newDelay;

              // 重新计算剩余批次
              const remainingAddresses = addressesToFetch.slice((batchIndex + 1) * batchSize);
              if (remainingAddresses.length > 0) {
                const newBatches = [];
                for (let i = 0; i < remainingAddresses.length; i += batchSize) {
                  newBatches.push(remainingAddresses.slice(i, i + batchSize));
                }

                // 替换剩余的批次
                batches.splice(batchIndex + 1, batches.length - batchIndex - 1, ...newBatches);
                console.log(`重新规划剩余批次，现在共有${batches.length}批，剩余${batches.length - batchIndex - 1}批`);
              }
            }
          }
        }

        // 合并缓存和新获取的拍卖数据
        const allAuctions = [
          ...cachedAuctionsArray,
          ...fetchedAuctionsData.filter(Boolean) as Auction[]
        ];

        // 提示获取结果
        console.log(`拍卖加载完成: 总共${allAuctions.length}个，其中${cachedAuctionsArray.length}个来自缓存，${fetchedAuctionsData.filter(Boolean).length}个来自链上`);
        if (errorCount > 0) {
          console.warn(`共有${errorCount}个拍卖加载失败`);
          notification.warning(`有${errorCount}个拍卖加载失败，显示不完整`);
        }

        // 过滤掉加载失败的拍卖
        setAuctions(allAuctions);
      } catch (error) {
        console.error("加载拍卖列表失败:", error);
        notification.error("加载拍卖列表失败，请刷新页面重试");
      } finally {
        setLoading(false);
      }
    };

    loadAuctions();
  }, [factoryContractData, blindAuctionData, publicClient]);

  // 带重试功能的获取拍卖信息函数
  const fetchAuctionWithRetry = async (
    address: `0x${string}`,
    publicClient: any,
    blindAuctionData: any,
    factoryContractData: any,
    maxRetries = 5
  ): Promise<Auction | null> => {
    let retries = 0;

    while (retries < maxRetries) {
      try {
        // 获取拍卖基本信息
        // 在第一次尝试正常获取，失败后的重试中加入延迟
        if (retries > 0) {
          // 指数退避重试: 2秒, 4秒, 8秒...
          const waitTime = Math.pow(2, retries) * 1000;
          console.log(`重试获取拍卖 ${address} 信息，第${retries}次尝试，等待${waitTime / 1000}秒后执行`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        const [beneficiary, biddingStart, biddingEnd, revealEnd, ended] = await Promise.all([
          publicClient.readContract({
            address,
            abi: blindAuctionData.abi,
            functionName: 'beneficiary',
          }),
          publicClient.readContract({
            address,
            abi: blindAuctionData.abi,
            functionName: 'biddingStart',
          }),
          publicClient.readContract({
            address,
            abi: blindAuctionData.abi,
            functionName: 'biddingEnd',
          }),
          publicClient.readContract({
            address,
            abi: blindAuctionData.abi,
            functionName: 'revealEnd',
          }),
          publicClient.readContract({
            address,
            abi: blindAuctionData.abi,
            functionName: 'ended',
          }),
        ]) as [`0x${string}`, bigint, bigint, bigint, boolean];

        // 成功获取基本信息后，等待一小段时间再获取元数据，避免请求过于密集
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
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
              auctionAddress: address
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
          console.warn("获取拍卖元数据失败，将使用默认值:", error);
        }

        // 确定拍卖状态
        let state: AuctionState = "bidding";
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

        // 如果是已结束拍卖，缓存它
        const auctionData = {
          address,
          metadata,
          beneficiary,
          biddingStart,
          biddingEnd,
          revealEnd,
          state,
          ended
        };

        if (state === "ended") {
          try {
            cacheEndedAuction(auctionData);
          } catch (cacheError) {
            console.error("缓存拍卖数据失败:", cacheError);
            // 缓存失败不影响主流程，继续返回数据
          }
        }

        return auctionData;
      } catch (error: any) {
        // 检查是否是429错误或其他API错误
        const is429Error = error.message && (
          error.message.includes("status code 429") ||
          error.message.includes("Too Many Requests") ||
          error.message.includes("HTTP request failed") ||
          error.message.includes("exceeds the rate limit") ||
          error.message.includes("server error")
        );

        retries++;

        if (retries < maxRetries) {
          // 所有错误都使用指数退避重试策略
          const waitTime = Math.pow(2, retries) * 1000;
          console.warn(`获取拍卖 ${address} 信息失败, 将在${waitTime}毫秒后重试(${retries}/${maxRetries})`,
            is429Error ? "API请求限制错误" : error.message?.slice(0, 100));
          continue;
        }

        console.error(`获取拍卖 ${address} 信息失败，已达到最大重试次数:`, error);
        return null;
      }
    }

    return null;
  };

  // 添加一个强制刷新按钮的处理函数
  const handleForceRefresh = () => {
    // 清除所有缓存
    clearAllAuctionCache();
    // 刷新页面
    window.location.reload();
  };

  // 过滤和搜索逻辑
  const filteredAuctions = auctions
    .filter(auction =>
      filter === "all" || auction.state === filter
    )
    .filter(auction =>
      searchTerm === "" ||
      auction.metadata.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      auction.metadata.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

  // 添加分页逻辑，放在已有过滤逻辑之后
  // 当前页显示的拍卖
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentAuctions = filteredAuctions.slice(indexOfFirstItem, indexOfLastItem);

  // 计算总页数
  const totalPages = Math.ceil(filteredAuctions.length / itemsPerPage);

  // 分页跳转函数
  const paginate = (pageNumber: number) => {
    // 确保页码在有效范围内
    if (pageNumber < 1) pageNumber = 1;
    if (pageNumber > totalPages) pageNumber = totalPages;
    setCurrentPage(pageNumber);
    // 滚动到页面顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 获取当前过滤状态文本
  const getFilterStatusText = () => {
    switch (filter) {
      case 'pending': return '未开始的拍卖';
      case 'bidding': return '竞拍中的拍卖';
      case 'revealing': return '揭示中的拍卖';
      case 'ended': return '已结束的拍卖';
      default: return '所有拍卖';
    }
  };

  // 获取过滤的拍卖数量文本
  const getFilterCountText = () => {
    if (loading) return '';
    return `共 ${filteredAuctions.length} 个拍卖${filter !== 'all' ? `（总共 ${auctions.length} 个）` : ''}`;
  };

  // 添加分页组件
  const Pagination = () => {
    // 如果总页数小于等于1，不显示分页
    if (totalPages <= 1) return null;

    // 计算显示的页码范围
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);

    // 如果结束页码小于5，调整起始页码
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }

    // 生成页码数组
    const pageNumbers = [];
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    return (
      <div className="flex justify-center mt-8">
        <div className="join">
          {/* 上一页按钮 */}
          <button
            onClick={() => paginate(currentPage - 1)}
            disabled={currentPage === 1}
            className="join-item btn bg-purple-900/30 hover:bg-purple-800/50 border border-purple-700/30 text-purple-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* 页码按钮 */}
          {pageNumbers.map(number => (
            <button
              key={number}
              onClick={() => paginate(number)}
              className={`join-item btn ${currentPage === number
                ? 'bg-purple-700 text-white'
                : 'bg-purple-900/30 hover:bg-purple-800/50 border border-purple-700/30 text-purple-300'}`}
            >
              {number}
            </button>
          ))}

          {/* 下一页按钮 */}
          <button
            onClick={() => paginate(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="join-item btn bg-purple-900/30 hover:bg-purple-800/50 border border-purple-700/30 text-purple-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="text-purple-400/70 ml-4 flex items-center text-sm">
          第 {currentPage} 页，共 {totalPages} 页
        </div>
      </div>
    );
  };

  return (
    <>
      <MetaHeader
        title="所有拍卖 | 区块链盲拍平台"
        description="浏览所有可参与的盲拍拍卖"
      />
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
        {/* 动态流光背景 */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 -left-40 w-96 h-96 bg-purple-700 rounded-full filter blur-[120px] animate-pulse"></div>
          <div className="absolute bottom-0 -right-40 w-96 h-96 bg-indigo-700 rounded-full filter blur-[120px] animate-pulse delay-1000"></div>
        </div>

        {/* 高科技网格 */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(102,0,255,0.05)_1.5px,transparent_1.5px),linear-gradient(90deg,rgba(102,0,255,0.05)_1.5px,transparent_1.5px)] bg-[size:30px_30px]"></div>

        {/* 主要内容容器 */}
        <div className="container mx-auto px-4 py-8 relative z-20">
          <div className="relative backdrop-blur-md bg-purple-900/10 border border-purple-700/20 rounded-2xl shadow-[0_0_25px_rgba(128,90,213,0.1)] p-6 mb-10 overflow-hidden">
            <div className="relative z-10 text-center">
              <h1 className="text-5xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-500 neon-text inline-block">
                浏览所有拍卖
              </h1>
              <div className="h-1 w-40 bg-gradient-to-r from-purple-600 via-indigo-500 to-blue-600 mx-auto mt-4 rounded-full"></div>
              <p className="mt-4 text-slate-300 max-w-2xl mx-auto">
                探索所有可用的盲拍拍卖，筛选不同状态的拍卖，并参与您感兴趣的拍卖。
              </p>

              {/* 搜索和筛选区域 */}
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="搜索拍卖名称或描述..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1); // 搜索时重置为第一页
                    }}
                    className="w-full px-4 py-2 bg-purple-900/30 border border-purple-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all pl-10 text-white placeholder-purple-400/50"
                  />
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-3 top-2.5 text-purple-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <div className="flex flex-wrap gap-2 mb-6">
                  <button
                    onClick={() => {
                      setFilter("all");
                      setCurrentPage(1); // 过滤时重置为第一页
                    }}
                    className={`px-4 py-2 rounded-lg transition-all ${filter === "all" ? "bg-purple-600 text-white" : "bg-purple-900/30 border border-purple-700/50 hover:bg-purple-800/40 text-purple-300"}`}
                  >
                    全部
                  </button>
                  <button
                    onClick={() => {
                      setFilter("pending");
                      setCurrentPage(1); // 过滤时重置为第一页
                    }}
                    className={`px-4 py-2 rounded-lg transition-all ${filter === "pending" ? "bg-blue-600 text-white" : "bg-purple-900/30 border border-purple-700/50 hover:bg-purple-800/40 text-purple-300"}`}
                  >
                    未开始
                  </button>
                  <button
                    onClick={() => {
                      setFilter("bidding");
                      setCurrentPage(1); // 过滤时重置为第一页
                    }}
                    className={`px-4 py-2 rounded-lg transition-all ${filter === "bidding" ? "bg-emerald-600 text-white" : "bg-purple-900/30 border border-purple-700/50 hover:bg-purple-800/40 text-purple-300"}`}
                  >
                    竞拍中
                  </button>
                  <button
                    onClick={() => {
                      setFilter("revealing");
                      setCurrentPage(1); // 过滤时重置为第一页
                    }}
                    className={`px-4 py-2 rounded-lg transition-all ${filter === "revealing" ? "bg-amber-600 text-white" : "bg-purple-900/30 border border-purple-700/50 hover:bg-purple-800/40 text-purple-300"}`}
                  >
                    揭示中
                  </button>
                  <button
                    onClick={() => {
                      setFilter("ended");
                      setCurrentPage(1); // 过滤时重置为第一页
                    }}
                    className={`px-4 py-2 rounded-lg transition-all ${filter === "ended" ? "bg-rose-600 text-white" : "bg-purple-900/30 border border-purple-700/50 hover:bg-purple-800/40 text-purple-300"}`}
                  >
                    已结束
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white">
                  {getFilterStatusText()}
                </h2>
                <div className="flex items-center gap-4">
                  <p className="text-purple-300/70">
                    {getFilterCountText()}
                  </p>
                  {/* 强制刷新按钮 */}
                  <button
                    onClick={handleForceRefresh}
                    className="bg-red-600/70 hover:bg-red-600 text-white text-xs px-3 py-1 rounded flex items-center gap-1"
                    title="清除缓存并强制刷新所有数据"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    强制刷新
                  </button>
                </div>
              </div>

              {/* 拍卖列表 */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
                  <p className="text-purple-300/70">加载拍卖列表中...</p>
                </div>
              ) : currentAuctions.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {currentAuctions.map((auction, index) => (
                      <div
                        key={index}
                        className="bg-purple-900/20 backdrop-blur-sm rounded-xl border border-purple-700/30 shadow-md hover:shadow-lg transition-all overflow-hidden hover:-translate-y-1 hover:border-purple-500/50 group cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          setPreviewAuction(auction);
                        }}
                      >
                        <div className="relative h-40 bg-purple-800/30 overflow-hidden">
                          {auction.metadata.image ? (
                            <img
                              src={auction.metadata.image}
                              alt={auction.metadata.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full text-purple-400/50">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                          <div className={`absolute top-2 right-2 px-2 py-1 rounded-md text-xs font-semibold 
                            ${auction.state === "pending" ? "bg-blue-600/80 text-white" :
                              auction.state === "bidding" ? "bg-emerald-600/80 text-white" :
                                auction.state === "revealing" ? "bg-amber-600/80 text-white" :
                                  "bg-rose-600/80 text-white"}`}>
                            {auction.state === "pending" ? "未开始" :
                              auction.state === "bidding" ? "竞拍中" :
                                auction.state === "revealing" ? "揭示中" :
                                  "已结束"}
                          </div>
                        </div>
                        <div className="p-4">
                          <h3 className="text-lg font-semibold text-white mb-2 truncate group-hover:text-purple-400 transition-colors">
                            {auction.metadata.name || "未命名拍卖"}
                          </h3>
                          <p className="text-purple-300/70 text-sm mb-3 line-clamp-2 h-10">
                            {auction.metadata.description || "无描述"}
                          </p>
                          <div className="flex justify-between items-center text-xs text-purple-300/70">
                            <div>
                              创建者：<Address address={auction.beneficiary} format="short" />
                            </div>
                            <div>
                              {auction.state === "pending" ? "拍卖未开始" :
                                auction.state === "bidding" ?
                                  new Date(Number(auction.biddingEnd) * 1000).toLocaleString() :
                                  auction.state === "revealing" ?
                                    new Date(Number(auction.revealEnd) * 1000).toLocaleString() :
                                    "拍卖已结束"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 添加分页组件 */}
                  <Pagination />
                </>
              ) : (
                <div className="bg-purple-900/20 backdrop-blur-sm border border-purple-700/30 rounded-lg p-8 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-purple-400/50 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-purple-200 mb-2">
                    未找到拍卖
                  </h3>
                  <p className="text-purple-300/70">
                    {searchTerm ? `没有找到匹配"${searchTerm}"的拍卖` : `当前没有${filter !== "all" ? (
                      filter === "bidding" ? "竞拍中的" : filter === "revealing" ? "揭示中的" : "已结束的"
                    ) : ""}拍卖`}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 拍卖详情预览模态框 */}
      {previewAuction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <div
            className="absolute inset-0 z-0"
            onClick={() => setPreviewAuction(null)}
          ></div>
          <div className="relative bg-gradient-to-br from-purple-900/95 via-purple-800/95 to-indigo-900/95 backdrop-blur-xl rounded-2xl border border-purple-500/50 shadow-[0_0_30px_rgba(139,92,246,0.3)] overflow-hidden max-w-4xl w-full max-h-[85vh] z-10 animate-scaleIn">
            {/* 关闭按钮 */}
            <button
              onClick={() => setPreviewAuction(null)}
              className="absolute top-3 right-3 z-30 bg-purple-700/80 hover:bg-purple-600 p-2 rounded-full text-white transition-colors duration-200 transform hover:scale-110"
              aria-label="关闭"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* 状态标签 */}
            <div className={`absolute top-3 left-3 z-20 px-3 py-1.5 rounded-md text-sm font-semibold 
              ${previewAuction.state === "pending" ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white" :
                previewAuction.state === "bidding" ? "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white" :
                  previewAuction.state === "revealing" ? "bg-gradient-to-r from-amber-600 to-amber-500 text-white" :
                    "bg-gradient-to-r from-rose-600 to-rose-500 text-white"}`}>
              {previewAuction.state === "pending" ? "未开始" :
                previewAuction.state === "bidding" ? "竞拍中" :
                  previewAuction.state === "revealing" ? "揭示中" :
                    "已结束"}
            </div>

            <div className="flex flex-col md:flex-row h-full">
              {/* 图片区域 - 减小高度 */}
              <div className="md:w-1/2 h-[200px] md:h-full relative bg-purple-800/30 overflow-hidden">
                {previewAuction.metadata.image ? (
                  <div className="relative h-full">
                    <img
                      src={previewAuction.metadata.image}
                      alt={previewAuction.metadata.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-purple-400/70 bg-gradient-to-br from-purple-900/50 to-indigo-900/50">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* 详情区域 - 重新布局内容 */}
              <div className="md:w-1/2 p-6 flex flex-col justify-between">
                <div>
                  <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-pink-200 mb-4">
                    {previewAuction.metadata.name || "未命名拍卖"}
                  </h2>

                  <div className="space-y-3 mb-6">
                    {/* 拍卖描述 - 限制高度 */}
                    <div className="bg-purple-800/30 rounded-lg p-3 backdrop-blur-sm border border-purple-700/50">
                      <h3 className="text-xs text-purple-300 font-medium mb-1">拍卖描述</h3>
                      <p className="text-white text-sm leading-relaxed line-clamp-2">
                        {previewAuction.metadata.description || "无描述"}
                      </p>
                    </div>

                    {/* 最低出价和创建者放在一行 */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-purple-800/30 rounded-lg p-3 backdrop-blur-sm border border-purple-700/50">
                        <h3 className="text-xs text-purple-300 font-medium mb-1">最低出价</h3>
                        <p className="text-white font-medium">
                          {typeof previewAuction.metadata.minPrice === 'string' && previewAuction.metadata.minPrice.includes('.')
                            ? `${previewAuction.metadata.minPrice} ETH`
                            : `${formatEther(BigInt(previewAuction.metadata.minPrice))} ETH`}
                        </p>
                      </div>

                      <div className="bg-purple-800/30 rounded-lg p-3 backdrop-blur-sm border border-purple-700/50">
                        <h3 className="text-xs text-purple-300 font-medium mb-1">创建者</h3>
                        <div className="flex items-center justify-between">
                          <span className="text-white text-sm truncate max-w-[60%]" title={previewAuction.beneficiary}>
                            {`${previewAuction.beneficiary.substring(0, 6)}...${previewAuction.beneficiary.substring(previewAuction.beneficiary.length - 4)}`}
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(previewAuction.beneficiary)
                                .then(() => {
                                  notification.success("地址已复制");
                                })
                                .catch(err => {
                                  console.error("复制失败:", err);
                                  notification.error("复制失败");
                                });
                            }}
                            className="bg-purple-600/70 hover:bg-purple-500/70 p-1 rounded text-white text-xs transition-colors"
                            title="复制地址"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 时间信息 - 紧凑布局 */}
                    <div className="bg-purple-800/30 rounded-lg p-3 backdrop-blur-sm border border-purple-700/50">
                      <h3 className="text-xs text-purple-300 font-medium mb-2">拍卖时间</h3>
                      <div className="grid grid-cols-1 gap-2 text-xs">
                        {!!(previewAuction.biddingStart && previewAuction.biddingStart > 0n) && (
                          <div className="flex justify-between">
                            <span className="text-purple-400">竞拍开始:</span>
                            <span className="text-white">
                              {new Date(Number(previewAuction.biddingStart) * 1000).toLocaleString()}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-purple-400">竞拍截止:</span>
                          <span className="text-white">
                            {new Date(Number(previewAuction.biddingEnd) * 1000).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-purple-400">揭示截止:</span>
                          <span className="text-white">
                            {new Date(Number(previewAuction.revealEnd) * 1000).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 固定在底部的查看详情按钮 */}
                <div className="pt-4 border-t border-purple-700/30">
                  <Link
                    href={`/auction/${previewAuction.address}`}
                    className="w-full block text-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-1"
                  >
                    查看拍卖详情
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AllAuctions;

/* 自定义CSS动画 */
const styles = `
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease forwards;
}

.animate-scaleIn {
  animation: scaleIn 0.3s ease forwards;
}

/* 隐藏滚动条但保留功能 */
.scrollbar-hide {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

.scrollbar-hide::-webkit-scrollbar {
  display: none; /* Chrome, Safari and Opera */
}

/* 限制行数显示 */
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
`;

// 注入CSS样式
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}