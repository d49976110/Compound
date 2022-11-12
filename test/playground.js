// const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
    impersonateAccount,
} = require("@nomicfoundation/hardhat-network-helpers");
const { Logger, LogLevel } = require("@ethersproject/logger");

Logger.setLogLevel(LogLevel.ERROR);

let cerc20, tokenA, tokenB, cTokenA, cTokenB;
let unitroller, Comptroller, comptroller, interestRateModel, oracle;

let decimals = 18;
let nameA = "CTokenA";
let symbolA = "CTA";
let nameB = "CTokenB";
let symbolB = "CTB";
// change rate = 1:1
let changeRateA = BigInt(1 * 1e18);
let changeRateB = BigInt(1 * 1e18);

let flashloan, singlwswap, binance, usdc, uni;
let owner, addr1, addr2;

const ADDRESS_PROVIDER = "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5";
const UNISWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const binanceAddress = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const uniAddress = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";

let USDCAmount = 50n * 10n ** 6n;

async function deployContracts() {
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
        tokenA.address,
        comptroller.address,
        interestRateModel.address,
        changeRateA,
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
        changeRateB,
        nameB,
        symbolB,
        decimals,
        owner.address,
        cerc20.address,
        "0x"
    );
}

async function deployFlashloan() {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    usdc = await ethers.getContractAt("ERC20", usdcAddress);
    uni = await ethers.getContractAt("ERC20", uniAddress);

    let SingleSwap = await ethers.getContractFactory("TestSingleSwap");
    singlwswap = await SingleSwap.deploy(UNISWAP_ROUTER);

    let Flashloan = await ethers.getContractFactory(
        "TestAaveFlashLoan_withUniswap"
    );
    // aave provider、uniswap router、cToken address
    flashloan = await Flashloan.deploy(ADDRESS_PROVIDER, UNISWAP_ROUTER);
}

describe("Playground", function () {
    before(async () => {
        await deployContracts();
        await deployFlashloan();
    });

    it("Transfer USDC to owner from binance wallet", async function () {
        //check binance balance
        let balance = await usdc.balanceOf(binanceAddress);
        expect(balance).to.gt(0);

        // transfer to owner from binance
        await impersonateAccount(binanceAddress);
        binance = await ethers.getSigner(binanceAddress);

        expect(
            await usdc.connect(binance).transfer(flashloan.address, USDCAmount)
        ).to.changeTokenBalances(
            binance,
            [binance, flashloan],
            [-USDCAmount, USDCAmount]
        );
    });
    //           liquidate      redeem       swap
    //flow = USDC   ->    cUni    ->    UNI   ->  USDC
    it("Execute flashloan", async () => {
        // console.log(
        //     "pre USDC balance (flashloan)",
        //     await usdc.balanceOf(flashloan.address)
        // );

        await flashloan.testFlashLoan(usdcAddress, USDCAmount - 1n);
        // console.log(
        //     "USDC balance (flashloan)",
        //     await usdc.balanceOf(flashloan.address)
        // );
    });

    it("Swap USDC to UNI", async () => {
        // give some usdc to owner
        expect(
            await usdc.connect(binance).transfer(owner.address, USDCAmount)
        ).to.changeTokenBalances(
            binance,
            [binance, owner],
            [-USDCAmount, USDCAmount]
        );

        // console.log("pre usdc balance", await usdc.balanceOf(owner.address));
        // console.log("pre uni balance", await uni.balanceOf(owner.address));

        //approve usdc for singleswap contract
        await usdc.approve(singlwswap.address, USDCAmount);

        await singlwswap.swapExactInputSingle_USDC(USDCAmount);

        // console.log("after usdc balance", await usdc.balanceOf(owner.address));
        // console.log("after uni balance", await uni.balanceOf(owner.address));
    });

    it("Sign message", async () => {
        let SimpleSign = await ethers.getContractFactory("SimpleSign");
        let simpleSign = await SimpleSign.deploy();

        await simpleSign.getMessageHash();
        let data = await simpleSign.data();

        //由於data回傳值是string，要將它轉成bytes，透過加上陣列的方式，讓他看起來像是bytes => ethers.utils.arrayify()
        let signature = await owner.signMessage(ethers.utils.arrayify(data));

        let address = await simpleSign.getAddress(data, signature);

        expect(address).to.eq(owner.address);
    });

    it("sign data using oraclePriceData ", async () => {
        // get oraclePriceData
        const OraclePriceData = await ethers.getContractFactory(
            "OpenOraclePriceData"
        );
        const oraclePriceData = await OraclePriceData.deploy();

        let message = ethers.utils.defaultAbiCoder.encode(
            ["bytes32", "bytes32", "uint8"],
            [
                "0xd6aca1be9729c13d677335161321649cccae6a591554772516700f986f942eaa",
                "0xd6aca1be9729c13d677335161321649cccae6a591554772516700f986f942eaa",
                1,
            ]
        );

        let hashData = ethers.utils.solidityKeccak256(["bytes"], [message]);

        //由於data回傳值是string，要將它轉成bytes，透過加上陣列的方式，讓他看起來像是bytes => ethers.utils.arrayify()
        let signature = await owner.signMessage(
            ethers.utils.arrayify(hashData)
        );

        //因為source的abi.encodePacked是keccak256(message)，所以須傳入尚未hash的message
        let sourceDataAddress = await oraclePriceData.callStatic.source(
            message,
            signature
        );

        expect(sourceDataAddress).to.eq(owner.address);
    });

    it("set up uniswap anchored view", async () => {
        // get oraclePriceData
        const OraclePriceData = await ethers.getContractFactory(
            "OpenOraclePriceData"
        );
        const oraclePriceData = await OraclePriceData.deploy();

        // get the uniswap USDC & UNI pool address
        const uniswapV2Factory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
        const uniswapFactory = await ethers.getContractAt(
            "UniswapV2Factory",
            uniswapV2Factory
        );
        const poolAddress = await uniswapFactory.getPair(
            usdcAddress,
            uniAddress
        );

        // set the uniswap anchored view constructor
        let byte = ethers.utils.solidityPack(["string"], ["USDC"]);
        let symbolhash = ethers.utils.solidityKeccak256(["bytes"], [byte]);

        const uniswapMarket = poolAddress;

        let reporter = owner.address;
        let anchoredTolerance = 0;
        let anchoredPeriod = 0;

        let configs = [
            [
                cTokenA.address, // ctoken
                tokenA.address, // underlying
                symbolhash, // symbolhash
                10n ** 18n, //base uint
                2, // price source
                0, // fix price
                uniswapMarket,
                true,
            ],
        ];

        // deploy
        let UniswapAnchored = await ethers.getContractFactory(
            "UniswapAnchoredView"
        );

        let uniswapAnchored = await UniswapAnchored.deploy(
            oraclePriceData.address,
            reporter,
            anchoredTolerance,
            anchoredPeriod,
            configs
        );

        let data = await uniswapAnchored.getTokenConfigBySymbol("USDC");
        // console.log("data", data);
    });
});
