"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useWalletClient, useWriteContract } from "wagmi";
import { PhotoIcon, CloudArrowUpIcon, SparklesIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { MetaHeader } from "~~/components/MetaHeader";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import MeteorRain from "~~/components/MeteorRain";
import { parseEther } from "viem";

// Pinata API相关配置 - 使用您提供的新密钥
const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PINATA_API_KEY = "e81b273e8830c434a8fc";
const PINATA_API_SECRET = "da67c3c1cb92c1492b126079e0b2634be7418935edb272ee3c141c6fe8c28d48";
const PINATA_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI0ZWM0MzA2Ni01ZTYxLTQ3NTUtYmJmMy1jZjQxYmZlMmNkNDUiLCJlbWFpbCI6Imx4eTI4NjFAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBpbl9wb2xpY3kiOnsicmVnaW9ucyI6W3siZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiRlJBMSJ9LHsiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiTllDMSJ9XSwidmVyc2lvbiI6MX0sIm1mYV9lbmFibGVkIjpmYWxzZSwic3RhdHVzIjoiQUNUSVZFIn0sImF1dGhlbnRpY2F0aW9uVHlwZSI6InNjb3BlZEtleSIsInNjb3BlZEtleUtleSI6ImU4MWIyNzNlODgzMGM0MzRhOGZjIiwic2NvcGVkS2V5U2VjcmV0IjoiZGE2N2MzYzFjYjkyYzE0OTJiMTI2MDc5ZTBiMjYzNGJlNzQxODkzNWVkYjI3MmVlM2MxNDFjNmZlOGMyOGQ0OCIsImV4cCI6MTc4MjQ1MjQzMH0.5rOuZORDFGuscw4wOJnyJKGZsQeyxUWLzbRTnGQR-ik";

// IPFS上传函数 - 改进版本
const uploadToIPFS = async (file: File): Promise<string> => {
  try {
    console.log("开始上传文件到IPFS...", file.name);

    const formData = new FormData();
    formData.append('file', file);

    // 添加元数据
    const metadata = JSON.stringify({
      name: file.name,
      keyvalues: {
        uploadedAt: new Date().toISOString(),
        fileType: file.type,
        fileSize: file.size.toString()
      }
    });
    formData.append('pinataMetadata', metadata);

    // 添加选项
    const options = JSON.stringify({
      cidVersion: 0,
    });
    formData.append('pinataOptions', options);

    // 使用JWT认证（推荐方式）
    const response = await fetch(PINATA_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PINATA_JWT}`,
      },
      body: formData,
    });

    if (!response.ok) {
      // 如果JWT失败，回退到API Key方式
      console.log("JWT认证失败，尝试使用API Key...");
      const fallbackResponse = await fetch(PINATA_API_URL, {
        method: 'POST',
        headers: {
          'pinata_api_key': PINATA_API_KEY,
          'pinata_secret_api_key': PINATA_API_SECRET,
        },
        body: formData,
      });

      if (!fallbackResponse.ok) {
        const errorText = await fallbackResponse.text();
        console.error("IPFS上传失败:", errorText);
        throw new Error(`IPFS上传失败: ${fallbackResponse.status} ${errorText}`);
      }

      const fallbackResult = await fallbackResponse.json();
      console.log("IPFS上传成功 (API Key):", fallbackResult);
      return fallbackResult.IpfsHash;
    }

    const result = await response.json();
    console.log("IPFS上传成功 (JWT):", result);
    return result.IpfsHash;
  } catch (error) {
    console.error("IPFS上传错误:", error);
    throw error;
  }
};

export default function MintNFT() {
  const router = useRouter();
  const { address: connectedAddress, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();

  // 合约数据
  const { data: nftContractData } = useDeployedContractInfo("AuctionNFT");

  // 表单状态
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [originalImagePreview, setOriginalImagePreview] = useState<string | null>(null); // 保存原始图片
  const [isUploading, setIsUploading] = useState(false);
  const [ipfsHash, setIpfsHash] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isMinting, setIsMinting] = useState(false);
  const [pixelSize, setPixelSize] = useState(0); // 像素化强度，0表示无效果
  const [draggedEmoji, setDraggedEmoji] = useState<string | null>(null);
  const [isImageEdited, setIsImageEdited] = useState(false); // 新增：追踪图片是否被编辑过
  const [hasEmoji, setHasEmoji] = useState(false); // 新增：专门追踪是否添加了表情包

  // 文件上传引用
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 处理文件选择
  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      notification.error("请选择支持的图片格式：JPG, PNG, GIF, WEBP");
      // 清除input值，确保下次能正确选择
      if (event.target) event.target.value = '';
      return;
    }

    // 验证文件大小 (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      notification.error("图片大小不能超过10MB");
      // 清除input值，确保下次能正确选择
      if (event.target) event.target.value = '';
      return;
    }

    // 重置所有编辑状态 - 新图片时从头开始
    setPixelSize(0);
    setHasEmoji(false);
    setIsImageEdited(false);
    setIpfsHash(""); // 也重置IPFS哈希

    setImageFile(file);

    // 创建预览
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      setOriginalImagePreview(result); // 同时保存原始图片
    };
    reader.readAsDataURL(file);

    // 清除input值，确保下次能重复选择同一文件
    if (event.target) event.target.value = '';
  }, []);

  // 上传到IPFS
  const handleUploadToIPFS = async () => {
    if (!imageFile && !imagePreview) {
      notification.error("请先选择图片文件");
      return;
    }

    try {
      setIsUploading(true);
      notification.info("正在上传到IPFS网络...");

      let fileToUpload: File;

      // 如果图片经过处理（像素化或添加表情包），使用处理后的图片
      if (imagePreview && (pixelSize > 0 || hasEmoji)) {
        // 将处理后的canvas数据转换为文件
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("无法创建Canvas上下文");

        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imagePreview;
        });

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // 将canvas转换为Blob，然后转换为File
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
          }, 'image/png', 0.9); // 使用PNG格式保持质量
        });

        // 创建新的文件名，包含处理信息
        const originalName = imageFile?.name || 'processed-image.png';
        const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
        let processedName: string;

        if (pixelSize > 0 && hasEmoji) {
          processedName = `${nameWithoutExt}_pixelated_${pixelSize}_with_emoji.png`;
        } else if (pixelSize > 0) {
          processedName = `${nameWithoutExt}_pixelated_${pixelSize}.png`;
        } else if (hasEmoji) {
          processedName = `${nameWithoutExt}_with_emoji.png`;
        } else {
          processedName = `${nameWithoutExt}_edited.png`;
        }

        fileToUpload = new File([blob], processedName, { type: 'image/png' });
        console.log("使用处理后的图片上传:", processedName);
      } else {
        // 使用原始文件
        if (!imageFile) throw new Error("没有可上传的文件");
        fileToUpload = imageFile;
        console.log("使用原始图片上传:", imageFile.name);
      }

      const hash = await uploadToIPFS(fileToUpload);
      setIpfsHash(hash);

      notification.success("图片已成功上传到IPFS网络！");
    } catch (error) {
      console.error("IPFS上传失败:", error);
      notification.error("IPFS上传失败，请重试");
    } finally {
      setIsUploading(false);
    }
  };

  // 像素化处理 - 实时应用
  const applyPixelation = useCallback((targetPixelSize: number, sourceImage?: string) => {
    const sourceImg = sourceImage || originalImagePreview;
    if (!sourceImg) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      // 先绘制原图
      ctx.drawImage(img, 0, 0);

      // 如果像素大小为0或1，直接显示原图
      if (targetPixelSize <= 1) {
        setImagePreview(canvas.toDataURL());
        return;
      }

      // 像素化效果
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      for (let y = 0; y < canvas.height; y += targetPixelSize) {
        for (let x = 0; x < canvas.width; x += targetPixelSize) {
          const pixelIndex = (y * canvas.width + x) * 4;
          const r = imageData.data[pixelIndex];
          const g = imageData.data[pixelIndex + 1];
          const b = imageData.data[pixelIndex + 2];

          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(x, y, targetPixelSize, targetPixelSize);
        }
      }

      setImagePreview(canvas.toDataURL());
    };
    img.src = sourceImg;
  }, [originalImagePreview]);

  // 处理像素化强度变化
  const handlePixelSizeChange = useCallback((newPixelSize: number) => {
    setPixelSize(newPixelSize);
    applyPixelation(newPixelSize);
    // 像素化不影响表情包标记，只更新像素化状态
  }, [applyPixelation]);

  // 添加表情包到图片
  const addEmojiToImage = (emoji: string, x: number, y: number) => {
    if (!imagePreview) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const emojiSize = Math.min(canvas.width, canvas.height) * 0.1;
      ctx.font = `${emojiSize}px Arial`;
      ctx.fillText(emoji, x, y);

      const newImageData = canvas.toDataURL();
      setImagePreview(newImageData);
      setIsImageEdited(true); // 标记图片已被编辑
      setHasEmoji(true); // 标记已添加表情包
      // 不再更新 originalImagePreview，保持原始图片引用
    };
    img.src = imagePreview;
  };

  // 处理图片区域的拖拽放置
  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedEmoji || !imagePreview) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100; // 转换为百分比
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // 根据图片实际尺寸计算位置
    const img = new Image();
    img.onload = () => {
      const actualX = (x / 100) * img.width;
      const actualY = (y / 100) * img.height;
      addEmojiToImage(draggedEmoji, actualX, actualY);
    };
    img.src = imagePreview;

    setDraggedEmoji(null);
  };

  // 重置到原始图片
  const resetToOriginal = () => {
    if (imageFile) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setImagePreview(result);
        setOriginalImagePreview(result);
        setPixelSize(0); // 重置像素化强度为0
        setIsImageEdited(false); // 重置编辑标记
        setHasEmoji(false); // 重置表情包标记
      };
      reader.readAsDataURL(imageFile);
    }
  };

  // 验证表单
  const validateForm = () => {
    if (!title.trim()) {
      notification.error("请输入NFT标题");
      return false;
    }
    if (!description.trim()) {
      notification.error("请输入NFT描述");
      return false;
    }
    if (!ipfsHash) {
      notification.error("请先上传图片到IPFS");
      return false;
    }
    return true;
  };

  // 铸造NFT
  const handleMintNFT = async () => {
    if (!validateForm()) return;
    if (!connectedAddress || !nftContractData) {
      notification.error("钱包未连接或合约未加载");
      return;
    }

    try {
      setIsMinting(true);

      // 构建Token URI
      const tokenURI = `https://ipfs.io/ipfs/${ipfsHash}`;

      notification.info("正在铸造NFT...");

      // 调用智能合约铸造NFT
      const tx = await writeContractAsync({
        address: nftContractData.address,
        abi: nftContractData.abi,
        functionName: "mintNFT",
        args: [
          title,                      // name: string  
          description,                // description: string
          ipfsHash,                   // imageHash: string (IPFS哈希)
          parseEther("0"),            // minPrice: uint256 (设为0，实际价格在拍卖时设置)
          tokenURI                    // tokenURI: string
        ],
      });

      notification.success("🎉 NFT铸造成功！您可以继续铸造更多NFT或前往我的资产查看。");

      // 重置表单，让用户可以继续铸造
      setImageFile(null);
      setImagePreview(null);
      setOriginalImagePreview(null);
      setIpfsHash("");
      setTitle("");
      setDescription("");
      setPixelSize(0);
      setIsImageEdited(false); // 重置编辑标记
      setHasEmoji(false); // 重置表情包标记

      // 不再自动跳转，让用户留在当前页面

    } catch (error) {
      console.error("NFT铸造失败:", error);
      notification.error("NFT铸造失败，请重试");
    } finally {
      setIsMinting(false);
    }
  };

  return (
    <>
      <MetaHeader title="铸造NFT | NFT盲拍平台" description="创建独一无二的NFT数字艺术品" />

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative">
        <MeteorRain />

        <div className="relative z-10 w-full px-2 py-6">
          <div className="max-w-full mx-auto px-4">
            {/* 页面标题 */}
            <div className="text-center mb-8">
              <div className="relative inline-block">
                <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight glow-text neon-text">
                  铸造NFT
                </h1>
                <div className="absolute -inset-1 bg-gradient-to-r from-purple-600/20 to-pink-600/20 blur-lg -z-10"></div>
              </div>
              <div className="mt-4 flex justify-center">
                <div className="h-1 w-24 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 rounded-full relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full blur-sm"></div>
                </div>
              </div>
              <p className="mt-4 text-slate-300/80 text-base max-w-2xl mx-auto leading-relaxed">
                创建独一无二的NFT数字艺术品，铸造完成后可选择在市场中拍卖
              </p>

              {/* IPFS配置状态显示 */}
              <div className="mt-6 flex justify-center">
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg px-4 py-2 border border-slate-600/50">
                  <div className="flex items-center text-sm">
                    <div className="flex items-center text-green-400 mr-4">
                      <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                      IPFS: 已配置新密钥
                    </div>
                    <div className="text-slate-400">
                      API Key: {PINATA_API_KEY.slice(0, 8)}...{PINATA_API_KEY.slice(-4)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 主要内容区域 - 左右分栏布局：左侧上传和表单，右侧预览 */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
              {/* 左侧主要内容区域 - 占3/5空间 */}
              <div className="lg:col-span-3">
                <div className="bg-slate-900/80 backdrop-blur-lg rounded-2xl border border-slate-700/50 shadow-2xl p-6">

                  {/* 文件上传区域 */}
                  <div className="mb-8">
                    <h2 className="text-xl font-bold text-white mb-6 text-center flex items-center justify-center">
                      <PhotoIcon className="h-6 w-6 mr-3 text-purple-400" />
                      上传艺术品
                    </h2>

                    {/* 上传区域 - 调整为适中高度 */}
                    <div className="relative mb-6">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />

                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-600 rounded-2xl p-8 text-center hover:border-purple-500 transition-all cursor-pointer bg-slate-800/30 hover:bg-slate-800/50 min-h-[200px] flex flex-col items-center justify-center"
                      >
                        <div className="space-y-4">
                          <PhotoIcon className="h-12 w-12 text-slate-400 mx-auto" />
                          <div>
                            <p className="text-white font-medium text-lg mb-2">拖拽文件到此处或点击上传</p>
                            <p className="text-slate-400 text-sm">
                              支持 JPG, PNG, GIF, WEBP 格式，最大 10MB
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 图片编辑功能 */}
                    {imagePreview && (
                      <div className="mb-6 bg-slate-800/30 rounded-xl p-4">
                        <h3 className="text-white font-medium mb-4 flex items-center">
                          <span className="mr-2">🎨</span>
                          图片编辑
                        </h3>

                        {/* 像素化控制 */}
                        <div className="mb-4 p-4 bg-slate-700/30 rounded-lg">
                          <h4 className="text-white text-sm font-medium mb-3">🎮 像素化效果</h4>
                          <div className="flex items-center space-x-4">
                            <label className="text-slate-300 text-sm">强度:</label>
                            <input
                              type="range"
                              min="0"
                              max="20"
                              value={pixelSize}
                              onChange={(e) => handlePixelSizeChange(Number(e.target.value))}
                              className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer"
                            />
                            <span className="text-slate-300 text-sm w-8">{pixelSize === 0 ? '原图' : pixelSize}</span>
                          </div>
                          <div className="mt-2 text-xs text-slate-400">
                            💡 拖动滑块实时调节像素化强度，0为原图效果
                          </div>
                        </div>

                        {/* 表情包工具箱 */}
                        <div className="p-4 bg-slate-700/30 rounded-lg">
                          <h4 className="text-white text-sm font-medium mb-3">😊 表情包 (拖拽到图片上)</h4>
                          <div className="flex flex-wrap gap-3">
                            {['😊', '❤️', '🔥', '⭐', '💎', '🎉', '👍', '😎'].map((emoji) => (
                              <div
                                key={emoji}
                                draggable
                                onDragStart={() => setDraggedEmoji(emoji)}
                                className="w-12 h-12 bg-slate-600/50 hover:bg-slate-600/80 border border-slate-500/30 rounded-lg flex items-center justify-center text-2xl cursor-grab active:cursor-grabbing transition-all hover:scale-110"
                              >
                                {emoji}
                              </div>
                            ))}
                          </div>
                          <p className="text-slate-400 text-xs mt-2">💡 拖拽表情到图片上的任意位置</p>
                        </div>

                        {/* 重置按钮 */}
                        <div className="mt-4 flex justify-center">
                          <button
                            onClick={resetToOriginal}
                            className="px-4 py-2 bg-slate-600/20 hover:bg-slate-600/40 border border-slate-500/30 rounded-lg text-slate-300 text-sm transition-all"
                          >
                            🔄 重置到原图
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* NFT信息表单 */}
                  <div>
                    <h2 className="text-xl font-bold text-white mb-6 text-center flex items-center justify-center">
                      <SparklesIcon className="h-6 w-6 mr-3 text-purple-400" />
                      NFT详情
                    </h2>

                    <div className="space-y-6">
                      {/* 标题 */}
                      <div>
                        <label className="block text-white font-medium mb-3 text-lg">标题 *</label>
                        <input
                          type="text"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="为你的NFT起个响亮的名字"
                          className="w-full px-5 py-4 bg-slate-800/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-lg"
                        />
                      </div>

                      {/* 描述 */}
                      <div>
                        <label className="block text-white font-medium mb-3 text-lg">描述 *</label>
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="详细描述你的艺术品特色和创作理念..."
                          rows={4}
                          className="w-full px-5 py-4 bg-slate-800/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-lg resize-none"
                        />
                      </div>
                    </div>

                    {/* 铸造按钮 */}
                    <div className="mt-10 flex justify-center">
                      <button
                        onClick={handleMintNFT}
                        disabled={isMinting || !isConnected}
                        className={`px-12 py-5 text-xl font-medium rounded-xl transition-all transform ${isMinting || !isConnected
                          ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                          : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white hover:scale-105 shadow-xl hover:shadow-purple-500/25"
                          }`}
                      >
                        {isMinting ? (
                          <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-white mr-3"></div>
                            铸造中...
                          </div>
                        ) : !isConnected ? (
                          "请先连接钱包"
                        ) : (
                          <div className="flex items-center justify-center">
                            <SparklesIcon className="h-7 w-7 mr-3" />
                            铸造NFT
                          </div>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 右侧图片预览区域 - 占2/5空间 */}
              <div className="lg:col-span-2">
                <div className="bg-slate-900/80 backdrop-blur-lg rounded-2xl border border-slate-700/50 shadow-2xl p-6 sticky top-6">
                  <h3 className="text-xl font-bold text-white mb-6 text-center flex items-center justify-center">
                    🖼️ 物品预览
                  </h3>

                  {imagePreview ? (
                    <div className="space-y-4">
                      <div
                        className="relative bg-slate-800/30 rounded-2xl p-4"
                        onDrop={handleImageDrop}
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnter={(e) => e.preventDefault()}
                      >
                        <img
                          src={imagePreview}
                          alt="NFT预览"
                          className="w-full h-auto max-h-96 object-contain mx-auto rounded-xl shadow-2xl"
                        />
                        <button
                          onClick={() => {
                            setImageFile(null);
                            setImagePreview(null);
                            setOriginalImagePreview(null);
                            setIpfsHash("");
                            // 重置所有编辑状态
                            setPixelSize(0);
                            setHasEmoji(false);
                            setIsImageEdited(false);
                          }}
                          className="absolute top-6 right-6 bg-red-600/90 hover:bg-red-600 text-white rounded-full p-2 transition-all"
                          disabled={isUploading || isMinting}
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        {draggedEmoji && (
                          <div className="absolute inset-0 bg-purple-500/20 border-2 border-dashed border-purple-400 rounded-xl flex items-center justify-center pointer-events-none">
                            <span className="text-white text-lg font-medium">松开鼠标放置表情</span>
                          </div>
                        )}
                      </div>

                      {/* IPFS上传区域 */}
                      <div className="bg-slate-800/50 rounded-xl p-4">
                        {/* 显示当前图片处理状态 */}
                        {imagePreview && (pixelSize > 0 || hasEmoji) && !ipfsHash && (
                          <div className="mb-3 p-3 bg-amber-600/20 border border-amber-500/30 rounded-lg">
                            <div className="flex items-center text-amber-300 text-sm">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span>
                                {pixelSize > 0 && hasEmoji
                                  ? `将上传处理后的图片（像素化强度: ${pixelSize} + 表情包）`
                                  : pixelSize > 0
                                    ? `将上传像素化处理的图片（强度: ${pixelSize}）`
                                    : hasEmoji
                                      ? "将上传包含表情包的处理图片"
                                      : "将上传处理后的图片"
                                }
                              </span>
                            </div>
                          </div>
                        )}

                        <button
                          onClick={handleUploadToIPFS}
                          disabled={!imageFile || isUploading || !!ipfsHash}
                          className={`w-full px-6 py-3 text-lg rounded-xl font-medium transition-all ${!imageFile
                            ? "bg-slate-700/50 text-slate-500 cursor-not-allowed"
                            : ipfsHash
                              ? "bg-green-600 text-white cursor-not-allowed"
                              : isUploading
                                ? "bg-purple-600/50 text-white cursor-not-allowed"
                                : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white transform hover:scale-105 shadow-lg"
                            }`}
                        >
                          <div className="flex items-center justify-center">
                            {ipfsHash ? (
                              <>
                                <CheckCircleIcon className="h-6 w-6 mr-3" />
                                {pixelSize > 0 || hasEmoji
                                  ? "已上传处理后图片到IPFS"
                                  : "已上传到IPFS"
                                }
                              </>
                            ) : isUploading ? (
                              <>
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3"></div>
                                {pixelSize > 0 || hasEmoji
                                  ? "正在上传处理后图片..."
                                  : "上传中..."
                                }
                              </>
                            ) : (
                              <>
                                <CloudArrowUpIcon className="h-6 w-6 mr-3" />
                                {pixelSize > 0 || hasEmoji
                                  ? "上传处理后图片到IPFS"
                                  : "上传到IPFS"
                                }
                              </>
                            )}
                          </div>
                        </button>

                        {ipfsHash && (
                          <div className="mt-4 text-center">
                            <p className="text-green-400 text-sm font-medium mb-2">IPFS哈希:</p>
                            <p className="text-slate-300 text-xs font-mono break-all bg-slate-900/50 p-3 rounded">{ipfsHash}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="w-24 h-24 bg-slate-800/50 rounded-2xl flex items-center justify-center mb-4">
                        <PhotoIcon className="h-12 w-12 text-slate-500" />
                      </div>
                      <p className="text-slate-400 text-lg font-medium mb-2">暂无预览</p>
                      <p className="text-slate-500 text-sm">上传图片后将在此处显示预览</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 底部铸造说明 */}
            <div className="bg-slate-800/30 backdrop-blur-sm rounded-xl p-6 border border-slate-700/30">
              <h3 className="text-lg font-semibold text-white mb-6 text-center">💡 铸造说明</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6 text-slate-300 text-sm">
                <div className="text-center">
                  <div className="bg-purple-600/20 rounded-lg p-4 mb-4">
                    <PhotoIcon className="h-8 w-8 text-purple-400 mx-auto" />
                  </div>
                  <h4 className="font-medium text-white mb-2">1. 上传艺术品</h4>
                  <p>选择您的原创艺术品图片，系统将上传到IPFS去中心化存储网络。</p>
                </div>
                <div className="text-center">
                  <div className="bg-cyan-600/20 rounded-lg p-4 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-cyan-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
                    </svg>
                  </div>
                  <h4 className="font-medium text-white mb-2">2. 个性化编辑</h4>
                  <p>使用像素化效果和表情包来个性化您的作品，创造独特的艺术风格。</p>
                </div>
                <div className="text-center">
                  <div className="bg-blue-600/20 rounded-lg p-4 mb-4">
                    <SparklesIcon className="h-8 w-8 text-blue-400 mx-auto" />
                  </div>
                  <h4 className="font-medium text-white mb-2">3. 填写详情</h4>
                  <p>详细描述您的作品特色，为您的NFT起一个响亮的名字。</p>
                </div>
                <div className="text-center">
                  <div className="bg-green-600/20 rounded-lg p-4 mb-4">
                    <CheckCircleIcon className="h-8 w-8 text-green-400 mx-auto" />
                  </div>
                  <h4 className="font-medium text-white mb-2">4. 铸造NFT</h4>
                  <p>点击铸造按钮，您的艺术品将被永久记录在区块链上。</p>
                </div>
                <div className="text-center">
                  <div className="bg-pink-600/20 rounded-lg p-4 mb-4">
                    <CloudArrowUpIcon className="h-8 w-8 text-pink-400 mx-auto" />
                  </div>
                  <h4 className="font-medium text-white mb-2">5. 创建拍卖</h4>
                  <p>铸造完成后，您可以在"创建拍卖"中选择此NFT进行拍卖交易。</p>
                </div>
              </div>

              {/* 新增图片编辑功能说明 */}
              <div className="mt-8 p-4 bg-gradient-to-r from-purple-600/10 to-pink-600/10 rounded-lg border border-purple-500/20">
                <h4 className="text-white font-medium mb-3 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
                  </svg>
                  🎨 图片编辑功能
                </h4>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <h5 className="text-purple-300 font-medium mb-2">🎮 像素化效果</h5>
                    <ul className="text-slate-400 space-y-1">
                      <li>• 调节滑块实时预览像素化强度</li>
                      <li>• 创造复古像素艺术风格</li>
                      <li>• 处理后的图片将保存到IPFS</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="text-pink-300 font-medium mb-2">😊 表情包装饰</h5>
                    <ul className="text-slate-400 space-y-1">
                      <li>• 拖拽表情到图片任意位置</li>
                      <li>• 增加趣味性和个人风格</li>
                      <li>• 支持多个表情组合使用</li>
                    </ul>
                  </div>
                </div>
                <p className="text-amber-300 text-xs mt-3 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  提示：只有在上传到IPFS之前进行编辑，最终的NFT才会包含这些效果
                </p>
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