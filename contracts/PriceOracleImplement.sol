// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "./PriceOracle.sol";

contract PirceOracleImplement is PriceOracle{
  function getUnderlyingPrice(CToken cToken) override external view returns (uint){
    return 100;
  }
}