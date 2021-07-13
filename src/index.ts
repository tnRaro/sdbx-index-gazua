import * as Discord from "discord.js";
import { getCurrentPrice, startBankWorker, updateCurrentPrice } from "./bank";
import {
  BOT_UPDATE_MS,
  DEFAULT_INDEX_AMOUNT,
  MARKET_UPDATE_MS,
} from "./consts";
import {
  initDb,
  insertStockPrice,
  insertUser,
  loadStockPrices,
  loadUsers,
  updateUser,
} from "./db";

import {
  cancelSystemExpires,
  getHoga,
  processIndex,
  processTradeRequests,
  stockPrice,
} from "./market";
import { addStock, getAmount, reduceStock } from "./models";
import { User } from "./models";

const useridToUsername = {};
const client = new Discord.Client();

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

function parseNum(str) {
  try {
    const out = parseInt(str);
    if (isNaN(out)) {
      return null;
    }
    return out;
  } catch (e) {
    return null;
  }
}

function sendSystemMsg(msg) {
  (client.channels.cache.get(process.env.BOT_CHAN) as any).send(msg);
}

let nextMarketUpdateTime = Date.now() + MARKET_UPDATE_MS;

function startSystemWorker() {
  setInterval(() => {
    updateMarket();
    cancelSystemExpires();

    nextMarketUpdateTime = Date.now() + MARKET_UPDATE_MS;
  }, MARKET_UPDATE_MS);
  setInterval(() => {
    if (stockPrice() !== 0) {
      const errie = (stockPrice() - getCurrentPrice()) / getCurrentPrice();

      if (errie > -0.5 && errie < 1.53) {
        processIndex(stockPrice());
      }
    }
    processIndex(getCurrentPrice());
  }, BOT_UPDATE_MS);
}

async function updateMarket() {
  const users = await loadUsers();
  const dones = processTradeRequests({ users: users });
  const userMap = {};
  users.forEach((user, index) => {
    userMap[user.userId] = index;
  });
  // hack
  users.push({ userId: "system", money: 0, trades: [], stocks: [] });
  userMap["system"] = users.length - 1;
  let msg = "";
  let weighted = 0;
  let total = 0;

  const tradeMap = {};
  const uu = new Set();
  dones.forEach((req) => {
    total += req.amount;
    weighted += req.amount * req.price;
    if (req.buyerId === "system" && req.sellerId === "system") {
      return;
    }
    uu.add(req.buyerId);
    uu.add(req.sellerId);
    const buyer = users[userMap[req.buyerId]];
    const seller = users[userMap[req.sellerId]];

    const optionalCheck = (x) => {
      if (x) {
        return x.tag;
      }
      return "unknown";
    };
    const buyerName =
      req.buyerId === "system"
        ? "system"
        : optionalCheck(client.users.cache.get(req.buyerId));
    const sellerName =
      req.sellerId === "system"
        ? "system"
        : optionalCheck(client.users.cache.get(req.sellerId));
    buyer.money += req.buyerGain;
    seller.money += req.amount * req.price;
    addStock(buyer, req.amount, req.price);
    const key = req.buyerId + " " + req.sellerId;
    const wyield = req.amount * req.sellerYield;
    if (!(key in tradeMap)) {
      tradeMap[key] = {
        buyer: req.buyerId,
        seller: req.sellerId,
        buyerName: buyerName,
        sellerName: sellerName,
        amount: req.amount,
        wamount: 0,
        wyield: 0,
      };
      if (wyield) {
        tradeMap[key].wamount += req.amount;
        tradeMap[key].wyield += wyield;
      }
    } else {
      tradeMap[key].amount += req.amount;
      if (wyield) {
        tradeMap[key].wamount += req.amount;
        tradeMap[key].wyield += wyield;
      }
    }
  });
  for (let key in tradeMap) {
    const info = tradeMap[key];
    if (info.buyer !== "system" || info.seller !== "system") {
      const yield_ = Math.round((1000 * info.wyield) / info.wamount) / 1000.0;
      msg += `${info.sellerName}가 ${info.buyerName}에게 ${info.amount}주를 팔았습니다. (수익률: ${yield_}%)\n`;
    }
  }

  uu.forEach((x: string) => {
    if (x !== "system") {
      updateUser(users[userMap[x]])
        .catch((e) => console.error(e))
        .then(() => {});
    }
  });
  insertStockPrice(Date.now(), stockPrice(), getCurrentPrice());
  if (msg !== "") {
    msg = `주가: ${stockPrice()}\n` + msg;
    if (msg.length > 1500) {
      msg = msg.substring(0, 1500);
    }
    sendSystemMsg(msg);
  }
}

client.on("message", async (msg) => {
  const userId = msg.author.id;
  useridToUsername[userId] = msg.author.tag;
  const ii = getCurrentPrice();
  if (userId === client.user.id) {
    return;
  }

  const users = await loadUsers();
  let user: User | undefined;
  if (!users.find((x) => x.userId === userId)) {
    user = {
      userId: userId,
      money: 1500 * DEFAULT_INDEX_AMOUNT,
      stocks: [],
      trades: [],
    };
    insertUser({
      userId: userId,
      money: 1500 * DEFAULT_INDEX_AMOUNT,
      stocks: [],
      trades: [],
    });
  } else {
    user = users.find((x) => x.userId === userId);
  }
  const cc = msg.content.split(" ");
  if (!cc[0].startsWith("$")) {
    return;
  }
  cc[0] = cc[0].substr(1);
  switch (cc[0]) {
    case "cancel": {
      user.trades.forEach((trade) => {
        if (trade.type === "buy") {
          user.money += trade.amount * trade.price;
        } else {
          user.stocks = user.stocks.concat(trade.stocks);
        }
      });
      user.trades = [];
      msg.reply("만료 성공");
      await updateUser(user);
      break;
    }
    case "buy": {
      if (cc.length !== 3) {
        return;
      }
      if (user.money === 0) {
        return;
      }

      const price = parseNum(cc[1]);
      if (price == null) {
        return;
      }
      if (price <= 0) {
        return;
      }

      var amount;
      if (cc[2] === "full") {
        amount = Math.floor(user.money / price);
        if (amount === 0) {
          return;
        }
      } else {
        amount = parseNum(cc[2]);
        if (amount == null) {
          return;
        }
        if (amount <= 0) {
          return;
        }
        if (price * amount > user.money) {
          return;
        }
      }
      user.money -= price * amount;

      user.trades.push({
        type: "buy",
        amount: amount,
        price: price,
        userId: userId,
        time: Date.now(),
      });

      msg.reply("매수 요청 성공");
      await updateUser(user);
      break;
    }
    case "hoga": {
      const hoga = getHoga({ users: users }, 5);
      let msg2 = "";
      if (hoga) {
        hoga.buys.forEach((x) => {
          if (x.count != 0) {
            msg2 += `${x.start}-${x.end} (${x.count} 개)\n`;
          }
        });
        msg2 += "-----------------------------\n";
        hoga.sells.forEach((x) => {
          if (x.count != 0) {
            msg2 += `${x.start}-${x.end} (${x.count} 개)\n`;
          }
        });
        msg.reply(msg2);
      }
      break;
    }
    case "sell": {
      if (cc.length !== 3) {
        return;
      }
      let amount: any = getAmount(user);
      if (amount === 0) {
        return;
      }

      const price = parseNum(cc[1]);
      if (price == null) {
        return;
      }
      if (price <= 0) {
        return;
      }

      if (cc[2] !== "full") {
        amount = parseNum(cc[2]);
        if (amount == null) {
          return;
        }
        if (amount <= 0) {
          return;
        }
        if (amount > getAmount(user)) {
          return;
        }
      }

      const rr = reduceStock(user.stocks, amount);
      user.trades.push({
        type: "sell",
        amount: amount,
        price: price,
        userId: userId,
        time: Date.now(),
        stocks: rr,
      });

      msg.reply("매도 요청 성공");
      await updateUser(user);
      break;
    }
    case "info": {
      let out = "\n";
      out += `다음 거래 체결까지 ${Math.floor(
        (nextMarketUpdateTime - Date.now()) / 1000
      )}초 남았습니다\n`;
      out += `주가: ${stockPrice()}\n`;
      out += `현재 인덱스: ${ii}\n`;
      out += `당신의 잔고: ${user.money}\n`;
      out += `당신의 주식 수: ${getAmount(user)}\n`;
      msg.reply(out);
      break;
    }
    case "reqs": {
      const buys = user.trades.filter((req) => req.type === "buy");
      const sells = user.trades.filter((req) => req.type === "sell");
      let out = "\n";
      out += "매수 요청\n================\n";
      buys.forEach((req) => {
        out += `주식수: ${req.amount} 호가: ${req.price}\n`;
      });
      out += "매도 요청\n================\n";
      sells.forEach((req) => {
        out += `주식수: ${req.amount} 호가: ${req.price}\n`;
      });
      msg.reply(out);
      break;
    }
    case "guide": {
      msg.reply(
        "\n$info로 현재 시장의 상황과 자신의 자산을 확인 할 수 있습니다.\n $hoga로 호가표를 볼수 있고 \n $buy로 주식을 사고 싶다고 매수 요청을 올리고 \n $sell로 주식을 팔고 싶다고 매도 요청을 올립니다.\n 1분마다 사람과 봇들의 매도 매수 요청이 적절하게 맽어지면서 거래가 채결됩니다.\n $reqs로 자신의 매도 매수 요청의 리스트를 볼 수 있고 $cancel 자신의 모든 매도 매수 요청을 취소할 수 있습니다."
      );
      break;
    }
    case "help": {
      msg.reply(
        `\n$guide\n$info\n$hoga\n$sell (가격) (주식 수)\n$buy (가격) (주식 수)\n$sell (가격) full\n$buy (가격) full\n$reqs\n$cancel\n`
      );
      break;
    }
  }
});

const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.STATS_PORT;

app.use(cors());
app.get("/", async (req, res) => {
  const rows = await loadStockPrices();
  res.setHeader("Content-Type", "text/plain");
  const body = rows
    .map((x) => `${x.time},${x.stockPrice},${x.tibyteIndex}`)
    .join("\n");
  res.send("time,stockPrice,tibyteIndex\n" + body);
});

(async () => {
  initDb();
  await updateCurrentPrice();
  startBankWorker();
  startSystemWorker();
  useridToUsername["system"] = "system";
  client.login(process.env.BOT_TOKEN);
  app.listen(port);
})();
