import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * 部署BlindAuctionFactory合约，并设置NFT合约连接
 *
 * @param hre HardhatRuntimeEnvironment对象。
 */
const deployFactory: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // 获取已部署的NFT合约地址
  const auctionNFTDeployment = await hre.deployments.get("AuctionNFT");
  const nftContractAddress = auctionNFTDeployment.address;

  await deploy("BlindAuctionFactory", {
    from: deployer,
    args: [nftContractAddress], // 传入NFT合约地址
    log: true,
    autoMine: true,
  });

  // 获取部署的合约实例
  const factory = await hre.ethers.getContract("BlindAuctionFactory", deployer);
  const nftContract = await hre.ethers.getContract("AuctionNFT", deployer);

  // 设置NFT合约的工厂地址
  console.log("⚙️ 设置NFT合约的工厂地址...");
  const setFactoryTx = await (nftContract as any).setFactoryContract(await (factory as any).getAddress());
  await setFactoryTx.wait();

  console.log("👋 BlindAuctionFactory合约部署完成，地址:", await (factory as any).getAddress());
  console.log("🔗 NFT合约地址:", nftContractAddress);
  console.log("✅ 合约连接设置完成");
};

export default deployFactory;

// 设置标签和依赖
deployFactory.tags = ["BlindAuctionFactory"];
deployFactory.dependencies = ["AuctionNFT"]; // 确保在NFT合约部署后运行 