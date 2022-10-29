require("@nomiclabs/hardhat-waffle");

module.exports = {
    solidity: "0.8.10",
    networks: {
        hardhat: {
            forking: {
                url: "https://eth-mainnet.g.alchemy.com/v2/s1C_L3WC9LFq5V0zZ_q9LB_jxFbMQNrN",
                blockNumber: 15823148,
            },
            allowUnlimitedContractSize: true,
        },
    },
};
