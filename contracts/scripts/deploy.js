const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  const oracle = process.env.ORACLE_ADDRESS || deployer.address;
  let tokenAddress = process.env.BALL_TOKEN_ADDRESS;

  if (!tokenAddress) {
    const Token = await ethers.getContractFactory("TestBallToken");
    const token = await Token.deploy(ethers.parseEther("1000000000"));
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();
    console.log("Test BALL:", tokenAddress);
  }

  const Pool = await ethers.getContractFactory("BallPool");
  const pool = await Pool.deploy(tokenAddress, treasury, oracle, 500, 200, 600);
  await pool.waitForDeployment();
  console.log("BallPool:", await pool.getAddress());
  console.log("Treasury:", treasury);
  console.log("Oracle:", oracle);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
