// const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
    impersonateAccount,
} = require("@nomicfoundation/hardhat-network-helpers");

let flashloan, binance, usdc, owner, addr1, addr2;

const ADDRESS_PROVIDER = "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5";
const binanceAddress = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // token A

async function deployContracts() {
    [owner, addr1, addr2] = await ethers.getSigners();

    usdc = await ethers.getContractAt("ERC20", usdcAddress);

    let Flashloan = await ethers.getContractFactory("TestAaveFlashLoan");
    flashloan = await Flashloan.deploy(ADDRESS_PROVIDER);
}

describe("Token contract", function () {
    before(async () => {
        await deployContracts();
    });

    it("Transfer USDC to owner from binance wallet", async function () {
        //check binance balance
        let balance = await usdc.balanceOf(binanceAddress);
        expect(balance).to.gt(0);

        // transfer to owner from binance
        await impersonateAccount(binanceAddress);
        binance = await ethers.getSigner(binanceAddress);

        expect(
            await usdc.connect(binance).transfer(owner.address, 50n * 10n ** 6n)
        ).to.changeTokenBalances(
            binance,
            [binance, owner],
            [-(50n * 10n ** 6n), 50n * 10n ** 6n]
        );
    });
});
