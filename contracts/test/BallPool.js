const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("BallPool", function () {
  async function fixture() {
    const [owner, treasury, oracle, alice, bob] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("TestBallToken");
    const token = await Token.deploy(ethers.parseEther("1000000000"));
    const Pool = await ethers.getContractFactory("BallPool");
    const pool = await Pool.deploy(await token.getAddress(), treasury.address, oracle.address, 500, 200, 600);
    await token.transfer(alice.address, ethers.parseEther("100000"));
    await token.transfer(bob.address, ethers.parseEther("100000"));
    await token.connect(alice).approve(await pool.getAddress(), ethers.MaxUint256);
    await token.connect(bob).approve(await pool.getAddress(), ethers.MaxUint256);
    return { owner, treasury, oracle, alice, bob, token, pool };
  }

  async function createGame(pool, oracle, seconds = 3600) {
    const now = await time.latest();
    const key = ethers.keccak256(ethers.toUtf8Bytes("NFL|CHI|GB|demo"));
    await pool.connect(oracle).createGame(key, now + seconds, "Chicago Bears", "Green Bay Packers");
    return { gameId: 1n, lockTime: now + seconds };
  }

  it("burns 5%, pays 2% protocol, and stakes 93%", async function () {
    const { pool, oracle, alice, token, treasury } = await fixture();
    await createGame(pool, oracle);
    const amount = ethers.parseEther("1000");
    const supplyBefore = await token.totalSupply();
    await pool.connect(alice).bet(1, 1, amount, 500);
    expect(await token.totalSupply()).to.equal(supplyBefore - ethers.parseEther("50"));
    expect(await token.balanceOf(treasury.address)).to.equal(ethers.parseEther("20"));
    const [home, away] = await pool.pools(1);
    expect(home).to.equal(ethers.parseEther("930"));
    expect(away).to.equal(0);
  });

  it("supports voluntary higher burn with no payout advantage", async function () {
    const { pool, oracle, alice } = await fixture();
    await createGame(pool, oracle);
    await pool.connect(alice).bet(1, 1, ethers.parseEther("1000"), 2500);
    const pos = await pool.positions(1, alice.address);
    expect(pos.homeStake).to.equal(ethers.parseEther("730"));
  });

  it("settles pari-mutuel payouts after the dispute window", async function () {
    const { pool, oracle, alice, bob, token } = await fixture();
    const { lockTime } = await createGame(pool, oracle, 100);
    await pool.connect(alice).bet(1, 1, ethers.parseEther("1000"), 500);
    await pool.connect(bob).bet(1, 2, ethers.parseEther("2000"), 500);
    await time.increaseTo(lockTime + 1);
    await pool.connect(oracle).proposeResult(1, 1);
    await expect(pool.finalizeResult(1)).to.be.revertedWithCustomError(pool, "TooEarlyToFinalize");
    await time.increase(601);
    await pool.finalizeResult(1);
    const before = await token.balanceOf(alice.address);
    await pool.connect(alice).claim(1);
    const after = await token.balanceOf(alice.address);
    expect(after - before).to.equal(ethers.parseEther("2790"));
    await expect(pool.connect(bob).claim(1)).to.be.revertedWithCustomError(pool, "NothingToClaim");
  });

  it("refunds effective stake on cancellation", async function () {
    const { pool, oracle, alice, owner, token } = await fixture();
    await createGame(pool, oracle);
    await pool.connect(alice).bet(1, 1, ethers.parseEther("1000"), 500);
    await pool.connect(owner).cancelGame(1);
    const before = await token.balanceOf(alice.address);
    await pool.connect(alice).claim(1);
    expect((await token.balanceOf(alice.address)) - before).to.equal(ethers.parseEther("930"));
  });
});
