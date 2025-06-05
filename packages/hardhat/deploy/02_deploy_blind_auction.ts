import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * 部署名为"BlindAuction"的合约，使用部署者账户和
 * 构造函数参数设置为开始时间、竞标时间、披露时间和受益人地址
 *
 * @param hre HardhatRuntimeEnvironment对象
 */
const deployBlindAuction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // 开始时间：当前时间（用于测试）
  const startTime = Math.floor(Date.now() / 1000); // 当前时间戳

  // 竞标时间：30分钟（用于测试，实际部署可调整为更长时间）
  const biddingTime = 30 * 60; // 30分钟（秒数）

  // 披露时间：15分钟（用于测试，实际部署可调整为更长时间）
  const revealTime = 15 * 60; // 15分钟（秒数）

  // 受益人地址（这里设置为部署者地址）
  const beneficiaryAddress = deployer;

  await deploy("BlindAuction", {
    from: deployer,
    // 合约构造函数参数
    args: [startTime, biddingTime, revealTime, beneficiaryAddress],
    log: true,
    // autoMine: 可以传递给deploy函数，以使部署过程在本地网络上更快
    // 通过自动挖掘合约部署交易。对线上网络没有影响。
    autoMine: true,
  });
};

export default deployBlindAuction;

deployBlindAuction.tags = ["BlindAuction"]; 