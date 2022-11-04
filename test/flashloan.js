const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
    impersonateAccount,
} = require("@nomicfoundation/hardhat-network-helpers");

let usdc, uni, cerc20, tokenA, tokenB, cTokenA, cTokenB;
let unitroller, Comptroller, comptroller, interestRateModel, oracle;

// token info
let USDCAmount = BigInt(5000 * 1e6); // tokenA
let UNIAmount = BigInt(1000 * 1e18); // tokenB

let binanceAddress = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
let usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // token A
let uniAddress = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"; // token B

// let decimals = 6;
let decimals = 18;
let nameA = "USDC";
let symbolA = "USDC";
let nameB = "UNI";
let symbolB = "UNI";

let exchangeRateA = BigInt(1 * 1e6); // because usdc decimal = 6
let exchangeRateB = BigInt(1 * 1e18);
let tokenAPrice = BigInt(1 * 1e18) * BigInt(1e12); // because usdc decimal = 6, so need to multi by 1e12
let tokenBPrice = BigInt(10 * 1e18);
let newTokenBPrice = BigInt(6.2 * 1e18);
let collateralFactorA = BigInt(0.9 * 1e18);
let collateralFactorB = BigInt(0.5 * 1e18);
// let collateralFactorB = BigInt(0.5 * 1e18);
// let chagnedCollateralFactorB = BigInt(0.4 * 1e18);

//liquidate factor
let closeFactor = BigInt(0.5 * 1e18);
let liquidationIncentive = BigInt(1.08 * 1e18);

async function deployContracts() {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    // create tokenA & tokenB
    // let Erc20 = await ethers.getContractFactory("ERC20_custom");
    // tokenA = await Erc20.deploy("TokenA", "TOA");
    // tokenB = await Erc20.deploy("TokenB", "TOB");

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

    // proxy setting (set unitroller & comptroller)
    let Unitroller = await ethers.getContractFactory("Unitroller");
    unitroller = await Unitroller.deploy();

    await unitroller._setPendingImplementation(comptroller.address);
    await unitroller._acceptImplementation();

    await comptroller._become(unitroller.address);

    comptroller = await Comptroller.attach(unitroller.address); // comptroller is a proxy => using unitroller address but use comptroller abi

    // create cTokenA & cTokenB
    let CERC20 = await ethers.getContractFactory("CErc20Delegate"); // logic implementation
    cerc20 = await CERC20.deploy();
    let delegator = await ethers.getContractFactory("CErc20Delegator"); // proxy contract
    cTokenA = await delegator.deploy(
        usdcAddress,
        comptroller.address,
        interestRateModel.address,
        exchangeRateA,
        nameA,
        symbolA,
        decimals,
        owner.address,
        cerc20.address,
        "0x"
    );
    cTokenB = await delegator.deploy(
        uniAddress,
        comptroller.address,
        interestRateModel.address,
        exchangeRateB,
        nameB,
        symbolB,
        decimals,
        owner.address,
        cerc20.address,
        "0x"
    );
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
    // set close factor
    await comptroller._setCloseFactor(closeFactor);
    // set liquidation incentive
    await comptroller._setLiquidationIncentive(liquidationIncentive);
    // token B
}

describe("Flashloan", async () => {
    before(async () => {
        await deployContracts();
    });
    describe("Owner get UNI & address1 gets USDC from Binance wallet", async () => {
        it("binance wallet should have UNI more than 1000 ", async () => {
            uni = await ethers.getContractAt("ERC20", uniAddress);
            let balance = await uni.balanceOf(binanceAddress);

            expect(balance).to.gt(UNIAmount);
        });
        it("transfer 1000 UNI to owner", async () => {
            await impersonateAccount(binanceAddress);
            const binance = await ethers.getSigner(binanceAddress);
            uni.connect(binance).transfer(owner.address, UNIAmount);

            expect(await uni.balanceOf(owner.address)).to.eq(UNIAmount);
        });
        it("binance wallet should have USDC more than 5000 ", async () => {
            usdc = await ethers.getContractAt("ERC20", usdcAddress);
            let balance = await usdc.balanceOf(binanceAddress);

            expect(balance).to.gt(USDCAmount);
        });
        it("transfer 10000 USDC to address1", async () => {
            await impersonateAccount(binanceAddress);
            const binance = await ethers.getSigner(binanceAddress);
            usdc.connect(binance).transfer(addr1.address, USDCAmount);

            expect(await usdc.balanceOf(addr1.address)).to.eq(USDCAmount);
        });
    });
    describe("Using Uni as collateral to borrow USDC", async () => {
        it("admin set oracle & comptroller", async () => {
            await setcomptroller();
        });

        it("addr1 approve 5000 usdc(tokenA) for compound and supply", async () => {
            await usdc.connect(addr1).approve(cTokenA.address, USDCAmount);

            await cTokenA.connect(addr1).mint(USDCAmount);

            expect(Number(await cTokenA.balanceOf(addr1.address))).to.eq(
                Number(USDCAmount) * 1e12
            );
        });

        it("owner approve 1000 uni(tokenB) for compound and supply ", async () => {
            await uni.approve(cTokenB.address, UNIAmount);
            await cTokenB.mint(UNIAmount);
            expect(await cTokenB.balanceOf(owner.address)).to.eq(UNIAmount);
        });

        it("owner add cUni(ctokenB) to markets", async () => {
            await comptroller.enterMarkets([cTokenB.address]);
        });

        it("owner borrow usdc using uni as collateral", async () => {
            // borrow amount need use ERC20 amount not cToken amount
            await cTokenA.borrow(USDCAmount);
            expect(await usdc.balanceOf(owner.address)).to.eq(USDCAmount);
        });
    });
    describe("Liquidate_change oracle price", async () => {
        it("change UNI(tokenB) price", async () => {
            await oracle.setUnderlyingPrice(cTokenB.address, newTokenBPrice);
        });

        it("owner liquidity should = 0 && short fall should > 0", async () => {
            let result = await comptroller.getAccountLiquidity(owner.address);

            expect(result[1]).to.eq(0);
            expect(result[2]).to.gt(0);
        });

        // it("addr1 liquidate owner", async () => {
        //     // check owner borrow token balance
        //     let borrowBalance = await cTokenA.callStatic.borrowBalanceCurrent(
        //         owner.address
        //     );

        //     let repayAmount =
        //         (BigInt(borrowBalance) * closeFactor) / BigInt(1e18);

        //     //協助償還借貸資產，到借出的cToken合約，執行liquidateBorrow，第一個參數為被清算人，第二為協助清算資產數量，第三個為返回的抵押資產的cToken地址
        //     await cTokenA
        //         .connect(addr1)
        //         .liquidateBorrow(owner.address, repayAmount, cTokenB.address);
        // });
        // it("addr1 liquidate owner again", async () => {
        //     let borrowBalance = await cTokenA.callStatic.borrowBalanceCurrent(
        //         owner.address
        //     );

        //     let repayAmount =
        //         (BigInt(borrowBalance) * closeFactor) / BigInt(1e18);

        //     await cTokenA
        //         .connect(addr1)
        //         .liquidateBorrow(owner.address, repayAmount, cTokenB.address);
        // });
    });
});
