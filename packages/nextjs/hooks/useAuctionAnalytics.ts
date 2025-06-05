import { useState, useEffect, useCallback } from 'react';
import { usePublicClient } from 'wagmi';
import { useDeployedContractInfo } from "./scaffold-eth/useDeployedContractInfo";
import { formatEther } from 'viem';

export interface AuctionAnalyticsData {
  totalAuctions: number;
  totalVolume: string;
  averagePrice: string;
  activeAuctions: number;
  completedAuctions: number;
  successfulAuctions: number;
  totalParticipants: number;
  categoryData: { [key: string]: number };
  priceHistory: { date: string; avgPrice: number; volume: number }[];
  topBidders: { address: string; totalBids: number; totalVolume: string }[];
  dailyStats: { date: string; auctions: number; volume: number }[];
  monthlyGrowth: number;
  averageParticipantsPerAuction: number;
  successRate: number;
}

interface CachedData {
  data: AuctionAnalyticsData;
  timestamp: number;
  blockNumber: bigint | string; // 支持字符串类型用于序列化
}

// 缓存时间（5分钟）
const CACHE_DURATION = 5 * 60 * 1000;

export const useAuctionAnalytics = () => {
  const [analyticsData, setAnalyticsData] = useState<AuctionAnalyticsData>({
    totalAuctions: 0,
    totalVolume: '0',
    averagePrice: '0',
    activeAuctions: 0,
    completedAuctions: 0,
    successfulAuctions: 0,
    totalParticipants: 0,
    categoryData: {},
    priceHistory: [],
    topBidders: [],
    dailyStats: [],
    monthlyGrowth: 0,
    averageParticipantsPerAuction: 0,
    successRate: 0
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const publicClient = usePublicClient();
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { data: blindAuctionInfo } = useDeployedContractInfo("BlindAuction");

  // 保存数据到缓存
  const setCachedData = useCallback((data: AuctionAnalyticsData, blockNumber: bigint) => {
    try {
      const cacheData: CachedData = {
        data,
        timestamp: Date.now(),
        blockNumber: blockNumber.toString() // 将BigInt转换为字符串
      };
      // 使用自定义replacer处理BigInt
      const jsonString = JSON.stringify(cacheData, (key, value) => {
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      });
      localStorage.setItem('auction_analytics_cache', jsonString);
    } catch (error) {
      console.warn('保存缓存数据失败:', error);
    }
  }, []);

  // 获取缓存的数据
  const getCachedData = useCallback((): CachedData | null => {
    try {
      const cached = localStorage.getItem('auction_analytics_cache');
      if (cached) {
        const parsedCache = JSON.parse(cached);
        const now = Date.now();

        // 检查缓存是否过期
        if (now - parsedCache.timestamp < CACHE_DURATION) {
          return {
            ...parsedCache,
            blockNumber: BigInt(parsedCache.blockNumber) // 将字符串转换回BigInt
          };
        }
      }
    } catch (error) {
      console.warn('获取缓存数据失败:', error);
    }
    return null;
  }, []);

  const fetchAnalyticsData = useCallback(async () => {
    if (!factoryContractData || !blindAuctionInfo || !publicClient) return;

    try {
      setLoading(true);
      setError(null);

      // 检查缓存数据
      const cachedData = getCachedData();
      const currentBlock = await publicClient.getBlockNumber();

      if (cachedData && BigInt(cachedData.blockNumber) === currentBlock) {
        console.log('🎯 使用缓存数据');
        setAnalyticsData(cachedData.data);
        setLoading(false);
        return;
      }

      // 获取所有拍卖创建事件
      const logs = await publicClient.getContractEvents({
        address: factoryContractData.address,
        abi: factoryContractData.abi,
        eventName: 'AuctionCreated',
        fromBlock: BigInt(0),
      });

      console.log('🔍 找到拍卖数量:', logs.length);

      let totalVolume = BigInt(0);
      let completedAuctions = 0;
      let successfulAuctions = 0; // 实际有成交的拍卖数
      let activeAuctions = 0;
      let totalParticipants = new Set<string>();
      const categoryData: { [key: string]: number } = {};
      const priceHistory: { date: string; avgPrice: number; volume: number }[] = [];
      const bidderStats: { [key: string]: { totalBids: number; totalVolume: bigint } } = {};
      const dailyStatsMap: { [key: string]: { auctions: number; volume: number } } = {};

      // 批量获取拍卖数据以提高性能
      const auctionPromises = logs.map(async (log, index) => {
        if (!log.args) return null;

        const auctionAddress = log.args.auctionAddress as `0x${string}`;

        try {
          // 获取拍卖基本信息
          const [phase, highestBid, highestBidder, biddingEnd, revealEnd, ended] = await Promise.all([
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionInfo.abi,
              functionName: 'getAuctionPhase',
            }),
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionInfo.abi,
              functionName: 'highestBid',
            }),
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionInfo.abi,
              functionName: 'highestBidder',
            }),
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionInfo.abi,
              functionName: 'biddingEnd',
            }),
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionInfo.abi,
              functionName: 'revealEnd',
            }),
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionInfo.abi,
              functionName: 'ended',
            }).catch(() => false) // 如果合约没有ended字段，默认为false
          ]);

          return {
            address: auctionAddress,
            phase: Number(phase),
            highestBid: BigInt(highestBid || 0),
            highestBidder: highestBidder as string,
            biddingEnd: Number(biddingEnd),
            revealEnd: Number(revealEnd),
            ended: Boolean(ended),
            metadata: log.args.metadata as string
          };
        } catch (error) {
          console.warn(`获取拍卖 ${auctionAddress} 数据失败:`, error);
          return null;
        }
      });

      const auctionResults = await Promise.all(auctionPromises);
      const validAuctions = auctionResults.filter(auction => auction !== null);

      // 分析拍卖数据
      for (const auction of validAuctions) {
        if (!auction) continue;

        // 为每日统计准备数据（所有拍卖，不只是成功的）
        const endDate = new Date(auction.revealEnd * 1000).toLocaleDateString();
        if (!dailyStatsMap[endDate]) {
          dailyStatsMap[endDate] = { auctions: 0, volume: 0 };
        }
        dailyStatsMap[endDate].auctions++; // 统计所有拍卖

        // 统计拍卖状态 - 修改逻辑，阶段3表示已结束，或者ended为true
        if (auction.phase === 3 || auction.ended) {
          completedAuctions++;

          // 只有当最高出价大于0且有有效的最高竞拍者时，才算成功成交
          if (auction.highestBid > 0 &&
            auction.highestBidder &&
            auction.highestBidder !== '0x0000000000000000000000000000000000000000') {
            successfulAuctions++;
            totalVolume += auction.highestBid;
            console.log(`✅ 成功成交: ${formatEther(auction.highestBid)} ETH`);

            // 只有成功拍卖才计入成交量
            dailyStatsMap[endDate].volume += parseFloat(formatEther(auction.highestBid));

            // 构建价格历史
            priceHistory.push({
              date: endDate,
              avgPrice: parseFloat(formatEther(auction.highestBid)),
              volume: parseFloat(formatEther(auction.highestBid))
            });
          }
        } else {
          activeAuctions++;
        }

        // 解析拍卖元数据
        try {
          const metadata = JSON.parse(auction.metadata);
          const category = metadata.category || '其他';
          categoryData[category] = (categoryData[category] || 0) + 1;
        } catch (e) {
          categoryData['其他'] = (categoryData['其他'] || 0) + 1;
        }

        // 获取竞拍参与者数据
        try {
          const bidLogs = await publicClient.getContractEvents({
            address: auction.address,
            abi: blindAuctionInfo.abi,
            eventName: 'BidSubmitted',
            fromBlock: BigInt(0),
          });

          bidLogs.forEach(bidLog => {
            if (bidLog.args?.bidder) {
              const bidder = bidLog.args.bidder as string;
              totalParticipants.add(bidder);

              if (!bidderStats[bidder]) {
                bidderStats[bidder] = { totalBids: 0, totalVolume: BigInt(0) };
              }
              bidderStats[bidder].totalBids++;
              if (bidLog.args.deposit) {
                bidderStats[bidder].totalVolume += BigInt(bidLog.args.deposit);
              }
            }
          });
        } catch (e) {
          console.warn(`获取拍卖 ${auction.address} 竞拍事件失败:`, e);
        }
      }

      console.log('📊 统计结果:');
      console.log('- 总成交量(BigInt):', totalVolume.toString());
      console.log('- 成功拍卖数:', successfulAuctions);

      // 计算平均价格（基于成功成交的拍卖）
      const averagePrice = successfulAuctions > 0
        ? formatEther(totalVolume / BigInt(successfulAuctions))
        : '0';

      const totalVolumeString = formatEther(totalVolume);

      console.log('💰 最终计算:');
      console.log('- 总成交金额(string):', totalVolumeString);
      console.log('- 平均价格(string):', averagePrice);

      // 计算成功率
      const successRate = completedAuctions > 0
        ? (successfulAuctions / completedAuctions) * 100
        : 0;

      // 获取顶级竞拍者
      const topBidders = Object.entries(bidderStats)
        .sort((a, b) => Number(b[1].totalVolume - a[1].totalVolume))
        .slice(0, 10)
        .map(([address, stats]) => ({
          address: `${address.slice(0, 6)}...${address.slice(-4)}`,
          totalBids: stats.totalBids,
          totalVolume: formatEther(stats.totalVolume)
        }));

      // 处理每日统计
      const dailyStats = Object.entries(dailyStatsMap)
        .map(([date, stats]) => ({
          date,
          auctions: stats.auctions,
          volume: stats.volume
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // 修正月度增长率计算 - 基于实际拍卖数量
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const lastMonthAuctions = dailyStats
        .filter(stat => {
          const statDate = new Date(stat.date);
          return statDate >= lastMonth && statDate < thisMonth;
        })
        .reduce((total, stat) => total + stat.auctions, 0); // 累计拍卖数量

      const thisMonthAuctions = dailyStats
        .filter(stat => {
          const statDate = new Date(stat.date);
          return statDate >= thisMonth;
        })
        .reduce((total, stat) => total + stat.auctions, 0); // 累计拍卖数量

      const monthlyGrowth = lastMonthAuctions > 0
        ? ((thisMonthAuctions - lastMonthAuctions) / lastMonthAuctions) * 100
        : 0;

      // 计算平均参与者数
      const averageParticipantsPerAuction = logs.length > 0
        ? totalParticipants.size / logs.length
        : 0;

      // 改进价格历史聚合 - 按日期聚合，使用成交量加权平均
      const aggregatedHistory = priceHistory.reduce((acc, curr) => {
        const existing = acc.find(item => item.date === curr.date);
        if (existing) {
          const totalVolume = existing.volume + curr.volume;
          const weightedAvg = (existing.avgPrice * existing.volume + curr.avgPrice * curr.volume) / totalVolume;
          existing.volume = totalVolume;
          existing.avgPrice = weightedAvg;
        } else {
          acc.push({ ...curr });
        }
        return acc;
      }, [] as typeof priceHistory);

      const finalData: AuctionAnalyticsData = {
        totalAuctions: logs.length,
        totalVolume: totalVolumeString,
        averagePrice,
        activeAuctions,
        completedAuctions,
        successfulAuctions,
        totalParticipants: totalParticipants.size,
        categoryData,
        priceHistory: aggregatedHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        topBidders,
        dailyStats,
        monthlyGrowth,
        averageParticipantsPerAuction,
        successRate
      };

      console.log('🎯 最终数据对象:', {
        totalVolume: finalData.totalVolume,
        averagePrice: finalData.averagePrice,
        successfulAuctions: finalData.successfulAuctions
      });

      setAnalyticsData(finalData);
      setCachedData(finalData, currentBlock);

    } catch (error) {
      console.error("获取分析数据失败:", error);
      setError(error instanceof Error ? error.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [factoryContractData, blindAuctionInfo, publicClient, getCachedData, setCachedData]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  const refreshData = useCallback(() => {
    // 清除缓存并重新获取数据
    try {
      localStorage.removeItem('auction_analytics_cache');
    } catch (error) {
      console.warn('清除缓存失败:', error);
    }
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  return {
    data: analyticsData,
    loading,
    error,
    refresh: refreshData
  };
}; 