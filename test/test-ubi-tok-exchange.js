// Main test suite for the UbiTok.io exchange contract.
//

var BookERC20EthV1 = artifacts.require('BookERC20EthV1.sol');
var TestToken = artifacts.require('TestToken.sol');

var UbiTokTypes = require('../../ubitok-jslib/ubi-tok-types.js');
var BigNumber = UbiTokTypes.BigNumber;
var ReferenceExchange = require('../../ubitok-jslib/reference-exchange.js');

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
    [ 1001, 0, web3.toWei(1, 'finney'), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "obviously invalid price", "InvalidPrice" ],
    [ 1002, packedBuyOnePointZero, web3.toWei(100, 'finney'), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "not enough funds", "InsufficientFunds" ],
    [ 1003, packedBuyOnePointZero, new web3.BigNumber("1e39"), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "preposterously large base size", "InvalidSize" ],
    [ 1004, packedMaxBuyPrice, new web3.BigNumber("1e36"), UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "preposterously large quoted size (but base just ok)", "InvalidSize" ],
    [ 1005, packedBuyOnePointZero, 90, UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "small base size", "InvalidSize" ],
    [ 1006, packedBuyOnePointZero, 900, UbiTokTypes.encodeTerms('GTCNoGasTopup'), 3, "small quoted size (but base ok)", "InvalidSize" ],
    [ 1007, packedBuyOnePointZero, web3.toWei(1, 'finney'), UbiTokTypes.encodeTerms('MakerOnly'), 1, "maxMatches > 0 with MakerOnly", "InvalidTerms" ]
  ];
  var balanceQuotedAfterDeposit;
  it("first accepts a deposit to be used to place bad orders", function() {
    var uut;
    return BookERC20EthV1.deployed().then(function(instance) {
      uut = instance;
      return uut.depositCntr({from: accounts[0], value: web3.toWei(2, 'finney')});
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

var standardInitialBalanceBase = 1000000000;
var standardInitialBalanceCntr =  100000000;

function runReferenceExchange(clients, commands) {
  var rx = new ReferenceExchange();
  for (var client of clients) {
    rx.depositBaseForTesting(client, standardInitialBalanceBase);
    rx.depositCntrForTesting(client, standardInitialBalanceCntr);
  }
  for (var cmd of commands) {
    if (cmd[0] === 'Create') {
      rx.createOrder(cmd[1], cmd[2], cmd[3], new BigNumber(cmd[4]), cmd[5], cmd[6], cmd[7]);
    } else if (cmd[0] === 'Cancel') {
      rx.cancelOrder(cmd[1], cmd[2]);
    } else if (cmd[0] === 'Continue') {
      rx.continueOrder(cmd[1], cmd[2], cmd[3]);
    }
  }
  return rx;
}

// Yeah, this is really gnarly - but at least the scenarios themsleves are
// easy to read since all the ugliness is hidden here (TODO - fix this).
// We run the commands against the reference exchange first.
// Then we build a promise chain that sets up initial balances on the contract,
// runs through the commands, then checks the orders, book and balances are as
// specified in the scenario and same as the reference exchange at the end.

function buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges) {
  var context = {};
  context.accounts = accounts;
  var chain = BookERC20EthV1.deployed().then(function(instance) {
    context.uut = instance;
    return TestToken.deployed();
  }).then(function(instance) {
    context.testToken = instance;
    return context.uut.init(context.testToken.address, context.testToken.address);
  });
  // Look ahead to figure out clients + orderIds involved
  var orderIds = new Set();
  var clients = new Set();
  for (var cmd of commands) {
    clients.add(cmd[1]);
    orderIds.add(cmd[2]);
  }
  for (var expectedBalanceChange of expectedBalanceChanges) {
    clients.add(expectedBalanceChange[0]);
  }
  // Apply client balances + commands to the reference exchange
  var referenceExchange = runReferenceExchange(clients, commands);
  // Make promises to set up initial client balances
  var accountIdForClient = {};
  var nextAccountId = 1;
  for (var client of clients) {
    accountIdForClient[client] = nextAccountId;
    nextAccountId++;
    chain = chain.then((function (ctx, a, ab) {
      return function (lastResult) {
        return ctx.testToken.transfer(ctx.accounts[a], ab, {from: ctx.accounts[0]});
      };
    }(context, accountIdForClient[client], standardInitialBalanceBase)));
    chain = chain.then((function (ctx, a, ab) {
      return function (lastResult) {
        return ctx.testToken.approve(ctx.uut.address, ab, {from: ctx.accounts[a]});
      };
    }(context, accountIdForClient[client], standardInitialBalanceBase)));
    chain = chain.then((function (ctx, a, ab) {
      return function (lastResult) {
        return ctx.uut.transferFromBase({from: ctx.accounts[a]});
      };
    }(context, accountIdForClient[client], standardInitialBalanceBase)));
    chain = chain.then((function (ctx, a, ac) {
      return function (lastResult) {
        return ctx.uut.depositCntr({from: ctx.accounts[a], value: ac});
      };
    }(context, accountIdForClient[client], standardInitialBalanceCntr)));
  }
  // Make promises to run commands against contract
  for (var cmd of commands) {
    if (cmd[0] === 'Create') {
      chain = chain.then((function (ctx, a, c) {
        return function (lastResult) {
          return ctx.uut.createOrder(
            c[2],
            UbiTokTypes.encodePrice(c[3]),
            c[4],
            UbiTokTypes.encodeTerms(c[5]),
            c[6],
            {from: ctx.accounts[a]}
          );
        };
      }(context, accountIdForClient[cmd[1]], cmd)));
    } else if (cmd[0] === 'Cancel') {
      chain = chain.then((function (ctx, a, c) {
        return function (lastResult) {
          return ctx.uut.cancelOrder(
            c[2],
            {from: ctx.accounts[a]}
          );
        };
      }(context, accountIdForClient[cmd[1]], cmd)));
    } else if (cmd[0] === 'Continue') {
      chain = chain.then((function (ctx, a, c) {
        return function (lastResult) {
          return ctx.uut.continueOrder(
            c[2],
            c[3],
            {from: ctx.accounts[a]}
          );
        };
      }(context, accountIdForClient[cmd[1]], cmd)));
    } else {
      throw new Error('unknown command ' + cmd[0]);
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
        assert.equal(state.rawExecutedBase.toNumber(), eo[3], "rawExecutedBase of order " + eo[0]);
        assert.equal(state.rawExecutedCntr.toNumber(), eo[4], "rawExecutedCntr of order " + eo[0]);
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
        assert.equal(lastResult[0].toNumber() - standardInitialBalanceBase, ebc[1], "base balance change for " + ebc[0]);
        assert.equal(lastResult[1].toNumber() - standardInitialBalanceCntr, ebc[2], "counter balance change for " + ebc[0]);
      };
    }(context, accountIdForClient[client], expectedBalanceChange)));
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
        assert.equal(order.sizeBase, UbiTokTypes.decodeBaseAmount(ro.sizeBase), "sizeBase of order " + oid + " compared to reference");
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
    // TODO
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
        assert.equal(lastResult[1].toNumber(), ren[1], "book entry depth for " + lastPrice);
        assert.equal(lastResult[2].toNumber(), ren[2], "book entry count for " + lastPrice);
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
        assert.equal(lastResult[1].toNumber(), ren[1], "book entry depth for " + lastPrice);
        assert.equal(lastResult[2].toNumber(), ren[2], "book entry count for " + lastPrice);
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
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201", "Sell @ 0.600", 100000, 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Open', 'None', 0,  0],
      ["201", 'Open', 'None', 0,  0],
    ];
    var expectedBalanceChanges = [
      ["client1",      +0, -50000],
      ["client2", -100000,      0]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("two orders exactly match", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201", "Sell @ 0.500", 100000, 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["201", 'Done', 'None', 100000,  50000],
    ];
    var expectedBalanceChanges = [
      ["client1", +100000, -50000],
      ["client2", -100000, +50000 * 0.9995]  // taker pays fee
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("two orders partial match of 2nd", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201", "Sell @ 0.500", 300000, 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["201", 'Open', 'None', 100000,  50000],
    ];
    var expectedBalanceChanges = [
      ["client1", +100000,  -50000],
      ["client2", -300000,  +50000 * 0.9995]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("two orders best execution", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201", "Sell @ 0.400", 100000, 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["201", 'Done', 'None', 100000,  50000],
    ];
    var expectedBalanceChanges = [
      ["client1", +100000,  -50000],
      ["client2", -100000,  +50000 * 0.9995]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});


contract('BookERC20EthV1', function(accounts) {
  it("three orders mixed prices", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client1", "102",  "Buy @ 0.600", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201", "Sell @ 0.400", 200000, 'GTCNoGasTopup', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["102", 'Done', 'None', 100000,  60000],
      ["201", 'Done', 'None', 200000, 110000],
    ];
    var expectedBalanceChanges = [
      ["client1", +200000, -110000],
      ["client2", -200000, +110000 * 0.9995]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("order takes and makes", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201", "Sell @ 0.400", 200000, 'GTCNoGasTopup', 3],
      ['Create', "client3", "301",  "Buy @ 0.500",  50000, 'GTCNoGasTopup', 3],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["201", 'Open', 'None', 150000,  70000],
      ["301", 'Done', 'None',  50000,  20000],
    ];
    var expectedBalanceChanges = [
      ["client1", +100000,  -50000],
      // client2's order first took liquidity then provided liquidity:
      ["client2", -200000,  (50000 * 0.9995) + (20000)],
      ["client3",  +50000 * 0.9995,  -20000]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("minimal successful cancel order", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Cancel', "client1", "101"],
    ];
    var expectedOrders = [
      ["101", 'Done', 'ClientCancel', 0, 0],
    ];
    var expectedBalanceChanges = [
      ["client1", 0, 0],
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cancel order among others then match", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client3", "301",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Cancel', "client2", "201"],
      ['Create', "client4", "401",  "Sell @ 0.500", 300000, 'GTCNoGasTopup', 3],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["201", 'Done', 'ClientCancel', 0, 0],
      ["301", 'Done', 'None', 100000,  50000],
      ["401", 'Open', 'None', 200000, 100000],
    ];
    var expectedBalanceChanges = [
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cancel order among others then match - variation with cancelled first", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client3", "301",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Cancel', "client1", "101"],
      ['Create', "client4", "401",  "Sell @ 0.500", 300000, 'GTCNoGasTopup', 3],
    ];
    var expectedOrders = [
      ["101", 'Done', 'ClientCancel', 0, 0],
      ["201", 'Done', 'None', 100000,  50000],
      ["301", 'Done', 'None', 100000,  50000],
      ["401", 'Open', 'None', 200000, 100000],
    ];
    var expectedBalanceChanges = [
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cancel order among others then match - variation with cancelled last", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client3", "301",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Cancel', "client3", "301"],
      ['Create', "client4", "401",  "Sell @ 0.500", 300000, 'GTCNoGasTopup', 3],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["201", 'Done', 'None', 100000,  50000],
      ["301", 'Done', 'ClientCancel', 0, 0],
      ["401", 'Open', 'None', 200000, 100000],
    ];
    var expectedBalanceChanges = [
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cancel only order at price then match above", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201",  "Buy @ 0.600", 100000, 'GTCNoGasTopup', 3],
      ['Cancel', "client2", "201"],
      ['Create', "client3", "301",  "Sell @ 0.500", 300000, 'GTCNoGasTopup', 3],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000, 50000],
      ["201", 'Done', 'ClientCancel', 0, 0],
      ["301", 'Open', 'None', 100000, 50000],
    ];
    var expectedBalanceChanges = [
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cancel completed order", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201",  "Sell @ 0.500", 300000, 'GTCNoGasTopup', 3],
      ['Cancel', "client1", "101"],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000, 50000],
      ["201", 'Open', 'None', 100000, 50000],
    ];
    var expectedBalanceChanges = [
      ["client1", +100000, -50000],
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cancel partially filled order", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201",  "Sell @ 0.500", 60000, 'GTCNoGasTopup', 3],
      ['Cancel', "client1", "101"],
    ];
    var expectedOrders = [
      ["101", 'Done', 'ClientCancel', 60000, 30000],
      ["201", 'Done', 'None', 60000, 30000],
    ];
    var expectedBalanceChanges = [
      ["client1", +60000, -30000],
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("enter needs gas state", function() {
    var commands = [
      ['Create', "client1", "101", "Buy @ 0.500",  100000, 'GTCNoGasTopup', 3],
      ['Create', "client1", "102", "Buy @ 0.500",  100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201", "Sell @ 0.500", 300000, 'GTCWithGasTopup', 1],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["102", 'Open', 'None', 0,  0],
      ["201", 'NeedsGas', 'None', 100000, 50000],
    ];
    var expectedBalanceChanges = [
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("minimal successful continue order", function() {
    var commands = [
      ['Create', "client1", "101", "Buy @ 0.500",  100000, 'GTCNoGasTopup', 3],
      ['Create', "client1", "102", "Buy @ 0.500",  100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201", "Sell @ 0.500", 300000, 'GTCWithGasTopup', 1],
      ['Continue', "client2", "201", 1],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000,  50000],
      ["102", 'Done', 'None', 100000,  50000],
      ["201", 'Open', 'None', 200000, 100000],
    ];
    var expectedBalanceChanges = [
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("cancel needs gas order", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 20000, 'GTCNoGasTopup', 3],
      ['Create', "client1", "102",  "Buy @ 0.500", 20000, 'GTCNoGasTopup', 3],
      ['Create', "client1", "103",  "Buy @ 0.500", 20000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201",  "Sell @ 0.500", 60000, 'GTCWithGasTopup', 1],
      ['Cancel', "client2", "201"],
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 20000, 10000],
      ["102", 'Open', 'None', 0, 0],
      ["103", 'Open', 'None', 0, 0],
      ["201", 'Done', 'ClientCancel', 20000, 10000],
    ];
    var expectedBalanceChanges = [
      ["client2", -20000, +10000 * 0.9995],
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("maker-only rejected if any would take", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201", "Sell @ 0.400", 200000, 'MakerOnly', 0]
    ];
    var expectedOrders = [
      ["101", 'Open',     'None',      0,  0],
      ["201", 'Rejected', 'WouldTake', 0,  0]
    ];
    var expectedBalanceChanges = [
      ["client1", 0,  -50000],
      ["client2", 0,       0]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('UbiTokExchange', function(accounts) {
  it("maker-only accepted if none would take", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201", "Sell @ 0.600", 200000, 'MakerOnly', 0]
    ];
    var expectedOrders = [
      ["101", 'Open', 'None', 0,  0],
      ["201", 'Open', 'None', 0,  0]
    ];
    var expectedBalanceChanges = [
      ["client1", 0,  -50000],
      ["client2", -200000, 0]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("IoC cancelled if none would match", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201", "Sell @ 0.600", 200000, 'ImmediateOrCancel', 3]
    ];
    var expectedOrders = [
      ["101", 'Open', 'None', 0,  0],
      ["201", 'Done', 'Unmatched', 0,  0]
    ];
    var expectedBalanceChanges = [
      ["client1", 0,  -50000],
      ["client2", 0,       0]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("IoC completed if all matches", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201", "Sell @ 0.400",  50000, 'ImmediateOrCancel', 3]
    ];
    var expectedOrders = [
      ["101", 'Open', 'None', 50000,  25000],
      ["201", 'Done', 'None', 50000,  25000]
    ];
    var expectedBalanceChanges = [
      ["client1",  50000, -50000],
      ["client2", -50000,  Math.ceil(25000 * 0.9995)]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("IoC remaining cancelled if some matches", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.500", 100000, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201", "Sell @ 0.400", 200000, 'ImmediateOrCancel', 3]
    ];
    var expectedOrders = [
      ["101", 'Done', 'None', 100000, 50000],
      ["201", 'Done', 'Unmatched', 100000, 50000]
    ];
    var expectedBalanceChanges = [
      ["client1",  100000, -50000],
      ["client2", -100000,  50000 * 0.9995]
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});

contract('BookERC20EthV1', function(accounts) {
  it("high gas usage", function() {
    var commands = [
      ['Create', "client1", "101",  "Buy @ 0.00500", 2000000, 'GTCNoGasTopup', 3],
      ['Create', "client1", "102",  "Buy @ 0.0100",  1000000, 'GTCNoGasTopup', 3],
      ['Create', "client1", "103",  "Buy @ 0.0500",   200000, 'GTCNoGasTopup', 3],
      ['Create', "client1", "104",  "Buy @ 0.100",    100000, 'GTCNoGasTopup', 3],
      ['Create', "client1", "105",  "Buy @ 0.500",     20000, 'GTCNoGasTopup', 3],
      ['Create', "client1", "106",  "Buy @ 1.000",     10000, 'GTCNoGasTopup', 3],
      ['Create', "client1", "107",  "Buy @ 5.000",      2000, 'GTCNoGasTopup', 3],
      ['Create', "client1", "108",  "Buy @ 10.000",     1000, 'GTCNoGasTopup', 3],
      ['Create', "client1", "109",  "Buy @ 50.000",      200, 'GTCNoGasTopup', 3],
      ['Create', "client1", "110",  "Buy @ 100.000",     100, 'GTCNoGasTopup', 3],
      ['Create', "client2", "201", "Sell @ 0.0050",  4000000, 'GTCWithGasTopup', 12],
    ];
    var expectedOrders = [
      ["201", 'Open', 'None', 3333300, 100000],
    ];
    var expectedBalanceChanges = [
    ];
    return buildScenario(accounts, commands, expectedOrders, expectedBalanceChanges);
  });
});
