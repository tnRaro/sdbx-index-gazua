import * as Discord from "discord.js";
import {
  getCurrentPrice,
  isDead,
  startBankWorker,
  updateCurrentPrice,
} from "./bank";
import { DEFAULT_INDEX_AMOUNT } from "./consts";
import {
  existsUser,
  getUser,
  loadDB,
  logTransaction,
  setUser,
  startDBWorker,
} from "./db";
import { addRequest, buyingPrice, loadMarket, processIndex, processTradeRequests, reduceStock, saveMarket, sellingPrice, stockPrice } from "./market";
import { addStock, getAmount } from "./user";


const useridToUsername = {};
const client = new Discord.Client();

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

function parseNum(str) {
  try {
    const out = parseFloat(str);
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

function startSystemWorker() {
  setInterval(() => {
    saveMarket().catch(e => console.error(e));
  }, 1000);
  setInterval(() => {
    updateMarket();
  }, 60* 1000);
  setInterval(() => {
    processIndex(getCurrentPrice());
  }, 30 * 1000 * 60);
}

function updateMarket() {
  const dones = processTradeRequests();
  let msg = '';
  let weighted = 0;
  let total = 0;
  dones.forEach(req => {
    const buyer = getUser(req.buyer);
    const seller = getUser(req.seller);
    const buyerName = useridToUsername[req.buyer];
    const sellerName = useridToUsername[req.seller];
    buyer.money += req.buyerGain;
    seller.money += req.amount * req.price;
    total += req.amount;
    weighted += req.amount * req.price;
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
      money: ii * DEFAULT_INDEX_AMOUNT,
    });
  }

  const user = getUser(userId);

  const cc = msg.content.split(" ");
  if (!cc[0].startsWith("$")) {
    return;
  }
  cc[0] = cc[0].substr(1);
  switch (cc[0]) {
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
      if (price === 0) {
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
      if (price === 0) {
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
      msg.reply(
        `주가: ${stockPrice()}\n현재 인덱스: ${ii}\n당신의 잔고: ${
          user.money
        }\n당신의 주식 수: ${getAmount(user)}\n매도시세: ${sellingPrice()}\n매수시세: ${buyingPrice()}\n`
      );
      break;
    }
    case "help": {
      msg.reply(
        `$info\n$sell (가격) (주식 수)\n$buy (가격) (주식 수)\n$sell full\n$buy full`
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
