"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { MetaHeader } from "~~/components/MetaHeader";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { formatEther } from "viem";
import MeteorRain from "~~/components/MeteorRain";
import { SparklesIcon, ShoppingBagIcon, FireIcon, MagnifyingGlassIcon, ClipboardIcon } from "@heroicons/react/24/outline";

type NFTItem = {
  tokenId: number;
  name: string;
  description: string;
  image: string;
  creator: string;
  owner: string;
  isAuctioned: boolean;
  minPrice: string;
  createTime: number;
};

export default function NFTMarket() {
  const router = useRouter();
  const { address } = useAccount();
  const [allNFTs, setAllNFTs] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "my-created" | "my-owned">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(8);

  // 获取合约信息
  const { data: nftContractData } = useDeployedContractInfo("AuctionNFT");
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });

  // 加载所有NFT
  useEffect(() => {
    if (!nftContractData || !publicClient) return;
    loadAllNFTs();
  }, [nftContractData, publicClient]);

  const loadAllNFTs = async () => {
    try {
      setLoading(true);

      if (!nftContractData || !publicClient) {
        console.log("NFT合约数据或公共客户端未准备好");
        return;
      }

      console.log("开始获取所有NFT数据...");

      // 获取总NFT数量
      const totalSupply = await publicClient.readContract({
        address: nftContractData.address,
        abi: nftContractData.abi,
        functionName: 'totalSupply',
      }) as bigint;

      console.log("NFT总数:", totalSupply.toString());

      if (Number(totalSupply) === 0) {
        setAllNFTs([]);
        return;
      }

      // 获取所有NFT的详细信息
      const nftsList: NFTItem[] = [];

      for (let tokenId = 1; tokenId <= Number(totalSupply); tokenId++) {
        try {
          console.log(`正在获取NFT ${tokenId} 的信息...`);

          // 检查NFT是否存在并获取详细信息
          const [metadata, owner] = await Promise.all([
            publicClient.readContract({
              address: nftContractData.address,
              abi: nftContractData.abi,
              functionName: 'nftMetadata',
              args: [BigInt(tokenId)],
            }) as Promise<any>,
            publicClient.readContract({
              address: nftContractData.address,
              abi: nftContractData.abi,
              functionName: 'ownerOf',
              args: [BigInt(tokenId)],
            }) as Promise<string>,
          ]);

          console.log(`NFT ${tokenId} 原始元数据:`, metadata);
          console.log(`NFT ${tokenId} 拥有者:`, owner);

          // 根据合约结构体 NFTMetadata 解析数据
          // struct NFTMetadata { name, description, imageHash, minPrice, creator, isAuctioned, auctionContract, createTime }
          const parsedMetadata = {
            name: metadata?.name || metadata?.[0] || `NFT #${tokenId}`,
            description: metadata?.description || metadata?.[1] || "无描述",
            imageHash: metadata?.imageHash || metadata?.[2] || "",
            minPrice: metadata?.minPrice || metadata?.[3] || 0n,
            creator: metadata?.creator || metadata?.[4] || "",
            isAuctioned: metadata?.isAuctioned || metadata?.[5] || false,
            auctionContract: metadata?.auctionContract || metadata?.[6] || "",
            createTime: metadata?.createTime || metadata?.[7] || 0n,
          };

          console.log(`NFT ${tokenId} 解析后元数据:`, parsedMetadata);

          // 安全地获取价格数据 - 只有拍卖中的NFT才处理价格
          let minPriceValue = "0";
          if (parsedMetadata.isAuctioned) {
            try {
              // 如果有拍卖合约地址，尝试从拍卖创建事件获取真实的最低价格
              if (parsedMetadata.auctionContract && parsedMetadata.auctionContract !== "0x0000000000000000000000000000000000000000") {
                try {
                  // 获取NFT重新拍卖事件来获取正确的最低价格
                  if (nftContractData) {
                    const factoryAddress = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"; // 这里需要实际的工厂合约地址

                    // 获取工厂合约的ABI
                    if (factoryContractData) {
                      const resaleLogs = await publicClient.getContractEvents({
                        address: factoryContractData.address,
                        abi: factoryContractData.abi,
                        eventName: 'NFTResaleCreated',
                        args: {
                          nftTokenId: BigInt(tokenId)
                        },
                        fromBlock: BigInt(0),
                      });

                      if (resaleLogs && resaleLogs.length > 0) {
                        // 获取最新的重新拍卖事件
                        const latestResale = resaleLogs[resaleLogs.length - 1];
                        if (latestResale.args && latestResale.args.minPrice) {
                          minPriceValue = (Number(latestResale.args.minPrice) / 10 ** 18).toString();
                          console.log(`从拍卖事件获取NFT ${tokenId} 的最低价格:`, minPriceValue);
                        }
                      }
                    }
                  }
                } catch (eventError) {
                  console.warn(`获取NFT ${tokenId} 拍卖事件失败，使用原始价格:`, eventError);
                  // 如果无法从事件获取，使用原始的minPrice
                  if (parsedMetadata.minPrice && parsedMetadata.minPrice !== 0n) {
                    minPriceValue = (Number(parsedMetadata.minPrice) / 10 ** 18).toString();
                  }
                }
              } else {
                // 如果没有拍卖合约地址，使用原始的minPrice
                if (parsedMetadata.minPrice && parsedMetadata.minPrice !== 0n) {
                  minPriceValue = (Number(parsedMetadata.minPrice) / 10 ** 18).toString();
                }
              }
            } catch (e) {
              console.error(`NFT ${tokenId} 价格转换失败:`, e);
            }
          }

          // 安全地获取创建时间
          let createTimeValue = Date.now(); // 默认为当前时间
          try {
            if (parsedMetadata.createTime && parsedMetadata.createTime !== 0n) {
              createTimeValue = Number(parsedMetadata.createTime) * 1000; // 转换为毫秒
            }
          } catch (e) {
            console.error(`NFT ${tokenId} 时间转换失败:`, e);
          }

          // 安全地获取图片链接
          let imageUrl = "";
          if (parsedMetadata.imageHash) {
            if (parsedMetadata.imageHash.startsWith('http')) {
              imageUrl = parsedMetadata.imageHash;
            } else {
              imageUrl = `https://ipfs.io/ipfs/${parsedMetadata.imageHash}`;
            }
            console.log(`NFT ${tokenId} 图片URL:`, imageUrl);
          } else {
            console.log(`NFT ${tokenId} 没有图片哈希`);
          }

          const nftItem: NFTItem = {
            tokenId: tokenId,
            name: parsedMetadata.name,
            description: parsedMetadata.description,
            image: imageUrl,
            creator: parsedMetadata.creator || "",
            owner: owner || "",
            isAuctioned: Boolean(parsedMetadata.isAuctioned),
            minPrice: minPriceValue,
            createTime: createTimeValue,
          };

          nftsList.push(nftItem);
          console.log(`成功获取NFT ${tokenId}:`, nftItem);
        } catch (error) {
          console.error(`获取NFT ${tokenId} 详情失败:`, error);

          // 即使出错也创建一个基本的NFT对象
          try {
            const owner = await publicClient.readContract({
              address: nftContractData.address,
              abi: nftContractData.abi,
              functionName: 'ownerOf',
              args: [BigInt(tokenId)],
            }) as string;

            const fallbackNFT: NFTItem = {
              tokenId: tokenId,
              name: `NFT #${tokenId}`,
              description: "数据加载失败",
              image: "",
              creator: "",
              owner: owner || "",
              isAuctioned: false,
              minPrice: "0",
              createTime: Date.now(),
            };

            nftsList.push(fallbackNFT);
            console.log(`使用回退数据创建NFT ${tokenId}:`, fallbackNFT);
          } catch (fallbackError) {
            console.error(`无法获取NFT ${tokenId} 的基本信息:`, fallbackError);
          }
        }
      }

      // 按创建时间排序（最新的在前）
      nftsList.sort((a, b) => b.createTime - a.createTime);

      setAllNFTs(nftsList);
      console.log("成功获取所有NFT:", nftsList);
    } catch (error) {
      console.error("加载NFT列表失败:", error);
      notification.error("加载NFT列表失败，请刷新页面重试");
    } finally {
      setLoading(false);
    }
  };

  // 过滤NFT
  const filteredNFTs = allNFTs
    .filter(nft => {
      if (filter === "my-created") {
        return address && nft.creator && nft.creator.toLowerCase() === address.toLowerCase();
      }
      if (filter === "my-owned") {
        return address && nft.owner && nft.owner.toLowerCase() === address.toLowerCase();
      }
      return true; // "all"
    })
    .filter(nft =>
      searchTerm === "" ||
      nft.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      nft.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

  // 分页逻辑
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentNFTs = filteredNFTs.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.max(1, Math.ceil(filteredNFTs.length / itemsPerPage)); // 确保至少有1页

  // 分页跳转函数
  const paginate = (pageNumber: number) => {
    if (pageNumber < 1) pageNumber = 1;
    if (pageNumber > totalPages) pageNumber = totalPages;
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 获取过滤数量的函数需要使用filteredNFTs
  const getFilterCount = (filterType: "all" | "my-created" | "my-owned") => {
    if (filterType === "all") return allNFTs.length;
    if (filterType === "my-created") {
      if (!address) return 0;
      return allNFTs.filter(nft => nft.creator && nft.creator.toLowerCase() === address.toLowerCase()).length;
    }
    if (filterType === "my-owned") {
      if (!address) return 0;
      return allNFTs.filter(nft => nft.owner && nft.owner.toLowerCase() === address.toLowerCase()).length;
    }
    return 0;
  };

  // 当搜索或过滤条件改变时重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filter]);

  return (
    <>
      <MetaHeader title="NFT市场 | NFT盲拍平台" description="发现和竞拍独特的NFT作品" />

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative">
        <MeteorRain />

        <div className="relative z-10 w-full px-4 py-8">
          <div className="max-w-7xl mx-auto">
            {/* 页面标题 */}
            <div className="text-center mb-12">
              <div className="relative inline-block">
                <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight glow-text neon-text">
                  NFT市场
                </h1>
                <div className="absolute -inset-1 bg-gradient-to-r from-purple-600/20 to-pink-600/20 blur-lg -z-10"></div>
              </div>
              <div className="mt-6 flex justify-center">
                <div className="h-1 w-32 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 rounded-full relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full blur-sm"></div>
                </div>
              </div>
              <p className="mt-6 text-slate-300/80 text-lg max-w-2xl mx-auto leading-relaxed">
                发现和竞拍独特的NFT作品，体验去中心化的数字艺术品交易
              </p>
            </div>

            {/* 搜索和筛选区域 */}
            <div className="mb-8 flex flex-col md:flex-row gap-4 items-center justify-between">
              {/* 搜索框 */}
              <div className="relative flex-1 max-w-md">
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索NFT名称或描述..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-800/40 backdrop-blur-xl border border-slate-600/50 rounded-2xl text-white placeholder-slate-400 focus:border-purple-500/70 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:bg-slate-800/60 transition-all duration-300 shadow-lg hover:shadow-purple-500/10"
                />
              </div>

              {/* 筛选按钮 */}
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => setFilter("all")}
                  className={`group relative px-6 py-3 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 ${filter === "all"
                    ? "bg-gradient-to-r from-purple-600 via-purple-500 to-pink-600 text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/40"
                    : "bg-slate-800/50 backdrop-blur-xl text-slate-300 hover:text-white hover:bg-slate-700/60 border border-slate-600/30 hover:border-slate-500/50 shadow-lg hover:shadow-slate-500/20"
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <SparklesIcon className={`h-4 w-4 transition-all duration-300 ${filter === "all" ? "text-white" : "text-purple-400 group-hover:text-purple-300"}`} />
                    <span>全部 ({getFilterCount("all")})</span>
                  </div>
                  {filter === "all" && (
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-600/20 to-pink-600/20 blur-xl -z-10"></div>
                  )}
                </button>

                {address && (
                  <>
                    <button
                      onClick={() => setFilter("my-created")}
                      className={`group relative px-6 py-3 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 ${filter === "my-created"
                        ? "bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-600 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40"
                        : "bg-slate-800/50 backdrop-blur-xl text-slate-300 hover:text-white hover:bg-slate-700/60 border border-slate-600/30 hover:border-slate-500/50 shadow-lg hover:shadow-slate-500/20"
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <FireIcon className={`h-4 w-4 transition-all duration-300 ${filter === "my-created" ? "text-white" : "text-blue-400 group-hover:text-blue-300"}`} />
                        <span>我创建的 ({getFilterCount("my-created")})</span>
                      </div>
                      {filter === "my-created" && (
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-600/20 to-cyan-600/20 blur-xl -z-10"></div>
                      )}
                    </button>

                    <button
                      onClick={() => setFilter("my-owned")}
                      className={`group relative px-6 py-3 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 ${filter === "my-owned"
                        ? "bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40"
                        : "bg-slate-800/50 backdrop-blur-xl text-slate-300 hover:text-white hover:bg-slate-700/60 border border-slate-600/30 hover:border-slate-500/50 shadow-lg hover:shadow-slate-500/20"
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <ShoppingBagIcon className={`h-4 w-4 transition-all duration-300 ${filter === "my-owned" ? "text-white" : "text-emerald-400 group-hover:text-emerald-300"}`} />
                        <span>我拥有的 ({getFilterCount("my-owned")})</span>
                      </div>
                      {filter === "my-owned" && (
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-emerald-600/20 to-teal-600/20 blur-xl -z-10"></div>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* NFT网格 */}
            {loading ? (
              <div className="flex flex-col justify-center items-center py-20">
                <div className="w-16 h-16 relative">
                  <div className="w-16 h-16 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full border-2 border-pink-500/20 border-t-pink-500 animate-spin"></div>
                  </div>
                </div>
                <p className="mt-4 text-slate-300 animate-pulse">加载NFT中...</p>
              </div>
            ) : filteredNFTs.length > 0 ? (
              <>
                {/* NFT网格 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
                  {currentNFTs.map((nft) => (
                    <div key={nft.tokenId} className="bg-slate-900/70 backdrop-blur-lg rounded-xl border border-slate-700/50 shadow-xl hover:shadow-purple-500/10 transition-all duration-300 hover:-translate-y-1 group overflow-hidden">
                      {/* NFT图片 */}
                      <div className="relative h-56 bg-slate-800/50 overflow-hidden">
                        {nft.image ? (
                          <>
                            <img
                              src={nft.image}
                              alt={nft.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              onLoad={() => {
                                console.log(`NFT ${nft.tokenId} 图片加载成功:`, nft.image);
                              }}
                              onError={(e) => {
                                console.error(`NFT ${nft.tokenId} 图片加载失败:`, nft.image);
                                console.error("图片错误详情:", e);
                                e.currentTarget.style.display = 'none';
                                const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                                if (placeholder) {
                                  placeholder.classList.remove('hidden');
                                }
                              }}
                            />
                            <div className="hidden flex items-center justify-center h-full text-slate-400 bg-gradient-to-br from-slate-800 to-slate-900 flex-col">
                              <SparklesIcon className="h-16 w-16 mb-2" />
                              <p className="text-xs text-center px-2">图片加载失败</p>
                              {nft.image && (
                                <p className="text-xs text-center px-2 mt-1 break-all opacity-50">
                                  {nft.image.slice(0, 50)}...
                                </p>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-center h-full text-slate-400 bg-gradient-to-br from-slate-800 to-slate-900 flex-col">
                            <SparklesIcon className="h-16 w-16 mb-2" />
                            <p className="text-xs text-center px-2">无图片</p>
                          </div>
                        )}

                        {/* Token ID 标签 */}
                        <div className="absolute top-3 right-3 bg-purple-600/80 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-bold text-white">
                          #{nft.tokenId}
                        </div>

                        {/* 拍卖状态标签 */}
                        {nft.isAuctioned && (
                          <div className="absolute top-3 left-3 bg-red-600/80 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-bold text-white">
                            拍卖中
                          </div>
                        )}
                      </div>

                      {/* NFT信息 */}
                      <div className="p-4">
                        <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-purple-400 transition-colors truncate">
                          {nft.name}
                        </h3>
                        <p className="text-slate-400 text-sm mb-3 line-clamp-2 h-10">
                          {nft.description}
                        </p>

                        {/* 创建者和拥有者信息 */}
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">创建者:</span>
                            {nft.creator ? (
                              <div className="flex items-center gap-2">
                                <span className="text-green-400 font-mono text-xs">
                                  {nft.creator.slice(0, 6)}...{nft.creator.slice(-4)}
                                </span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(nft.creator);
                                    notification.success("创建者地址已复制");
                                  }}
                                  className="group p-1.5 hover:bg-slate-600/50 rounded-lg transition-all duration-200 hover:scale-110"
                                  title="复制完整地址"
                                >
                                  <ClipboardIcon className="h-3 w-3 text-slate-400 group-hover:text-green-400 transition-colors duration-200" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400">未知</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">拥有者:</span>
                            {nft.owner ? (
                              <div className="flex items-center gap-2">
                                <span className="text-green-400 font-mono text-xs">
                                  {nft.owner.slice(0, 6)}...{nft.owner.slice(-4)}
                                </span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(nft.owner);
                                    notification.success("拥有者地址已复制");
                                  }}
                                  className="group p-1.5 hover:bg-slate-600/50 rounded-lg transition-all duration-200 hover:scale-110"
                                  title="复制完整地址"
                                >
                                  <ClipboardIcon className="h-3 w-3 text-slate-400 group-hover:text-green-400 transition-colors duration-200" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400">未知</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">最低价格:</span>
                            {nft.isAuctioned ? (
                              <span className="text-green-400 font-medium">{nft.minPrice} ETH</span>
                            ) : (
                              <span className="text-slate-400">未设定价格</span>
                            )}
                          </div>
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex gap-2">
                          <Link
                            href={`/nft/${nft.tokenId}`}
                            className="group relative flex-1 text-center py-3 px-4 bg-gradient-to-r from-purple-600 via-purple-500 to-pink-600 hover:from-purple-500 hover:via-purple-400 hover:to-pink-500 text-white rounded-xl text-sm font-semibold transition-all duration-300 transform hover:scale-[1.02] shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 overflow-hidden"
                          >
                            <div className="relative z-10 flex items-center justify-center gap-2">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              <span>查看详情</span>
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                          </Link>
                          {address && nft.owner && nft.owner.toLowerCase() === address.toLowerCase() && !nft.isAuctioned && (
                            <Link
                              href={`/create-auction?nftId=${nft.tokenId}`}
                              className="group relative py-3 px-4 bg-gradient-to-r from-amber-600 via-amber-500 to-orange-600 hover:from-amber-500 hover:via-amber-400 hover:to-orange-500 text-white rounded-xl text-sm font-semibold transition-all duration-300 transform hover:scale-[1.02] shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 overflow-hidden"
                            >
                              <div className="relative z-10 flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
                                </svg>
                                <span>拍卖</span>
                              </div>
                              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 分页组件 - 简化为一行 */}
                <div className="mt-8 flex justify-center items-center">
                  <div className="inline-flex items-center gap-3 px-6 py-3 bg-slate-800/40 backdrop-blur-xl border border-slate-600/30 rounded-2xl shadow-lg">
                    {/* 首页按钮 */}
                    <button
                      onClick={() => paginate(1)}
                      disabled={currentPage === 1}
                      className="flex items-center gap-1 px-3 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-lg font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-300 disabled:hover:bg-transparent"
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
                      className="flex items-center gap-1 px-3 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-lg font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-300 disabled:hover:bg-transparent"
                      title="上一页"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      <span className="text-sm">上一页</span>
                    </button>

                    {/* 页数信息 */}
                    <div className="px-4 py-1.5">
                      <span className="text-slate-400 text-sm">
                        第 <span className="text-purple-400 font-semibold">{currentPage}</span> 页，共 <span className="text-purple-400 font-semibold">{totalPages}</span> 页
                      </span>
                    </div>

                    {/* 下一页按钮 */}
                    <button
                      onClick={() => paginate(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="flex items-center gap-1 px-3 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-lg font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-300 disabled:hover:bg-transparent"
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
                      className="flex items-center gap-1 px-3 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-lg font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-300 disabled:hover:bg-transparent"
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
              <div className="text-center py-16 bg-slate-900/50 backdrop-blur-lg rounded-2xl border border-slate-700/50">
                <div className="relative inline-block p-6 bg-purple-600/10 rounded-2xl mb-6">
                  <SparklesIcon className="h-16 w-16 text-purple-400 mx-auto" />
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-pink-600/5 rounded-2xl blur-xl"></div>
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">
                  {searchTerm ? "未找到匹配的NFT" : allNFTs.length === 0 ? "暂无NFT" : "未找到符合条件的NFT"}
                </h3>
                <p className="text-slate-400 mb-8 max-w-md mx-auto">
                  {searchTerm
                    ? `没有找到匹配"${searchTerm}"的NFT，尝试调整搜索条件`
                    : allNFTs.length === 0
                      ? "当前没有任何NFT，快来创建第一个NFT吧！"
                      : "当前没有符合筛选条件的NFT"}
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-4">
                  <Link
                    href="/mint-nft"
                    className="group relative inline-flex items-center px-8 py-4 bg-gradient-to-r from-purple-600 via-purple-500 to-pink-600 hover:from-purple-500 hover:via-purple-400 hover:to-pink-500 text-white rounded-2xl font-bold transition-all duration-300 transform hover:scale-105 shadow-xl shadow-purple-500/30 hover:shadow-purple-500/50 overflow-hidden"
                  >
                    <div className="relative z-10 flex items-center gap-3">
                      <SparklesIcon className="h-6 w-6 animate-pulse" />
                      <span>创建NFT</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-600/20 to-pink-600/20 blur-xl -z-10"></div>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CSS动画 */}
      <style jsx global>{`
        @keyframes glow {
          0%, 100% { text-shadow: 0 0 10px rgba(168, 85, 247, 0.5), 0 0 20px rgba(168, 85, 247, 0.3); }
          50% { text-shadow: 0 0 15px rgba(236, 72, 153, 0.8), 0 0 30px rgba(236, 72, 153, 0.5); }
        }
        .glow-text {
          animation: glow 2s ease-in-out infinite;
        }
        .neon-text {
          text-shadow: 0 0 10px rgba(168, 85, 247, 0.7), 0 0 20px rgba(168, 85, 247, 0.5);
        }
        
        /* 限制文本行数 */
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </>
  );
} 