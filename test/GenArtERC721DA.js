const { expect } = require("chai");
const BigNumber = require("bignumber.js");
BigNumber.config({ EXPONENTIAL_AT: 9999 });
const { expectError } = require("../helpers");
const { expectEvent, time } = require("@openzeppelin/test-helpers");
const { web3 } = require("hardhat");
const URI_1 = "https://localhost:8080/premium/";
const URI_2 = "https://localhost:8080/gold/";
const COLLECTION_URI = "https://localhost:8080/metadata/";
const COLLECTION_ID = "20000";
const SCALE = new BigNumber(10).pow(18);
const NAME = "TEST";
const SYMBOL = "SYMB";
const priceStandard = new BigNumber(0.1).times(SCALE);
const priceGold = new BigNumber(0.5).times(SCALE);
const MINT_PRICE = new BigNumber(1).times(SCALE);
const COLLECTION_SIZE = 10;
let artist;
let owner;
let user1;
let user2;
let user3;
let genartAdminAddress;
let user4;
let startBlock;
const zeroAddress = "0x0000000000000000000000000000000000000000";
let genartERC721Contract;
let genartDA;
let genartInterface;
let genartMembership;
let genartToken;
let genartSharing;
let genartDARefund;

const GenArtERC721Contract = artifacts.require("GenArtERC721DA");
const GenArtMembership = artifacts.require("GenArt");
const GenArtInterface = artifacts.require("GenArtInterfaceV4");
const GenArtToken = artifacts.require("GenArtGovToken");
const GenArtDA = artifacts.require("GenArtDutchAuctionHouse");
const GenArtSharing = artifacts.require("GenArtSharing");
const GenArtDARefund = artifacts.require("GenArtDARefund");

contract("GenArtERC721DA", function (accounts) {
  before(async () => {
    const [_owner, _user1, _user2, _user3, _user4, _user5, _user6] = accounts;
    owner = _owner;
    user1 = _user1;
    user2 = _user2;
    user3 = _user3;
    user4 = _user6;
    artist = _user4;
    genartAdminAddress = user4;

    genartMembership = await GenArtMembership.new(
      NAME,
      SYMBOL,
      URI_1,
      URI_2,
      10,
      {
        from: owner,
      }
    );
    await genartMembership.setPaused(false, {
      from: owner,
    });
    await genartMembership.mint(user1, {
      from: user1,
      value: priceStandard,
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
    await genartMembership.mintGold(user2, {
      from: user2,
      value: priceGold,
    });
    await genartMembership.mintGold(user2, {
      from: user2,
      value: priceGold,
    });
    genartToken = await GenArtToken.new(owner);

    genartDA = await GenArtDA.new();

    genartDARefund = await GenArtDARefund.new(genartDA.address);

    genartInterface = await GenArtInterface.new(
      genartMembership.address,
      genartDA.address
    );
    genartSharing = await GenArtSharing.new(
      genartMembership.address,
      genartToken.address,
      genartInterface.address,
      genartDA.address
    );
    await genartDA.setInterface(genartInterface.address);
    await genartDA.setPayoutAddress(0, genartAdminAddress);
    await genartDA.setPayoutAddress(1, genartSharing.address);
    await genartDA.setPayoutAddress(2, genartDARefund.address);

    genartERC721Contract = await GenArtERC721Contract.new(
      NAME,
      SYMBOL,
      COLLECTION_URI,
      "SCRIPT",
      COLLECTION_ID,
      COLLECTION_SIZE,
      genartInterface.address,
      genartToken.address,
      genartDA.address
    );
    startBlock = (await web3.eth.getBlockNumber()) + 1;
    await genartDA.addAuction(
      genartERC721Contract.address,
      artist,
      COLLECTION_SIZE,
      MINT_PRICE,
      startBlock
    );
  });

  it("Should fail on paused mint and unpause", async () => {
    const tx = () => genartERC721Contract.mint(user1, 1);
    await expectError(tx, "minting is paused", "pausing mint is broken");
    await genartERC721Contract.setPaused(false, { from: owner });
  });
  it("Should mint owner reserved", async () => {
    expect((await genartERC721Contract.balanceOf(owner)).toString()).equal("1");
  });
  it("Should fail if not GEN.ART member", async () => {
    const tx = () =>
      genartERC721Contract.mint(user4, "1", {
        from: user4,
        value: MINT_PRICE,
      });
    const tx2 = () =>
      genartERC721Contract.mintOne(user4, "1", {
        from: user4,
        value: MINT_PRICE.times(2),
      });
    await expectError(tx, "no mints", "minting access broken");
    await expectError(tx2, "not membership owner", "minting access broken");
  });
  it("Throw on wrong price", async () => {
    const tx = async () =>
      genartERC721Contract.mintOne(user1, "1", {
        from: user1,
        value: MINT_PRICE.times(0.99),
      });

    await expectError(tx, "wrong amount", "mint broken");
  });

  it("Should mint for Standard GEN.ART member in phase 1", async () => {
    const tx = async () =>
      genartERC721Contract.mintOne(user1, "1", {
        from: user1,
        value: MINT_PRICE,
      });
    expectEvent(await tx(), "Mint", {
      to: user1,
      membershipId: "1",
      collectionId: COLLECTION_ID,
      tokenId: "2000000002",
    });

    await expectError(tx, "no mints", "mint state broken");
  });
  it("Should mint for Gold GEN.ART member in phase 1", async () => {
    expect(
      (await genartDA.getAuctionPhase(genartERC721Contract.address)).toString()
    ).equals("1");
    const tx = async () =>
      genartERC721Contract.mint(user1, 3, {
        from: user1,
        value: MINT_PRICE.times(3),
      });
    const txErr = async () =>
      genartERC721Contract.mint(user1, 3, {
        from: user1,
        value: MINT_PRICE.times(3).times(1.1),
      });
    await expectError(txErr, "wrong amount", "mint state broken");

    const tx1 = await tx();
    expectEvent(tx1, "Mint", {
      to: user1,
      membershipId: "11",
      collectionId: COLLECTION_ID,
      tokenId: "2000000003",
    });
    expectEvent(tx1, "Mint", {
      to: user1,
      membershipId: "11",
      collectionId: COLLECTION_ID,
      tokenId: "2000000004",
    });
    expectEvent(tx1, "Mint", {
      to: user1,
      membershipId: "11",
      collectionId: COLLECTION_ID,
      tokenId: "2000000005",
    });

    await expectError(tx, "no mints", "mint state broken");
  });
  it("Should mint for Standard GEN.ART member in phase 2", async () => {
    // console.log(
    //   "price",
    //   (await genartDA.getAuctionPrice(genartERC721Contract.address)).toString()
    // );
    await time.advanceBlockTo(startBlock + 12);

    expect(
      (await genartDA.getAuctionPhase(genartERC721Contract.address)).toString()
    ).equals("2");

    const tx = async (price) =>
      genartERC721Contract.mintOne(user1, "1", {
        from: user1,
        value: price,
      });

    await expectError(
      async () => tx(MINT_PRICE.times(0.79)),
      "wrong amount",
      "mint broken"
    );

    expectEvent(await tx(MINT_PRICE.times(0.8)), "Mint", {
      to: user1,
      membershipId: "1",
      collectionId: COLLECTION_ID,
      tokenId: "2000000006",
    });
  });
  it("Should mint for Gold GEN.ART member in phase 2", async () => {
    const tx = async () =>
      genartERC721Contract.mintOne(user1, "11", {
        from: user1,
        value: MINT_PRICE.times(0.8),
      });
    const tx1 = await tx();
    expectEvent(tx1, "Mint", {
      to: user1,
      membershipId: "11",
      collectionId: COLLECTION_ID,
      tokenId: "2000000007",
    });

    const availableMints =
      await genartERC721Contract.getAvailableMintsForMembership("11");

    expect(availableMints.toString()).equals("0");
    await expectError(tx, "no mints", "mint state broken");
  });
  it("Should mint for Gold GEN.ART member in phase 3", async () => {
    await time.advanceBlockTo(startBlock + 12 * 2);
    expect(
      (await genartDA.getAuctionPhase(genartERC721Contract.address)).toString()
    ).equals("3");

    const tx = async () =>
      genartERC721Contract.mintOne(user1, "11", {
        from: user1,
        value: new BigNumber(
          await genartDA.getAuctionPrice(genartERC721Contract.address)
        ).times(1),
      });
    const tx1 = await tx();
    expectEvent(tx1, "Mint", {
      to: user1,
      membershipId: "11",
      collectionId: COLLECTION_ID,
      tokenId: "2000000008",
    });

    const availableMints =
      await genartERC721Contract.getAvailableMintsForMembership("11");

    expect(availableMints.toString()).equals("0");
    await expectError(tx, "no mints", "mint state broken");
  });
  it("Should mint for Gold GEN.ART member in phase 4", async () => {
    await time.advanceBlockTo((await web3.eth.getBlockNumber()) + 12);
    expect(
      (await genartDA.getAuctionPhase(genartERC721Contract.address)).toString()
    ).equals("4");
    const tx = async () =>
      genartERC721Contract.mintOne(user1, "11", {
        from: user1,
        value: new BigNumber(
          await genartDA.getAuctionPrice(genartERC721Contract.address)
        ).times(1),
      });
    const tx1 = await tx();
    expectEvent(tx1, "Mint", {
      to: user1,
      membershipId: "11",
      collectionId: COLLECTION_ID,
      tokenId: "2000000009",
    });

    const availableMints =
      await genartERC721Contract.getAvailableMintsForMembership("11");

    expect(availableMints.toString()).equals("0");
    await expectError(tx, "no mints", "mint state broken");
  });
  it("Throw if no mint Standard member", async () => {
    await time.advanceBlockTo((await web3.eth.getBlockNumber()) + 12);
    const tx = async (price) =>
      genartERC721Contract.mintOne(user1, "1", {
        from: user1,
        value: price,
      });

    await expectError(
      async () =>
        tx(
          new BigNumber(
            await genartDA.getAuctionPrice(genartERC721Contract.address)
          ).times(1)
        ),
      "no mints",
      "mint state broken"
    );
  });

  it("Public mint", async () => {
    const tx = async () =>
      genartERC721Contract.mintPublic(user4, 1, {
        from: user4,
        value: new BigNumber(
          await genartDA.getAuctionPrice(genartERC721Contract.address)
        ).times(1),
      });

    await expectError(tx, "not allowed to mint", "public minting broken");

    await time.advanceBlockTo(startBlock + 72);

    const tx1 = await genartERC721Contract.mintPublic(user4, 1, {
      from: user4,
      value: new BigNumber(
        await genartDA.calcAvgPrice(genartERC721Contract.address)
      ).times(1),
    });
    expectEvent(tx1, "Mint", {
      to: user4,
      membershipId: "0",
      collectionId: COLLECTION_ID,
      tokenId: "2000000010",
    });
  });
  it("Should fail on sell out", async () => {
    const tx = async () =>
      genartERC721Contract.mintOne(user2, "12", {
        value: new BigNumber(
          await genartDA.getAuctionPrice(genartERC721Contract.address)
        ).times(1),
        from: user2,
      });
    await expectError(tx, "no mints available", "minting access broken");
  });

  it("Distribute and withdraw artist funds", async () => {
    const gasPrice = new BigNumber(40 * 1e9);

    const failTx = () =>
      genartDA.withdrawArtist(genartERC721Contract.address, {
        from: user1,
      });

    await expectError(failTx, "only artist", "withdrawArtist broken");

    const balanceOld = await web3.eth.getBalance(artist);

    const withdraw = async () =>
      genartDA.withdrawArtist(genartERC721Contract.address, {
        from: artist,
        gasPrice,
      });

    await expectError(withdraw, "auction not ended", "withdrawArtist broken");

    await time.advanceBlockTo(startBlock + 337);

    const tx = await withdraw();
    const funds = new BigNumber(
      await genartDA._auctionFunds(genartERC721Contract.address)
    );
    const avgActual = new BigNumber(
      await genartDA.calcAvgPrice(genartERC721Contract.address)
    );
    const avg = funds.div(COLLECTION_SIZE - 1).integerValue();
    const balanceNew = await web3.eth.getBalance(artist);

    const _balanceOld = new BigNumber(balanceOld).div(1e18).toNumber();
    const _balanceNew = new BigNumber(balanceNew).div(1e18).toNumber();
    const gas = new BigNumber(tx.receipt.gasUsed)
      .times(gasPrice)
      .div(1e18)
      .toNumber();
    const diff = _balanceNew - _balanceOld + gas;
    const totalEth =
      (4 * MINT_PRICE.toNumber() +
        2 * MINT_PRICE.times(0.8).toNumber() +
        1 * MINT_PRICE.times(0.8 ** 2).toNumber() +
        1 * MINT_PRICE.times(0.8 ** 3).toNumber() +
        1 * avgActual) /
      1e18;

    const refunds = MINT_PRICE.times(4).minus(avg.times(4));

    console.log("av", avg.div(1e18).toNumber(), avgActual.div(1e18).toString());
    console.log("refunds", refunds.div(1e18).toNumber());
    console.log("totalETH", totalEth, funds.div(1e18).toNumber());
    const artistExpected = funds.minus(refunds).times(0.7).div(1e18).toNumber();
    expect(avg.toString()).equal(avgActual.toString());

    const balanceOldAdmin = new BigNumber(
      await web3.eth.getBalance(genartAdminAddress)
    )
      .div(SCALE)
      .toNumber();
    const balanceOldStaking = new BigNumber(
      await web3.eth.getBalance(genartSharing.address)
    )
      .div(SCALE)
      .toNumber();
    const balanceOldRefunds = new BigNumber(
      await web3.eth.getBalance(genartDARefund.address)
    );

    await genartDA.distributeRewards(genartERC721Contract.address, {
      from: owner,
    });

    const balanceNewAdmin = new BigNumber(
      await web3.eth.getBalance(genartAdminAddress)
    )
      .div(SCALE)
      .toNumber();
    const balanceNewStaking = new BigNumber(
      await web3.eth.getBalance(genartSharing.address)
    )
      .div(SCALE)
      .toNumber();
    const balanceNewRefunds = new BigNumber(
      await web3.eth.getBalance(genartDARefund.address)
    );
    console.log("refund actual", balanceNewRefunds.toString());
    console.log("artist ", artistExpected, diff);
    console.log(
      "staking actual",
      (balanceNewStaking - balanceOldStaking).toFixed(2)
    );
    console.log("admin actual", (balanceNewAdmin - balanceOldAdmin).toFixed(2));
    expect(totalEth).equals(funds.div(1e18).toNumber());
    expect(diff.toFixed(2)).equal(artistExpected.toFixed(2));

    expect((balanceNewAdmin - balanceOldAdmin).toFixed(2)).equal(
      ((totalEth - refunds.div(1e18).toNumber()) * 0.175).toFixed(2)
    );
    expect((balanceNewStaking - balanceOldStaking).toFixed(2)).equal(
      ((totalEth - refunds.div(1e18).toNumber()) * 0.125).toFixed(2)
    );
    expect(balanceNewRefunds.minus(balanceOldRefunds).toString()).equals(
      refunds.toString()
    );
  });

  it("Claim refund", async () => {
    const gasPrice = new BigNumber(40 * 1e9);

    const funds = new BigNumber(
      await genartDA._auctionFunds(genartERC721Contract.address)
    );
    const avg = funds.div(COLLECTION_SIZE - 1).integerValue();
    const refunds = MINT_PRICE.times(4).minus(avg.times(4));
    const balanceOld = await web3.eth.getBalance(user1);

    const tx = await genartDARefund.claim(genartERC721Contract.address, {
      from: user1,
      gasPrice,
    });

    const gas = new BigNumber(tx.receipt.gasUsed) * gasPrice;

    const balanceNew = new BigNumber(await web3.eth.getBalance(user1));
    const refundActual = await genartDARefund.calcDARefunds(
      genartERC721Contract.address,
      user1
    );
    console.log("refund acc", refundActual.toString());
    expect(balanceNew.minus(balanceOld).plus(gas).toString()).equals(
      refunds.toString()
    );
  });

  it("Should get correct tokenUri", async () => {
    const tokens = await genartERC721Contract.getTokensByOwner(user1);
    const url = await genartERC721Contract.tokenURI.call(tokens[0]);
    expect(url.toString()).equals(`${COLLECTION_URI}${tokens[0]}`);
  });

  it("Should set new tokenUri", async () => {
    const tokens = await genartERC721Contract.getTokensByOwner(user1);

    await genartERC721Contract.setBaseURI("test-uri/", {
      from: owner,
    });
    const url = await genartERC721Contract.tokenURI.call(tokens[0]);
    expect(url.toString()).equals(`${"test-uri/"}${tokens[0]}`);
  });

  it("Should get total supply", async () => {
    const supply = await genartERC721Contract.totalSupply.call();
    expect(supply.toString()).equals(String(COLLECTION_SIZE));
  });

  it("Should get tokens of owner", async () => {
    const supply = await genartERC721Contract.getTokensByOwner.call(user1);
    expect(supply.length.toString()).equals("8");
  });
});
