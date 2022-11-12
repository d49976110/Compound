// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.6.10;

import "hardhat/console.sol";

contract SimpleSign {
    bytes32 public data;

    function getMessageHash() external returns (bytes32) {
        data = keccak256(
            abi.encodePacked("kind", uint64(1), "key", uint64(100))
        );
        return data;
    }

    function getAddress(bytes memory message, bytes memory signature)
        public
        view
        returns (address)
    {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        bytes32 hash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", message)
        );
        return ecrecover(hash, v, r, s);
    }

    function splitSignature(bytes memory sig)
        public
        pure
        returns (
            bytes32 r,
            bytes32 s,
            uint8 v
        )
    {
        require(sig.length == 65, "invalid signature length");

        assembly {
            /*
            First 32 bytes stores the length of the signature

            add(sig, 32) = pointer of sig + 32
            effectively, skips first 32 bytes of signature

            mload(p) loads next 32 bytes starting at the memory address p into memory
            */

            // first 32 bytes, after the length prefix
            r := mload(add(sig, 32))
            // second 32 bytes
            s := mload(add(sig, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(sig, 96)))
        }

        // implicitly return (r, s, v)
    }
}
