'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ethers } from 'ethers';
import { useAccount, usePublicClient } from 'wagmi';
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { notification } from "~~/utils/scaffold-eth";
import { Address } from "~~/components/scaffold-eth";
import { MetaHeader } from "~~/components/MetaHeader";
import { formatEther } from 'viem';
import { handleTransactionError, handleTransactionStatus } from "~~/utils/transactionErrorHandler";

// 添加格式化时间的函数
const formatTime = (timestamp: any) => {
  if (!timestamp) return "未知";
  try {
    // 确保timestamp是一个有效的数字
    const timestampNum = Number(timestamp);
    if (isNaN(timestampNum) || timestampNum <= 0) {
      return "时间格式错误";
    }

    // 确保使用整数秒级时间戳
    const date = new Date(timestampNum * 1000);

    // 检查日期是否有效
    if (date.toString() === "Invalid Date") {
      return "日期格式错误";
    }

    // 使用更可靠的日期格式化方法
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch (error) {
    return "格式化错误";
  }
};

function ResultsContent() {
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
  const [timeLeft, setTimeLeft] = useState<string>("00:00:00");
  const [auctionEndCalled, setAuctionEndCalled] = useState<boolean>(false);

  // 添加交易历史相关状态
  const [showTransactionHistory, setShowTransactionHistory] = useState(false);
  const [transactionHistory, setTransactionHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // NFT相关状态
  const [isNFTAuction, setIsNFTAuction] = useState<boolean>(false);
  const [nftTokenId, setNftTokenId] = useState<number>(0);
  const [nftMetadata, setNftMetadata] = useState<any>(null);
  const [nftTransferred, setNftTransferred] = useState<boolean>(false);

  // 从URL参数获取拍卖地址
  const auctionAddress = searchParams.get('address') as `0x${string}` | null;

  // 获取网络和合约信息
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const { data: blindAuctionData } = useDeployedContractInfo("BlindAuction");

  // 通过localStorage确定用户是否已揭示过出价
  const [userHasRevealed, setUserHasRevealed] = useState(false);
  const [hasPendingReturn, setHasPendingReturn] = useState(false);

  // 添加NFT转移加载状态
  const [isTransferring, setIsTransferring] = useState(false);

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
        // 假设输入的数字单位已经是ETH单位
        if (value < 1000000) { // 小值可能已经是ETH单位
          return `${value.toFixed(4)} ETH`;
        } else { // 大值可能是wei单位
          return `${(value / 10 ** 18).toFixed(4)} ETH`;
        }
      }

      return "0 ETH";
    } catch (error) {
      return "0 ETH";
    }
  };

  // 获取交易历史
  const fetchTransactionHistory = async () => {
    if (!publicClient || !blindAuctionData || !auctionAddress) {
      notification.error("无法获取交易历史：缺少必要信息");
      return;
    }

    setLoadingHistory(true);
    try {
      console.log("开始从合约存储获取拍卖交易历史...");

      // 首先获取当前的最高出价信息
      const [currentHighestBidder, currentHighestBid] = await Promise.all([
        publicClient.readContract({
          address: auctionAddress,
          abi: blindAuctionData.abi,
          functionName: 'highestBidder',
        }).catch(e => "0x0000000000000000000000000000000000000000"),
        publicClient.readContract({
          address: auctionAddress,
          abi: blindAuctionData.abi,
          functionName: 'highestBid',
        }).catch(e => BigInt(0)),
      ]);

      const currentHighestBidFormatted = formatEth(currentHighestBid as bigint);

      console.log("当前最高出价者和出价:");
      console.log("- 最高出价者地址:", currentHighestBidder);
      console.log("- 最高出价金额:", currentHighestBid);
      console.log("- 格式化后出价:", currentHighestBidFormatted);

      // 策略1: 从localStorage收集所有可能的参与者地址
      let participantAddresses = new Set<string>();

      // 添加已知的重要地址
      if (address) {
        participantAddresses.add(address);
      }
      if (currentHighestBidder && currentHighestBidder !== "0x0000000000000000000000000000000000000000") {
        participantAddresses.add(currentHighestBidder as string);
      }
      if (beneficiary) {
        participantAddresses.add(beneficiary);
      }

      // 从localStorage收集所有用户的出价记录，寻找参与这个拍卖的地址
      try {
        console.log("从localStorage收集参与者地址...");
        const allStorageKeys = Object.keys(localStorage);

        for (const key of allStorageKeys) {
          if (key.startsWith('bids_')) {
            try {
              const bidData = JSON.parse(localStorage.getItem(key) || '[]');
              if (Array.isArray(bidData)) {
                bidData.forEach((bid: any) => {
                  if (bid.auctionAddress?.toLowerCase() === auctionAddress.toLowerCase()) {
                    // 从存储key中提取用户地址
                    const userAddress = key.replace('bids_', '');
                    participantAddresses.add(userAddress);
                    console.log(`从localStorage发现参与者: ${userAddress}`);
                  }
                });
              }
            } catch (e) {
              console.warn(`解析localStorage key ${key} 失败:`, e);
            }
          }
        }
      } catch (error) {
        console.warn("从localStorage收集参与者地址失败:", error);
      }

      // 策略2: 尝试从最近的事件日志获取更多参与者（限制范围避免请求过多）
      try {
        console.log("从最近事件日志补充参与者地址...");
        const currentBlock = await publicClient.getBlockNumber();
        const searchFromBlock = currentBlock > 1000n ? currentBlock - 1000n : 0n;

        const recentBidEvents = await publicClient.getContractEvents({
          address: auctionAddress,
          abi: blindAuctionData.abi,
          eventName: 'BidSubmitted',
          fromBlock: searchFromBlock,
          toBlock: currentBlock,
        });

        recentBidEvents.forEach((event: any) => {
          if (event.args?.bidder) {
            participantAddresses.add(event.args.bidder);
            console.log(`从事件日志发现参与者: ${event.args.bidder}`);
          }
        });
      } catch (eventError) {
        console.warn("从事件日志获取参与者失败:", eventError);
      }

      console.log(`总共发现 ${participantAddresses.size} 个候选参与者`);

      // 策略3: 验证每个候选地址是否真的有出价
      const participantChecks = await Promise.all(
        Array.from(participantAddresses).map(async (candidateAddress) => {
          try {
            const bidCount = await publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionData.abi,
              functionName: 'getBidCount',
              args: [candidateAddress as `0x${string}`],
            }) as bigint;

            const bidCountNum = Number(bidCount);
            if (bidCountNum > 0) {
              console.log(`✅ ${candidateAddress} 有 ${bidCountNum} 个出价`);
              return candidateAddress;
            } else {
              console.log(`❌ ${candidateAddress} 没有出价`);
              return null;
            }
          } catch (error) {
            console.warn(`检查 ${candidateAddress} 出价数量失败:`, error);
            return null;
          }
        })
      );

      // 过滤出真正有出价的参与者
      const validParticipants = participantChecks.filter(Boolean) as string[];
      console.log(`确认有效参与者 ${validParticipants.length} 个:`, validParticipants);

      if (validParticipants.length === 0) {
        console.log("未找到任何有效的参与者");
        setTransactionHistory([]);
        return;
      }

      // 为每个有效参与者获取详细的合约数据
      const historyData = await Promise.all(
        validParticipants.map(async (bidderAddress) => {
          try {
            console.log(`获取 ${bidderAddress} 的详细合约数据...`);

            // 从合约直接读取用户的出价数量（我们已经知道>0）
            const bidCount = await publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionData.abi,
              functionName: 'getBidCount',
              args: [bidderAddress as `0x${string}`],
            }) as bigint;

            const bidCountNum = Number(bidCount);

            // 读取用户的所有出价记录
            let totalDeposit = 0n;
            const bids = [];

            for (let i = 0; i < bidCountNum; i++) {
              try {
                const bidData = await publicClient.readContract({
                  address: auctionAddress,
                  abi: blindAuctionData.abi,
                  functionName: 'bids',
                  args: [bidderAddress as `0x${string}`, BigInt(i)],
                }) as [string, bigint]; // [blindedBid, deposit]

                const [blindedBid, deposit] = bidData;
                totalDeposit += deposit;

                bids.push({
                  index: i,
                  blindedBid,
                  deposit,
                  // 检查是否已被重置（揭示后会重置为bytes32(0)）
                  isRevealed: blindedBid === "0x0000000000000000000000000000000000000000000000000000000000000000"
                });
              } catch (bidError) {
                console.warn(`获取出价 ${i} 失败:`, bidError);
              }
            }

            // 判断用户是否已揭示（通过检查出价是否被重置）
            const hasRevealed = bids.some(bid => bid.isRevealed);

            // 统计有效出价数量（已揭示的出价）
            const revealedBidsCount = bids.filter(bid => bid.isRevealed).length;

            // 判断是否是最高出价者
            const isHighestBidder = bidderAddress.toLowerCase() === (currentHighestBidder as string)?.toLowerCase();

            console.log(`用户 ${bidderAddress}:`);
            console.log(`- 当前最高出价者: ${currentHighestBidder}`);
            console.log(`- 是否为最高出价者: ${isHighestBidder}`);
            console.log(`- 已揭示: ${hasRevealed}`);
            console.log(`- 有效出价数: ${revealedBidsCount}`);

            return {
              address: bidderAddress,
              totalDeposit,
              bids,
              hasRevealed,
              hasValidBid: revealedBidsCount > 0, // 是否有有效出价
              isHighestBidder, // 是否是最高出价者
              // 显示逻辑：最高出价者显示具体金额，其他人根据状态显示
              bidAmount: isHighestBidder
                ? currentHighestBidFormatted
                : hasRevealed
                  ? `低于 ${currentHighestBidFormatted}`
                  : "未出价"
            };
          } catch (error) {
            console.error(`获取 ${bidderAddress} 数据失败:`, error);
            return null;
          }
        })
      );

      // 去重并过滤有效数据，按地址去重
      const uniqueHistoryData = new Map();
      historyData.filter(Boolean).forEach(item => {
        if (item && !uniqueHistoryData.has(item.address.toLowerCase())) {
          uniqueHistoryData.set(item.address.toLowerCase(), item);
        }
      });

      // 转换为数组并按押金排序，最高出价者优先
      const validHistoryData = Array.from(uniqueHistoryData.values())
        .sort((a, b) => {
          // 最高出价者排在第一位
          if (a.isHighestBidder && !b.isHighestBidder) return -1;
          if (!a.isHighestBidder && b.isHighestBidder) return 1;
          // 其他按总押金排序
          return Number(b.totalDeposit - a.totalDeposit);
        });

      setTransactionHistory(validHistoryData as any[]);
      console.log("处理后的交易历史:", validHistoryData);

      if (validHistoryData.length === 0) {
        console.log("未找到任何交易记录");
      } else {
        console.log(`成功获取 ${validHistoryData.length} 个参与者的交易历史`);
      }

    } catch (error) {
      console.error("获取交易历史失败:", error);
      notification.error("获取交易历史失败，请稍后重试");
    } finally {
      setLoadingHistory(false);
    }
  };

  // 处理查看交易历史按钮点击
  const handleViewTransactionHistory = () => {
    setShowTransactionHistory(true);
    if (transactionHistory.length === 0) {
      fetchTransactionHistory();
    }
  };

  // 获取合约状态
  useEffect(() => {
    const fetchAuctionStatus = async () => {
      if (!publicClient || !blindAuctionData || !auctionAddress) {
        return;
      }

      try {
        // 首先验证合约是否存在
        const code = await publicClient.getBytecode({ address: auctionAddress });
        if (!code || code === '0x') {
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
          }).catch(e => 0),
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'highestBidder',
          }).catch(e => "0x0000000000000000000000000000000000000000"),
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'highestBid',
          }).catch(e => BigInt(0)),
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'beneficiary',
          }).catch(e => null),
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'ended',
          }).catch(e => false),
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'biddingEnd',
          }).catch(e => 0),
          publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionData.abi,
            functionName: 'revealEnd',
          }).catch(e => 0),
        ]);

        // 设置基本信息
        setHighestBidder(highestBidderResult as string);
        try {
          const highestBidValue = highestBidResult as bigint;
          const formattedBid = formatEth(highestBidValue);
          setHighestBid(formattedBid);
        } catch (error) {
          setHighestBid("0 ETH");
        }
        setBeneficiary(beneficiaryResult as `0x${string}`);
        setEnded(Boolean(endedResult));
        setBiddingEndTime(formatTime(biddingEndResult));
        setRevealEndTime(formatTime(revealEndResult));

        // 获取区块链当前时间
        const blockNumber = await publicClient.getBlockNumber();
        const block = await publicClient.getBlock({ blockNumber });
        const blockchainTimestamp = block.timestamp;

        let currentPhase = Number(currentPhaseResult);
        const ended = Boolean(endedResult);

        // 结果页面的状态映射：0=竞拍阶段，1=揭示阶段，2=已结束
        let resultPhase;
        if (ended) {
          resultPhase = 2; // 已结束
          setAuctionEndCalled(true);
        } else {
          // 使用当前时间而非区块链时间判断，因为前端显示的倒计时基于当前时间
          const currentTime = Math.floor(Date.now() / 1000);

          if (currentTime >= Number(revealEndResult)) {
            resultPhase = 2; // 已结束
            setAuctionEndCalled(false);
          } else if (currentTime >= Number(biddingEndResult)) {
            resultPhase = 1; // 揭示阶段
            setAuctionEndCalled(false);
          } else {
            resultPhase = 0; // 竞拍阶段或未开始
            setAuctionEndCalled(false);
          }
        }

        setPhase(resultPhase);
        // 设置竞拍是否已进入结束阶段（但不一定已调用auctionEnd）
        setAuctionEnded(resultPhase >= 2);

        // 计算剩余时间
        const currentTime = Math.floor(Date.now() / 1000);
        if (resultPhase === 0) {
          const remaining = Math.max(0, Number(biddingEndResult) - currentTime);
          const hours = Math.floor(remaining / 3600);
          const minutes = Math.floor((remaining % 3600) / 60);
          const seconds = remaining % 60;
          setTimeLeft(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
        } else if (resultPhase === 1) {
          const remaining = Math.max(0, Number(revealEndResult) - currentTime);
          const hours = Math.floor(remaining / 3600);
          const minutes = Math.floor((remaining % 3600) / 60);
          const seconds = remaining % 60;
          setTimeLeft(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
        } else {
          setTimeLeft("00:00:00");
        }

      } catch (error) {
        notification.error("无法加载拍卖结果，请稍后重试。");
      }
    };

    setIsClient(true);
    if (auctionAddress) {
      // 确保地址格式有效
      if (!auctionAddress.startsWith('0x') || auctionAddress.length !== 42) {
        return;
      }

      fetchAuctionStatus();
      const interval = setInterval(fetchAuctionStatus, 10000); // 每10秒更新一次
      return () => clearInterval(interval);
    } else {
      // 未指定拍卖地址
    }
  }, [publicClient, blindAuctionData, auctionAddress]);

  // 添加定时检查机制，当揭示阶段时间到期时自动切换状态
  useEffect(() => {
    if (phase !== 1 || !auctionAddress) return;

    const interval = setInterval(() => {
      const currentTime = Math.floor(Date.now() / 1000);

      // 从状态中获取揭示结束时间
      const revealEndTimeStamp = revealEndTime ? new Date(revealEndTime).getTime() / 1000 : 0;

      if (currentTime >= revealEndTimeStamp && revealEndTimeStamp > 0) {
        setPhase(2);
        setAuctionEnded(true);
        setTimeLeft("00:00:00");

        // 可选：显示通知
        notification.info("揭示阶段已结束，正在显示最终结果...");
      }
    }, 1000); // 每秒检查一次

    return () => clearInterval(interval);
  }, [phase, auctionAddress, revealEndTime]);

  // 查询用户的揭示状态和可能的退款
  useEffect(() => {
    if (!isClient || !address || !auctionAddress) return;

    try {
      // 🔧 关键修复：使用标准化的地址格式，与揭示页面保持一致
      const normalizedAddress = address.toLowerCase();

      // 检查用户是否有已揭示的出价
      const revealedKey = `revealed_bids_${normalizedAddress}_${auctionAddress}`;
      const revealedBids = localStorage.getItem(revealedKey);
      const hasRevealed = revealedBids ? JSON.parse(revealedBids).length > 0 : false;
      setUserHasRevealed(hasRevealed);

      // 检查用户是否已经提取过押金，如果提取过则不再显示可提取
      const withdrawKey = `withdraw_${normalizedAddress}_${auctionAddress}`;
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
        const userBids = localStorage.getItem(`bids_${normalizedAddress}`);
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
      // 检查用户揭示状态时出错，忽略错误
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

      handleTransactionStatus.submitted("提取押金");

      // 执行取款操作
      const tx = await contract.withdraw();
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        handleTransactionStatus.confirmed("提取押金");

        // 记录已提取状态 - 使用标准化地址
        const normalizedAddress = address.toLowerCase();
        const withdrawKey = `withdraw_${normalizedAddress}_${auctionAddress}`;
        localStorage.setItem(withdrawKey, "true");

        // 更新状态
        setHasPendingReturn(false);
        setPendingAmount("0");
      } else {
        notification.error("交易失败，请重试");
      }
    } catch (error: any) {
      handleTransactionError(error, "提取押金");
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

    // 🔧 修改权限检查：允许受益人或最高出价者调用
    const isBeneficiary = beneficiary?.toLowerCase() === address.toLowerCase();
    const isHighestBidder = highestBidder?.toLowerCase() === address.toLowerCase();

    console.log("🔧 权限检查:", {
      address,
      beneficiary,
      highestBidder,
      isBeneficiary,
      isHighestBidder
    });

    if (!isBeneficiary && !isHighestBidder) {
      notification.error("只有受益人或最高出价者可以结束拍卖");
      return;
    }

    if (!blindAuctionData) {
      notification.error("合约数据不可用");
      return;
    }

    try {
      setIsEndingAuction(true);
      setIsTransferring(true); // 开启全屏加载

      // 使用ethers发送交易
      const provider = window.ethereum ? new ethers.BrowserProvider(window.ethereum) : null;
      if (!provider) {
        notification.error("无法获取以太坊提供程序");
        setIsEndingAuction(false);
        setIsTransferring(false);
        return;
      }

      const signer = await provider.getSigner();
      const contract = new ethers.Contract(auctionAddress, blindAuctionData.abi, signer);

      handleTransactionStatus.submitted("结束拍卖");

      // 执行结束拍卖操作
      console.log("🚀 开始执行拍卖结束交易...");
      const tx = await contract.auctionEnd();
      console.log("⏳ 等待交易确认...", tx.hash);
      const receipt = await tx.wait();
      console.log("✅ 交易已确认:", receipt);

      if (receipt.status === 1) {
        console.log("✅ 交易成功");

        if (isBeneficiary && isHighestBidder) {
          notification.success("拍卖已结束！您作为创建者获得了拍卖金额，同时作为最高出价者获得了NFT！");
        } else if (isBeneficiary) {
          notification.success("恭喜！拍卖已结束，拍卖金额已成功转入您的账户！");
        } else if (isHighestBidder) {
          notification.success("恭喜！拍卖已结束，NFT已转移到您的账户！拍卖金额已转给创建者。");
        }

        // 更新状态
        setAuctionEndCalled(true);
        setEnded(true);

        // 延迟3秒后关闭加载，给用户时间看到成功消息
        setTimeout(() => {
          setIsTransferring(false);
          // 重新获取拍卖状态
          setTimeout(async () => {
            try {
              if (publicClient && blindAuctionData && auctionAddress) {
                // 重新获取拍卖状态
                const [
                  updatedPhase,
                  updatedHighestBidder,
                  updatedHighestBid,
                  updatedEnded
                ] = await Promise.all([
                  publicClient.readContract({
                    address: auctionAddress,
                    abi: blindAuctionData.abi,
                    functionName: 'getAuctionPhase',
                  }).catch(e => 2), // 默认为已结束状态
                  publicClient.readContract({
                    address: auctionAddress,
                    abi: blindAuctionData.abi,
                    functionName: 'highestBidder',
                  }).catch(e => highestBidder),
                  publicClient.readContract({
                    address: auctionAddress,
                    abi: blindAuctionData.abi,
                    functionName: 'highestBid',
                  }).catch(e => BigInt(0)),
                  publicClient.readContract({
                    address: auctionAddress,
                    abi: blindAuctionData.abi,
                    functionName: 'ended',
                  }).catch(e => true)
                ]);

                // 更新状态
                setPhase(Number(updatedPhase));
                setHighestBidder(updatedHighestBidder as string);
                setHighestBid(formatEth(updatedHighestBid as bigint));
                setEnded(Boolean(updatedEnded));

                console.log("✅ 拍卖状态已更新");
              }
            } catch (error) {
              console.error("重新获取拍卖状态失败:", error);
            }
          }, 500);
        }, 3000);

      } else {
        console.error("❌ 交易失败:", receipt);
        notification.error("交易失败，请重试");
        setIsTransferring(false);
      }
    } catch (error: any) {
      console.error("❌ 结束拍卖失败:", error);
      handleTransactionError(error, "结束拍卖");
      setIsTransferring(false);
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
    // 修改逻辑：揭示阶段不再显示当前出价结果，只显示状态信息
    return false;
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
      {/* NFT转移加载遮罩 */}
      {isTransferring && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900/90 backdrop-blur-md rounded-3xl p-12 border border-blue-500/30 shadow-2xl max-w-md w-full mx-4">
            {/* 动画圆圈 */}
            <div className="flex justify-center mb-8">
              <div className="relative">
                {/* 外圈旋转 */}
                <div className="w-24 h-24 border-4 border-blue-500/30 rounded-full animate-spin border-t-blue-500"></div>
                {/* 内圈反向旋转 */}
                <div className="absolute inset-2 w-20 h-20 border-4 border-purple-500/30 rounded-full animate-spin-reverse border-t-purple-500"></div>
                {/* 中心图标 */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center animate-pulse">
                    <span className="text-2xl">🎁</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 加载文字 */}
            <div className="text-center">
              <h3 className="text-2xl font-bold text-white mb-3">NFT转移中...</h3>
              <p className="text-slate-300 mb-4">正在将NFT转移给最高出价者</p>

              {/* 进度动画 */}
              <div className="space-y-2">
                <div className="flex items-center justify-center text-sm text-slate-400">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200"></div>
                  </div>
                </div>
                <p className="text-xs text-slate-500">请耐心等待区块链确认...</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 背景效果 */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-1/4 w-80 h-80 bg-blue-600/20 rounded-full filter blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-20 right-1/4 w-80 h-80 bg-purple-600/20 rounded-full filter blur-[100px] animate-pulse delay-1000"></div>
      </div>

      {/* 网格背景 */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:40px_40px]"></div>

      <div className="relative z-10 w-full min-h-screen flex">
        {/* 左侧边栏 */}
        <div className="w-80 bg-slate-900/60 backdrop-blur-lg border-r border-slate-700/50 flex flex-col">
          {/* 左侧顶部 - 页面标题 */}
          <div className="p-6 border-b border-slate-700/50">
            <h1 className="text-3xl font-bold text-white mb-2">拍卖结果</h1>
            <div className="h-1 w-20 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mb-3"></div>
            <p className="text-slate-300 text-sm">
              状态:
              <span className={`font-medium ml-1 ${phase === 2 ? 'text-green-400' : 'text-yellow-400'}`}>
                {phase === 0
                  ? "竞拍中"
                  : phase === 1
                    ? "揭示中"
                    : "已结束"}
              </span>
            </p>
          </div>

          {/* 左侧拍卖状态信息 */}
          <div className="p-6 border-b border-slate-700/50 flex-1">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <span className="mr-2">📊</span> 拍卖信息
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">拍卖状态</span>
                <span className={`text-sm ${phase === 2 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {phase === 0 ? "竞拍中" : phase === 1 ? "揭示中" : "已结束"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">受益人</span>
                <span className="text-white text-sm font-medium tracking-wide">
                  {beneficiary ? formatAddress(beneficiary) : "未知"}
                </span>
              </div>
              {phase < 2 && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">剩余时间</span>
                  <span className="text-cyan-400 text-sm font-mono">{timeLeft}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 中间主内容区域 */}
        <div className="flex-1 flex flex-col">
          {!address ? (
            <div className="flex items-center justify-center h-full p-8">
              <div className="bg-slate-900/60 backdrop-blur-lg rounded-2xl p-8 border border-slate-700/50 shadow-xl max-w-md w-full text-center">
                <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">请连接钱包</h3>
                <p className="text-slate-300 mb-6">您需要连接以太坊钱包来查看拍卖结果</p>
                <button className="btn btn-primary btn-wide">连接钱包</button>
              </div>
            </div>
          ) : phase === 0 ? (
            <div className="flex items-center justify-center h-full p-8">
              <div className="bg-slate-900/60 backdrop-blur-lg rounded-2xl p-8 border border-slate-700/50 shadow-xl max-w-2xl w-full text-center">
                <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">拍卖尚未结束</h3>
                <p className="text-slate-300 mb-6">拍卖结果将在揭示阶段结束后可查看</p>
                <div className="flex justify-center gap-4">
                  <a href="/bid" className="btn btn-primary">参与竞拍</a>
                  <a href="/my-bids" className="btn btn-outline btn-primary">我的竞拍记录</a>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 flex-1">
              {/* 竞拍成功横幅 */}
              {address && highestBidder && address.toLowerCase() === highestBidder.toLowerCase() && phase === 2 && (
                <div className="bg-gradient-to-r from-green-900/80 via-emerald-800/70 to-teal-900/80 backdrop-blur-md rounded-2xl border border-green-500/50 shadow-2xl relative overflow-hidden mb-6">
                  {/* 背景装饰 */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.05)_1px,transparent_1px)] bg-[size:20px_20px]"></div>

                  <div className="p-6 relative z-10 flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-green-500/30 to-emerald-500/30 rounded-full flex items-center justify-center">
                      <span className="text-3xl">🏆</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-white mb-1">🎉 竞拍成功！</h3>
                      <p className="text-green-200">恭喜您以 <span className="font-bold text-white">{highestBid}</span> 的价格获得拍卖品！</p>
                    </div>
                    <div className="flex gap-3">
                      {/* 最高出价者的获取NFT按钮 */}
                      {!auctionEndCalled && (
                        <button
                          onClick={handleEndAuction}
                          disabled={isEndingAuction}
                          className={`group relative px-6 py-3 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 ${isEndingAuction
                            ? 'bg-gray-600/50 text-gray-300 cursor-not-allowed'
                            : 'bg-gradient-to-r from-green-600 via-green-500 to-emerald-600 hover:from-green-500 hover:via-green-400 hover:to-emerald-500 text-white shadow-lg shadow-green-500/30 hover:shadow-green-500/40'
                            }`}
                        >
                          <div className="flex items-center gap-2">
                            {isEndingAuction ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-white"></div>
                                <span>获取中...</span>
                              </>
                            ) : (
                              <>
                                <span className="text-xl">🎁</span>
                                <span>获取NFT</span>
                              </>
                            )}
                          </div>
                          {!isEndingAuction && (
                            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 受益者横幅 */}
              {address && beneficiary && address.toLowerCase() === beneficiary.toLowerCase() && phase === 2 && (
                <div className="bg-gradient-to-r from-blue-900/80 via-indigo-800/70 to-purple-900/80 backdrop-blur-md rounded-2xl border border-blue-500/50 shadow-2xl relative overflow-hidden mb-6">
                  {/* 背景装饰 */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:20px_20px]"></div>

                  <div className="p-6 relative z-10 flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500/30 to-purple-500/30 rounded-full flex items-center justify-center">
                      <span className="text-3xl">💰</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-white mb-1">💎 您的拍卖成功结束！</h3>
                      <p className="text-blue-200">最高出价 <span className="font-bold text-white">{highestBid}</span> 等待您领取！</p>
                    </div>
                    <div className="flex gap-3">
                      {/* 受益者的获得拍卖金额按钮 */}
                      {!auctionEndCalled && (
                        <button
                          onClick={handleEndAuction}
                          disabled={isEndingAuction}
                          className={`group relative px-6 py-3 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 ${isEndingAuction
                            ? 'bg-gray-600/50 text-gray-300 cursor-not-allowed'
                            : 'bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 hover:from-blue-500 hover:via-blue-400 hover:to-purple-500 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40'
                            }`}
                        >
                          <div className="flex items-center gap-2">
                            {isEndingAuction ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-white"></div>
                                <span>处理中...</span>
                              </>
                            ) : (
                              <>
                                <span className="text-xl">💰</span>
                                <span>获得拍卖金额</span>
                              </>
                            )}
                          </div>
                          {!isEndingAuction && (
                            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 竞拍失败但参与了的用户安慰横幅 */}
              {address && phase === 2 && highestBidder && highestBidder !== '0x0000000000000000000000000000000000000000' &&
                address.toLowerCase() !== highestBidder.toLowerCase() &&
                address.toLowerCase() !== beneficiary?.toLowerCase() &&
                hasPendingReturn && (
                  <div className="bg-gradient-to-r from-amber-900/80 via-orange-800/70 to-red-900/80 backdrop-blur-md rounded-2xl border border-amber-500/50 shadow-2xl relative overflow-hidden mb-6">
                    {/* 背景装饰 */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(245,158,11,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,0.05)_1px,transparent_1px)] bg-[size:20px_20px]"></div>

                    <div className="p-6 relative z-10 flex items-center gap-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-amber-500/30 to-orange-500/30 rounded-full flex items-center justify-center">
                        <span className="text-3xl">🤝</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold text-white mb-1">💪 感谢您的参与！</h3>
                        <p className="text-amber-200">虽然这次没有获胜，但您的参与让拍卖更加精彩！您的押金可以随时提取。</p>
                        <p className="text-amber-300 text-sm mt-1">✨ 每一次参与都是宝贵的经验，期待您在下次拍卖中的精彩表现！</p>
                      </div>
                      <div className="flex gap-3">
                        {/* 失败用户的提取押金按钮 */}
                        <button
                          onClick={handleWithdraw}
                          disabled={isWithdrawing || !hasPendingReturn}
                          className="group relative px-6 py-3 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 bg-gradient-to-r from-amber-600 via-amber-500 to-orange-600 hover:from-amber-500 hover:via-amber-400 hover:to-orange-500 text-white shadow-lg shadow-amber-500/30 hover:shadow-amber-500/40"
                        >
                          <div className="flex items-center gap-2">
                            {isWithdrawing ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
                                <span>提取中...</span>
                              </>
                            ) : (
                              <>
                                <span className="text-xl">💰</span>
                                <span>提取押金</span>
                              </>
                            )}
                          </div>
                          <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              {/* 参与但无押金可提取的用户安慰横幅 */}
              {address && phase === 2 && highestBidder && highestBidder !== '0x0000000000000000000000000000000000000000' &&
                address.toLowerCase() !== highestBidder.toLowerCase() &&
                address.toLowerCase() !== beneficiary?.toLowerCase() &&
                !hasPendingReturn && (
                  // 检查用户是否参与过这个拍卖（通过localStorage或其他方式）
                  (() => {
                    try {
                      const normalizedAddress = address.toLowerCase();
                      const storedBids = localStorage.getItem(`bids_${normalizedAddress}`);
                      const hasParticipated = storedBids && JSON.parse(storedBids).some((bid: any) =>
                        bid.auctionAddress?.toLowerCase() === auctionAddress?.toLowerCase()
                      );

                      return hasParticipated;
                    } catch {
                      return false;
                    }
                  })() && (
                    <div className="bg-gradient-to-r from-slate-900/80 via-slate-800/70 to-gray-900/80 backdrop-blur-md rounded-2xl border border-slate-500/50 shadow-2xl relative overflow-hidden mb-6">
                      {/* 背景装饰 */}
                      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:20px_20px]"></div>

                      <div className="p-6 relative z-10 flex items-center gap-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-slate-500/30 to-gray-500/30 rounded-full flex items-center justify-center">
                          <span className="text-3xl">🎯</span>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-2xl font-bold text-white mb-1">🌟 感谢您的参与！</h3>
                          <p className="text-slate-200">虽然这次没有获胜，但您勇敢参与盲拍的精神值得称赞！</p>
                          <p className="text-slate-300 text-sm mt-1">💫 继续探索更多精彩的拍卖，每一次尝试都让您更接近成功！</p>
                        </div>
                        <div className="flex gap-3">
                          <a
                            href="/all-auctions"
                            className="group relative px-6 py-3 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 bg-gradient-to-r from-slate-600 via-slate-500 to-gray-600 hover:from-slate-500 hover:via-slate-400 hover:to-gray-500 text-white shadow-lg shadow-slate-500/30 hover:shadow-slate-500/40"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xl">🔍</span>
                              <span>浏览更多拍卖</span>
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
                          </a>
                        </div>
                      </div>
                    </div>
                  )
                )}

              {/* 主要内容区域 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 最高出价信息卡片 */}
                <div className="bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-700/50 shadow-xl p-6">
                  <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
                    <span className="mr-2">💎</span> 最高出价
                  </h3>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-white mb-2">
                      {highestBid && !highestBid.includes('NaN') && highestBid !== "0 ETH" && highestBid !== "0.0000 ETH"
                        ? highestBid
                        : "无有效出价"}
                    </div>
                    {highestBidder && highestBidder !== '0x0000000000000000000000000000000000000000' ? (
                      <div className="flex items-center justify-center mt-4">
                        <span className="text-slate-300 text-sm mr-2">获胜者:</span>
                        <span className="text-white text-sm font-medium tracking-wide">
                          {formatAddress(highestBidder)}
                        </span>
                        <a
                          href={`/blockexplorer/address/${highestBidder}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                    ) : (
                      <p className="text-slate-400 text-sm mt-4">暂无获胜者</p>
                    )}
                  </div>
                </div>

                {/* 用户操作卡片 */}
                <div className="bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-700/50 shadow-xl p-6">
                  <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
                    <span className="mr-2">⚡</span> 我的操作
                  </h3>

                  {hasPendingReturn ? (
                    <div className="space-y-4">
                      <div className="bg-green-900/20 rounded-lg p-4 border border-green-700/30">
                        <p className="text-green-300 text-sm mb-2">可提取押金</p>
                        <p className="text-white font-bold text-lg">{pendingAmount} ETH</p>
                      </div>
                      <button
                        onClick={handleWithdraw}
                        disabled={isWithdrawing || !hasPendingReturn}
                        className={`w-full btn ${isWithdrawing ? 'btn-disabled' : 'btn-success'}`}
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
                  ) : (
                    <div className="text-center py-8">
                      <div className="text-4xl mb-4 opacity-50">📋</div>
                      <p className="text-slate-400 mb-4">暂无可执行的操作</p>
                      <a href="/my-bids" className="btn btn-primary btn-sm">查看我的竞拍</a>
                    </div>
                  )}
                </div>
              </div>

              {/* 拍卖完成状态 */}
              {phase === 2 && (
                <div className="mt-6 bg-blue-900/20 rounded-2xl p-6 border border-blue-800/40">
                  <div>
                    <h3 className="text-lg font-semibold text-blue-300 flex items-center mb-2">
                      <span className="mr-2">✅</span> 拍卖已完成
                    </h3>
                    <p className="text-slate-300 text-sm">
                      所有揭示阶段已完成，最终结果已确定
                    </p>
                  </div>

                  {/* 🔧 修改状态显示逻辑 */}
                  <div className="mt-4">
                    {auctionEndCalled ? (
                      <div className="bg-green-900/30 p-3 rounded-lg border border-green-800/30">
                        <p className="text-sm text-green-300 text-center">
                          ✅ 拍卖已完全结束，NFT已转移给最高出价者，拍卖金额已转入受益人账户
                        </p>
                      </div>
                    ) : (
                      <div className="bg-yellow-900/30 p-3 rounded-lg border border-yellow-800/30">
                        <p className="text-sm text-yellow-300 text-center">
                          ⚠️ 拍卖揭示阶段已结束，等待受益人或最高出价者完成拍卖结算
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右侧边栏 */}
        <div className="w-80 bg-slate-900/60 backdrop-blur-lg border-l border-slate-700/50 flex flex-col">
          {/* 右侧顶部 - 统计信息 */}
          <div className="p-6 border-b border-slate-700/50">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <span className="mr-2">📊</span> 拍卖统计
            </h3>
            <div className="space-y-4">
              <div className="bg-blue-900/20 rounded-lg p-3">
                <p className="text-blue-300 text-xs">拍卖状态</p>
                <p className={`font-semibold ${phase === 2 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {phase === 0 ? "竞拍中" : phase === 1 ? "揭示中" : "已结束"}
                </p>
              </div>
              <div className="bg-purple-900/20 rounded-lg p-3">
                <p className="text-purple-300 text-xs">当前最高出价</p>
                <p className="text-white font-semibold">
                  {highestBid && !highestBid.includes('NaN') && highestBid !== "0 ETH"
                    ? highestBid
                    : "暂无"}
                </p>
              </div>
              {hasPendingReturn && (
                <div className="bg-green-900/20 rounded-lg p-3">
                  <p className="text-green-300 text-xs">可提取押金</p>
                  <p className="text-white font-semibold">{pendingAmount} ETH</p>
                </div>
              )}

              {/* 交易历史按钮 */}
              <button
                onClick={handleViewTransactionHistory}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-indigo-500/25 flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>查看交易历史</span>
              </button>
            </div>
          </div>

          {/* 右侧时间信息 */}
          <div className="p-6 border-b border-slate-700/50 flex-1">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <span className="mr-2">⏰</span> 时间信息
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-slate-400 text-xs">竞拍结束时间</p>
                <p className="text-white text-sm">{biddingEndTime}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">揭示结束时间</p>
                <p className="text-white text-sm">{revealEndTime}</p>
              </div>
              {phase < 2 && (
                <div className="bg-yellow-900/20 rounded-lg p-3">
                  <p className="text-yellow-300 text-xs">倒计时</p>
                  <p className="text-white font-mono text-lg">{timeLeft}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 交易历史弹窗 */}
      {showTransactionHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900/95 backdrop-blur-md rounded-3xl border border-slate-700/50 shadow-2xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* 弹窗头部 */}
            <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-xl flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">交易历史</h3>
                  <p className="text-slate-400 text-sm">本次拍卖的所有出价记录</p>
                </div>
              </div>
              <button
                onClick={() => setShowTransactionHistory(false)}
                className="w-10 h-10 bg-slate-800/50 hover:bg-slate-700/50 rounded-xl flex items-center justify-center transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="flex-1 overflow-hidden">
              {loadingHistory ? (
                <div className="flex items-center justify-center h-96">
                  <div className="text-center">
                    <div className="flex justify-center mb-4">
                      <div className="w-16 h-16 relative">
                        <div className="w-16 h-16 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-10 h-10 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin"></div>
                        </div>
                      </div>
                    </div>
                    <p className="text-slate-300 text-lg">加载交易历史中...</p>
                    <p className="text-slate-500 text-sm mt-2">正在从区块链获取数据</p>
                  </div>
                </div>
              ) : transactionHistory.length === 0 ? (
                <div className="flex items-center justify-center h-96">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-slate-300 text-lg">暂无交易记录</p>
                    <p className="text-slate-500 text-sm mt-2">此拍卖还没有任何出价记录</p>
                  </div>
                </div>
              ) : (
                <div className="p-6 overflow-y-auto h-full">
                  {/* 统计摘要 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-800/30">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-blue-300 text-sm">参与用户</p>
                          <p className="text-white text-2xl font-bold">{transactionHistory.length}</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-purple-900/20 rounded-xl p-4 border border-purple-800/30">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-purple-300 text-sm">有效出价</p>
                          <p className="text-white text-2xl font-bold">
                            {transactionHistory.filter(bidder => bidder.hasValidBid).length}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-green-900/20 rounded-xl p-4 border border-green-800/30">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-green-300 text-sm">已揭示用户</p>
                          <p className="text-white text-2xl font-bold">
                            {transactionHistory.filter(bidder => bidder.hasRevealed).length}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 交易详情表格 */}
                  <div className="bg-slate-800/30 rounded-xl overflow-hidden border border-slate-700/50">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-800/50">
                          <tr>
                            <th className="px-6 py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                              竞拍者
                            </th>
                            <th className="px-6 py-4 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">
                              有效出价
                            </th>
                            <th className="px-6 py-4 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">
                              揭示状态
                            </th>
                            <th className="px-6 py-4 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">
                              出价
                            </th>
                            <th className="px-6 py-4 text-right text-xs font-medium text-slate-300 uppercase tracking-wider">
                              押金
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                          {transactionHistory.map((bidder, index) => (
                            <tr key={bidder.address} className={`hover:bg-slate-800/20 transition-colors ${bidder.isHighestBidder ? "bg-gradient-to-r from-yellow-900/20 to-amber-900/20" : ""
                              }`}>
                              {/* 竞拍者 */}
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full flex items-center justify-center">
                                    <span className="text-xs font-bold text-white">{index + 1}</span>
                                  </div>
                                  <div>
                                    <p className="text-white font-medium text-sm">
                                      {formatAddress(bidder.address)}
                                    </p>
                                    {bidder.isHighestBidder && (
                                      <div className="flex items-center mt-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-yellow-400 mr-1" fill="currentColor" viewBox="0 0 24 24">
                                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                        </svg>
                                        <span className="text-yellow-400 text-xs font-semibold">最高出价者</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              {/* 有效出价 */}
                              <td className="px-6 py-4 text-center">
                                {bidder.hasValidBid ? (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-900/30 text-green-300 border border-green-800/30">
                                    ✅ 有效
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-900/30 text-red-300 border border-red-800/30">
                                    ❌ 无效
                                  </span>
                                )}
                              </td>
                              {/* 揭示状态 */}
                              <td className="px-6 py-4 text-center">
                                {bidder.hasRevealed ? (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-900/30 text-green-300 border border-green-800/30">
                                    ✅ 已揭示
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-900/30 text-yellow-300 border border-yellow-800/30">
                                    ⏳ 未揭示
                                  </span>
                                )}
                              </td>
                              {/* 出价 */}
                              <td className="px-6 py-4 text-center">
                                <span className={`font-semibold ${bidder.isHighestBidder
                                  ? "text-yellow-400"
                                  : bidder.hasRevealed
                                    ? "text-green-400"
                                    : "text-slate-400"
                                  }`}>
                                  {bidder.bidAmount}
                                </span>
                              </td>
                              {/* 押金 */}
                              <td className="px-6 py-4 text-right">
                                <span className="text-blue-400 font-semibold">
                                  {formatEth(bidder.totalDeposit)} ETH
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 底部说明 */}
                  <div className="mt-6 bg-slate-800/20 rounded-xl p-4 border border-slate-700/30">
                    <h4 className="text-white font-semibold mb-2 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      说明
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-300">
                      <div>
                        <p><strong className="text-white">有效出价:</strong> 用户是否提交了有效的竞拍出价</p>
                        <p><strong className="text-white">揭示状态:</strong> 用户是否在揭示阶段公开了出价信息</p>
                      </div>
                      <div>
                        <p><strong className="text-white">出价:</strong> 只有最高出价者显示具体金额，其他用户出于隐私保护不显示</p>
                        <p><strong className="text-white">押金:</strong> 用户在竞拍阶段提交的押金总和</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    }>
      <ResultsContent />
    </Suspense>
  );
} 