// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "./InterestRateModel.sol";

contract InterestRate is InterestRateModel{

  function getBorrowRate(uint cash, uint borrows, uint reserves) override external view returns (uint){
    return 0;
  }

  function getSupplyRate(uint cash, uint borrows, uint reserves, uint reserveFactorMantissa) override external view returns (uint){
    return 1*10**18;
  }
}