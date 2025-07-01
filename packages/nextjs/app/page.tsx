"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth/useScaffoldReadContract";
import { formatEther } from "viem";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { usePublicClient } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import MeteorRain from "../components/MeteorRain";

// 添加3D球体组件
const Canvas3DSphere = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置canvas尺寸
    const size = 400; // 从300增加到400
    canvas.width = size;
    canvas.height = size;

    // 3D球体参数
    const radius = 130; // 从100增加到130
    const segments = 32; // 增加分辨率
    const rings = 24; // 增加分辨率

    let rotationX = 0;
    let rotationY = 0;

    // 生成球体顶点
    const generateSphereVertices = () => {
      const vertices = [];

      for (let ring = 0; ring <= rings; ring++) {
        const theta = (ring * Math.PI) / rings; // 0 到 π
        const y = Math.cos(theta) * radius;
        const ringRadius = Math.sin(theta) * radius;

        for (let segment = 0; segment <= segments; segment++) {
          const phi = (segment * 2 * Math.PI) / segments; // 0 到 2π
          const x = Math.cos(phi) * ringRadius;
          const z = Math.sin(phi) * ringRadius;

          vertices.push({ x, y, z });
        }
      }

      return vertices;
    };

    // 生成球体三角形面片
    const generateSphereFaces = () => {
      const faces = [];

      for (let ring = 0; ring < rings; ring++) {
        for (let segment = 0; segment < segments; segment++) {
          const first = ring * (segments + 1) + segment;
          const second = first + segments + 1;

          // 确保索引有效
          if (second + 1 < (rings + 1) * (segments + 1)) {
            // 第一个三角形
            faces.push([first, second, first + 1]);
            // 第二个三角形  
            faces.push([second, second + 1, first + 1]);
          }
        }
      }

      return faces;
    };

    // 3D到2D投影
    const project = (vertex: { x: number, y: number, z: number }) => {
      // 应用旋转
      const cosX = Math.cos(rotationX);
      const sinX = Math.sin(rotationX);
      const cosY = Math.cos(rotationY);
      const sinY = Math.sin(rotationY);

      // 绕X轴旋转
      const y1 = vertex.y * cosX - vertex.z * sinX;
      const z1 = vertex.y * sinX + vertex.z * cosX;

      // 绕Y轴旋转
      const x2 = vertex.x * cosY + z1 * sinY;
      const z2 = -vertex.x * sinY + z1 * cosY;

      // 透视投影
      const distance = 500; // 从400增加到500，适应更大的球体
      const scale = distance / (distance + z2);

      return {
        x: size / 2 + x2 * scale,
        y: size / 2 + y1 * scale,
        z: z2,
        scale: scale
      };
    };

    // 计算法向量（用于光照）
    const calculateNormal = (v1: any, v2: any, v3: any) => {
      const u = { x: v2.x - v1.x, y: v2.y - v1.y, z: v2.z - v1.z };
      const v = { x: v3.x - v1.x, y: v3.y - v1.y, z: v3.z - v1.z };

      return {
        x: u.y * v.z - u.z * v.y,
        y: u.z * v.x - u.x * v.z,
        z: u.x * v.y - u.y * v.x
      };
    };

    // 绘制三角形面片
    const drawTriangle = (p1: any, p2: any, p3: any, brightness: number, depth: number) => {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();

      // 创建科技感渐变色
      const centerX = (p1.x + p2.x + p3.x) / 3;
      const centerY = (p1.y + p2.y + p3.y) / 3;

      const gradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, 30
      );

      // 根据光照和深度调整颜色，创建科技星球效果
      const depthFactor = Math.max(0.3, 1 - Math.abs(depth) / 300);
      const lightFactor = brightness * 0.8 + 0.2;

      // 科技蓝紫色星球配色 - 更加鲜艳和科技感
      const time = Date.now() * 0.001; // 时间因子用于动态效果
      const pulse = Math.sin(time * 2) * 0.1 + 0.9; // 脉冲效果

      // 添加数据流效果 - 基于位置的动态颜色
      const dataFlow = Math.sin(centerX * 0.02 + time) * Math.cos(centerY * 0.02 + time * 0.7) * 0.3;
      const energyPulse = Math.sin(time * 3 + centerX * 0.01 + centerY * 0.01) * 0.2;

      // 基础颜色 - 深蓝到亮蓝紫渐变
      const baseR = 40 + lightFactor * 140 + dataFlow * 80 + energyPulse * 60;
      const baseG = 80 + lightFactor * 120 + dataFlow * 100 + energyPulse * 80;
      const baseB = 180 + lightFactor * 75 + dataFlow * 40;

      // 添加电路板图案效果
      const circuitPattern = Math.sin(centerX * 0.05) * Math.cos(centerY * 0.05) * 0.4;
      const hexGrid = Math.sin(centerX * 0.03) * Math.sin(centerY * 0.03) * 0.3;

      const r = Math.max(20, Math.min(255, (baseR + circuitPattern * 60 + hexGrid * 40) * pulse));
      const g = Math.max(30, Math.min(255, (baseG + circuitPattern * 80 + hexGrid * 60) * pulse));
      const b = Math.max(100, Math.min(255, (baseB + circuitPattern * 30 + hexGrid * 20) * pulse));

      // 创建多层渐变效果
      gradient.addColorStop(0, `rgba(${r * 1.2}, ${g * 1.2}, ${b}, ${0.95 * depthFactor})`);
      gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b * 0.95}, ${0.9 * depthFactor})`);
      gradient.addColorStop(0.7, `rgba(${r * 0.8}, ${g * 0.8}, ${b * 0.9}, ${0.8 * depthFactor})`);
      gradient.addColorStop(1, `rgba(${r * 0.6}, ${g * 0.6}, ${b * 0.8}, ${0.7 * depthFactor})`);

      ctx.fillStyle = gradient;
      ctx.fill();

      // 添加能量线条效果
      if (brightness > 0.7 && (dataFlow > 0.2 || energyPulse > 0.1)) {
        ctx.strokeStyle = `rgba(${100 + energyPulse * 155}, ${150 + energyPulse * 105}, 255, ${0.6 * lightFactor * pulse})`;
        ctx.lineWidth = 0.5 + energyPulse * 1.5;
        ctx.setLineDash([2, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 添加数据点效果
      if (Math.random() < 0.1 && brightness > 0.6) {
        ctx.fillStyle = `rgba(${200 + energyPulse * 55}, ${220 + energyPulse * 35}, 255, ${0.8 * pulse})`;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 1 + energyPulse * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // 渲染函数
    const render = () => {
      // 清空画布 - 使用透明背景
      ctx.clearRect(0, 0, size, size);

      const vertices = generateSphereVertices();
      const faces = generateSphereFaces();

      // 投影所有顶点
      const projectedVertices = vertices.map(vertex => project(vertex));

      // 计算并绘制所有面片
      const trianglesToDraw = [];

      for (const face of faces) {
        const [i1, i2, i3] = face;
        if (i1 >= vertices.length || i2 >= vertices.length || i3 >= vertices.length) continue;

        const v1 = vertices[i1];
        const v2 = vertices[i2];
        const v3 = vertices[i3];

        // 计算面片的法向量
        const normal = calculateNormal(v1, v2, v3);

        // 光源方向（从右上方照射）
        const lightDirection = { x: 0.8, y: -0.6, z: 1.2 };
        const lightMagnitude = Math.sqrt(
          lightDirection.x * lightDirection.x +
          lightDirection.y * lightDirection.y +
          lightDirection.z * lightDirection.z
        );

        // 归一化法向量
        const normalMagnitude = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
        if (normalMagnitude > 0) {
          normal.x /= normalMagnitude;
          normal.y /= normalMagnitude;
          normal.z /= normalMagnitude;
        }

        // 计算光照强度（点积）
        const lightIntensity = Math.max(0, (
          normal.x * lightDirection.x +
          normal.y * lightDirection.y +
          normal.z * lightDirection.z
        ) / lightMagnitude);

        // 计算面片中心的Z值用于深度排序
        const centerZ = (v1.z + v2.z + v3.z) / 3;

        // 不进行背面剔除，渲染所有面片
        trianglesToDraw.push({
          face,
          brightness: lightIntensity * 0.9 + 0.1,
          centerZ,
          depth: centerZ
        });
      }

      // 按Z值排序，后面的先绘制
      trianglesToDraw.sort((a, b) => a.centerZ - b.centerZ);

      // 绘制所有三角形
      for (const triangle of trianglesToDraw) {
        const [i1, i2, i3] = triangle.face;
        const p1 = projectedVertices[i1];
        const p2 = projectedVertices[i2];
        const p3 = projectedVertices[i3];

        // 检查投影点是否有效
        if (p1 && p2 && p3 &&
          !isNaN(p1.x) && !isNaN(p1.y) &&
          !isNaN(p2.x) && !isNaN(p2.y) &&
          !isNaN(p3.x) && !isNaN(p3.y)) {
          drawTriangle(p1, p2, p3, triangle.brightness, triangle.depth);
        }
      }

      // 添加科技感高光效果
      const time = Date.now() * 0.001;
      const highlightPulse = Math.sin(time * 1.5) * 0.2 + 0.8;

      const highlightGradient = ctx.createRadialGradient(
        size * 0.4, size * 0.25, 0,
        size * 0.4, size * 0.25, radius * 0.7
      );
      highlightGradient.addColorStop(0, `rgba(255, 255, 255, ${0.8 * highlightPulse})`);
      highlightGradient.addColorStop(0.2, `rgba(200, 220, 255, ${0.4 * highlightPulse})`);
      highlightGradient.addColorStop(0.5, `rgba(150, 200, 255, ${0.2 * highlightPulse})`);
      highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = highlightGradient;
      ctx.beginPath();
      ctx.arc(size * 0.4, size * 0.25, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();

      // 添加能量环效果
      const energyRing = Math.sin(time * 2) * 0.3 + 0.7;
      const ringGradient = ctx.createRadialGradient(
        size / 2, size / 2, radius * 0.9,
        size / 2, size / 2, radius * 1.3
      );
      ringGradient.addColorStop(0, 'rgba(100, 150, 255, 0)');
      ringGradient.addColorStop(0.6, `rgba(120, 180, 255, ${0.15 * energyRing})`);
      ringGradient.addColorStop(0.8, `rgba(150, 200, 255, ${0.25 * energyRing})`);
      ringGradient.addColorStop(1, `rgba(180, 220, 255, ${0.1 * energyRing})`);

      ctx.fillStyle = ringGradient;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, radius * 1.3, 0, Math.PI * 2);
      ctx.fill();

      // 添加数据流轨迹
      if (Math.random() < 0.3) {
        const angle = time * 0.5;
        const trailRadius = radius * 1.1;
        const trailX = size / 2 + Math.cos(angle) * trailRadius;
        const trailY = size / 2 + Math.sin(angle) * trailRadius;

        ctx.fillStyle = `rgba(100, 200, 255, 0.6)`;
        ctx.beginPath();
        ctx.arc(trailX, trailY, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 更新旋转
      rotationY += 0.008;
      rotationX += 0.003;

      animationRef.current = requestAnimationFrame(render);
    };

    // 开始渲染
    render();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{
        width: '100%',
        height: '100%',
        imageRendering: 'auto'
      }}
    />
  );
};

// 定义一个包含 CSS 变量的类型
interface CustomStyle extends React.CSSProperties {
  "--rotation"?: string;
}

// 定义拍卖项目类型
interface AuctionItem {
  address: string;
  name: string;
  status: "未开始" | "竞拍中" | "揭示中" | "已结束";
  statusClass: string;
  highestBid?: string;
  minPrice?: string;
  endTime?: string;
  winner?: string;
}

export default function Home() {
  const router = useRouter();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [activeStep, setActiveStep] = useState(0);
  const [hotAuctions, setHotAuctions] = useState<AuctionItem[]>([]);
  const [isLoadingAuctions, setIsLoadingAuctions] = useState<boolean>(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { data: blindAuctionData } = useDeployedContractInfo("BlindAuction");
  const { data: nftContractData } = useDeployedContractInfo("AuctionNFT");
  // 添加流星状态
  const [shootingStars, setShootingStars] = useState<{ top: string, left: string, delay: string, duration: string }[]>([]);
  // 添加小行星状态 - 已移除，现在使用静态环形布局

  // 处理鼠标移动
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // 平滑跟随效果
  useEffect(() => {
    const smoothFollow = () => {
      setCursorPosition(prev => ({
        x: prev.x + (mousePosition.x - prev.x) * 0.1,
        y: prev.y + (mousePosition.y - prev.y) * 0.1,
      }));
      requestAnimationFrame(smoothFollow);
    };

    const animationId = requestAnimationFrame(smoothFollow);
    return () => cancelAnimationFrame(animationId);
  }, [mousePosition]);

  // 修改为星星闪烁效果
  useEffect(() => {
    // 确保只在浏览器环境中执行
    if (typeof window === "undefined") return;

    const createStar = () => {
      const container = document.querySelector(".star-container");
      if (!container) return;

      const star = document.createElement("div");
      star.className = "star-line";

      // 随机位置
      star.style.left = `${Math.random() * 100}%`;
      star.style.top = `${Math.random() * 100}%`;

      // 随机大小
      const size = 1 + Math.random() * 2;
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;

      // 随机动画持续时间
      star.style.animationDuration = `${3 + Math.random() * 5}s`;

      container.appendChild(star);

      // 动画结束后移除元素
      star.addEventListener("animationend", () => {
        star.remove();
      });
    };

    // 每1秒创建一个新的星星（从2秒改为1秒）
    const interval = setInterval(createStar, 1000);

    // 初始创建更多星星（从15个增加到35个）
    for (let i = 0; i < 35; i++) {
      setTimeout(() => createStar(), i * 100);
    }

    return () => clearInterval(interval);
  }, []);

  // 生成流星效果
  useEffect(() => {
    const stars = Array(3).fill(0).map(() => ({
      top: `${Math.random() * 50}%`,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 20}s`,
      duration: `${45 + Math.random() * 20}s`
    }));

    setShootingStars(stars);
  }, []);

  // 从合约读取相关信息
  const { data: contractData } = useScaffoldReadContract({
    contractName: "BlindAuction",
    functionName: "getAuctionPhase",
  });

  const { data: biddingStart } = useScaffoldReadContract({
    contractName: "BlindAuction",
    functionName: "biddingStart",
  });

  const { data: revealEndTime } = useScaffoldReadContract({
    contractName: "BlindAuction",
    functionName: "revealEnd",
  });

  const { data: highestBid } = useScaffoldReadContract({
    contractName: "BlindAuction",
    functionName: "highestBid",
  });

  const { data: beneficiary } = useScaffoldReadContract({
    contractName: "BlindAuction",
    functionName: "beneficiary",
  });

  // 获取热门拍卖数据
  useEffect(() => {
    // 从区块链获取真实的拍卖数据
    const fetchAuctions = async () => {
      try {
        // 检查是否有可用的合约数据
        if (!publicClient || !factoryContractData || !blindAuctionData || !nftContractData) {
          setIsLoadingAuctions(false);
          return;
        }

        console.log("正在获取拍卖数据...");
        setIsLoadingAuctions(true);

        // 获取拍卖总数
        const count = await publicClient.readContract({
          address: factoryContractData.address,
          abi: factoryContractData.abi,
          functionName: "getAuctionCount",
        }) as bigint;

        console.log("拍卖总数:", count.toString());

        if (count === 0n) {
          setHotAuctions([]);
          setIsLoadingAuctions(false);
          setLastRefreshTime(new Date());
          return;
        }

        // 获取所有拍卖地址
        const auctionAddresses = await publicClient.readContract({
          address: factoryContractData.address,
          abi: factoryContractData.abi,
          functionName: "getAuctions",
          args: [0n, count],
        }) as `0x${string}`[];

        console.log("所有拍卖地址:", auctionAddresses);

        // 获取每个拍卖的详细信息
        const auctionsData = await Promise.all(
          auctionAddresses.map(async (address) => {
            try {
              console.log(`获取拍卖详情: ${address}`);
              // 获取拍卖基本信息
              const [biddingEnd, revealEnd, highestBid, phase, biddingStart] = await Promise.all([
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
                  functionName: 'highestBid',
                }),
                publicClient.readContract({
                  address,
                  abi: blindAuctionData.abi,
                  functionName: 'getAuctionPhase',
                }),
                publicClient.readContract({
                  address,
                  abi: blindAuctionData.abi,
                  functionName: 'biddingStart',
                }),
              ]);

              // 获取区块链当前时间
              let blockchainDate = new Date();
              try {
                const blockNumber = await publicClient.getBlockNumber();
                const block = await publicClient.getBlock({ blockNumber });
                const blockchainTimestamp = block.timestamp;
                blockchainDate = new Date(Number(blockchainTimestamp) * 1000);
                console.log(`区块链当前时间: ${blockchainDate.toLocaleString()}, 区块: ${blockNumber}`);
              } catch (error) {
                console.error("获取区块链时间失败:", error);
              }

              // 🔧 完善元数据获取逻辑，与竞拍记录页面保持一致
              let metadata = {
                name: "未命名拍卖",
                description: "无描述",
                image: "",
                minPrice: "0",
              };

              try {
                // 首先尝试检查是否为NFT拍卖
                const isNFTAuction = await publicClient.readContract({
                  address,
                  abi: blindAuctionData.abi,
                  functionName: 'isNFTAuction',
                }) as boolean;

                console.log(`首页拍卖 ${address} 是否为NFT拍卖:`, isNFTAuction);

                if (isNFTAuction && nftContractData) {
                  // 获取NFT Token ID和合约地址
                  const [nftTokenId, nftContractAddress] = await Promise.all([
                    publicClient.readContract({
                      address,
                      abi: blindAuctionData.abi,
                      functionName: 'nftTokenId',
                    }) as Promise<bigint>,
                    publicClient.readContract({
                      address,
                      abi: blindAuctionData.abi,
                      functionName: 'nftContract',
                    }) as Promise<`0x${string}`>
                  ]);

                  console.log(`首页NFT拍卖 - Token ID: ${nftTokenId}, 合约地址: ${nftContractAddress}`);

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

                      console.log("从NFT合约获取到首页拍卖的元数据:", metadata);
                    } catch (nftError) {
                      console.error("从NFT合约获取首页拍卖元数据失败:", nftError);
                    }
                  }
                }

                // 如果从NFT合约获取失败或不是NFT拍卖，尝试从事件日志获取
                if (!metadata.image) {
                  console.log("尝试从事件日志获取首页拍卖的元数据...");
                  const logs = await publicClient.getContractEvents({
                    address: factoryContractData.address,
                    abi: factoryContractData.abi,
                    eventName: 'AuctionCreated',
                    args: { auctionAddress: address },
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
                        console.log("从事件日志获取到首页拍卖的元数据:", metadata);
                      } catch (e) {
                        console.error("解析首页拍卖元数据字符串失败:", e);
                      }
                    }
                  }
                }
              } catch (error) {
                console.error("获取首页拍卖元数据失败:", error);
              }

              // 确定拍卖状态和样式
              let status: "未开始" | "竞拍中" | "揭示中" | "已结束" = "竞拍中";
              let statusClass = "bg-blue-600/30 border border-blue-500/50 text-blue-300";

              // 🔧 关键修复：与竞拍记录页面保持完全一致的状态判断逻辑
              const currentTime = Math.floor(Date.now() / 1000);
              const biddingStartTime = Number(biddingStart);
              const biddingEndTime = Number(biddingEnd);
              const revealEndTime = Number(revealEnd);

              console.log(`首页拍卖 ${address} 状态判断:`, {
                currentTime,
                biddingStartTime,
                biddingEndTime,
                revealEndTime,
                contractPhase: Number(phase), // 保留合约phase用于调试对比
                isAfterRevealEnd: currentTime >= revealEndTime,
                isAfterBiddingEnd: currentTime >= biddingEndTime,
                isBeforeBiddingStart: currentTime < biddingStartTime
              });

              // 严格按照竞拍记录页面的逻辑进行状态判断
              if (currentTime >= revealEndTime) {
                status = "已结束";
                statusClass = "bg-gray-600/30 border border-gray-500/50 text-gray-300";
              } else if (currentTime >= biddingEndTime) {
                status = "揭示中";
                statusClass = "bg-yellow-600/30 border border-yellow-500/50 text-yellow-300";
              } else if (currentTime >= biddingStartTime) {
                status = "竞拍中";
                statusClass = "bg-emerald-600/30 border border-emerald-500/50 text-emerald-300";
              } else {
                status = "未开始";
                statusClass = "bg-blue-600/30 border border-blue-500/50 text-blue-300";
              }

              console.log(`首页拍卖 ${address} 最终状态:`, status);

              // 格式化结束时间
              const endTime = status === "竞拍中"
                ? new Date(Number(biddingEnd) * 1000).toLocaleString()
                : status === "揭示中"
                  ? new Date(Number(revealEnd) * 1000).toLocaleString()
                  : "已结束";

              // 格式化出价
              const formattedBid = highestBid ?
                highestBid === 0n ? "0" :
                  parseFloat(formatEther(highestBid)).toLocaleString('en-US', {
                    maximumSignificantDigits: 6,
                    useGrouping: false
                  }) : "0";

              // 格式化最低出价
              const formattedMinPrice = metadata.minPrice ?
                parseFloat(formatEther(BigInt(metadata.minPrice))).toLocaleString('en-US', {
                  maximumSignificantDigits: 6,
                  useGrouping: false
                }) : "0";

              return {
                address,
                name: metadata.name || "未命名拍卖",
                status,
                statusClass,
                highestBid: formattedBid,
                endTime,
                winner: undefined,
                minPrice: formattedMinPrice
              } as AuctionItem;
            } catch (error) {
              console.error(`获取拍卖 ${address} 信息失败:`, error);
              return null;
            }
          })
        );

        // 过滤掉获取失败的拍卖并设置
        const validAuctions = auctionsData.filter(Boolean) as AuctionItem[];
        console.log("有效拍卖数量:", validAuctions.length);
        console.log("有效拍卖数据:", validAuctions);

        // 🔧 修复：只显示"竞拍中"状态的拍卖，严格按照用户要求
        const biddingAuctions = validAuctions.filter(auction => auction.status === "竞拍中");
        console.log("竞拍中的拍卖数量:", biddingAuctions.length);
        console.log("竞拍中的拍卖详情:", biddingAuctions.map(a => ({
          address: a.address,
          name: a.name,
          status: a.status
        })));

        // 限制最多显示4个"竞拍中"的拍卖
        const displayAuctions = biddingAuctions.slice(0, 4);
        console.log("首页显示的拍卖:", displayAuctions);

        // 设置拍卖数据
        setHotAuctions(displayAuctions);
        setLastRefreshTime(new Date());
        setIsLoadingAuctions(false);
      } catch (error) {
        console.error("Error fetching auctions:", error);
        // 发生错误时设置为空数组
        setHotAuctions([]);
        setIsLoadingAuctions(false);
      }
    };

    // 初始加载
    fetchAuctions();

    // 定期刷新拍卖数据，大幅降低刷新频率
    const refreshInterval = targetNetwork.id === 31337 ? 30000 : 60000; // 本地网络每30秒刷新一次，外部网络每60秒
    console.log(`设置拍卖数据刷新间隔: ${refreshInterval}ms`);

    const intervalId = setInterval(fetchAuctions, refreshInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [publicClient, factoryContractData, blindAuctionData, targetNetwork.id, nftContractData]);

  // 计算当前阶段
  const getCurrentPhaseText = () => {
    if (!contractData) return "竞拍阶段";

    const phase = Number(contractData);
    switch (phase) {
      case 0:
        return "竞拍阶段";
      case 1:
        return "揭示阶段";
      case 2:
        return "已结束";
      default:
        return "未知状态";
    }
  };

  // 格式化时间
  const formatTime = (timestamp: bigint | undefined) => {
    if (!timestamp) return "未知";
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString();
  };

  // 导航到竞拍页面
  const handleBidNow = () => {
    router.push("/bid");
  };

  // 盲拍流程步骤
  const steps = [
    {
      title: "1. 准备竞拍",
      description: "准备以太币并连接钱包，确保有足够的资金和Gas费用用于竞拍。",
    },
    {
      title: "2. 提交盲拍",
      description: "在竞拍阶段，计算您的竞拍哈希，并附带押金提交您的出价，无人知道您的实际出价金额。",
    },
    {
      title: "3. 揭示出价",
      description: "在揭示阶段，公开您的实际出价、是否为假出价以及密钥。系统将验证您的出价并找出最高出价者。",
    },
    {
      title: "4. 查看结果",
      description: "拍卖结束后，最高出价者获得拍品，未中标者可以取回押金。",
    },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
      {/* 添加额外的渐变装饰层 */}
      <div className="absolute inset-0">
        {/* 左上角渐变 */}
        <div className="absolute top-0 left-0 w-1/3 h-1/3 bg-gradient-radial from-[#0a0058]/30 to-transparent"></div>

        {/* 右下角渐变 */}
        <div className="absolute bottom-0 right-0 w-1/3 h-1/3 bg-gradient-radial from-[#0a0058]/30 to-transparent"></div>

        {/* 中心光晕 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-radial from-[#060050]/50 via-[#040045]/30 to-transparent"></div>
      </div>

      {/* 添加微妙的网格纹理 */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,0,81,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(6,0,81,0.1)_1px,transparent_1px)] bg-[size:100px_100px]"></div>

      {/* 星光效果容器 */}
      <div className="star-container absolute inset-0 pointer-events-none z-10"></div>
      {/* 流星雨特效 */}
      <MeteorRain count={50} minDuration={6} maxDuration={15} />

      {/* 流星效果 - 修改为使用状态 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {shootingStars.map((star, i) => (
          <div
            key={i}
            className="shooting-star"
            style={{
              top: star.top,
              left: star.left,
              animationDelay: star.delay,
              animationDuration: star.duration,
            }}
          ></div>
        ))}
      </div>

      {/* 跟随光标 */}
      <div
        className="fixed w-6 h-6 pointer-events-none z-50 mix-blend-screen"
        style={{
          transform: `translate(${cursorPosition.x - 12}px, ${cursorPosition.y - 12}px)`,
          transition: "transform 0.05s ease-out",
        }}
      >
        <div className="w-full h-full rounded-full bg-gradient-to-r from-blue-400 to-purple-500 opacity-70 blur-sm"></div>
      </div>

      {/* 科技感背景装饰 */}
      <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-transparent to-purple-500"></div>

      {/* 光晕效果 */}
      <div className="absolute top-20 -left-40 w-80 h-80 bg-cyan-500/20 rounded-full filter blur-[100px] animate-pulse"></div>
      <div className="absolute bottom-20 -right-40 w-80 h-80 bg-purple-500/20 rounded-full filter blur-[100px] animate-pulse"></div>

      {/* 装饰线条 */}
      {/* <div className="absolute left-4 top-1/4 w-40 h-[2px] bg-cyan-500/50"></div>
      <div className="absolute right-4 top-1/3 w-40 h-[2px] bg-purple-500/50"></div>
      <div className="absolute left-8 bottom-1/4 w-20 h-[2px] bg-pink-500/50"></div> */}

      {/* 科技装饰元素 */}
      <div className="absolute left-6 top-40 w-20 h-20 border-l-2 border-t-2 border-cyan-500/50"></div>
      <div className="absolute right-6 bottom-40 w-20 h-20 border-r-2 border-b-2 border-purple-500/50"></div>

      {/* 重新设计的头部和核心内容区域 */}
      <div className="container mx-auto px-4 py-10 relative z-10">
        {/* 顶部导航区域 */}
        <div className="flex justify-between items-center mb-12">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center mr-3">
              <span className="text-xl text-white font-bold">B</span>
            </div>
            <h2 className="text-xl font-bold text-white">BlockAuction</h2>
          </div>

          <div className="flex space-x-2">
            <Link
              href="/debug"
              className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-800/50 transition-all"
            >
              合约
            </Link>
            <Link
              href="/bid"
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm hover:opacity-90 transition-all"
            >
              立即竞拍
            </Link>
          </div>
        </div>

        {/* 主标题区 - 大型居中标题 */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-500 neon-text inline-block">
            区块链盲拍平台
          </h1>
          <div className="h-1 w-40 bg-gradient-to-r from-purple-600 via-indigo-500 to-blue-600 mx-auto mt-4 rounded-full"></div>
          <p className="mt-6 text-slate-300 max-w-2xl mx-auto text-lg">
            基于区块链技术的匿名竞价系统，确保拍卖的公平性和透明度。
            您的出价将被加密保护，避免传统拍卖中的跟风出价问题。
          </p>
        </div>

        {/* 中央展示区域 - 两列布局 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center mb-16">
          {/* 左侧：3D星球展示 */}
          <div className="flex justify-center order-2 lg:order-1">
            <div className="relative w-96 h-96"> {/* 从w-80 h-80增加到w-96 h-96 */}
              {/* 星球光晕背景 */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-indigo-600/20 animate-pulse filter blur-xl"></div>

              {/* 真正的3D球体 - 使用Canvas渲染 */}
              <div className="relative w-full h-full rounded-full overflow-hidden bg-transparent">
                <Canvas3DSphere />

                {/* 大气层效果 */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-600/10 via-transparent to-purple-600/10 animate-pulse pointer-events-none"></div>
              </div>

              {/* 行星环 */}
              {/* <div className="planet-ring"></div> */}

              {/* 环绕陨石带 - 全新3D立体设计 */}
              <div className="asteroid-belt-3d">
                {/* 内层陨石环 - 前景层 */}
                <div className="asteroid-ring-3d inner-ring">
                  {Array.from({ length: 12 }).map((_, i) => {
                    const angle = (i * 2 * Math.PI) / 12;
                    const radiusX = 42;
                    const radiusY = 42;
                    const centerX = 50;
                    const centerY = 50;

                    const x = centerX + radiusX * Math.cos(angle);
                    const y = centerY + radiusY * Math.sin(angle);

                    // 根据角度计算Z深度感
                    const zDepth = Math.sin(angle) * 0.5 + 0.5; // 0-1之间
                    const scale = 0.6 + zDepth * 0.4; // 0.6-1.0缩放
                    const opacity = 0.4 + zDepth * 0.6; // 0.4-1.0透明度

                    return (
                      <div
                        key={`inner-${i}`}
                        className="asteroid-3d"
                        style={{
                          position: 'absolute',
                          left: `${Math.max(8, Math.min(92, x))}%`,
                          top: `${Math.max(8, Math.min(92, y))}%`,
                          transform: `translate(-50%, -50%) scale(${scale})`,
                          opacity: opacity,
                          zIndex: Math.floor(zDepth * 10),
                          "--asteroid-size": `${5 + Math.random() * 3}px`,
                          "--twinkle-speed": `${2 + Math.random() * 2}s`,
                          "--asteroid-delay": `${i * 0.2}s`,
                          "--depth-glow": `${zDepth}`,
                        } as any}
                      ></div>
                    );
                  })}
                </div>

                {/* 中层陨石环 */}
                <div className="asteroid-ring-3d middle-ring">
                  {Array.from({ length: 16 }).map((_, i) => {
                    const angle = (i * 2 * Math.PI) / 16 + Math.PI / 16; // 交错排列
                    const radiusX = 45;
                    const radiusY = 45;
                    const centerX = 50;
                    const centerY = 50;

                    const x = centerX + radiusX * Math.cos(angle);
                    const y = centerY + radiusY * Math.sin(angle);

                    const zDepth = Math.sin(angle + Math.PI / 4) * 0.5 + 0.5;
                    const scale = 0.5 + zDepth * 0.5;
                    const opacity = 0.3 + zDepth * 0.5;

                    return (
                      <div
                        key={`middle-${i}`}
                        className="asteroid-3d"
                        style={{
                          position: 'absolute',
                          left: `${Math.max(6, Math.min(94, x))}%`,
                          top: `${Math.max(6, Math.min(94, y))}%`,
                          transform: `translate(-50%, -50%) scale(${scale})`,
                          opacity: opacity,
                          zIndex: Math.floor(zDepth * 8),
                          "--asteroid-size": `${5 + Math.random() * 3}px`,
                          "--twinkle-speed": `${2.5 + Math.random() * 2.5}s`,
                          "--asteroid-delay": `${i * 0.15}s`,
                          "--depth-glow": `${zDepth}`,
                        } as any}
                      ></div>
                    );
                  })}
                </div>

                {/* 外层陨石环 - 背景层 */}
                <div className="asteroid-ring-3d outer-ring">
                  {Array.from({ length: 20 }).map((_, i) => {
                    const angle = (i * 2 * Math.PI) / 20 + Math.PI / 10;
                    const radiusX = 48;
                    const radiusY = 48;
                    const centerX = 50;
                    const centerY = 50;

                    const x = centerX + radiusX * Math.cos(angle);
                    const y = centerY + radiusY * Math.sin(angle);

                    const zDepth = Math.sin(angle - Math.PI / 3) * 0.5 + 0.5;
                    const scale = 0.4 + zDepth * 0.4;
                    const opacity = 0.2 + zDepth * 0.4;

                    return (
                      <div
                        key={`outer-${i}`}
                        className="asteroid-3d"
                        style={{
                          position: 'absolute',
                          left: `${Math.max(4, Math.min(96, x))}%`,
                          top: `${Math.max(4, Math.min(96, y))}%`,
                          transform: `translate(-50%, -50%) scale(${scale})`,
                          opacity: opacity,
                          zIndex: Math.floor(zDepth * 6),
                          "--asteroid-size": `${5 + Math.random() * 3}px`,
                          "--twinkle-speed": `${3 + Math.random() * 3}s`,
                          "--asteroid-delay": `${i * 0.1}s`,
                          "--depth-glow": `${zDepth}`,
                        } as any}
                      ></div>
                    );
                  })}
                </div>

                {/* 微粒层 - 增强立体感 */}
                <div className="asteroid-ring-3d particle-layer">
                  {Array.from({ length: 30 }).map((_, i) => {
                    const angle = (i * 2 * Math.PI) / 30 + Math.random() * 0.2;
                    const radiusVariation = 40 + Math.random() * 12; // 40-52的随机半径
                    const radiusX = radiusVariation;
                    const radiusY = radiusVariation;
                    const centerX = 50;
                    const centerY = 50;

                    const x = centerX + radiusX * Math.cos(angle);
                    const y = centerY + radiusY * Math.sin(angle);

                    const zDepth = Math.sin(angle + Math.random()) * 0.5 + 0.5;
                    const scale = 0.3 + zDepth * 0.3;
                    const opacity = 0.1 + zDepth * 0.3;

                    return (
                      <div
                        key={`particle-${i}`}
                        className="asteroid-particle"
                        style={{
                          position: 'absolute',
                          left: `${Math.max(2, Math.min(98, x))}%`,
                          top: `${Math.max(2, Math.min(98, y))}%`,
                          transform: `translate(-50%, -50%) scale(${scale})`,
                          opacity: opacity,
                          zIndex: Math.floor(zDepth * 4),
                          "--asteroid-size": `${5 + Math.random() * 3}px`,
                          "--twinkle-speed": `${4 + Math.random() * 4}s`,
                          "--asteroid-delay": `${i * 0.05}s`,
                          "--depth-glow": `${zDepth}`,
                        } as any}
                      ></div>
                    );
                  })}
                </div>
              </div>

              {/* 星球发散光芒效果 */}
              <div className="planet-rays">
                {/* 主要光芒射线 */}
                {Array.from({ length: 8 }).map((_, i) => {
                  const angle = (i * 360) / 8;
                  return (
                    <div
                      key={`ray-main-${i}`}
                      className="light-ray main-ray"
                      style={{
                        transform: `rotate(${angle}deg)`,
                        animationDelay: `${i * 0.2}s`,
                      }}
                    ></div>
                  );
                })}

                {/* 次要光芒射线 */}
                {Array.from({ length: 16 }).map((_, i) => {
                  const angle = (i * 360) / 16 + 11.25; // 交错排列
                  return (
                    <div
                      key={`ray-secondary-${i}`}
                      className="light-ray secondary-ray"
                      style={{
                        transform: `rotate(${angle}deg)`,
                        animationDelay: `${i * 0.1}s`,
                      }}
                    ></div>
                  );
                })}

                {/* 细微光线 */}
                {Array.from({ length: 24 }).map((_, i) => {
                  const angle = (i * 360) / 24 + 7.5;
                  return (
                    <div
                      key={`ray-subtle-${i}`}
                      className="light-ray subtle-ray"
                      style={{
                        transform: `rotate(${angle}deg)`,
                        animationDelay: `${i * 0.05}s`,
                      }}
                    ></div>
                  );
                })}
              </div>

              {/* 悬浮的数据点 */}
              <div
                className="absolute w-3 h-3 rounded-full bg-cyan-400 top-1/4 right-1/4 shadow-lg shadow-cyan-500/50 animate-ping"
                style={{ animationDuration: "2s" }}
              ></div>
              <div
                className="absolute w-2 h-2 rounded-full bg-purple-400 bottom-1/4 left-1/3 shadow-lg shadow-purple-500/50 animate-ping"
                style={{ animationDuration: "3s" }}
              ></div>
              <div
                className="absolute w-2 h-2 rounded-full bg-blue-400 top-1/3 left-1/4 shadow-lg shadow-blue-500/50 animate-ping"
                style={{ animationDuration: "2.5s" }}
              ></div>

              {/* 装饰性元素 */}
              <div className="absolute -top-6 -left-6 w-4 h-4 bg-blue-500 rounded-full blur-sm animate-pulse"></div>
              <div className="absolute -bottom-6 -right-6 w-4 h-4 bg-purple-500 rounded-full blur-sm animate-pulse"></div>

              {/* 轨道线 */}
              {/* <div className="absolute inset-2 border-2 border-dashed border-blue-500/20 rounded-full"></div>
              <div className="absolute inset-8 border-2 border-dashed border-purple-500/20 rounded-full"></div> */}
            </div>
          </div>

          {/* 右侧：拍卖状态卡片 */}
          <div className="order-1 lg:order-2">
            <div className="bg-gradient-to-br from-slate-800/80 via-slate-900/90 to-slate-800/80 backdrop-blur-md border border-slate-700/50 rounded-xl p-6 shadow-xl relative overflow-hidden transform hover:scale-[1.01] transition-transform duration-300">
              {/* 装饰性元素 */}
              <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/10 rounded-full filter blur-3xl"></div>
              <div className="absolute bottom-0 left-0 w-40 h-40 bg-purple-500/10 rounded-full filter blur-3xl"></div>

              {/* 卡片标题 */}
              <div className="relative mb-6">
                <h3 className="text-2xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400 pb-2">
                  热门拍卖项目
                </h3>
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-24 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500"></div>
              </div>

              {/* 刷新状态指示 */}
              {lastRefreshTime && (
                <div className="text-center mb-4">
                  <span className="text-xs text-slate-400">
                    上次更新: {lastRefreshTime.toLocaleTimeString()}
                  </span>
                </div>
              )}

              {/* 热门拍卖区域 - 添加加载状态 */}
              {isLoadingAuctions && hotAuctions.length === 0 ? (
                <div className="flex justify-center items-center p-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {hotAuctions.length > 0 ? (
                    // 显示热门拍卖，最多4个
                    hotAuctions.slice(0, 4).map((auction, index) => (
                      <Link
                        href={`/auction/${auction.address}`}
                        key={index}
                        className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/30 transition-all duration-300 block hover:shadow-md hover:shadow-blue-500/10 group h-full"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="text-white font-medium flex items-center group-hover:text-blue-400 truncate max-w-[70%]">
                            <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                            {auction.name}
                          </h4>
                          <span className={auction.statusClass + " px-2 py-1 text-xs rounded-full whitespace-nowrap"}>
                            {auction.status}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">最低出价:</span>
                          <span className="text-white font-semibold">
                            {auction.minPrice && auction.minPrice !== "0" ? `${auction.minPrice} ETH` : "暂无"}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                          <span className="text-slate-400">结束时间:</span>
                          <span className="text-white">
                            {auction.endTime}
                          </span>
                        </div>
                        <div className="mt-3 pt-2 border-t border-slate-700/50 flex justify-between items-center text-xs">
                          <span className="text-slate-400">点击查看详情</span>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                            竞拍详情
                          </span>
                        </div>
                      </Link>
                    ))
                  ) : (
                    // 没有拍卖时显示一个提示区域
                    <div className="col-span-2 p-6 rounded-lg bg-slate-800/50 border border-slate-700/50 text-center">
                      <div className="text-4xl mb-3 opacity-50">📭</div>
                      <p className="text-slate-300 mb-2">暂无活跃拍卖</p>
                      <p className="text-slate-400 text-sm">成为第一个创建拍卖的用户！</p>
                    </div>
                  )}

                  {/* 填充空位，确保始终有4个位置，且与现有拍卖项目样式一致 */}
                  {hotAuctions.length > 0 && hotAuctions.length < 4 &&
                    Array.from({ length: 4 - hotAuctions.length }).map((_, index) => (
                      <div
                        key={`empty-${index}`}
                        className="p-4 rounded-lg bg-slate-800/30 border border-slate-700/30 opacity-50 h-full"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="text-white font-medium">等待新拍卖</h4>
                          <span className="px-2 py-1 text-xs rounded-full bg-slate-600/30 border border-slate-500/50 text-slate-300">
                            空闲
                          </span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                          <span className="text-slate-400">状态:</span>
                          <span className="text-white">可创建新拍卖</span>
                        </div>
                        <div className="mt-[62px]"></div> {/* 占位以保持高度一致 */}
                      </div>
                    ))
                  }
                </div>
              )}

              {/* 手动刷新按钮 */}
              <div className="mt-4 text-center">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    if (!isLoadingAuctions) {
                      setIsLoadingAuctions(true);
                      // 使用异步方式调用上面的fetchAuctions函数
                      const fetchData = async () => {
                        try {
                          // 检查是否有可用的合约数据
                          if (!publicClient || !factoryContractData || !blindAuctionData || !nftContractData) return;

                          console.log("手动刷新拍卖数据...");

                          // 获取拍卖总数
                          const count = await publicClient.readContract({
                            address: factoryContractData.address,
                            abi: factoryContractData.abi,
                            functionName: "getAuctionCount",
                          }) as bigint;

                          if (count === 0n) {
                            setHotAuctions([]);
                            setIsLoadingAuctions(false);
                            setLastRefreshTime(new Date());
                            return;
                          }

                          // 获取所有拍卖地址
                          const auctionAddresses = await publicClient.readContract({
                            address: factoryContractData.address,
                            abi: factoryContractData.abi,
                            functionName: "getAuctions",
                            args: [0n, count],
                          }) as `0x${string}`[];

                          // 获取每个拍卖的详细信息 - 完善元数据获取逻辑
                          const auctionsData = await Promise.all(
                            auctionAddresses.map(async (auctionAddress) => {
                              try {
                                // 获取拍卖基本信息
                                const [auctionBiddingEnd, auctionRevealEnd, auctionHighestBid, auctionPhase, auctionBiddingStart] = await Promise.all([
                                  publicClient.readContract({
                                    address: auctionAddress,
                                    abi: blindAuctionData.abi,
                                    functionName: 'biddingEnd',
                                  }),
                                  publicClient.readContract({
                                    address: auctionAddress,
                                    abi: blindAuctionData.abi,
                                    functionName: 'revealEnd',
                                  }),
                                  publicClient.readContract({
                                    address: auctionAddress,
                                    abi: blindAuctionData.abi,
                                    functionName: 'highestBid',
                                  }),
                                  publicClient.readContract({
                                    address: auctionAddress,
                                    abi: blindAuctionData.abi,
                                    functionName: 'getAuctionPhase',
                                  }),
                                  publicClient.readContract({
                                    address: auctionAddress,
                                    abi: blindAuctionData.abi,
                                    functionName: 'biddingStart',
                                  }),
                                ]);

                                // 🔧 完善元数据获取逻辑，与主要逻辑保持一致
                                let metadata = {
                                  name: "未命名拍卖",
                                  description: "无描述",
                                  image: "",
                                  minPrice: "0",
                                };

                                try {
                                  // 首先尝试检查是否为NFT拍卖
                                  const isNFTAuction = await publicClient.readContract({
                                    address: auctionAddress,
                                    abi: blindAuctionData.abi,
                                    functionName: 'isNFTAuction',
                                  }) as boolean;

                                  console.log(`手动刷新拍卖 ${auctionAddress} 是否为NFT拍卖:`, isNFTAuction);

                                  if (isNFTAuction && nftContractData) {
                                    // 获取NFT Token ID和合约地址
                                    const [nftTokenId, nftContractAddress] = await Promise.all([
                                      publicClient.readContract({
                                        address: auctionAddress,
                                        abi: blindAuctionData.abi,
                                        functionName: 'nftTokenId',
                                      }) as Promise<bigint>,
                                      publicClient.readContract({
                                        address: auctionAddress,
                                        abi: blindAuctionData.abi,
                                        functionName: 'nftContract',
                                      }) as Promise<`0x${string}`>
                                    ]);

                                    console.log(`手动刷新NFT拍卖 - Token ID: ${nftTokenId}, 合约地址: ${nftContractAddress}`);

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

                                        console.log("从NFT合约获取到手动刷新拍卖的元数据:", metadata);
                                      } catch (nftError) {
                                        console.error("从NFT合约获取手动刷新拍卖元数据失败:", nftError);
                                      }
                                    }
                                  }

                                  // 如果从NFT合约获取失败或不是NFT拍卖，尝试从事件日志获取
                                  if (!metadata.image) {
                                    console.log("尝试从事件日志获取手动刷新拍卖的元数据...");
                                    const logs = await publicClient.getContractEvents({
                                      address: factoryContractData.address,
                                      abi: factoryContractData.abi,
                                      eventName: 'AuctionCreated',
                                      args: { auctionAddress: auctionAddress },
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
                                          console.log("从事件日志获取到手动刷新拍卖的元数据:", metadata);
                                        } catch (e) {
                                          console.error("解析手动刷新拍卖元数据字符串失败:", e);
                                        }
                                      }
                                    }
                                  }
                                } catch (error) {
                                  console.error("获取手动刷新拍卖元数据失败:", error);
                                }

                                // 确定拍卖状态和样式
                                let status: "未开始" | "竞拍中" | "揭示中" | "已结束" = "竞拍中";
                                let statusClass = "bg-blue-600/30 border border-blue-500/50 text-blue-300";

                                // 🔧 修复：与主要逻辑保持一致的状态判断
                                const currentTime = Math.floor(Date.now() / 1000);
                                const biddingStartTime = Number(auctionBiddingStart);
                                const biddingEndTime = Number(auctionBiddingEnd);
                                const revealEndTime = Number(auctionRevealEnd);

                                console.log(`手动刷新拍卖 ${auctionAddress} 状态判断:`, {
                                  currentTime,
                                  biddingStartTime,
                                  biddingEndTime,
                                  revealEndTime,
                                  contractPhase: Number(auctionPhase),
                                });

                                // 严格按照竞拍记录页面的逻辑进行状态判断
                                if (currentTime >= revealEndTime) {
                                  status = "已结束";
                                  statusClass = "bg-gray-600/30 border border-gray-500/50 text-gray-300";
                                } else if (currentTime >= biddingEndTime) {
                                  status = "揭示中";
                                  statusClass = "bg-yellow-600/30 border border-yellow-500/50 text-yellow-300";
                                } else if (currentTime >= biddingStartTime) {
                                  status = "竞拍中";
                                  statusClass = "bg-emerald-600/30 border border-emerald-500/50 text-emerald-300";
                                } else {
                                  status = "未开始";
                                  statusClass = "bg-blue-600/30 border border-blue-500/50 text-blue-300";
                                }

                                console.log(`手动刷新拍卖 ${auctionAddress} 最终状态:`, status);

                                // 格式化结束时间
                                const endTime = status === "竞拍中"
                                  ? new Date(Number(auctionBiddingEnd) * 1000).toLocaleString()
                                  : status === "揭示中"
                                    ? new Date(Number(auctionRevealEnd) * 1000).toLocaleString()
                                    : "已结束";

                                // 格式化出价
                                const formattedBid = auctionHighestBid ?
                                  auctionHighestBid === 0n ? "0" :
                                    parseFloat(formatEther(auctionHighestBid)).toLocaleString('en-US', {
                                      maximumSignificantDigits: 6,
                                      useGrouping: false
                                    }) : "0";

                                // 格式化最低出价
                                const formattedMinPrice = metadata.minPrice ?
                                  parseFloat(formatEther(BigInt(metadata.minPrice))).toLocaleString('en-US', {
                                    maximumSignificantDigits: 6,
                                    useGrouping: false
                                  }) : "0";

                                return {
                                  address: auctionAddress,
                                  name: metadata.name || "未命名拍卖",
                                  status,
                                  statusClass,
                                  highestBid: formattedBid,
                                  endTime,
                                  winner: undefined,
                                  minPrice: formattedMinPrice
                                } as AuctionItem;
                              } catch (error) {
                                console.error(`获取拍卖 ${auctionAddress} 信息失败:`, error);
                                return null;
                              }
                            })
                          );

                          // 过滤有效拍卖
                          const validAuctions = auctionsData.filter(Boolean) as AuctionItem[];

                          // 🔧 修复：只显示"竞拍中"状态的拍卖，严格按照用户要求
                          const biddingAuctions = validAuctions.filter(auction => auction.status === "竞拍中");
                          console.log("竞拍中的拍卖数量:", biddingAuctions.length);
                          console.log("竞拍中的拍卖详情:", biddingAuctions.map(a => ({
                            address: a.address,
                            name: a.name,
                            status: a.status
                          })));

                          // 限制最多显示4个"竞拍中"的拍卖
                          const displayAuctions = biddingAuctions.slice(0, 4);
                          console.log("首页显示的拍卖:", displayAuctions);

                          // 更新状态
                          setHotAuctions(displayAuctions);
                          setLastRefreshTime(new Date());
                        } catch (error) {
                          console.error("手动刷新拍卖数据失败:", error);
                        } finally {
                          setIsLoadingAuctions(false);
                        }
                      };

                      fetchData();
                    }
                  }}
                  className="px-3 py-1.5 text-xs rounded-md bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 transition-colors flex items-center mx-auto"
                  disabled={isLoadingAuctions}
                >
                  {isLoadingAuctions ? (
                    <>
                      <span className="w-3 h-3 border-t-2 border-blue-400 rounded-full animate-spin mr-2"></span>
                      刷新中...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      刷新拍卖
                    </>
                  )}
                </button>
              </div>

              {/* 操作按钮 */}
              <div className="mt-6 flex justify-center gap-4">
                <Link
                  href="/all-auctions"
                  className="px-5 py-2.5 rounded-full bg-gradient-to-r from-violet-600 to-blue-600 text-white font-medium hover:opacity-90 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/40 text-center text-sm"
                >
                  浏览更多拍卖
                </Link>
                <Link
                  href="/create-auction"
                  className="px-5 py-2.5 rounded-full bg-gradient-to-r from-green-600 to-teal-600 text-white font-medium hover:opacity-90 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-green-500/40 text-center text-sm"
                >
                  创建新拍卖
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* 步骤指导 */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl text-center font-bold mb-12 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            盲拍流程 — 简单四步完成
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                {/* 连接线 */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-10 left-full w-full h-0.5 bg-gradient-to-r from-blue-500/30 to-transparent z-0"></div>
                )}

                <div className="bg-gradient-to-b from-slate-800/50 to-slate-900/70 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 relative z-10 h-full transform transition-transform hover:scale-105 duration-300">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600/20 to-purple-600/20 flex items-center justify-center mb-6 mx-auto border border-blue-500/30">
                    <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                      {index + 1}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white text-center mb-4">{step.title.split(".")[1]}</h3>
                  <p className="text-slate-400 text-center">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 功能导航区域 */}
        <div className="py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {/* 创建拍卖卡片 */}
            <div onClick={() => router.push("/create-auction")} className="group cursor-pointer">
              <div className="bg-gradient-to-b from-green-900/20 to-green-950/40 backdrop-blur-sm border border-green-700/30 rounded-xl p-6 transition-all duration-300 group-hover:transform group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-green-500/20 h-full flex flex-col">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-6 mx-auto">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-8 h-8 text-green-400"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                </div>

                <h3 className="text-xl font-semibold text-white text-center mb-4">创建拍卖</h3>
                <p className="text-slate-400 text-center mb-6 flex-grow">
                  发起您自己的盲拍拍卖，设置拍卖物品、起始价格、竞拍和揭示时间，让其他用户参与竞拍。
                </p>

                <div className="mt-auto text-center">
                  <span className="inline-block px-4 py-2 bg-green-500/20 text-green-300 rounded-full text-sm font-medium group-hover:bg-green-500 group-hover:text-white transition-all duration-300">
                    创建新拍卖
                  </span>
                </div>
              </div>
            </div>

            {/* 浏览拍卖卡片 */}
            <div onClick={() => router.push("/all-auctions")} className="group cursor-pointer">
              <div className="bg-gradient-to-b from-blue-900/20 to-blue-950/40 backdrop-blur-sm border border-blue-700/30 rounded-xl p-6 transition-all duration-300 group-hover:transform group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-blue-500/20 h-full flex flex-col">
                <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-6 mx-auto">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-8 h-8 text-blue-400"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                    />
                  </svg>
                </div>

                <h3 className="text-xl font-semibold text-white text-center mb-4">浏览所有拍卖</h3>
                <p className="text-slate-400 text-center mb-6 flex-grow">
                  查看平台上所有进行中的拍卖，按状态筛选和搜索，找到您感兴趣的拍卖项目并参与竞拍。
                </p>

                <div className="mt-auto text-center">
                  <span className="inline-block px-4 py-2 bg-blue-500/20 text-blue-300 rounded-full text-sm font-medium group-hover:bg-blue-500 group-hover:text-white transition-all duration-300">
                    浏览拍卖
                  </span>
                </div>
              </div>
            </div>

            {/* 我的拍卖卡片 */}
            <div onClick={() => router.push("/my-auctions")} className="group cursor-pointer">
              <div className="bg-gradient-to-b from-purple-900/20 to-purple-950/40 backdrop-blur-sm border border-purple-700/30 rounded-xl p-6 transition-all duration-300 group-hover:transform group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-purple-500/20 h-full flex flex-col">
                <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mb-6 mx-auto">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-8 h-8 text-purple-400"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                    />
                  </svg>
                </div>

                <h3 className="text-xl font-semibold text-white text-center mb-4">我的拍卖</h3>
                <p className="text-slate-400 text-center mb-6 flex-grow">
                  管理您创建的拍卖和参与竞拍的项目，查看拍卖状态、竞拍记录和收益情况。
                </p>

                <div className="mt-auto text-center">
                  <span className="inline-block px-4 py-2 bg-purple-500/20 text-purple-300 rounded-full text-sm font-medium group-hover:bg-purple-500 group-hover:text-white transition-all duration-300">
                    我的拍卖
                  </span>
                </div>
              </div>
            </div>

            {/* 数据分析卡片 */}
            <div onClick={() => router.push("/analytics")} className="group cursor-pointer">
              <div className="bg-gradient-to-b from-cyan-900/20 to-cyan-950/40 backdrop-blur-sm border border-cyan-700/30 rounded-xl p-6 transition-all duration-300 group-hover:transform group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-cyan-500/20 h-full flex flex-col">
                <div className="w-16 h-16 rounded-full bg-cyan-500/20 flex items-center justify-center mb-6 mx-auto">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-8 h-8 text-cyan-400"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                    />
                  </svg>
                </div>

                <h3 className="text-xl font-semibold text-white text-center mb-4">数据分析</h3>
                <p className="text-slate-400 text-center mb-6 flex-grow">
                  查看平台的统计数据和分析报告，了解拍卖趋势、用户活跃度和市场表现等关键指标。
                </p>

                <div className="mt-auto text-center">
                  <span className="inline-block px-4 py-2 bg-cyan-500/20 text-cyan-300 rounded-full text-sm font-medium group-hover:bg-cyan-500 group-hover:text-white transition-all duration-300">
                    查看数据
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 特性区域 - 优化设计 */}
        <div className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              盲拍平台优势
            </h2>
            <div className="h-1 w-20 bg-gradient-to-r from-blue-500 to-purple-500 mx-auto mt-4 rounded-full"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
            <div className="bg-gradient-to-b from-slate-800/50 to-slate-900/70 backdrop-blur-sm border border-slate-700/30 rounded-xl p-8 transition-all duration-300 hover:transform hover:scale-105 hover:shadow-lg hover:shadow-blue-500/10 h-full">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600/20 to-blue-400/10 flex items-center justify-center mb-6 mx-auto border border-blue-500/30">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-8 h-8 text-blue-400"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white text-center mb-4">匿名出价</h3>
              <p className="text-slate-400 text-center">
                所有出价都经过加密处理，只有在揭示阶段才能知道实际出价，确保公平竞争，避免竞拍者之间的策略性跟风。
              </p>
            </div>

            <div className="bg-gradient-to-b from-slate-800/50 to-slate-900/70 backdrop-blur-sm border border-slate-700/30 rounded-xl p-8 transition-all duration-300 hover:transform hover:scale-105 hover:shadow-lg hover:shadow-purple-500/10 h-full">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-600/20 to-purple-400/10 flex items-center justify-center mb-6 mx-auto border border-purple-500/30">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-8 h-8 text-purple-400"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white text-center mb-4">区块链保障</h3>
              <p className="text-slate-400 text-center">
                基于以太坊智能合约，所有交易和出价记录都存储在区块链上，不可篡改，完全透明，可被任何人验证。
              </p>
            </div>

            <div className="bg-gradient-to-b from-slate-800/50 to-slate-900/70 backdrop-blur-sm border border-slate-700/30 rounded-xl p-8 transition-all duration-300 hover:transform hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/10 h-full">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-600/20 to-cyan-400/10 flex items-center justify-center mb-6 mx-auto border border-cyan-500/30">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-8 h-8 text-cyan-400"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white text-center mb-4">自动退款</h3>
              <p className="text-slate-400 text-center">
                未中标的出价者可以自动取回押金，最高出价者的出价则会自动转给受益人，简化了传统拍卖的结算流程。
              </p>
            </div>
          </div>
        </div>

        {/* CTA区域 - 改进设计 */}
        <div className="mb-20">
          <div className="relative max-w-5xl mx-auto bg-gradient-to-br from-slate-800/50 via-slate-900/80 to-slate-800/50 backdrop-blur-md border border-slate-700/50 rounded-2xl p-12 text-center shadow-xl overflow-hidden transform hover:scale-[1.01] transition-transform duration-500">
            {/* 背景装饰 */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-20">
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500 rounded-full filter blur-3xl"></div>
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500 rounded-full filter blur-3xl"></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/20 rounded-full filter blur-3xl"></div>
              <div className="absolute top-0 left-0 w-full h-full bg-grid-pattern opacity-30"></div>
            </div>

            {/* 内容 */}
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">准备好参与盲拍了吗？</h2>
              <p className="text-lg mb-10 text-slate-300 mx-auto max-w-2xl">
                立即连接您的钱包，参与这场基于区块链的匿名竞价，体验透明、公正、无中介的拍卖流程。
              </p>
              <Link href="/all-auctions">
                <button className="px-8 py-4 rounded-full bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold hover:opacity-90 transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/40">
                  立即参与拍卖
                </button>
              </Link>
            </div>

            {/* 装饰元素 */}
            <div className="absolute top-6 left-6 w-12 h-12 border-t-2 border-l-2 border-blue-500/30 rounded-tl-lg"></div>
            <div className="absolute bottom-6 right-6 w-12 h-12 border-b-2 border-r-2 border-purple-500/30 rounded-br-lg"></div>
          </div>
        </div>

        {/* 页脚 */}
        <div className="border-t border-slate-800 pt-10 pb-20">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center mr-2">
                <span className="text-sm text-white font-bold">B</span>
              </div>
              <span className="text-slate-400">BlockAuction © 2023</span>
            </div>

            <div className="flex space-x-6">
              <Link href="/" className="text-slate-400 hover:text-blue-400 transition-colors">
                首页
              </Link>
              <Link href="/bid" className="text-slate-400 hover:text-blue-400 transition-colors">
                竞拍
              </Link>
              <Link href="/my-bids" className="text-slate-400 hover:text-blue-400 transition-colors">
                我的竞拍
              </Link>
              <Link href="/reveal" className="text-slate-400 hover:text-blue-400 transition-colors">
                揭示
              </Link>
              <Link href="/results" className="text-slate-400 hover:text-blue-400 transition-colors">
                结果
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
