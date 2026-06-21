/**
 * 01 — Quickstart: connect, read, write.
 * Run `node setup.js` first.
 */
const { dbcube } = require('dbcube');

async function main() {
    // One Database instance per entry in dbcube.config.js
    const db = dbcube.database('demo');

    // Read
    const users = await db.table('users').get();
    console.log(`${users.length} users in the table`);

    // Filter + order + limit
    const active = await db.table('users')
        .where('status', '=', 'active')
        .orderBy('age', 'DESC')
        .limit(2)
        .get();
    console.log('Oldest active users:', active.map(u => u.name));

    // Insert (always an array — inserting many rows is one call)
    await db.table('users').insert([
        { name: 'Margaret Hamilton', email: 'margaret@example.com', age: 32 }
    ]);

    // Find by primary key
    const margaret = await db.table('users').where('email', '=', 'margaret@example.com').first();
    console.log('Inserted:', margaret.name, '→ id', margaret.id);

    // Update — a WHERE is mandatory (Dbcube refuses mass updates by accident)
    await db.table('users').where('id', '=', margaret.id).update({ status: 'active' });

    // Delete — same rule
    await db.table('users').where('id', '=', margaret.id).delete();
    console.log('Cleaned up. Done ✅');

    process.exit(0);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
