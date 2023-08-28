pragma solidity >= 0.8.0 ;

contract Logic {
  address public Implementation;
  address owner ; 
  uint public number ;

  function setNumber(uint _number) external {
    number = _number ;
  }

  function getNumber() external view returns(uint){
    return number;
  }
}