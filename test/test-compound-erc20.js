const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("TestCompoundErc20", function () {
    const WHALE = "0x602d9aBD5671D24026e2ca473903fF2A9A957407";
    const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
    const CWBTC = "0xccF4429DB6322D5C611ee964527D42E5d685DD6a";

    const DEPOSIT_AMOUNT = 1.2 * 10 ** 8;

    let testCompound;
    let token;
    let cToken;
    let whale;

    before(async () => {
        const TestCompound = await ethers.getContractFactory("TestCompoundErc20");
        testCompound = await TestCompound.deploy(WBTC, CWBTC);

        // get contract instance
        token = await ethers.getContractAt("IERC20", WBTC);
        cToken = await ethers.getContractAt("CErc20_test", CWBTC);

        //imperson
        await helpers.impersonateAccount(WHALE);
        whale = await ethers.getSigner(WHALE);
    });

    it("balance > 0 ", async () => {
        const bal = await token.balanceOf(WHALE);
        console.log(`whale balance: ${bal}`);
        expect(bal).to.gt(0);
    });

    it("supply", async () => {
        await token.connect(whale).approve(testCompound.address, DEPOSIT_AMOUNT);
        let tx = await testCompound.connect(whale).supply(DEPOSIT_AMOUNT);

        let before = await snapshot(testCompound, token, cToken);

        console.log("--- supply ---");
        console.log(`exchange rate ${before.exchangeRate}`);
        console.log(`supply rate ${before.supplyRate}`);
        console.log(`estimate balance ${before.estimateBalance}`);
        console.log(`balance of underlying ${before.balanceOfUnderlying}`);
        console.log(`token balance ${before.token}`);
        console.log(`c token balance ${before.cToken}`);

        expect(before.token).to.eq(0);
    });

    it("redeem", async () => {
        await ethers.provider.send("evm_increaseTime", [10000]);
        await ethers.provider.send("evm_mine");

        let after = await snapshot(testCompound, token, cToken);

        console.log(`--- after some blocks... ---`);
        console.log(`balance of underlying ${after.balanceOfUnderlying}`);

        const cTokenAmount = await cToken.balanceOf(testCompound.address);
        tx = await testCompound.connect(whale).redeem(cTokenAmount);

        after = await snapshot(testCompound, token, cToken);
        console.log("--- redeem ---");
        console.log(`token balance ${after.token}`);
        console.log(`c token balance ${after.cToken}`);
    });
});

const snapshot = async (testCompound, token, cToken) => {
    const { exchangeRate, supplyRate } = await testCompound.callStatic.getInfo();

    return {
        exchangeRate,
        supplyRate,
        estimateBalance: await testCompound.callStatic.estimateBalanceOfUnderlying(),
        balanceOfUnderlying: await testCompound.callStatic.balanceOfUnderlying(),
        token: await token.balanceOf(testCompound.address),
        cToken: await cToken.balanceOf(testCompound.address),
    };
};
