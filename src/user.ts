import { Stock } from "./market";

interface User {
  money: number;
  stocks?: Stock[];
}


export function sell(user: User, amount, currentPrice) {
  if (!user.stocks) {
    user.stocks = [];
  }
  if (user.stocks.length === 0) {
    return;
  }
  var rem = amount;
  while (rem > 0 || user.stocks.length === 0) {
    const take = Math.min(user.stocks[0].amount, rem);
    if (take === user.stocks[0].amount) {
      user.stocks.shift();
    } else {
      user.stocks[0].amount -= take;
    }
    rem -= take;
  }
  user.money += amount * currentPrice;
}

export function buy(user: User, amount, currentPrice) {
  user.money -= amount * currentPrice;
  if (!user.stocks) {
    user.stocks = [];
  }
  user.stocks.push({ price: currentPrice, amount: amount });
}
