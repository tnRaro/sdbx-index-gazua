import TinyQueue from "tinyqueue";
import * as fs from "fs";
import * as util from "util";

export interface BuyTradeRequest {
  userID: string;
  time: number;
  price: number;
  amount: number;
  type: 'buy';
}

export interface SellTradeRequest {
  userID: string;
  time: number;
  price: number;
  amount: number;
  stocks: Stock[];
  type: 'sell';
}

export interface Stock {
  price: number;
  amount: number;
}

export type TradeRequest = SellTradeRequest | BuyTradeRequest;

interface MarketState {
  reqs: TradeRequest[];
  stockPrice: number;
}

interface Trade {
  buyer: string;
  seller: string;
  buyerGain: number;
  sellerYield: number;
  price: number;
  amount: number;
}

var state: MarketState = {
  reqs: [],
  stockPrice: 0
};

export async function saveMarket() {
  return util.promisify(fs.writeFile)("market.json", JSON.stringify(state));
}

export function loadMarket() {
  if (fs.existsSync("market.json")) {
    state = JSON.parse(fs.readFileSync("market.json", "utf8"));
    console.log("market.json loaded");
  } else {
    console.log("market.json not loaded. starting with default database");
  }
}

export function reduceStock(stocks: Stock[], amount: number) {
  var rem = amount;
  const out = [];
  while (rem > 0 && stocks.length !== 0) {
    const take = Math.min(stocks[0].amount, rem);
    if (take === stocks[0].amount) {
      out.push(Object.assign({}, stocks[0]));
      stocks.shift();
    } else {
      out.push({ price: stocks[0].price, amount: take });
      stocks[0].amount -= take;
    }
    rem -= take;
  }
  return out;
}

function calculateYield(stocks: Stock[], price: number) {
  if (!stocks || stocks.length === 0) {
    return 0;
  }
  const weighted = stocks
    .map((index) => {
      const neww = index.amount * price;
      const orii = index.amount * index.price;
      return (index.amount * (neww - orii)) / orii * 100.0;
    })
    .reduce((x, y) => x + y);
  const total = stocks
    .map((index) => index.amount)
    .reduce((x, y) => x + y);
  return weighted / total;
}

export function addRequest(req: TradeRequest) {
  req.time = Date.now();
  state.reqs.push(req);
}

export function sellingPrice() {
  if (state.reqs
    .filter(req => req.type === 'sell').length === 0) {
      return -53;
  }
  const weighted = state.reqs
    .filter(req => req.type === 'sell')
    .map((req) => req.amount * req.price)
    .reduce((x, y) => x + y);

  const total = state.reqs
    .filter(req => req.type === 'sell')
    .map((req) => req.amount)
    .reduce((x, y) => x + y);

  return weighted / total;
}

export function stockPrice() {
  return state.stockPrice;
}

export function buyingPrice() {
  if (state.reqs
    .filter(req => req.type === 'buy').length === 0) {
      return -53;
  }

  const weighted = state.reqs
    .filter(req => req.type === 'buy')
    .map((req) => req.amount * req.price)
    .reduce((x, y) => x + y);

  const total = state.reqs
    .filter(req => req.type === 'buy')
    .map((req) => req.amount)
    .reduce((x, y) => x + y);

  return weighted / total;
}

export function processTradeRequests() {
  const buyQueue = new TinyQueue([], (a, b) => (a.price - b.price));
  const sellQueue = new TinyQueue([], (a, b) => (b.price - a.price));
  state.reqs.filter(req => req.type === 'sell').forEach(req => sellQueue.push(req));
  state.reqs.filter(req => req.type === 'buy').forEach(req => buyQueue.push(req));
  console.log(state.reqs);
  const dones: Trade[] = [];
  for (const req of state.reqs) {
    if (req.amount <= 0) continue;
    if (req.type === 'buy') {
      while (req.amount > 0) {
        if (sellQueue.length === 0) break;
        const selling = sellQueue.peek();
        if (selling.amount === 0) {
          sellQueue.pop();
          continue;
        }
        if (req.price < selling.price) break;

        const doneAmount = Math.min(req.amount, selling.amount);
        const donePrice = selling.price;
        let sellerYield = 0;
        if (req.amount >= selling.amount) {
          req.amount -= selling.amount;
          selling.amount = 0;
          sellerYield = calculateYield(selling.stocks, donePrice);
          selling.stocks = [];
          sellQueue.pop();
        } else {
          const rr = reduceStock(selling.stocks, doneAmount);
          sellerYield = calculateYield(rr, donePrice);
          selling.amount -= req.amount;
          req.amount = 0;
        }
        dones.push({
          buyer: req.userID,
          seller: selling.userID,
          buyerGain: (req.price - donePrice) * doneAmount,
          sellerYield: sellerYield,
          price: donePrice,
          amount: doneAmount
        });
      }
    } else {
      while (req.amount > 0) {
        if (buyQueue.length === 0) break;
        const buying = buyQueue.peek();
        if (buying.amount === 0) {
          buyQueue.pop();
          continue;
        }
        if (req.price > buying.price) break;

        const doneAmount = Math.min(req.amount, buying.amount);
        const donePrice = buying.price;
        let sellerYield = 0;
        if (req.amount >= buying.amount) {
          req.amount -= buying.amount;
          buying.amount = 0;
          const rr = reduceStock(req.stocks, doneAmount);
          sellerYield = calculateYield(rr, donePrice);
          buyQueue.pop();
        } else {
          buying.amount -= req.amount;
          req.amount = 0;
          sellerYield = calculateYield(req.stocks, donePrice);
          req.stocks = [];
        }
        dones.push({
          buyer: buying.userID,
          seller: req.userID,
          buyerGain: 0,
          sellerYield: sellerYield,
          price: donePrice,
          amount: doneAmount
        });
      }
    }
  }
  state.reqs = state.reqs.filter(req => req.amount !== 0);
  if (dones.length !== 0) {
    const weighted = dones
      .map((req) => req.amount * req.price)
      .reduce((x, y) => x + y);

    const total = dones
      .map((req) => req.amount)
      .reduce((x, y) => x + y);

    state.stockPrice = weighted / total;
  }
  return dones;
}

export function processIndex(indexPrice) {
  const buys = state.reqs.filter(req => req.type === 'buy').length;
  const sells = state.reqs.filter(req => req.type === 'sell').length;
  const amount = Math.floor(Math.random() * 100);
  addRequest({
    type: 'sell',
    amount: amount,
    price: indexPrice,
    time: Date.now(),
    userID: 'system',
    stocks: [{amount: amount, price: indexPrice + 1}]
  });

  const amount2 = Math.floor(Math.random() * 100);
  addRequest({
    type: 'buy',
    amount: amount2,
    price: indexPrice - 1,
    time: Date.now(),
    userID: 'system'
  });
}
