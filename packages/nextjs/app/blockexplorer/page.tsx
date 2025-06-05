"use client";

import { useEffect, useState } from "react";
import { PaginationButton, SearchBar, TransactionsTable } from "./_components";
import type { NextPage } from "next";
import { hardhat } from "viem/chains";
import { useFetchBlocks } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-8 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              区块浏览器
            </h1>

            <div className="bg-gradient-to-b from-slate-800/50 to-slate-900/70 backdrop-blur-sm border border-slate-700/30 rounded-xl p-8 mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-blue-300">当前网络信息</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                <div>
                  <p className="text-slate-400 mb-2">网络名称</p>
                  <p className="text-white font-semibold text-lg">{targetNetwork.name}</p>
                </div>
                <div>
                  <p className="text-slate-400 mb-2">Chain ID</p>
                  <p className="text-white font-semibold text-lg">{targetNetwork.id}</p>
                </div>
                <div>
                  <p className="text-slate-400 mb-2">原生代币</p>
                  <p className="text-white font-semibold text-lg">{targetNetwork.nativeCurrency.symbol}</p>
                </div>
                <div>
                  <p className="text-slate-400 mb-2">RPC URL</p>
                  <p className="text-white font-mono text-sm break-all">{targetNetwork.rpcUrls.default.http[0]}</p>
                </div>
              </div>
            </div>

            {targetNetwork.blockExplorers?.default && (
              <div className="bg-gradient-to-b from-blue-800/20 to-blue-900/40 backdrop-blur-sm border border-blue-700/30 rounded-xl p-8 mb-8">
                <h3 className="text-xl font-semibold mb-4 text-blue-300">外部区块浏览器</h3>
                <p className="text-slate-300 mb-6">
                  当前网络有官方的区块浏览器，您可以在那里查看所有交易和区块信息。
                </p>
                <a
                  href={targetNetwork.blockExplorers.default.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition-all duration-300 transform hover:scale-105"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  访问 {targetNetwork.blockExplorers.default.name}
                </a>
              </div>
            )}

            <div className="bg-gradient-to-b from-slate-800/50 to-slate-900/70 backdrop-blur-sm border border-slate-700/30 rounded-xl p-8">
              <h3 className="text-xl font-semibold mb-4 text-purple-300">本地区块浏览器</h3>
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
    );
  }

  // 本地网络的错误处理
  if (hasError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-slate-900 text-white">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-4xl font-bold mb-8 text-red-400">连接错误</h1>
            <div className="bg-gradient-to-b from-red-800/20 to-red-900/40 backdrop-blur-sm border border-red-700/30 rounded-xl p-8">
              <h2 className="text-xl font-semibold mb-4">无法连接到本地网络</h2>
              <div className="text-left space-y-4 text-slate-300">
                <p>• 请确保已启动本地区块链网络：</p>
                <code className="block bg-black/50 p-3 rounded text-green-400">yarn chain</code>
                <p>• 或者修改 scaffold.config.ts 中的 targetNetwork 配置</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 本地网络正常显示
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl md:text-5xl font-bold mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
          本地区块浏览器
        </h1>
        <SearchBar />
        <TransactionsTable blocks={blocks} transactionReceipts={transactionReceipts} />
        <PaginationButton currentPage={currentPage} totalItems={Number(totalBlocks)} setCurrentPage={setCurrentPage} />
      </div>
    </div>
  );
};

export default BlockExplorer;
