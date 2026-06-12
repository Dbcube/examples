/**
 * 06 — Eager loading with .with(): one batched query per relation, no N+1.
 * Run `node setup.js` first.
 *
 * Relations resolve automatically from the `foreign` definitions in your
 * .cube files (see dbcube/cubes/orders.table.cube), or explicitly via options.
 */
const { dbcube } = require('dbcube');

async function main() {
    const db = dbcube.database('demo');

    // hasMany: orders.user_id → users.id (auto-detected from the .cube foreign)
    const users = await db.table('users').with('orders').orderBy('id', 'ASC').get();
    for (const u of users) {
        console.log(`${u.name}: ${u.orders.length} order(s)`,
            u.orders.map(o => o.product));
    }

    // belongsTo: attach the parent as a single object (explicit options)
    const orders = await db.table('orders')
        .with('buyer', { table: 'users', foreignKey: 'user_id', type: 'one' })
        .get();
    for (const o of orders) {
        console.log(`"${o.product}" was bought by ${o.buyer?.name}`);
    }

    // Relations compose with every other clause
    const richBuyers = await db.table('users')
        .where('balance', '>', 400)
        .with('orders')
        .get();
    console.log('users with balance > 400 and their orders:',
        richBuyers.map(u => `${u.name} (${u.orders.length})`));

    process.exit(0);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
