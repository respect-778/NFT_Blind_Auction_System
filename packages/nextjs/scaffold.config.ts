import * as chains from "viem/chains";

export type ScaffoldConfig = {
  targetNetworks: readonly chains.Chain[];
  pollingInterval: number;
  infuraApiKey: string;
  alchemyApiKey: string;
  walletConnectProjectId: string;
  onlyLocalBurnerWallet: boolean;
};

const scaffoldConfig = {
  // 切换到Sepolia测试网络，使用Alchemy API提供更稳定的服务
  targetNetworks: [chains.sepolia],
  // targetNetworks: [chains.hardhat], // 本地开发时取消注释

  // 增加轮询间隔时间，减少API请求数量，提升稳定性
  pollingInterval: 30000, // 30秒轮询一次

  // 使用Infura API密钥（备用RPC）
  infuraApiKey: process.env.NEXT_PUBLIC_INFURA_API_KEY || "5fb0b12c6d4b4603b5332fd1bb091a9f",

  // 使用Alchemy API密钥（主要RPC，更稳定）
  alchemyApiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || "i5LOb9tsBpvhiLY25PMsuuLhUsAX62wK",

  // WalletConnect项目ID
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64",

  // 测试网环境禁用Burner钱包，使用真实钱包
  onlyLocalBurnerWallet: false,
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
