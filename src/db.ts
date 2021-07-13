import * as fs from "fs";
import { User } from "./models";

const sqlite3 = require("sqlite3").verbose();
let db;

export function initDb() {
  const shouldCreate = !fs.existsSync("db.db");
  db = new sqlite3.Database("db.db");
  if (shouldCreate) {
    db.serialize(function () {
      db.run(`CREATE TABLE users (
          userId TEXT PRIMARY KEY,
          blob TEXT NOT NULL
        );`);
      db.run(`CREATE TABLE stockPrices (
        time INTEGER PRIMARY KEY,
        stockPrice REAL NOT NULL,
        tibyteIndex INTEGER NOT NULL
      );`);
    });
  }
}

export async function loadUsers() {
  return new Promise<User[]>((resolve, reject) => {
    db.all(`SELECT * from users`, [], (err, rows) => {
      const out = [];
      if (err) {
        reject(err);
      }
      rows.forEach((row) => {
        const user = JSON.parse(row.blob);
        user.userId = row.userId;
        out.push(user);
      });
      resolve(out);
    });
  });
}

export async function insertUser(user: User) {
  return new Promise<void>((resolve, reject) => {
    db.run(
      `INSERT into users(userId, blob) VALUES (?, ?)`,
      [user.userId, JSON.stringify(user)],
      (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      }
    );
  });
}

export async function updateUser(user: User) {
  return new Promise<void>((resolve, reject) => {
    db.run(
      `UPDATE users SET blob = ? WHERE userID = ?`,
      [JSON.stringify(user), user.userId],
      (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      }
    );
  });
}

export async function loadStockPrices() {
  return new Promise<
    { time: number; stockPrice: number; tibyteIndex: number }[]
  >((resolve, reject) => {
    db.all(`SELECT * from stockPrices`, [], (err, rows) => {
      const out = [];
      if (err) {
        reject(err);
      }
      rows.forEach((row) => {
        out.push({
          time: row.time,
          stockPrice: row.stockPrice,
          tibyteIndex: row.tibyteIndex,
        });
      });
      resolve(out);
    });
  });
}

export async function insertStockPrice(
  time: number,
  stockPrice: number,
  index: number
) {
  return new Promise<void>((resolve, reject) => {
    db.run(
      `INSERT into stockPrices(time, stockPrice, tibyteIndex) VALUES (?, ?, ?)`,
      [time, stockPrice, index],
      (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      }
    );
  });
}
