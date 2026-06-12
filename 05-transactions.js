/**
 * 05 — Transactions: all-or-nothing writes.
 * Run `node setup.js` first.
 *
 * Everything executed through the `trx` connection commits atomically.
 * Any thrown error rolls the whole transaction back automatically.
 * Works on MySQL, PostgreSQL, SQLite and MongoDB (replica set).
 */
const { dbcube } = require('dbcube');

async function main() {
    const db = dbcube.database('demo');

    const before = await Promise.all([db.table('users').find(1), db.table('users').find(2)]);
    console.log('before:', before.map(u => `${u.name}: ${u.balance}`));

    // ── Successful transfer: both updates commit together ───────────────
    await db.transaction(async (trx) => {
        await trx.table('users').where('id', '=', 1).decrement('balance', 200);
        await trx.table('users').where('id', '=', 2).increment('balance', 200);
    });

    const after = await Promise.all([db.table('users').find(1), db.table('users').find(2)]);
    console.log('after transfer:', after.map(u => `${u.name}: ${u.balance}`));

    // ── Failed transfer: the throw rolls EVERYTHING back ────────────────
    try {
        await db.transaction(async (trx) => {
            await trx.table('users').where('id', '=', 1).decrement('balance', 999999);

            const payer = await trx.table('users').find(1); // reads see uncommitted changes
            if (payer.balance < 0) {
                throw new Error('Insufficient funds'); // → automatic ROLLBACK
            }

            await trx.table('users').where('id', '=', 2).increment('balance', 999999);
        });
    } catch (e) {
        console.log('transaction aborted ✅ →', e.message);
    }

    const final = await db.table('users').find(1);
    console.log(`Ada's balance untouched by the failed transfer: ${final.balance}`);

    process.exit(0);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
