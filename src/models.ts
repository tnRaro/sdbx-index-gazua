export interface BuyTradeRequest {
  userId: string;
  time: number;
  price: number;
  amount: number;
  type: "buy";
}

export interface SellTradeRequest {
  userId: string;
  time: number;
  price: number;
  amount: number;
  stocks: Stock[];
  type: "sell";
}

export interface Stock {
  price: number;
  amount: number;
}

export type TradeRequest = SellTradeRequest | BuyTradeRequest;

export interface User {
  userId: string;
  money: number;
  trades: TradeRequest[];
  stocks: Stock[];
}

export interface TradeLog {
  buyerId: string;
  sellerId: string;
  buyerGain: number;
  sellerYield: number;
  price: number;
  amount: number;
}

interface HogaSection {
  start: number;
  end: number;
  count: number;
}

export interface Hoga {
  buys: HogaSection[];
  sells: HogaSection[];
  stockPrice: number;
}

export interface PlayerGroup {
  users: User[];
}

export function getAmount(user: User) {
  if (!user.stocks || user.stocks.length === 0) {
    return 0;
  }
  return user.stocks.map((index) => index.amount).reduce((x, y) => x + y);
}

export function addStock(user: User, amount, currentPrice) {
  if (!user.stocks) {
    user.stocks = [];
  }
  user.stocks.push({ price: currentPrice, amount: amount });
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
