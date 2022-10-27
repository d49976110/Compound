const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("CErc20", async () => {
    let tokenA, cerc20, comptroller, interestRateModel, oracle;

    let Erc20mintamount = BigInt(1000 * 1e18);
    let supplyAmount = BigInt(100 * 1e18);
    let borrowAmount = BigInt(90 * 1e18);

    let decimals = 18;
    let nameA = "CTokenA";
    let symbolA = "CTA";
    // change rate = 1:1
    let changeRate = BigInt(1 * 1e18);
    let underlyingOraclePrice = 20;
    let collateralFactor = BigInt(0.9 * 1e18);

    before(async () => {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        let Erc20 = await ethers.getContractFactory("ERC20_custom");
        tokenA = await Erc20.deploy("TokenA", "TOA");

        let InterestRateModel = await ethers.getContractFactory("InterestRate");
        interestRateModel = await InterestRateModel.deploy();

        let Comptroller = await ethers.getContractFactory("Comptroller");
        comptroller = await Comptroller.deploy();

        let Oracle = await ethers.getContractFactory("SimplePriceOracle");
        oracle = await Oracle.deploy();

        let CERC20 = await ethers.getContractFactory("CErc20Immutable");
        cerc20 = await CERC20.deploy(
            tokenA.address,
            comptroller.address,
            interestRateModel.address,
            changeRate,
            nameA,
            symbolA,
            decimals,
            owner.address
        );
    });

    describe("Settings", async () => {
        it("ERC20 & CERC20 decimals should be 18", async () => {
            expect(await tokenA.decimals()).to.eq(decimals);
            expect(await cerc20.decimals()).to.eq(decimals);
        });

        it("set oracle & comptroller", async () => {
            //set oracle first, otherwise comptroller._setCollateralFactor will revert
            await oracle.setUnderlyingPrice(
                cerc20.address,
                underlyingOraclePrice
            );
            //support market
            await comptroller._supportMarket(cerc20.address);
            //set oracle
            await comptroller._setPriceOracle(oracle.address);
            //set collateral
            await comptroller._setCollateralFactor(
                cerc20.address,
                collateralFactor
            );
        });
    });

    describe("Mint & Redeem", async () => {
        it("mint & approve ERC20", async () => {
            //mint
            await tokenA.mint(Erc20mintamount);
            //approve
            await tokenA.approve(cerc20.address, Erc20mintamount);
            //enterMarkets
            await comptroller.enterMarkets([cerc20.address]);
        });

        it("mint CErc20", async () => {
            await cerc20.mint(supplyAmount);
            expect(await cerc20.balanceOf(owner.address)).to.eq(supplyAmount);
        });

        it("redeem Erc20", async () => {
            await cerc20.redeem(supplyAmount);
            expect(await cerc20.balanceOf(owner.address)).to.eq(0);
        });
    });

    describe("Borrow & Repay", async () => {
        it("approve Erc20 and mint CErc20 first", async () => {
            await cerc20.mint(supplyAmount);
            expect(await cerc20.balanceOf(owner.address)).to.eq(supplyAmount);
        });
        it("borrow", async () => {
            await cerc20.borrow(borrowAmount);
            expect(
                await cerc20.callStatic.borrowBalanceCurrent(owner.address)
            ).to.eq(borrowAmount);
        });
        it("repay", async () => {
            await cerc20.repayBorrow(borrowAmount);
        });
    });
});
