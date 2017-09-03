var TestToken = artifacts.require("./TestToken.sol");
var UbiRewardToken = artifacts.require("./UbiRewardToken.sol");
var BookERC20EthV1 = artifacts.require("./BookERC20EthV1.sol");

module.exports = function(deployer) {
  deployer.deploy(TestToken);
  deployer.deploy(UbiRewardToken);
  deployer.deploy(BookERC20EthV1);
};
