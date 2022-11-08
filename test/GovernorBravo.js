const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("Governor Bravo", async () => {
    let unitroller, Comptroller, comptroller;
    let timelock,
        governorBravoDelegate,
        comp,
        governorBravoDelegator,
        governorAlpha;
    let proposeId;

    //liquidate factor
    let closeFactor = BigInt(0.5 * 1e18);
    let newCloseFactor = BigInt(0.2 * 1e18);

    before(async () => {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        //create comptroller
        Comptroller = await ethers.getContractFactory("Comptroller");
        comptroller = await Comptroller.deploy();

        // proxy setting (set unitroller & comptroller)
        let Unitroller = await ethers.getContractFactory("Unitroller");
        unitroller = await Unitroller.deploy();

        await unitroller._setPendingImplementation(comptroller.address);
        await unitroller._acceptImplementation();

        await comptroller._become(unitroller.address);

        comptroller = await Comptroller.attach(unitroller.address); // comptroller is a proxy => using unitroller address but use comptroller abi
    });

    describe("Settings", async () => {
        it(" set close factor", async () => {
            // set close factor
            await comptroller._setCloseFactor(closeFactor);
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
    });
    describe("Use governorBravo to set comptroller close factor", async () => {
        it("delegate comp vote", async () => {
            // comp delegate before cast vote
            await comp.delegate(owner.address);
        });

        it("set owner to white list", async () => {
            let time = (await helpers.time.latest()) + 86400;
            await governorBravoDelegator._setWhitelistAccountExpiration(
                owner.address,
                time
            );
            expect(
                await governorBravoDelegator.isWhitelisted(owner.address)
            ).to.eq(true);
        });

        it("propose", async () => {
            //propose
            let data = ethers.utils.defaultAbiCoder.encode(
                ["uint256"],
                [newCloseFactor]
            );

            await governorBravoDelegator.propose(
                [comptroller.address],
                [0],
                ["_setCloseFactor(uint256)"],
                [data],
                "change close factor"
            );
        });
        it("cast vote", async () => {
            proposeId = await governorBravoDelegator.proposalCount();

            // add block
            let latestBlock = await helpers.time.latestBlock();
            await helpers.mineUpTo(latestBlock + 1);

            //cast vote
            await governorBravoDelegator.castVote(proposeId, 1);
        });

        it("queue", async () => {
            // increase to proposal endtime
            latestBlock = await helpers.time.latestBlock();
            await helpers.mineUpTo(latestBlock + 5761);

            // queue
            await governorBravoDelegator.queue(proposeId);
        });
        it("execute", async () => {
            // add more 3 days,because timelock delay is 3 days
            await helpers.time.increase(300000);
            // execute
            await governorBravoDelegator.execute(proposeId);

            expect(await comptroller.closeFactorMantissa()).to.eq(
                newCloseFactor
            );
        });
    });
});
