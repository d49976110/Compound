// const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
    impersonateAccount,
} = require("@nomicfoundation/hardhat-network-helpers");

let flashloan, singlwswap, binance, usdc, uni;
let owner, addr1, addr2;

const ADDRESS_PROVIDER = "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5";
const UNISWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const binanceAddress = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const uniAddress = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";

let USDCAmount = 50n * 10n ** 6n;

async function deployContracts() {
    [owner, addr1, addr2] = await ethers.getSigners();

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
        console.log(
            "pre USDC balance (flashloan)",
            await usdc.balanceOf(flashloan.address)
        );

        await flashloan.testFlashLoan(usdcAddress, USDCAmount - 1n);
        console.log(
            "USDC balance (flashloan)",
            await usdc.balanceOf(flashloan.address)
        );
    });

    // it("Swap USDC to UNI", async () => {
    //     // give some usdc to owner
    //     expect(
    //         await usdc.connect(binance).transfer(owner.address, USDCAmount)
    //     ).to.changeTokenBalances(
    //         binance,
    //         [binance, owner],
    //         [-USDCAmount, USDCAmount]
    //     );

    //     console.log("pre usdc balance", await usdc.balanceOf(owner.address));
    //     console.log("pre uni balance", await uni.balanceOf(owner.address));

    //     //approve usdc for singleswap contract
    //     await usdc.approve(singlwswap.address, USDCAmount);

    //     await singlwswap.swapExactInputSingle(USDCAmount);

    //     console.log("after usdc balance", await usdc.balanceOf(owner.address));
    //     console.log("after uni balance", await uni.balanceOf(owner.address));
    // });
});
