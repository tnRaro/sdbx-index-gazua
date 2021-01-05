import fetch from 'node-fetch';
var currentPrice = 10;
var dead = false;

const UPDATE_INTERVAL = 1000;

export function isDead() {
    return dead;
}

export function getCurrentPrice() {
    return currentPrice;
}

export async function updateCurrentPrice() {
    return fetch("https://tibyte.net/sandi.txt?r="+Math.random())
        .then(x => {
            if (!x.ok) {
                throw Error(x.statusText);
            }
            return x;
        })
        .then(x => x.text())
        .then(text => {
            dead = false;
            currentPrice = parseFloat(text);
        })
        .catch(e => {
            dead = true;
        });
}

export function startBankWorker() {
    setInterval(() => { 
        updateCurrentPrice().catch(e => {
            console.error(e);
        });
    }, UPDATE_INTERVAL);
}
