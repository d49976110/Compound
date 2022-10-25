const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("CErc20", async () => {
    let erc20, cerc20, comptroller, interestRate;
    it("deploy comptroller contract", async () => {
        let Erc20 = await ethers.getContractFactory("ERC20");
        erc20 = await Erc20.deploy("Wrap ETH", "WETH");
        console.log("Erc20 address: ", erc20.address);
    });
    it("deploy interest rate contract", async () => {
        let InterestRate = await ethers.getContractFactory("InterestRate");
        interestRate = await InterestRate.deploy();
        console.log("Interest address: ", interestRate.address);
    });

    it("deploy comptroller contract", async () => {
        let Comptroller = await ethers.getContractFactory("Comptroller");
        comptroller = await Comptroller.deploy();
        console.log("Comptroller address: ", comptroller.address);
    });

    it("deploy CErc20", async function () {
        let CERC20 = await ethers.getContractFactory("CErc20");
        cerc20 = await CERC20.deploy();
        console.log("CErc20: ", cerc20.address);
    });

    it("init", async () => {
        await cerc20.initialize(
            erc20.address,
            comptroller.address,
            interestRate.address,
            100,
            "Compound ETH",
            "CWETH",
            18
        );
        console.log("CErc20: ", await cerc20.admin());
        await cerc20.mint(100);
    });
});
