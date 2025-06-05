import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * 部署BlindAuctionFactory合约
 */
const deployBlindAuctionFactory: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  await deploy("BlindAuctionFactory", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  // 获取部署的合约
  const blindAuctionFactory = await hre.ethers.getContract("BlindAuctionFactory", deployer);

  // 验证部署是否成功
  try {
    // 使用await确保我们获取到结果，使用类型断言确保TypeScript识别返回类型
    const auctionCount = await (blindAuctionFactory as any).getAuctionCount();
    console.log(`当前工厂中的拍卖数量: ${auctionCount}`);
  } catch (error) {
    console.error("获取拍卖数量失败:", error);
    console.log("合约已部署，但无法验证拍卖数量");
  }

  console.log("✅ BlindAuctionFactory 合约部署完成！");
};

export default deployBlindAuctionFactory;

// 设置标签和依赖
deployBlindAuctionFactory.tags = ["BlindAuctionFactory"];
deployBlindAuctionFactory.dependencies = []; // 如果有依赖的其他合约，可以在这里指定 