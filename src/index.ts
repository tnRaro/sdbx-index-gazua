import * as Discord from 'discord.js'; 
import { getCurrentPrice, isDead, startBankWorker, updateCurrentPrice } from './bank';
import { DEFAULT_INDEX_AMOUNT } from './consts';
import { existsUser, getUser, loadDB, logTransaction, setUser, startDBWorker } from './db';
import { buy, getAmount, getYield, sell } from './user';

const client = new Discord.Client();

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

function parseNum(str) {
    try {
        const out = parseFloat(str);
        if (isNaN(out)) {
            return null;
        }
        return out;
    } catch(e) {
        return null;
    } 
}

client.on('message', msg => {
    const userId = msg.author.id;
    const ii = getCurrentPrice();
    if (userId === client.user.id) {
        return;
    }

    if (!existsUser(userId)) {
        setUser(userId, {
            money: ii *  DEFAULT_INDEX_AMOUNT
        });
    }

    const user = getUser(userId);

    const cc = msg.content.split(" ");
    if (!cc[0].startsWith("$")) {
        return;
    }
    cc[0] = cc[0].substr(1);
    switch (cc[0]) {
        case 'buy': {
            if (cc.length !== 2) {
                return;
            }
            if (user.money === 0) {
                return;
            }
            if (isDead()) {
                return;
            }

            if (cc[1] === "full") {
                const amount = user.money/ii;
                buy(user, amount, ii);
                logTransaction('buy', userId, amount, ii);
            } else {
                const amount = parseNum(cc[1]);
                if (amount == null) {
                    return;
                }
                if (amount <= 0) {
                    return;
                }
                if (ii * amount > user.money) {
                    return;
                }
                buy(user, amount, ii);
                logTransaction('buy', userId, amount, ii);
            }

            msg.reply("매수 성공");
            setUser(userId, user);
            break;
        }
        case 'sell': {
            if (cc.length !== 2) {
                return;
            }
            const amount = getAmount(user);
            if (amount === 0) {
                return;
            }
            if (isDead()) {
                return;
            }

            if (cc[1] === "full") {
                sell(user, amount, ii);
                logTransaction('sell', userId, amount, ii);
            } else {
                const amount = parseNum(cc[1]);
                if (amount == null) {
                    return;
                }
                if (amount <= 0) {
                    return;
                }
                if (amount > getAmount(user)) {
                    return;
                }
                sell(user, amount, ii);
                logTransaction('sell', userId, amount, ii);
            }

            msg.reply("매도 성공");
            setUser(userId, user);
            break;
        }
        case 'info': {
            msg.reply(`현재 1 인덱스 가격: ${ii}\n당신의 잔고: ${user.money}\n당신의 인덱스 수: ${getAmount(user)}\n당신의 수익률: ${getYield(user, ii)}\n최대 매수 인덱스 수: ${user.money/ii}`);
            break;
        }
        case 'help': {
            msg.reply(`$info\n$sell (인덱스 수)\n$buy (인덱스 수)\n$sell full\n$buy full`);
            break;
        }
    }
});


(async () => {
    await loadDB();
    startDBWorker();
    await updateCurrentPrice();
    startBankWorker();
    client.login(process.env.BOT_TOKEN);
})();
