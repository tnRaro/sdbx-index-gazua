import { Stock } from "./market";

interface User {
  money: number;
  stocks?: Stock[];
}

export function getAmount(user: User) {
  if (!user.stocks || user.stocks.length === 0) {
    return 0;
  }
  return user.stocks
    .map((index) => index.amount)
    .reduce((x, y) => x + y);
}

export function addStock(user: User, amount, currentPrice) {
  if (!user.stocks) {
    user.stocks = [];
  }
  user.stocks.push({ price: currentPrice, amount: amount });
}
