import * as dotenv from "dotenv";
dotenv.config();
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "@nomicfoundation/hardhat-verify";
import "hardhat-deploy";
import "hardhat-deploy-ethers";

// 使用Alchemy API密钥（主要RPC服务）
const alchemyApiKey = process.env.ALCHEMY_API_KEY || "i5LOb9tsBpvhiLY25PMsuuLhUsAX62wK";
// 使用Infura API密钥（备用RPC服务）
const infuraApiKey = process.env.INFURA_API_KEY || "5fb0b12c6d4b4603b5332fd1bb091a9f";
// 部署者私钥
const deployerPrivateKey =
  process.env.DEPLOYER_PRIVATE_KEY ?? "042628e36aa927bcb79ba79e0a3a6d0f0ef784f6f618061d5e73984d1e7e63c6";
// Etherscan API密钥
const etherscanApiKey = process.env.ETHERSCAN_API_KEY || "DNXJA8RX2Q3VZ4URQIWP7Z68CJXQZSC6AW";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.4",
        settings: {
          optimizer: {
            enabled: true,
            // https://docs.soliditylang.org/en/latest/using-the-compiler.html#optimizer-options
            runs: 200,
          },
        },
      },
      {
        version: "0.8.5",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  // 默认网络设置为Sepolia测试网
  defaultNetwork: "sepolia",
  namedAccounts: {
    deployer: {
      // By default, it will take the first Hardhat account as the deployer
      default: 0,
    },
  },
  networks: {
    // View the networks that are pre-configured.
    // If the network you are looking for is not here you can add new network settings

    // 本地开发网络
    ganache: {
      url: `http://127.0.0.1:8545`,
      accounts: [deployerPrivateKey],
    },
    hardhat: {
      // 禁用主网分叉，完全使用本地网络
      forking: {
        url: `https://mainnet.infura.io/v3/${infuraApiKey}`,
        enabled: false, // 强制禁用mainnet forking
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },

    // Sepolia测试网络配置（主要网络）
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${alchemyApiKey}`, // 主要使用Alchemy
      accounts: [deployerPrivateKey],
      gasPrice: "auto", // 自动Gas价格
      gas: "auto", // 自动Gas限制
      chainId: 11155111, // Sepolia链ID
      // 备用RPC配置
      // url: `https://sepolia.infura.io/v3/${infuraApiKey}`, // 如需切换到Infura
    },

    // 其他网络配置（保持注释状态，需要时启用）
    /*
    mainnet: {
      url: `https://mainnet.infura.io/v3/${infuraApiKey}`,
      accounts: [deployerPrivateKey],
    },
    arbitrum: {
      url: `https://arbitrum-mainnet.infura.io/v3/${infuraApiKey}`,
      accounts: [deployerPrivateKey],
    },
    arbitrumSepolia: {
      url: `https://arbitrum-sepolia.infura.io/v3/${infuraApiKey}`,
      accounts: [deployerPrivateKey],
    },
    optimism: {
      url: `https://optimism-mainnet.infura.io/v3/${infuraApiKey}`,
      accounts: [deployerPrivateKey],
    },
    optimismSepolia: {
      url: `https://optimism-sepolia.infura.io/v3/${infuraApiKey}`,
      accounts: [deployerPrivateKey],
    },
    polygon: {
      url: `https://polygon-mainnet.infura.io/v3/${infuraApiKey}`,
      accounts: [deployerPrivateKey],
    },
    polygonMumbai: {
      url: `https://polygon-mumbai.infura.io/v3/${infuraApiKey}`,
      accounts: [deployerPrivateKey],
    },
    polygonZkEvm: {
      url: `https://polygonzkevm-mainnet.g.alchemy.com/v2/${infuraApiKey}`,
      accounts: [deployerPrivateKey],
    },
    polygonZkEvmTestnet: {
      url: `https://polygonzkevm-testnet.g.alchemy.com/v2/${infuraApiKey}`,
      accounts: [deployerPrivateKey],
    },
    gnosis: {
      url: "https://rpc.gnosischain.com",
      accounts: [deployerPrivateKey],
    },
    chiado: {
      url: "https://rpc.chiadochain.net",
      accounts: [deployerPrivateKey],
    },
    base: {
      url: "https://mainnet.base.org",
      accounts: [deployerPrivateKey],
    },
    baseSepolia: {
      url: "https://sepolia.base.org",
      accounts: [deployerPrivateKey],
    },
    scrollSepolia: {
      url: "https://sepolia-rpc.scroll.io",
      accounts: [deployerPrivateKey],
    },
    scroll: {
      url: "https://rpc.scroll.io",
      accounts: [deployerPrivateKey],
    },
    pgn: {
      url: "https://rpc.publicgoods.network",
      accounts: [deployerPrivateKey],
    },
    pgnTestnet: {
      url: "https://sepolia.publicgoods.network",
      accounts: [deployerPrivateKey],
    },
    */
  },
  // configuration for harhdat-verify plugin
  etherscan: {
    apiKey: `${etherscanApiKey}`,
  },
  // configuration for etherscan-verify from hardhat-deploy plugin
  verify: {
    etherscan: {
      apiKey: `${etherscanApiKey}`,
    },
  },
  sourcify: {
    enabled: false,
  },
};

export default config;
