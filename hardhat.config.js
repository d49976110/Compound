require("@nomiclabs/hardhat-waffle");
require("dotenv").config();

module.exports = {
    solidity: "0.8.10",
    networks: {
        hardhat: {
            forking: {
                url: process.env.JSON_RPC_URL,
                blockNumber: 15823148,
            },
            allowUnlimitedContractSize: true,
        },
    },
};
