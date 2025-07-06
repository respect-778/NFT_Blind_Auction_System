"use client";

import { useState, useEffect } from "react";
import { PhotoIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useScaffoldContract } from "~~/hooks/scaffold-eth";

interface NFTData {
  id: number;
  name: string;
  cid: string;
  size: string;
}

// 模态框组件
const UploadedImagesModal = ({ isOpen, onClose, onSelectCid }: {
  isOpen: boolean;
  onClose: () => void;
  onSelectCid: (cid: string) => void;
}) => {
  const { address } = useAccount();
  const [nftList, setNftList] = useState<NFTData[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);  // 添加状态来追踪是否已加载数据

  // 获取NFT合约
  const { data: nftContract } = useScaffoldContract({
    contractName: "AuctionNFT",
  });

  useEffect(() => {
    const fetchNFTData = async () => {
      if (!nftContract || !address || !isOpen || hasLoaded) {
        return;
      }

      try {
        setLoading(true);
        // 获取用户的NFT列表
        const userNFTs = await nftContract.read.getUserNFTs([address]);
        const nftData: NFTData[] = [];

        // 获取每个NFT的详细信息
        for (const tokenId of userNFTs) {
          try {
            // 获取NFT元数据
            const nftInfo = await nftContract.read.nftMetadata([tokenId]);
            const [name, , imageHash] = nftInfo;

            // 使用imageHash作为CID
            const cid = imageHash.replace('ipfs://', '').replace(/^https:\/\/ipfs\.io\/ipfs\//, '');

            // 验证CID是否有效
            if (cid && cid.length > 0) {
              nftData.push({
                id: Number(tokenId),
                name: name || `NFT #${tokenId}`,
                cid: cid,
                size: "获取中..."
              });
            }
          } catch (error) {
            console.error(`Error fetching NFT ${tokenId}:`, error);
          }
        }

        setNftList(nftData.filter(nft => nft.cid && nft.cid.length > 0));
        setHasLoaded(true);
      } catch (error) {
        console.error("Error fetching NFT data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchNFTData();
  }, [nftContract, address, isOpen, hasLoaded]);

  // 在模态框关闭时重置状态
  useEffect(() => {
    if (!isOpen) {
      setHasLoaded(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-[#1a0b2e] rounded-2xl shadow-xl border border-purple-500/20">
        {/* 模态框头部 */}
        <div className="flex items-center justify-between p-6 border-b border-purple-500/20">
          <h2 className="text-2xl font-bold text-white">我的NFT列表</h2>
          <button
            onClick={() => {
              onClose();
              setHasLoaded(false);  // 关闭时重置加载状态
            }}
            className="p-2 hover:bg-purple-500/20 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* 表格头部 */}
        <div className="grid grid-cols-12 gap-4 p-6 text-sm font-medium text-purple-200 border-b border-purple-500/20">
          <div className="col-span-1">ID</div>
          <div className="col-span-2">名称</div>
          <div className="col-span-7">IPFS链接</div>
          <div className="col-span-2">操作</div>
        </div>

        {/* 表格内容 */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="text-center text-purple-300">加载中...</div>
          ) : nftList.length === 0 ? (
            <div className="text-center text-purple-300">暂无NFT数据</div>
          ) : (
            nftList.map((nft) => (
              <div key={nft.id} className="grid grid-cols-12 gap-4 items-center text-white">
                <div className="col-span-1">{nft.id}</div>
                <div className="col-span-2">{nft.name}</div>
                <div className="col-span-7 font-mono text-sm text-purple-300 truncate" title={nft.cid}>
                  {nft.cid}
                </div>
                <div className="col-span-2">
                  <button
                    onClick={() => {
                      onSelectCid(nft.cid);
                      onClose();
                    }}
                    className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg transition-colors"
                  >
                    使用
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// 流星组件
const Meteor = ({ delay }: { delay: number }) => (
  <div
    className="meteor"
    style={{
      animationDelay: `${delay}s`,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 40}%`,
      animationDuration: `${1.5 + Math.random() * 1}s`
    }}
  />
);

// 流星雨背景组件
const MeteorShower = () => {
  return (
    <div className="meteor-shower">
      {[...Array(60)].map((_, i) => (
        <Meteor key={i} delay={i * 0.15} />
      ))}
    </div>
  );
};

const NFTDownloadPage = () => {
  const [cid, setCid] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleDownload = async () => {
    if (!cid) {
      setError("请输入CID");
      return;
    }

    try {
      setLoading(true);
      setError("");

      // 确保CID格式正确
      const cleanCid = cid.replace('ipfs://', '').replace(/^https:\/\/ipfs\.io\/ipfs\//, '');

      // 构建IPFS网关URL
      const ipfsGateways = [
        `https://ipfs.io/ipfs/${cleanCid}`,
        `https://gateway.pinata.cloud/ipfs/${cleanCid}`,
        `https://cloudflare-ipfs.com/ipfs/${cleanCid}`,
      ];

      // 尝试从不同网关下载
      for (const gatewayUrl of ipfsGateways) {
        try {
          const response = await fetch(gatewayUrl);
          if (!response.ok) continue;

          // 获取Content-Type
          const contentType = response.headers.get('content-type') || '';

          // 根据内容类型设置文件扩展名
          let extension = '.file';
          if (contentType.includes('image/jpeg') || contentType.includes('image/jfif')) {
            extension = '.jpg';
          } else if (contentType.includes('image/png')) {
            extension = '.png';
          } else if (contentType.includes('image/gif')) {
            extension = '.gif';
          } else if (contentType.includes('image/webp')) {
            extension = '.webp';
          }

          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `nft-${cleanCid.slice(0, 8)}${extension}`; // 使用正确的文件扩展名
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          return;
        } catch (err) {
          console.error("Gateway failed:", gatewayUrl, err);
          continue;
        }
      }

      throw new Error("无法从任何IPFS网关下载文件");
    } catch (err) {
      console.error("Download failed:", err);
      setError("下载失败，请检查CID是否正确");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center min-h-screen py-20 px-4 bg-gradient-to-b from-[#0f051d] to-[#130749] overflow-hidden">
      {/* 流星雨背景 */}
      <style jsx global>{`
        .meteor-shower {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          z-index: 0;
          pointer-events: none;
        }

        .meteor {
          position: absolute;
          width: 4px;
          height: 4px;
          background: linear-gradient(to right, 
            rgba(255, 255, 255, 1),
            rgba(255, 255, 255, 0.8) 10%,
            rgba(255, 255, 255, 0.3) 50%,
            transparent 100%);
          animation: meteor linear infinite;
          transform: rotate(-45deg);
          opacity: 0;
          filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.8));
        }

        .meteor::before {
          content: '';
          position: absolute;
          width: 150%;
          height: 100%;
          transform: translateX(-100%);
          background: linear-gradient(to right, 
            transparent,
            rgba(255, 255, 255, 0.8) 50%,
            rgba(255, 255, 255, 1),
            rgba(255, 255, 255, 0.8) 50%,
            transparent);
          animation: meteor-trail 2s ease-in-out infinite;
        }

        @keyframes meteor {
          0% {
            opacity: 0;
            transform: rotate(-45deg) translateX(0) translateY(0);
          }
          5% {
            opacity: 1;
          }
          40% {
            opacity: 1;
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.8),
                      0 0 40px rgba(255, 255, 255, 0.6),
                      0 0 60px rgba(255, 255, 255, 0.5),
                      0 0 80px rgba(255, 255, 255, 0.4),
                      0 0 100px rgba(255, 255, 255, 0.3);
          }
          60% {
            opacity: 0;
            transform: rotate(-45deg) translateX(-700px) translateY(700px);
          }
          100% {
            opacity: 0;
            transform: rotate(-45deg) translateX(-700px) translateY(700px);
          }
        }

        @keyframes meteor-trail {
          0% {
            opacity: 0;
          }
          30% {
            opacity: 0.8;
          }
          100% {
            opacity: 0;
          }
        }

        @keyframes gradient {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        .animate-gradient {
          background-size: 200% auto;
          animation: gradient 4s linear infinite;
        }
      `}</style>

      <MeteorShower />

      {/* 网格背景 */}
      <div className="absolute inset-0 bg-[url('/assets/grid.svg')] bg-center opacity-15 [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />

      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 bg-purple-500/15 rounded-full blur-3xl animate-[pulse_4s_ease-in-out_infinite]" />
        <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 bg-blue-500/15 rounded-full blur-3xl animate-[pulse_4s_ease-in-out_infinite_1s]" />
      </div>

      {/* 主要内容 */}
      <div className="relative w-full">
        {/* 主标题 */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 animate-gradient">
            IPFS 文件下载
          </h1>
          <p className="text-xl text-slate-300">
            输入 IPFS CID 下载您的文件
          </p>
        </div>

        {/* 输入框和下载按钮 */}
        <div className="w-full max-w-2xl mx-auto">
          <div className="relative">
            <input
              type="text"
              placeholder="请输入IPFS CID"
              className="w-full h-16 px-6 rounded-2xl bg-[#2d1b43]/50 border-2 border-purple-500/30 text-white text-lg focus:outline-none focus:border-purple-500/50 transition-all duration-300 backdrop-blur-sm"
              value={cid}
              onChange={(e) => {
                setCid(e.target.value);
                setError("");
              }}
            />
            <button
              className={`absolute right-3 top-1/2 -translate-y-1/2 px-8 py-2.5 rounded-xl 
                ${loading ? "bg-purple-600/50" : "bg-gradient-to-r from-purple-600 to-pink-600"} 
                text-white font-medium transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/25
                disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm`}
              onClick={handleDownload}
              disabled={loading || !cid}
            >
              {loading ? "下载中..." : "下载文件"}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-red-400 text-sm pl-2">
              {error}
            </p>
          )}

          {/* 提示信息 */}
          <div className="mt-4 text-sm text-slate-400 pl-2">
            <ul className="space-y-1">
              <li>• 确保输入正确的 IPFS CID</li>
              <li>• 下载可能需要一些时间，请耐心等待</li>
              <li>• 如果下载失败，请检查网络连接</li>
            </ul>
          </div>

          {/* 查看已上传图片按钮 */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-12 w-full py-4 rounded-2xl border-2 border-purple-500/30 
              bg-[#2d1b43]/30 text-white font-medium flex items-center justify-center gap-2
              hover:bg-[#2d1b43]/50 hover:border-purple-500/50 transition-all duration-300
              backdrop-blur-sm group"
          >
            <PhotoIcon className="w-6 h-6 group-hover:scale-110 transition-transform duration-300" />
            <span>查看已上传图片</span>
          </button>
        </div>
      </div>

      {/* 上传图片列表模态框 */}
      <UploadedImagesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectCid={(selectedCid) => setCid(selectedCid)}
      />
    </div>
  );
};

export default NFTDownloadPage; 