const { expect } = require("chai");
const { ethers } = require("hardhat");
const { Logger, LogLevel } = require("@ethersproject/logger");

Logger.setLogLevel(LogLevel.ERROR);

let cerc20, tokenA, tokenB, cTokenA, cTokenB;
let unitroller, Comptroller, comptroller, interestRateModel, oracle;

let tokenAmount = BigInt(1000 * 1e18);
let supplyAmount = BigInt(100 * 1e18);

let tokenBAmount = BigInt(1 * 1e18);
let borrowAmount_A_from_B = BigInt(50 * 1e18);

let decimals = 18;
let nameA = "CTokenA";
let symbolA = "CTA";
let nameB = "CTokenB";
let symbolB = "CTB";
// change rate = 1:1
let changeRateA = BigInt(1 * 1e18);
let changeRateB = BigInt(1 * 1e18);
let tokenAPrice = BigInt(1 * 1e18);
let newTokenAPrice = BigInt(1.5 * 1e18);
let tokenBPrice = BigInt(100 * 1e18);
let collateralFactorA = BigInt(0.9 * 1e18);
let collateralFactorB = BigInt(0.5 * 1e18);
let chagnedCollateralFactorB = BigInt(0.4 * 1e18);

//Liquidate factor
let closeFactor = BigInt(0.5 * 1e18); //可以清算的％
let liquidationIncentive = BigInt(1.08 * 1e18);

/**
    - Interest model [global]
        - baseRatePerYear : 基礎利率％
        - multiplierPerYear : 每年乘數％
    - Oracle [global]
        - setUnderlyingPrice : 設定抵押物價格，價格不能為0，否則_setCollateralFactor會revert [per cToken market]
    - Collateral factor [per cToken market]
        - collateralFactor : 抵押率％，要 <= 0.9%，否則_setCollateralFactor會revert
    - Comptroller
        - _supportMarket : 支援市場
        - _setPriceOracle : 設定Oracle
        - _setCollateralFactor : 設定抵押率
        - _setCloseFactor : 設定可以清算的％
        - _setLiquidationIncentive : 設定清算獎勵％
    - CToken
        - mint : 存款
        - redeem : 提款
        - borrow : 借款
        - repayBorrow : 還款
        - liquidateBorrow : 清算
    - Liquidate factor [global]
        - closeFactor : 可以清算的％
        - liquidationIncentive : 清算獎勵％
*/

async function deployContracts() {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    // TokenA & TokenB
    let Erc20 = await ethers.getContractFactory("ERC20_custom");
    tokenA = await Erc20.deploy("TokenA", "TOA");
    tokenB = await Erc20.deploy("TokenB", "TOB");

    // Interest model [o]
    let InterestRateModel = await ethers.getContractFactory("WhitePaperInterestRateModel");
    interestRateModel = await InterestRateModel.deploy(0, 0);

    // Oracel [o]
    let Oracle = await ethers.getContractFactory("SimplePriceOracle");
    oracle = await Oracle.deploy();

    // Comptroller
    Comptroller = await ethers.getContractFactory("Comptroller");
    comptroller = await Comptroller.deploy();

    // Unitroller is proxy : set unitroller & comptroller
    let Unitroller = await ethers.getContractFactory("Unitroller");
    unitroller = await Unitroller.deploy();

    await unitroller._setPendingImplementation(comptroller.address);
    await comptroller._become(unitroller.address);

    comptroller = await Comptroller.attach(unitroller.address); // Comptroller is the a logic contract abi => using unitroller address but use comptroller abi

    // create cTokenA & cTokenB
    let CERC20 = await ethers.getContractFactory("CErc20Delegate"); // logic implementation
    cerc20 = await CERC20.deploy();
    let delegator = await ethers.getContractFactory("CErc20Delegator"); // proxy contract
    cTokenA = await delegator.deploy(tokenA.address, comptroller.address, interestRateModel.address, changeRateA, nameA, symbolA, decimals, owner.address, cerc20.address, "0x");
    cTokenB = await delegator.deploy(tokenB.address, comptroller.address, interestRateModel.address, changeRateB, nameB, symbolB, decimals, owner.address, cerc20.address, "0x");
}

async function setcomptroller() {
    //set oracle first, otherwise comptroller._setCollateralFactor will revert
    await oracle.setUnderlyingPrice(cTokenA.address, tokenAPrice);
    await oracle.setUnderlyingPrice(cTokenB.address, tokenBPrice);
    //support market
    await comptroller._supportMarket(cTokenA.address);
    await comptroller._supportMarket(cTokenB.address);
    //set oracle
    await comptroller._setPriceOracle(oracle.address);
    //set collateral
    await comptroller._setCollateralFactor(cTokenA.address, collateralFactorA);
    await comptroller._setCollateralFactor(cTokenB.address, collateralFactorB);
    // set close factor : 可以清算的%
    await comptroller._setCloseFactor(closeFactor);
    // set liquidation incentive
    await comptroller._setLiquidationIncentive(liquidationIncentive);
    // token B
}

describe("Compound liquidate with change collateral factor", async () => {
    before(async () => {
        await deployContracts();
    });

    describe("Settings", async () => {
        it("ERC20 & CERC20 decimals should be 18", async () => {
            expect(await tokenA.decimals()).to.eq(decimals);
            expect(await cTokenA.decimals()).to.eq(decimals);
        });

        it("admin set oracle & comptroller", async () => {
            await setcomptroller();
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

        it("Owner Erc20 balance should be token amount", async () => {
            expect(await tokenA.balanceOf(owner.address)).to.eq(tokenAmount);
        });
    });

    describe("Borrow & Repay", async () => {
        it("addr1 supply some tokenA for cTokenA", async () => {
            await tokenA.connect(addr1).mint(supplyAmount);
            await tokenA.connect(addr1).approve(cTokenA.address, supplyAmount);
            await cTokenA.connect(addr1).mint(supplyAmount);
            expect(await cTokenA.balanceOf(addr1.address)).to.eq(supplyAmount);
        });

        it("owner mint approve tokenB and mint cTokenB first", async () => {
            await tokenB.mint(tokenBAmount);
            await tokenB.approve(cTokenB.address, tokenBAmount);
            await cTokenB.mint(tokenBAmount);
            expect(await cTokenB.balanceOf(owner.address)).to.eq(tokenBAmount);
        });

        it("enter ctokenB to markets", async () => {
            await comptroller.enterMarkets([cTokenB.address]);
        });

        it("borrow tokenA", async () => {
            await cTokenA.borrow(borrowAmount_A_from_B);
            expect(await cTokenA.callStatic.borrowBalanceCurrent(owner.address)).to.eq(borrowAmount_A_from_B);
        });

        it("repay tokenA to contract", async () => {
            let balance = await tokenA.balanceOf(owner.address);
            await cTokenA.repayBorrow(borrowAmount_A_from_B);
            expect(await tokenA.balanceOf(owner.address)).to.eq(BigInt(Number(balance) - Number(borrowAmount_A_from_B)));

            //liquidity should grater than 0
            let result = await comptroller.getAccountLiquidity(owner.address);
            expect(result[1]).to.gt(0);
        });
    });

    describe("Liquidate_change colletaral factor", async () => {
        it("borrow", async () => {
            await cTokenA.borrow(borrowAmount_A_from_B);
            expect(await cTokenA.callStatic.borrowBalanceCurrent(owner.address)).to.eq(borrowAmount_A_from_B);
        });

        it("change collateral factor", async () => {
            await comptroller._setCollateralFactor(cTokenB.address, chagnedCollateralFactorB);

            let markets = await comptroller.markets(cTokenB.address);
            expect(markets.collateralFactorMantissa).to.eq(chagnedCollateralFactorB);
        });

        it("addr1 mint & approve token A", async () => {
            await tokenA.connect(addr1).mint(tokenAmount);

            await tokenA.connect(addr1).approve(cTokenA.address, tokenAmount);
            expect(await tokenA.allowance(addr1.address, cTokenA.address)).to.eq(tokenAmount);
        });

        it("liquidity should = 0 && short fall should > 0", async () => {
            let result = await comptroller.getAccountLiquidity(owner.address);
            expect(result[1]).to.eq(0);
            expect(result[2]).to.gt(0);
        });

        it("liquidate", async () => {
            let borrowBalance = await cTokenA.callStatic.borrowBalanceCurrent(owner.address);

            let repayAmount = (BigInt(borrowBalance) * closeFactor) / BigInt(1e18);

            // before addr1 ctokenB balance = 0
            expect(await cTokenB.balanceOf(addr1.address)).to.eq(0);

            //協助償還借貸資產，到借出的cToken合約，執行liquidateBorrow，第一個參數為被清算人，第二為協助清算資產數量，第三個為抵押資產的cToken地址
            await cTokenA.connect(addr1).liquidateBorrow(owner.address, repayAmount, cTokenB.address);

            // after addr1 ctokenB balance should > 0
            expect(await cTokenB.balanceOf(addr1.address)).to.gt(0);

            // owner current borrow balance should less than origin borrow balance
            expect(await cTokenA.callStatic.borrowBalanceCurrent(owner.address)).to.lt(borrowBalance);
        });
    });
});

describe("Compound liquidate with change oracle", async () => {
    before(async () => {
        await deployContracts();
    });

    describe("Settings_recover final scenario as question 3", async () => {
        it("ERC20 & CERC20 decimals should be 18", async () => {
            expect(await tokenA.decimals()).to.eq(decimals);
            expect(await cTokenA.decimals()).to.eq(decimals);
        });

        it("admin set oracle & comptroller", async () => {
            await setcomptroller();

            //enter ctokenB to markets
            await comptroller.enterMarkets([cTokenB.address]);
            let markets = await comptroller.markets(cTokenB.address);

            expect(markets[0]).to.eq(true);

            //addr1 mint some tokenA and approve for cTokenA contract
            await tokenA.connect(addr1).mint(supplyAmount + tokenAmount);
            await tokenA.connect(addr1).approve(cTokenA.address, supplyAmount + tokenAmount);

            expect(await tokenA.allowance(addr1.address, cTokenA.address)).to.eq(supplyAmount + tokenAmount);

            //addr1 supply tokenA for cTokenA
            await cTokenA.connect(addr1).mint(supplyAmount);
            expect(await cTokenA.balanceOf(addr1.address)).to.eq(supplyAmount);

            //owner mint tokenB and approve for cTokenB contract
            await tokenB.mint(tokenBAmount);
            await tokenB.approve(cTokenB.address, tokenBAmount);
            expect(await tokenB.allowance(owner.address, cTokenB.address)).to.eq(tokenBAmount);

            //owner supply tokenB for cTokenB
            await cTokenB.mint(tokenBAmount);

            expect(await cTokenB.balanceOf(owner.address)).to.eq(tokenBAmount);
        });
    });

    describe("Liquidate_change oracle price", async () => {
        it("owner borrow tokenA", async () => {
            await cTokenA.borrow(borrowAmount_A_from_B);
            expect(await cTokenA.callStatic.borrowBalanceCurrent(owner.address)).to.eq(borrowAmount_A_from_B);
        });

        it("change tokenA oracle price", async () => {
            await oracle.setUnderlyingPrice(cTokenA.address, newTokenAPrice);
        });

        it("owner liquidity should = 0 && short fall should > 0", async () => {
            let result = await comptroller.getAccountLiquidity(owner.address);
            expect(result[1]).to.eq(0);
            expect(result[2]).to.gt(0);
        });

        it("addr1 liquidate owner", async () => {
            // check owner borrow token balance
            let borrowBalance = await cTokenA.callStatic.borrowBalanceCurrent(owner.address);

            // before addr1 ctokenB balance = 0
            expect(await cTokenB.balanceOf(addr1.address)).to.eq(0);

            let repayAmount = (BigInt(borrowBalance) * closeFactor) / BigInt(1e18);

            //協助償還借貸資產，到借出的cToken合約，執行liquidateBorrow，第一個參數為被清算人，第二為協助清算資產數量，第三個為返回的抵押資產的cToken地址
            await cTokenA.connect(addr1).liquidateBorrow(owner.address, repayAmount, cTokenB.address);

            // after addr1 ctokenB balance should > 0
            expect(await cTokenB.balanceOf(addr1.address)).to.gt(0);

            // owner current borrow balance should less than origin borrow balance
            expect(await cTokenA.callStatic.borrowBalanceCurrent(owner.address)).to.lt(borrowBalance);
        });

        it("addr1 liquidate owner again", async () => {
            let borrowBalance = await cTokenA.callStatic.borrowBalanceCurrent(owner.address);

            let addr1CTokenBBalance = await cTokenB.balanceOf(addr1.address);

            let repayAmount = (BigInt(borrowBalance) * closeFactor) / BigInt(1e18);

            await cTokenA.connect(addr1).liquidateBorrow(owner.address, repayAmount, cTokenB.address);

            // after addr1 ctokenB balance should > 0
            expect(await cTokenB.balanceOf(addr1.address)).to.gt(addr1CTokenBBalance);

            // owner current borrow balance should less than origin borrow balance
            expect(await cTokenA.callStatic.borrowBalanceCurrent(owner.address)).to.lt(borrowBalance);
        });
    });
});
