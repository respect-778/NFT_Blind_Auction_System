"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { SparklesIcon, PlusCircleIcon, ClockIcon } from "@heroicons/react/24/outline";
import { MetaHeader } from "~~/components/MetaHeader";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import MeteorRain from "~~/components/MeteorRain";
import { parseEther } from "viem";

// NFT数据结构
type UserNFT = {
  tokenId: number;
  name: string;
  description: string;
  image: string;
  minPrice: string;
};

function CreateAuctionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  // 合约数据
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { data: nftContractData } = useDeployedContractInfo("AuctionNFT");

  // 表单状态
  const [minPrice, setMinPrice] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [biddingDuration, setBiddingDuration] = useState(""); // 移除默认值
  const [revealDuration, setRevealDuration] = useState(""); // 移除默认值
  const [isCreating, setIsCreating] = useState(false);

  // 已有NFT相关状态
  const [userNFTs, setUserNFTs] = useState<UserNFT[]>([]);
  const [selectedNFT, setSelectedNFT] = useState<UserNFT | null>(null);
  const [loadingNFTs, setLoadingNFTs] = useState(false);

  // 加载用户的NFT
  useEffect(() => {
    if (address && nftContractData && publicClient) {
      loadUserNFTs();
    }
  }, [address, nftContractData, publicClient]);

  // 处理URL参数，自动选中指定的NFT
  useEffect(() => {
    const nftId = searchParams.get('nftId');
    if (nftId && userNFTs.length > 0) {
      const nftIdNumber = parseInt(nftId);
      const targetNFT = userNFTs.find(nft => nft.tokenId === nftIdNumber);
      if (targetNFT) {
        setSelectedNFT(targetNFT);
        console.log(`自动选中NFT #${nftIdNumber}:`, targetNFT);
      }
    }
  }, [searchParams, userNFTs]);

  const loadUserNFTs = async () => {
    if (!address || !nftContractData || !publicClient) return;

    try {
      setLoadingNFTs(true);

      // 获取用户的NFT
      const userNFTIds = await publicClient.readContract({
        address: nftContractData.address,
        abi: nftContractData.abi,
        functionName: "getUserNFTs",
        args: [address],
      }) as bigint[];

      const nfts: UserNFT[] = [];
      for (const tokenId of userNFTIds) {
        try {
          const metadata = await publicClient.readContract({
            address: nftContractData.address,
            abi: nftContractData.abi,
            functionName: "nftMetadata",
            args: [tokenId],
          }) as readonly [string, string, string, bigint, `0x${string}`, boolean, `0x${string}`, bigint];

          const [name, desc, imageHash, originalMinPrice, creator, isAuctioned, auctionContract] = metadata as unknown as [string, string, string, bigint, string, boolean, string];

          // 只显示未拍卖的NFT
          if (!isAuctioned) {
            nfts.push({
              tokenId: Number(tokenId),
              name: name || `NFT #${Number(tokenId)}`,
              description: desc || "无描述",
              image: imageHash ? `https://ipfs.io/ipfs/${imageHash}` : "", // IPFS图片URL
              minPrice: (Number(originalMinPrice) / 10 ** 18).toString(),
            });
          }
        } catch (error) {
          console.error(`获取NFT ${tokenId} 元数据失败:`, error);
        }
      }

      setUserNFTs(nfts);
    } catch (error) {
      console.error("加载用户NFT失败:", error);
      notification.error("加载NFT列表失败");
    } finally {
      setLoadingNFTs(false);
    }
  };

  const validateForm = () => {
    if (!selectedNFT) {
      notification.error("请选择要拍卖的NFT");
      return false;
    }

    if (!minPrice || Number(minPrice) <= 0) {
      notification.error("请设置有效的最低价格");
      return false;
    }

    if (!startDate || !startTime) {
      notification.error("请设置竞拍开始时间");
      return false;
    }

    // 验证开始时间不能在过去
    const startDateTime = new Date(`${startDate}T${startTime}`);
    const now = new Date();
    if (startDateTime <= now) {
      notification.error("竞拍开始时间必须在当前时间之后");
      return false;
    }

    // 验证时长必须填写且最少10分钟
    if (!biddingDuration || Number(biddingDuration) < 10) {
      notification.error("竞拍时长必须填写且最少10分钟");
      return false;
    }

    if (!revealDuration || Number(revealDuration) < 10) {
      notification.error("揭示时长必须填写且最少10分钟");
      return false;
    }

    return true;
  };

  const handleCreateAuction = async () => {
    if (!isConnected) {
      notification.error("请先连接钱包");
      return;
    }

    if (!factoryContractData || !nftContractData || !publicClient || !address) {
      notification.error("合约信息未加载或钱包未连接");
      return;
    }

    if (!validateForm()) {
      return;
    }

    try {
      setIsCreating(true);

      // 第一步：检查并授权NFT
      notification.info("正在检查NFT授权...");

      // 检查工厂合约是否已被授权操作此NFT
      const isApproved = await publicClient.readContract({
        address: nftContractData.address,
        abi: nftContractData.abi,
        functionName: "getApproved",
        args: [BigInt(selectedNFT!.tokenId)],
      }) as string;

      const isApprovedForAll = await publicClient.readContract({
        address: nftContractData.address,
        abi: nftContractData.abi,
        functionName: "isApprovedForAll",
        args: [address, factoryContractData.address],
      }) as boolean;

      // 如果没有授权，先进行授权
      if (isApproved.toLowerCase() !== factoryContractData.address.toLowerCase() && !isApprovedForAll) {
        notification.info("授权工厂合约操作您的NFT...");

        const approveTx = await writeContractAsync({
          address: nftContractData.address,
          abi: nftContractData.abi,
          functionName: "approve",
          args: [factoryContractData.address, BigInt(selectedNFT!.tokenId)],
        });

        notification.info("等待授权交易确认...");
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        notification.success("NFT授权成功！");
      }

      // 第二步：创建拍卖
      notification.info("正在创建拍卖...");

      // 计算时间戳
      const startDateTime = new Date(`${startDate}T${startTime}`);
      const startTimestamp = Math.floor(startDateTime.getTime() / 1000);
      const biddingDurationSec = Number(biddingDuration) * 60; // 分钟转秒
      const revealDurationSec = Number(revealDuration) * 60; // 分钟转秒

      // 创建已有NFT拍卖 - 使用resellNFT函数
      const tx = await writeContractAsync({
        address: factoryContractData.address,
        abi: factoryContractData.abi,
        functionName: "resellNFT",
        args: [
          BigInt(selectedNFT!.tokenId),
          BigInt(startTimestamp),
          BigInt(biddingDurationSec),
          BigInt(revealDurationSec),
          parseEther(minPrice),
        ],
      });

      console.log("Transaction hash:", tx);
      notification.success(`NFT拍卖创建成功！交易哈希: ${tx}`);

      // 清空表单
      setMinPrice("");
      setStartDate("");
      setStartTime("");
      setBiddingDuration("");
      setRevealDuration("");
      setSelectedNFT(null);

      // 重新加载NFT列表以更新界面状态
      if (address) {
        // 清理相关缓存以确保获取最新状态
        const normalizedAddress = address.toLowerCase();
        localStorage.removeItem(`user_nfts_${normalizedAddress}`);
      }
      await loadUserNFTs();

      notification.info("NFT列表已更新，拍卖已创建成功！");

      // setTimeout(() => {
      //   router.push("/nft-market");
      // }, 2000);

    } catch (error: any) {
      console.error("创建拍卖失败:", error);
      if (error.message?.includes("User rejected")) {
        notification.error("用户取消了交易");
      } else {
        notification.error(`创建拍卖失败: ${error.message || "未知错误"}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <MetaHeader title="创建拍卖 | NFT盲拍平台" description="选择已有NFT创建拍卖" />

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative">
        <MeteorRain />

        <div className="relative z-10 w-full px-2 py-6">
          <div className="max-w-7xl mx-auto">
            {/* 页面标题 */}
            <div className="text-center mb-8">
              <div className="relative inline-block">
                <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight glow-text neon-text">
                  创建NFT拍卖
                </h1>
                <div className="absolute -inset-1 bg-gradient-to-r from-purple-600/20 to-pink-600/20 blur-lg -z-10"></div>
              </div>
              <div className="mt-4 flex justify-center">
                <div className="h-1 w-24 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 rounded-full relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full blur-sm"></div>
                </div>
              </div>
              <p className="mt-4 text-slate-300/80 text-base max-w-2xl mx-auto leading-relaxed">
                选择您拥有的NFT进行拍卖，设置竞拍参数
              </p>
            </div>

            {/* 主要内容区域 */}
            <div className="bg-slate-900/80 backdrop-blur-lg rounded-2xl border border-slate-700/50 shadow-2xl p-6">

              {/* NFT选择区域 */}
              <div className="mb-8">
                <h2 className="text-xl font-bold text-white mb-6 text-center flex items-center justify-center">
                  <SparklesIcon className="h-6 w-6 mr-2 text-purple-400" />
                  选择要拍卖的NFT
                </h2>

                {loadingNFTs ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
                    <p className="text-purple-300/70">加载NFT中...</p>
                  </div>
                ) : userNFTs.length === 0 ? (
                  <div className="text-center py-12">
                    <SparklesIcon className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">暂无可拍卖的NFT</h3>
                    <p className="text-slate-400 mb-6">您还没有可以拍卖的NFT，先去铸造一些吧！</p>
                    <button
                      onClick={() => router.push("/mint-nft")}
                      className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg font-medium transition-all duration-300"
                    >
                      立即铸造NFT
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {userNFTs.map((nft) => (
                      <div
                        key={nft.tokenId}
                        onClick={() => setSelectedNFT(nft)}
                        className={`cursor-pointer rounded-xl border transition-all duration-300 ${selectedNFT?.tokenId === nft.tokenId
                          ? "border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20"
                          : "border-slate-600 bg-slate-800/50 hover:border-purple-400 hover:bg-purple-500/5"
                          }`}
                      >
                        <div className="p-4">
                          {nft.image ? (
                            <img
                              src={nft.image}
                              alt={nft.name}
                              className="w-full h-48 object-cover rounded-lg mb-3"
                              onError={(e) => {
                                console.error(`NFT ${nft.tokenId} 图片加载失败:`, nft.image);
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div className="hidden w-full h-48 bg-slate-700 rounded-lg mb-3 flex items-center justify-center">
                            <SparklesIcon className="h-12 w-12 text-slate-400" />
                          </div>
                          <h3 className="text-white font-semibold mb-1">{nft.name}</h3>
                          <p className="text-slate-400 text-sm mb-2 line-clamp-2">{nft.description}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">#{nft.tokenId}</span>
                            <span className="text-green-400 font-medium">原始价: {nft.minPrice} ETH</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 拍卖设置表单 */}
              {selectedNFT && (
                <div>
                  <h2 className="text-xl font-bold text-white mb-6 text-center flex items-center justify-center">
                    <PlusCircleIcon className="h-6 w-6 mr-2 text-purple-400" />
                    拍卖设置
                  </h2>

                  <div className="grid md:grid-cols-2 gap-8">
                    {/* 左列：价格和时间设置 */}
                    <div className="space-y-6">
                      {/* 最低价格 */}
                      <div>
                        <label className="block text-white font-medium mb-2">最低出价 (ETH) *</label>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={minPrice}
                          onChange={(e) => setMinPrice(e.target.value)}
                          placeholder="请输入最低出价，如：0.1"
                          className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        />
                        <p className="text-slate-400 text-xs mt-1">设置此次拍卖的最低出价</p>
                      </div>

                      {/* 竞拍开始时间 */}
                      <div>
                        <label className="block text-white font-medium mb-2">竞拍开始时间 *</label>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <input
                              type="date"
                              value={startDate}
                              onChange={(e) => setStartDate(e.target.value)}
                              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            />
                          </div>
                          <div>
                            <input
                              type="time"
                              value={startTime}
                              onChange={(e) => setStartTime(e.target.value)}
                              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            />
                          </div>
                        </div>
                        <p className="text-slate-400 text-xs mt-1">设置竞拍何时开始</p>
                      </div>
                    </div>

                    {/* 右列：持续时间设置 */}
                    <div className="space-y-6">
                      {/* 竞拍时长 */}
                      <div>
                        <label className="block text-white font-medium mb-2">竞拍时长 (分钟) *</label>
                        <input
                          type="number"
                          min="10"
                          value={biddingDuration}
                          onChange={(e) => setBiddingDuration(e.target.value)}
                          placeholder="请输入竞拍时长，如：60"
                          className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        />
                        <p className="text-slate-400 text-xs mt-1">最少10分钟，用户提交出价的时间</p>
                      </div>

                      {/* 揭示时长 */}
                      <div>
                        <label className="block text-white font-medium mb-2">揭示时长 (分钟) *</label>
                        <input
                          type="number"
                          min="10"
                          value={revealDuration}
                          onChange={(e) => setRevealDuration(e.target.value)}
                          placeholder="请输入揭示时长，如：30"
                          className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        />
                        <p className="text-slate-400 text-xs mt-1">最少10分钟，用户揭示真实出价的时间</p>
                      </div>
                    </div>
                  </div>

                  {/* 选中NFT信息展示 */}
                  <div className="mt-8 bg-slate-800/30 rounded-xl p-6 border border-slate-600/30">
                    <h3 className="text-lg font-semibold text-white mb-4">选中的NFT</h3>
                    <div className="flex items-start gap-6">
                      {selectedNFT.image && (
                        <img
                          src={selectedNFT.image}
                          alt={selectedNFT.name}
                          className="w-24 h-24 object-cover rounded-lg"
                        />
                      )}
                      <div className="flex-1">
                        <h4 className="text-white font-semibold mb-2">{selectedNFT.name}</h4>
                        <p className="text-slate-400 text-sm mb-2">{selectedNFT.description}</p>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-slate-500">Token ID: #{selectedNFT.tokenId}</span>
                          <span className="text-green-400">原始价格: {selectedNFT.minPrice} ETH</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 创建拍卖按钮 */}
                  <div className="mt-8 flex justify-center">
                    <button
                      onClick={handleCreateAuction}
                      disabled={isCreating || !isConnected}
                      className={`px-10 py-4 text-lg font-medium rounded-lg transition-all transform ${isCreating || !isConnected
                        ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                        : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white hover:scale-105 shadow-xl hover:shadow-purple-500/25"
                        }`}
                    >
                      {isCreating ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3"></div>
                          创建中...
                        </div>
                      ) : !isConnected ? (
                        "请先连接钱包"
                      ) : (
                        <div className="flex items-center justify-center">
                          <PlusCircleIcon className="h-6 w-6 mr-2" />
                          创建拍卖
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 帮助信息 */}
            <div className="mt-6 bg-slate-800/30 backdrop-blur-sm rounded-xl p-6 border border-slate-700/30">
              <h3 className="text-lg font-semibold text-white mb-4 text-center">💡 创建拍卖说明</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 text-slate-300 text-sm">
                <div className="text-center">
                  <div className="bg-purple-600/20 rounded-lg p-3 mb-3">
                    <SparklesIcon className="h-8 w-8 text-purple-400 mx-auto" />
                  </div>
                  <h4 className="font-medium text-white mb-1">1. 选择NFT</h4>
                  <p>从您拥有的NFT中选择要拍卖的作品。</p>
                </div>
                <div className="text-center">
                  <div className="bg-blue-600/20 rounded-lg p-3 mb-3">
                    <ClockIcon className="h-8 w-8 text-blue-400 mx-auto" />
                  </div>
                  <h4 className="font-medium text-white mb-1">2. 设置时间</h4>
                  <p>选择拍卖开始的具体日期和时间，竞拍和揭示时长最少10分钟。</p>
                </div>
                <div className="text-center">
                  <div className="bg-green-600/20 rounded-lg p-3 mb-3">
                    <PlusCircleIcon className="h-8 w-8 text-green-400 mx-auto" />
                  </div>
                  <h4 className="font-medium text-white mb-1">3. 设置价格</h4>
                  <p>输入最低出价，这是参与竞拍的门槛价格。</p>
                </div>
                <div className="text-center">
                  <div className="bg-pink-600/20 rounded-lg p-3 mb-3">
                    <SparklesIcon className="h-8 w-8 text-pink-400 mx-auto" />
                  </div>
                  <h4 className="font-medium text-white mb-1">4. 开始拍卖</h4>
                  <p>确认所有信息无误后，创建拍卖开始盲拍流程。</p>
                </div>
              </div>

              {/* 时间设置提示 */}
              <div className="mt-6 p-4 bg-blue-600/10 rounded-lg border border-blue-500/20">
                <h5 className="text-blue-300 font-medium mb-2">⏰ 时间设置建议</h5>
                <ul className="text-slate-300 text-sm space-y-1">
                  <li>• <strong>竞拍时长</strong>：建议30-120分钟，给用户充足时间参与</li>
                  <li>• <strong>揭示时长</strong>：建议30-60分钟，确保用户能及时揭示出价</li>
                  <li>• <strong>开始时间</strong>：建议至少提前10分钟，方便用户准备</li>
                </ul>
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
        .neon-text {
          text-shadow: 0 0 10px rgba(168, 85, 247, 0.7), 0 0 20px rgba(168, 85, 247, 0.5);
        }
      `}</style>
    </>
  );
}

export default function CreateAuction() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    }>
      <CreateAuctionContent />
    </Suspense>
  );
} 