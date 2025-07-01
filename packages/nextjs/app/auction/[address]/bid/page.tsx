'use client';

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useParams } from 'next/navigation';
import { useScaffoldContract } from "~~/hooks/scaffold-eth/useScaffoldContract";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth/useScaffoldReadContract";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth/useScaffoldWriteContract";
import { useAccount } from 'wagmi';
import { notification } from "~~/utils/scaffold-eth";

export default function BidPage() {
  const { address: connectedAddress } = useAccount();
  const params = useParams();
  const auctionAddress = params?.address as string;
  const [value, setValue] = useState<string>('0.1');
  const [fake, setFake] = useState<boolean>(false);
  const [secret, setSecret] = useState<string>('');
  const [blindedBid, setBlindedBid] = useState<string>('');
  const [deposit, setDeposit] = useState<string>('0.1');
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [phase, setPhase] = useState<number>(0);

  // 获取合约
  const { data: blindAuctionContract } = useScaffoldContract({
    contractName: "BlindAuction",
  });

  // 读取合约状态 - 使用前端时间计算状态
  const { data: biddingEnd } = useScaffoldReadContract({
    contractName: "BlindAuction",
    functionName: "biddingEnd",
  });

  const { data: revealEnd } = useScaffoldReadContract({
    contractName: "BlindAuction",
    functionName: "revealEnd",
  });

  const { data: biddingStart } = useScaffoldReadContract({
    contractName: "BlindAuction",
    functionName: "biddingStart",
  });

  // 🔧 修复：使用前端时间计算阶段和剩余时间
  useEffect(() => {
    const updateStatus = () => {
      if (!biddingEnd || !revealEnd || !biddingStart) return;

      const currentTime = Math.floor(Date.now() / 1000);
      const biddingEndTime = Number(biddingEnd);
      const revealEndTime = Number(revealEnd);
      const biddingStartTime = Number(biddingStart);

      let currentPhase = 0;
      let timeLeftText = "";

      if (currentTime >= revealEndTime) {
        currentPhase = 2; // 已结束
        timeLeftText = "拍卖已结束";
      } else if (currentTime >= biddingEndTime) {
        currentPhase = 1; // 揭示阶段
        const remaining = revealEndTime - currentTime;
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        timeLeftText = `揭示阶段 ${hours}小时 ${minutes}分钟 ${seconds}秒`;
      } else if (currentTime >= biddingStartTime) {
        currentPhase = 0; // 竞拍阶段
        const remaining = biddingEndTime - currentTime;
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        timeLeftText = `${hours}小时 ${minutes}分钟 ${seconds}秒`;
      } else {
        currentPhase = -1; // 未开始
        const remaining = biddingStartTime - currentTime;
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        timeLeftText = `竞拍将在 ${hours}小时 ${minutes}分钟 ${seconds}秒 后开始`;
      }

      setPhase(currentPhase);
      setTimeLeft(timeLeftText);
    };

    updateStatus();
    const interval = setInterval(updateStatus, 1000);
    return () => clearInterval(interval);
  }, [biddingEnd, revealEnd, biddingStart]);

  // 生成盲拍哈希
  const generateBlindedBid = async () => {
    if (!value.trim() || !secret.trim()) {
      notification.error("请填写出价金额和密钥");
      return;
    }

    try {
      setIsCalculating(true);
      // 计算哈希值 keccak256(abi.encodePacked(value, fake, secret))
      const valueInWei = ethers.parseEther(value);
      const encodedData = ethers.solidityPacked(
        ["uint", "bool", "bytes32"],
        [valueInWei, fake, ethers.keccak256(ethers.toUtf8Bytes(secret))]
      );

      const hash = ethers.keccak256(encodedData);
      setBlindedBid(hash);
      setIsCalculating(false);
    } catch (error) {
      console.error("Error generating hash:", error);
      notification.error("生成哈希时出错");
      setIsCalculating(false);
    }
  };

  // 提交盲拍
  const { writeContractAsync, isMining: isBidding } = useScaffoldWriteContract("BlindAuction");

  const handleBid = async () => {
    if (!blindedBid) {
      notification.error("请先生成盲拍哈希");
      return;
    }

    if (phase !== 0) {
      notification.error("竞拍阶段已结束，无法提交出价");
      return;
    }

    try {
      // 先获取当前用户在合约中已有的投标数量
      // 这样我们就知道新的投标在合约中的索引
      let contractBidCount = 0;
      try {
        const { data: bidCount } = await useScaffoldReadContract({
          contractName: "BlindAuction",
          functionName: "getBidCount",
          args: [connectedAddress],
        });
        contractBidCount = bidCount ? Number(bidCount) : 0;
      } catch (error) {
        console.error("Error getting bid count:", error);
        // 如果无法获取，我们继续，但不保证索引准确性
      }

      const txResult = await writeContractAsync({
        functionName: "bid",
        args: [blindedBid as `0x${string}`],
        value: deposit ? ethers.parseEther(deposit) : undefined,
      });

      notification.success("盲拍提交成功！");
      // 保存出价信息到localStorage，以便后续揭示阶段使用
      const bidInfo = {
        value,
        fake,
        secret,
        blindedBid,
        deposit,
        timestamp: Math.floor(Date.now() / 1000), // 使用秒级时间戳，与合约保持一致
        contractIndex: contractBidCount, // 记录此投标在合约中的索引位置
        auctionAddress: auctionAddress || "unknown" // 🔧 关键修复：添加拍卖地址
      };

      // 🔧 使用标准化地址格式
      const normalizedAddress = connectedAddress!.toLowerCase();
      const existingBids = JSON.parse(localStorage.getItem(`bids_${normalizedAddress}`) || '[]');
      existingBids.push(bidInfo);
      localStorage.setItem(`bids_${normalizedAddress}`, JSON.stringify(existingBids));

      // 重置表单
      setValue('0.1');
      setSecret('');
      setBlindedBid('');
      setFake(false);
    } catch (error) {
      console.error("Error placing bid:", error);
      notification.error("提交盲拍时出错");
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
      {/* 背景装饰 */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,0,81,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(6,0,81,0.05)_1px,transparent_1px)] bg-[size:100px_100px] pointer-events-none"></div>

      {/* 添加数字雨效果 */}
      <div className="digital-rain">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="digital-rain-line"
            style={{
              left: `${Math.random() * 100}%`,
              animationDuration: `${15 + Math.random() * 20}s`,
              animationDelay: `${Math.random() * 5}s`
            }}
          >
            {Array.from({ length: 20 }, () => Math.floor(Math.random() * 2)).join('')}
          </div>
        ))}
      </div>

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
              animationDuration: `${30 + Math.random() * 20}s`
            }}
          ></div>
        ))}
      </div>

      {/* 添加数字噪点覆盖层 */}
      <div className="digital-noise"></div>

      <div className="relative z-10 container mx-auto px-4 py-12">
        <div className="flex flex-col items-center">
          <div className="w-full max-w-4xl">
            {/* 页面标题 */}
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-500 neon-text">
                参与竞拍
              </h1>
              <p className="mt-2 text-slate-300">
                当前状态:
                <span className={`font-medium ml-2 ${phase === 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {phase === 0
                    ? `竞拍阶段（剩余时间: ${timeLeft}）`
                    : phase === 1
                      ? "揭示阶段（您现在需要前往揭示页面）"
                      : "拍卖已结束"}
                </span>
              </p>
            </div>

            {!connectedAddress ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-slate-700 shadow-lg hologram">
                <div className="text-6xl mb-6 opacity-80">🔒</div>
                <h3 className="text-xl font-semibold mb-4 text-white">请连接钱包</h3>
                <p className="text-slate-300 mb-6">您需要连接以太坊钱包来参与竞拍</p>
                <button className="btn btn-primary bg-gradient-to-r from-blue-600 to-purple-600 border-0 btn-cyber">
                  连接钱包
                </button>
              </div>
            ) : phase !== 0 ? (
              <div className="bg-slate-900/70 backdrop-blur-md rounded-xl p-8 text-center border border-slate-700 shadow-lg scan-container">
                <div className="scan-line"></div>
                <div className="text-6xl mb-6 opacity-80 encrypt-icon">
                  {phase === 1 ? "🔓" : "🏁"}
                </div>
                <h3 className="text-xl font-semibold mb-4 text-white">
                  {phase === 1 ? "竞拍阶段已结束" : "拍卖已结束"}
                </h3>
                <p className="mb-6 text-slate-300">
                  {phase === 1
                    ? "竞拍阶段已结束，您现在需要前往揭示页面提交您的真实出价。"
                    : "拍卖已完全结束，您可以查看拍卖结果。"}
                </p>
                <a
                  href={phase === 1 ? "/reveal" : "/results"}
                  className="btn btn-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 glow-on-hover"
                >
                  {phase === 1 ? "前往揭示页面" : "查看拍卖结果"}
                </a>
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
                  </div>

                  <div className="p-6 space-y-6">
                    {/* 出价金额 */}
                    <div className="space-y-2">
                      <label className="text-white flex items-center">
                        <span className="mystery-icon mr-2">❓</span>
                        出价金额 (ETH)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-800/60 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="例如: 0.1"
                      />
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
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={deposit}
                        onChange={(e) => setDeposit(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-800/60 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="必须大于等于出价金额"
                      />
                      <p className="text-sm text-slate-400">
                        押金必须 <span className="text-yellow-400">大于等于</span> 您的出价金额
                      </p>
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
                      disabled={!value || !secret || !deposit}
                      onClick={handleBid}
                    >
                      {isCalculating ? (
                        <>
                          <span className="loading loading-spinner loading-sm mr-2"></span>
                          计算中...
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