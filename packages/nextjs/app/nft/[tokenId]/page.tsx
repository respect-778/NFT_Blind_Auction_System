"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { MetaHeader } from "~~/components/MetaHeader";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import MeteorRain from "~~/components/MeteorRain";
import {
  SparklesIcon,
  UserIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  TagIcon,
  ArrowLeftIcon,
  ShareIcon,
  ClipboardIcon
} from "@heroicons/react/24/outline";

type NFTDetail = {
  tokenId: number;
  name: string;
  description: string;
  image: string;
  creator: string;
  owner: string;
  isAuctioned: boolean;
  auctionContract: string;
  minPrice: string;
  createTime: number;
  tokenURI: string;
};

export default function NFTDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { address } = useAccount();
  const [nft, setNft] = useState<NFTDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tokenId = params.tokenId as string;

  // 获取合约信息
  const { data: nftContractData } = useDeployedContractInfo("AuctionNFT");
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });

  // 加载NFT详情
  useEffect(() => {
    if (!tokenId || !nftContractData || !publicClient) return;
    loadNFTDetail();
  }, [tokenId, nftContractData, publicClient]);

  const loadNFTDetail = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!nftContractData || !publicClient) {
        throw new Error("合约数据未加载");
      }

      console.log(`开始获取NFT ${tokenId} 的详细信息...`);

      // 检查NFT是否存在并获取详细信息
      const [metadata, owner, tokenURI] = await Promise.all([
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
        publicClient.readContract({
          address: nftContractData.address,
          abi: nftContractData.abi,
          functionName: 'tokenURI',
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
          if (parsedMetadata.minPrice && parsedMetadata.minPrice !== 0n) {
            minPriceValue = (Number(parsedMetadata.minPrice) / 10 ** 18).toString();
          }
        } catch (e) {
          console.error(`NFT ${tokenId} 价格转换失败:`, e);
        }
      }

      // 安全地获取创建时间
      let createTimeValue = Date.now() / 1000; // 默认为当前时间戳（秒）
      try {
        if (parsedMetadata.createTime && parsedMetadata.createTime !== 0n) {
          createTimeValue = Number(parsedMetadata.createTime);
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

      const nftDetail: NFTDetail = {
        tokenId: Number(tokenId),
        name: parsedMetadata.name,
        description: parsedMetadata.description,
        image: imageUrl,
        creator: parsedMetadata.creator || "",
        owner: owner || "",
        isAuctioned: Boolean(parsedMetadata.isAuctioned),
        auctionContract: parsedMetadata.auctionContract || "",
        minPrice: minPriceValue,
        createTime: createTimeValue,
        tokenURI: tokenURI || "",
      };

      setNft(nftDetail);
      console.log(`成功获取NFT ${tokenId}:`, nftDetail);
    } catch (error: any) {
      console.error(`获取NFT ${tokenId} 详情失败:`, error);
      setError(error.message || "加载NFT详情失败");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        notification.success("已复制到剪贴板");
      },
      (err) => {
        console.error("无法复制: ", err);
        notification.error("复制失败");
      }
    );
  };

  const shareNFT = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: nft?.name || `NFT #${tokenId}`,
        text: nft?.description || "查看这个精美的NFT",
        url: url,
      });
    } else {
      copyToClipboard(url);
    }
  };

  if (loading) {
    return (
      <>
        <MetaHeader title={`NFT #${tokenId} | NFT盲拍平台`} />
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative">
          <MeteorRain />
          <div className="relative z-10 flex justify-center items-center min-h-screen">
            <div className="text-center">
              <div className="w-16 h-16 relative mx-auto mb-4">
                <div className="w-16 h-16 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full border-2 border-pink-500/20 border-t-pink-500 animate-spin"></div>
                </div>
              </div>
              <p className="text-slate-300 animate-pulse">加载NFT详情中...</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (error || !nft) {
    return (
      <>
        <MetaHeader title={`NFT #${tokenId} | NFT盲拍平台`} />
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative">
          <MeteorRain />
          <div className="relative z-10 flex justify-center items-center min-h-screen">
            <div className="text-center max-w-md mx-auto p-8">
              <div className="bg-red-600/10 rounded-full p-4 w-16 h-16 mx-auto mb-4">
                <SparklesIcon className="h-8 w-8 text-red-400 mx-auto" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">NFT不存在</h3>
              <p className="text-slate-400 mb-6">{error || `NFT #${tokenId} 不存在或已被删除`}</p>
              <Link
                href="/nft-market"
                className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg font-medium transition-all"
              >
                <ArrowLeftIcon className="h-5 w-5 mr-2" />
                返回NFT市场
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <MetaHeader
        title={`${nft.name} | NFT盲拍平台`}
        description={nft.description}
      />

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative">
        <MeteorRain />

        <div className="relative z-10 w-full px-4 py-8">
          <div className="max-w-6xl mx-auto">
            {/* 导航栏 */}
            <div className="mb-8">
              <Link
                href="/nft-market"
                className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 
                  hover:from-purple-500 hover:to-blue-500 text-white font-semibold rounded-xl 
                  shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 
                  transition-all duration-300 transform hover:scale-105 hover:-translate-y-1
                  border border-purple-500/20 hover:border-purple-400/40 backdrop-blur-sm"
              >
                <ArrowLeftIcon className="h-5 w-5 mr-3" />
                <span>返回NFT市场</span>
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* NFT图片 */}
              <div className="bg-slate-900/70 backdrop-blur-lg rounded-2xl border border-slate-700/50 p-6">
                <div className="relative aspect-square bg-slate-800/50 rounded-xl overflow-hidden">
                  {nft.image ? (
                    <img
                      src={nft.image}
                      alt={nft.name}
                      className="w-full h-full object-cover"
                      onLoad={() => {
                        console.log(`NFT ${nft.tokenId} 详情页图片加载成功:`, nft.image);
                      }}
                      onError={(e) => {
                        console.error(`NFT ${nft.tokenId} 详情页图片加载失败:`, nft.image);
                        console.error("图片错误详情:", e);
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <div className="hidden flex items-center justify-center h-full text-slate-400 flex-col">
                    <SparklesIcon className="h-24 w-24 mb-4" />
                    <p className="text-sm text-center px-4">图片无法加载</p>
                    {nft.image && (
                      <p className="text-xs text-center px-4 mt-2 break-all opacity-50">
                        {nft.image}
                      </p>
                    )}
                  </div>

                  {/* 状态标签 */}
                  <div className="absolute top-4 right-4 bg-purple-600/80 backdrop-blur-sm px-3 py-1 rounded-lg text-sm font-bold text-white">
                    #{nft.tokenId}
                  </div>

                  {nft.isAuctioned && (
                    <div className="absolute top-4 left-4 bg-red-600/80 backdrop-blur-sm px-3 py-1 rounded-lg text-sm font-bold text-white">
                      拍卖中
                    </div>
                  )}
                </div>
              </div>

              {/* NFT信息 */}
              <div className="space-y-6">
                {/* 标题和操作 */}
                <div className="bg-slate-900/70 backdrop-blur-lg rounded-2xl border border-slate-700/50 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h1 className="text-3xl font-bold text-white mb-2">{nft.name}</h1>
                      <p className="text-slate-400">{nft.description}</p>
                    </div>
                    <button
                      onClick={shareNFT}
                      className="p-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                      <ShareIcon className="h-6 w-6" />
                    </button>
                  </div>

                  {/* 价格信息 */}
                  {nft.isAuctioned ? (
                    <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">拍卖最低价格</span>
                        <div className="flex items-center">
                          <CurrencyDollarIcon className="h-5 w-5 text-green-400 mr-1" />
                          <span className="text-2xl font-bold text-green-400">{nft.minPrice} ETH</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">价格状态</span>
                        <div className="flex items-center">
                          <span className="text-slate-400">未设定拍卖价格</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 操作按钮 */}
                  <div className="flex gap-4">
                    {address && nft.owner.toLowerCase() === address.toLowerCase() && !nft.isAuctioned && (
                      <Link
                        href={`/create-auction?nftId=${nft.tokenId}`}
                        className="flex-1 text-center py-3 px-6 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-lg font-medium transition-all"
                      >
                        创建拍卖
                      </Link>
                    )}

                    {nft.isAuctioned && nft.auctionContract !== "0x0000000000000000000000000000000000000000" && (
                      <Link
                        href={`/auction/${nft.auctionContract}`}
                        className="flex-1 text-center py-3 px-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg font-medium transition-all"
                      >
                        查看拍卖
                      </Link>
                    )}

                    <button
                      onClick={() => copyToClipboard(nft.tokenURI)}
                      className="py-3 px-6 bg-slate-800/50 hover:bg-slate-700/50 text-white rounded-lg font-medium transition-all"
                    >
                      复制URI
                    </button>
                  </div>
                </div>

                {/* 详细信息 */}
                <div className="bg-slate-900/70 backdrop-blur-lg rounded-2xl border border-slate-700/50 p-6">
                  <h3 className="text-xl font-semibold text-white mb-4">详细信息</h3>

                  <div className="space-y-4">
                    {/* 创建者 */}
                    <div className="flex items-center justify-between py-3 border-b border-slate-700/50">
                      <div className="flex items-center">
                        <UserIcon className="h-5 w-5 text-slate-400 mr-3" />
                        <span className="text-slate-400">创建者</span>
                      </div>
                      {nft.creator ? (
                        <div className="flex items-center gap-3">
                          <span className="text-green-400 font-mono text-sm">
                            {nft.creator.slice(0, 8)}...{nft.creator.slice(-6)}
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(nft.creator);
                              notification.success("创建者地址已复制");
                            }}
                            className="p-1.5 hover:bg-slate-700/50 rounded transition-colors"
                            title="复制完整地址"
                          >
                            <ClipboardIcon className="h-4 w-4 text-slate-400 hover:text-green-400" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">未知</span>
                      )}
                    </div>

                    {/* 当前拥有者 */}
                    <div className="flex items-center justify-between py-3 border-b border-slate-700/50">
                      <div className="flex items-center">
                        <TagIcon className="h-5 w-5 text-slate-400 mr-3" />
                        <span className="text-slate-400">拥有者</span>
                      </div>
                      {nft.owner ? (
                        <div className="flex items-center gap-3">
                          <span className="text-green-400 font-mono text-sm">
                            {nft.owner.slice(0, 8)}...{nft.owner.slice(-6)}
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(nft.owner);
                              notification.success("拥有者地址已复制");
                            }}
                            className="p-1.5 hover:bg-slate-700/50 rounded transition-colors"
                            title="复制完整地址"
                          >
                            <ClipboardIcon className="h-4 w-4 text-slate-400 hover:text-green-400" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">未知</span>
                      )}
                    </div>

                    {/* 创建时间 */}
                    <div className="flex items-center justify-between py-3 border-b border-slate-700/50">
                      <div className="flex items-center">
                        <CalendarIcon className="h-5 w-5 text-slate-400 mr-3" />
                        <span className="text-slate-400">创建时间</span>
                      </div>
                      <span className="text-white">{formatDate(nft.createTime)}</span>
                    </div>

                    {/* Token ID */}
                    <div className="flex items-center justify-between py-3 border-b border-slate-700/50">
                      <div className="flex items-center">
                        <SparklesIcon className="h-5 w-5 text-slate-400 mr-3" />
                        <span className="text-slate-400">Token ID</span>
                      </div>
                      <span className="text-white font-mono">#{nft.tokenId}</span>
                    </div>

                    {/* 状态 */}
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center">
                        <TagIcon className="h-5 w-5 text-slate-400 mr-3" />
                        <span className="text-slate-400">状态</span>
                      </div>
                      <span className={`px-3 py-1 rounded-lg text-sm font-medium ${nft.isAuctioned
                        ? "bg-red-600/20 text-red-300"
                        : "bg-green-600/20 text-green-300"
                        }`}>
                        {nft.isAuctioned ? "拍卖中" : "可出售"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 合约信息 */}
                <div className="bg-slate-900/70 backdrop-blur-lg rounded-2xl border border-slate-700/50 p-6">
                  <h3 className="text-xl font-semibold text-white mb-4">合约信息</h3>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">合约地址</span>
                      <div className="flex items-center gap-3">
                        <span className="text-green-400 font-mono text-sm">
                          {nftContractData?.address.slice(0, 10)}...{nftContractData?.address.slice(-8)}
                        </span>
                        <button
                          onClick={() => {
                            copyToClipboard(nftContractData?.address || "");
                            notification.success("合约地址已复制");
                          }}
                          className="p-1.5 hover:bg-slate-700/50 rounded transition-colors"
                          title="复制完整地址"
                        >
                          <ClipboardIcon className="h-4 w-4 text-slate-400 hover:text-green-400" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">网络</span>
                      <span className="text-white">Hardhat</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">标准</span>
                      <span className="text-white">ERC-721</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
      `}</style>
    </>
  );
} 