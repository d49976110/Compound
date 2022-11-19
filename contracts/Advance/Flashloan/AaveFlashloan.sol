// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../../interfaces/Uniswapv3/ISwapRouter.sol";
import "../../interfaces/Uniswapv3/IQuoter.sol";
import "../../interfaces/AAVE/FlashLoanReceiverBase.sol";
import "../../CErc20.sol";
import "hardhat/console.sol";

contract AaveFlashLoan is FlashLoanReceiverBase {
    using SafeMath for uint256;

    //admin
    address public admin;

    // Uniswap
    ISwapRouter public immutable swapRouter;
    IQuoter public immutable quoter =
        IQuoter(0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6);
    CErc20 public immutable cUSDC;
    CErc20 public immutable cUNI;
    address public borrower;
    uint256 public repayAmount;

    address public constant UNI = 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    uint24 public constant UNI_POOLFEE = 3000;

    //params
    struct MyStruct {
        address _address;
        uint256 _number;
    }

    event Log(string message, uint256 val);

    modifier onlyAdmin() {
        require(msg.sender == admin);
        _;
    }

    constructor(
        ILendingPoolAddressesProvider _addressProvider,
        ISwapRouter _swapRouter,
        CErc20 _cUSDC,
        CErc20 _cUNI,
        address _borrower,
        uint256 _repayAmount
    ) FlashLoanReceiverBase(_addressProvider) {
        swapRouter = ISwapRouter(_swapRouter);
        cUSDC = CErc20(_cUSDC);
        cUNI = CErc20(_cUNI);
        borrower = _borrower;
        repayAmount = _repayAmount;

        admin = msg.sender;
    }

    ///@param asset ERC20 token address
    ///@param amount loan amount
    function flashLoan(address asset, uint256 amount) external onlyAdmin {
        address receiver = address(this);

        address[] memory assets = new address[](1);
        assets[0] = asset;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        // 0 = no debt, 1 = stable, 2 = variable
        // 0 = pay all loaned
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;

        address onBehalfOf = address(this);

        MyStruct memory mystruct = MyStruct(msg.sender, 123);
        //Practice : let params become function selector
        bytes memory params = abi.encode(mystruct);

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

    /// @param initiator this contract address
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == address(LENDING_POOL), "Not Lending Pool");
        require(initiator == address(this), "Initiator Invalid");
        // approve cUSDC to use addr1 USDC
        IERC20(USDC).approve(address(cUSDC), repayAmount);

        // use USDC to liquidate
        cUSDC.liquidateBorrow(borrower, repayAmount, cUNI);

        // redeem from cUNI to UNI
        cUNI.redeem(cUNI.balanceOf(address(this)));

        uint256 uniBalance = IERC20(UNI).balanceOf(address(this));

        // swap from UNI to USDC
        // approve this address for uniswap using UNI
        IERC20(UNI).approve(address(swapRouter), uniBalance);

        {
            uint256 tempUniBalance = uniBalance;
            uint256 expectAmountOutUSDC = quoter.quoteExactInputSingle(
                UNI,
                USDC,
                UNI_POOLFEE,
                tempUniBalance,
                0
            );

            console.log("expect amount out USDC:", expectAmountOutUSDC);
        }
        // exchange from UNI to USDC
        ISwapRouter.ExactInputSingleParams memory uniswapParams = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: UNI,
                tokenOut: USDC,
                fee: UNI_POOLFEE,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: uniBalance,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        uint256 amountOutUSDC = swapRouter.exactInputSingle(uniswapParams);
        console.log("real amount out USDC", amountOutUSDC);

        //Practice decode
        {
            MyStruct memory mystruct = abi.decode(params, (MyStruct));
            assert(mystruct._address == tx.origin);
            assert(mystruct._number == 123);
        }

        // becasue we set asset array only 1
        uint256 amountOwing = amounts[0].add(premiums[0]);
        IERC20(assets[0]).approve(address(LENDING_POOL), amountOwing);

        uint256 leftBalance = amountOutUSDC - amountOwing;
        bytes memory callData = abi.encodeWithSelector(
            bytes4(params),
            admin,
            leftBalance
        );

        // send back to user
        IERC20(assets[0]).transfer(admin, leftBalance);

        return true;
    }
}
