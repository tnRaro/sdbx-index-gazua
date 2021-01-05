interface Index {
    price: number;
    amount: number;
}

interface User {
    money: number;
    indices?: Index[];
}

export function getYield(user: User, currentPrice) {
    if (!user.indices || user.indices.length === 0) {
        return 0;
    }
    const weighted = user.indices.map(index => index.amount * index.price / currentPrice).reduce((x,y) => x+y);
    const total = user.indices.map(index => index.amount).reduce((x,y) => x+y);
    return weighted / total;
}

export function getAmount(user: User) {
    if (!user.indices || user.indices.length === 0) {
        return 0;
    }
    return user.indices.map(index => index.amount).reduce((x,y) => x+y);
}

export function sell(user: User, amount, currentPrice) {
    if (!user.indices) {
        user.indices = [];
    }
    if (user.indices.length === 0) {
        return;
    }
    var rem = amount;
    while (rem > 0) {
        const take = Math.min(user.indices[0].amount, rem);
        if (take === user.indices[0].amount) {
            user.indices.shift();
        } else {
            user.indices[0].amount -= take;
        }
        rem -= take;
    }
    user.money += amount * currentPrice;
}

export function buy(user: User, amount, currentPrice) {
    user.money -= amount * currentPrice;
    if (!user.indices) {
        user.indices = [];
    }
    user.indices.push({price: currentPrice, amount: amount});
}