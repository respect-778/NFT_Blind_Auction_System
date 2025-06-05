'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAccount, usePublicClient } from 'wagmi';
import { Address } from "~~/components/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { useDeployedContractInfo } from '~~/hooks/scaffold-eth';
import { useTargetNetwork } from '~~/hooks/scaffold-eth';
import { ethers } from 'ethers';

// 添加格式化时间的函数
const formatTime = (timestamp: any) => {
  if (!timestamp) return "未知";
  try {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString();
  } catch (error) {
    console.error("Error formatting time:", error);
    return "格式错误";
  }
};

export default function ResultsPage() {
  const searchParams = useSearchParams();
  const { address } = useAccount();
  const [phase, setPhase] = useState<number>(0);
  const [isClient, setIsClient] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [pendingAmount, setPendingAmount] = useState<string>("0");
  const [auctionEnded, setAuctionEnded] = useState(false);
  const [isEndingAuction, setIsEndingAuction] = useState(false);
  const [highestBidder, setHighestBidder] = useState<string | null>(null);
  const [highestBid, setHighestBid] = useState<string>("0");
  const [beneficiary, setBeneficiary] = useState<string | null>(null);
  const [biddingEndTime, setBiddingEndTime] = useState<string>("未知");
  const [revealEndTime, setRevealEndTime] = useState<string>("未知");
  const [ended, setEnded] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [auctionEndCalled, setAuctionEndCalled] = useState<boolean>(false);

  // 从URL参数获取拍卖地址
  const auctionAddress = searchParams.get('address') as `0x${string}` | null;

  // 获取网络和合约信息
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const { data: blindAuctionData } = useDeployedContractInfo("BlindAuction");

  // 通过localStorage确定用户是否已揭示过出价
  const [userHasRevealed, setUserHasRevealed] = useState(false);
  const [hasPendingReturn, setHasPendingReturn] = useState(false);

  // 格式化ETH显示的辅助函数
  const formatEth = (value: bigint | number | string | undefined): string => {
    if (value === undefined || value === null) return "0 ETH";
    try {
      // 处理字符串
      if (typeof value === 'string') {
        // 如果字符串包含ETH或已经格式化，直接返回
        if (value.includes('ETH')) return value;

        // 尝试移除所有非数字字符（保留小数点）
        const cleanedValue = value.replace(/[^\d.]/g, '');
        if (!cleanedValue || isNaN(Number(cleanedValue))) return "0 ETH";
        return `${(Number(cleanedValue) / 10 ** 18).toFixed(4)} ETH`;
      }

      // 处理bigint
      if (typeof value === 'bigint') {
        // 安全地将bigint转换为字符串，然后处理
        const valueInEth = Number(value) / 10 ** 18;
        return isNaN(valueInEth) ? "0 ETH" : `${valueInEth.toFixed(4)} ETH`;
      }

      // 处理number
      if (typeof value === 'number') {
        if (isNaN(value)) return "0 ETH";
        // 假设输入的数字单位已经是ETH
        if (value < 1000000) { // 小值可能已经是ETH单位
          return `${value.toFixed(4)} ETH`;
        } else { // 大值可能是wei单位
          return `${(value / 10 ** 18).toFixed(4)} ETH`;
        }
      }

      return "0 ETH";
    } catch (error) {
      console.error("Error formatting ETH:", error);
      return "0 ETH";
    }
  };

  // 获取合约状态
  useEffect(() => {
    const fetchAuctionStatus = async () => {
      if (!publicClient || !blindAuctionData || !auctionAddress) {
        console.log("缺少获取拍卖状态所需数据:", {
          hasPublicClient: !!publicClient,
          hasContractData: !!blindAuctionData,
          auctionAddress
        });
        return;
      }

      try {
        console.log("开始从合约获取拍卖状态:", auctionAddress);

        // 首先验证合约是否存在
        const code = await publicClient.getBytecode({ address: auctionAddress });
        if (!code || code === '0x') {
          console.error("拍卖合约地址无效或合约不存在:", auctionAddress);
          return;
        }

        // 获取竞拍基本信息
        const [
          currentPhaseResult,
          highestBidderResult,
          highestBidResult,
          beneficiaryResult,
          endedResult,
          biddingEndResult,
          revealEndResult
        ] = await Promise.all([
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'getAuctionPhase',
          }).catch(e => {
            console.error("获取拍卖阶段失败:", e);
            return 0;
          }),
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'highestBidder',
          }).catch(e => {
            console.error("获取最高出价者失败:", e);
            return "0x0000000000000000000000000000000000000000";
          }),
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'highestBid',
          }).catch(e => {
            console.error("获取最高出价失败:", e);
            return BigInt(0);
          }),
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'beneficiary',
          }).catch(e => {
            console.error("获取受益人失败:", e);
            return null;
          }),
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'ended',
          }).catch(e => {
            console.error("获取拍卖结束状态失败:", e);
            return false;
          }),
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'biddingEnd',
          }).catch(e => {
            console.error("获取竞拍结束时间失败:", e);
            return 0;
          }),
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'revealEnd',
          }).catch(e => {
            console.error("获取揭示结束时间失败:", e);
            return 0;
          }),
        ]);

        // 打印获取到的原始数据
        console.log("从合约获取的原始数据:", {
          auctionAddress,
          currentPhase: currentPhaseResult,
          highestBidder: highestBidderResult,
          highestBid: typeof highestBidResult === 'bigint' ? highestBidResult.toString() : highestBidResult,
          beneficiary: beneficiaryResult,
          ended: endedResult,
          biddingEnd: biddingEndResult,
          revealEnd: revealEndResult
        });

        // 验证最高出价者不是受益人（防止显示错误）
        if (beneficiaryResult && highestBidderResult &&
          beneficiaryResult.toLowerCase() === highestBidderResult.toLowerCase()) {
          console.warn("检测到最高出价者与受益人地址相同，这可能是个错误。", {
            beneficiary: beneficiaryResult,
            highestBidder: highestBidderResult
          });

          // 如果最高出价者是受益人，且出价为0，则可能是初始状态或数据错误
          if (highestBidResult === BigInt(0) || highestBidResult.toString() === "0") {
            console.warn("最高出价为0，可能是初始状态或数据错误");
          }
        }

        // 设置基本信息
        setHighestBidder(highestBidderResult as string);
        try {
          // 确保高出价是bigint类型并正确格式化
          const highestBidValue = highestBidResult as bigint;
          const formattedBid = formatEth(highestBidValue);
          console.log("处理后的最高出价:", {
            raw: highestBidValue.toString(),
            formatted: formattedBid
          });
          setHighestBid(formattedBid);
        } catch (error) {
          console.error("设置最高出价时出错:", error);
          setHighestBid("0 ETH");
        }
        setBeneficiary(beneficiaryResult as string);
        setEnded(Boolean(endedResult));
        setBiddingEndTime(formatTime(biddingEndResult));
        setRevealEndTime(formatTime(revealEndResult));

        // 确定当前阶段
        const now = Math.floor(Date.now() / 1000);
        let currentPhase = Number(currentPhaseResult);

        // 打印时间信息
        console.log("时间信息:", {
          currentTime: new Date(now * 1000).toLocaleString(),
          biddingEnd: new Date(Number(biddingEndResult) * 1000).toLocaleString(),
          revealEnd: new Date(Number(revealEndResult) * 1000).toLocaleString(),
          nowTimestamp: now,
          biddingEndTimestamp: Number(biddingEndResult),
          revealEndTimestamp: Number(revealEndResult)
        });

        // 根据时间和合约状态确定实际阶段
        if (Boolean(endedResult)) {
          // 如果合约标记为已结束，设置为结束阶段
          currentPhase = 2;
          setAuctionEndCalled(true);
        } else if (now > Number(revealEndResult)) {
          // 如果当前时间超过揭示结束时间，但合约未标记为结束，仍然视为结束阶段
          currentPhase = 2;
          setAuctionEndCalled(false);
        } else if (now > Number(biddingEndResult)) {
          // 如果当前时间超过竞拍结束时间但未超过揭示结束时间，则是揭示阶段
          currentPhase = 1;
          setAuctionEndCalled(false);
        }

        console.log("确定的当前阶段:", currentPhase);
        setPhase(currentPhase);
        // 设置竞拍是否已进入结束阶段（但不一定已调用auctionEnd）
        setAuctionEnded(currentPhase >= 2);

        // 计算剩余时间
        if (currentPhase === 0) {
          setTimeLeft(Number(biddingEndResult) - now);
        } else if (currentPhase === 1) {
          setTimeLeft(Number(revealEndResult) - now);
        } else {
          setTimeLeft(0);
        }
      } catch (error) {
        console.error("获取拍卖状态失败:", error);
      }
    };

    setIsClient(true);
    if (auctionAddress) {
      // 确保地址格式有效
      if (!auctionAddress.startsWith('0x') || auctionAddress.length !== 42) {
        console.error("无效的拍卖地址格式:", auctionAddress);
        return;
      }

      console.log("设置拍卖地址:", auctionAddress);
      fetchAuctionStatus();
      const interval = setInterval(fetchAuctionStatus, 10000); // 每10秒更新一次
      return () => clearInterval(interval);
    } else {
      console.log("未指定拍卖地址");
    }
  }, [publicClient, blindAuctionData, auctionAddress]);

  // 查询用户的揭示状态和可能的退款
  useEffect(() => {
    if (!isClient || !address || !auctionAddress) return;

    try {
      // 检查用户是否有已揭示的出价
      const revealedKey = `revealed_bids_${address}_${auctionAddress}`;
      const revealedBids = localStorage.getItem(revealedKey);
      const hasRevealed = revealedBids ? JSON.parse(revealedBids).length > 0 : false;
      setUserHasRevealed(hasRevealed);

      // 检查用户是否已经提取过押金，如果提取过则不再显示可提取
      const withdrawKey = `withdraw_${address}_${auctionAddress}`;
      const withdrawStatus = localStorage.getItem(withdrawKey);
      const hasWithdrawn = withdrawStatus ? true : false;

      // 根据当前阶段、是否已揭示、是否是最高出价者、是否已提取来判断
      const isUserHighestBidder = address && highestBidder && address.toLowerCase() === highestBidder.toLowerCase();
      const canWithdraw =
        // 已揭示阶段或已结束阶段
        (phase >= 1) &&
        // 已揭示过出价
        hasRevealed &&
        // 不是最高出价者(或者揭示了多个出价，有一些不是最高的)
        (!isUserHighestBidder || (highestBidder && address.toLowerCase() !== highestBidder.toLowerCase())) &&
        // 没有提取过押金
        !hasWithdrawn;

      setHasPendingReturn(Boolean(canWithdraw));

      // 从localStorage读取用户的出价信息，计算可能的退款金额
      if (canWithdraw) {
        const userBids = localStorage.getItem(`bids_${address}`);
        if (userBids) {
          const parsedBids = JSON.parse(userBids);
          const filteredBids = parsedBids.filter((bid: any) =>
            !bid.auctionAddress || bid.auctionAddress === auctionAddress
          );
          const revealedIndices = revealedBids ? JSON.parse(revealedBids) : [];

          // 只计算已揭示的出价的押金
          let totalDeposit = 0;
          filteredBids.forEach((bid: any, index: number) => {
            if (revealedIndices.includes(index)) {
              totalDeposit += parseFloat(bid.deposit || 0);
            }
          });

          setPendingAmount(totalDeposit.toString());
        }
      } else {
        setPendingAmount("0");
      }
    } catch (error) {
      console.error("Error checking user reveal status:", error);
    }
  }, [isClient, address, highestBidder, phase, auctionAddress]);

  // 处理取款
  const handleWithdraw = async () => {
    if (!address) {
      notification.error("请先连接钱包");
      return;
    }

    if (!auctionAddress) {
      notification.error("未指定拍卖地址");
      return;
    }

    if (!hasPendingReturn) {
      notification.error("您没有可提取的押金");
      return;
    }

    if (!blindAuctionData) {
      notification.error("合约数据不可用");
      return;
    }

    try {
      setIsWithdrawing(true);

      // 使用ethers发送交易
      const provider = window.ethereum ? new ethers.BrowserProvider(window.ethereum) : null;
      if (!provider) {
        notification.error("无法获取以太坊提供程序");
        setIsWithdrawing(false);
        return;
      }

      const signer = await provider.getSigner();
      const contract = new ethers.Contract(auctionAddress, blindAuctionData.abi, signer);

      // 执行取款操作
      const tx = await contract.withdraw();
      await tx.wait();

      notification.success("押金提取成功！");

      // 记录已提取状态
      const withdrawKey = `withdraw_${address}_${auctionAddress}`;
      localStorage.setItem(withdrawKey, "true");

      // 更新状态
      setHasPendingReturn(false);
      setPendingAmount("0");
    } catch (error) {
      console.error("Error withdrawing:", error);
      notification.error("押金提取失败");
    } finally {
      setIsWithdrawing(false);
    }
  };

  // 添加结束拍卖函数
  const handleEndAuction = async () => {
    if (!address) {
      notification.error("请先连接钱包");
      return;
    }

    if (!auctionAddress) {
      notification.error("未指定拍卖地址");
      return;
    }

    if (auctionEndCalled) {
      notification.error("拍卖已结束，金额已转入受益人账户");
      return;
    }

    // 检查是否是受益人
    if (beneficiary?.toLowerCase() !== address.toLowerCase()) {
      notification.error("只有受益人可以结束拍卖并领取金额");
      return;
    }

    if (!blindAuctionData) {
      notification.error("合约数据不可用");
      return;
    }

    try {
      setIsEndingAuction(true);

      // 使用ethers发送交易
      const provider = window.ethereum ? new ethers.BrowserProvider(window.ethereum) : null;
      if (!provider) {
        notification.error("无法获取以太坊提供程序");
        setIsEndingAuction(false);
        return;
      }

      const signer = await provider.getSigner();
      const contract = new ethers.Contract(auctionAddress, blindAuctionData.abi, signer);

      // 执行结束拍卖操作
      const tx = await contract.auctionEnd();
      await tx.wait();

      notification.success("拍卖已结束，最高出价金额已转入您的账户！");

      // 更新状态
      setAuctionEndCalled(true);
      setEnded(true);

      // 刷新数据，直接发起新的请求
      if (publicClient && blindAuctionData && auctionAddress) {
        setTimeout(async () => {
          try {
            const endedResult = await publicClient?.readContract({
              address: auctionAddress,
              abi: blindAuctionData.abi,
              functionName: 'ended',
            });
            setEnded(Boolean(endedResult));
            setAuctionEndCalled(Boolean(endedResult));
          } catch (error) {
            console.error("Error refreshing auction status:", error);
          }
        }, 2000);
      }
    } catch (error) {
      console.error("Error ending auction:", error);
      notification.error("结束拍卖失败，请确保揭示阶段已结束且您是受益人");
    } finally {
      setIsEndingAuction(false);
    }
  };

  // 格式化地址显示
  const formatAddress = (address?: string | null) => {
    if (!address) return '未知';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  if (!isClient) {
    return <div className="flex justify-center items-center min-h-[60vh]">
      <span className="loading loading-spinner loading-lg"></span>
    </div>;
  }

  // 根据合约状态调整UI展示逻辑
  const showAuctionResults = () => {
    // 拍卖结束阶段显示最终结果
    if (phase === 2) {
      return true;
    }
    // 揭示阶段也显示当前揭示的结果 - 如果用户已揭示过或有高出价
    if (phase === 1 && (userHasRevealed || (highestBid && BigInt(highestBid.toString()) > 0n))) {
      return true;
    }
    return false;
  };

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
              animationDuration: `${45 + Math.random() * 20}s`
            }}
          ></div>
        ))}
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

      <div className="relative z-10 container mx-auto px-4 py-12">
        <div className="flex flex-col items-center">
          <div className="w-full max-w-4xl">
            {/* 页面标题 */}
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-500 neon-text">
                拍卖结果
              </h1>
              <p className="mt-2 text-slate-300">
                当前状态:
                <span className={`font-medium ml-2 ${phase === 2 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {phase === 0
                    ? "竞拍阶段（需等待拍卖结束后查看结果）"
                    : phase === 1
                      ? "揭示阶段（部分信息可用，最终结果待揭示结束）"
                      : "拍卖已结束（完整结果已可查看）"}
                </span>
              </p>
            </div>

            {!address ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-slate-700 shadow-lg">
                <div className="text-6xl mb-6 opacity-80">🔒</div>
                <h3 className="text-xl font-semibold mb-4 text-white">请连接钱包</h3>
                <p className="text-slate-300 mb-6">您需要连接以太坊钱包来查看拍卖结果</p>
                <button className="btn btn-primary bg-gradient-to-r from-blue-600 to-purple-600 border-0">
                  连接钱包
                </button>
              </div>
            ) : phase === 0 ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-slate-700 shadow-lg">
                <div className="text-6xl mb-6 opacity-80">🔓</div>
                <h3 className="text-xl font-semibold mb-4 text-white">拍卖尚未结束</h3>
                <p className="mb-6 text-slate-300">拍卖结果将在揭示阶段结束后可查看。</p>
                <div className="flex justify-center gap-4">
                  <a href="/bid" className="btn btn-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0">
                    参与竞拍
                  </a>
                  <a href="/my-bids" className="btn btn-lg bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white border-0">
                    我的竞拍记录
                  </a>
                </div>
              </div>
            ) : (
              <div>
                {/* 结果卡片 */}
                <div className="space-y-6">
                  {/* 竞拍成功恭喜卡片 - 只对最高出价者显示 */}
                  {address && highestBidder && address.toLowerCase() === highestBidder.toLowerCase() && phase === 2 && (
                    <div className="bg-gradient-to-r from-green-600/20 via-emerald-600/20 to-teal-600/20 backdrop-blur-md rounded-xl overflow-hidden border border-green-500/50 shadow-lg relative">
                      {/* 庆祝装饰效果 */}
                      <div className="absolute inset-0 overflow-hidden">
                        <div className="absolute top-0 -left-20 w-40 h-40 bg-green-400/10 rounded-full filter blur-[50px] animate-pulse"></div>
                        <div className="absolute bottom-0 -right-20 w-40 h-40 bg-emerald-400/10 rounded-full filter blur-[50px] animate-pulse delay-1000"></div>
                      </div>

                      <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-4 relative">
                        <h3 className="font-bold text-white text-xl flex items-center justify-center">
                          <span className="mr-3 text-2xl animate-bounce">🎉</span>
                          恭喜您竞拍成功！
                          <span className="ml-3 text-2xl animate-bounce">🏆</span>
                        </h3>
                      </div>

                      <div className="p-6 text-center relative z-10">
                        <div className="mb-4">
                          <p className="text-green-200 text-lg font-semibold mb-2">
                            您以 <span className="text-white font-bold text-xl">{highestBid}</span> 的最高出价成功获得了此次拍卖！
                          </p>
                          <p className="text-green-100/80">
                            您的出价是本次拍卖的最高出价，恭喜您获得拍卖物品！
                          </p>
                        </div>

                        <div className="flex items-center justify-center space-x-2 text-green-200/80">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm">您的地址: {formatAddress(address)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 拍卖状态卡片 */}
                  <div className="bg-slate-900/70 backdrop-blur-md rounded-xl overflow-hidden border border-slate-700 shadow-lg">
                    <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4">
                      <h3 className="font-semibold text-white text-lg flex items-center">
                        <span className="mr-2">🏆</span> 拍卖结果概览
                      </h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                          <span className="text-slate-400">拍卖状态</span>
                          <span className={`font-medium ${phase === 2 ? 'text-green-400' : 'text-yellow-400'}`}>
                            {phase === 1 ? "揭示中" : "已结束"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                          <span className="text-slate-400">受益人地址</span>
                          <div className="flex items-center">
                            <span className="text-white text-sm truncate max-w-[150px]">
                              {beneficiary || '未知'}
                            </span>
                            {beneficiary && (
                              <a
                                href={`https://sepolia.etherscan.io/address/${beneficiary}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-1 text-blue-400 hover:text-blue-300"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                          <span className="text-slate-400">竞拍结束时间</span>
                          <span className="text-white">
                            {biddingEndTime}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                          <span className="text-slate-400">揭示结束时间</span>
                          <span className="text-white">
                            {revealEndTime}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                          <span className="text-slate-400">最高出价</span>
                          <span className="text-white font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-blue-500">
                            {highestBid && !highestBid.includes('NaN')
                              ? highestBid
                              : '0 ETH'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                          <span className="text-slate-400">最高出价者</span>
                          {highestBidder ? (
                            <div className="flex items-center">
                              <span className={`text-white text-sm truncate max-w-[150px] ${highestBidder === '0x0000000000000000000000000000000000000000' ? 'font-bold text-green-400' : ''}`}>
                                {highestBidder === '0x0000000000000000000000000000000000000000'
                                  ? '暂无出价者'
                                  : formatAddress(highestBidder)}
                              </span>
                              {highestBidder !== '0x0000000000000000000000000000000000000000' && (
                                <a
                                  href={`https://sepolia.etherscan.io/address/${highestBidder}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-1 text-blue-400 hover:text-blue-300"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">
                              暂无出价者
                            </span>
                          )}
                        </div>
                        {hasPendingReturn && (
                          <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                            <span className="text-slate-400">可退还押金</span>
                            <span className="text-green-400 font-semibold">
                              {pendingAmount} ETH
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 交互卡片 */}
                  <div className="grid grid-cols-1 gap-4">
                    {/* 用户操作卡片 */}
                    {hasPendingReturn && (
                      <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-6 border border-slate-700 shadow-lg">
                        <h3 className="text-lg font-semibold mb-4 text-white flex items-center">
                          <span className="mr-2">💰</span> 提取押金
                        </h3>
                        <p className="text-slate-300 mb-4">
                          您有 <span className="text-green-400 font-semibold">{pendingAmount} ETH</span> 的押金可以提取
                        </p>
                        <button
                          onClick={handleWithdraw}
                          disabled={isWithdrawing || !hasPendingReturn}
                          className={`
                            w-full btn btn-lg 
                            ${isWithdrawing
                              ? 'bg-slate-700'
                              : 'bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700'}
                            text-white border-0 shadow-lg
                          `}
                        >
                          {isWithdrawing ? (
                            <>
                              <span className="loading loading-spinner loading-sm mr-2"></span>
                              处理中...
                            </>
                          ) : (
                            "提取押金"
                          )}
                        </button>
                      </div>
                    )}

                    {/* 查看我的出价 - 调整为始终显示且居中 */}
                    <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-6 border border-slate-700 shadow-lg">
                      <h3 className="text-lg font-semibold mb-4 text-white flex items-center justify-center">
                        <span className="mr-2">📋</span> 我的竞拍记录
                      </h3>
                      <p className="text-slate-300 mb-4 text-center">
                        查看您所有的竞拍记录和状态
                      </p>
                      <div className="flex justify-center items-center">
                        <a
                          href="/my-bids"
                          className="btn btn-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0 shadow-lg flex items-center justify-center px-12 min-w-[200px]"
                        >
                          查看我的竞拍
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* 仅在拍卖未完全结束时显示的状态信息 */}
                  {phase === 1 && (
                    <div className="bg-yellow-900/20 rounded-xl p-5 border border-yellow-800/40 shadow-inner">
                      <h3 className="text-lg font-semibold mb-2 text-yellow-300 flex items-center">
                        <span className="mr-2">⏳</span> 揭示阶段进行中
                      </h3>
                      <p className="text-slate-300">
                        当前正在揭示阶段，最终结果将在揭示阶段结束后确定。如果您还有未揭示的出价，请尽快前往揭示页面进行揭示。
                      </p>
                      <div className="mt-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-slate-400">揭示阶段剩余时间:</span>
                          <span className="text-yellow-300 font-semibold">{timeLeft} 秒</span>
                        </div>
                        <div className="flex justify-center mt-3">
                          <a
                            href="/reveal"
                            className="btn btn-md bg-yellow-700 hover:bg-yellow-600 text-white border-0 px-8"
                          >
                            前往揭示页面
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 已完成拍卖的额外信息 */}
                  {phase === 2 && (
                    <div className="bg-green-900/20 rounded-xl p-5 border border-green-800/40 shadow-inner">
                      <h3 className="text-lg font-semibold mb-2 text-green-300 flex items-center">
                        <span className="mr-2">✅</span> 拍卖已完成
                      </h3>
                      <p className="text-slate-300">
                        拍卖已经结束，所有揭示阶段已完成。最高出价者已经确定，如果您是最高出价者，恭喜您获得了拍卖品！
                        如果您不是最高出价者，您可以提取您的押金。
                      </p>

                      {/* 添加关于收益人收款的提示 */}
                      <div className="mt-4 p-3 bg-blue-900/20 rounded-lg border border-blue-800/30">
                        <p className="text-sm text-slate-300 flex items-center">
                          <span className="text-blue-300 mr-2">ℹ️</span>
                          <span>
                            拍卖结束后，受益人（<span className="text-blue-300">{formatAddress(beneficiary)}</span>）
                            需要手动点击"领取拍卖金额"按钮来获取最高出价金额。
                          </span>
                        </p>

                        {/* 为受益人添加结束拍卖按钮 */}
                        {beneficiary && phase === 2 && !auctionEndCalled && address?.toLowerCase() === beneficiary.toLowerCase() && (
                          <div className="mt-3">
                            <button
                              onClick={handleEndAuction}
                              disabled={isEndingAuction || auctionEndCalled}
                              className={`
                                btn btn-md 
                                ${isEndingAuction
                                  ? 'bg-slate-700'
                                  : 'bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700'}
                                text-white border-0 shadow-lg w-full
                              `}
                            >
                              {isEndingAuction ? (
                                <>
                                  <span className="loading loading-spinner loading-sm mr-2"></span>
                                  处理中...
                                </>
                              ) : (
                                "领取拍卖金额"
                              )}
                            </button>
                            <p className="text-xs text-slate-400 mt-1 text-center">
                              点击此按钮将自动转账最高出价金额到您的账户
                            </p>
                          </div>
                        )}

                        {/* 已结束拍卖的状态显示 */}
                        {auctionEndCalled ? (
                          <div className="mt-3 bg-green-900/30 p-3 rounded-lg border border-green-800/30">
                            <p className="text-sm text-green-300 flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              拍卖已完全结束，最高出价已转入受益人账户
                            </p>
                          </div>
                        ) : (
                          <div className="mt-3 bg-yellow-900/30 p-3 rounded-lg border border-yellow-800/30">
                            <p className="text-sm text-yellow-300 flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              拍卖揭示阶段已结束，但受益人尚未领取拍卖金额
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 导航链接 */}
            <div className="mt-8 flex justify-center space-x-4">
              <a href="/" className="text-slate-400 hover:text-blue-400 transition-colors">
                返回首页
              </a>
              <a href="/my-bids" className="text-slate-400 hover:text-purple-400 transition-colors">
                我的竞拍记录
              </a>
              <a href="/bid" className="text-slate-400 hover:text-cyan-400 transition-colors">
                竞拍页面
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 