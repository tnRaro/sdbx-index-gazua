const express = require('express')
const bodyParser = require('body-parser')
const fs = require('fs')
const app = express()
const cors = require("cors")
const port = process.env.STATS_PORT

app.use(bodyParser.text());
app.use(cors());

const MAX_ROWS = 60*24*14;

let rows = [];

if (fs.existsSync("data.csv")) {
    const content = fs.readFileSync("data.csv", "utf8");
    rows = content.split("\n");
    rows.shift(); 
    console.log("data.csv loaded");
}

function serialize() {
    return 'timestamp,stockPrice\n' + rows.join('\n');
}

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
  res.send(serialize());
})

app.post('/insert', (req, res) => {
    if (!req.headers.authorization) { 
        res.sendStatus(403);
        return;
    }
    if (req.headers.authorization !== process.env.STATS_SECRET) {
        res.sendStatus(403);
        return;
    }
    rows.push(req.body);
    if (rows.length > MAX_ROWS) {
        rows = rows.slice( rows.length - MAX_ROWS,rows.length);
    }
    fs.writeFileSync("data.csv", serialize());
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})
