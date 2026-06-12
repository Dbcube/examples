/**
 * 09 — MongoDB: same API, document engine.
 *
 * Requires a MongoDB instance. For transactions you need a replica set —
 * a single-node one is enough:
 *     docker run -d --name mongo-rs -p 27017:27017 mongo:7 mongod --replSet rs0
 *     docker exec mongo-rs mongosh --quiet --eval "rs.initiate()"
 *
 * Then uncomment the `mongo_app` entry in dbcube.config.js and run this file.
 */
const { dbcube } = require('dbcube');

async function main() {
    let db;
    try {
        db = dbcube.database('mongo_app');
    } catch (e) {
        console.log('⏭️  Skipped: add a `mongo_app` entry to dbcube.config.js first.');
        console.log('   ', e.message);
        process.exit(0);
    }

    // Clean slate (collections are dropped via raw command documents)
    for (const coll of ['users', 'settings']) {
        try { await db.raw(JSON.stringify({ drop: coll })); } catch { /* didn't exist */ }
    }

    // The exact same builder API works on MongoDB.
    // Note: MongoDB has no autoincrement — provide ids yourself if you need them.
    await db.table('users').insert([
        { id: 1, name: 'Ada', age: 36, status: 'active' },
        { id: 2, name: 'Linus', age: 54, status: 'active' },
        { id: 3, name: 'Grace', age: 85, status: 'inactive' },
    ]);

    const old = await db.table('users').where('age', '>', 50).orderBy('age', 'DESC').get();
    console.log('where + orderBy:', old.map(u => u.name));

    // LIKE works (translated to an anchored case-insensitive regex)
    const ada = await db.table('users').where('name', 'LIKE', 'ad%').first();
    console.log('LIKE:', ada?.name);

    // Atomic $inc
    await db.table('users').where('id', '=', 1).increment('age', 1);

    // upsert → native update command with upsert:true
    await db.table('settings').upsert([{ key: 'theme', value: 'dark' }], ['key']);
    await db.table('settings').upsert([{ key: 'theme', value: 'light' }], ['key']);
    console.log('upsert rows:', await db.table('settings').count());

    // Aggregations
    console.log('count:', await db.table('users').count(), '· avg age:', await db.table('users').avg('age'));

    // Transactions (replica set required)
    try {
        await db.transaction(async (trx) => {
            await trx.table('users').where('id', '=', 1).update({ status: 'tx' });
            await trx.table('users').where('id', '=', 2).update({ status: 'tx' });
        });
        console.log('transaction committed ✅');
    } catch (e) {
        console.log('⚠️ transactions need a replica set →', e.message);
    }

    // Raw command documents for anything driver-specific
    const res = await db.raw(JSON.stringify({
        find: 'users', filter: { status: 'tx' }
    }));
    console.log('raw find:', (res[0]?.cursor?.firstBatch ?? []).length, 'docs in tx status');

    process.exit(0);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
