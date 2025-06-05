import * as chains from "viem/chains";

export type ScaffoldConfig = {
  targetNetworks: readonly chains.Chain[];
  pollingInterval: number;
  infuraApiKey: string;
  walletConnectProjectId: string;
  onlyLocalBurnerWallet: boolean;
};

const scaffoldConfig = {
  // 修改为Sepolia测试网络
  targetNetworks: [chains.sepolia],

  // 增加轮询间隔时间，减少API请求数量
  pollingInterval: 30000,

  // 使用Infura API密钥
  // 注册Infura账户: https://infura.io/
  infuraApiKey: process.env.NEXT_PUBLIC_INFURA_API_KEY || "5fb0b12c6d4b4603b5332fd1bb091a9f",

  // WalletConnect项目ID
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64",

  // 在测试网上关闭Burner钱包
  onlyLocalBurnerWallet: false,
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
