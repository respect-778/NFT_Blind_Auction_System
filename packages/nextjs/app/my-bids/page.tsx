"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { MetaHeader } from "~~/components/MetaHeader";
import StarryBackground from "~~/components/StarryBackground";
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

// 添加一个健壮的时间格式化函数
const formatTimestamp = (timestamp: number | undefined) => {
  if (!timestamp) return "未知";
  try {
    // 确保timestamp是一个有效的数字
    if (isNaN(timestamp) || timestamp <= 0) {
      console.error("无效的时间戳:", timestamp);
      return "时间格式错误";
    }

    // 确保使用整数秒级时间戳
    const date = new Date(timestamp * 1000);

    // 检查日期是否有效
    if (date.toString() === "Invalid Date") {
      console.error("无效的日期对象:", date);
      return "日期格式错误";
    }

    // 使用更可靠的日期格式化方法
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch (error) {
    console.error("格式化时间出错:", error);
    return "格式化错误";
  }
};

const MyBids = () => {
  const { address } = useAccount();
  const [bidRecords, setBidRecords] = useState<BidRecord[]>([]);
  const [auctionInfos, setAuctionInfos] = useState<{ [key: string]: AuctionInfo }>({});
  const [loading, setLoading] = useState(true);
  // 修改搜索相关状态
  const [searchInput, setSearchInput] = useState(""); // 搜索框输入内容
  const [searchTerm, setSearchTerm] = useState(""); // 实际用于搜索的内容
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;

  // 重置搜索和分页
  const resetSearch = () => {
    setSearchInput("");
    setSearchTerm("");
    setCurrentPage(1);
  };

  // 执行搜索
  const handleSearch = () => {
    setSearchTerm(searchInput);
    setCurrentPage(1); // 搜索时重置到第一页
  };

  // 处理回车键搜索
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // 在搜索时重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // 获取合约信息
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { data: blindAuctionData } = useDeployedContractInfo("BlindAuction");
  const { data: nftContractData } = useDeployedContractInfo("AuctionNFT");
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
        // 从localStorage获取竞拍记录 - 使用标准化的地址格式
        const normalizedAddress = address.toLowerCase();
        const storedBids = localStorage.getItem(`bids_${normalizedAddress}`);
        if (!storedBids) {
          setBidRecords([]);
          setLoading(false);
          return;
        }

        const bids: BidRecord[] = JSON.parse(storedBids);
        // 按时间戳降序排列，最新的记录在前面
        bids.sort((a, b) => b.timestamp - a.timestamp);
        setBidRecords(bids);

        // 获取每个拍卖的详细信息
        if (bids.length > 0 && publicClient && factoryContractData && blindAuctionData && nftContractData) {
          const uniqueAddresses = [...new Set(bids.map(bid => bid.auctionAddress))];
          const auctionInfoPromises = uniqueAddresses.map(async (auctionAddress) => {
            try {
              // 获取时间信息 - 移除了getAuctionPhase调用，完全使用前端时间判断
              const [biddingEnd, revealEnd, biddingStart] = await Promise.all([
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
                  functionName: 'biddingStart',
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
                // 首先尝试检查是否为NFT拍卖
                const isNFTAuction = await publicClient.readContract({
                  address: auctionAddress as `0x${string}`,
                  abi: blindAuctionData.abi,
                  functionName: 'isNFTAuction',
                }) as boolean;

                console.log(`竞拍记录中的拍卖 ${auctionAddress} 是否为NFT拍卖:`, isNFTAuction);

                if (isNFTAuction && nftContractData) {
                  // 获取NFT Token ID和合约地址
                  const [nftTokenId, nftContractAddress] = await Promise.all([
                    publicClient.readContract({
                      address: auctionAddress as `0x${string}`,
                      abi: blindAuctionData.abi,
                      functionName: 'nftTokenId',
                    }) as Promise<bigint>,
                    publicClient.readContract({
                      address: auctionAddress as `0x${string}`,
                      abi: blindAuctionData.abi,
                      functionName: 'nftContract',
                    }) as Promise<`0x${string}`>
                  ]);

                  console.log(`竞拍记录NFT拍卖 - Token ID: ${nftTokenId}, 合约地址: ${nftContractAddress}`);

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

                      console.log("从NFT合约获取到竞拍记录的元数据:", metadata);
                    } catch (nftError) {
                      console.error("从NFT合约获取竞拍记录元数据失败:", nftError);
                    }
                  }
                }

                // 如果从NFT合约获取失败或不是NFT拍卖，尝试从事件日志获取
                if (!metadata.image) {
                  console.log("尝试从事件日志获取竞拍记录的元数据...");
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
                        const parsedMetadata = JSON.parse(metadataStr);
                        metadata = {
                          ...parsedMetadata,
                          // 确保图片URL正确格式化
                          image: parsedMetadata.imageHash
                            ? `https://ipfs.io/ipfs/${parsedMetadata.imageHash}`
                            : parsedMetadata.image || ""
                        };
                        console.log("从事件日志获取到竞拍记录的元数据:", metadata);
                      } catch (e) {
                        console.error("解析竞拍记录元数据字符串失败:", e);
                      }
                    }
                  }
                }
              } catch (error) {
                console.error("获取竞拍记录元数据失败:", error);
              }

              // 🔧 关键修复：完全使用前端时间判断，与结果页面保持100%一致
              const currentTime = Math.floor(Date.now() / 1000);
              const biddingStartTime = Number(biddingStart);
              const biddingEndTime = Number(biddingEnd);
              const revealEndTime = Number(revealEnd);

              let state: "pending" | "bidding" | "revealing" | "ended" = "bidding";

              console.log(`拍卖 ${auctionAddress} 状态判断:`, {
                currentTime,
                biddingStartTime,
                biddingEndTime,
                revealEndTime,
                isAfterRevealEnd: currentTime >= revealEndTime,
                isAfterBiddingEnd: currentTime >= biddingEndTime,
                isBeforeBiddingStart: currentTime < biddingStartTime
              });

              // 严格按照结果页面的逻辑进行状态判断
              if (currentTime >= revealEndTime) {
                state = "ended";
              } else if (currentTime >= biddingEndTime) {
                state = "revealing";
              } else if (currentTime >= biddingStartTime) {
                state = "bidding";
              } else {
                state = "pending";
              }

              console.log(`拍卖 ${auctionAddress} 最终状态:`, state);

              return {
                address: auctionAddress,
                metadata,
                state,
                biddingEnd: biddingEnd as bigint,
                revealEnd: revealEnd as bigint,
                phase: state === "ended" ? 2 : state === "revealing" ? 1 : 0, // 为了兼容性保留phase字段
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
  }, [address, publicClient, factoryContractData, blindAuctionData, nftContractData]);

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
      <div className="min-h-screen relative overflow-hidden">
        {/* 星空背景 */}
        <StarryBackground
          meteorCount={18}
          starCount={22}
          asteroidCount={12}
          theme="blue-purple"
          showGradients={true}
        />

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
                {/* 搜索框 */}
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="搜索拍卖名称、描述..."
                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  {searchInput && (
                    <button
                      onClick={resetSearch}
                      className="absolute right-12 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={handleSearch}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors duration-200"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                </div>

                {/* 过滤和显示竞拍记录 */}
                {(() => {
                  // 搜索过滤
                  const filteredRecords = bidRecords.filter(bid => {
                    const auctionInfo = auctionInfos[bid.auctionAddress];
                    if (!auctionInfo) return false;

                    if (!searchTerm) return true; // 如果没有搜索词，显示所有记录

                    const searchString = searchTerm.toLowerCase();
                    return (
                      auctionInfo.metadata.name.toLowerCase().includes(searchString) ||
                      auctionInfo.metadata.description.toLowerCase().includes(searchString)
                    );
                  });

                  // 分页
                  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
                  const startIndex = (currentPage - 1) * itemsPerPage;
                  const paginatedRecords = filteredRecords.slice(startIndex, startIndex + itemsPerPage);

                  return (
                    <>
                      {/* 竞拍记录列表 */}
                      {paginatedRecords.map((bid, index) => {
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
                                        <div className="text-cyan-300 font-mono text-sm">
                                          <Address address={bid.auctionAddress as `0x${string}`} format="short" />
                                        </div>
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
                                          ? (() => {
                                            try {
                                              // 处理不同格式的价格数据
                                              const minPrice = auctionInfo.metadata.minPrice;
                                              if (!minPrice || minPrice === "0") {
                                                return "0 ETH";
                                              }

                                              // 如果已经是ETH格式的字符串
                                              if (typeof minPrice === 'string' && minPrice.includes('.')) {
                                                return `${minPrice} ETH`;
                                              }

                                              // 如果是wei格式的大整数字符串
                                              return `${formatEther(BigInt(minPrice))} ETH`;
                                            } catch (error) {
                                              console.error("格式化最低出价失败:", error, auctionInfo.metadata.minPrice);
                                              return "格式错误";
                                            }
                                          })()
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
                                          {formatTimestamp(bid.timestamp)}
                                        </p>
                                      </div>
                                    </div>

                                    <div>
                                      <p className="text-sm text-slate-400">密钥</p>
                                      <div className="flex items-center justify-between bg-slate-800/50 p-2 rounded">
                                        <span className="text-cyan-300 font-mono text-sm truncate max-w-[70%]">
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
                                        <span className="text-cyan-300 font-mono text-sm truncate max-w-[70%]">
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

                      {/* 分页控制器 */}
                      {totalPages > 1 && (
                        <div className="flex justify-center items-center space-x-4 mt-8">
                          {/* 跳转到第一页按钮 */}
                          <button
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className={`px-4 py-2 rounded-lg ${currentPage === 1
                              ? 'bg-slate-800/30 text-slate-500 cursor-not-allowed'
                              : 'bg-blue-600/30 text-blue-400 hover:bg-blue-600/50'
                              }`}
                            title="跳转到第一页"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M15.707 15.707a1 1 0 01-1.414 0L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 010 1.414z" clipRule="evenodd" />
                              <path fillRule="evenodd" d="M15.707 9.707a1 1 0 01-1.414 0L10 5.414 5.707 9.707a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 010 1.414z" clipRule="evenodd" />
                            </svg>
                          </button>

                          {/* 上一页按钮 */}
                          <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className={`px-4 py-2 rounded-lg ${currentPage === 1
                              ? 'bg-slate-800/30 text-slate-500 cursor-not-allowed'
                              : 'bg-blue-600/30 text-blue-400 hover:bg-blue-600/50'
                              }`}
                          >
                            上一页
                          </button>

                          {/* 页码显示 */}
                          <span className="text-slate-400 bg-slate-800/30 px-4 py-2 rounded-lg">
                            第 {currentPage} 页，共 {totalPages} 页
                          </span>

                          {/* 下一页按钮 */}
                          <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className={`px-4 py-2 rounded-lg ${currentPage === totalPages
                              ? 'bg-slate-800/30 text-slate-500 cursor-not-allowed'
                              : 'bg-blue-600/30 text-blue-400 hover:bg-blue-600/50'
                              }`}
                          >
                            下一页
                          </button>

                          {/* 跳转到最后一页按钮 */}
                          <button
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                            className={`px-4 py-2 rounded-lg ${currentPage === totalPages
                              ? 'bg-slate-800/30 text-slate-500 cursor-not-allowed'
                              : 'bg-blue-600/30 text-blue-400 hover:bg-blue-600/50'
                              }`}
                            title="跳转到最后一页"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414l-5 5a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414z" clipRule="evenodd" />
                              <path fillRule="evenodd" d="M4.293 10.293a1 1 0 011.414 0L10 14.586l4.293-4.293a1 1 0 111.414 1.414l-5 5a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      )}

                      {/* 无搜索结果提示 */}
                      {filteredRecords.length === 0 && (
                        <div className="text-center py-8">
                          <p className="text-slate-400">没有找到匹配的竞拍记录</p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* 导航链接 */}
            <div className="mt-12 flex justify-center gap-6">
              <Link
                href="/"
                className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-600 hover:from-blue-500 hover:via-blue-400 hover:to-cyan-500 text-white font-bold rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-2xl shadow-blue-500/40 hover:shadow-blue-500/60 overflow-hidden border border-blue-400/30"
              >
                <div className="relative z-10 flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  <span className="text-lg">返回首页</span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-600/30 to-cyan-600/30 blur-xl -z-10"></div>
              </Link>

              <Link
                href="/all-auctions"
                className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 via-purple-500 to-pink-600 hover:from-purple-500 hover:via-purple-400 hover:to-pink-500 text-white font-bold rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-2xl shadow-purple-500/40 hover:shadow-purple-500/60 overflow-hidden border border-purple-400/30"
              >
                <div className="relative z-10 flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span className="text-lg">浏览所有拍卖</span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-600/30 to-pink-600/30 blur-xl -z-10"></div>
              </Link>

              <Link
                href="/my-auctions"
                className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-green-600 via-emerald-500 to-teal-600 hover:from-green-500 hover:via-emerald-400 hover:to-teal-500 text-white font-bold rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-2xl shadow-green-500/40 hover:shadow-green-500/60 overflow-hidden border border-green-400/30"
              >
                <div className="relative z-10 flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-lg">我的拍卖</span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-green-600/30 to-teal-600/30 blur-xl -z-10"></div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MyBids; 