import { wagmiConnectors } from "./wagmiConnectors";
import { Chain, createClient, http } from "viem";
import { hardhat } from "viem/chains";
import { createConfig } from "wagmi";
import scaffoldConfig from "~~/scaffold.config";
import { getAlchemyHttpUrl } from "~~/utils/scaffold-eth";

const { targetNetworks } = scaffoldConfig;

// 禁用主网，只使用targetNetworks中指定的网络(本地hardhat)
export const enabledChains = targetNetworks;

export const wagmiConfig = createConfig({
  chains: enabledChains,
  connectors: wagmiConnectors,
  ssr: true,
  client({ chain }) {
    return createClient({
      chain,
      // 对于hardhat网络，使用本地URL，其他网络使用Alchemy
      transport: chain.id === (hardhat as Chain).id
        ? http("http://127.0.0.1:8545")
        : http(getAlchemyHttpUrl(chain.id)),
      ...(chain.id !== (hardhat as Chain).id
        ? {
          pollingInterval: scaffoldConfig.pollingInterval,
        }
        : {}),
    });
  },
});
