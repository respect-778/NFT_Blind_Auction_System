import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * 部署AuctionNFT合约
 *
 * @param hre HardhatRuntimeEnvironment对象。
 */
const deployAuctionNFT: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  /*
    hardhat-deploy插件会在部署时在HRE中注入以下字段：
    - hre.getNamedAccounts: 从hardhat.config.js中的namedAccounts配置返回一个对象
    - hre.deployments: deployments对象本身
    - hre.getChainId: 返回当前chainId的函数
    - hre.deploy: 部署函数
  */
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  await deploy("AuctionNFT", {
    from: deployer,
    // 合约构造函数参数在这里，如果有的话
    args: [],
    log: true,
    // 自动获取etherscan API密钥，如果API密钥存在的话
    autoMine: true,
  });

  // 获取部署信息而不是合约实例
  const deployment = await hre.deployments.get("AuctionNFT");
  console.log("👋 AuctionNFT合约部署完成，地址:", deployment.address);
};

export default deployAuctionNFT;

// 标签对于过滤部署很有用，例如：hardhat deploy --tags AuctionNFT
deployAuctionNFT.tags = ["AuctionNFT"]; 