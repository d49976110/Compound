require("@nomiclabs/hardhat-waffle");
require("dotenv").config();

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
