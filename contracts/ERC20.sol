pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20_custom is ERC20 {
  constructor(string memory _name,string memory _symbol)ERC20(_name,_symbol){}
  function mint(uint _amount) external{
    _mint(msg.sender,_amount);
  }
}