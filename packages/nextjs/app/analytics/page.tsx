'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { useAuctionAnalytics } from '~~/hooks/useAuctionAnalytics';
import { useState, useEffect } from 'react';

// 注册Chart.js组件
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler
);

// 动画数字组件
const AnimatedNumber = ({ value, duration = 2000, suffix = '' }: { value: number; duration?: number; suffix?: string }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    // 如果值为0、null、undefined或NaN，直接设置为0
    if (!value || isNaN(value) || value === 0) {
      setDisplayValue(0);
      return;
    }

    // 立即设置最终值
    setDisplayValue(value);

    // 后续可以恢复动画效果
    // let startTime: number;
    // const startValue = 0;
    // const endValue = value;

    // const animate = (currentTime: number) => {
    //   if (!startTime) startTime = currentTime;
    //   const progress = Math.min((currentTime - startTime) / duration, 1);

    //   const easedProgress = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    //   const currentValue = startValue + (endValue - startValue) * easedProgress;

    //   setDisplayValue(currentValue);

    //   if (progress < 1) {
    //     requestAnimationFrame(animate);
    //   }
    // };

    // requestAnimationFrame(animate);
  }, [value, duration, suffix]);

  // 根据数值大小决定小数位数
  const getDecimalPlaces = () => {
    if (suffix === ' ETH') {
      if (displayValue >= 1) return 3;
      if (displayValue >= 0.01) return 4;
      return 6; // 对于很小的ETH值，显示更多小数位
    }
    if (suffix === '%') return 1;
    return 0;
  };

  // 特殊处理：平均成交价为0时显示"暂无成交"
  if (suffix === ' ETH' && displayValue === 0) {
    return <span className="text-slate-400 text-xl">暂无成交</span>;
  }

  const formattedValue = displayValue.toFixed(getDecimalPlaces());

  return <span>{formattedValue}{suffix}</span>;
};

// 统计卡片组件
const StatsCard = ({
  title,
  value,
  subtitle,
  icon,
  gradient,
  textColor,
  delay = 0,
  isEthValue = false
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: string;
  gradient: string;
  textColor: string;
  delay?: number;
  isEthValue?: boolean;
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`relative group transform transition-all duration-700 hover:scale-105 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
    >
      {/* 外层光晕效果 */}
      <div className={`absolute -inset-0.5 ${gradient} rounded-xl blur opacity-30 group-hover:opacity-50 transition duration-1000 group-hover:duration-200`}></div>

      {/* 卡片主体 */}
      <div className="relative bg-slate-900/80 backdrop-blur-xl rounded-xl p-6 border border-slate-700/50 hover:border-slate-600 transition-all duration-300">
        {/* 内部光效 */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-slate-400 text-sm font-medium">{title}</p>
            <p className={`text-3xl font-bold ${textColor} mt-1`}>
              {/* 为ETH相关的数值添加特殊处理 */}
              {isEthValue ? (
                <>
                  <AnimatedNumber
                    key={`${title}-${value}`}
                    value={value}
                    suffix=" ETH"
                  />
                </>
              ) : title.includes('ETH') ? (
                <>
                  <AnimatedNumber
                    key={`${title}-${value}`}
                    value={value}
                    suffix=" ETH"
                  />
                </>
              ) : title.includes('%') ? (
                <AnimatedNumber
                  key={`${title}-${value}`}
                  value={value}
                  suffix="%"
                />
              ) : (
                <AnimatedNumber
                  key={`${title}-${value}`}
                  value={value}
                  suffix=""
                />
              )}
            </p>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">{subtitle}</p>
          </div>
          <div className={`text-4xl opacity-80 group-hover:scale-110 transition-transform duration-300`}>
            {icon}
          </div>
        </div>

        {/* 底部装饰线 */}
        <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${gradient} opacity-20`}></div>
      </div>
    </div>
  );
};

export default function AnalyticsPage() {
  const { data: analyticsData, loading, error, refresh } = useAuctionAnalytics();

  // 强制重新渲染机制
  const [renderKey, setRenderKey] = useState(0);
  useEffect(() => {
    if (!loading && analyticsData.totalAuctions > 0) {
      setRenderKey(prev => prev + 1);
    }
  }, [analyticsData, loading]);

  // 高级图表配置
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#e2e8f0',
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
            family: "'Inter', sans-serif"
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#e2e8f0',
        bodyColor: '#cbd5e1',
        borderColor: '#475569',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        displayColors: true,
        callbacks: {
          labelTextColor: () => '#cbd5e1'
        }
      }
    },
    scales: {
      y: {
        ticks: {
          color: '#94a3b8',
          font: {
            size: 11,
            family: "'Inter', sans-serif"
          }
        },
        grid: {
          color: 'rgba(51, 65, 85, 0.3)',
          drawBorder: false
        },
        border: {
          display: false
        }
      },
      x: {
        ticks: {
          color: '#94a3b8',
          font: {
            size: 11,
            family: "'Inter', sans-serif"
          }
        },
        grid: {
          color: 'rgba(51, 65, 85, 0.3)',
          drawBorder: false
        },
        border: {
          display: false
        }
      }
    },
    elements: {
      bar: {
        borderRadius: 6,
        borderSkipped: false,
      },
      point: {
        radius: 4,
        hoverRadius: 6,
        borderWidth: 2,
        hoverBorderWidth: 3
      },
      line: {
        tension: 0.4,
        borderWidth: 3
      }
    }
  };

  // 拍卖类别分布图数据
  const categoryChartData = {
    labels: Object.keys(analyticsData.categoryData),
    datasets: [
      {
        data: Object.values(analyticsData.categoryData),
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',   // blue
          'rgba(139, 92, 246, 0.8)',   // purple  
          'rgba(236, 72, 153, 0.8)',   // pink
          'rgba(245, 158, 11, 0.8)',   // amber
          'rgba(16, 185, 129, 0.8)',   // emerald
          'rgba(239, 68, 68, 0.8)',    // red
          'rgba(6, 182, 212, 0.8)'     // cyan
        ],
        borderColor: [
          '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'
        ],
        borderWidth: 2,
        hoverBorderWidth: 3,
        hoverOffset: 10
      },
    ],
  };

  // 价格趋势图数据 - 使用渐变填充
  const priceChartData = {
    labels: analyticsData.priceHistory.map(item => item.date),
    datasets: [
      {
        label: '平均价格 (ETH)',
        data: analyticsData.priceHistory.map(item => item.avgPrice),
        borderColor: '#3b82f6',
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return null;

          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
          gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.2)');
          gradient.addColorStop(1, 'rgba(59, 130, 246, 0.05)');
          return gradient;
        },
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#1e40af',
        pointHoverBackgroundColor: '#60a5fa',
        pointHoverBorderColor: '#1e40af',
      },
      {
        label: '成交量 (ETH)',
        data: analyticsData.priceHistory.map(item => item.volume),
        borderColor: '#8b5cf6',
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return null;

          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(139, 92, 246, 0.4)');
          gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.2)');
          gradient.addColorStop(1, 'rgba(139, 92, 246, 0.05)');
          return gradient;
        },
        fill: true,
        tension: 0.4,
        yAxisID: 'y1',
        pointBackgroundColor: '#8b5cf6',
        pointBorderColor: '#6d28d9',
        pointHoverBackgroundColor: '#a78bfa',
        pointHoverBorderColor: '#6d28d9',
      },
    ],
  };

  // 每日拍卖统计图数据 - 渐变柱状图
  const dailyStatsData = {
    labels: analyticsData.dailyStats.map(item => item.date),
    datasets: [
      {
        label: '每日拍卖数量',
        data: analyticsData.dailyStats.map(item => item.auctions),
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return null;

          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(59, 130, 246, 0.9)');
          gradient.addColorStop(1, 'rgba(59, 130, 246, 0.4)');
          return gradient;
        },
        borderColor: '#3b82f6',
        borderWidth: 1,
        borderRadius: 8,
        borderSkipped: false,
      },
    ],
  };

  const priceChartOptions = {
    ...chartOptions,
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        ticks: {
          color: '#94a3b8',
          font: {
            size: 11,
            family: "'Inter', sans-serif"
          }
        },
        grid: {
          color: 'rgba(51, 65, 85, 0.3)',
          drawBorder: false
        },
        border: {
          display: false
        }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        ticks: {
          color: '#94a3b8',
          font: {
            size: 11,
            family: "'Inter', sans-serif"
          }
        },
        grid: {
          drawOnChartArea: false,
          color: 'rgba(51, 65, 85, 0.3)',
          drawBorder: false
        },
        border: {
          display: false
        }
      },
      x: {
        ticks: {
          color: '#94a3b8',
          font: {
            size: 11,
            family: "'Inter', sans-serif"
          }
        },
        grid: {
          color: 'rgba(51, 65, 85, 0.3)',
          drawBorder: false
        },
        border: {
          display: false
        }
      }
    },
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
        <div className="text-center">
          {/* 炫酷的加载动画 */}
          <div className="relative flex items-center justify-center">
            <div className="w-24 h-24 border-4 border-purple-500/30 rounded-full animate-spin border-t-purple-500"></div>
            <div className="absolute w-20 h-20 border-4 border-blue-500/30 rounded-full animate-spin border-t-blue-500 animation-delay-150"></div>
            <div className="absolute w-16 h-16 border-4 border-cyan-500/30 rounded-full animate-spin border-t-cyan-500 animation-delay-300"></div>
          </div>
          <p className="text-slate-300 mt-8 text-lg">正在分析拍卖数据...</p>
          <p className="text-slate-500 mt-2 text-sm">解析智能合约事件，计算统计指标</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
        <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-red-500/50 shadow-lg max-w-md">
          <div className="text-6xl mb-6 animate-bounce">⚠️</div>
          <h3 className="text-xl font-semibold mb-4 text-white">数据加载失败</h3>
          <p className="text-slate-300 mb-6">{error}</p>
          <button
            onClick={refresh}
            className="btn btn-primary bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 border-0"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033] text-white">
      {/* 背景装饰 */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(102,0,255,0.05)_1.5px,transparent_1.5px),linear-gradient(90deg,rgba(102,0,255,0.05)_1.5px,transparent_1.5px)] bg-[size:30px_30px] pointer-events-none"></div>
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-0 -left-40 w-96 h-96 bg-blue-700 rounded-full filter blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-0 -right-40 w-96 h-96 bg-purple-700 rounded-full filter blur-[120px] animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 w-full px-4 py-12">
        {/* 页面标题 */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 mb-4 neon-text">
            拍卖数据分析仪表板
          </h1>
          <div className="mt-6 flex justify-center">
            <div className="h-1 w-32 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-full relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full blur-sm"></div>
            </div>
          </div>
          <p className="text-xl text-slate-300 mb-6 mt-6">
            深入了解平台拍卖数据和用户行为
          </p>
        </div>

        {/* 主要统计卡片 - 炫酷版本 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16" key={renderKey}>
          <StatsCard
            title="总拍卖数量"
            value={Number(analyticsData.totalAuctions) || 0}
            subtitle={`平均 ${analyticsData.averageParticipantsPerAuction.toFixed(1)} 人参与`}
            icon="🏷️"
            gradient="bg-gradient-to-r from-blue-600 to-blue-400"
            textColor="text-blue-400"
            delay={0}
            isEthValue={false}
          />

          <StatsCard
            title="总成交金额"
            value={parseFloat(analyticsData.totalVolume) || 0}
            subtitle={`${analyticsData.successfulAuctions} 笔成功交易`}
            icon="💰"
            gradient="bg-gradient-to-r from-green-600 to-emerald-400"
            textColor="text-green-400"
            delay={200}
            isEthValue={true}
          />

          <StatsCard
            title="平均成交价"
            value={parseFloat(analyticsData.averagePrice) || 0}
            subtitle={`成功率 ${analyticsData.successRate.toFixed(1)}%`}
            icon="📈"
            gradient="bg-gradient-to-r from-purple-600 to-purple-400"
            textColor="text-purple-400"
            delay={400}
            isEthValue={true}
          />

          <StatsCard
            title="参与用户数"
            value={Number(analyticsData.totalParticipants) || 0}
            subtitle={analyticsData.totalParticipants === 0 ? "还没有用户参与拍卖" : `${analyticsData.activeAuctions} 个活跃拍卖`}
            icon="👥"
            gradient="bg-gradient-to-r from-cyan-600 to-cyan-400"
            textColor="text-cyan-400"
            delay={600}
            isEthValue={false}
          />
        </div>

        {/* 图表区域 - 增强版 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* 拍卖状态分布 */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-green-600 to-blue-600 rounded-xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
            <div className="relative bg-slate-900/80 backdrop-blur-xl rounded-xl p-8 border border-slate-700/50">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
              <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
                <span className="w-3 h-3 bg-gradient-to-r from-green-400 to-blue-400 rounded-full mr-3"></span>
                拍卖状态分布
              </h3>
              <div className="h-64">
                <Bar
                  data={{
                    labels: ['已完成', '进行中'],
                    datasets: [{
                      label: '拍卖数量',
                      data: [analyticsData.completedAuctions, analyticsData.activeAuctions],
                      backgroundColor: [
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(59, 130, 246, 0.8)'
                      ],
                      borderColor: ['#10b981', '#3b82f6'],
                      borderWidth: 2,
                      borderRadius: 8,
                      borderSkipped: false,
                    }]
                  }}
                  options={chartOptions}
                />
              </div>
            </div>
          </div>

          {/* 拍卖类别分布 */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
            <div className="relative bg-slate-900/80 backdrop-blur-xl rounded-xl p-8 border border-slate-700/50">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
              <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
                <span className="w-3 h-3 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full mr-3"></span>
                热门拍卖品类
              </h3>
              <div className="h-64">
                {Object.keys(analyticsData.categoryData).length > 0 ? (
                  <Doughnut
                    data={categoryChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'bottom',
                          labels: {
                            color: '#e2e8f0',
                            usePointStyle: true,
                            padding: 15,
                            font: {
                              size: 12,
                              family: "'Inter', sans-serif"
                            }
                          }
                        },
                        tooltip: {
                          backgroundColor: 'rgba(15, 23, 42, 0.95)',
                          titleColor: '#e2e8f0',
                          bodyColor: '#cbd5e1',
                          borderColor: '#475569',
                          borderWidth: 1,
                          cornerRadius: 8,
                        }
                      }
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400">
                    <div className="text-center">
                      <div className="text-4xl mb-4 opacity-50">📦</div>
                      <p>暂无分类数据</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 每日拍卖趋势 */}
        {analyticsData.dailyStats.length > 0 && (
          <div className="relative group mb-12">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
            <div className="relative bg-slate-900/80 backdrop-blur-xl rounded-xl p-8 border border-slate-700/50">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
              <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
                <span className="w-3 h-3 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full mr-3"></span>
                每日拍卖趋势
              </h3>
              <div className="h-80">
                <Bar data={dailyStatsData} options={chartOptions} />
              </div>
            </div>
          </div>
        )}

        {/* 价格趋势图 */}
        {analyticsData.priceHistory.length > 0 && (
          <div className="relative group mb-12">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
            <div className="relative bg-slate-900/80 backdrop-blur-xl rounded-xl p-8 border border-slate-700/50">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
              <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
                <span className="w-3 h-3 bg-gradient-to-r from-purple-400 to-blue-400 rounded-full mr-3"></span>
                价格趋势分析
              </h3>
              <div className="h-80">
                <Line data={priceChartData} options={priceChartOptions} />
              </div>
            </div>
          </div>
        )}

        {/* 顶级竞拍者排行榜 */}
        <div className="relative group mb-12">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-600 to-orange-600 rounded-xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl rounded-xl p-8 border border-slate-700/50">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
              <span className="w-3 h-3 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full mr-3"></span>
              🏆 顶级竞拍者排行榜
            </h3>
            {analyticsData.topBidders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="table w-full">
                  <thead>
                    <tr className="border-slate-600">
                      <th className="text-slate-300">排名</th>
                      <th className="text-slate-300">地址</th>
                      <th className="text-slate-300">参与次数</th>
                      <th className="text-slate-300">总投入 (ETH)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyticsData.topBidders.map((bidder, index) => (
                      <tr key={bidder.address} className="border-slate-600 hover:bg-slate-700/50 transition-all duration-300 group/row">
                        <td className="text-white">
                          <span className="text-2xl">
                            {index + 1 === 1 && '🥇'}
                            {index + 1 === 2 && '🥈'}
                            {index + 1 === 3 && '🥉'}
                            {index + 1 > 3 && `#${index + 1}`}
                          </span>
                        </td>
                        <td className="font-mono text-blue-400 group-hover/row:text-blue-300 transition-colors">
                          {bidder.address}
                        </td>
                        <td className="text-white">
                          <span className="px-2 py-1 bg-slate-700 rounded-full text-xs">
                            {bidder.totalBids}
                          </span>
                        </td>
                        <td className="text-green-400 font-semibold">
                          {parseFloat(bidder.totalVolume).toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-slate-400">
                <div className="text-center">
                  <div className="text-4xl mb-4 opacity-50">🏆</div>
                  <p className="text-lg mb-2">暂无竞拍者数据</p>
                  <p className="text-sm">当有用户参与拍卖后，排行榜将显示在这里</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 数据洞察卡片 - 增强版 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
            <div className="relative bg-gradient-to-br from-blue-600/10 to-blue-800/10 backdrop-blur-xl rounded-xl p-6 border border-blue-500/30">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent"></div>
              <h4 className="text-lg font-semibold text-blue-300 mb-3 flex items-center">
                <span className="text-xl mr-2">💡</span>
                竞拍活跃度
              </h4>
              <p className="text-slate-300 text-sm leading-relaxed">
                平均每个拍卖有 <span className="font-bold text-blue-400">{analyticsData.averageParticipantsPerAuction.toFixed(1)}</span> 位用户参与，
                显示了{analyticsData.averageParticipantsPerAuction > 2 ? '较高的' : '适中的'}用户参与度。
              </p>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
            <div className="relative bg-gradient-to-br from-purple-600/10 to-purple-800/10 backdrop-blur-xl rounded-xl p-6 border border-purple-500/30">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-400/50 to-transparent"></div>
              <h4 className="text-lg font-semibold text-purple-300 mb-3 flex items-center">
                <span className="text-xl mr-2">📊</span>
                成功率分析
              </h4>
              <p className="text-slate-300 text-sm leading-relaxed">
                拍卖成功率为 <span className="font-bold text-purple-400">
                  {analyticsData.successRate.toFixed(1)}%
                </span>，
                {analyticsData.successRate > 60 ? '表现优秀' : analyticsData.successRate > 30 ? '表现良好' : '仍有增长空间'}。
              </p>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
            <div className="relative bg-gradient-to-br from-green-600/10 to-green-800/10 backdrop-blur-xl rounded-xl p-6 border border-green-500/30">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green-400/50 to-transparent"></div>
              <h4 className="text-lg font-semibold text-green-300 mb-3 flex items-center">
                <span className="text-xl mr-2">📈</span>
                增长趋势
              </h4>
              <p className="text-slate-300 text-sm leading-relaxed">
                月度增长率为 <span className={`font-bold ${analyticsData.monthlyGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {analyticsData.monthlyGrowth > 0 ? '+' : ''}{analyticsData.monthlyGrowth.toFixed(1)}%
                </span>，
                {analyticsData.monthlyGrowth > 10 ? '增长强劲' : analyticsData.monthlyGrowth > 0 ? '稳定增长' : '需要关注'}。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 