/**
 * 07 — raw(): the escape hatch for anything the builder doesn't cover.
 * Run `node setup.js` first.
 *
 * SQL engines: raw SQL with bound parameters (always use ? placeholders —
 * never interpolate values into the string).
 * MongoDB: raw is a JSON command document (db.runCommand).
 */
const { dbcube } = require('dbcube');

async function main() {
    const db = dbcube.database('demo');

    // Parameterized query — values travel as bind params, not string concat
    const rows = await db.raw(
        'SELECT name, age FROM users WHERE age > ? AND status = ? ORDER BY age DESC',
        [30, 'active']
    );
    console.log('raw select:', rows);

    // DDL / anything the builder doesn't model
    await db.raw('CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)');
    console.log('index created');

    // Engine-specific SQL (window functions, CTEs, ...)
    const ranked = await db.raw(`
        SELECT name, balance,
               RANK() OVER (ORDER BY balance DESC) AS wealth_rank
        FROM users LIMIT 3
    `);
    console.log('window function:', ranked);

    // MongoDB equivalent (needs a mongodb entry in dbcube.config.js):
    // const mongo = dbcube.database('mongo_app');
    // const res = await mongo.raw(JSON.stringify({
    //     find: 'users',
    //     filter: { age: { $gt: 30 } },
    //     sort: { age: -1 }
    // }));
    // console.log(res[0].cursor.firstBatch);

    process.exit(0);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
