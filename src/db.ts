import * as fs from "fs";
import * as util from "util";
import { v4 as uuidv4 } from "uuid";
var db = {};

const UPDATE_INTERVAL = 1000;

async function saveDB() {
  return util.promisify(fs.writeFile)("data.json", JSON.stringify(db));
}

export function loadDB() {
  if (fs.existsSync("data.json")) {
    db = JSON.parse(fs.readFileSync("data.json", "utf8"));
    console.log("data.json loaded");
  } else {
    console.log("data.json not loaded. starting with default database");
  }
}

export function startDBWorker() {
  setInterval(() => {
    saveDB().catch((e) => {
      console.error(e);
    });
  }, UPDATE_INTERVAL);
}

export function logTransaction(type, id, amount, currentPrice) {
  (async () => {
    if (!fs.existsSync("logs")) {
      fs.mkdirSync("logs");
    }
    const data = {
      time: Date.now(),
      currentPrice: currentPrice,
      userId: id,
      type: type,
      amount: amount,
    };
    return util.promisify(fs.writeFile)(
      `logs/${Date.now()}-${uuidv4()}.json`,
      JSON.stringify(data)
    );
  })().catch((e) => {
    console.error(e);
  });
}

export function existsUser(id) {
  return id in db;
}

export function getUser(id) {
  return db[id];
}

export function setUser(id, user) {
  db[id] = user;
}
