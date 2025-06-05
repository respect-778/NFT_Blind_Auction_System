import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * 部署名为"BlindAuction"的合约, 使用部署者账户作为受益人
 * 
 * 注意: 这是一个初始的盲拍合约实例，仅用于演示
 * 用户可以通过BlindAuctionFactory创建自己的拍卖
 */
const deployBlindAuction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // 开始时间: 当前时间 (用于测试)
  const startTime = Math.floor(Date.now() / 1000); // 当前时间戳

  // 竞标时间: 30分钟 (用于测试，实际部署可调整为更长时间)
  const biddingTime = 30 * 60; // 30分钟 (秒数)

  // 披露时间: 15分钟 (用于测试，实际部署可调整为更长时间)
  const revealTime = 15 * 60; // 15分钟 (秒数)

  // 受益人 (拍卖结束后接收最高出价的地址)
  const beneficiaryAddress = deployer;

  await deploy("BlindAuction", {
    from: deployer,
    args: [startTime, biddingTime, revealTime, beneficiaryAddress],
    log: true,
    autoMine: true,
  });

  console.log("✅ BlindAuction 示例合约部署完成！");
  console.log(`   - 开始时间: ${new Date(startTime * 1000).toLocaleString()}`);
  console.log(`   - 竞标时长: ${biddingTime} 秒 (${biddingTime / 60} 分钟)`);
  console.log(`   - 披露时长: ${revealTime} 秒 (${revealTime / 60} 分钟)`);
  console.log(`   - 受益人地址: ${beneficiaryAddress}`);
  console.log();
  console.log("注意: 这是一个演示用的盲拍合约。用户可以通过BlindAuctionFactory创建自己的拍卖。");
};

export default deployBlindAuction;

// 设置标签
deployBlindAuction.tags = ["BlindAuction", "Demo"]; 