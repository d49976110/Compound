const { expect } = require("chai");
const { ethers } = require("hardhat");
const { impersonateAccount } = require("@nomicfoundation/hardhat-network-helpers");

const swapRouter = "0xe592427a0aece92de3edee1f18e0157c05861564";
const binanceAddress = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const DaiAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const WETHAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
let swapContract;
let Dai, WETH;

async function deployContracts() {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    Dai = await ethers.getContractAt("ERC20", DaiAddress);
    WETH = await ethers.getContractAt("ERC20", WETHAddress);
    let SwapContract = await ethers.getContractFactory("SwapExamples");
    swapContract = await SwapContract.deploy(swapRouter);
}

describe("Playground", async function () {
    before(async () => {
        await deployContracts();
    });

    it("Transfer Dai to owner from binance wallet", async function () {
        // get some Dai
        await impersonateAccount(binanceAddress);
        const binance = await ethers.getSigner(binanceAddress);
        let balance = await Dai.connect(binance).balanceOf(binance.address);

        Dai.connect(binance).transfer(addr1.address, BigInt(1000 * 1e18));
        console.log("balance", await Dai.balanceOf(addr1.address));
    });

    it("swap", async () => {
        // approve first
        await Dai.connect(addr1).approve(swapContract.address, BigInt(1000 * 1e18));
        let beforeBalance = await WETH.balanceOf(addr1.address);
        console.log("before balance", beforeBalance);
        expect(beforeBalance).to.eq(0);
        // swap
        await swapContract.connect(addr1).swapExactInputSingle(BigInt(1000 * 1e18));
        let balance = await WETH.balanceOf(addr1.address);
        console.log("after balance", balance);
        expect(balance).to.gt(0);
    });
});
