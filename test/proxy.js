const { expect } = require("chai");
const { ethers } = require("hardhat");
const { impersonateAccount } = require("@nomicfoundation/hardhat-network-helpers");

let proxy, logic;
async function deployContracts() {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    // Dai = await ethers.getContractAt("ERC20", DaiAddress);
    // WETH = await ethers.getContractAt("ERC20", WETHAddress);
    // deploy proxy  & implementation
    let Proxy = await ethers.getContractFactory("Proxy");
    proxy = await Proxy.deploy();
    let Logic = await ethers.getContractFactory("Logic");
    logic = await Logic.deploy();
}

describe("Playground", async function () {
    before(async () => {
        await deployContracts();
    });

    it("set logic", async () => {
        proxy.setImplementation(logic.address);
    });

    it("proxy call", async () => {
        const Implementation = await ethers.getContractFactory("Logic");
        const proxyContract = await Implementation.attach(
            proxy.address // The deployed contract address
        );

        await proxyContract.setNumber(20);

        expect(await proxyContract.getNumber()).to.eq(20);
    });
});
