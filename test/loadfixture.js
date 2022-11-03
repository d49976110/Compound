const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

describe("Token contract", function () {
    async function deployTokenFixture() {
        const Token = await ethers.getContractFactory("ERC20_custom");
        const [owner, addr1, addr2] = await ethers.getSigners();

        const hardhatToken = await Token.deploy("123", "123");

        await hardhatToken.deployed();

        // mint
        await hardhatToken.mint(BigInt(1000n * 10n ** 18n));

        // Fixtures can return anything you consider useful for your tests
        return { Token, hardhatToken, owner, addr1, addr2 };
    }

    it("Should assign the total supply of tokens to the owner", async function () {
        const { hardhatToken, owner, addr1 } = await loadFixture(
            deployTokenFixture
        );

        const ownerBalance = await hardhatToken.balanceOf(owner.address);
        expect(await hardhatToken.totalSupply()).to.equal(ownerBalance);
        console.log("pre balance", await hardhatToken.balanceOf(owner.address));
        expect(
            await hardhatToken.transfer(addr1.address, 50)
        ).to.changeTokenBalances(hardhatToken, [owner, addr1], [-50, 50]);
        console.log("balance", await hardhatToken.balanceOf(owner.address));
    });

    it("Should transfer tokens between accounts", async function () {
        const { hardhatToken, owner, addr1, addr2 } = await loadFixture(
            deployTokenFixture
        );

        console.log(
            "next balance",
            await hardhatToken.balanceOf(owner.address)
        );

        expect(
            await hardhatToken.transfer(addr2.address, 50)
        ).to.changeTokenBalances(hardhatToken, [owner, addr2], [-50, 50]);
    });
});
