// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.10;
pragma experimental ABIEncoderV2;

import "hardhat/console.sol";

/**
 * @title The Open Oracle Data Base Contract
 * @author Compound Labs, Inc.
 */
contract OpenOracleData {
    /**
     * @notice The event emitted when a source writes to its storage
     */
    //event Write(address indexed source, <Key> indexed key, string kind, uint64 timestamp, <Value> value);

    /**
     * @notice Write a bunch of signed datum to the authenticated storage mapping
     * @param message The payload containing the timestamp, and (key, value) pairs
     * @param signature The cryptographic signature of the message payload, authorizing the source to write
     * @return The keys that were written
     */
    //function put(bytes calldata message, bytes calldata signature) external returns (<Key> memory);

    /**
     * @notice Read a single key with a pre-defined type signature from an authenticated source
     * @param source The verifiable author of the data
     * @param key The selector for the value to return
     * @return The claimed Unix timestamp for the data and the encoded value (defaults to (0, 0x))
     */
    //function get(address source, <Key> key) external view returns (uint, <Value>);

    /**
     * @notice Recovers the source address which signed a message
     * @dev Comparing to a claimed address would add nothing,
     *  as the caller could simply perform the recover and claim that address.
     * @param message The data that was presumably signed
     * @param signature The fingerprint of the data + private key
     * @return The source address which signed the message, presumably
     */
    function source(bytes memory message, bytes memory signature)
        public
        returns (address)
    {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        // (bytes32 r, bytes32 s, uint8 v) = abi.decode(
        //     signature,
        //     (bytes32, bytes32, uint8)
        // );

        bytes32 hash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(message)
            )
        );
        return ecrecover(hash, v, r, s);
    }

    function splitSignature(bytes memory sig)
        public
        view
        returns (
            bytes32 r,
            bytes32 s,
            uint8 v
        )
    {
        require(sig.length == 65, "invalid signature length");

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}
