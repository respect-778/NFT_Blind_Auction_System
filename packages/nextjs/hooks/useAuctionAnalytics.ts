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
  const { data: nftContractData } = useDeployedContractInfo("AuctionNFT");

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
    if (!factoryContractData || !blindAuctionInfo || !publicClient || !nftContractData) return;

    try {
      setLoading(true);
      setError(null);

      // 检查缓存数据
      const cachedData = getCachedData();
      const currentBlock = await publicClient.getBlockNumber();

      if (cachedData && BigInt(cachedData.blockNumber) === currentBlock) {
        setAnalyticsData(cachedData.data);
        setLoading(false);
        return;
      }

      // 🔧 修复：使用与首页相同的方法获取拍卖地址

      // 获取拍卖总数
      const count = await publicClient.readContract({
        address: factoryContractData.address,
        abi: factoryContractData.abi,
        functionName: "getAuctionCount",
      }) as bigint;

      if (count === 0n) {
        // 如果没有拍卖，返回空数据
        const emptyData: AuctionAnalyticsData = {
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
        };
        setAnalyticsData(emptyData);
        setLoading(false);
        return;
      }

      // 获取所有拍卖地址
      const auctionAddresses = await publicClient.readContract({
        address: factoryContractData.address,
        abi: factoryContractData.abi,
        functionName: "getAuctions",
        args: [0n, count],
      }) as `0x${string}`[];

      let totalVolume = BigInt(0);
      let completedAuctions = 0;
      let successfulAuctions = 0; // 实际有成交的拍卖数
      let activeAuctions = 0;
      let totalParticipants = new Set<string>();
      const categoryData: { [key: string]: number } = {};
      const priceHistory: { date: string; avgPrice: number; volume: number }[] = [];
      const bidderStats: { [key: string]: { totalBids: number; totalVolume: bigint; auctions: Set<string> } } = {};
      const dailyStatsMap: { [key: string]: { auctions: number; volume: number } } = {};

      // 批量获取拍卖数据以提高性能
      const auctionPromises = auctionAddresses.map(async (auctionAddress, index) => {
        try {
          // 🔧 修复：获取拍卖基本信息，使用与首页相同的逻辑
          const [highestBid, highestBidder, biddingEnd, revealEnd, biddingStart, ended] = await Promise.all([
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
              functionName: 'biddingStart',
            }),
            publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionInfo.abi,
              functionName: 'ended',
            }).catch(() => false) // 如果合约没有ended字段，默认为false
          ]);

          // 🔧 修复：使用前端时间计算状态，与其他页面保持一致
          const currentTime = Math.floor(Date.now() / 1000);
          const biddingStartTime = Number(biddingStart);
          const biddingEndTime = Number(biddingEnd);
          const revealEndTime = Number(revealEnd);

          let status: "未开始" | "竞拍中" | "揭示中" | "已结束" = "竞拍中";
          let phase = 1; // 默认为竞拍中

          if (currentTime >= revealEndTime || ended) {
            status = "已结束";
            phase = 3;
          } else if (currentTime >= biddingEndTime) {
            status = "揭示中";
            phase = 2;
          } else if (currentTime >= biddingStartTime) {
            status = "竞拍中";
            phase = 1;
          } else {
            status = "未开始";
            phase = 0;
          }

          // 🔧 新增：获取NFT合约数据以准确分类
          let categoryName = "其他";
          let auctionName = "未命名拍卖";

          try {
            // 检查是否为NFT拍卖
            const isNFTAuction = await publicClient.readContract({
              address: auctionAddress,
              abi: blindAuctionInfo.abi,
              functionName: 'isNFTAuction',
            }) as boolean;

            if (isNFTAuction) {
              // 获取NFT Token ID和合约地址
              const [nftTokenId, nftContractAddress] = await Promise.all([
                publicClient.readContract({
                  address: auctionAddress,
                  abi: blindAuctionInfo.abi,
                  functionName: 'nftTokenId',
                }) as Promise<bigint>,
                publicClient.readContract({
                  address: auctionAddress,
                  abi: blindAuctionInfo.abi,
                  functionName: 'nftContract',
                }) as Promise<`0x${string}`>
              ]);

              if (nftContractAddress && nftTokenId > 0n) {
                try {
                  // 从NFT合约获取元数据
                  const nftMetadata = await publicClient.readContract({
                    address: nftContractAddress,
                    abi: nftContractData.abi,
                    functionName: 'nftMetadata',
                    args: [nftTokenId],
                  }) as readonly [string, string, string, bigint, `0x${string}`, boolean, `0x${string}`, bigint];

                  const [name, , , , , , , categoryCode] = nftMetadata;
                  auctionName = name || `NFT #${Number(nftTokenId)}`;

                  // 根据categoryCode映射分类名称
                  const categoryMapping: { [key: string]: string } = {
                    '0': '艺术品',
                    '1': '音乐',
                    '2': '体育',
                    '3': '游戏',
                    '4': '收藏品',
                    '5': '虚拟世界',
                    '6': '其他'
                  };
                  categoryName = categoryMapping[categoryCode.toString()] || '其他';
                } catch (nftError) {
                  console.warn(`获取NFT拍卖 ${auctionAddress} 元数据失败:`, nftError);
                }
              }
            }

            // 🔧 如果NFT数据获取失败，尝试从事件日志获取作为备选方案
            if (categoryName === "其他" && auctionName === "未命名拍卖") {
              try {
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
                    const metadata = JSON.parse(metadataStr);
                    auctionName = metadata.name || "未命名拍卖";
                    categoryName = metadata.category || '其他';
                  }
                }
              } catch (e) {
                console.warn(`从事件日志获取拍卖 ${auctionAddress} 元数据失败:`, e);
              }
            }
          } catch (e) {
            console.warn(`获取拍卖 ${auctionAddress} 分类信息失败:`, e);
          }

          return {
            address: auctionAddress,
            phase,
            status,
            highestBid: BigInt(highestBid || 0),
            highestBidder: highestBidder as string,
            biddingEnd: biddingEndTime,
            revealEnd: revealEndTime,
            ended: Boolean(ended),
            categoryName,
            auctionName
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

        // 🔧 修复：统计拍卖状态 - 使用新的status字段
        if (auction.status === "已结束") {
          completedAuctions++;

          // 只有当最高出价大于0且有有效的最高竞拍者时，才算成功成交
          if (auction.highestBid > 0 &&
            auction.highestBidder &&
            auction.highestBidder !== '0x0000000000000000000000000000000000000000') {
            successfulAuctions++;
            totalVolume += auction.highestBid;

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

        // 使用从NFT合约获取的准确分类数据
        categoryData[auction.categoryName] = (categoryData[auction.categoryName] || 0) + 1;

        // 获取竞拍参与者数据
        try {
          // 获取所有竞拍事件
          const bidLogs = await publicClient.getContractEvents({
            address: auction.address,
            abi: blindAuctionInfo.abi,
            eventName: 'BidSubmitted',
            fromBlock: BigInt(0),
          });

          // 获取所有揭示事件
          const revealLogs = await publicClient.getContractEvents({
            address: auction.address,
            abi: blindAuctionInfo.abi,
            eventName: 'BidRevealed',
            fromBlock: BigInt(0),
          });

          // 记录每个竞拍者的投标记录
          const auctionBidders = new Map<string, { bids: number; volume: bigint }>();

          // 首先统计所有投标记录
          bidLogs.forEach(bidLog => {
            if (bidLog.args?.bidder) {
              const bidder = bidLog.args.bidder as string;
              totalParticipants.add(bidder);

              if (!auctionBidders.has(bidder)) {
                auctionBidders.set(bidder, { bids: 0, volume: BigInt(0) });
              }
              const bidderData = auctionBidders.get(bidder)!;
              bidderData.bids += 1;

              // 初始化全局统计
              if (!bidderStats[bidder]) {
                bidderStats[bidder] = {
                  totalBids: 0,
                  totalVolume: BigInt(0),
                  auctions: new Set()
                };
              }
            }
          });

          // 然后统计已揭示的出价
          revealLogs.forEach(revealLog => {
            if (revealLog.args?.bidder && revealLog.args?.value && revealLog.args?.success !== undefined) {
              const bidder = revealLog.args.bidder as string;
              const value = BigInt(revealLog.args.value);
              const isValidBid = revealLog.args.success;

              if (isValidBid) {
                const bidderData = auctionBidders.get(bidder);
                if (bidderData) {
                  bidderData.volume += value;
                }
              }
            }
          });

          // 更新全局统计
          auctionBidders.forEach((data, bidder) => {
            bidderStats[bidder].totalBids += data.bids;
            bidderStats[bidder].totalVolume += data.volume;
            bidderStats[bidder].auctions.add(auction.address);
          });

        } catch (e) {
          console.warn(`获取拍卖 ${auction.address} 竞拍事件失败:`, e);

          // 备用方案：如果事件日志获取失败，通过最高出价者推断参与者
          if (auction.highestBidder && auction.highestBidder !== '0x0000000000000000000000000000000000000000') {
            totalParticipants.add(auction.highestBidder);

            if (!bidderStats[auction.highestBidder]) {
              bidderStats[auction.highestBidder] = {
                totalBids: 1,
                totalVolume: auction.highestBid,
                auctions: new Set([auction.address])
              };
            } else {
              bidderStats[auction.highestBidder].totalBids += 1;
              bidderStats[auction.highestBidder].totalVolume += auction.highestBid;
              bidderStats[auction.highestBidder].auctions.add(auction.address);
            }
          }
        }
      }

      // 计算平均价格（基于成功成交的拍卖）
      const averagePrice = successfulAuctions > 0
        ? formatEther(totalVolume / BigInt(successfulAuctions))
        : '0';

      const totalVolumeString = formatEther(totalVolume);

      // 计算成功率
      const successRate = completedAuctions > 0
        ? (successfulAuctions / completedAuctions) * 100
        : 0;

      // 获取顶级竞拍者
      const topBidders = Object.entries(bidderStats)
        .map(([address, stats]) => ({
          address: address,
          displayAddress: `${address.slice(0, 6)}...${address.slice(-4)}`,
          totalBids: stats.totalBids,
          totalVolume: formatEther(stats.totalVolume),
          uniqueAuctions: stats.auctions.size
        }))
        // 首先按总投入量排序
        .sort((a, b) => parseFloat(b.totalVolume) - parseFloat(a.totalVolume))
        // 如果总投入量相同，按参与次数排序
        .sort((a, b) => {
          const volumeDiff = parseFloat(b.totalVolume) - parseFloat(a.totalVolume);
          if (volumeDiff === 0) {
            return b.totalBids - a.totalBids;
          }
          return volumeDiff;
        })
        .slice(0, 10)
        .map(bidder => ({
          address: bidder.displayAddress,
          totalBids: bidder.totalBids,
          totalVolume: bidder.totalVolume
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
      const averageParticipantsPerAuction = validAuctions.length > 0
        ? totalParticipants.size / validAuctions.length
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
        totalAuctions: validAuctions.length,
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

      setAnalyticsData(finalData);
      setCachedData(finalData, currentBlock);

    } catch (error) {
      console.error("获取分析数据失败:", error);
      setError(error instanceof Error ? error.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [factoryContractData, blindAuctionInfo, publicClient, getCachedData, setCachedData, nftContractData]);

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