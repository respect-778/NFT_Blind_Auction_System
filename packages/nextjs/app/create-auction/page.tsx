"use client";

import { useState, ChangeEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePublicClient, useAccount, useWalletClient, useWriteContract } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { MetaHeader } from "~~/components/MetaHeader";
import { notification } from "~~/utils/scaffold-eth";
import { ethers } from "ethers";
import { parseEther } from "viem";
import axios from "axios";

// 文件大小限制 (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;
// 压缩后的最大文件大小 (100KB) - 留一些空间给其他元数据
const MAX_COMPRESSED_SIZE = 100 * 1024;
// 最大图片尺寸
const MAX_IMAGE_DIMENSION = 800;
// IPFS网关URL
const IPFS_GATEWAY = "https://ipfs.io/ipfs/";
// Pinata API相关配置
const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PINATA_API_KEY = "a01c65793cf37f5338e3";
const PINATA_API_SECRET = "b3fad12fe3d730d0d8fdfa455703aaae30198a0d53afe365007d63c68693b455";

export default function CreateAuction() {
  // 路由
  const router = useRouter();

  // Wagmi hooks
  const { address: connectedAddress, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();

  // 合约数据
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");

  // 表单状态
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [minPrice, setMinPrice] = useState("");
  const [startDate, setStartDate] = useState(""); // 开始日期
  const [startTime, setStartTime] = useState(""); // 开始时间
  const [biddingTime, setBiddingTime] = useState(""); // 竞拍时间
  const [revealTime, setRevealTime] = useState(""); // 揭示时间
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ipfsHash, setIpfsHash] = useState<string | null>(null);
  const [uploadingToIPFS, setUploadingToIPFS] = useState(false);

  const [isClient, setIsClient] = useState(false);

  // 客户端检查
  useEffect(() => {
    setIsClient(true);
  }, []);

  // 压缩图片函数
  const compressImage = (file: File, maxSizeKB: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);

      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;

        img.onload = () => {
          // 计算要缩小到的尺寸
          let width = img.width;
          let height = img.height;

          // 如果图片尺寸超过最大限制，按比例缩小
          if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
            if (width > height) {
              height = Math.round(height * MAX_IMAGE_DIMENSION / width);
              width = MAX_IMAGE_DIMENSION;
            } else {
              width = Math.round(width * MAX_IMAGE_DIMENSION / height);
              height = MAX_IMAGE_DIMENSION;
            }
          }

          // 创建canvas绘制压缩后的图片
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return reject(new Error('获取canvas上下文失败'));
          }

          // 绘制图片到canvas
          ctx.drawImage(img, 0, 0, width, height);

          // 开始尝试不同的质量设置
          let quality = 0.7; // 起始质量
          const minQuality = 0.1; // 最低质量
          const step = 0.1; // 每次降低的质量步长

          const tryCompress = () => {
            // 转换为base64
            const base64 = canvas.toDataURL('image/jpeg', quality);

            // 估计大小 (base64字符串长度的3/4是近似字节大小)
            const sizeInBytes = Math.round(base64.length * 0.75);

            if (sizeInBytes <= maxSizeKB || quality <= minQuality) {
              // 达到目标大小或已达最低质量
              console.log(`压缩后图片大小: ${Math.round(sizeInBytes / 1024)}KB, 质量: ${quality.toFixed(1)}`);
              resolve(base64);
            } else {
              // 继续降低质量尝试
              quality -= step;
              tryCompress();
            }
          };

          tryCompress();
        };

        img.onerror = () => {
          reject(new Error('图片加载失败'));
        };
      };

      reader.onerror = () => {
        reject(new Error('读取文件失败'));
      };
    });
  };

  // 上传到IPFS
  const uploadToIPFS = async (file: File): Promise<string> => {
    try {
      setUploadingToIPFS(true);

      // 创建FormData对象
      const formData = new FormData();
      formData.append('file', file);

      // 设置文件名和文件夹路径
      const metadata = JSON.stringify({
        name: `auction_${Date.now()}.jpg`,
        keyvalues: {
          auctionName: name,
          timestamp: Date.now().toString()
        }
      });
      formData.append('pinataMetadata', metadata);

      // 设置Pinata选项
      const options = JSON.stringify({
        cidVersion: 0
      });
      formData.append('pinataOptions', options);

      // 调用Pinata API
      const response = await axios.post(PINATA_API_URL, formData, {
        headers: {
          'pinata_api_key': PINATA_API_KEY,
          'pinata_secret_api_key': PINATA_API_SECRET,
          'Content-Type': 'multipart/form-data'
        }
      });

      return response.data.IpfsHash;
    } catch (error) {
      console.error("IPFS上传失败:", error);
      throw new Error("IPFS上传失败，请重试");
    } finally {
      setUploadingToIPFS(false);
    }
  };

  // 从Base64转换为File对象
  const base64ToFile = (base64: string, filename: string): File => {
    const arr = base64.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);

    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    return new File([u8arr], filename, { type: mime });
  };

  // 文件处理程序
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const file = fileList[0];

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      setErrors(prev => ({
        ...prev,
        image: `文件大小超过限制 (${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB)`
      }));
      return;
    }

    // 验证文件类型
    if (!file.type.startsWith("image/")) {
      setErrors(prev => ({
        ...prev,
        image: "请上传图片文件"
      }));
      return;
    }

    // 清除错误
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.image;
      return newErrors;
    });

    // 更新文件
    setImageFile(file);

    // 创建预览URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 表单验证
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "请输入拍卖名称";
    }

    if (!description.trim()) {
      newErrors.description = "请输入拍卖描述";
    }

    if (!imageFile) {
      newErrors.image = "请上传拍卖图片";
    }

    try {
      const minPriceValue = parseFloat(minPrice);
      if (isNaN(minPriceValue) || minPriceValue < 0.001) {
        newErrors.minPrice = "最低价格不能低于0.001 ETH";
      }
    } catch (e) {
      newErrors.minPrice = "请输入有效的最低价格";
    }

    // 验证开始日期和时间
    if (!startDate) {
      newErrors.startDate = "请选择竞拍开始日期";
    }

    if (!startTime) {
      newErrors.startTime = "请选择竞拍开始时间";
    }

    if (startDate && startTime) {
      try {
        const startDateTime = new Date(`${startDate}T${startTime}`);
        const now = new Date();

        if (startDateTime <= now) {
          newErrors.startDateTime = "竞拍开始时间必须在当前时间之后";
        }
      } catch (e) {
        newErrors.startDateTime = "请选择有效的开始时间";
      }
    }

    try {
      const biddingTimeValue = parseInt(biddingTime);
      if (isNaN(biddingTimeValue) || biddingTimeValue <= 0) {
        newErrors.biddingTime = "请输入有效的竞拍时间";
      } else if (biddingTimeValue < 10) {
        newErrors.biddingTime = "竞拍时间不能少于10分钟";
      }
    } catch (e) {
      newErrors.biddingTime = "请输入有效的竞拍时间";
    }

    try {
      const revealTimeValue = parseInt(revealTime);
      if (isNaN(revealTimeValue) || revealTimeValue <= 0) {
        newErrors.revealTime = "请输入有效的揭示时间";
      } else if (revealTimeValue < 10) {
        newErrors.revealTime = "揭示时间不能少于10分钟";
      }
    } catch (e) {
      newErrors.revealTime = "请输入有效的揭示时间";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 创建拍卖处理函数
  const handleCreateAuction = async () => {
    if (!isClient) return;

    // 验证表单
    if (!validateForm()) {
      notification.error("表单验证失败，请检查输入");
      return;
    }

    // 检查钱包连接
    if (!connectedAddress || !factoryContractData) {
      notification.error("钱包未连接或合约未加载");
      return;
    }

    try {
      setIsProcessing(true);
      let imageBase64 = "";
      let imageIpfsHash = "";

      // 处理图片
      if (imageFile) {
        try {
          // 压缩图片
          notification.info("正在压缩图片...");
          imageBase64 = await compressImage(imageFile, MAX_COMPRESSED_SIZE);

          // 上传到IPFS
          notification.info("正在上传到IPFS网络...");
          const compressedFile = base64ToFile(imageBase64, `auction_${Date.now()}.jpg`);
          imageIpfsHash = await uploadToIPFS(compressedFile);
          setIpfsHash(imageIpfsHash);

          notification.success(`图片已上传到IPFS: ${imageIpfsHash.substring(0, 8)}...`);
        } catch (error) {
          console.error("图片处理失败:", error);
          notification.error("图片处理失败，请重试");
          setIsProcessing(false);
          return;
        }
      } else {
        notification.error("请上传拍卖图片");
        setIsProcessing(false);
        return;
      }

      // 准备元数据
      const metadata = {
        name,
        description,
        image: imageBase64, // 保留base64以向后兼容
        imageIpfs: imageIpfsHash, // 添加IPFS哈希
        ipfsGatewayUrl: `${IPFS_GATEWAY}${imageIpfsHash}`, // 添加完整的IPFS网关URL
        minPrice: parseEther(minPrice).toString()
      };

      // 计算开始时间戳（转换为秒）
      const startDateTime = new Date(`${startDate}T${startTime}`);
      const startTimestamp = Math.floor(startDateTime.getTime() / 1000);

      // 时间转换为秒
      const biddingTimeSec = parseInt(biddingTime) * 60; // 分钟转秒
      const revealTimeSec = parseInt(revealTime) * 60; // 分钟转秒

      // 调用合约创建拍卖
      notification.info("正在提交交易...");

      const tx = await writeContractAsync({
        address: factoryContractData.address as `0x${string}`,
        abi: factoryContractData.abi,
        functionName: "createAuction",
        args: [
          BigInt(startTimestamp),
          BigInt(biddingTimeSec),
          BigInt(revealTimeSec),
          JSON.stringify(metadata)
        ],
      });

      notification.success("交易已提交");

      // 导航到拍卖列表页面
      router.push("/all-auctions");
    } catch (error: any) {
      console.error("创建拍卖失败:", error);

      // 检查是否是数据大小错误
      const errorMsg = error?.message || "";
      if (errorMsg.includes("oversized data") || errorMsg.includes("transaction size")) {
        notification.error("交易数据过大。请使用更小的图片或降低图片质量再试。");
      } else {
        notification.error(
          errorMsg
            ? `创建拍卖失败: ${errorMsg.slice(0, 200)}${errorMsg.length > 200 ? '...' : ''}`
            : "创建拍卖失败，请重试"
        );
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // 输入处理函数
  const handleMinPriceChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // 只允许输入数字和小数点
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setMinPrice(value);

      // 清除错误
      if (parseFloat(value) > 0) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.minPrice;
          return newErrors;
        });
      }
    }
  };

  const handleBiddingTimeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // 只允许输入整数
    if (value === "" || /^\d+$/.test(value)) {
      setBiddingTime(value);

      // 清除错误
      if (parseInt(value) > 0) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.biddingTime;
          return newErrors;
        });
      }
    }
  };

  const handleRevealTimeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // 只允许输入整数
    if (value === "" || /^\d+$/.test(value)) {
      setRevealTime(value);

      // 清除错误
      if (parseInt(value) > 0) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.revealTime;
          return newErrors;
        });
      }
    }
  };

  return (
    <>
      <MetaHeader
        title="创建拍卖 | 盲拍系统"
        description="创建一个新的盲拍拍卖"
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
          <div className="max-w-6xl mx-auto backdrop-blur-md bg-purple-900/10 border border-purple-700/20 rounded-2xl shadow-[0_0_25px_rgba(128,90,213,0.1)] p-8 mb-10 overflow-hidden">
            <div className="relative z-10">
              <h1 className="text-5xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-500 neon-text inline-block text-center w-full mb-10">
                创建新拍卖
              </h1>

              {/* IPFS技术提示 */}
              <div className="mb-8 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <div className="flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-400 mr-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                  </svg>
                  <div>
                    <h3 className="text-xl font-semibold text-blue-300">采用IPFS分布式存储技术</h3>
                    <p className="text-blue-200/80">您上传的拍卖图片将使用IPFS（星际文件系统）技术进行分布式存储，确保数据永久保存且无法篡改，为您的拍卖提供更高的安全性和可靠性。</p>
                  </div>
                </div>
              </div>

              {!isClient || !isConnected ? (
                <div className="text-center p-6 bg-purple-800/20 rounded-xl border border-purple-600/30">
                  <p className="text-white text-lg mb-4">请连接钱包以创建拍卖</p>
                  <div className="animate-pulse text-purple-300/70">正在加载钱包连接状态...</div>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-8">
                  {/* 左侧表单 */}
                  <div className="space-y-5">
                    <div>
                      <label htmlFor="name" className="block text-purple-300 text-lg mb-2">拍卖名称</label>
                      <input
                        type="text"
                        id="name"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          // 清除错误
                          if (e.target.value.trim()) {
                            setErrors(prev => {
                              const newErrors = { ...prev };
                              delete newErrors.name;
                              return newErrors;
                            });
                          }
                        }}
                        placeholder="输入拍卖名称"
                        className={`w-full px-5 py-3 text-lg bg-purple-900/30 border ${errors.name ? 'border-red-500' : 'border-purple-700/50'} rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-white placeholder-purple-400/50`}
                        disabled={isProcessing}
                      />
                      {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
                    </div>

                    <div>
                      <label htmlFor="description" className="block text-purple-300 text-lg mb-2">拍卖描述</label>
                      <textarea
                        id="description"
                        value={description}
                        onChange={(e) => {
                          setDescription(e.target.value);
                          // 清除错误
                          if (e.target.value.trim()) {
                            setErrors(prev => {
                              const newErrors = { ...prev };
                              delete newErrors.description;
                              return newErrors;
                            });
                          }
                        }}
                        placeholder="描述拍卖物品"
                        rows={5}
                        className={`w-full px-5 py-3 text-lg bg-purple-900/30 border ${errors.description ? 'border-red-500' : 'border-purple-700/50'} rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-white placeholder-purple-400/50`}
                        disabled={isProcessing}
                      />
                      {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description}</p>}
                    </div>

                    <div>
                      <label htmlFor="minPrice" className="block text-purple-300 text-lg mb-2">最低价格 (ETH)</label>
                      <input
                        type="text"
                        id="minPrice"
                        value={minPrice}
                        onChange={handleMinPriceChange}
                        placeholder="例如: 0.001"
                        className={`w-full px-5 py-3 text-lg bg-purple-900/30 border ${errors.minPrice ? 'border-red-500' : 'border-purple-700/50'} rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-white placeholder-purple-400/50`}
                        disabled={isProcessing}
                      />
                      {errors.minPrice && <p className="text-red-500 text-sm mt-1">{errors.minPrice}</p>}
                    </div>

                    {/* 竞拍开始时间 */}
                    <div>
                      <label className="block text-purple-300 text-lg mb-2">竞拍开始时间</label>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <input
                            type="date"
                            id="startDate"
                            value={startDate}
                            onChange={(e) => {
                              setStartDate(e.target.value);
                              // 清除错误
                              if (e.target.value) {
                                setErrors(prev => {
                                  const newErrors = { ...prev };
                                  delete newErrors.startDate;
                                  delete newErrors.startDateTime;
                                  return newErrors;
                                });
                              }
                            }}
                            className={`w-full px-5 py-3 text-lg bg-purple-900/30 border ${errors.startDate || errors.startDateTime ? 'border-red-500' : 'border-purple-700/50'} rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-white`}
                            disabled={isProcessing}
                          />
                          {errors.startDate && <p className="text-red-500 text-sm mt-1">{errors.startDate}</p>}
                        </div>
                        <div>
                          <input
                            type="time"
                            id="startTime"
                            value={startTime}
                            onChange={(e) => {
                              setStartTime(e.target.value);
                              // 清除错误
                              if (e.target.value) {
                                setErrors(prev => {
                                  const newErrors = { ...prev };
                                  delete newErrors.startTime;
                                  delete newErrors.startDateTime;
                                  return newErrors;
                                });
                              }
                            }}
                            className={`w-full px-5 py-3 text-lg bg-purple-900/30 border ${errors.startTime || errors.startDateTime ? 'border-red-500' : 'border-purple-700/50'} rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-white`}
                            disabled={isProcessing}
                          />
                          {errors.startTime && <p className="text-red-500 text-sm mt-1">{errors.startTime}</p>}
                        </div>
                      </div>
                      {errors.startDateTime && <p className="text-red-500 text-sm mt-1">{errors.startDateTime}</p>}
                      <p className="text-purple-400/70 text-sm mt-1">设置拍卖何时开始接受竞拍</p>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="biddingTime" className="block text-purple-300 text-lg mb-2">竞拍时间 (分钟)</label>
                        <input
                          type="text"
                          id="biddingTime"
                          value={biddingTime}
                          onChange={handleBiddingTimeChange}
                          placeholder="例如: 60"
                          className={`w-full px-5 py-3 text-lg bg-purple-900/30 border ${errors.biddingTime ? 'border-red-500' : 'border-purple-700/50'} rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-white placeholder-purple-400/50`}
                          disabled={isProcessing}
                        />
                        {errors.biddingTime && <p className="text-red-500 text-sm mt-1">{errors.biddingTime}</p>}
                        <p className="text-purple-400/70 text-sm mt-1">最少10分钟</p>
                      </div>

                      <div>
                        <label htmlFor="revealTime" className="block text-purple-300 text-lg mb-2">揭示时间 (分钟)</label>
                        <input
                          type="text"
                          id="revealTime"
                          value={revealTime}
                          onChange={handleRevealTimeChange}
                          placeholder="例如: 30"
                          className={`w-full px-5 py-3 text-lg bg-purple-900/30 border ${errors.revealTime ? 'border-red-500' : 'border-purple-700/50'} rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-white placeholder-purple-400/50`}
                          disabled={isProcessing}
                        />
                        {errors.revealTime && <p className="text-red-500 text-sm mt-1">{errors.revealTime}</p>}
                        <p className="text-purple-400/70 text-sm mt-1">最少10分钟</p>
                      </div>
                    </div>
                  </div>

                  {/* 右侧图片上传和预览 */}
                  <div>
                    <label className="block text-purple-300 text-lg mb-2">拍卖图片</label>
                    <div className={`border-3 border-dashed ${errors.image ? 'border-red-500' : 'border-purple-600/50'} rounded-lg p-6 text-center bg-purple-900/20 transition-all hover:bg-purple-900/30 cursor-pointer h-80 flex flex-col items-center justify-center`}>
                      {imagePreview ? (
                        <div className="relative w-full h-full">
                          <img
                            src={imagePreview}
                            alt="预览"
                            className="w-full h-full object-contain"
                          />
                          <button
                            onClick={() => {
                              setImageFile(null);
                              setImagePreview(null);
                              setIpfsHash(null);
                            }}
                            className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 text-sm"
                            disabled={isProcessing}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-purple-400/70 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-purple-300/80 text-xl mb-3">点击上传图片</p>
                          <p className="text-purple-400/50 text-sm">支持 JPG, PNG, GIF (最大 5MB)</p>
                          <p className="text-blue-400/80 text-sm mt-2">图片将通过IPFS技术安全存储</p>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                            disabled={isProcessing}
                          />
                        </label>
                      )}
                    </div>
                    {errors.image && <p className="text-red-500 text-sm mt-1">{errors.image}</p>}

                    <div className="mt-10">
                      <button
                        onClick={handleCreateAuction}
                        disabled={isProcessing}
                        className={`w-full py-4 px-6 text-lg ${isProcessing ? 'bg-purple-700/50' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'} rounded-lg text-white font-medium transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center`}
                      >
                        {isProcessing ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {uploadingToIPFS ? "正在上传到IPFS网络..." : "处理中..."}
                          </>
                        ) : "创建拍卖"}
                      </button>

                      {ipfsHash && !isProcessing && (
                        <div className="mt-3 text-center text-blue-300 text-sm flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          图片已存储在IPFS:
                          <a
                            href={`${IPFS_GATEWAY}${ipfsHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 text-blue-400 hover:text-blue-300 underline"
                          >
                            {ipfsHash.substring(0, 6)}...{ipfsHash.substring(ipfsHash.length - 4)}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
} 