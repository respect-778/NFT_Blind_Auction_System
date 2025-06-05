"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth/useScaffoldReadContract";
import { formatEther } from "viem";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { usePublicClient } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";

// 定义一个包含 CSS 变量的类型
interface CustomStyle extends React.CSSProperties {
  "--rotation"?: string;
}

// 定义拍卖项目类型
interface AuctionItem {
  address: string;
  name: string;
  status: "竞拍中" | "揭示中" | "已结束";
  statusClass: string;
  highestBid?: string;
  endTime?: string;
  winner?: string;
}

export default function Home() {
  const router = useRouter();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [activeStep, setActiveStep] = useState(0);
  const [hotAuctions, setHotAuctions] = useState<AuctionItem[]>([]);
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { data: blindAuctionData } = useDeployedContractInfo("BlindAuction");

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

      container.appendChild(star);

      // 动画结束后移除元素
      star.addEventListener("animationend", () => {
        star.remove();
      });
    };

    // 每3秒创建一个新的星星
    const interval = setInterval(createStar, 3000);

    // 初始创建一些星星
    for (let i = 0; i < 3; i++) {
      setTimeout(() => createStar(), i * 1000);
    }

    return () => clearInterval(interval);
  }, []);

  // 从合约读取相关信息
  const { data: contractData } = useScaffoldReadContract({
    contractName: "BlindAuction",
    functionName: "getAuctionPhase",
  });

  const { data: biddingEndTime } = useScaffoldReadContract({
    contractName: "BlindAuction",
    functionName: "biddingEnd",
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
        if (!publicClient || !factoryContractData || !blindAuctionData) return;

        console.log("正在获取拍卖数据...");
        setHotAuctions([]); // 在加载前清空数据

        // 获取拍卖总数
        const count = await publicClient.readContract({
          address: factoryContractData.address,
          abi: factoryContractData.abi,
          functionName: "getAuctionCount",
        }) as bigint;

        console.log("拍卖总数:", count.toString());

        if (count === 0n) {
          setHotAuctions([]);
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
              const [beneficiary, biddingEnd, revealEnd, ended, highestBid, phase] = await Promise.all([
                publicClient.readContract({
                  address,
                  abi: blindAuctionData.abi,
                  functionName: 'beneficiary',
                }),
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
                  functionName: 'ended',
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
              ]);

              // 尝试获取拍卖元数据
              let metadata = {
                name: "未命名拍卖",
                description: "无描述",
                image: "",
                minPrice: "0",
              };

              try {
                // 通过过滤区块日志方式获取创建事件
                const logs = await publicClient.getContractEvents({
                  address: factoryContractData.address,
                  abi: factoryContractData.abi,
                  eventName: 'AuctionCreated',
                  args: {
                    auctionAddress: address
                  },
                  fromBlock: BigInt(0),
                });

                if (logs && logs.length > 0 && logs[0].args) {
                  const metadataStr = logs[0].args.metadata as string;
                  if (metadataStr) {
                    try {
                      metadata = JSON.parse(metadataStr);
                    } catch (e) {
                      console.error("解析元数据字符串失败:", e);
                    }
                  }
                }
              } catch (error) {
                console.error("获取拍卖元数据失败:", error);
              }

              // 确定拍卖状态和样式
              let status: "竞拍中" | "揭示中" | "已结束" = "竞拍中";
              let statusClass = "bg-blue-600/30 border border-blue-500/50 text-blue-300";

              const now = BigInt(Math.floor(Date.now() / 1000));

              if (ended) {
                status = "已结束";
                statusClass = "bg-green-600/30 border border-green-500/50 text-green-300";
              } else if (now > revealEnd) {
                // 如果揭示阶段已过但合约的ended状态还没更新，仍然标记为已结束
                status = "已结束";
                statusClass = "bg-green-600/30 border border-green-500/50 text-green-300";
              } else if (Number(phase) === 1 || now > biddingEnd) {
                status = "揭示中";
                statusClass = "bg-yellow-600/30 border border-yellow-500/50 text-yellow-300";
              }

              // 格式化结束时间
              const endTime = status === "竞拍中"
                ? new Date(Number(biddingEnd) * 1000).toLocaleString()
                : status === "揭示中"
                  ? new Date(Number(revealEnd) * 1000).toLocaleString()
                  : "已结束";

              // 格式化出价，确保小额出价也能正确显示，保留最多6位有效数字
              const formattedBid = highestBid ?
                highestBid === 0n ? "0" :
                  parseFloat(formatEther(highestBid)).toLocaleString('en-US', {
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
                winner: undefined
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

        // 只保留"竞拍中"状态的拍卖
        const biddingAuctions = validAuctions.filter(auction => auction.status === "竞拍中");
        console.log("竞拍中的拍卖数量:", biddingAuctions.length);

        // 限制最多显示4个拍卖
        const displayAuctions = biddingAuctions.slice(0, 4);
        console.log("显示的拍卖:", displayAuctions);

        // 设置拍卖数据
        setHotAuctions(displayAuctions);
      } catch (error) {
        console.error("Error fetching auctions:", error);
        // 发生错误时设置为空数组
        setHotAuctions([]);
      }
    };

    fetchAuctions();

    // 定期刷新拍卖数据
    const intervalId = setInterval(fetchAuctions, 30000); // 每30秒刷新一次

    return () => clearInterval(intervalId);
  }, [publicClient, factoryContractData, blindAuctionData]);

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

      {/* 流星效果 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="shooting-star"
            style={{
              top: `${Math.random() * 50}%`,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 20}s`,
              animationDuration: `${45 + Math.random() * 20}s`,
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
      <div className="absolute left-4 top-1/4 w-40 h-[2px] bg-cyan-500/50"></div>
      <div className="absolute right-4 top-1/3 w-40 h-[2px] bg-purple-500/50"></div>
      <div className="absolute left-8 bottom-1/4 w-20 h-[2px] bg-pink-500/50"></div>

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
            <div className="relative w-80 h-80">
              {/* 星球光晕背景 */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-indigo-600/20 animate-pulse filter blur-xl"></div>

              {/* 星球 */}
              <div className="planet-3d-container">
                <div className="planet-3d">
                  <div className="planet-surface"></div>
                  <div className="planet-atmosphere"></div>
                  <div className="planet-ring"></div>

                  {/* 环绕陨石带 */}
                  <div className="asteroid-belt">
                    {[...Array(12)].map((_, i) => (
                      <div
                        key={i}
                        className="asteroid"
                        style={
                          {
                            "--asteroid-size": `${2 + Math.random() * 4}px`,
                            "--asteroid-distance": `${100 + Math.random() * 60}px`,
                            "--asteroid-speed": `${15 + Math.random() * 25}s`,
                            "--asteroid-delay": `${Math.random() * -20}s`,
                            "--asteroid-y-rotation": `${Math.random() * 360}deg`,
                          } as React.CSSProperties
                        }
                      ></div>
                    ))}
                  </div>
                </div>
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
              <div className="absolute inset-2 border-2 border-dashed border-blue-500/20 rounded-full"></div>
              <div className="absolute inset-8 border-2 border-dashed border-purple-500/20 rounded-full"></div>
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

              {/* 热门拍卖区域 - 统一4个位置的网格布局 */}
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
                        <span className="px-2 py-1 text-xs rounded-full bg-blue-600/30 border border-blue-500/50 text-blue-300 whitespace-nowrap">
                          竞拍中
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">当前出价:</span>
                        <span className="text-white font-semibold">
                          {auction.highestBid && auction.highestBid !== "0" ? `${auction.highestBid} ETH` : "暂无"}
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
            {/* 竞拍导航卡片 */}
            <div onClick={() => router.push("/bid")} className="group cursor-pointer">
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
                      d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>

                <h3 className="text-xl font-semibold text-white text-center mb-4">提交竞拍</h3>
                <p className="text-slate-400 text-center mb-6 flex-grow">
                  在竞拍阶段提交您的加密出价，无人知道您的实际出价金额，所有出价都通过区块链保密存储。
                </p>

                <div className="mt-auto text-center">
                  <span className="inline-block px-4 py-2 bg-blue-500/20 text-blue-300 rounded-full text-sm font-medium group-hover:bg-blue-500 group-hover:text-white transition-all duration-300">
                    去竞拍页面
                  </span>
                </div>
              </div>
            </div>

            {/* 我的竞拍记录卡片 */}
            <div onClick={() => router.push("/my-bids")} className="group cursor-pointer">
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
                      d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z"
                    />
                  </svg>
                </div>

                <h3 className="text-xl font-semibold text-white text-center mb-4">我的竞拍记录</h3>
                <p className="text-slate-400 text-center mb-6 flex-grow">
                  查看您的所有竞拍记录，包括竞拍金额、密钥和状态。在揭示阶段准备好您的揭示信息。
                </p>

                <div className="mt-auto text-center">
                  <span className="inline-block px-4 py-2 bg-purple-500/20 text-purple-300 rounded-full text-sm font-medium group-hover:bg-purple-500 group-hover:text-white transition-all duration-300">
                    查看我的记录
                  </span>
                </div>
              </div>
            </div>

            {/* 揭示竞拍卡片 */}
            <div onClick={() => router.push("/reveal")} className="group cursor-pointer">
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
                      d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>

                <h3 className="text-xl font-semibold text-white text-center mb-4">揭示竞拍</h3>
                <p className="text-slate-400 text-center mb-6 flex-grow">
                  在揭示阶段，提交您的实际出价、密钥和竞拍类型，系统将验证您的出价并确定最高出价者。
                </p>

                <div className="mt-auto text-center">
                  <span className="inline-block px-4 py-2 bg-cyan-500/20 text-cyan-300 rounded-full text-sm font-medium group-hover:bg-cyan-500 group-hover:text-white transition-all duration-300">
                    去揭示页面
                  </span>
                </div>
              </div>
            </div>

            {/* 查看结果卡片 */}
            <div onClick={() => router.push("/results")} className="group cursor-pointer">
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
                      d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0"
                    />
                  </svg>
                </div>

                <h3 className="text-xl font-semibold text-white text-center mb-4">查看拍卖结果</h3>
                <p className="text-slate-400 text-center mb-6 flex-grow">
                  揭示阶段结束后，查看拍卖结果、获胜者和最高出价。如果您未中标，可以取回您的押金。
                </p>

                <div className="mt-auto text-center">
                  <span className="inline-block px-4 py-2 bg-green-500/20 text-green-300 rounded-full text-sm font-medium group-hover:bg-green-500 group-hover:text-white transition-all duration-300">
                    查看拍卖结果
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
              <Link href="/bid">
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
