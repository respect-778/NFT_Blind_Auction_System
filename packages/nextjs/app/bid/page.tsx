'use client';

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useScaffoldContract } from "~~/hooks/scaffold-eth/useScaffoldContract";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth/useScaffoldReadContract";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth/useScaffoldWriteContract";
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { notification } from "~~/utils/scaffold-eth";
import { useSearchParams } from 'next/navigation';
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { useRouter } from 'next/navigation';
import { formatEther } from 'viem';

export default function BidPage() {
  const { address: connectedAddress } = useAccount();
  const searchParams = useSearchParams();
  const auctionAddress = searchParams?.get('address') as `0x${string}` || undefined;
  const [value, setValue] = useState<string>('');
  const [fake, setFake] = useState<boolean>(false);
  const [secret, setSecret] = useState<string>('');
  const [blindedBid, setBlindedBid] = useState<string>('');
  const [deposit, setDeposit] = useState<string>('');
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [phase, setPhase] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [hasParticipated, setHasParticipated] = useState<boolean>(false);
  const [biddingEndData, setBiddingEndData] = useState<bigint | undefined>();
  const [revealEndData, setRevealEndData] = useState<bigint | undefined>();
  const [minPrice, setMinPrice] = useState<string>('0');
  const [minPriceWei, setMinPriceWei] = useState<bigint>(BigInt(0));
  const [auctionMetadata, setAuctionMetadata] = useState<any>(null);
  const router = useRouter();

  // 获取公共客户端和合约信息
  const publicClient = usePublicClient();
  const { data: blindAuctionInfo } = useDeployedContractInfo("BlindAuction");
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { data: walletClient } = useWalletClient();

  // 从URL获取当前拍卖合约地址
  useEffect(() => {
    if (!auctionAddress) {
      setError("未指定拍卖地址，请从正确的拍卖详情页进入");
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [auctionAddress]);

  // 获取合约状态
  useEffect(() => {
    const fetchAuctionData = async () => {
      if (!auctionAddress || !publicClient || !blindAuctionInfo) return;

      try {
        // 获取拍卖阶段
        const phaseData = await publicClient.readContract({
          address: auctionAddress,
          abi: blindAuctionInfo.abi,
          functionName: 'getAuctionPhase',
        });

        // 获取竞拍结束时间和揭示结束时间
        const [biddingEndData, revealEndData, endedData] = await Promise.all([
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
          })
        ]);

        // 获取拍卖元数据（包含最低出价信息）
        try {
          if (factoryContractData) {
            // 通过工厂合约获取拍卖创建事件
            const logs = await publicClient.getContractEvents({
              address: factoryContractData.address,
              abi: factoryContractData.abi,
              eventName: 'AuctionCreated',
              args: {
                auctionAddress: auctionAddress
              },
              fromBlock: BigInt(0),
            });

            if (logs && logs.length > 0 && logs[0].args) {
              const metadataStr = logs[0].args.metadata as string;
              if (metadataStr) {
                try {
                  const metadata = JSON.parse(metadataStr);
                  setAuctionMetadata(metadata);

                  // 处理最低出价：metadata.minPrice可能是wei格式的字符串
                  const minPriceWei = BigInt(metadata.minPrice || '0');
                  const minPriceEth = formatEther(minPriceWei);

                  setMinPrice(minPriceEth);
                  setMinPriceWei(minPriceWei);
                  console.log("获取到拍卖最低出价:", {
                    wei: metadata.minPrice,
                    eth: minPriceEth
                  });
                } catch (e) {
                  console.error("解析元数据字符串失败:", e);
                }
              }
            }
          }
        } catch (error) {
          console.warn("获取拍卖元数据失败，将使用默认值:", error);
        }

        // 计算剩余时间和确定实际阶段
        const now = Math.floor(Date.now() / 1000);
        let currentPhase = Number(phaseData);

        // 使用合约返回的阶段状态，不需要额外判断
        // 0: 未开始, 1: 竞标阶段, 2: 披露阶段, 3: 拍卖结束
        setPhase(currentPhase);

        // 计算剩余时间
        if (currentPhase === 0 && biddingEndData) {
          // 未开始阶段，显示竞拍开始倒计时
          const startTime = now; // 这里需要获取biddingStart
          // 先获取biddingStart
          const biddingStartData = await publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionInfo.abi,
            functionName: 'biddingStart',
          });

          const remaining = Math.max(0, Number(biddingStartData) - now);
          const hours = Math.floor(remaining / 3600);
          const minutes = Math.floor((remaining % 3600) / 60);
          const seconds = remaining % 60;
          setTimeLeft(`${hours}小时 ${minutes}分钟 ${seconds}秒`);
        } else if (currentPhase === 1 && biddingEndData) {
          // 竞拍阶段显示竞拍剩余时间
          const endTime = Number(biddingEndData);
          const remaining = Math.max(0, endTime - now);

          const hours = Math.floor(remaining / 3600);
          const minutes = Math.floor((remaining % 3600) / 60);
          const seconds = remaining % 60;
          setTimeLeft(`${hours}小时 ${minutes}分钟 ${seconds}秒`);
        } else if (currentPhase === 2 && revealEndData) {
          // 揭示阶段显示揭示剩余时间
          const endTime = Number(revealEndData);
          const remaining = Math.max(0, endTime - now);

          const hours = Math.floor(remaining / 3600);
          const minutes = Math.floor((remaining % 3600) / 60);
          const seconds = remaining % 60;
          setTimeLeft(`${hours}小时 ${minutes}分钟 ${seconds}秒`);
        } else {
          // 拍卖已结束
          setTimeLeft("0小时 0分钟 0秒");
        }

        // 更新竞拍结束时间和揭示结束时间的状态变量
        setBiddingEndData(biddingEndData);
        setRevealEndData(revealEndData);
      } catch (error) {
        console.error("获取拍卖数据失败:", error);
        setError("获取拍卖数据失败，该拍卖可能不存在");
      }
    };

    fetchAuctionData();
    // 定期更新时间
    const intervalId = setInterval(fetchAuctionData, 10000);
    return () => clearInterval(intervalId);
  }, [auctionAddress, publicClient, blindAuctionInfo, factoryContractData]);

  // 检查用户是否已经参与过此拍卖
  useEffect(() => {
    if (connectedAddress && auctionAddress) {
      try {
        const existingBids = JSON.parse(localStorage.getItem(`bids_${connectedAddress}`) || '[]');
        const hasBidForThisAuction = existingBids.some((bid: any) =>
          bid.auctionAddress === auctionAddress
        );

        setHasParticipated(hasBidForThisAuction);
      } catch (error) {
        console.error("Error checking participation:", error);
      }
    }
  }, [connectedAddress, auctionAddress]);

  // 生成盲拍哈希
  const generateBlindedBid = async () => {
    // 如果出价金额或密钥为空，则提示用户填写
    if (!value.trim() || !secret.trim()) {
      notification.error("请填写出价金额和密钥");
      return;
    }

    try {
      // 设置正在计算状态
      setIsCalculating(true);
      // 计算哈希值 keccak256(abi.encodePacked(value, fake, secret))
      // 将出价金额转换为wei
      const valueInWei = ethers.parseEther(value);
      // 将出价金额、fake和密钥进行编码
      const encodedData = ethers.solidityPacked(
        ["uint", "bool", "bytes32"],
        [valueInWei, fake, ethers.keccak256(ethers.toUtf8Bytes(secret))]
      );

      // 计算哈希值
      const hash = ethers.keccak256(encodedData);
      // 设置盲出价
      setBlindedBid(hash);
      // 设置计算状态为完成
      setIsCalculating(false);
    } catch (error) {
      // 打印错误信息
      console.error("Error generating hash:", error);
      // 提示用户生成哈希时出错
      notification.error("生成哈希时出错");
      // 设置计算状态为完成
      setIsCalculating(false);
    }
  };

  // 提交盲拍
  const handleBid = async () => {
    // 检查拍卖地址是否已指定
    if (!auctionAddress) {
      notification.error("未指定拍卖地址");
      return;
    }

    // 检查盲拍哈希是否已生成
    if (!blindedBid) {
      notification.error("请先生成盲拍哈希");
      return;
    }

    // 检查当前是否在竞拍阶段
    if (phase !== 1) {
      notification.error("当前不在竞拍阶段，无法提交出价");
      return;
    }

    // 检查钱包是否已连接，合约信息是否缺失
    if (!walletClient || !blindAuctionInfo) {
      notification.error("钱包未连接或合约信息缺失");
      return;
    }

    // 严格验证出价和押金
    try {
      const minPriceNum = parseFloat(minPrice);
      const valueNum = parseFloat(value);
      const depositNum = parseFloat(deposit);

      // 验证出价金额不能为空或无效
      if (!value.trim() || isNaN(valueNum) || valueNum <= 0) {
        notification.error("请输入有效的出价金额");
        return;
      }

      // 验证押金不能为空或无效
      if (!deposit.trim() || isNaN(depositNum) || depositNum <= 0) {
        notification.error("请输入有效的押金金额");
        return;
      }

      // 验证出价金额必须大于等于最低出价
      if (valueNum < minPriceNum) {
        notification.error(`出价金额必须大于等于最低出价 ${minPrice} ETH`);
        return;
      }

      // 验证押金必须大于等于出价金额
      if (depositNum < valueNum) {
        notification.error("押金必须大于等于出价金额，以确保您能够支付承诺的价格");
        return;
      }

      // 额外验证：押金必须至少等于最低出价（即使是假出价）
      if (depositNum < minPriceNum) {
        notification.error(`押金必须至少等于最低出价 ${minPrice} ETH`);
        return;
      }

      console.log("验证通过:", {
        minPrice: minPriceNum,
        value: valueNum,
        deposit: depositNum,
        fake: fake
      });

    } catch (error) {
      console.error("验证出价和押金时出错:", error);
      notification.error("验证出价和押金时出错，请检查输入");
      return;
    }

    try {
      // 先获取当前用户在合约中已有的投标数量
      let contractBidCount = 0;
      try {
        if (publicClient && blindAuctionInfo && connectedAddress) {
          const bidCount = await publicClient.readContract({
            address: auctionAddress,
            abi: blindAuctionInfo.abi,
            functionName: 'getBidCount',
            args: [connectedAddress],
          });
          contractBidCount = bidCount ? Number(bidCount) : 0;

          // 检查用户是否已经竞拍过
          const existingBids = JSON.parse(localStorage.getItem(`bids_${connectedAddress}`) || '[]');
          const hasBidForThisAuction = existingBids.some((bid: any) =>
            bid.auctionAddress === auctionAddress
          );

          if (hasBidForThisAuction) {
            notification.warning("您已经在此拍卖中出价，每个用户只能出价一次");
            return;
          }
        }
      } catch (error) {
        console.error("Error getting bid count:", error);
      }

      // 设置提交状态为true，显示加载中
      setIsSubmitting(true);

      // 使用walletClient写合约
      const tx = await walletClient.writeContract({
        address: auctionAddress,
        abi: blindAuctionInfo.abi,
        functionName: "bid",
        args: [blindedBid as `0x${string}`],
        value: deposit ? ethers.parseEther(deposit) : undefined, // 放置押金金额
      });

      notification.success("盲拍提交成功！");
      // 修改竞标数据存储逻辑
      const bidInfo = {
        value,
        fake,
        secret,
        blindedBid,
        deposit,
        timestamp: Date.now(),
        contractIndex: Number(contractBidCount || 0), // 确保是数字类型
        auctionAddress, // 添加拍卖地址
        biddingEnd: biddingEndData ? Number(biddingEndData) : undefined, // 记录合约的竞拍结束时间
        revealEnd: revealEndData ? Number(revealEndData) : undefined // 记录合约的揭示结束时间
      };

      // 记录调试信息
      console.log("存储的竞标信息:", {
        ...bidInfo,
        address: connectedAddress,
        contractBidCount: contractBidCount ? Number(contractBidCount) : 0
      });

      // 获取现有的出价记录
      const existingBids = JSON.parse(localStorage.getItem(`bids_${connectedAddress}`) || '[]');
      existingBids.push(bidInfo);
      localStorage.setItem(`bids_${connectedAddress}`, JSON.stringify(existingBids));

      // 重置表单
      setValue('');
      setSecret('');
      setBlindedBid('');
      setDeposit('');
      setFake(false);

      // 添加导航到所有竞拍页面
      setTimeout(() => {
        router.push('/all-auctions');
      }, 1500); // 延迟1.5秒后跳转，让用户看到成功提示

    } catch (error) {
      console.error("Error placing bid:", error);
      notification.error("提交盲拍时出错");
    } finally {
      // 无论成功或失败，都将提交状态设为false
      setIsSubmitting(false);
    }
  };

  // 随机生成密钥
  const generateRandomSecret = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const length = 12;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    setSecret(result);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
        <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-slate-700 shadow-lg max-w-md">
          <div className="text-4xl mb-4 text-red-500">⚠️</div>
          <h3 className="text-xl font-semibold mb-4 text-white">错误</h3>
          <p className="text-slate-300 mb-6">{error}</p>
          <a href="/all-auctions" className="btn btn-primary">浏览所有拍卖</a>
        </div>
      </div>
    );
  }

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
            <div className="bg-slate-800/70 backdrop-blur-md rounded-xl p-8 text-center border border-slate-700 shadow-lg neon-border">
              <div className="text-6xl mb-6 opacity-80 glow-icon">🔐</div>
              <h2 className="text-2xl font-semibold mb-4 text-white">
                参与竞拍
              </h2>
              <div className="mb-4">
                <p className="text-slate-300 mb-2">拍卖地址: <span className="font-mono text-blue-300">{auctionAddress}</span></p>
                <p className="text-slate-300">
                  当前状态: <span className={`font-semibold ${phase === 0 ? 'text-blue-400' :
                    phase === 1 ? 'text-green-400' :
                      phase === 2 ? 'text-yellow-400' :
                        'text-red-400'
                    }`}>
                    {phase === 0 ? '未开始' :
                      phase === 1 ? '竞拍阶段' :
                        phase === 2 ? '揭示阶段' :
                          '已结束'}
                  </span>
                  {timeLeft && (
                    <span className="text-slate-400">
                      {phase === 0 ? ' (竞拍开始倒计时: ' :
                        phase === 1 ? ' (剩余时间: ' :
                          phase === 2 ? ' (揭示剩余时间: ' :
                            ' ('}
                      {timeLeft})
                    </span>
                  )}
                </p>
              </div>
            </div>

            {error ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-red-500 shadow-lg">
                <div className="text-6xl mb-6 opacity-80">❌</div>
                <h3 className="text-xl font-semibold mb-4 text-white">出现错误</h3>
                <p className="text-red-300 mb-6">{error}</p>
              </div>
            ) : !connectedAddress ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-slate-700 shadow-lg">
                <div className="text-6xl mb-6 opacity-80">🔒</div>
                <h3 className="text-xl font-semibold mb-4 text-white">请连接钱包</h3>
                <p className="text-slate-300 mb-6">您需要连接以太坊钱包来参与竞拍</p>
                <button className="btn btn-primary bg-gradient-to-r from-blue-600 to-purple-600 border-0 btn-cyber">
                  连接钱包
                </button>
              </div>
            ) : phase === 0 ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-slate-700 shadow-lg scan-container">
                <div className="scan-line"></div>
                <div className="text-6xl mb-6 opacity-80 encrypt-icon">⏰</div>
                <h3 className="text-xl font-semibold mb-4 text-white">拍卖尚未开始</h3>
                <p className="mb-6 text-slate-300">
                  竞拍还没有开始，请等待竞拍开始时间到达后再参与。
                </p>
                <a
                  href="/all-auctions"
                  className="btn btn-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 glow-on-hover"
                >
                  浏览其他拍卖
                </a>
              </div>
            ) : phase === 2 ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-slate-700 shadow-lg scan-container">
                <div className="scan-line"></div>
                <div className="text-6xl mb-6 opacity-80 encrypt-icon">🔓</div>
                <h3 className="text-xl font-semibold mb-4 text-white">竞拍阶段已结束</h3>
                <p className="mb-6 text-slate-300">
                  竞拍阶段已结束，您现在需要前往揭示页面提交您的真实出价。
                </p>
                <a
                  href={`/reveal?address=${auctionAddress}`}
                  className="btn btn-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 glow-on-hover"
                >
                  前往揭示页面
                </a>
              </div>
            ) : phase === 3 ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-slate-700 shadow-lg scan-container">
                <div className="scan-line"></div>
                <div className="text-6xl mb-6 opacity-80 encrypt-icon">🏁</div>
                <h3 className="text-xl font-semibold mb-4 text-white">拍卖已结束</h3>
                <p className="mb-6 text-slate-300">
                  拍卖已完全结束，您可以查看拍卖结果。
                </p>
                <a
                  href={`/results?address=${auctionAddress}`}
                  className="btn btn-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 glow-on-hover"
                >
                  查看拍卖结果
                </a>
              </div>
            ) : hasParticipated ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-slate-700 shadow-lg">
                <div className="text-6xl mb-6 opacity-80">✅</div>
                <h3 className="text-xl font-semibold mb-4 text-white">您已参与此拍卖</h3>
                <p className="text-slate-300 mb-6">您已经成功提交了一个出价，每个用户只能参与一次竞拍。</p>
                <div className="flex flex-col md:flex-row gap-4 justify-center">
                  <a
                    href="/my-bids"
                    className="btn btn-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0"
                  >
                    查看我的竞拍记录
                  </a>
                  <a
                    href="/all-auctions"
                    className="btn btn-lg bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white border-0"
                  >
                    浏览其他拍卖
                  </a>
                </div>
              </div>
            ) : (
              <div>
                {/* 竞拍说明 */}
                <div className="bg-slate-800/70 backdrop-blur-md rounded-xl p-5 mb-6 border border-slate-700 shadow-md">
                  <h2 className="text-xl font-semibold mb-3 text-white flex items-center">
                    <span className="encrypt-icon mr-2">🔐</span> 盲拍说明
                  </h2>
                  <ul className="list-disc pl-5 space-y-2 text-slate-300">
                    <li>在盲拍中，您的出价会被加密，其他人无法知道您的实际出价金额</li>
                    <li>为了保证您的出价有效，您需要发送<span className="font-semibold text-blue-300">大于等于</span>您出价金额的ETH作为押金</li>
                    <li>如果您中标，您的出价金额将转给受益人；如果未中标，您可以取回押金</li>
                    <li><span className="font-semibold text-yellow-400">重要：在揭示阶段，您必须提供正确的出价信息，否则将无法取回押金</span></li>
                  </ul>
                </div>

                {/* 出价表单 */}
                <div className="bg-slate-900/70 backdrop-blur-md rounded-xl overflow-hidden border border-slate-700 shadow-lg mb-6 transform-none" style={{ transform: 'none' }}>
                  <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4">
                    <h3 className="font-semibold text-white text-lg">提交出价</h3>
                    {auctionMetadata && (
                      <p className="text-blue-100 text-sm mt-1">
                        {auctionMetadata.name} - 最低出价: <span className="font-semibold text-yellow-300">{minPrice} ETH</span>
                      </p>
                    )}
                  </div>

                  <div className="p-6 space-y-6">
                    {/* 最低出价提醒 */}
                    {minPrice && parseFloat(minPrice) > 0 && (
                      <div className="bg-amber-600/20 border border-amber-500/50 rounded-lg p-4">
                        <div className="flex items-center space-x-2">
                          <span className="text-amber-400">⚠️</span>
                          <span className="text-amber-200 font-medium">出价要求</span>
                        </div>
                        <div className="mt-2 text-amber-100 text-sm space-y-1">
                          <p>• 您的出价金额必须 ≥ <span className="font-semibold text-yellow-300">{minPrice} ETH</span></p>
                          <p>• 押金必须 ≥ 出价金额（真实出价）或 ≥ 最低出价（假出价）</p>
                        </div>
                      </div>
                    )}

                    {/* 出价金额 */}
                    <div className="space-y-2">
                      <label className="text-white flex items-center">
                        <span className="mystery-icon mr-2">❓</span>
                        出价金额 (ETH)
                        {minPrice && parseFloat(minPrice) > 0 && (
                          <span className="ml-2 text-yellow-400 text-sm">
                            (最低: {minPrice} ETH)
                          </span>
                        )}
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min={minPrice || "0"}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        className={`w-full px-4 py-2 bg-slate-800/60 border rounded-lg text-white focus:outline-none focus:ring-2 focus:border-transparent ${minPrice && parseFloat(value) > 0 && parseFloat(value) < parseFloat(minPrice)
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-slate-600 focus:ring-blue-500'
                          }`}
                        placeholder={`例如: ${minPrice && parseFloat(minPrice) > 0 ? minPrice : '0.001'}`}
                      />
                      {minPrice && parseFloat(value) > 0 && parseFloat(value) < parseFloat(minPrice) && (
                        <p className="text-red-400 text-sm">
                          出价金额必须大于等于最低出价 {minPrice} ETH
                        </p>
                      )}
                    </div>

                    {/* 是否为假出价 */}
                    <div className="space-y-2">
                      <label className="text-white flex items-center">
                        <span className="mystery-icon mr-2">❓</span>
                        出价类型
                      </label>
                      <div className="flex items-center space-x-4">
                        <label className="inline-flex items-center">
                          <input
                            type="radio"
                            className="form-radio text-blue-500"
                            name="bidType"
                            checked={!fake}
                            onChange={() => setFake(false)}
                          />
                          <span className="ml-2 text-slate-300">真实出价</span>
                        </label>
                        <label className="inline-flex items-center">
                          <input
                            type="radio"
                            className="form-radio text-purple-500"
                            name="bidType"
                            checked={fake}
                            onChange={() => setFake(true)}
                          />
                          <span className="ml-2 text-slate-300">假出价（诱饵）</span>
                        </label>
                      </div>
                    </div>

                    {/* 密钥 */}
                    <div className="space-y-2">
                      <label className="text-white flex items-center">
                        <span className="mystery-icon mr-2">❓</span>
                        密钥
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={secret}
                          onChange={(e) => setSecret(e.target.value)}
                          className="w-full px-4 py-2 bg-slate-800/60 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="设置一个密钥，揭示时需要使用"
                        />
                        <button
                          type="button"
                          onClick={generateRandomSecret}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3 py-1 bg-blue-700/70 hover:bg-blue-600/70 text-blue-100 text-sm rounded-lg transition-colors"
                        >
                          随机生成
                        </button>
                      </div>
                    </div>

                    {/* 押金 */}
                    <div className="space-y-2">
                      <label className="text-white flex items-center">
                        <span className="mystery-icon mr-2">💰</span>
                        押金 (ETH)
                        {value && minPrice && (
                          <span className="ml-2 text-green-400 text-sm">
                            (需要 ≥ {fake ? minPrice : (parseFloat(value) > 0 ? value : minPrice)} ETH)
                          </span>
                        )}
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min={minPrice || "0"}
                        value={deposit}
                        onChange={(e) => setDeposit(e.target.value)}
                        className={`w-full px-4 py-2 bg-slate-800/60 border rounded-lg text-white focus:outline-none focus:ring-2 focus:border-transparent ${
                          // 验证押金是否符合要求
                          (() => {
                            const depositNum = parseFloat(deposit);
                            const valueNum = parseFloat(value);
                            const minPriceNum = parseFloat(minPrice || '0');

                            if (depositNum <= 0) return 'border-slate-600 focus:ring-blue-500';

                            // 真实出价：押金 >= 出价金额
                            if (!fake && depositNum < valueNum) return 'border-red-500 focus:ring-red-500';

                            // 假出价：押金 >= 最低出价
                            if (fake && depositNum < minPriceNum) return 'border-red-500 focus:ring-red-500';

                            // 所有情况：押金 >= 最低出价
                            if (depositNum < minPriceNum) return 'border-red-500 focus:ring-red-500';

                            return 'border-green-500 focus:ring-green-500';
                          })()
                          }`}
                        placeholder={`推荐: ${fake ? minPrice : (parseFloat(value) > 0 ? value : minPrice || '0.001')}`}
                      />
                      {/* 动态提示 */}
                      {(() => {
                        const depositNum = parseFloat(deposit);
                        const valueNum = parseFloat(value);
                        const minPriceNum = parseFloat(minPrice || '0');

                        if (depositNum <= 0) {
                          return (
                            <p className="text-slate-400 text-sm">
                              押金用于保证您能够支付承诺的价格
                            </p>
                          );
                        }

                        if (!fake && depositNum < valueNum) {
                          return (
                            <p className="text-red-400 text-sm">
                              真实出价的押金必须 ≥ 出价金额 {value} ETH
                            </p>
                          );
                        }

                        if (fake && depositNum < minPriceNum) {
                          return (
                            <p className="text-red-400 text-sm">
                              假出价的押金至少需要 {minPrice} ETH（最低出价）
                            </p>
                          );
                        }

                        if (depositNum < minPriceNum) {
                          return (
                            <p className="text-red-400 text-sm">
                              押金不能低于最低出价 {minPrice} ETH
                            </p>
                          );
                        }

                        return (
                          <p className="text-green-400 text-sm">
                            ✅ 押金金额符合要求
                          </p>
                        );
                      })()}
                    </div>

                    {/* 加密后的出价 */}
                    <div className="p-4 bg-slate-800/50 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-white">加密后的出价</label>
                        <button
                          type="button"
                          onClick={generateBlindedBid}
                          className="px-3 py-1 bg-blue-700/70 hover:bg-blue-600/70 text-blue-100 text-sm rounded-lg transition-colors"
                        >
                          生成加密出价
                        </button>
                      </div>
                      <div className="bg-slate-900/70 p-3 rounded-lg overflow-x-auto">
                        <p className="font-mono text-sm text-green-400 break-all">
                          {blindedBid || "点击\"生成加密出价\"按钮生成"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 提交按钮 */}
                  <div className="p-6 bg-slate-800/30 flex justify-end">
                    <button
                      className={`
                        btn btn-lg px-8 
                        ${value && secret && deposit ? 'bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700' : 'bg-slate-700'}
                        text-white border-0 shadow-lg ${value && secret && deposit ? 'glow-on-hover' : ''}
                      `}
                      disabled={!value || !secret || !deposit || isSubmitting}
                      onClick={handleBid}
                    >
                      {isCalculating || isSubmitting ? (
                        <>
                          <span className="loading loading-spinner loading-sm mr-2"></span>
                          {isCalculating ? "计算中..." : "提交中..."}
                        </>
                      ) : (
                        "提交竞拍"
                      )}
                    </button>
                  </div>
                </div>

                {/* 竞拍记录链接 */}
                <div className="mt-6 bg-blue-900/20 rounded-xl p-5 border border-blue-800/40 shadow-inner">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-300">
                      查看您的所有竞拍记录，并在揭示阶段准备好揭示信息
                    </p>
                    <a href="/my-bids" className="btn btn-sm bg-blue-700 hover:bg-blue-600 text-white border-0 glow-on-hover">
                      我的竞拍记录
                    </a>
                  </div>
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
              <a href="/reveal" className="text-slate-400 hover:text-cyan-400 transition-colors">
                揭示页面
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 