"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePublicClient } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { MetaHeader } from "~~/components/MetaHeader";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { formatEther } from 'viem';
import { useAccount } from "wagmi";
import SimpleImageShowcase3D from "~~/components/SimpleImageShowcase3D";

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
  const { address: connectedAddress } = useAccount();
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<AuctionState | "all">("all");
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12); // 每页显示12个拍卖
  const [previewAuction, setPreviewAuction] = useState<Auction | null>(null); // 添加预览状态
  const [showImageShowcase, setShowImageShowcase] = useState(false); // 3D图片展示状态

  // 获取合约信息
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { data: blindAuctionData } = useDeployedContractInfo("BlindAuction");
  const { data: nftContractData } = useDeployedContractInfo("AuctionNFT");
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });

  // 加载拍卖列表
  useEffect(() => {
    const loadAuctions = async () => {
      if (!factoryContractData || !blindAuctionData || !nftContractData || !publicClient) return;

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

        // 直接从链上获取所有拍卖数据，不使用缓存
        console.log(`开始从链上获取${auctionAddresses.length}个拍卖的详细信息`);

        // 批量获取拍卖数据
        let fetchedAuctionsData: (Auction | null)[] = [];
        let errorCount = 0;

        // 动态确定批处理大小
        let batchSize = 3;
        let batchDelay = 2000;

        if (auctionAddresses.length > 20) {
          batchSize = 2;
          batchDelay = 3000;
        } else if (auctionAddresses.length <= 10) {
          batchSize = 5;
          batchDelay = 1500;
        }

        // 将地址分成小批次
        const batches = [];
        for (let i = 0; i < auctionAddresses.length; i += batchSize) {
          batches.push(auctionAddresses.slice(i, i + batchSize));
        }

        console.log(`将${auctionAddresses.length}个拍卖地址分成${batches.length}批获取，每批${batchSize}个，间隔${batchDelay / 1000}秒`);

        // 按批次处理
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];

          if (batchIndex > 0) {
            const adjustedDelay = errorCount > 3 ? batchDelay * 2 : batchDelay;
            console.log(`等待${adjustedDelay / 1000}秒后处理下一批`);
            await new Promise(resolve => setTimeout(resolve, adjustedDelay));
          }

          console.log(`处理第${batchIndex + 1}批，包含${batch.length}个拍卖地址`);

          try {
            const batchResults = await Promise.all(
              batch.map(async (address) => {
                try {
                  return await fetchAuctionWithRetry(address, publicClient, blindAuctionData, factoryContractData, nftContractData);
                } catch (error) {
                  errorCount++;
                  console.error(`获取拍卖 ${address} 时发生错误:`, error);
                  return null;
                }
              })
            );

            fetchedAuctionsData = [...fetchedAuctionsData, ...batchResults];

            const batchErrorCount = batchResults.filter(result => result === null).length;
            if (batchErrorCount > 0) {
              errorCount += batchErrorCount;
              console.warn(`本批次有${batchErrorCount}个拍卖获取失败，总失败数: ${errorCount}`);
            }
          } catch (batchError) {
            console.error(`处理批次${batchIndex + 1}时发生错误:`, batchError);
            errorCount += batch.length;
          }
        }

        // 合并缓存和新获取的拍卖数据
        const allAuctions = fetchedAuctionsData.filter(Boolean) as Auction[];

        console.log(`拍卖加载完成: 总共${allAuctions.length}个，其中${fetchedAuctionsData.filter(Boolean).length}个来自链上`);
        if (errorCount > 0) {
          console.warn(`共有${errorCount}个拍卖加载失败`);
          notification.warning(`有${errorCount}个拍卖加载失败，显示不完整`);
        }

        setAuctions(allAuctions);
      } catch (error) {
        console.error("加载拍卖列表失败:", error);
        notification.error("加载拍卖列表失败，请刷新页面重试");
      } finally {
        setLoading(false);
      }
    };

    loadAuctions();
  }, [factoryContractData, blindAuctionData, publicClient, nftContractData]);

  // 带重试功能的获取拍卖信息函数
  const fetchAuctionWithRetry = async (
    address: `0x${string}`,
    publicClient: any,
    blindAuctionData: any,
    factoryContractData: any,
    nftContractData: any,
    maxRetries = 5
  ): Promise<Auction | null> => {
    let retries = 0;

    while (retries < maxRetries) {
      try {
        if (retries > 0) {
          const waitTime = Math.pow(2, retries) * 1000;
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
          const isNFTAuction = await publicClient.readContract({
            address,
            abi: blindAuctionData.abi,
            functionName: 'isNFTAuction',
          }) as boolean;

          if (isNFTAuction) {
            const nftTokenId = await publicClient.readContract({
              address,
              abi: blindAuctionData.abi,
              functionName: 'nftTokenId',
            }) as bigint;

            const nftContractAddress = await publicClient.readContract({
              address,
              abi: blindAuctionData.abi,
              functionName: 'nftContract',
            }) as `0x${string}`;

            if (nftContractAddress && nftTokenId > 0n) {
              try {
                if (nftContractData) {
                  const nftMetadata = await publicClient.readContract({
                    address: nftContractAddress,
                    abi: nftContractData.abi,
                    functionName: 'nftMetadata',
                    args: [nftTokenId],
                  }) as readonly [string, string, string, bigint, `0x${string}`, boolean, `0x${string}`, bigint];

                  const [name, description, imageHash, minPriceWei] = nftMetadata;

                  let imageUrl = "";
                  if (imageHash) {
                    if (imageHash.startsWith('http')) {
                      imageUrl = imageHash;
                    } else {
                      imageUrl = `https://ipfs.io/ipfs/${imageHash}`;
                    }
                  }

                  const minPriceValue = minPriceWei ? (Number(minPriceWei) / 10 ** 18).toString() : "0";

                  metadata = {
                    name: name || `NFT #${Number(nftTokenId)}`,
                    description: description || "无描述",
                    image: imageUrl,
                    minPrice: minPriceValue,
                  };
                }
              } catch (nftError) {
                console.warn("从NFT合约获取元数据失败，尝试从事件获取:", nftError);
              }
            }
          }

          if (metadata.name === "未命名拍卖") {
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
                  const parsedMetadata = JSON.parse(metadataStr);

                  let imageUrl = "";
                  if (parsedMetadata.image || parsedMetadata.imageHash) {
                    const imageData = parsedMetadata.image || parsedMetadata.imageHash;
                    if (imageData.startsWith('http')) {
                      imageUrl = imageData;
                    } else {
                      imageUrl = `https://ipfs.io/ipfs/${imageData}`;
                    }
                  }

                  metadata = {
                    name: parsedMetadata.name || "未命名拍卖",
                    description: parsedMetadata.description || "无描述",
                    image: imageUrl,
                    minPrice: parsedMetadata.minPrice || "0",
                  };
                } catch (e) {
                  console.error("解析元数据字符串失败:", e);
                }
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
          state = "ended";
        } else if (now > biddingEnd) {
          state = "revealing";
        } else if (now < biddingStart) {
          state = "pending";
        } else {
          state = "bidding";
        }

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

        return auctionData;
      } catch (error: any) {
        const is429Error = error.message && (
          error.message.includes("status code 429") ||
          error.message.includes("Too Many Requests") ||
          error.message.includes("HTTP request failed") ||
          error.message.includes("exceeds the rate limit") ||
          error.message.includes("server error")
        );

        retries++;

        if (retries < maxRetries) {
          const waitTime = Math.pow(2, retries) * 1000;
          console.warn(`获取拍卖 ${address} 信息失败, 将在${waitTime}毫秒后重试(${retries}/${maxRetries})`);
          continue;
        }

        console.error(`获取拍卖 ${address} 信息失败，已达到最大重试次数:`, error);
        return null;
      }
    }

    return null;
  };

  // 强制刷新函数
  const handleForceRefresh = () => {
    window.location.reload();
  };

  // 过滤和搜索逻辑
  const filteredAuctions = auctions
    .filter(auction => filter === "all" || auction.state === filter)
    .filter(auction =>
      searchTerm === "" ||
      auction.metadata.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      auction.metadata.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

  // 分页逻辑
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentAuctions = filteredAuctions.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.max(1, Math.ceil(filteredAuctions.length / itemsPerPage)); // 确保至少有1页

  // 分页跳转函数
  const paginate = (pageNumber: number) => {
    if (pageNumber < 1) pageNumber = 1;
    if (pageNumber > totalPages) pageNumber = totalPages;
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 获取状态文本
  const getFilterStatusText = () => {
    switch (filter) {
      case 'pending': return '未开始的拍卖';
      case 'bidding': return '竞拍中的拍卖';
      case 'revealing': return '揭示中的拍卖';
      case 'ended': return '已结束的拍卖';
      default: return '所有拍卖';
    }
  };

  // 获取状态样式
  const getStateStyle = (state: AuctionState) => {
    switch (state) {
      case "pending":
        return "bg-blue-500 text-white";
      case "bidding":
        return "bg-green-500 text-white";
      case "revealing":
        return "bg-yellow-500 text-black";
      case "ended":
        return "bg-red-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  // 获取状态文本
  const getStateText = (state: AuctionState) => {
    switch (state) {
      case "pending": return "未开始";
      case "bidding": return "竞拍中";
      case "revealing": return "揭示中";
      case "ended": return "已结束";
      default: return "未知";
    }
  };

  // 安全的关闭预览函数
  const closePreview = () => {
    setPreviewAuction(null);
    setShowImageShowcase(false);
  };

  // 安全的打开预览函数
  const openPreview = (auction: Auction) => {
    setPreviewAuction(auction);
  };

  // 键盘事件处理 - ESC键关闭模态框
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (previewAuction || showImageShowcase)) {
        closePreview();
      }
    };

    if (previewAuction || showImageShowcase) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [previewAuction, showImageShowcase]);

  return (
    <>
      <MetaHeader
        title="所有拍卖 | 区块链盲拍平台"
        description="浏览所有可参与的盲拍拍卖"
      />

      {/* 主容器 - 保持原有紫黑主题背景 */}
      <div className="min-h-screen bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
        {/* 背景装饰 */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 -left-40 w-96 h-96 bg-purple-700 rounded-full filter blur-[120px] animate-pulse"></div>
          <div className="absolute bottom-0 -right-40 w-96 h-96 bg-indigo-700 rounded-full filter blur-[120px] animate-pulse delay-1000"></div>
        </div>

        {/* 网格背景 */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(102,0,255,0.05)_1.5px,transparent_1.5px),linear-gradient(90deg,rgba(102,0,255,0.05)_1.5px,transparent_1.5px)] bg-[size:30px_30px]"></div>

        {/* 主要内容 */}
        <div className="relative z-10 container mx-auto px-4 py-8">
          {/* 头部区域 */}
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-white mb-4 glow-text neon-text">
              所有拍卖
            </h1>
            <div className="mt-6 flex justify-center">
              <div className="h-1 w-32 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-full relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full blur-sm"></div>
              </div>
            </div>
            <p className="text-purple-300/70 text-lg mt-6">
              发现和参与区块链上的精彩拍卖活动
            </p>
          </div>

          {/* 搜索和过滤区域 */}
          <div className="bg-purple-900/20 backdrop-blur-md border border-purple-700/30 rounded-2xl p-6 mb-8">
            <div className="flex flex-col lg:flex-row gap-4 mb-4">
              {/* 搜索框 */}
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="搜索拍卖名称或描述..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-12 py-3 bg-purple-800/30 border border-purple-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-white placeholder-purple-300/50"
                />
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 absolute left-4 top-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* 过滤按钮 */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setFilter("all");
                    setCurrentPage(1);
                  }}
                  className={`px-6 py-3 rounded-xl font-medium transition-all ${filter === "all"
                    ? "bg-purple-600 text-white shadow-lg scale-105"
                    : "bg-purple-800/30 text-purple-300 hover:bg-purple-600/20 hover:text-white border border-purple-600/30"
                    }`}
                >
                  全部
                </button>

                <button
                  onClick={() => {
                    setFilter("pending");
                    setCurrentPage(1);
                  }}
                  className={`px-6 py-3 rounded-xl font-medium transition-all ${filter === "pending"
                    ? "bg-blue-600 text-white shadow-lg scale-105"
                    : "bg-purple-800/30 text-purple-300 hover:bg-blue-600/20 hover:text-white border border-purple-600/30"
                    }`}
                >
                  未开始
                </button>

                <button
                  onClick={() => {
                    setFilter("bidding");
                    setCurrentPage(1);
                  }}
                  className={`px-6 py-3 rounded-xl font-medium transition-all ${filter === "bidding"
                    ? "bg-green-600 text-white shadow-lg scale-105"
                    : "bg-purple-800/30 text-purple-300 hover:bg-green-600/20 hover:text-white border border-purple-600/30"
                    }`}
                >
                  竞拍中
                </button>

                <button
                  onClick={() => {
                    setFilter("revealing");
                    setCurrentPage(1);
                  }}
                  className={`px-6 py-3 rounded-xl font-medium transition-all ${filter === "revealing"
                    ? "bg-yellow-500 text-black shadow-lg scale-105"
                    : "bg-purple-800/30 text-purple-300 hover:bg-yellow-500/20 hover:text-white border border-purple-600/30"
                    }`}
                >
                  揭示中
                </button>

                <button
                  onClick={() => {
                    setFilter("ended");
                    setCurrentPage(1);
                  }}
                  className={`px-6 py-3 rounded-xl font-medium transition-all ${filter === "ended"
                    ? "bg-red-600 text-white shadow-lg scale-105"
                    : "bg-purple-800/30 text-purple-300 hover:bg-red-600/20 hover:text-white border border-purple-600/30"
                    }`}
                >
                  已结束
                </button>
              </div>
            </div>

            {/* 状态栏 */}
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {getFilterStatusText()}
                </h2>
                {!loading && (
                  <p className="text-purple-300/70">
                    共 {filteredAuctions.length} 个拍卖{filter !== 'all' ? `（总共 ${auctions.length} 个）` : ''}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 拍卖列表 */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-500 mb-6"></div>
              <p className="text-purple-300/70 text-lg">正在加载拍卖列表...</p>
            </div>
          ) : currentAuctions.length > 0 ? (
            <>
              {/* 拍卖网格 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {currentAuctions.map((auction) => (
                  <div
                    key={auction.address}
                    onClick={() => openPreview(auction)}
                    className="group bg-gradient-to-br from-purple-900/40 via-purple-800/30 to-indigo-900/40 backdrop-blur-md rounded-2xl border border-purple-600/30 shadow-lg hover:shadow-purple-500/20 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 cursor-pointer overflow-hidden relative"
                  >
                    {/* 鼠标悬停遮罩 */}
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 to-purple-500/0 group-hover:from-purple-500/10 group-hover:to-pink-500/10 transition-all duration-300 rounded-2xl"></div>

                    {/* 图片区域 */}
                    <div className="relative h-48 overflow-hidden rounded-t-2xl bg-purple-800/20">
                      {auction.metadata.image ? (
                        <img
                          src={auction.metadata.image}
                          alt={auction.metadata.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-purple-400/50">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}

                      {/* 状态标签 */}
                      <div className={`absolute top-3 right-3 px-2 py-1 rounded-md text-xs font-semibold backdrop-blur-sm ${getStateStyle(auction.state)}`}>
                        {getStateText(auction.state)}
                      </div>
                    </div>

                    {/* 信息区域 */}
                    <div className="p-5">
                      <h3 className="text-lg font-bold text-white mb-2 truncate group-hover:text-purple-400 transition-colors">
                        {auction.metadata.name || "未命名拍卖"}
                      </h3>

                      <p className="text-purple-300/70 text-sm mb-3 line-clamp-2 h-10">
                        {auction.metadata.description || "无描述"}
                      </p>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-purple-400">最低出价</span>
                          <span className="text-white font-semibold">
                            {typeof auction.metadata.minPrice === 'string' && auction.metadata.minPrice.includes('.')
                              ? `${auction.metadata.minPrice} ETH`
                              : `${formatEther(BigInt(auction.metadata.minPrice || '0'))} ETH`}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-sm">
                          <span className="text-purple-400">创建者</span>
                          <Address address={auction.beneficiary} format="short" />
                        </div>

                        <div className="flex justify-between items-center text-xs text-purple-300/60">
                          <span>结束时间</span>
                          <span>
                            {auction.state === "pending" ? "未开始" :
                              auction.state === "bidding" ? new Date(Number(auction.biddingEnd) * 1000).toLocaleDateString() :
                                auction.state === "revealing" ? new Date(Number(auction.revealEnd) * 1000).toLocaleDateString() :
                                  "已结束"}
                          </span>
                        </div>
                      </div>

                      {/* 查看详情提示 */}
                      <div className="mt-4 pt-3 border-t border-purple-700/30">
                        <div className="w-full py-2 text-center text-purple-300 group-hover:text-white transition-colors font-medium">
                          点击查看详情 →
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 分页组件 - 简化为一行 */}
              <div className="mt-12 flex justify-center items-center">
                <div className="inline-flex items-center gap-3 px-6 py-3 bg-purple-900/40 backdrop-blur-xl border border-purple-600/30 rounded-2xl shadow-lg shadow-purple-900/20">
                  {/* 首页按钮 */}
                  <button
                    onClick={() => paginate(1)}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 px-3 py-1.5 text-purple-200 hover:text-white hover:bg-purple-700/60 rounded-lg font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-purple-200 disabled:hover:bg-transparent"
                    title="首页"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                    <span className="text-sm">首页</span>
                  </button>

                  {/* 上一页按钮 */}
                  <button
                    onClick={() => paginate(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 px-3 py-1.5 text-purple-200 hover:text-white hover:bg-purple-700/60 rounded-lg font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-purple-200 disabled:hover:bg-transparent"
                    title="上一页"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="text-sm">上一页</span>
                  </button>

                  {/* 页数信息 */}
                  <div className="px-4 py-1.5">
                    <span className="text-purple-300 text-sm">
                      第 <span className="text-purple-200 font-semibold">{currentPage}</span> 页，共 <span className="text-purple-200 font-semibold">{totalPages}</span> 页
                    </span>
                  </div>

                  {/* 下一页按钮 */}
                  <button
                    onClick={() => paginate(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1 px-3 py-1.5 text-purple-200 hover:text-white hover:bg-purple-700/60 rounded-lg font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-purple-200 disabled:hover:bg-transparent"
                    title="下一页"
                  >
                    <span className="text-sm">下一页</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* 末页按钮 */}
                  <button
                    onClick={() => paginate(totalPages)}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1 px-3 py-1.5 text-purple-200 hover:text-white hover:bg-purple-700/60 rounded-lg font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-purple-200 disabled:hover:bg-transparent"
                    title="末页"
                  >
                    <span className="text-sm">末页</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* 空状态 */}
              <div className="text-center py-20">
                <div className="text-6xl mb-4 opacity-50">📭</div>
                <h3 className="text-xl font-semibold text-purple-200 mb-2">
                  未找到拍卖
                </h3>
                <p className="text-purple-300/70">
                  {searchTerm
                    ? `没有找到匹配"${searchTerm}"的拍卖`
                    : `当前没有${filter !== "all" ? getFilterStatusText().replace('的拍卖', '') : ''}拍卖`}
                </p>
              </div>

              {/* 空状态下也显示分页组件 */}
              <div className="mt-12 flex justify-center items-center">
                <div className="inline-flex items-center gap-3 px-6 py-3 bg-purple-900/40 backdrop-blur-xl border border-purple-600/30 rounded-2xl shadow-lg shadow-purple-900/20">
                  {/* 首页按钮 */}
                  <button
                    onClick={() => paginate(1)}
                    disabled={true}
                    className="flex items-center gap-1 px-3 py-1.5 text-purple-200 rounded-lg font-medium border border-purple-600/30 shadow-lg shadow-purple-900/20 opacity-40 cursor-not-allowed overflow-hidden"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                    <span className="text-sm">首页</span>
                  </button>

                  {/* 上一页按钮 */}
                  <button
                    disabled={true}
                    className="flex items-center gap-1 px-3 py-1.5 text-purple-200 rounded-lg font-medium border border-purple-600/30 shadow-lg shadow-purple-900/20 opacity-40 cursor-not-allowed overflow-hidden"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="text-sm">上一页</span>
                  </button>

                  {/* 页数信息 */}
                  <div className="px-4 py-1.5">
                    <span className="text-purple-300 text-sm">
                      第 <span className="text-purple-200 font-semibold">1</span> 页，共 <span className="text-purple-200 font-semibold">1</span> 页
                    </span>
                  </div>

                  {/* 下一页按钮 */}
                  <button
                    disabled={true}
                    className="flex items-center gap-1 px-3 py-1.5 text-purple-200 rounded-lg font-medium border border-purple-600/30 shadow-lg shadow-purple-900/20 opacity-40 cursor-not-allowed overflow-hidden"
                  >
                    <span className="text-sm">下一页</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* 末页按钮 */}
                  <button
                    disabled={true}
                    className="flex items-center gap-1 px-3 py-1.5 text-purple-200 rounded-lg font-medium border border-purple-600/30 shadow-lg shadow-purple-900/20 opacity-40 cursor-not-allowed overflow-hidden"
                  >
                    <span className="text-sm">末页</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 预览模态框 */}
      {previewAuction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div
            className="absolute inset-0"
            onClick={closePreview}
          ></div>
          <div className="relative bg-gradient-to-br from-purple-900/95 via-purple-800/95 to-indigo-900/95 backdrop-blur-xl rounded-2xl border border-purple-500/50 shadow-[0_0_30px_rgba(139,92,246,0.3)] overflow-hidden max-w-4xl w-full max-h-[85vh] z-10">
            {/* 关闭按钮 */}
            <button
              onClick={closePreview}
              className="absolute top-3 right-3 z-30 bg-purple-700/80 hover:bg-purple-600 p-2 rounded-full text-white transition-colors duration-200 transform hover:scale-110"
              aria-label="关闭"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* 状态标签 */}
            <div className={`absolute top-3 left-3 z-20 px-3 py-1.5 rounded-md text-sm font-semibold ${getStateStyle(previewAuction.state)}`}>
              {getStateText(previewAuction.state)}
            </div>

            <div className="flex flex-col md:flex-row h-full">
              {/* 图片区域 */}
              <div className="md:w-1/2 h-[200px] md:h-full relative bg-purple-800/30 overflow-hidden group">
                {previewAuction.metadata.image ? (
                  <div
                    className="relative h-full cursor-pointer"
                    onClick={() => setShowImageShowcase(true)}
                  >
                    <img
                      src={previewAuction.metadata.image}
                      alt={previewAuction.metadata.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {/* 3D展示提示 */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg">
                        <span className="text-slate-800 font-medium text-sm">🎭 点击查看3D展示</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-purple-400/70 bg-gradient-to-br from-purple-900/50 to-indigo-900/50">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* 详情区域 */}
              <div className="md:w-1/2 p-6 flex flex-col justify-between">
                <div>
                  <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-pink-200 mb-4">
                    {previewAuction.metadata.name || "未命名拍卖"}
                  </h2>

                  <div className="space-y-3 mb-6">
                    {/* 拍卖描述 */}
                    <div className="bg-purple-800/30 rounded-lg p-3 backdrop-blur-sm border border-purple-700/50">
                      <h3 className="text-xs text-purple-300 font-medium mb-1">拍卖描述</h3>
                      <p className="text-white text-sm leading-relaxed">
                        {previewAuction.metadata.description || "无描述"}
                      </p>
                    </div>

                    {/* 最低出价和创建者 */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-purple-800/30 rounded-lg p-3 backdrop-blur-sm border border-purple-700/50">
                        <h3 className="text-xs text-purple-300 font-medium mb-1">最低出价</h3>
                        <p className="text-white font-medium">
                          {typeof previewAuction.metadata.minPrice === 'string' && previewAuction.metadata.minPrice.includes('.')
                            ? `${previewAuction.metadata.minPrice} ETH`
                            : `${formatEther(BigInt(previewAuction.metadata.minPrice || '0'))} ETH`}
                        </p>
                      </div>

                      <div className="bg-purple-800/30 rounded-lg p-3 backdrop-blur-sm border border-purple-700/50">
                        <h3 className="text-xs text-purple-300 font-medium mb-1">创建者</h3>
                        <div className="flex items-center">
                          <Address address={previewAuction.beneficiary} format="short" />
                        </div>
                      </div>
                    </div>

                    {/* 时间信息 */}
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

                {/* 查看详情按钮 */}
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

      {/* 3D图片展示模态框 */}
      {showImageShowcase && previewAuction && (
        <SimpleImageShowcase3D
          isOpen={showImageShowcase}
          onClose={() => setShowImageShowcase(false)}
          imageUrl={previewAuction.metadata.image}
          itemName={previewAuction.metadata.name}
          description={previewAuction.metadata.description}
        />
      )}

      {/* CSS动画 */}
      <style jsx global>{`
        @keyframes glow {
          0%, 100% { text-shadow: 0 0 10px rgba(255, 255, 255, 0.8), 0 0 20px rgba(255, 255, 255, 0.5), 0 0 30px rgba(255, 255, 255, 0.3); }
          50% { text-shadow: 0 0 15px rgba(255, 255, 255, 1), 0 0 30px rgba(255, 255, 255, 0.8), 0 0 45px rgba(255, 255, 255, 0.5); }
        }
        .glow-text {
          animation: glow 2s ease-in-out infinite;
        }
        .neon-text {
          text-shadow: 0 0 10px rgba(255, 255, 255, 0.8), 0 0 20px rgba(255, 255, 255, 0.6), 0 0 30px rgba(255, 255, 255, 0.4);
        }
      `}</style>
    </>
  );
};

export default AllAuctions;