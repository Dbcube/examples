/**
 * 04 — Aggregations and big-dataset helpers.
 * Run `node setup.js` first.
 *
 * Aggregations execute immediately and return a number — they are NOT
 * chainable with .first()/.get().
 */
const { dbcube } = require('dbcube');

async function main() {
    const db = dbcube.database('demo');

    // count / sum / avg / max / min
    console.log('count:', await db.table('users').count());
    console.log('count active:', await db.table('users').where('status', '=', 'active').count());
    console.log('sum(balance):', await db.table('users').sum('balance'));
    console.log('avg(age):', await db.table('users').avg('age'));
    console.log('max(age):', await db.table('users').max('age'));
    console.log('min(age):', await db.table('users').min('age'));

    // exists(): SELECT 1 ... LIMIT 1 → boolean (cheaper than count > 0)
    console.log('any user over 80?', await db.table('users').where('age', '>', 80).exists());

    // groupBy + having + selectRaw
    const perStatus = await db.table('users')
        .selectRaw(['status', 'COUNT(*) AS n'])
        .groupBy('status')
        .having('n', '>', 0)
        .get();
    console.log('per status:', perStatus);

    // paginate(): items + metadata in one call
    const page = await db.table('users').orderBy('id', 'ASC').paginate(1, 2);
    console.log(`page 1/${page.totalPages}: ${page.items.map(u => u.name).join(', ')} · hasNext: ${page.hasNext}`);

    // chunk(): process large tables in batches without loading everything
    let processed = 0;
    await db.table('users').chunk(2, (rows, pageNum) => {
        processed += rows.length;
        console.log(`  chunk ${pageNum}: ${rows.length} rows`);
        // return false to stop early
    });
    console.log('chunked through', processed, 'rows');

    process.exit(0);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
