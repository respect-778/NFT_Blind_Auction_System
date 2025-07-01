"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseEther, encodeFunctionData } from "viem";
import { Address } from "~~/components/scaffold-eth";
import { MetaHeader } from "~~/components/MetaHeader";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import MeteorRain from "~~/components/MeteorRain";

type NFTData = {
  tokenId: number;
  name: string;
  description: string;
  image: string;
  creator: string;
  owner: string;
  isAuctioned: boolean;
  auctionContract?: string;
};

function SellNFTContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [nftData, setNftData] = useState<NFTData | null>(null);

  // 拍卖参数
  const [startTime, setStartTime] = useState("");
  const [biddingDuration, setBiddingDuration] = useState("24"); // 小时
  const [revealDuration, setRevealDuration] = useState("12"); // 小时
  const [minPrice, setMinPrice] = useState("");

  const nftId = searchParams.get('nftId');

  // 获取合约信息
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const { data: walletClient } = useWalletClient();

  // 加载NFT数据
  useEffect(() => {
    if (nftId && publicClient) {
      loadNFTData();
    }
  }, [nftId, publicClient]);

  const loadNFTData = async () => {
    // 这里添加从区块链获取NFT数据的逻辑
    // 暂时使用模拟数据
    setNftData({
      tokenId: parseInt(nftId || "1"),
      name: "神秘艺术品 #001",
      description: "由知名艺术家创作的独特数字艺术品",
      image: "/nft-1.jpg",
      creator: address || "",
      owner: address || "",
      isAuctioned: false,
    });
  };

  const handleCreateAuction = async () => {
    if (!address || !nftData || !factoryContractData || !walletClient) {
      notification.error("请先连接钱包");
      return;
    }

    if (!startTime || !minPrice) {
      notification.error("请填写所有必需字段");
      return;
    }

    try {
      setLoading(true);

      // 将输入转换为时间戳
      const startTimestamp = Math.floor(new Date(startTime).getTime() / 1000);
      const biddingTimeSeconds = parseInt(biddingDuration) * 3600; // 转换为秒
      const revealTimeSeconds = parseInt(revealDuration) * 3600; // 转换为秒
      const minPriceWei = parseEther(minPrice);

      console.log("创建NFT重新拍卖:", {
        nftTokenId: nftData.tokenId,
        startTimestamp,
        biddingTimeSeconds,
        revealTimeSeconds,
        minPriceWei: minPriceWei.toString()
      });

      // 调用工厂合约的resellNFT函数
      const hash = await walletClient.writeContract({
        address: factoryContractData.address,
        abi: factoryContractData.abi,
        functionName: 'resellNFT',
        args: [
          BigInt(nftData.tokenId),
          BigInt(startTimestamp),
          BigInt(biddingTimeSeconds),
          BigInt(revealTimeSeconds),
          minPriceWei
        ],
      });

      notification.info("交易已提交，等待确认...");

      // 等待交易确认
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      notification.success("NFT重新拍卖创建成功！");
      router.push("/my-auctions");
    } catch (error: any) {
      console.error("创建NFT重新拍卖失败:", error);
      notification.error(`创建失败: ${error.message || "未知错误"}`);
    } finally {
      setLoading(false);
    }
  };

  // 设置默认开始时间为1小时后
  useEffect(() => {
    const defaultStart = new Date(Date.now() + 60 * 60 * 1000); // 1小时后
    setStartTime(defaultStart.toISOString().slice(0, 16)); // YYYY-MM-DDTHH:mm格式
  }, []);

  if (!nftData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <>
      <MetaHeader title="出售NFT | NFT盲拍平台" description="通过盲拍出售您的NFT" />
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative">
        <MeteorRain />

        <div className="relative z-10 w-full px-4 py-8">
          <div className="max-w-4xl mx-auto">
            {/* 页面标题 */}
            <div className="text-center mb-12">
              <h1 className="text-5xl font-bold text-white tracking-tight mb-4">
                出售NFT
              </h1>
              <p className="text-slate-300/80 text-lg">
                通过盲拍机制安全出售您的NFT作品
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* NFT预览 */}
              <div className="bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">NFT预览</h2>

                <div className="bg-slate-800/50 rounded-lg overflow-hidden mb-4">
                  <div className="aspect-square relative">
                    {nftData.image ? (
                      <img
                        src={nftData.image}
                        alt={nftData.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-700">
                        <span className="text-slate-400">暂无图片</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <span className="text-slate-400 text-sm">NFT名称</span>
                    <h3 className="text-white font-semibold">{nftData.name}</h3>
                  </div>
                  <div>
                    <span className="text-slate-400 text-sm">描述</span>
                    <p className="text-slate-300 text-sm">{nftData.description}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-sm">Token ID</span>
                    <p className="text-white font-mono">#{nftData.tokenId}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-sm">当前拥有者</span>
                    <Address address={nftData.owner as `0x${string}`} size="sm" />
                  </div>
                </div>
              </div>

              {/* 拍卖设置 */}
              <div className="bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
                <h2 className="text-xl font-semibold text-white mb-6">拍卖设置</h2>

                <div className="space-y-6">
                  {/* 开始时间 */}
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">
                      拍卖开始时间
                    </label>
                    <input
                      type="datetime-local"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                      min={new Date().toISOString().slice(0, 16)}
                    />
                  </div>

                  {/* 竞拍持续时间 */}
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">
                      竞拍阶段持续时间（小时）
                    </label>
                    <select
                      value={biddingDuration}
                      onChange={(e) => setBiddingDuration(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                    >
                      <option value="12">12小时</option>
                      <option value="24">24小时</option>
                      <option value="48">48小时</option>
                      <option value="72">72小时</option>
                      <option value="168">7天</option>
                    </select>
                  </div>

                  {/* 揭示持续时间 */}
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">
                      揭示阶段持续时间（小时）
                    </label>
                    <select
                      value={revealDuration}
                      onChange={(e) => setRevealDuration(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                    >
                      <option value="6">6小时</option>
                      <option value="12">12小时</option>
                      <option value="24">24小时</option>
                      <option value="48">48小时</option>
                    </select>
                  </div>

                  {/* 最低出价 */}
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">
                      最低出价（ETH）
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      placeholder="0.1"
                      className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                    />
                  </div>

                  {/* 创建按钮 */}
                  <button
                    onClick={handleCreateAuction}
                    disabled={loading || !startTime || !minPrice}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-gray-600 disabled:to-gray-500 text-white py-4 px-6 rounded-lg font-medium transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        创建中...
                      </div>
                    ) : (
                      "创建拍卖"
                    )}
                  </button>

                  {/* 说明文字 */}
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                    <h4 className="text-blue-300 font-medium mb-2">💡 注意事项</h4>
                    <ul className="text-blue-200/80 text-sm space-y-1">
                      <li>• NFT将在拍卖期间由合约托管</li>
                      <li>• 拍卖结束后NFT自动转移给最高出价者</li>
                      <li>• 如果没有有效出价，NFT将退回给您</li>
                      <li>• 盲拍机制保证出价的公平性和隐私性</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* 返回按钮 */}
            <div className="mt-8 text-center">
              <button
                onClick={() => router.back()}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ← 返回上一页
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function SellNFT() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    }>
      <SellNFTContent />
    </Suspense>
  );
} 