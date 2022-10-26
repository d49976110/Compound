const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("CErc20", async () => {
    let erc20, cerc20, comptroller, interestRateModel, oracle;

    let supplyAmount = BigInt(100 * 1e18);

    let decimals = 18;
    let name = "Compound ETH";
    let symbol = "CWETH";
    // change rate = 1:1
    let changeRate = BigInt(1 * 1e18);
    let underlyingPrice = 100;
    let collateralFactor = BigInt(0.9 * 1e18);

    before(async () => {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        let Erc20 = await ethers.getContractFactory("WETH");
        erc20 = await Erc20.deploy();

        let InterestRateModel = await ethers.getContractFactory("InterestRate");
        interestRateModel = await InterestRateModel.deploy();

        let Comptroller = await ethers.getContractFactory("Comptroller");
        comptroller = await Comptroller.deploy();

        let Oracle = await ethers.getContractFactory("SimplePriceOracle");
        oracle = await Oracle.deploy();
    });

    it("deploy CErc20", async function () {
        let CERC20 = await ethers.getContractFactory("CErc20Immutable");
        cerc20 = await CERC20.deploy(
            erc20.address,
            comptroller.address,
            interestRateModel.address,
            changeRate,
            name,
            symbol,
            decimals,
            owner.address
        );
    });

    it("ERC20 & CERC20 decimals should be 18", async () => {
        expect(await erc20.decimals()).to.eq(decimals);
        expect(await cerc20.decimals()).to.eq(decimals);
    });

    it("set oracle & comptroller", async () => {
        //set oracle first or comptroller._setCollateralFactor will revert
        await oracle.setUnderlyingPrice(cerc20.address, underlyingPrice);
        //support market
        await comptroller._supportMarket(cerc20.address);
        //set oracle
        await comptroller._setPriceOracle(oracle.address);
        //set collateral
        await comptroller._setCollateralFactor(cerc20.address, collateralFactor);
    });

    it("mint & approve ERC20", async () => {
        //mint
        await erc20.mint(supplyAmount);
        //approve
        await erc20.approve(cerc20.address, supplyAmount);
        //enterMarkets
        await comptroller.enterMarkets([cerc20.address]);

        //mint
        await erc20.connect(addr1).mint(supplyAmount);
        //approve
        await erc20.connect(addr1).approve(cerc20.address, supplyAmount);
        //enterMarkets
        await comptroller.connect(addr1).enterMarkets([cerc20.address]);

        // expect(await comptroller.getAssetsIn(addr1.address)).to.eq(cerc20.address);
    });

    it("mint CErc20", async () => {
        await cerc20.mint(supplyAmount);
        expect(await cerc20.balanceOf(owner.address)).to.eq(supplyAmount);

        await cerc20.connect(addr1).mint(supplyAmount);
        expect(await cerc20.balanceOf(addr1.address)).to.eq(supplyAmount);
    });

    it("redeem Erc20", async () => {
        await cerc20.redeem(supplyAmount);
        console.log("erc20 balance", await erc20.balanceOf(owner.address));

        expect(await cerc20.balanceOf(owner.address)).to.eq(0);
    });
});
