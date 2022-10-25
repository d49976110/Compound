pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WETH is ERC20("WETH","WETH") {
  function mint(uint _amount) external{
    _mint(msg.sender,_amount);
  }
}