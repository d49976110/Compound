const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("CErc20", async () => {
    let cerc20, tokenA, tokenB, cTokenA, cTokenB;
    let unitroller, comptroller, interestRateModel, oracle;

    let tokenAmount = BigInt(1000 * 1e18);
    let supplyAmount = BigInt(100 * 1e18);

    let tokenBmount = BigInt(1 * 1e18);
    let borrowAFromBAmount = BigInt(50 * 1e18);

    let decimals = 18;
    let nameA = "CTokenA";
    let symbolA = "CTA";
    let nameB = "CTokenB";
    let symbolB = "CTB";
    // change rate = 1:1
    let changeRate = BigInt(1 * 1e18);
    let tokenAPrice = BigInt(1 * 1e18);
    let tokenBPrice = BigInt(100 * 1e18);
    let collateralFactorA = BigInt(0.9 * 1e18);
    let collateralFactorB = BigInt(0.5 * 1e18);

    before(async () => {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        let Erc20 = await ethers.getContractFactory("ERC20_custom");
        tokenA = await Erc20.deploy("TokenA", "TOA");
        tokenB = await Erc20.deploy("TokenB", "TOB");

        let InterestRateModel = await ethers.getContractFactory(
            "WhitePaperInterestRateModel"
        );
        interestRateModel = await InterestRateModel.deploy(0, 0);

        let Comptroller = await ethers.getContractFactory("Comptroller");
        comptroller = await Comptroller.deploy();

        let Oracle = await ethers.getContractFactory("SimplePriceOracle");
        oracle = await Oracle.deploy();

        let Unitroller = await ethers.getContractFactory("Unitroller");
        unitroller = await Unitroller.deploy();

        // let CERC20 = await ethers.getContractFactory("CErc20Immutable");
        // cTokenA = await CERC20.deploy(
        //     tokenA.address,
        //     comptroller.address,
        //     interestRateModel.address,
        //     changeRate,
        //     nameA,
        //     symbolA,
        //     decimals,
        //     owner.address
        // );

        // cTokenB = await CERC20.deploy(
        //     tokenB.address,
        //     comptroller.address,
        //     interestRateModel.address,
        //     changeRate,
        //     nameB,
        //     symbolB,
        //     decimals,
        //     owner.address
        // );

        let CERC20 = await ethers.getContractFactory("CErc20Delegate");
        let cerc20 = await CERC20.deploy();
        let delegator = await ethers.getContractFactory("CErc20Delegator");
        cTokenA = await delegator.deploy(
            tokenA.address,
            comptroller.address,
            interestRateModel.address,
            changeRate,
            nameA,
            symbolA,
            decimals,
            owner.address,
            cerc20.address,
            "0x"
        );
        cTokenB = await delegator.deploy(
            tokenB.address,
            comptroller.address,
            interestRateModel.address,
            changeRate,
            nameB,
            symbolB,
            decimals,
            owner.address,
            cerc20.address,
            "0x"
        );
    });

    describe("Settings", async () => {
        it("ERC20 & CERC20 decimals should be 18", async () => {
            expect(await tokenA.decimals()).to.eq(decimals);
            expect(await cTokenA.decimals()).to.eq(decimals);
        });

        it("set unitroller", async () => {
            await unitroller._setPendingImplementation(comptroller.address);
            await unitroller._acceptImplementation();

            await comptroller._become(unitroller.address);
        });

        it("admin set oracle & comptroller", async () => {
            //set oracle first, otherwise comptroller._setCollateralFactor will revert
            await oracle.setUnderlyingPrice(cTokenA.address, tokenAPrice);
            //support market
            await comptroller._supportMarket(cTokenA.address);
            //set oracle
            await comptroller._setPriceOracle(oracle.address);
            //set collateral
            await comptroller._setCollateralFactor(
                cTokenA.address,
                collateralFactorA
            );
        });
    });

    describe("Mint & Redeem", async () => {
        it("mint & approve ERC20", async () => {
            //mint
            await tokenA.mint(tokenAmount);
            //approve
            await tokenA.approve(cTokenA.address, tokenAmount);
            //enterMarkets
            await comptroller.enterMarkets([cTokenA.address]);
        });

        it("mint CErc20", async () => {
            await cTokenA.mint(supplyAmount);
            expect(await cTokenA.balanceOf(owner.address)).to.eq(supplyAmount);
        });

        it("redeem Erc20", async () => {
            await cTokenA.redeem(supplyAmount);
            expect(await cTokenA.balanceOf(owner.address)).to.eq(0);
        });
    });

    describe("Borrow & Repay", async () => {
        it("set comptroller & oracle", async () => {
            await oracle.setUnderlyingPrice(cTokenB.address, tokenBPrice);
            await comptroller._supportMarket(cTokenB.address);
            await comptroller._setCollateralFactor(
                cTokenB.address,
                collateralFactorB
            );
        });

        it("mint approve Erc20 and mint CErc20 first", async () => {
            await tokenB.mint(tokenBmount);
            await tokenB.approve(cTokenB.address, tokenBmount);
            await cTokenB.mint(tokenBmount);
            expect(await cTokenB.balanceOf(owner.address)).to.eq(tokenBmount);
        });

        it("enter markets", async () => {
            await comptroller.enterMarkets([cTokenB.address]);
        });

        it("supply some A token", async () => {
            await cTokenA.mint(supplyAmount);
        });

        it("borrow", async () => {
            await cTokenA.borrow(borrowAFromBAmount);
            expect(
                await cTokenA.callStatic.borrowBalanceCurrent(owner.address)
            ).to.eq(borrowAFromBAmount);
        });

        it("repay", async () => {
            await cTokenA.repayBorrow(borrowAFromBAmount);
        });
    });
});
