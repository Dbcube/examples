/**
 * setup.js — creates a clean demo database for every example.
 *
 * Uses raw DDL for a self-contained setup. In a real project you would
 * define the schema in .cube files (see dbcube/cubes/) and run:
 *     npx dbcube run table:refresh
 */
const fs = require('fs');
const path = require('path');
const { dbcube } = require('dbcube');

async function main() {
    // Fresh SQLite file on every run
    for (const f of ['demo.db', 'demo.db-shm', 'demo.db-wal']) {
        try { fs.unlinkSync(path.join(__dirname, f)); } catch { /* not there */ }
    }
    fs.writeFileSync(path.join(__dirname, 'demo.db'), '');

    const db = dbcube.database('demo');

    await db.raw(`CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        age INTEGER,
        status TEXT DEFAULT 'active',
        balance INTEGER DEFAULT 0
    )`);

    await db.raw(`CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT,
        user_id INTEGER,
        product TEXT,
        total INTEGER
    )`);

    await db.raw(`CREATE TABLE settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT,
        key TEXT UNIQUE,
        value TEXT
    )`);

    await db.table('users').insert([
        { name: 'Ada Lovelace', email: 'ada@example.com', age: 36, status: 'active', balance: 1000 },
        { name: 'Linus Torvalds', email: 'linus@example.com', age: 54, status: 'active', balance: 500 },
        { name: 'Grace Hopper', email: 'grace@example.com', age: 85, status: 'inactive', balance: 2000 },
        { name: 'Alan Turing', email: 'alan@example.com', age: 41, status: 'active', balance: 750 },
    ]);

    await db.table('orders').insert([
        { user_id: 1, product: 'Analytical Engine', total: 1200 },
        { user_id: 1, product: 'Punch cards', total: 30 },
        { user_id: 2, product: 'Keyboard', total: 80 },
        { user_id: 4, product: 'Enigma replica', total: 450 },
    ]);

    console.log('✅ demo.db ready: 4 users, 4 orders');
    process.exit(0);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
