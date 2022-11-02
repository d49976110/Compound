const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("Compound Testcase", async () => {
    let cerc20, tokenA, tokenB, cTokenA, cTokenB;
    let unitroller, Comptroller, comptroller, interestRateModel, oracle;
    let timelock,
        governorBravoDelegate,
        comp,
        governorBravoDelegator,
        governorAlpha;

    //liquidate factor
    let closeFactor = BigInt(0.5 * 1e18);
    let liquidationIncentive = BigInt(1.08 * 1e18);

    before(async () => {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        // create tokenA
        let Erc20 = await ethers.getContractFactory("ERC20_custom");
        tokenA = await Erc20.deploy("TokenA", "TOA");

        // create interest model
        // let InterestRateModel = await ethers.getContractFactory(
        //     "WhitePaperInterestRateModel"
        // );
        // interestRateModel = await InterestRateModel.deploy(0, 0);

        //create comptroller
        Comptroller = await ethers.getContractFactory("Comptroller");
        comptroller = await Comptroller.deploy();

        //create oracel
        let Oracle = await ethers.getContractFactory("SimplePriceOracle");
        oracle = await Oracle.deploy();

        // proxy setting (set unitroller & comptroller)
        let Unitroller = await ethers.getContractFactory("Unitroller");
        unitroller = await Unitroller.deploy();

        await unitroller._setPendingImplementation(comptroller.address);
        await unitroller._acceptImplementation();

        await comptroller._become(unitroller.address);

        comptroller = await Comptroller.attach(unitroller.address); // comptroller is a proxy => using unitroller address but use comptroller abi

        // create cTokenA & cTokenB
        // let CERC20 = await ethers.getContractFactory("CErc20Delegate"); // logic implementation
        // cerc20 = await CERC20.deploy();
        // let delegator = await ethers.getContractFactory("CErc20Delegator"); // proxy contract
        // cTokenA = await delegator.deploy(
        //     tokenA.address,
        //     comptroller.address,
        //     interestRateModel.address,
        //     changeRateA,
        //     nameA,
        //     symbolA,
        //     decimals,
        //     owner.address,
        //     cerc20.address,
        //     "0x"
        // );
    });

    describe("Settings", async () => {
        it("admin set oracle & comptroller", async () => {
            // set close factor
            await comptroller._setCloseFactor(closeFactor);
            // set liquidation incentive
            await comptroller._setLiquidationIncentive(liquidationIncentive);
        });

        it("deploy contracts", async () => {
            //timelock
            let Timelock = await ethers.getContractFactory("Timelock");
            timelock = await Timelock.deploy(owner.address, 259200); // 3 days

            //governorBravo
            let GovernorBravoDelegate = await ethers.getContractFactory(
                "GovernorBravoDelegate"
            );
            governorBravoDelegate = await GovernorBravoDelegate.deploy();

            //Comp
            let Comp = await ethers.getContractFactory("Comp");
            comp = await Comp.deploy(owner.address);

            //governorBravo delegator
            let GovernorBravoDelegator = await ethers.getContractFactory(
                "GovernorBravoDelegator"
            );

            let GovernorAlpha = await ethers.getContractFactory(
                "GovernorAlpha1"
            );
            governorAlpha = await GovernorAlpha.deploy(
                timelock.address,
                comp.address,
                owner.address
            );

            governorBravoDelegator = await GovernorBravoDelegator.deploy(
                timelock.address,
                comp.address,
                owner.address,
                governorBravoDelegate.address,
                5760,
                1,
                1000n * 10n ** 18n // 1000 comp token
            );

            // attach
            governorBravoDelegator = GovernorBravoDelegate.attach(
                governorBravoDelegator.address
            );
        });

        it("set unitroller admin to be timelock", async () => {
            let delay = await timelock.delay();
            let now = await helpers.time.latest();
            let eta = now + delay.toNumber() + 2;
            // need to use unitroller , because comptroller don't have setPendingAdmin function
            await unitroller._setPendingAdmin(timelock.address);

            // time lock accept unitroller admin
            await timelock.queueTransaction(
                comptroller.address,
                0,
                "_acceptAdmin()",
                "0x",
                eta
            );

            await helpers.time.increaseTo(eta);

            await timelock.executeTransaction(
                comptroller.address,
                0,
                "_acceptAdmin()",
                "0x",
                eta
            );
        });

        it("set timelock admin as bravo", async () => {
            let data = ethers.utils.defaultAbiCoder.encode(
                ["address"],
                [governorBravoDelegator.address]
            );
            let delay = await timelock.delay();
            let now = await helpers.time.latest();
            let eta = now + delay.toNumber() + 2;

            await timelock.queueTransaction(
                timelock.address,
                0,
                "setPendingAdmin(address)",
                data,
                eta
            );

            await helpers.time.increaseTo(eta);

            await timelock.executeTransaction(
                timelock.address,
                0,
                "setPendingAdmin(address)",
                data,
                eta
            );

            // bravo accept
            await governorBravoDelegator._initiate(governorAlpha.address);

            expect(await timelock.admin()).to.eq(
                governorBravoDelegator.address
            );
        });

        it("set unitroller close factor", async () => {
            // comp delegate before cast vote
            await comp.delegate(owner.address);

            // set bravo white list
            let time = (await helpers.time.latest()) + 86400;
            await governorBravoDelegator._setWhitelistAccountExpiration(
                owner.address,
                time
            );
            expect(
                await governorBravoDelegator.isWhitelisted(owner.address)
            ).to.eq(true);

            //propose
            let data = ethers.utils.defaultAbiCoder.encode(
                ["uint256"],
                [BigInt(0.2 * 1e18)]
            );

            await governorBravoDelegator.propose(
                [comptroller.address],
                [0],
                ["_setCloseFactor(uint256)"],
                [data],
                "change close factor"
            );

            let proposeId = await governorBravoDelegator.proposalCount();

            // add block
            let latestBlock = await helpers.time.latestBlock();
            await helpers.mineUpTo(latestBlock + 1);

            //cast vote
            await governorBravoDelegator.castVote(proposeId, 1);

            // increase to proposal endtime
            latestBlock = await helpers.time.latestBlock();
            await helpers.mineUpTo(latestBlock + 5761);

            // queue
            await governorBravoDelegator.queue(proposeId);

            // add more 3 days,because timelock delay is 3 days
            await helpers.time.increase(300000);
            // execute
            await governorBravoDelegator.execute(proposeId);
        });
    });
});
