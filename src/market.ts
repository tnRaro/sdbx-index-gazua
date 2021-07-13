import TinyQueue from "tinyqueue";
import {
  Hoga,
  PlayerGroup,
  reduceStock,
  Stock,
  TradeLog,
  TradeRequest,
} from "./models";
import { BOT_AMOUNT_BIAS, BOT_AMOUNT_VAR, BOT_REQ_EXPIRE_MS } from "./consts";

interface MarketState {
  stockPrice: number;
  botReqs: TradeRequest[];
}

var state: MarketState = {
  stockPrice: 0,
  botReqs: [],
};

function aggregateReqs(group: PlayerGroup) {
  const reqs: TradeRequest[] = [];
  group.users.forEach((user) => {
    user.trades.forEach((trade) => {
      reqs.push(trade);
    });
  });
  return reqs.concat(state.botReqs);
}

function calculateYield(stocks: Stock[], price: number) {
  if (!stocks || stocks.length === 0) {
    return 0;
  }
  const weighted = stocks
    .map((index) => {
      const neww = index.amount * price;
      const orii = index.amount * index.price;
      return ((index.amount * (neww - orii)) / orii) * 100.0;
    })
    .reduce((x, y) => x + y);
  const total = stocks.map((index) => index.amount).reduce((x, y) => x + y);
  return weighted / total;
}

function std(reqs) {
  if (reqs.length === 0) return undefined;
  const sum = reqs.map((req) => req.amount).reduce((x, y) => x + y);
  const mean =
    reqs
      .map((req) => {
        return req.amount * req.price;
      })
      .concat([0, 0])
      .reduce((x, y) => x + y) / sum;
  const vari =
    reqs
      .map((req) => req.amount * (req.price - mean) * (req.price - mean))
      .concat([0, 0])
      .reduce((x, y) => x + y) /
    (sum - 1);
  const std = Math.sqrt(vari);
  if (std === Infinity || isNaN(std)) return undefined;
  return std;
}

export function getHoga(group: PlayerGroup, bucket: number) {
  // This is not my code. It's Kirro's
  const reqs = JSON.parse(JSON.stringify(aggregateReqs(group)));
  const reqs2 = JSON.parse(JSON.stringify(aggregateReqs(group)));
  const buyQueue = new TinyQueue([], (a, b) => b.price - a.price);
  const sellQueue = new TinyQueue([], (a, b) => a.price - b.price);
  reqs
    .filter((req) => req.type === "sell")
    .forEach((req) => sellQueue.push(req));
  reqs.filter((req) => req.type === "buy").forEach((req) => buyQueue.push(req));
  let lastMatchPrice = undefined;
  while (buyQueue.length > 0 && sellQueue.length > 0) {
    const selling = sellQueue.peek();
    const buying = buyQueue.peek();
    if (buying.price < selling.price) {
      break;
    }
    if (selling.amount === 0) {
      sellQueue.pop();
      continue;
    }
    if (buying.amount === 0) {
      buyQueue.pop();
      continue;
    }
    let donePrice;
    if (buying.time > selling.time) {
      donePrice = selling.price;
    } else {
      donePrice = buying.price;
    }
    lastMatchPrice = donePrice;
    if (buying.amount >= selling.amount) {
      buying.amount -= selling.amount;
      selling.amount = 0;
      sellQueue.pop();
      if (buying.amount === 0) {
        buyQueue.pop();
      }
    } else {
      selling.amount -= buying.amount;
      buying.amount = 0;
      buyQueue.pop();
    }
  }
  if (!lastMatchPrice) return undefined;
  const buys = reqs2
    .filter((req) => req.type === "buy")
    .filter((req) => req.price >= lastMatchPrice);
  const sells = reqs2
    .filter((req) => req.type === "sell")
    .filter((req) => req.price <= lastMatchPrice);
  const buyStd = std(buys);
  const sellStd = std(sells);
  if (buyStd == null || sellStd == null) return undefined;
  const min = Math.max(lastMatchPrice - 2 * sellStd, 0);
  const max = Math.floor(lastMatchPrice + 2 * buyStd);
  const buyStride = Math.floor((max - lastMatchPrice) / bucket);
  const sellStride = Math.floor((lastMatchPrice - min) / bucket);
  const buySize = Math.min(
    Math.floor((max - lastMatchPrice) / buyStride),
    bucket * 4
  );
  const sellSize = Math.min(
    Math.floor((lastMatchPrice - min) / sellStride),
    bucket * 4
  );

  let buyCursor = max;
  const buyCounts = [];
  for (let i = 0; i < buySize; ++i) {
    const count = buys
      .filter(
        (req) => req.price <= buyCursor && req.price > buyCursor - buyStride
      )
      .map((req) => req.amount)
      .concat([0, 0])
      .reduce((x, y) => x + y);
    buyCounts.push({
      start: buyCursor - buyStride,
      end: buyCursor,
      count: count,
    });
    buyCursor -= buyStride;
  }

  let sellCursor = lastMatchPrice;
  const sellCounts = [];
  for (let i = 0; i < sellSize; ++i) {
    const count = sells
      .filter(
        (req) => req.price > sellCursor - sellStride && req.price <= sellCursor
      )
      .map((req) => req.amount)
      .concat([0, 0])
      .reduce((x, y) => x + y);
    sellCounts.push({
      start: sellCursor - sellStride,
      end: sellCursor,
      count: count,
    });
    sellCursor -= sellStride;
  }

  const out: Hoga = {
    buys: buyCounts,
    sells: sellCounts,
    stockPrice: lastMatchPrice,
  };
  return out;
}

export function stockPrice() {
  return state.stockPrice;
}

export function processTradeRequests(group: PlayerGroup) {
  const reqs = aggregateReqs(group);
  const buyQueue = new TinyQueue([], (a, b) => b.price - a.price);
  const sellQueue = new TinyQueue([], (a, b) => a.price - b.price);
  reqs
    .filter((req) => req.type === "sell")
    .forEach((req) => sellQueue.push(req));
  reqs.filter((req) => req.type === "buy").forEach((req) => buyQueue.push(req));
  console.log(reqs);
  const dones: TradeLog[] = [];
  let lastMatchPrice = undefined;
  while (buyQueue.length > 0 && sellQueue.length > 0) {
    const selling = sellQueue.peek();
    const buying = buyQueue.peek();
    if (buying.price < selling.price) {
      break;
    }
    if (selling.amount === 0) {
      sellQueue.pop();
      continue;
    }
    if (buying.amount === 0) {
      buyQueue.pop();
      continue;
    }

    const doneAmount = Math.min(buying.amount, selling.amount);
    let donePrice;
    if (buying.time > selling.time) {
      donePrice = selling.price;
    } else {
      donePrice = buying.price;
    }
    lastMatchPrice = donePrice;
    let sellerYield = 0;
    if (buying.amount >= selling.amount) {
      buying.amount -= selling.amount;
      selling.amount = 0;
      sellerYield = calculateYield(selling.stocks, donePrice);
      selling.stocks = [];
      sellQueue.pop();
      if (buying.amount === 0) {
        buyQueue.pop();
      }
    } else {
      const rr = reduceStock(selling.stocks, doneAmount);
      sellerYield = calculateYield(rr, donePrice);
      selling.amount -= buying.amount;
      buying.amount = 0;
      buyQueue.pop();
    }
    dones.push({
      buyerId: buying.userId,
      sellerId: selling.userId,
      buyerGain: (buying.price - donePrice) * doneAmount,
      sellerYield: sellerYield,
      price: donePrice,
      amount: doneAmount,
    });
  }
  group.users.forEach((user) => {
    user.trades = user.trades.filter((req) => req.amount !== 0);
  });

  if (lastMatchPrice != null) {
    state.stockPrice = lastMatchPrice;
  }
  return dones;
}

export function cancelSystemExpires() {
  state.botReqs.forEach((req) => {
    if (Date.now() - req.time > BOT_REQ_EXPIRE_MS) {
      req.amount = 0;
    }
  });
  state.botReqs = state.botReqs.filter((req) => req.amount !== 0);
}

function randn_bm(min, max, skew) {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random(); //Converting [0,1) to (0,1)
  while (v === 0) v = Math.random();
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

  num = num / 10.0 + 0.5; // Translate to 0 -> 1
  if (num > 1 || num < 0) num = randn_bm(min, max, skew); // resample between 0 and 1 if out of range
  num = Math.pow(num, skew); // Skew
  num *= max - min; // Stretch to fill range
  num += min; // offset to min
  return num;
}

function sumAmounts(reqs) {
  if (reqs.length === 0) return 0;
  return reqs.map((req) => req.amount).reduce((a, b) => a + b);
}

export function processIndex(indexPrice) {
  const isOutlier = (price) => {
    if (price > 2.0 * indexPrice) {
      return true;
    }
    if (price < 0.5 * indexPrice) {
      return true;
    }
    return false;
  };
  const buys = sumAmounts(
    state.botReqs
      .filter((req) => req.type === "buy")
      .filter((x) => !isOutlier(x.price))
  );
  const sells = sumAmounts(
    state.botReqs
      .filter((req) => req.type === "sell")
      .filter((x) => !isOutlier(x.price))
  );

  let amount2 = Math.floor(Math.random() * BOT_AMOUNT_VAR);
  let amount = Math.floor(Math.random() * BOT_AMOUNT_VAR);
  if (buys < sells) {
    amount2 += BOT_AMOUNT_BIAS;
  } else if (buys > sells) {
    amount += BOT_AMOUNT_BIAS;
  }

  state.botReqs.push({
    type: "buy",
    amount: amount2,
    price: Math.floor(
      randn_bm(
        indexPrice - indexPrice * 0.05,
        indexPrice + indexPrice * 0.05,
        1.0
      )
    ),
    time: Date.now(),
    userId: "system",
  });

  state.botReqs.push({
    type: "sell",
    amount: amount,
    price: Math.floor(
      randn_bm(
        indexPrice - indexPrice * 0.05,
        indexPrice + indexPrice * 0.05,
        1.0
      )
    ),
    time: Date.now(),
    userId: "system",
    stocks: [{ amount: amount, price: indexPrice + 1 }],
  });
}
