const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("CErc20", async () => {
    let erc20, cerc20, comptroller, interestRate, oracle;
    let amount = ethers.utils.parseEther("100");
    // rate = 1:1
    let changeRate = BigInt(10 ** 18);
    let decimals = 18;
    let name = "Compound ETH";
    let symbol = "CWETH";

    before(async () => {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        let Erc20 = await ethers.getContractFactory("WETH");
        erc20 = await Erc20.deploy();

        let InterestRate = await ethers.getContractFactory("InterestRate");
        interestRate = await InterestRate.deploy();

        let Comptroller = await ethers.getContractFactory("Comptroller");
        comptroller = await Comptroller.deploy();

        let Oracle = await ethers.getContractFactory("PirceOracleImplement");
        oracle = await Oracle.deploy();
    });

    it("deploy CErc20", async function () {
        let CERC20 = await ethers.getContractFactory("CErc20Immutable");
        cerc20 = await CERC20.deploy(
            erc20.address,
            comptroller.address,
            interestRate.address,
            changeRate,
            name,
            symbol,
            decimals,
            owner.address
        );
    });

    it("set comptroller", async () => {
        //support market
        await comptroller._supportMarket(cerc20.address);
        //set oracle
        await comptroller._setPriceOracle(oracle.address);
        //enterMarkets
        await comptroller.enterMarkets([cerc20.address]);
    });

    it("mint & approve ERC20", async () => {
        //mint
        await erc20.mint(amount);
        //approve
        await erc20.approve(cerc20.address, amount);
    });

    it("CErc20 mint", async () => {
        await cerc20.mint(amount);
        expect(await cerc20.balanceOf(owner.address)).to.eq(amount);
    });

    it("redeem", async () => {
        await cerc20.redeem(amount);
        console.log("erc20 balance", await erc20.balanceOf(owner.address));

        expect(await cerc20.balanceOf(owner.address)).to.eq(0);
    });
});
