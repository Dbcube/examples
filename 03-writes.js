/**
 * 03 — Every way to write data: insert, update, delete, upsert,
 *      atomic counters and truncate.
 * Run `node setup.js` first.
 */
const { dbcube } = require('dbcube');

async function main() {
    const db = dbcube.database('demo');

    // insert returns the inserted rows (with their generated ids/uuids)
    const inserted = await db.table('users').insert([
        { name: 'Katherine Johnson', email: 'katherine@example.com', age: 33 },
    ]);
    console.log('insert returned id:', inserted[0]?.id);

    // update requires a WHERE — this throws on purpose:
    try {
        await db.table('users').update({ status: 'x' });
    } catch (e) {
        console.log('mass update blocked ✅ →', e.message);
    }

    // upsert: insert, or update on conflict (key column must be UNIQUE)
    await db.table('settings').upsert([{ key: 'theme', value: 'dark' }], ['key']);
    await db.table('settings').upsert([{ key: 'theme', value: 'light' }], ['key']);
    const theme = await db.table('settings').where('key', '=', 'theme').first();
    console.log('upsert twice → single row with value:', theme.value);

    // increment / decrement: atomic, no read-modify-write race
    await db.table('users').where('id', '=', 1).increment('balance', 250);
    await db.table('users').where('id', '=', 2).decrement('balance', 100);
    const [ada, linus] = await Promise.all([
        db.table('users').find(1),
        db.table('users').find(2),
    ]);
    console.log(`balances → Ada: ${ada.balance} (+250) · Linus: ${linus.balance} (-100)`);

    // increment with extra columns updated in the same statement
    await db.table('users').where('id', '=', 1).increment('balance', 1, { status: 'vip' });

    // truncate: the ONLY write allowed without a WHERE (explicit destructive intent)
    await db.table('settings').truncate();
    console.log('settings truncated, rows left:', await db.table('settings').count());

    // cleanup
    await db.table('users').where('email', '=', 'katherine@example.com').delete();
    process.exit(0);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
