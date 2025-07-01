import { useEffect, useState } from "react";
import { useTargetNetwork } from "./useTargetNetwork";
import { useInterval } from "usehooks-ts";
import { hardhat } from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";
import { fetchPriceFromUniswap } from "~~/utils/scaffold-eth";

// 在本地网络上禁用轮询，其他网络可选启用
const enablePolling = false;

/**
 * Get the price of Native Currency based on Native Token/DAI trading pair from Uniswap SDK
 */
export const useNativeCurrencyPrice = () => {
  const { targetNetwork } = useTargetNetwork();
  const [nativeCurrencyPrice, setNativeCurrencyPrice] = useState(0);
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  // Get the price of ETH from Uniswap on mount
  useEffect(() => {
    (async () => {
      const price = await fetchPriceFromUniswap(targetNetwork);
      setNativeCurrencyPrice(price);
    })();
  }, [targetNetwork]);

  // Get the price of ETH from Uniswap at a given interval
  // 本地网络不启用轮询，避免重复的超时错误
  useInterval(
    async () => {
      const price = await fetchPriceFromUniswap(targetNetwork);
      setNativeCurrencyPrice(price);
    },
    (!isLocalNetwork && enablePolling) ? scaffoldConfig.pollingInterval : null,
  );

  return nativeCurrencyPrice;
};
