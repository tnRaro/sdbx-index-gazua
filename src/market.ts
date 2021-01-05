import TinyQueue from "tinyqueue";

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
  reqs: []
};

function reduceStock(stocks: Stock[], amount: number) {
  var rem = amount;
  const out = [];
  while (rem > 0 || stocks.length === 0) {
    const take = Math.min(stocks[0].amount, rem);
    if (take === stocks[0].amount) {
      stocks.shift();
      out.push(Object.assign({}, stocks[0]));
    } else {
      stocks[0].amount -= take;
      out.push({ price: stocks[0].price, amount: take });
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

export function processTradeRequests() {
  const buyQueue = new TinyQueue([], (a, b) => (a.price - b.price));
  const sellQueue = new TinyQueue([], (a, b) => (b.price - a.price));
  state.reqs.filter(req => req.type === 'sell').forEach(req => sellQueue.push(req));
  state.reqs.filter(req => req.type === 'buy').forEach(req => buyQueue.push(req));

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
        var sellerYield = 0;
        if (req.amount >= selling.amount) {
          selling.amount = 0;
          sellerYield = calculateYield(selling.stocks, donePrice);
          req.amount -= selling.amount;
          sellQueue.pop();
        } else {
          req.amount = 0;
          const rr = reduceStock(selling.stocks, doneAmount);
          sellerYield = calculateYield(rr, donePrice);
          selling.amount -= req.amount;
          selling.stocks = [];
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
        var sellerYield = 0;
        if (req.amount >= buying.amount) {
          buying.amount = 0;
          req.amount -= buying.amount;
          const rr = reduceStock(req.stocks, doneAmount);
          sellerYield = calculateYield(rr, donePrice);
          buyQueue.pop();
        } else {
          req.amount = 0;
          buying.amount -= req.amount;
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
  return dones;
}

function system() {

}
