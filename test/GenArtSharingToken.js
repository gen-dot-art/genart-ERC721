const { expect } = require("chai");
const BigNumber = require("bignumber.js");
BigNumber.config({ EXPONENTIAL_AT: 9999 });
const { expectError } = require("../helpers");
const { expectEvent, time } = require("@openzeppelin/test-helpers");
const { web3 } = require("hardhat");
const URI_1 = "https://localhost:8080/premium/";
const URI_2 = "https://localhost:8080/gold/";
const SCALE = new BigNumber(10).pow(18);
const NAME = "TEST";
const SYMBOL = "SYMB";
const priceStandard = new BigNumber(0.1).times(SCALE);
const priceGold = new BigNumber(0.5).times(SCALE);
let owner;
let user1;
let user2;
let user3;
let user4;
const zeroAddress = "0x0000000000000000000000000000000000000000";
let genartSharingContract;
let genartInterface;
let genartMembership;
let genartToken;
let stake;
const GenArtSharingContract = artifacts.require("GenArtSharingToken");
const GenArtMembership = artifacts.require("GenArt");
const GenArtInterface = artifacts.require("GenArtInterfaceV3");
const GenArtToken = artifacts.require("GenArtGovToken");

contract("GenArtSharingToken", function (accounts) {
  before(async () => {
    const [_owner, _user1, _user2, _user3, _user4, _user5, _user6] = accounts;
    owner = _owner;
    user1 = _user1;
    user2 = _user2;
    user3 = _user3;
    user4 = _user6;

    genartMembership = await GenArtMembership.new(
      NAME,
      SYMBOL,
      URI_1,
      URI_2,
      50,
      {
        from: owner,
      }
    );
    await genartMembership.setPaused(false, {
      from: owner,
    });
    await genartMembership.mintMany(user1, 5, {
      from: user1,
      value: priceStandard.times(5),
    });

    await genartMembership.mintGold(user1, {
      from: user1,
      value: priceGold,
    });
    await genartMembership.mint(user2, {
      from: user2,
      value: priceStandard,
    });
    await genartMembership.mintGold(user2, {
      from: user2,
      value: priceGold,
    });
    await genartMembership.mintMany(user3, 5, {
      from: user3,
      value: priceStandard.times(5),
    });
    await genartMembership.mintGold(user3, {
      from: user3,
      value: priceGold,
    });

    genartInterface = await GenArtInterface.new(genartMembership.address, {
      from: owner,
    });

    genartToken = await GenArtToken.new(owner, {
      from: owner,
    });

    genartSharingContract = await GenArtSharingContract.new(
      genartMembership.address,
      genartToken.address,
      genartInterface.address
    );

    await genartToken.transfer(user1, new BigNumber(10_000 * 1e18), {
      from: owner,
    });
    await genartToken.transfer(user2, new BigNumber(30_000 * 1e18), {
      from: owner,
    });

    stake = async (memberships, user) =>
      genartSharingContract.deposit(memberships, {
        from: user,
      });
  });

  it("Deposit user1 5 Standard memberships", async () => {
    const membershipsUser1 = await genartMembership.getTokensByOwner(user1);
    const stakingMembershipsUser1 = membershipsUser1
      .filter((m) => m.toNumber() <= 50)
      .map((m) => m.toString());

    await genartMembership.setApprovalForAll(
      genartSharingContract.address,
      true,
      { from: user1 }
    );

    await stake(stakingMembershipsUser1, user1);

    const contractMemberships = await genartMembership.getTokensByOwner(
      genartSharingContract.address
    );

    expect(contractMemberships.length).eqls(stakingMembershipsUser1.length);
  });
  it("Deposit user2 1 Gold membership", async () => {
    const memberships = await genartMembership.getTokensByOwner(user2);
    const stakingMemberships = memberships
      .filter((m) => m.toNumber() > 50)
      .map((m) => m.toString());

    await genartMembership.setApprovalForAll(
      genartSharingContract.address,
      true,
      { from: user2 }
    );

    await stake(stakingMemberships, user2);

    const contractMemberships = await genartMembership.getTokensByOwner(
      genartSharingContract.address
    );

    expect(contractMemberships.length).eqls(6);
  });

  it("Update rewards", async () => {
    const reward = new BigNumber(100 * 1e18);
    await genartToken.approve(genartSharingContract.address, reward, {
      from: owner,
    });
    await genartSharingContract.updateRewards(10, owner, reward, {
      from: owner,
    });
    const balance = await genartToken.balanceOf(genartSharingContract.address, {
      from: owner,
    });
    await time.advanceBlockTo((await web3.eth.getBlockNumber()) + 10);
    expect(balance.toString()).equals(reward.toString());
  });

  it("Throw if no permissions", async () => {
    const reward = new BigNumber(1 * 1e18);

    const tx = async () =>
      genartSharingContract.updateRewards(10, owner, reward, {
        from: user1,
      });
    const tx2 = async () =>
      genartSharingContract.emergencyWithdraw(1, {
        from: user1,
      });

    // await tx2();
    await expectError(tx, "owner", "updateReward broken");
    await expectError(tx2, "owner", "emergencyWithdraw broken");
  });

  it("harvest user1", async () => {
    const gasPrice = new BigNumber(40 * 1e9);
    const balanceOld = await genartToken.balanceOf(user1, {
      from: owner,
    });
    await genartSharingContract.harvest({
      from: user1,
      gasPrice,
    });

    const balanceNew = await genartToken.balanceOf(user1, {
      from: owner,
    });

    const _balanceOld = new BigNumber(balanceOld).div(1e18).toNumber();
    const _balanceNew = new BigNumber(balanceNew).div(1e18).toNumber();

    const diff = _balanceNew - _balanceOld;

    expect(diff.toFixed(2)).eqls("50.00");
  });
  it("harvest user2", async () => {
    const balanceOld = await genartToken.balanceOf(user2, {
      from: owner,
    });
    await genartSharingContract.harvest({
      from: user2,
    });

    const balanceNew = await genartToken.balanceOf(user2, {
      from: owner,
    });

    const _balanceOld = new BigNumber(balanceOld).div(1e18).toNumber();
    const _balanceNew = new BigNumber(balanceNew).div(1e18).toNumber();

    const diff = _balanceNew - _balanceOld;

    expect(diff.toFixed(2)).eqls("50.00");
  });

  it("Throw if 0 rewards to harvest", async () => {
    const tx = async () =>
      genartSharingContract.harvest({
        from: user3,
      });

    await expectError(tx, "zero rewards", "harvest broken");
  });
  it("Withdraw memberships", async () => {
    await genartSharingContract.withdraw({
      from: user1,
    });
    const memberships = await genartMembership.getTokensByOwner(user1);
    const membershipsStakedAfter = await genartSharingContract.getMembershipsOf(
      user1
    );
    expect(memberships.length).equals(6);
    expect(membershipsStakedAfter.length).equals(0);
  });
});
