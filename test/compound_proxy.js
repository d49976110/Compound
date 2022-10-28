const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("CErc20", async () => {
    let cerc20, tokenA, tokenB, cTokenA, cTokenB;
    let unitroller, Comptroller, comptroller, interestRateModel, oracle;

    let tokenAmount = BigInt(1000 * 1e18);
    let supplyAmount = BigInt(100 * 1e18);

    let tokenBmount = BigInt(1 * 1e18);
    let borrowAmount_A_from_B = BigInt(50 * 1e18);

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
    let chagnedCollateralFactorB = BigInt(0.4 * 1e18);

    before(async () => {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        // create tokenA & tokenB
        let Erc20 = await ethers.getContractFactory("ERC20_custom");
        tokenA = await Erc20.deploy("TokenA", "TOA");
        tokenB = await Erc20.deploy("TokenB", "TOB");

        // create interest model
        let InterestRateModel = await ethers.getContractFactory(
            "WhitePaperInterestRateModel"
        );
        interestRateModel = await InterestRateModel.deploy(0, 0);

        //create comptroller
        Comptroller = await ethers.getContractFactory("Comptroller");
        comptroller = await Comptroller.deploy();

        //create oracel
        let Oracle = await ethers.getContractFactory("SimplePriceOracle");
        oracle = await Oracle.deploy();

        // set proxy
        let Unitroller = await ethers.getContractFactory("Unitroller");
        unitroller = await Unitroller.deploy();

        await unitroller._setPendingImplementation(comptroller.address);
        await unitroller._acceptImplementation();

        await comptroller._become(unitroller.address);
        comptroller = await Comptroller.attach(unitroller.address);

        // create cTokenA & cTokenB
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
        it("set cTokenB comptroller & oracle", async () => {
            await oracle.setUnderlyingPrice(cTokenB.address, tokenBPrice);
            await comptroller._supportMarket(cTokenB.address);
            await comptroller._setCollateralFactor(
                cTokenB.address,
                collateralFactorB
            );
        });

        it("addr1 supply some tokenA for cTokenA", async () => {
            await tokenA.connect(addr1).mint(supplyAmount);
            await tokenA.connect(addr1).approve(cTokenA.address, supplyAmount);
            await cTokenA.connect(addr1).mint(supplyAmount);
            expect(await cTokenA.balanceOf(addr1.address)).to.eq(supplyAmount);
        });

        it("owner mint approve tokenB and mint cTokenB first", async () => {
            await tokenB.mint(tokenBmount);
            await tokenB.approve(cTokenB.address, tokenBmount);
            await cTokenB.mint(tokenBmount);
            expect(await cTokenB.balanceOf(owner.address)).to.eq(tokenBmount);
        });

        it("enter ctokenB to markets", async () => {
            await comptroller.enterMarkets([cTokenB.address]);
        });

        it("borrow tokenA", async () => {
            await cTokenA.borrow(borrowAmount_A_from_B);
            expect(
                await cTokenA.callStatic.borrowBalanceCurrent(owner.address)
            ).to.eq(borrowAmount_A_from_B);
        });

        it("repay tokenA to contract", async () => {
            let balance = await tokenA.balanceOf(owner.address);
            await cTokenA.repayBorrow(borrowAmount_A_from_B);
            expect(await tokenA.balanceOf(owner.address)).to.eq(
                BigInt(Number(balance) - Number(borrowAmount_A_from_B))
            );

            //liquidity should grater than 0
            let result = await comptroller.getAccountLiquidity(owner.address);
            expect(result[1]).to.gt(0);
        });
    });

    describe("liquidate", async () => {
        it("change collateral factor", async () => {
            // borrow again
            await cTokenA.borrow(borrowAmount_A_from_B);
            expect(
                await cTokenA.callStatic.borrowBalanceCurrent(owner.address)
            ).to.eq(borrowAmount_A_from_B);

            //set collateranl factor
            await comptroller._setCollateralFactor(
                cTokenB.address,
                chagnedCollateralFactorB
            );

            let markets = await comptroller.markets(cTokenB.address);
            expect(markets.collateralFactorMantissa).to.eq(
                chagnedCollateralFactorB
            );
            // liquidity should = 0 && short fall should > 0
            let result = await comptroller.getAccountLiquidity(owner.address);
            expect(result[1]).to.eq(0);
            expect(result[2]).to.gt(0);
        });
    });

    // describe("liquidate", async () => {});
});
