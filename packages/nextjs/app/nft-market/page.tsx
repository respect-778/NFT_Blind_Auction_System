"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { SparklesIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import { MetaHeader } from "~~/components/MetaHeader";
import MeteorRain from "~~/components/MeteorRain";
import StarryBackground from "~~/components/StarryBackground";
import OptimizedImage from "~~/components/OptimizedImage";
import { useImagePreloader } from "~~/utils/imageCache";
import { formatEther } from "viem";

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

  // 图片预加载Hook
  const { preloadImages } = useImagePreloader();

  // 加载所有NFT
  useEffect(() => {
    if (!nftContractData || !publicClient) return;
    loadAllNFTs();
  }, [nftContractData, publicClient]);

  // 过滤逻辑
  const filteredNFTs = allNFTs.filter(nft => {
    // 基础过滤
    let baseFilter = true;
    switch (filter) {
      case "my-created":
        baseFilter = address ? nft.creator.toLowerCase() === address.toLowerCase() : false;
        break;
      case "my-owned":
        baseFilter = address ? nft.owner.toLowerCase() === address.toLowerCase() : false;
        break;
      default:
        baseFilter = true;
    }

    // 搜索过滤
    const searchFilter = searchTerm === "" ||
      nft.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      nft.description.toLowerCase().includes(searchTerm.toLowerCase());

    return baseFilter && searchFilter;
  });

  // 分页数据
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentNFTs = filteredNFTs.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredNFTs.length / itemsPerPage);

  // 预加载当前页面图片
  useEffect(() => {
    const imageUrls = currentNFTs
      .map(nft => nft.image)
      .filter(Boolean);

    if (imageUrls.length > 0) {
      preloadImages(imageUrls, 2); // 并发加载2个图片
    }
  }, [currentNFTs, preloadImages]);

  const loadAllNFTs = async () => {
    if (!publicClient || !nftContractData) return;

    setLoading(true);
    try {
      console.log("开始获取所有NFT数据...");

      // 获取NFT总数
      const totalSupply = await publicClient.readContract({
        address: nftContractData.address,
        abi: nftContractData.abi,
        functionName: 'totalSupply',
      }) as bigint;

      console.log(`NFT总供应量: ${totalSupply}`);

      if (totalSupply === 0n) {
        console.log("当前没有铸造任何NFT");
        setAllNFTs([]);
        setLoading(false);
        return;
      }

      const nftsList: NFTItem[] = [];

      // 逐个获取NFT信息
      for (let tokenId = 1; tokenId <= Number(totalSupply); tokenId++) {
        try {
          console.log(`正在获取NFT ${tokenId} 的详细信息...`);

          // 获取NFT元数据
          const nftMetadata = await publicClient.readContract({
            address: nftContractData.address,
            abi: nftContractData.abi,
            functionName: 'nftMetadata',
            args: [BigInt(tokenId)],
          }) as readonly [string, string, string, bigint, `0x${string}`, boolean, `0x${string}`, bigint];

          const [name, description, imageHash, minPrice, creator, isAuctioned, owner, createTime] = nftMetadata;

          // 获取当前拥有者
          const currentOwner = await publicClient.readContract({
            address: nftContractData.address,
            abi: nftContractData.abi,
            functionName: 'ownerOf',
            args: [BigInt(tokenId)],
          }) as string;

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

          // 解析元数据
          let parsedMetadata = {
            name: name || `NFT #${tokenId}`,
            description: description || "无描述",
            creator: creator || "",
            image: imageUrl,
            imageHash: imageHash
          };

          // 如果有描述且看起来像JSON，尝试解析
          if (description && (description.includes('{') || description.includes('name'))) {
            try {
              const descriptionJson = JSON.parse(description);
              if (descriptionJson.name) {
                parsedMetadata = {
                  ...parsedMetadata,
                  ...descriptionJson,
                  image: descriptionJson.image || imageUrl
                };
              }
            } catch (e) {
              // 如果解析失败，保持原始描述
              console.log(`NFT ${tokenId} 描述不是有效的JSON:`, description);
            }
          }

          const minPriceValue = minPrice ? formatEther(minPrice) : "0";
          const createTimeValue = createTime ? Number(createTime) : Date.now();

          const nftItem: NFTItem = {
            tokenId: tokenId,
            name: parsedMetadata.name,
            description: parsedMetadata.description,
            image: parsedMetadata.image,
            creator: parsedMetadata.creator || "",
            owner: currentOwner || "",
            isAuctioned: Boolean(isAuctioned),
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

  // 分页逻辑
  const paginate = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // 获取过滤器数量
  const getFilterCount = (filterType: "all" | "my-created" | "my-owned") => {
    switch (filterType) {
      case "all":
        return allNFTs.length;
      case "my-created":
        return allNFTs.filter(nft => address && nft.creator && nft.creator.toLowerCase() === address.toLowerCase()).length;
      case "my-owned":
        return allNFTs.filter(nft => address && nft.owner && nft.owner.toLowerCase() === address.toLowerCase()).length;
      default:
        return 0;
    }
  };

  return (
    <>
      <MetaHeader
        title="NFT市场 | NFT盲拍平台"
        description="探索独一无二的数字艺术品收藏。创建、交易和收藏各种精美的NFT作品。"
      />
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
        {/* 背景效果 */}
        <MeteorRain />

        {/* 主要内容 */}
        <div className="relative z-10 container mx-auto px-4 py-8">
          {/* 页面标题 */}
          <div className="text-center mb-12">
            <div className="relative inline-block">
              <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight glow-text neon-text">
                NFT市场
              </h1>
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-600/20 to-pink-600/20 blur-lg -z-10"></div>
            </div>
            <div className="mt-4 flex justify-center">
              <div className="h-1 w-24 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 rounded-full relative">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full blur-sm"></div>
              </div>
            </div>
            <p className="mt-4 text-slate-300/80 text-base max-w-2xl mx-auto leading-relaxed">
              探索独一无二的数字艺术品收藏。创建、交易和收藏各种精美的NFT作品。
            </p>
          </div>

          {/* 搜索和过滤器 */}
          <div className="mb-8">
            <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
              {/* 搜索框 */}
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="搜索NFT名称或描述..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent backdrop-blur-sm"
                />
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute right-3 top-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* 过滤器 */}
              <div className="flex gap-2">
                {[
                  { key: "all", label: "全部" },
                  { key: "my-created", label: "我创建的" },
                  { key: "my-owned", label: "我拥有的" }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key as any)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${filter === key
                      ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg"
                      : "bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 hover:text-white"
                      }`}
                  >
                    {label}
                    <span className="bg-white/20 text-xs px-1.5 py-0.5 rounded-full">
                      {getFilterCount(key as any)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* NFT网格 */}
          <div className="min-h-[400px]">
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
                          <OptimizedImage
                            src={nft.image}
                            alt={nft.name}
                            className="w-full h-full group-hover:scale-105 transition-transform duration-500"
                            width={400}
                            height={300}
                            quality={85}
                            objectFit="cover"
                            rounded="rounded-t-xl"
                            onLoad={() => {
                              console.log(`NFT ${nft.tokenId} 图片加载成功`);
                            }}
                            onError={(error) => {
                              console.error(`NFT ${nft.tokenId} 图片加载失败:`, error);
                            }}
                          />
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
                              <span className="text-green-400 font-medium">
                                {parseFloat(nft.minPrice).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 6
                                })} ETH
                              </span>
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

                {/* 分页组件 */}
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
              <div className="text-center py-20">
                <div className="text-6xl mb-4 opacity-50">🎨</div>
                <h3 className="text-xl font-semibold text-slate-200 mb-2">
                  暂无NFT
                </h3>
                <p className="text-slate-400">
                  {searchTerm
                    ? `没有找到匹配"${searchTerm}"的NFT`
                    : `当前${filter === "all" ? "" : "您"}还没有任何NFT`}
                </p>
                {filter !== "all" && (
                  <Link
                    href="/mint-nft"
                    className="inline-block mt-4 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all duration-200"
                  >
                    立即铸造NFT
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 知名NFT创作者展示区 */}
        <div className="mt-16 mb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-white mb-2 glow-text">探索NFT艺术大师</h2>
            <p className="text-slate-400">发现世界顶级NFT艺术家的创作之旅</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Beeple */}
            <a href="https://www.beeple-crap.com" target="_blank" rel="noopener noreferrer"
              className="group bg-slate-800/40 backdrop-blur-xl border border-slate-600/30 rounded-2xl p-6 hover:bg-slate-700/40 transition-all duration-300">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <span className="text-2xl">🎨</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">Beeple</h3>
                  <p className="text-sm text-slate-400">数字艺术先驱</p>
                </div>
              </div>
              <p className="text-sm text-slate-300 line-clamp-2">创造了价值6900万美元的NFT作品《Everydays》，开创了数字艺术新纪元。</p>
            </a>

            {/* Tyler Hobbs */}
            <a href="https://tylerxhobbs.com" target="_blank" rel="noopener noreferrer"
              className="group bg-slate-800/40 backdrop-blur-xl border border-slate-600/30 rounded-2xl p-6 hover:bg-slate-700/40 transition-all duration-300">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center">
                  <span className="text-2xl">🤖</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">Tyler Hobbs</h3>
                  <p className="text-sm text-slate-400">算法艺术大师</p>
                </div>
              </div>
              <p className="text-sm text-slate-300 line-clamp-2">Fidenza系列创作者，将算法艺术带入NFT主流市场。</p>
            </a>

            {/* XCOPY */}
            <a href="https://superrare.com/xcopy" target="_blank" rel="noopener noreferrer"
              className="group bg-slate-800/40 backdrop-blur-xl border border-slate-600/30 rounded-2xl p-6 hover:bg-slate-700/40 transition-all duration-300">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
                  <span className="text-2xl">👾</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">XCOPY</h3>
                  <p className="text-sm text-slate-400">故障艺术大师</p>
                </div>
              </div>
              <p className="text-sm text-slate-300 line-clamp-2">以独特的故障艺术风格著称，作品充满未来主义色彩。</p>
            </a>

            {/* FEWOCiOUS */}
            <a href="https://fewo.world" target="_blank" rel="noopener noreferrer"
              className="group bg-slate-800/40 backdrop-blur-xl border border-slate-600/30 rounded-2xl p-6 hover:bg-slate-700/40 transition-all duration-300">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                  <span className="text-2xl">🎭</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">FEWOCiOUS</h3>
                  <p className="text-sm text-slate-400">新生代艺术家</p>
                </div>
              </div>
              <p className="text-sm text-slate-300 line-clamp-2">18岁创造NFT拍卖纪录，展现数字原生一代的艺术潜力。</p>
            </a>
          </div>

          {/* 更多链接 */}
          <div className="mt-8 text-center">
            <a href="https://artblocks.io" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors">
              <span>探索更多艺术家</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
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
      `}</style>
    </>
  );
} 