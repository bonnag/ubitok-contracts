// Main test suite for the UbiTok.io exchange contract.
//

var BookERC20EthV1 = artifacts.require('BookERC20EthV1.sol');
var BookERC20EthV1Dec = artifacts.require('BookERC20EthV1Dec.sol');
var TestToken = artifacts.require('TestToken.sol');
var UbiRewardToken = artifacts.require('UbiRewardToken.sol');

var BookDecimalSetup = {
  baseDecimals: 18,
  baseMinInitialSize: "100000000000000000",
  minPriceExponent: "-5"
};

var BookEightDecimalSetup = {
  baseDecimals: 8,
  baseMinInitialSize: "1000000000",
  minPriceExponent: "5"
};

var BookZeroDecimalSetup = {
  baseDecimals: 0,
  baseMinInitialSize: "10",
  minPriceExponent: "13"
};

var UbiTokTypes = require('../../ubitok-jslib/ubi-tok-types.js');
var BigNumber = UbiTokTypes.BigNumber;
var ReferenceExchange = require('../../ubitok-jslib/reference-exchange-instrumented.js');
//var ReferenceExchange = require('../../ubitok-jslib/reference-exchange.js');
process.on('exit', function () { require('fs').writeFileSync('coverage.data', Buffer(JSON.stringify(__coverage__))) });

contract('BookERC20EthV1 - create order errors', function(accounts) {
  var packedBuyOnePointZero = UbiTokTypes.encodePrice('Buy @ 1.00');
  it("instantly throws on invalid order id", function() {
    var uut;
    return BookERC20EthV1.deployed().then(function(instance) {
      uut = instance;
      return uut.createOrder(0, packedBuyOnePointZero, web3.toWei(1, 'finney'), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, {from: accounts[0]});
    }).then(assert.fail).catch(function(error) {
      assert(error.message.indexOf('invalid opcode') >= 0, 'error should be a solidity throw, not ' + error);
    });
  });
  it("instantly throws on duplicate order id", function() {
    var uut;
    return BookERC20EthV1.deployed().then(function(instance) {
      uut = instance;
      return uut.depositCntr({from: accounts[0], value: web3.toWei(10, 'finney')});
    }).then(function(result) {
      return uut.createOrder(1001, packedBuyOnePointZero, web3.toWei(1, 'finney'), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, {from: accounts[0]});
    }).then(function(result) {
      return uut.createOrder(1001, packedBuyOnePointZero, web3.toWei(1, 'finney'), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, {from: accounts[0]});
    }).then(assert.fail).catch(function(error) {
      assert(error.message.indexOf('invalid opcode') >= 0, 'error should be a solidity throw, not ' + error);
    });
  });
});

contract('BookERC20EthV1 - create order rejects', function(accounts) {
  var packedBuyOnePointZero = UbiTokTypes.encodePrice('Buy @ 1.00');
  var packedMaxBuyPrice = 1;
  var badOrders = [
    [ 1001, 0, UbiTokTypes.encodeBaseAmount("0.100", 18), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "obviously invalid price", "InvalidPrice" ],
    [ 1002, packedBuyOnePointZero, UbiTokTypes.encodeBaseAmount("0.201", 18), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "not enough funds", "InsufficientFunds" ],
    [ 1003, packedBuyOnePointZero, new web3.BigNumber("1e39"), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "preposterously large base size", "InvalidSize" ],
    [ 1004, packedMaxBuyPrice, new web3.BigNumber("1e36"), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "preposterously large quoted size (but base just ok)", "InvalidSize" ],
    [ 1005, UbiTokTypes.encodePrice('Buy @ 100.0'), UbiTokTypes.encodeBaseAmount("0.099", 18), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "small base size (but quoted ok)", "InvalidSize" ],
    [ 1006, UbiTokTypes.encodePrice('Buy @ 0.05'), UbiTokTypes.encodeBaseAmount("0.199", 18), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "small quoted size (but base ok)", "InvalidSize" ],
    [ 1007, packedBuyOnePointZero, web3.toWei(100, 'finney'), UbiTokTypes.encodeTerms('MakerOnly'), 1, "maxMatches > 0 with MakerOnly", "InvalidTerms" ]
  ];
  var balanceQuotedAfterDeposit;
  it("first accepts a deposit to be used to place bad orders", function() {
    var uut;
    return BookERC20EthV1.deployed().then(function(instance) {
      uut = instance;
      return uut.depositCntr({from: accounts[0], value: web3.toWei(200, 'finney')});
    }).then(function(result) {
      return uut.getClientBalances.call(accounts[0]);
    }).then(function(balances) {
      balanceQuotedAfterDeposit = balances[1];
    });
  });
  badOrders.forEach(function(badOrder) {
    it("gracefully reject create order with " + badOrder[5] + " (at no cost)", function() {
      var uut;
      return BookERC20EthV1.deployed().then(function(instance) {
        uut = instance;
        return uut.createOrder(badOrder[0], badOrder[1], badOrder[2], badOrder[3], badOrder[4], {from: accounts[0]});
      }).then(function(result) {
        return uut.getOrderState.call(badOrder[0]);
      }).then(function(result) {
        var state = UbiTokTypes.decodeOrderState(badOrder[0], result);
        assert.equal(state.status, 'Rejected');
        assert.equal(state.reasonCode, badOrder[6]);
        return uut.getClientBalances.call(accounts[0]);
      }).then(function(balancesAfterOrderRejected) {
        assert.equal(balancesAfterOrderRejected[1].toString(), balanceQuotedAfterDeposit.toString());
      });
    });
  });
});

contract('BookERC20EthV1Dec with 8dp - create order rejects', function(accounts) {
  var packedBuyOnePointZero = UbiTokTypes.encodePrice('Buy @ 1.00');
  var packedMaxBuyPrice = 1;
  var badOrders = [
    [ 1001, 0, UbiTokTypes.encodeBaseAmount("0.100", 8), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "obviously invalid price", "InvalidPrice" ],
    [ 1002, packedBuyOnePointZero, UbiTokTypes.encodeBaseAmount("0.201", 8), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "not enough funds", "InsufficientFunds" ],
    [ 1003, packedBuyOnePointZero, new web3.BigNumber("1e39"), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "preposterously large base size", "InvalidSize" ],
    [ 1004, packedMaxBuyPrice, new web3.BigNumber("1e36"), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "preposterously large quoted size (but base just ok)", "InvalidSize" ],
    [ 1005, UbiTokTypes.encodePrice('Buy @ 100.0'), UbiTokTypes.encodeBaseAmount("0.099", 8), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "small base size (but quoted ok)", "InvalidSize" ],
    [ 1006, UbiTokTypes.encodePrice('Buy @ 0.05'), UbiTokTypes.encodeBaseAmount("0.199", 8), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "small quoted size (but base ok)", "InvalidSize" ],
    [ 1007, packedBuyOnePointZero, web3.toWei(100, 'finney'), UbiTokTypes.encodeTerms('MakerOnly'), 1, "maxMatches > 0 with MakerOnly", "InvalidTerms" ]
  ];
  var balanceQuotedAfterDeposit;
  var uut;
  var testToken;
  it("first accepts a deposit to be used to place bad orders", function() {
    return TestToken.deployed().then(function(instance) {
      testToken = instance;
      testToken.initForTesting(8, UbiTokTypes.encodeBaseAmount("1000000", 8));
    }).then(function(result) {
      return BookERC20EthV1Dec.deployed();
    }).then(function(instance) {
      uut = instance;
      return uut.depositCntr({from: accounts[0], value: web3.toWei(200, 'finney')});
    }).then(function(result) {
      return uut.getClientBalances.call(accounts[0]);
    }).then(function(balances) {
      balanceQuotedAfterDeposit = balances[1];
    });
  });
  badOrders.forEach(function(badOrder) {
    it("gracefully reject create order with " + badOrder[5] + " (at no cost)", function() {
      return uut.createOrder(badOrder[0], badOrder[1], badOrder[2], badOrder[3], badOrder[4], {from: accounts[0]}
      ).then(function(result) {
        return uut.getOrderState.call(badOrder[0]);
      }).then(function(result) {
        var state = UbiTokTypes.decodeOrderState(badOrder[0], result);
        assert.equal(state.status, 'Rejected');
        assert.equal(state.reasonCode, badOrder[6]);
        return uut.getClientBalances.call(accounts[0]);
      }).then(function(balancesAfterOrderRejected) {
        assert.equal(balancesAfterOrderRejected[1].toString(), balanceQuotedAfterDeposit.toString());
      });
    });
  });
});

contract('TestToken - basics', function(accounts) {
  it("transfer gives funds", function() {
    var testToken;
    var transferAmount = new BigNumber("1000000");
    return TestToken.deployed().then(function(instance) {
      testToken = instance;
    }).then(function(junk) {
      return testToken.transfer(accounts[1], transferAmount);
    }).then(function(junk) {
      return testToken.balanceOf.call(accounts[1]);
    }).then(function(balance) {
      assert.equal(transferAmount.toString(), balance.toString());
    });
  });
});

contract('BookERC20EthV1 - ERC20 payments', function(accounts) {
  it("deposit with approve + transferFrom", function() {
    var uut;
    var testToken;
    var depositAmount = new BigNumber("1000000");
    return TestToken.deployed().then(function(instance) {
      testToken = instance;
      return BookERC20EthV1.deployed();
    }).then(function(instance) {
      uut = instance;
      return uut.init(testToken.address, testToken.address);
    }).then(function(junk) {
      return testToken.transfer(accounts[1], depositAmount, {from: accounts[0]});
    }).then(function(junk) {
      return testToken.balanceOf.call(accounts[1]);
    }).then(function(balance) {
      assert.equal(depositAmount.toString(), balance.toString());
      return testToken.approve(uut.address, depositAmount, {from: accounts[1]});
    }).then(function(junk) {
      // TODO assert something
      return uut.transferFromBase({from: accounts[1]});
    }).then(function(junk) {
      return uut.getClientBalances.call(accounts[1]);
    }).then(function(balances) {
      assert.equal(balances[0].toString(), depositAmount.toString());
    });
  });
});

contract('BookERC20EthV1 - ERC20 payments', function(accounts) {
  it("failed deposit with approve + transferFrom", function() {
    var uut;
    var testToken;
    var approveAmount = new BigNumber("2000000");
    var availAmount = new BigNumber("1000000");
    return TestToken.deployed().then(function(instance) {
      testToken = instance;
      return BookERC20EthV1.deployed();
    }).then(function(instance) {
      uut = instance;
      return uut.init(testToken.address, testToken.address);
    }).then(function(junk) {
      return testToken.transfer(accounts[1], availAmount, {from: accounts[0]});
    }).then(function(junk) {
      return testToken.balanceOf.call(accounts[1]);
    }).then(function(balance) {
      assert.equal(availAmount.toString(), balance.toString());
      return testToken.approve(uut.address, approveAmount, {from: accounts[1]});
    }).then(function(junk) {
      return uut.transferFromBase({from: accounts[1]});
    }).then(assert.fail).catch(function(error) {
      assert(error.message.indexOf('invalid opcode') >= 0, 'error should be a solidity throw, not ' + error);
    }).then(function(junk) {
      return uut.getClientBalances.call(accounts[1]);
    }).then(function(balances) {
      assert.equal(balances[0].toString(), "0");
    });
  });
});

contract('BookERC20EthV1 - ERC20 payments', function(accounts) {
  it("instantly throws on insufficient funds (none at all) for withdraw counter", function() {
    var uut;
    var rawWithdrawAmountCntr = new BigNumber("1e25");
    return TestToken.deployed().then(function(instance) {
      return BookERC20EthV1.deployed();
    }).then(function(instance) {
      uut = instance;
    }).then(function(junk) {
      return uut.withdrawCntr(rawWithdrawAmountCntr, {from: accounts[0]});
    }).then(assert.fail).catch(function(error) {
      assert(error.message.indexOf('invalid opcode') >= 0, 'error should be a solidity throw, not ' + error);
    });
  });
  it("instantly throws on insufficient funds (some but too few) for withdraw counter", function() {
    var uut;
    var rawWithdrawAmountCntr = new BigNumber("1e25");
    return TestToken.deployed().then(function(instance) {
      return BookERC20EthV1.deployed();
    }).then(function(instance) {
      uut = instance;
    }).then(function(junk) {
      return uut.depositCntr({from: accounts[0], value: web3.toWei(10, 'finney')});
    }).then(function(junk) {
      return uut.withdrawCntr(rawWithdrawAmountCntr, {from: accounts[0]});
    }).then(assert.fail).catch(function(error) {
      assert(error.message.indexOf('invalid opcode') >= 0, 'error should be a solidity throw, not ' + error);
    });
  });
});

var standardInitialBalanceBase = web3.toWei(500000, 'finney');
var standardInitialBalanceCntr = web3.toWei(12000, 'finney');
var optionalInitialBalanceRwrd = new BigNumber(web3.toWei(10000, 'finney'));

var standardInitialBalances = {
  balanceBase: new BigNumber(standardInitialBalanceBase),
  balanceCntr: new BigNumber(standardInitialBalanceCntr),
  balanceRwrd: new BigNumber(0),
  ownBase:     new BigNumber(web3.toWei(300000, 'finney')),
  ownCntr:     new BigNumber(web3.toWei(30000, 'finney')),
  ownRwrd:     new BigNumber(web3.toWei(30000, 'finney'))
};

function runReferenceExchange(clients, commands) {
  var rx = new ReferenceExchange();
  for (var client of clients) {
    rx.setBalancesForTesting(client, 
      standardInitialBalances.balanceBase,
      standardInitialBalances.balanceCntr,
      standardInitialBalances.balanceRwrd,
      standardInitialBalances.ownBase,
      standardInitialBalances.ownCntr, // not honoured for the contract
      standardInitialBalances.ownRwrd
    );
  }
  for (var cmd of commands) {
    var verb = cmd[0];
    var expectFail = false;
    if (verb.endsWith(':FAIL')) {
      verb = verb.substr(0, verb.length - 5);
      expectFail = true;
    }
    try {
      if (verb === 'createOrder') {
        rx.createOrder(cmd[1], cmd[2], cmd[3], new BigNumber(web3.toWei(cmd[4], 'ether')), cmd[5], cmd[6], cmd[7]);
      } else if (verb === 'cancelOrder') {
        rx.cancelOrder(cmd[1], cmd[2]);
      } else if (verb === 'continueOrder') {
        rx.continueOrder(cmd[1], cmd[2], cmd[3]);
      } else if (verb === 'baseTokenApprove') {
        rx.baseTokenApprove(cmd[1], cmd[2]);
      } else if (verb === 'transferFromBase') {
        rx.transferFromBase(cmd[1]);
      } else if (verb === 'transferBase') {
        rx.transferFromBase(cmd[1], cmd[2]);
      } else if (verb === 'depositCntr') {
        rx.depositCntr(cmd[1], cmd[2]);
      } else if (verb === 'withdrawCntr') {
        rx.withdrawCntr(cmd[1], cmd[2]);
      } else if (verb === 'rwrdTokenApprove') {
        rx.rwrdTokenApprove(cmd[1], cmd[2]);
      } else if (verb === 'transferFromRwrd') {
        rx.transferFromRwrd(cmd[1]);
      } else if (verb === 'transferRwrd') {
        rx.transferRwrd(cmd[1], cmd[2]);
      } else {
        throw new Error("unknown cmd " + cmd[1] + " from " + cmd);
      }
    } catch (e) {
      if (expectFail) {
        // fine
      } else {
        throw e;
      }
    }
  }
  return rx;
}

function assertEqualAmounts(actualWei, expectedEth, desc) {
  assert.equal(new BigNumber(actualWei).toFixed(), (new BigNumber(web3.toWei(expectedEth, 'ether'))).toFixed(), desc);
}

function assertEqualDelta(actualWeiAfter, knownWeiBefore, expectedEth, desc) {
  assertEqualAmounts((new BigNumber(actualWeiAfter)).minus(knownWeiBefore), expectedEth, desc);
}

// Yeah, this is really gnarly - but at least the scenarios themsleves are
// easy to read since all the ugliness is hidden here (TODO - fix ugliness).
// We run the commands against the reference exchange first.
// Then we build a promise chain that sets up initial balances on the contract,
// runs through the commands, then checks the orders, book and balances are as
// specified in the scenario and same as the reference exchange at the end.

function buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges, expectedLogEvents) {
  var context = {};
  context.accounts = accounts;
  var chain = BookERC20EthV1.deployed().then(function(instance) {
    context.uut = instance;
    return TestToken.deployed();
  }).then(function(instance) {
    context.testToken = instance;
    return UbiRewardToken.deployed();
  }).then(function(instance) {
    context.rwrdToken = instance;
    return context.uut.init(context.testToken.address, context.rwrdToken.address);
  });
  // Look ahead to figure out clients + orderIds involved
  var orderIds = new Set();
  var clients = new Set();
  for (var cmd of commands) {
    clients.add(cmd[1]);
    if (cmd[1].endsWith('Order')) {
      orderIds.add(cmd[2]);
    }
  }
  for (var expectedBalanceChange of expectedBalanceChanges) {
    clients.add(expectedBalanceChange[0]);
  }
  // Apply client balances + commands to the reference exchange
  var referenceExchange = runReferenceExchange(clients, commands);
  // Make promises/commands to set up initial client balances
  var accountIdForClient = {};
  var nextAccountId = 1;
  var setupCommands = [];
  for (var client of clients) {
    accountIdForClient[client] = nextAccountId;
    nextAccountId++;
    chain = chain.then((function (ctx, a, ab) {
      return function (lastResult) {
        return ctx.testToken.transfer(ctx.accounts[a], ab, {from: ctx.accounts[0]});
      };
    }(context, accountIdForClient[client], standardInitialBalances.ownBase.add(standardInitialBalances.balanceBase))));
    chain = chain.then((function (ctx, a, ab) {
      return function (lastResult) {
        return ctx.rwrdToken.transfer(ctx.accounts[a], ab, {from: ctx.accounts[0]});
      };
    }(context, accountIdForClient[client], standardInitialBalances.ownRwrd.add(standardInitialBalances.balanceRwrd))));
    setupCommands.push(["baseTokenApprove", client, standardInitialBalances.balanceBase]);
    setupCommands.push(["transferFromBase", client]);
    setupCommands.push(["depositCntr", client, standardInitialBalances.balanceCntr]);
    if (standardInitialBalances.balanceRwrd.gt(0)) {
      setupCommands.push(["rwrdTokenApprove", client, standardInitialBalances.balanceRwrd]);
      setupCommands.push(["transferFromRwrd", client]);
    }
  }
  // Make promises to run commands against contract
  var allCommands = setupCommands.concat(commands);
  for (var cmd of allCommands) {
    var verb = cmd[0];
    var expectFail = false;
    if (verb.endsWith(':FAIL')) {
      verb = verb.substr(0, verb.length - 5);
      expectFail = true;
    }
    if (verb === 'createOrder') {
      chain = chain.then((function (ctx, a, c) {
        return function (lastResult) {
          return ctx.uut.createOrder(
            c[2],
            UbiTokTypes.encodePrice(c[3]),
            web3.toWei(c[4], 'ether'),
            UbiTokTypes.encodeTerms(c[5]),
            c[6],
            {from: ctx.accounts[a]}
          );
        };
      }(context, accountIdForClient[cmd[1]], cmd)));
    } else if (verb === 'cancelOrder') {
      chain = chain.then((function (ctx, a, c) {
        return function (lastResult) {
          return ctx.uut.cancelOrder(
            c[2],
            {from: ctx.accounts[a]}
          );
        };
      }(context, accountIdForClient[cmd[1]], cmd)));
    } else if (verb === 'continueOrder') {
      chain = chain.then((function (ctx, a, c) {
        return function (lastResult) {
          return ctx.uut.continueOrder(
            c[2],
            c[3],
            {from: ctx.accounts[a]}
          );
        };
      }(context, accountIdForClient[cmd[1]], cmd)));
    } else if (verb === 'baseTokenApprove') {
      chain = chain.then((function (ctx, a, c) {
        return function (lastResult) {
          return ctx.testToken.approve(ctx.uut.address, c[2], {from: ctx.accounts[a]});
        };
      }(context, accountIdForClient[cmd[1]], cmd)));
    } else if (verb === 'transferFromBase') {
      chain = chain.then((function (ctx, a, c) {
        return function (lastResult) {
          return ctx.uut.transferFromBase({from: ctx.accounts[a]});
        };
      }(context, accountIdForClient[cmd[1]], cmd)));
    } else if (verb === 'transferBase') {
      chain = chain.then((function (ctx, a, c) {
        return function (lastResult) {
          return ctx.uut.transferBase(c[2], {from: ctx.accounts[a]});
        };
      }(context, accountIdForClient[cmd[1]], cmd)));
    } else if (verb === 'depositCntr') {
      chain = chain.then((function (ctx, a, c) {
        return function (lastResult) {
          return ctx.uut.depositCntr({from: ctx.accounts[a], value: c[2]});
        };
      }(context, accountIdForClient[cmd[1]], cmd)));
    } else if (verb === 'withdrawCntr') {
      chain = chain.then((function (ctx, a, c) {
        return function (lastResult) {
          return ctx.uut.withdrawCntr(c[2], {from: ctx.accounts[a]});
        };
      }(context, accountIdForClient[cmd[1]], cmd)));
    } else if (verb === 'rwrdTokenApprove') {
      chain = chain.then((function (ctx, a, c) {
        return function (lastResult) {
          return ctx.rwrdToken.approve(ctx.uut.address, c[2], {from: ctx.accounts[a]});
        };
      }(context, accountIdForClient[cmd[1]], cmd)));
    } else if (verb === 'transferFromRwrd') {
      chain = chain.then((function (ctx, a, c) {
        return function (lastResult) {
          return ctx.uut.transferFromRwrd({from: ctx.accounts[a]});
        };
      }(context, accountIdForClient[cmd[1]], cmd)));
    } else if (verb === 'transferRwrd') {
      chain = chain.then((function (ctx, a, c) {
        return function (lastResult) {
          return ctx.uut.transferRwrd(c[2], {from: ctx.accounts[a]});
        };
      }(context, accountIdForClient[cmd[1]], cmd)));
    } else {
      throw new Error('unknown command ' + verb);
    }
    if (expectFail) {
      chain = chain.then(assert.fail).catch(function(error) {
        assert(error.message.indexOf('invalid opcode') >= 0, 'error should be a solidity throw, not ' + error);
      });
    }
  }
  // Make promises to compare orders with scenario expectations
  for (var expectedOrder of expectedOrders) {
    chain = chain.then((function (ctx, eo) {
      return function (lastResult) {
        return ctx.uut.getOrderState.call(eo[0]);
      };
    }(context, expectedOrder)));
    chain = chain.then((function (ctx, eo) {
      return function (lastResult) {
        var state = UbiTokTypes.decodeOrderState(eo[0], lastResult);
        assert.equal(state.status, eo[1], "status of order " + eo[0]);
        assert.equal(state.reasonCode, eo[2], "reasonCode of order " + eo[0]);
        assertEqualAmounts(state.rawExecutedBase, eo[3], "rawExecutedBase of order " + eo[0]);
        assertEqualAmounts(state.rawExecutedCntr, eo[4], "rawExecutedCntr of order " + eo[0]);
      };
    }(context, expectedOrder)));
  }
  // Make promises to compare balance changes with scenario expectations
  for (var expectedBalanceChange of expectedBalanceChanges) {
    var client = expectedBalanceChange[0];
    chain = chain.then((function (ctx, a, ebc) {
      return function (lastResult) {
        return ctx.uut.getClientBalances.call(ctx.accounts[a]);
      };
    }(context, accountIdForClient[client], expectedBalanceChange)));
    chain = chain.then((function (ctx, a, ebc) {
      return function (lastResult) {
        assertEqualDelta(lastResult[0], standardInitialBalanceBase, ebc[1], "base balance change for " + ebc[0]);
        assertEqualDelta(lastResult[1], standardInitialBalanceCntr, ebc[2], "counter balance change for " + ebc[0]);
        if (ebc.length >= 4) {
          assertEqualDelta(lastResult[2], optionalInitialBalanceRwrd, ebc[3], "reward balance change for " + ebc[0]);
        }
      };
    }(context, accountIdForClient[client], expectedBalanceChange)));
  }
  // Make promise to check log events if given
  // Note we won't raise an error if other log events happen ...
  if (expectedLogEvents) {
    chain = chain.then((function (ctx) {
      // sigh this is silly
      return function (lastResult) {
        return new Promise(function(resolve, reject) {
          ctx.uut.allEvents({fromBlock:"1", toBlock:"pending"}).get(
            function (err, res) {
              if (err) {
                reject(err);
              } else {
                resolve(res);
              }
            }
          );
        });
      }
    }(context)));
    chain = chain.then((function (ctx, eles) {
      return function (lastResult) {
        ales = lastResult;
        for (var ele of eles) {
          if (ele.args.client) {
            var address = ctx.accounts[accountIdForClient[ele.args.client]];
            if (address) {
              ele.args.client = address;
            }
          }
          var checkKeys = Object.keys(ele.args).sort();
          var found = false;
          for (var ale of ales) {
            if (ele.event !== ale.event) {
              continue;
            }
            // TODO - sadly not sure how reliable for BigNumbers?
            if (JSON.stringify(ele.args, checkKeys) !==
                JSON.stringify(ale.args, checkKeys)) {
              continue;
            }
            found = true;
            break;
          }
          if (!found) {
            console.log("expected:", JSON.stringify(ele.args, checkKeys));
            console.log("actual log events:",  JSON.stringify(ales, null, 4));
            assert.fail("failed to generate expected log event: " + ele)
          }
        }
      };
    }(context, expectedLogEvents)));
  }
  // Make promises to compare orders with reference orders
  for (var orderId of orderIds) {
    var refOrder = referenceExchange.getOrder(orderId);
    chain = chain.then((function (ctx, oid) {
      return function (lastResult) {
        return ctx.uut.getOrder.call(oid);
      };
    }(context, orderId)));
    chain = chain.then((function (ctx, oid, ro) {
      return function (lastResult) {
        var order = UbiTokTypes.decodeOrder(oid, lastResult);
        assert.equal(order.price, ro.price, "price of order " + oid + " compared to reference");
        assert.equal(order.sizeBase, UbiTokTypes.decodeBaseAmount(ro.sizeBase, BookDecimalSetup.baseDecimals), "sizeBase of order " + oid + " compared to reference");
        assert.equal(order.terms, ro.terms, "terms of order " + oid + " compared to reference");
        assert.equal(order.status, ro.status, "status of order " + oid + " compared to reference");
        assert.equal(order.reasonCode, ro.reasonCode, "reasonCode of order " + oid + " compared to reference");
        assert.equal(order.rawExecutedBase.toNumber(), ro.executedBase, "executedBase of order " + oid + " compared to reference");
        assert.equal(order.rawExecutedCntr.toNumber(), ro.executedCntr, "executedCntr of order " + oid + " compared to reference");
        assert.equal(order.rawFees.toNumber(), ro.fees, "fees of order " + oid + " compared to reference");
      };
    }(context, orderId, refOrder)));
  }
  // Make promises to compare client balances with reference balances
  for (var client of clients) {
    var refBalances = referenceExchange.getClientBalances(client);
    chain = chain.then((function (ctx, a) {
      return function (lastResult) {
        return ctx.uut.getClientBalances.call(ctx.accounts[a]);
      };
    }(context, accountIdForClient[client])));
    chain = chain.then((function (ctx, c, rbals) {
      return function (lastResult) {
        let abals = lastResult;
        let balanceNames = ["bookBalanceBase", "bookBalanceCntr", "bookBalanceRwrd",
                            "approvedBalanceBase", "approvedBalanceRwrd",
                            "ownBalanceBase", "ownBalanceRwrd"];
        for (let balanceIdx = 0; balanceIdx < balanceNames.length; balanceIdx++) {
          assert.equal(abals[balanceIdx].toNumber(), rbals[balanceIdx].toNumber(), balanceNames[balanceIdx] + " for " + c);
        }
      };
    }(context, client, refBalances)));
  }
  // Make promises to walk book comparing with reference book
  var refBook = referenceExchange.getBook();
  chain = chain.then((function (ctx) {
    return function (lastResult) {
      return ctx.uut.walkBook.call(UbiTokTypes.encodePrice('Buy @ 999000'));
    };
  }(context)));
  for (let entry of refBook[0]) {
    chain = chain.then((function (ctx, ren) {
      return function (lastResult) {
        var lastPrice = UbiTokTypes.decodePrice(lastResult[0]);
        assert.equal(lastPrice, ren[0], "book entry price");
        // TODO - potential dubious rounding here for large numbers?
        assert.equal(lastResult[1].toNumber(), ren[1], "book entry depth for " + lastPrice);
        assert.equal(lastResult[2].toNumber(), ren[2], "book entry count for " + lastPrice);
        console.log(lastPrice + " => " + ren[1] + ", " + ren[2]);
        var lastPackedPrice = lastResult[0].toNumber();
        if (lastPrice === 'Buy @ 0.00000100') {
          return Promise.resolve(null);
        } else {
          return ctx.uut.walkBook.call(lastPackedPrice + 1);
        }
      };
    }(context, entry)));
  }
  chain = chain.then((function (ctx) {
    return function (lastResult) {
      return ctx.uut.walkBook.call(UbiTokTypes.encodePrice('Sell @ 0.00000100'));
    };
  }(context)));
  for (let entry of refBook[1]) {
    chain = chain.then((function (ctx, ren) {
      return function (lastResult) {
        var lastPrice = UbiTokTypes.decodePrice(lastResult[0]);
        assert.equal(lastPrice, ren[0], "book entry price");
        // TODO - potential dubious rounding here for large numbers?
        assert.equal(lastResult[1].toNumber(), ren[1], "book entry depth for " + lastPrice);
        assert.equal(lastResult[2].toNumber(), ren[2], "book entry count for " + lastPrice);
        console.log(lastPrice + " => " + ren[1] + ", " + ren[2]);
        var lastPackedPrice = lastResult[0].toNumber();
        if (lastPrice === 'Sell @ 999000') {
          return Promise.resolve(null);
        } else {
          return ctx.uut.walkBook.call(lastPackedPrice + 1);
        }
      };
    }(context, entry)));
  }
  return chain;
}

contract('BookERC20EthV1 - scenarios', function(accounts) {
  it("two orders that don't match", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.600", "1.000", 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Open', 'None', 0,  0],
      ["201", 'Open', 'None', 0,  0],
    ];
    var expectedBalanceChanges = [
      ["client1", +0, "-0.500"],
      ["client2", "-1.000",  0]
    ];
    var expectedLogEvents = [
      {event: "ClientOrderEvent", args: {
        client: "client1",
        clientOrderEventType: new BigNumber(0),
        orderId: new BigNumber(101),
        maxMatches: new BigNumber(3)
      }}
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges, expectedLogEvents);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("two orders exactly match", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.500", "1.000", 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000", "0.500"],
      ["201", 'Done', 'None', "1.000", "0.500"],
    ];
    var expectedBalanceChanges = [
      ["client1", "+1.000", "-0.500"],
      ["client2", "-1.000", "+0.49975"]  // taker pays fee
    ];
    var expectedLogEvents = [
      {event: "MarketOrderEvent", args: {
        orderId: new BigNumber(101),
        marketOrderEventType: new BigNumber(2),
        price: new BigNumber(UbiTokTypes.encodePrice("Buy @ 0.500")),
        depthBase: UbiTokTypes.encodeBaseAmount("1.0", BookDecimalSetup.baseDecimals),
        tradeBase: UbiTokTypes.encodeBaseAmount("1.0", BookDecimalSetup.baseDecimals)
      }}
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges, expectedLogEvents);
  });
});

if (true) {

  contract('BookERC20EthV1', function(accounts) {
    it("real-life example", function() {
      var commands = [
        /*(01)*/ ['createOrder', "xfefc", "101",  "Sell @ 0.0330",  "20.0", 'GTCNoGasTopup', 3],
        /*(02)*/ ['createOrder', "xfefc", "102",  "Buy @ 0.0320",  "3.0", 'GTCNoGasTopup', 3],
        /*(03)*/ ['createOrder', "xeb19", "103",  "Buy @ 0.0330",  "1.25", 'ImmediateOrCancel', 3],
        /*(04)*/ ['createOrder', "xeb19", "104",  "Sell @ 0.0399",  "1.0", 'GTCNoGasTopup', 3],
        /*(05)*/ ['createOrder', "xeb19", "105",  "Buy @ 0.0300",  "5.0", 'GTCNoGasTopup', 3],
        /*(06)*/ ['createOrder', "x8197", "106",  "Buy @ 0.0220",  "2.0", 'GTCNoGasTopup', 3],
        /*(07)*/ ['cancelOrder', "xfefc", "102"],
        /*(08)*/ ['createOrder', "xfefc", "108",  "Buy @ 0.0305",  "3.0", 'GTCNoGasTopup', 3],
        /*(09)*/ ['createOrder', "xfefc", "109",  "Buy @ 0.0305",  "1.0", 'GTCNoGasTopup', 3],
        /*(10)*/ ['cancelOrder', "xfefc", "109"],
        /*(11)*/ ['cancelOrder', "xfefc", "108"],
        /*(12)*/ ['createOrder', "xfefc", "112",  "Buy @ 0.0250",  "5.0", 'MakerOnly', 0],
        /*(13)*/ ['cancelOrder', "xeb19", "105"],
        /*(14)*/ ['createOrder', "xeb19", "114",  "Buy @ 0.0250",  "3.0", 'GTCNoGasTopup', 3],
        /*(15)*/ ['createOrder', "xeb19", "115",  "Buy @ 0.0240",  "0.5", 'MakerOnly', 0],
        /*(16)*/ ['createOrder', "x8152", "116",  "Buy @ 0.0330",  "6.0", 'ImmediateOrCancel', 3],
        /*(17)*/ ['createOrder', "x8152", "117",  "Buy @ 0.0330",  "4.0", 'GTCNoGasTopup', 3],
        /*(18)*/ ['cancelOrder', "xfefc", "101"],
        /*(19)*/ ['createOrder', "xfefc", "119",  "Sell @ 0.0295",  "8.75", 'MakerOnly', 0],
        /*(20)*/ ['cancelOrder', "xfefc", "112"],
        /*(21)*/ ['createOrder', "xfefc", "121",  "Buy @ 0.0330",  "10.0", 'MakerOnly', 0],
        /*(22)*/ ['createOrder', "x8152", "122",  "Sell @ 0.0265",  "5.0", 'MakerOnly', 0],
        /*(23)*/ ['createOrder', "x8152", "123",  "Buy @ 0.0250",  "2.0", 'MakerOnly', 0],
        /*(24)*/ ['createOrder', "xfefc", "124",  "Buy @ 0.0245",  "1.0", 'MakerOnly', 0],
        /*(25)*/ ['createOrder', "xfefc", "125",  "Buy @ 0.0246",  "2.0", 'MakerOnly', 0],
        /*(26)*/ ['cancelOrder', "x8152", "123"],
        /*(27)*/ ['cancelOrder', "xeb19", "114"],
        /*(28)*/ ['cancelOrder', "xeb19", "115"],
        /*(29)*/ ['cancelOrder', "xfefc", "125"],
        /*(30)*/ ['cancelOrder', "xfefc", "124"],
        /*(31)*/ ['createOrder', "x8152", "131",  "Buy @ 0.0200",  "20.0", 'MakerOnly', 0],
        /*(32)*/ ['createOrder', "x9991", "132",  "Sell @ 0.0025", "10.0", 'MakerOnly', 0],
        /*(33)*/ ['createOrder', "x9991", "133",  "Sell @ 0.0250", "10.0", 'MakerOnly', 0]
      ];
      var expectedOrders = [
        ["133", 'Open', 'None', 0, 0]
      ];
      var expectedBalanceChanges = [
      ];
      return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
    });
  });
  
contract('BookERC20EthV1', function(accounts) {
  it("two orders exactly match, paying fees with UBI (taker receives counter)", function() {
    var commands = [
      ['rwrdTokenApprove', "client2", optionalInitialBalanceRwrd],
      ['transferFromRwrd', "client2"],
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.500", "1.000", 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000",  "0.500"],
      ["201", 'Done', 'None', "1.000",  "0.500"],
    ];
    var expectedBalanceChanges = [
      ["client1", "+1.000", "-0.500"],
      ["client2", "-1.000", "+0.500", "-0.25"]  // taker pays fee in UBI, not ETH (1000 * 0.05% * 0.500 ETH)
    ];
    var expectedLogEvents = [
      {event: "ClientPaymentEvent", args: {
        client: "client2",
        clientPaymentEventType: new BigNumber(2), // transfer from
        balanceType: new BigNumber(2), // reward
        clientBalanceDelta: optionalInitialBalanceRwrd
      }}
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges, expectedLogEvents);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("two orders exactly match, paying fees with UBI (taker receives base)", function() {
    var commands = [
      ['rwrdTokenApprove', "client2", optionalInitialBalanceRwrd],
      ['transferFromRwrd', "client2"],
      ['createOrder', "client1", "101", "Sell @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000",  "0.500"],
      ["201", 'Done', 'None', "1.000",  "0.500"],
    ];
    var expectedBalanceChanges = [
      ["client1", "-1.000", "+0.500"],
      ["client2", "+1.000", "-0.500", "-0.25"]  // taker pays fee in UBI, not TEST (1000 * 0.05% * 0.500 ETH)
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("two orders partial match of 2nd", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.500", "3.000", 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000", "0.500"],
      ["201", 'Open', 'None', "1.000", "0.500"],
    ];
    var expectedBalanceChanges = [
      ["client1", "+1.000", "-0.500"],
      ["client2", "-3.000", "+0.49975"]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("two orders best execution", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.400", "1.000", 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000", "0.500"],
      ["201", 'Done', 'None', "1.000", "0.500"],
    ];
    var expectedBalanceChanges = [
      ["client1", "+1.000", "-0.500"],
      ["client2", "-1.000", "+0.49975"]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("two orders best execution, paying fees with UBI (taker receives counter)", function() {
    var commands = [
      ['rwrdTokenApprove', "client2", optionalInitialBalanceRwrd],
      ['transferFromRwrd', "client2"],
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.400", "1.000", 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000", "0.500"],
      ["201", 'Done', 'None', "1.000", "0.500"],
    ];
    var expectedBalanceChanges = [
      ["client1", "+1.000", "-0.500"],
      ["client2", "-1.000", "+0.500", "-0.25"]  // taker pays fee in UBI, not ETH (1000 * 0.05% * 0.500)
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("three orders mixed prices", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "102",  "Buy @ 0.600", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.400", "2.000", 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000",  "0.500"],
      ["102", 'Done', 'None', "1.000",  "0.600"],
      ["201", 'Done', 'None', "2.000",  "1.100"],
    ];
    var expectedBalanceChanges = [
      ["client1", "+2.000", "-1.100"],
      ["client2", "-2.000", "+1.09945"] // 1.1 * 0.9995
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("order takes and makes", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.400", "2.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client3", "301",  "Buy @ 0.500", "0.500", 'GTCNoGasTopup', 3],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000",  "0.500"],
      ["201", 'Open', 'None', "1.500",  "0.700"],
      ["301", 'Done', 'None', "0.500",  "0.200"],
    ];
    var expectedBalanceChanges = [
      ["client1", "+1.000",   "-0.500"],
      // client2's order first took liquidity then provided liquidity:
      ["client2", "-2.000",   "+0.69975"],
      ["client3", "+0.49975", "-0.200"]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("two orders - maker dust prevention", function() {
    var commands = [
      // remaining is too small to leave in book (note the 9):
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.00009", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.500", "1.000", 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000",  "0.500"],
      ["201", 'Done', 'None', "1.000",  "0.500"],
    ];
    var expectedBalanceChanges = [
      ["client1", "+1.000", "-0.500"],
      ["client2", "-1.000", "+0.49975"]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("two orders - taker dust prevention", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      // remaining is too small to leave in book (note the 9):
      ['createOrder', "client2", "201", "Sell @ 0.500", "1.00009", 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000",  "0.500"],
      ["201", 'Done', 'None', "1.000",  "0.500"],
    ];
    var expectedBalanceChanges = [
      ["client1", "+1.000",   "-0.500"],
      ["client2", "-1.000",  "+0.49975"]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("two orders - taker dust prevention even if still matchable", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "102",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      // after matching against the first, the remaining is too small to
      // be worth the gas cost of matching against the second (note the 9):
      ['createOrder', "client2", "201", "Sell @ 0.500", "1.00009", 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000",  "0.500"],
      ["102", 'Open', 'None', 0, 0],
      ["201", 'Done', 'None', "1.000",  "0.500"],
    ];
    var expectedBalanceChanges = [
      ["client1",  "+1.000",  "-1.000"],
      ["client2", "-1.000",  "+0.49975"]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("GTC without topup cancelled if max matches reached", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500",  "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "102",  "Buy @ 0.500",  "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "103",  "Buy @ 0.500",  "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201",  "Sell @ 0.500", "0.600", 'GTCNoGasTopup', 2]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "0.200", "0.100"],
      ["102", 'Done', 'None', "0.200", "0.100"],
      ["103", 'Open', 'None', 0, 0],
      ["201", 'Done', 'TooManyMatches', "0.400", "0.200"],
    ];
    var expectedBalanceChanges = [
      ["client2", "-0.400", "+0.1999"],
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("minimal successful cancel order", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['cancelOrder', "client1", "101"],
    ];
    var expectedOrders = [
      ["101", 'Done', 'ClientCancel', 0, 0],
    ];
    var expectedBalanceChanges = [
      ["client1", 0, 0],
    ];
    var expectedLogEvents = [
      {event: "ClientOrderEvent", args: {
        client: "client1",
        clientOrderEventType: new BigNumber(2), // cancel
        orderId: new BigNumber(101),
        maxMatches: new BigNumber(0)
      }},
      {event: "MarketOrderEvent", args: {
        orderId: new BigNumber(101),
        marketOrderEventType: new BigNumber(1), // remove
        price: new BigNumber(UbiTokTypes.encodePrice("Buy @ 0.500")),
        depthBase: UbiTokTypes.encodeBaseAmount("1.0", BookDecimalSetup.baseDecimals),
        tradeBase: UbiTokTypes.encodeBaseAmount("0.0", BookDecimalSetup.baseDecimals)
      }}
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges, expectedLogEvents);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cannot cancel someone elses order", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['cancelOrder:FAIL', "client2", "101"],
    ];
    var expectedOrders = [
      ["101", 'Open', 'None', 0, 0],
    ];
    var expectedBalanceChanges = [
      ["client1", 0,  "-0.500"],
      ["client2", 0, 0],
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cancel order among others then match", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201",  "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client3", "301",  "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['cancelOrder', "client2", "201"],
      ['createOrder', "client4", "401",  "Sell @ 0.500", "3.000", 'GTCNoGasTopup', 3],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000",  "0.500"],
      ["201", 'Done', 'ClientCancel', 0, 0],
      ["301", 'Done', 'None', "1.000",  "0.500"],
      ["401", 'Open', 'None', "2.000",  "1.000"],
    ];
    var expectedBalanceChanges = [
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cancel order among others then match - variation with cancelled first", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201",  "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client3", "301",  "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['cancelOrder', "client1", "101"],
      ['createOrder', "client4", "401",  "Sell @ 0.500", "3.000", 'GTCNoGasTopup', 3],
    ];
    var expectedOrders = [
      ["101", 'Done', 'ClientCancel', 0, 0],
      ["201", 'Done', 'None', "1.000",  "0.500"],
      ["301", 'Done', 'None', "1.000",  "0.500"],
      ["401", 'Open', 'None', "2.000",  "1.000"],
    ];
    var expectedBalanceChanges = [
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cancel order among others then match - variation with cancelled last", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201",  "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client3", "301",  "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['cancelOrder', "client3", "301"],
      ['createOrder', "client4", "401",  "Sell @ 0.500", "3.000", 'GTCNoGasTopup', 3],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000",  "0.500"],
      ["201", 'Done', 'None', "1.000",  "0.500"],
      ["301", 'Done', 'ClientCancel', 0, 0],
      ["401", 'Open', 'None', "2.000",  "1.000"],
    ];
    var expectedBalanceChanges = [
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cancel only order at price then match above", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201",  "Buy @ 0.600",  "1.000", 'GTCNoGasTopup', 3],
      ['cancelOrder', "client2", "201"],
      ['createOrder', "client3", "301",  "Sell @ 0.500", "3.000", 'GTCNoGasTopup', 3],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000", "0.500"],
      ["201", 'Done', 'ClientCancel', 0, 0],
      ["301", 'Open', 'None', "1.000", "0.500"],
    ];
    var expectedBalanceChanges = [
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cancel completed order", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201",  "Sell @ 0.500", "3.000", 'GTCNoGasTopup', 3],
      ['cancelOrder', "client1", "101"],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000", "0.500"],
      ["201", 'Open', 'None', "1.000", "0.500"],
    ];
    var expectedBalanceChanges = [
      ["client1",  "+1.000",  "-0.500"],
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cancel partially filled order", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201",  "Sell @ 0.500", "0.600", 'GTCNoGasTopup', 3],
      ['cancelOrder', "client1", "101"],
    ];
    var expectedOrders = [
      ["101", 'Done', 'ClientCancel', "0.600", "0.300"],
      ["201", 'Done', 'None', "0.600", "0.300"],
    ];
    var expectedBalanceChanges = [
      ["client1", "+0.600", "-0.300"],
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("enter needs gas state", function() {
    var commands = [
      ['createOrder', "client1", "101", "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "102", "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.500", "3.000", 'GTCWithGasTopup', 1],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000",  "0.500"],
      ["102", 'Open', 'None', 0,  0],
      ["201", 'NeedsGas', 'None', "1.000", "0.500"],
    ];
    var expectedBalanceChanges = [
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("minimal successful continue order", function() {
    var commands = [
      ['createOrder', "client1", "101", "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "102", "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.500", "3.000", 'GTCWithGasTopup', 1],
      ['continueOrder', "client2", "201", 1],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000",  "0.500"],
      ["102", 'Done', 'None', "1.000",  "0.500"],
      ["201", 'Open', 'None', "2.000",  "1.000"],
    ];
    var expectedBalanceChanges = [
    ];
    var expectedLogEvents = [
      {event: "ClientOrderEvent", args: {
        client: "client2",
        clientOrderEventType: new BigNumber(1), // continue
        orderId: new BigNumber(201),
        maxMatches: new BigNumber(1)
      }}
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges, expectedLogEvents);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cannot continue someone elses order", function() {
    var commands = [
      ['createOrder', "client1", "101", "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "102", "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.500", "3.000", 'GTCWithGasTopup', 1],
      ['continueOrder:FAIL', "client1", "201", 1],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000",  "0.500"],
      ["102", 'Open', 'None', 0, 0],
      ["201", 'NeedsGas', 'None', "1.000", "0.500"],
    ];
    var expectedBalanceChanges = [
      ["client1", "+1.000", "-1.000"],
      ["client2", "-3.000", "+0.49975"],
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("continue completed order does nothing", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500",  "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201",  "Sell @ 0.500", "3.000", 'GTCNoGasTopup', 3],
      ['continueOrder', "client1", "101", 1],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000", "0.500"],
      ["201", 'Open', 'None', "1.000", "0.500"],
    ];
    var expectedBalanceChanges = [
      ["client1",  "+1.000",  "-0.500"],
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cancel needs gas order", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500",  "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "102",  "Buy @ 0.500",  "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "103",  "Buy @ 0.500",  "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201",  "Sell @ 0.500", "0.600", 'GTCWithGasTopup', 1],
      ['cancelOrder', "client2", "201"],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "0.200", "0.100"],
      ["102", 'Open', 'None', 0, 0],
      ["103", 'Open', 'None', 0, 0],
      ["201", 'Done', 'ClientCancel', "0.200", "0.100"],
    ];
    var expectedBalanceChanges = [
      ["client2", "-0.200", "+0.09995"],
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("gtc with topup filled without needing more gas", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "102",  "Buy @ 0.500", "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "103",  "Buy @ 0.500", "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201",  "Sell @ 0.500","0.600", 'GTCWithGasTopup', 3],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "0.200", "0.100"],
      ["102", 'Done', 'None', "0.200", "0.100"],
      ["103", 'Done', 'None', "0.200", "0.100"],
      ["201", 'Done', 'None', "0.600", "0.300"],
    ];
    var expectedBalanceChanges = [
      ["client2", "-0.600", "+0.29985"],
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("maker-only rejected if any would take", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.400", "2.000", 'MakerOnly', 0]
    ];
    var expectedOrders = [
      ["101", 'Open',     'None',      0,  0],
      ["201", 'Rejected', 'WouldTake', 0,  0]
    ];
    var expectedBalanceChanges = [
      ["client1", 0,   "-0.500"],
      ["client2", 0,       0]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('UbiTokExchange', function(accounts) {
  it("maker-only accepted if none would take", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.600", "2.000", 'MakerOnly', 0]
    ];
    var expectedOrders = [
      ["101", 'Open', 'None', 0,  0],
      ["201", 'Open', 'None', 0,  0]
    ];
    var expectedBalanceChanges = [
      ["client1", 0,   "-0.500"],
      ["client2", "-2.000", 0]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("IoC cancelled if none would match", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.600", "2.000", 'ImmediateOrCancel', 3]
    ];
    var expectedOrders = [
      ["101", 'Open', 'None', 0,  0],
      ["201", 'Done', 'Unmatched', 0,  0]
    ];
    var expectedBalanceChanges = [
      ["client1", 0,   "-0.500"],
      ["client2", 0,       0]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("IoC completed if all matches", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.400",  "0.500", 'ImmediateOrCancel', 3]
    ];
    var expectedOrders = [
      ["101", 'Open', 'None', "0.500",  "0.250"],
      ["201", 'Done', 'None', "0.500",  "0.250"]
    ];
    var expectedBalanceChanges = [
      ["client1",  "+0.500",  "-0.500"],
      ["client2",  "-0.500",  "+0.249875"]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("IoC remaining cancelled if some matches", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.400", "2.000", 'ImmediateOrCancel', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000", "0.500"],
      ["201", 'Done', 'Unmatched', "1.000", "0.500"]
    ];
    var expectedBalanceChanges = [
      ["client1",  "1.000",  "-0.500"],
      ["client2", "-1.000",  "+0.49975"]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("IoC cancelled if max matches reached", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500", "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "102",  "Buy @ 0.500", "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "103",  "Buy @ 0.500", "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201",  "Sell @ 0.500","0.600", 'ImmediateOrCancel', 2]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "0.200", "0.100"],
      ["102", 'Done', 'None', "0.200", "0.100"],
      ["103", 'Open', 'None', 0, 0],
      ["201", 'Done', 'TooManyMatches', "0.400", "0.200"],
    ];
    var expectedBalanceChanges = [
      ["client2", "-0.400", "+0.1999"],
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("high gas usage", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.00500","200.00", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "102",  "Buy @ 0.0100", "100.00", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "103",  "Buy @ 0.0500",  "20.00", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "104",  "Buy @ 0.100",   "10.00", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "105",  "Buy @ 0.500",    "2.00", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "106",  "Buy @ 1.000",    "1.00", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "107",  "Buy @ 5.000",    "0.20", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "108",  "Buy @ 10.000",   "0.10", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "109",  "Buy @ 5.010",    "0.20", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "110",  "Buy @ 10.100",   "0.10", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 0.0050", "400.00", 'GTCWithGasTopup', 12],
    ];
    var expectedOrders = [
      ["110", 'Done', 'None', "0.10", "1.01"],
      ["201", 'Open', 'None', "333.6", "10.012"],
    ];
    var expectedBalanceChanges = [
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("orders with best execution and replenishment near bitmap boundaries", function() {
    // "Buy @ 1.24" packs to 5376, which is a multiple of 256.
    // By placing orders at 1.23, 1.24, 1.25 we're right at the start/end of bitmap
    // words in our special Solidity order book representation.
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 1.23", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "102",  "Buy @ 1.24", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "103",  "Buy @ 1.25", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201", "Sell @ 1.20", "3.000", 'GTCNoGasTopup', 3],
      // just in case something not cleared from bitmap
      ['createOrder', "client2", "202", "Sell @ 1.20", "3.000", 'GTCNoGasTopup', 3],
      ['cancelOrder', "client2", "202"],
      // use the same price levels again (just in case something odd)
      ['createOrder', "client1", "111",  "Buy @ 1.23", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "112",  "Buy @ 1.24", "1.000", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "113",  "Buy @ 1.25", "1.000", 'GTCNoGasTopup', 3],
      // sell at much more generous price in different bitmap word
      ['createOrder', "client2", "203", "Sell @ 0.100", "3.000", 'GTCNoGasTopup', 3],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "1.000", "1.230"],
      ["102", 'Done', 'None', "1.000", "1.240"],
      ["103", 'Done', 'None', "1.000", "1.250"],
      ["201", 'Done', 'None', "3.000", "3.720"],
      ["202", 'Done', 'ClientCancel', "0.000", "0.000"],
      ["111", 'Done', 'None', "1.000", "1.230"],
      ["112", 'Done', 'None', "1.000", "1.240"],
      ["113", 'Done', 'None', "1.000", "1.250"],
      ["203", 'Done', 'None', "3.000", "3.720"]
    ];
    var expectedBalanceChanges = [
      ["client1", "+6.000", "-7.440"],
      ["client2", "-6.000", "+7.43628"]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  // could argue this either way - but it seems most helpful to
  // the client to treat this as "Done" rather than TooManyMatches.
  it("max matches reached at same time as taker dust prevention", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500",  "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "102",  "Buy @ 0.500",  "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "103",  "Buy @ 0.500",  "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201",  "Sell @ 0.500", "0.4001", 'GTCNoGasTopup', 2],
      // make sure nothing left in bad state
      ['createOrder', "client3", "301",  "Sell @ 0.500", "0.300", 'GTCNoGasTopup', 1]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "0.200", "0.100"],
      ["102", 'Done', 'None', "0.200", "0.100"],
      ["103", 'Done', 'None', "0.200", "0.100"],
      ["201", 'Done', 'None', "0.400", "0.200"],
      ["301", 'Open', 'None', "0.200", "0.100"],
    ];
    var expectedBalanceChanges = [
      ["client2", "-0.400", "+0.1999"],
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  // somewhat counter-intuitive but makes sense not to pay gas to match dust
  it("taker dust prevention when another order matchable", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500",  "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "102",  "Buy @ 0.500",  "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "103",  "Buy @ 0.500",  "0.200", 'GTCNoGasTopup', 3],
      // unlike last scenario max matches is high enough to take a nibble out of 103 ..
      // .. but we don't
      ['createOrder', "client2", "201",  "Sell @ 0.500", "0.4001", 'GTCNoGasTopup', 5],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "0.200", "0.100"],
      ["102", 'Done', 'None', "0.200", "0.100"],
      ["103", 'Open', 'None', "0.0", "0.0"],
      ["201", 'Done', 'None', "0.400", "0.200"],
    ];
    var expectedBalanceChanges = [
      ["client2", "-0.400", "+0.1999"],
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("max matches reached at same time as resting dust prevention", function() {
    var commands = [
      ['createOrder', "client1", "101",  "Buy @ 0.500",  "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "102",  "Buy @ 0.500",  "0.2001", 'GTCNoGasTopup', 3],
      ['createOrder', "client1", "103",  "Buy @ 0.500",  "0.200", 'GTCNoGasTopup', 3],
      ['createOrder', "client2", "201",  "Sell @ 0.500", "0.400", 'GTCNoGasTopup', 2],
      // make sure nothing left in bad state
      ['createOrder', "client3", "301",  "Sell @ 0.500", "0.300", 'GTCNoGasTopup', 1]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', "0.200", "0.100"],
      ["102", 'Done', 'None', "0.200", "0.100"],
      ["103", 'Done', 'None', "0.200", "0.100"],
      ["201", 'Done', 'None', "0.400", "0.200"],
      ["301", 'Open', 'None', "0.200", "0.100"],
    ];
    var expectedBalanceChanges = [
      ["client1", "+0.600", "-0.300"],
      ["client2", "-0.400", "+0.1999"],
    ];
    var expectedLogEvents = [
      {event: "MarketOrderEvent", args: {
        orderId: new BigNumber(102),
        marketOrderEventType: new BigNumber(2), // complete fill
        price: new BigNumber(UbiTokTypes.encodePrice("Buy @ 0.500")),
        depthBase: UbiTokTypes.encodeBaseAmount("0.2001", BookDecimalSetup.baseDecimals),
        tradeBase: UbiTokTypes.encodeBaseAmount("0.200", BookDecimalSetup.baseDecimals)
      }}
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges, expectedLogEvents);
  });
});

// TODO - more white-box nasty edge cases re: bitmasks?
// TODO - more white-box nasty edge cases re: last order at price?
// TODO - potential problems around fee calc, overflow?
// TODO - orders at max/min price?
}
