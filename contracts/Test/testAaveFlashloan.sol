// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

// import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../interfaces/AAVE/FlashLoanReceiverBase.sol";
import "./testUniswapSingleSwap.sol";
import "hardhat/console.sol";

contract TestAaveFlashLoan is FlashLoanReceiverBase {
  using SafeMath for uint;
  TestSingleSwap singleSwap;

  address public constant UNI = 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984;
  address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

  event Log(string message, uint val);

  constructor(ILendingPoolAddressesProvider _addressProvider,TestSingleSwap _addressSingleSwap)
    FlashLoanReceiverBase(_addressProvider)
  {
    singleSwap = TestSingleSwap(_addressSingleSwap);
  }
  
  ///@param asset ERC20 token address
  ///@param amount loan amount
  function testFlashLoan(address asset, uint amount) external {
    uint bal = IERC20(asset).balanceOf(address(this));
    require(bal > amount, "bal <= amount");

    address receiver = address(this);

    address[] memory assets = new address[](1);
    assets[0] = asset;

    uint[] memory amounts = new uint[](1);
    amounts[0] = amount;

    // 0 = no debt, 1 = stable, 2 = variable
    // 0 = pay all loaned
    uint[] memory modes = new uint[](1);
    modes[0] = 0;

    address onBehalfOf = address(this);

    bytes memory params = ""; // extra data to pass abi.encode(...)
    uint16 referralCode = 0;

    LENDING_POOL.flashLoan(
      receiver,
      assets,
      amounts,
      modes,
      onBehalfOf,
      params,
      referralCode
    );
  }

  function executeOperation(
    address[] calldata assets,
    uint[] calldata amounts,
    uint[] calldata premiums,
    address initiator,
    bytes calldata params
  ) external override returns (bool) {
    // do stuff here (arbitrage, liquidation, etc...)



    // abi.decode(params) to decode params
    for (uint i = 0; i < assets.length; i++) {
      emit Log("borrowed", amounts[i]);
      emit Log("fee", premiums[i]);

      //歸還數量需要加上手續費，AAVE手續費為萬分之9
      uint amountOwing = amounts[i].add(premiums[i]);
      console.log("before swap USDC",amounts[i]);

      // approve uniswap for USDC
      IERC20(assets[i]).approve(address(singleSwap),amounts[i]);
      // exchange
      uint amountOut = singleSwap.swapExactInputSingle_USDC(amounts[i]);

      // approve uniswap for UNI
      IERC20(UNI).approve(address(singleSwap),amountOut);
      uint amountUSDC = singleSwap.swapExactInputSingle_UNI(amountOut);
      console.log("after swap USDC",amountUSDC);
      
      IERC20(assets[i]).approve(address(LENDING_POOL), amountOwing);
    }
    // repay Aave
    return true;
  }
}
