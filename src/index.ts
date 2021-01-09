import * as Discord from "discord.js";
import {
  getCurrentPrice,
  isDead,
  startBankWorker,
  updateCurrentPrice,
} from "./bank";
import fetch from "node-fetch";
import { DEFAULT_INDEX_AMOUNT } from "./consts";
import {
  existsUser,
  getUser,
  loadDB,
  logTransaction,
  setUser,
  startDBWorker,
} from "./db";
import { addRequest, buyingPrice, cancelExpires, cancelSystemExpires, getUserRequests, loadMarket, processIndex, processTradeRequests, reduceStock, saveMarket, sellingPrice, stockPrice } from "./market";
import { addStock, getAmount } from "./user";


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

function logStockPrice() {
  const row = `${Math.floor(Date.now()/1000)},${stockPrice()}`;
  fetch(process.env.BOT_STATS_URL + '/insert', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'Authorization': process.env.BOT_STATS_SECRET
    },
    body: row
  }).then(r => { if (!r.ok) {
    throw Error("incorrect stats secret");
  }}).catch(e => console.error(e));
}

let nextMarketUpdateTime;

function startSystemWorker() {
  setInterval(() => {
    saveMarket().catch(e => console.error(e));
  }, 1000);
  setInterval(() => {
    updateMarket();
    cancelSystemExpires();
    logStockPrice();
    nextMarketUpdateTime = Date.now() + 60*1000;
  }, 60 * 1000);
  setInterval(() => {
    if (stockPrice()!== 0) {
      const errie = (stockPrice() - getCurrentPrice())/getCurrentPrice();

      if (errie > -0.5 && errie < 1.53) {
        processIndex(stockPrice());
      }
    }
    processIndex(getCurrentPrice());
  }, 20*1000);
}

function updateMarket() {
  const dones = processTradeRequests();
  let msg = '';
  let weighted = 0;
  let total = 0;
  dones.forEach(req => {
    total += req.amount;
    weighted += req.amount * req.price;
    if (req.buyer === "system" && req.seller === "system") {
      return;
    }
    const buyer = getUser(req.buyer);
    const seller = getUser(req.seller);

    const optionalCheck = x => {
      if (x) {
        return x.tag;
      }
      return 'unknown';
    }
    const buyerName = req.buyer === "system" ? "system" :  optionalCheck(client.users.cache.get(req.buyer));
    const sellerName = req.seller === "system" ? "system" :  optionalCheck(client.users.cache.get(req.seller));
    buyer.money += req.buyerGain;
    seller.money += req.amount * req.price;
    addStock(buyer, req.amount, req.price);


    msg += `${sellerName}가 ${buyerName}에게 ${req.amount}주를 ${req.price}원에 팔았습니다. (수익률 ${req.sellerYield})\n`;
  });
  if (msg !== '') {
    msg = `주가: ${weighted/total}\n` + msg;
    sendSystemMsg(msg);
  }
}

client.on("message", (msg) => {
  const userId = msg.author.id;
  useridToUsername[userId] = msg.author.tag;
  const ii = getCurrentPrice();
  if (userId === client.user.id) {
    return;
  }

  if (!existsUser(userId)) {
    setUser(userId, {
      money: 1500 * DEFAULT_INDEX_AMOUNT,
    });
  }

  const user = getUser(userId);

  const cc = msg.content.split(" ");
  if (!cc[0].startsWith("$")) {
    return;
  }
  cc[0] = cc[0].substr(1);
  switch (cc[0]) {
    case "cancel": {
      const reqs = cancelExpires(userId);
      reqs.forEach(req => {
        if (req.type === "buy") {
          const user = getUser(req.userID);
          user.money += req.amount * req.price;
        } else {
          const user = getUser(req.userID);
          req.stocks.forEach(s => {
            addStock(user, s.amount, s.price);
          });
        }
      });
      if (reqs.length !== 0) {
        msg.reply("만료 성공");
      }
      break;
    }
    case "buy": {
      if (cc.length !== 3) {
        return;
      }
      if (user.money === 0) {
        return;
      }

      if (isDead()) {
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

      addRequest({
        type: 'buy',
        amount: amount,
        price: price,
        userID: userId,
        time: 0
      });

      msg.reply("매수 요청 성공");
      setUser(userId, user);
      break;
    }
    case "sell": {
      if (cc.length !== 3) {
        return;
      }
      var amount: any = getAmount(user);
      if (amount === 0) {
        return;
      }
      if (isDead()) {
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
      addRequest({
        type: 'sell',
        amount: amount,
        price: price,
        userID: userId,
        time: 0,
        stocks: rr
      });

      msg.reply("매도 요청 성공");
      setUser(userId, user);
      break;
    }
    case "info": {
      let out = '\n';
      out += `다음 거래 체결까지 ${Math.floor((nextMarketUpdateTime - Date.now())/1000)}초 남았습니다\n`;
      out += `주가: ${stockPrice()}\n`;
      out += `현재 인덱스: ${ii}\n`;
      out += `당신의 잔고: ${user.money}\n`;
      out += `당신의 주식 수: ${getAmount(user)}\n`;
      out += `매도시세: ${sellingPrice()}\n`;
      out += `매수시세: ${buyingPrice()}\n`;
      msg.reply(out);
      break;
    }
    case "reqs": {
      const reqs = getUserRequests(userId);
      const buys = reqs.filter(req => req.type === "buy");
      const sells = reqs.filter(req => req.type === "sell");
      let out = '\n';
      out += "매수 요청\n================\n"
      buys.forEach(req => {
        out += `주식수: ${req.amount} 호가: ${req.price}\n`;
      });
      out += "매도 요청\n================\n"
      sells.forEach(req => {
        out += `주식수: ${req.amount} 호가: ${req.price}\n`;
      });
      msg.reply(out);
      break;
    }
    case "guide": {
      msg.reply("\n$info로 현재 시장의 상황과 자신의 자산을 확인 할 수 있습니다.\n $buy로 주식을 사고 싶다고 매수 요청을 올리고 \n $sell로 주식을 팔고 싶다고 매도 요청을 올립니다.\n 1분마다 사람과 봇들의 매도 매수 요청이 적절하게 맽어지면서 거래가 채결됩니다.\n $reqs로 자신의 매도 매수 요청의 리스트를 볼 수 있고 $cancel 자신의 모든 매도 매수 요청을 취소할 수 있습니다.");
      break;
    }
    case "help": {
      msg.reply(
        `\n$guide\n$info\n$sell (가격) (주식 수)\n$buy (가격) (주식 수)\n$sell (가격) full\n$buy (가격) full\n$reqs\n$cancel\n`
      );
      break;
    }
  }
});

(async () => {
  await loadDB();
  loadMarket();
  startDBWorker();
  await updateCurrentPrice();
  startBankWorker();
  startSystemWorker();
  useridToUsername['system'] = 'system';
  client.login(process.env.BOT_TOKEN);
})();
