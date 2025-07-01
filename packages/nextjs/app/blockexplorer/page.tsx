"use client";

import { useEffect, useState } from "react";
import { PaginationButton, SearchBar, TransactionsTable } from "./_components";
import type { NextPage } from "next";
import { hardhat } from "viem/chains";
import { useFetchBlocks } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import MeteorRain from "~~/components/MeteorRain";
import { MetaHeader } from "~~/components/MetaHeader";

const BlockExplorer: NextPage = () => {
  const { blocks, transactionReceipts, currentPage, totalBlocks, setCurrentPage, error } = useFetchBlocks();
  const { targetNetwork } = useTargetNetwork();
  const [isLocalNetwork, setIsLocalNetwork] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (targetNetwork.id !== hardhat.id) {
      setIsLocalNetwork(false);
    }
  }, [targetNetwork.id]);

  useEffect(() => {
    if (targetNetwork.id === hardhat.id && error) {
      setHasError(true);
    }
  }, [targetNetwork.id, error]);

  // 如果不是本地网络，显示网络信息和外部区块浏览器链接
  if (!isLocalNetwork) {
    return (
      <>
        <MetaHeader title="区块浏览器 | 区块链盲拍平台" />
        <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033] text-white">
          {/* 背景效果 */}
          <div className="absolute inset-0 opacity-50">
            <div className="absolute top-0 -left-40 w-96 h-96 bg-purple-700 rounded-full filter blur-[150px] animate-pulse"></div>
            <div className="absolute bottom-0 -right-40 w-96 h-96 bg-blue-700 rounded-full filter blur-[150px] animate-pulse delay-1000"></div>
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(rgba(102,0,255,0.07)_1.5px,transparent_1.5px),linear-gradient(90deg,rgba(102,0,255,0.07)_1.5px,transparent_1.5px)] bg-[size:40px_40px]"></div>

          {/* 流星雨效果 */}
          <MeteorRain count={8} />

          <div className="relative z-10 container mx-auto px-4 py-16">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-4xl md:text-6xl font-bold mb-8 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 neon-text">
                区块浏览器
              </h1>

              <div className="bg-gradient-to-br from-slate-900/80 via-slate-800/70 to-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-8 mb-8 shadow-2xl">
                <h2 className="text-2xl font-semibold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">当前网络信息</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-blue-500/20">
                    <p className="text-slate-400 mb-2">网络名称</p>
                    <p className="text-white font-semibold text-lg">{targetNetwork.name}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-purple-500/20">
                    <p className="text-slate-400 mb-2">Chain ID</p>
                    <p className="text-white font-semibold text-lg">{targetNetwork.id}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-cyan-500/20">
                    <p className="text-slate-400 mb-2">原生代币</p>
                    <p className="text-white font-semibold text-lg">{targetNetwork.nativeCurrency.symbol}</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-green-500/20">
                    <p className="text-slate-400 mb-2">RPC URL</p>
                    <p className="text-white font-mono text-sm break-all">{targetNetwork.rpcUrls.default.http[0]}</p>
                  </div>
                </div>
              </div>

              {targetNetwork.blockExplorers?.default && (
                <div className="bg-gradient-to-br from-blue-900/40 via-indigo-900/30 to-purple-900/40 backdrop-blur-md border border-blue-500/30 rounded-2xl p-8 mb-8 shadow-xl">
                  <h3 className="text-xl font-semibold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">外部区块浏览器</h3>
                  <p className="text-slate-300 mb-6">
                    当前网络有官方的区块浏览器，您可以在那里查看所有交易和区块信息。
                  </p>
                  <a
                    href={targetNetwork.blockExplorers.default.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    访问 {targetNetwork.blockExplorers.default.name}
                  </a>
                </div>
              )}

              <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/70 backdrop-blur-md border border-slate-700/30 rounded-2xl p-8">
                <h3 className="text-xl font-semibold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">本地区块浏览器</h3>
                <p className="text-slate-300 mb-4">
                  内置的区块浏览器功能目前仅支持本地开发网络（Hardhat）。
                </p>
                <p className="text-slate-400 text-sm">
                  如果您想使用本地区块浏览器，请切换到本地网络或启动本地开发环境。
                </p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // 本地网络的错误处理
  if (hasError) {
    return (
      <>
        <MetaHeader title="连接错误 | 区块链盲拍平台" />
        <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033] text-white">
          {/* 背景效果 */}
          <div className="absolute inset-0 opacity-50">
            <div className="absolute top-0 -left-40 w-96 h-96 bg-red-700 rounded-full filter blur-[150px] animate-pulse"></div>
            <div className="absolute bottom-0 -right-40 w-96 h-96 bg-orange-700 rounded-full filter blur-[150px] animate-pulse delay-1000"></div>
          </div>

          <div className="relative z-10 container mx-auto px-4 py-16">
            <div className="max-w-2xl mx-auto text-center">
              <h1 className="text-4xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">连接错误</h1>
              <div className="bg-gradient-to-br from-red-900/40 to-orange-900/40 backdrop-blur-md border border-red-700/30 rounded-2xl p-8 shadow-xl">
                <h2 className="text-xl font-semibold mb-4">无法连接到本地网络</h2>
                <div className="text-left space-y-4 text-slate-300">
                  <p>• 请确保已启动本地区块链网络：</p>
                  <code className="block bg-black/50 p-3 rounded text-green-400 font-mono">yarn chain</code>
                  <p>• 或者修改 scaffold.config.ts 中的 targetNetwork 配置</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // 本地网络正常显示
  return (
    <>
      <MetaHeader title="本地区块浏览器 | 区块链盲拍平台" />
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033] text-white">
        {/* 背景效果 */}
        <div className="absolute inset-0 opacity-50">
          <div className="absolute top-0 -left-40 w-96 h-96 bg-purple-700 rounded-full filter blur-[150px] animate-pulse"></div>
          <div className="absolute bottom-0 -right-40 w-96 h-96 bg-blue-700 rounded-full filter blur-[150px] animate-pulse delay-1000"></div>
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(102,0,255,0.07)_1.5px,transparent_1.5px),linear-gradient(90deg,rgba(102,0,255,0.07)_1.5px,transparent_1.5px)] bg-[size:40px_40px]"></div>

        {/* 流星雨效果 */}
        <MeteorRain count={8} />

        {/* 装饰线条 */}
        <div className="absolute top-[30%] left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"></div>
        <div className="absolute top-[70%] left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>

        <div className="relative z-10 container mx-auto px-4 py-8">
          <h1 className="text-4xl md:text-6xl font-bold mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 neon-text">
            本地区块浏览器
          </h1>
          <SearchBar />
          <TransactionsTable blocks={blocks} transactionReceipts={transactionReceipts} />
          <PaginationButton currentPage={currentPage} totalItems={Number(totalBlocks)} setCurrentPage={setCurrentPage} />
        </div>
      </div>

      {/* 添加自定义CSS */}
      <style jsx global>{`
        .neon-text {
          text-shadow: 0 0 5px rgba(102, 0, 255, 0.8), 0 0 20px rgba(102, 0, 255, 0.5);
        }
      `}</style>
    </>
  );
};

export default BlockExplorer;
