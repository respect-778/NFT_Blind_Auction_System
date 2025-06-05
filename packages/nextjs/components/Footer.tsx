import React from "react";
import { hardhat } from "viem/chains";
import { CurrencyDollarIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Faucet } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useGlobalState } from "~~/services/store/store";

/**
 * Site footer
 */
export const Footer = () => {
  const nativeCurrencyPrice = useGlobalState(state => state.nativeCurrencyPrice);
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  return (
    <div className="bg-gradient-to-r from-[#020033] to-[#050057] min-h-0 py-5 px-4 border-t border-blue-900/20">
      <div>
        <div className="fixed flex justify-between items-center w-full z-10 p-4 bottom-0 left-0 pointer-events-none">
          <div className="flex flex-col md:flex-row gap-2 pointer-events-auto">
            {nativeCurrencyPrice > 0 && (
              <div>
                <div className="btn bg-gradient-to-r from-blue-800 to-blue-900 border-blue-700 btn-sm font-normal gap-1 cursor-auto text-blue-100">
                  <CurrencyDollarIcon className="h-4 w-4" />
                  <span>{nativeCurrencyPrice}</span>
                </div>
              </div>
            )}
            <a href="/blockexplorer" className="btn bg-gradient-to-r from-blue-800 to-blue-900 border-blue-700 btn-sm font-normal gap-1 text-blue-100 hover:from-blue-700 hover:to-blue-800 transition-all duration-300">
              <MagnifyingGlassIcon className="h-4 w-4" />
              <span>区块浏览器</span>
            </a>
            {isLocalNetwork && (
              <>
                <Faucet />
              </>
            )}
          </div>
        </div>
      </div>
      <div className="w-full">
        <div className="flex justify-center items-center gap-4 text-sm w-full">
          <div className="text-center">
            <p className="m-0 text-center text-blue-200">区块链盲拍系统</p>
          </div>
          <span className="text-blue-500">·</span>
          <div className="flex justify-center items-center gap-2">
            <p className="m-0 text-center text-blue-200">
              <span className="inline-block h-4 w-4 text-blue-400">💙</span> 基于 Chain ID: 887766
            </p>
          </div>
          <span className="text-blue-500">·</span>
          <div className="text-center">
            <p className="m-0 text-center text-blue-200">© 2023 保留所有权利</p>
          </div>
        </div>
      </div>
    </div>
  );
};
