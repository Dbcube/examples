/**
 * 02 — Every way to read data.
 * Run `node setup.js` first.
 */
const { dbcube } = require('dbcube');

async function main() {
    const db = dbcube.database('demo');

    // select(): pick columns
    const names = await db.table('users').select(['id', 'name']).get();
    console.log('select:', names[0]);

    // where + orWhere
    const adaOrOld = await db.table('users')
        .where('name', 'LIKE', 'Ada%')
        .orWhere('age', '>', 80)
        .get();
    console.log('LIKE + orWhere:', adaOrOld.map(u => u.name));

    // whereGroup: parenthesized conditions → WHERE status='active' AND (age<40 OR age>80)
    const grouped = await db.table('users')
        .where('status', '=', 'active')
        .whereGroup(q => { q.where('age', '<', 40).orWhere('age', '>', 80); })
        .get();
    console.log('whereGroup:', grouped.map(u => u.name));

    // whereIn / whereNotIn / whereBetween / whereNull / whereNotNull
    const inList = await db.table('users').whereIn('id', [1, 2]).get();
    const notIn = await db.table('users').whereNotIn('status', ['inactive']).get();
    const between = await db.table('users').whereBetween('age', [30, 60]).get();
    console.log(`whereIn: ${inList.length} · whereNotIn: ${notIn.length} · between 30-60: ${between.length}`);

    // first / find
    const first = await db.table('users').orderBy('age', 'ASC').first();
    const byId = await db.table('users').find(3);            // by primary key
    const byEmail = await db.table('users').find('linus@example.com', 'email'); // by any column
    console.log('first:', first.name, '· find(3):', byId.name, '· find by email:', byEmail.name);

    // distinct
    const statuses = await db.table('users').select(['status']).distinct().get();
    console.log('distinct statuses:', statuses.map(s => s.status));

    // limit + offset (manual pagination)
    const page2 = await db.table('users').orderBy('id', 'ASC').limit(2).offset(2).get();
    console.log('limit/offset page 2:', page2.map(u => u.name));

    // joins (SQL engines)
    const withOrders = await db.table('orders')
        .join('users', 'orders.user_id', '=', 'users.id')
        .select(['orders.product', 'users.name'])
        .get();
    console.log('join:', withOrders.map(r => `${r.name} bought ${r.product}`));

    process.exit(0);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
