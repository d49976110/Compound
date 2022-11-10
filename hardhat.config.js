require("@nomiclabs/hardhat-waffle");
require("dotenv").config();

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
    const accounts = await hre.ethers.getSigners();

    for (const account of accounts) {
        console.log(account.address);
    }
});

module.exports = {
    // solidity: "0.8.10",
    solidity: {
        compilers: [
            {
                version: "0.8.10",
            },
            {
                version: "0.6.12",
            },
        ],
    },
    networks: {
        hardhat: {
            forking: {
                url: process.env.JSON_RPC_URL,
                blockNumber: 15815693,
            },
            allowUnlimitedContractSize: true,
        },
    },
};
