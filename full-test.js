/**
 * full-test.js — exhaustive DBCube test against a REAL database.
 *
 * Usage:
 *     docker compose up -d --wait          (once)
 *     node full-test.js sqlite|mysql|postgres|mongodb
 *
 * Covers: every query-builder method and variant, transactions, edge cases
 * (unicode, quotes, nulls, big numbers, long strings), bulk inserts (TURBO
 * path), concurrency, and timing for every section.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { dbcube } = require('dbcube');

const ENGINE = (process.argv[2] || 'sqlite').toLowerCase();
const DB_NAMES = { sqlite: 'ft_sqlite', mysql: 'ft_mysql', postgres: 'ft_postgres', mongodb: 'ft_mongo', mongo: 'ft_mongo' };
const dbName = DB_NAMES[ENGINE];
if (!dbName) { console.error(`Motor desconocido: ${ENGINE}`); process.exit(1); }
const IS_MONGO = dbName === 'ft_mongo';
const PH = ENGINE === 'postgres' ? (i) => `$${i}` : () => '?';

let passed = 0, failed = 0;
const failures = [];
const sectionTimes = [];
let sectionStart = Date.now();
let currentSection = '';

function section(name) {
    if (currentSection) sectionTimes.push({ name: currentSection, ms: Date.now() - sectionStart });
    currentSection = name;
    sectionStart = Date.now();
    console.log(`\n━━ ${name} ━━`);
}

async function test(name, fn) {
    const t0 = Date.now();
    try {
        await fn();
        passed++;
        console.log(`  ✅ ${name} (${Date.now() - t0}ms)`);
    } catch (err) {
        failed++;
        failures.push({ name, err, section: currentSection });
        console.log(`  ❌ ${name}: ${err.message}`);
    }
}

async function main() {
    const suiteStart = Date.now();
    const db = dbcube.database(dbName);
    console.log(`\n🧪 DBCube FULL TEST — ${ENGINE} (${dbName})`);

    // ════════════════════════ SETUP ════════════════════════
    section('Setup de esquema');

    if (ENGINE === 'sqlite') {
        // Daemons residuales mantienen un handle sobre el .db en Windows y el
        // unlink fallaría en silencio → estado sucio entre corridas
        const { spawnSync } = require('child_process');
        if (process.platform === 'win32') {
            spawnSync('taskkill', ['/F', '/IM', 'query-engine-v1.1.0-windows-x64.exe'], { stdio: 'ignore' });
        } else {
            spawnSync('pkill', ['-f', 'query-engine'], { stdio: 'ignore' });
        }
        try { fs.rmSync(path.join(__dirname, '.dbcube', 'daemon'), { recursive: true, force: true }); } catch { /* */ }
        for (const f of ['fulltest.db', 'fulltest.db-shm', 'fulltest.db-wal']) {
            fs.rmSync(path.join(__dirname, f), { force: true });
        }
        fs.writeFileSync(path.join(__dirname, 'fulltest.db'), '');
    }

    if (IS_MONGO) {
        for (const c of ['users', 'orders', 'settings', 'bulk', 'edge']) {
            try { await db.raw(JSON.stringify({ drop: c })); } catch { /* ns not found */ }
        }
    } else {
        for (const t of ['orders', 'settings', 'bulk', 'edge', 'users']) {
            await db.raw(`DROP TABLE IF EXISTS ${t}`);
        }
        const ID = ENGINE === 'mysql' ? 'INT PRIMARY KEY AUTO_INCREMENT'
            : ENGINE === 'postgres' ? 'SERIAL PRIMARY KEY'
            : 'INTEGER PRIMARY KEY AUTOINCREMENT';
        const STR = (n) => ENGINE === 'sqlite' ? 'TEXT' : `VARCHAR(${n})`;
        await db.raw(`CREATE TABLE users (id ${ID}, uuid ${STR(64)}, name ${STR(255)} NOT NULL, email ${STR(190)} UNIQUE, age INT, status ${STR(20)} DEFAULT 'active', balance INT DEFAULT 0, bio TEXT, score ${ENGINE === 'sqlite' ? 'REAL' : 'DOUBLE PRECISION'}, joined_at ${ENGINE === 'mysql' ? 'DATETIME' : ENGINE === 'postgres' ? 'TIMESTAMP' : 'TEXT'})`);
        await db.raw(`CREATE TABLE orders (id ${ID}, uuid ${STR(64)}, user_id INT, product ${STR(255)}, total INT, qty INT DEFAULT 1)`);
        await db.raw(`CREATE TABLE settings (id ${ID}, uuid ${STR(64)}, key_name ${STR(100)} UNIQUE, value ${STR(255)})`);
        await db.raw(`CREATE TABLE bulk (id ${ID}, uuid ${STR(64)}, n INT, label ${STR(64)})`);
        // MySQL TEXT tope 64KB → MEDIUMTEXT para el test de 100KB
        const BIGTXT = ENGINE === 'mysql' ? 'MEDIUMTEXT' : 'TEXT';
        await db.raw(`CREATE TABLE edge (id ${ID}, uuid ${STR(64)}, txt ${BIGTXT}, num ${ENGINE === 'sqlite' ? 'REAL' : 'DOUBLE PRECISION'}, flag ${ENGINE === 'postgres' ? 'BOOLEAN' : 'INT'})`);
    }

    const seedUsers = [
        { name: 'Ada Lovelace', email: 'ada@ft.dev', age: 36, status: 'active', balance: 1000, score: 9.5, bio: 'first programmer' },
        { name: 'Linus Torvalds', email: 'linus@ft.dev', age: 54, status: 'active', balance: 500, score: 8.7, bio: 'kernel hacker' },
        { name: 'Grace Hopper', email: 'grace@ft.dev', age: 85, status: 'inactive', balance: 2000, score: 9.9, bio: 'compiler pioneer' },
        { name: 'Alan Turing', email: 'alan@ft.dev', age: 41, status: 'active', balance: 750, score: 9.8, bio: null },
        { name: 'Margaret Hamilton', email: 'margaret@ft.dev', age: 32, status: 'active', balance: 1200, score: 9.1, bio: 'apollo software' },
    ];
    const seedOrders = [
        { user_id: 1, product: 'Analytical Engine', total: 1200, qty: 1 },
        { user_id: 1, product: 'Punch cards', total: 30, qty: 100 },
        { user_id: 2, product: 'Keyboard', total: 80, qty: 2 },
        { user_id: 4, product: 'Enigma replica', total: 450, qty: 1 },
        { user_id: 5, product: 'Guidance computer', total: 9999, qty: 1 },
    ];

    await test('seed: insert múltiple devuelve filas insertadas', async () => {
        const rows = IS_MONGO ? seedUsers.map((r, i) => ({ id: i + 1, ...r })) : seedUsers;
        const res = await db.table('users').insert(rows);
        assert.ok(Array.isArray(res), 'insert no devolvió array');
        const all = await db.table('users').get();
        assert.strictEqual(all.length, 5);
    });

    await test('seed: orders', async () => {
        const rows = IS_MONGO ? seedOrders.map((r, i) => ({ id: i + 1, ...r })) : seedOrders;
        await db.table('orders').insert(rows);
        assert.strictEqual(Number(await db.table('orders').count()), 5);
    });

    // ════════════════════════ LECTURAS ════════════════════════
    section('Lecturas: select y where en todas sus variantes');

    await test('select de columnas específicas', async () => {
        const rows = await db.table('users').select(['id', 'name']).orderBy('id', 'ASC').get();
        assert.strictEqual(rows[0].name, 'Ada Lovelace');
        assert.ok(!('email' in rows[0]) || rows[0].email === undefined || IS_MONGO, 'select no proyectó'); // mongo devuelve doc completo en select básico
    });

    await test('where =', async () => {
        assert.strictEqual((await db.table('users').where('status', '=', 'active').get()).length, 4);
    });

    await test('where != / <>', async () => {
        assert.strictEqual((await db.table('users').where('status', '!=', 'active').get()).length, 1);
        assert.strictEqual((await db.table('users').where('status', '<>', 'active').get()).length, 1);
    });

    await test('where > < >= <=', async () => {
        assert.strictEqual((await db.table('users').where('age', '>', 50).get()).length, 2);
        assert.strictEqual((await db.table('users').where('age', '<', 40).get()).length, 2);
        assert.strictEqual((await db.table('users').where('age', '>=', 54).get()).length, 2);
        assert.strictEqual((await db.table('users').where('age', '<=', 36).get()).length, 2);
    });

    await test('where LIKE / NOT LIKE', async () => {
        const like = await db.table('users').where('name', 'LIKE', '%Lovelace%').get();
        assert.strictEqual(like.length, 1);
        const start = await db.table('users').where('email', 'LIKE', 'a%').get();
        assert.strictEqual(start.length, 2); // ada, alan
        const notLike = await db.table('users').where('name', 'NOT LIKE', '%a%').get();
        assert.ok(notLike.every(u => !/a/i.test(u.name) || !/a/.test(u.name)));
    });

    await test('whereIn / whereNotIn', async () => {
        assert.strictEqual((await db.table('users').whereIn('id', [1, 3, 5]).get()).length, 3);
        assert.strictEqual((await db.table('users').whereNotIn('id', [1, 3, 5]).get()).length, 2);
        assert.strictEqual((await db.table('users').whereIn('status', ['active', 'inactive']).get()).length, 5);
    });

    await test('whereBetween', async () => {
        assert.strictEqual((await db.table('users').whereBetween('age', [36, 54]).get()).length, 3);
    });

    await test('whereNull / whereNotNull', async () => {
        assert.strictEqual((await db.table('users').whereNull('bio').get()).length, 1); // alan
        assert.strictEqual((await db.table('users').whereNotNull('bio').get()).length, 4);
    });

    await test('orWhere', async () => {
        const rows = await db.table('users').where('age', '<', 35).orWhere('age', '>', 80).get();
        assert.strictEqual(rows.length, 2); // margaret, grace
    });

    await test('whereGroup (regresión grupo vacío)', async () => {
        const rows = await db.table('users')
            .where('status', '=', 'active')
            .whereGroup(q => { q.where('age', '<', 35).orWhere('age', '>', 50); })
            .get();
        assert.strictEqual(rows.length, 2); // margaret(32), linus(54)
    });

    await test('whereGroup anidado en cadena con más wheres', async () => {
        const rows = await db.table('users')
            .where('balance', '>', 400)
            .whereGroup(q => { q.where('score', '>=', 9).orWhere('status', '=', 'inactive'); })
            .where('age', '<', 90)
            .get();
        // balance>400 (todos -linus? linus 500>400 sí): ada,linus,grace,alan,margaret
        // grupo: score>=9 (ada,grace,alan,margaret) OR inactive (grace) → 4
        // age<90 → todos
        assert.strictEqual(rows.length, 4);
    });

    await test('first / find / find por columna', async () => {
        const f = await db.table('users').orderBy('age', 'DESC').first();
        assert.strictEqual(f.name, 'Grace Hopper');
        const byId = await db.table('users').find(2);
        assert.strictEqual(byId.name, 'Linus Torvalds');
        const byCol = await db.table('users').find('margaret@ft.dev', 'email');
        assert.strictEqual(byCol.name, 'Margaret Hamilton');
        const missing = await db.table('users').find(99999);
        assert.strictEqual(missing, null);
    });

    await test('orderBy ASC/DESC + múltiple lectura estable', async () => {
        const asc = await db.table('users').orderBy('age', 'ASC').get();
        const desc = await db.table('users').orderBy('age', 'DESC').get();
        assert.strictEqual(asc[0].name, 'Margaret Hamilton');
        assert.strictEqual(desc[0].name, 'Grace Hopper');
    });

    await test('limit / offset / page', async () => {
        const l = await db.table('users').orderBy('id', 'ASC').limit(2).get();
        assert.strictEqual(l.length, 2);
        const o = await db.table('users').orderBy('id', 'ASC').limit(2).offset(2).get();
        assert.strictEqual(o[0].id, 3);
        const p = await db.table('users').orderBy('id', 'ASC').limit(2).page(2).get();
        assert.strictEqual(p[0].id, 3);
    });

    await test('distinct', async () => {
        const st = await db.table('users').select(['status']).distinct().get();
        assert.strictEqual(st.length, 2);
    });

    if (!IS_MONGO) {
        await test('join INNER', async () => {
            const rows = await db.table('orders')
                .join('users', 'orders.user_id', '=', 'users.id')
                .select(['orders.product', 'users.name'])
                .get();
            assert.strictEqual(rows.length, 5);
            assert.ok(rows.every(r => r.name && r.product));
        });

        await test('leftJoin conserva filas sin match', async () => {
            // grace (id 3) no tiene orders
            const rows = await db.table('users')
                .leftJoin('orders', 'users.id', '=', 'orders.user_id')
                .select(['users.name', 'orders.product'])
                .get();
            assert.ok(rows.length >= 6); // 5 matches + grace con null
            assert.ok(rows.some(r => r.product == null));
        });
    }

    // ════════════════════════ AGREGACIONES ════════════════════════
    section('Agregaciones');

    await test('count / count con where / count(col)', async () => {
        assert.strictEqual(Number(await db.table('users').count()), 5);
        assert.strictEqual(Number(await db.table('users').where('status', '=', 'active').count()), 4);
    });

    await test('sum / avg / max / min', async () => {
        assert.strictEqual(Number(await db.table('users').sum('balance')), 5450);
        const avg = Number(await db.table('users').avg('age'));
        assert.ok(Math.abs(avg - 49.6) < 0.01, `avg fue ${avg}`);
        assert.strictEqual(Number(await db.table('users').max('age')), 85);
        assert.strictEqual(Number(await db.table('users').min('age')), 32);
    });

    await test('agregación con filtro', async () => {
        const s = Number(await db.table('orders').where('user_id', '=', 1).sum('total'));
        assert.strictEqual(s, 1230);
    });

    await test('exists', async () => {
        assert.strictEqual(await db.table('users').where('age', '>', 80).exists(), true);
        assert.strictEqual(await db.table('users').where('age', '>', 300).exists(), false);
    });

    if (!IS_MONGO) {
        await test('groupBy + having + selectRaw', async () => {
            // having con la expresión agregada (forma portable: Postgres no
            // permite alias del SELECT dentro de HAVING)
            const rows = await db.table('orders')
                .selectRaw(['user_id', 'SUM(total) AS spent'])
                .groupBy('user_id')
                .having('SUM(total)', '>', 100)
                .get();
            assert.ok(rows.length >= 3);
            assert.ok(rows.every(r => Number(r.spent) > 100));
        });
    }

    await test('paginate: páginas, total y flags', async () => {
        const p1 = await db.table('users').orderBy('id', 'ASC').paginate(1, 2);
        assert.strictEqual(p1.items.length, 2);
        assert.strictEqual(Number(p1.total), 5);
        assert.strictEqual(p1.totalPages, 3);
        assert.strictEqual(p1.hasNext, true);
        assert.strictEqual(p1.hasPrev, false);
        const p3 = await db.table('users').orderBy('id', 'ASC').paginate(3, 2);
        assert.strictEqual(p3.items.length, 1);
        assert.strictEqual(p3.hasNext, false);
        assert.strictEqual(p3.hasPrev, true);
    });

    await test('paginate respeta where', async () => {
        const p = await db.table('users').where('status', '=', 'active').paginate(1, 10);
        assert.strictEqual(Number(p.total), 4);
    });

    await test('chunk completo y corte temprano', async () => {
        let n = 0;
        await db.table('users').chunk(2, rows => { n += rows.length; });
        assert.strictEqual(n, 5);
        let calls = 0;
        await db.table('users').chunk(1, () => { calls++; return false; });
        assert.strictEqual(calls, 1);
    });

    // ════════════════════════ ESCRITURAS ════════════════════════
    section('Escrituras');

    await test('update con where', async () => {
        await db.table('users').where('id', '=', 1).update({ status: 'vip' });
        assert.strictEqual((await db.table('users').find(1)).status, 'vip');
    });

    await test('update multi-columna', async () => {
        await db.table('users').where('id', '=', 2).update({ status: 'vip', balance: 555 });
        const u = await db.table('users').find(2);
        assert.strictEqual(u.status, 'vip');
        assert.strictEqual(Number(u.balance), 555);
    });

    await test('update sin where → error', async () => {
        await assert.rejects(() => db.table('users').update({ status: 'x' }), /WHERE/);
    });

    await test('delete sin where → error', async () => {
        await assert.rejects(() => db.table('users').delete(), /WHERE/);
    });

    await test('delete con where', async () => {
        await db.table('settings').insert([{ key_name: 'tmp', value: 'x' }]);
        await db.table('settings').where('key_name', '=', 'tmp').delete();
        assert.strictEqual(Number(await db.table('settings').count()), 0);
    });

    await test('upsert inserta → actualiza → multi-fila', async () => {
        await db.table('settings').upsert([{ key_name: 'theme', value: 'dark' }], ['key_name']);
        await db.table('settings').upsert([{ key_name: 'theme', value: 'light' }], ['key_name']);
        assert.strictEqual(Number(await db.table('settings').count()), 1);
        assert.strictEqual((await db.table('settings').where('key_name', '=', 'theme').first()).value, 'light');

        await db.table('settings').upsert([
            { key_name: 'lang', value: 'es' },
            { key_name: 'theme', value: 'auto' },
            { key_name: 'tz', value: 'UTC' },
        ], ['key_name']);
        assert.strictEqual(Number(await db.table('settings').count()), 3);
        assert.strictEqual((await db.table('settings').where('key_name', '=', 'theme').first()).value, 'auto');
    });

    await test('upsert con updateColumns restringidas', async () => {
        await db.table('settings').upsert([{ key_name: 'lang', value: 'en' }], ['key_name'], ['value']);
        assert.strictEqual((await db.table('settings').where('key_name', '=', 'lang').first()).value, 'en');
    });

    await test('increment / decrement / con extra', async () => {
        await db.table('users').where('id', '=', 3).increment('balance', 100);
        assert.strictEqual(Number((await db.table('users').find(3)).balance), 2100);
        await db.table('users').where('id', '=', 3).decrement('balance', 50);
        assert.strictEqual(Number((await db.table('users').find(3)).balance), 2050);
        await db.table('users').where('id', '=', 3).increment('balance', 1, { status: 'rich' });
        const u = await db.table('users').find(3);
        assert.strictEqual(Number(u.balance), 2051);
        assert.strictEqual(u.status, 'rich');
    });

    await test('increment concurrente no pierde updates (atómico)', async () => {
        await db.table('users').where('id', '=', 4).update({ balance: 0 });
        await Promise.all(Array.from({ length: 20 }, () =>
            db.table('users').where('id', '=', 4).increment('balance', 5)
        ));
        assert.strictEqual(Number((await db.table('users').find(4)).balance), 100);
    });

    await test('truncate', async () => {
        await db.table('settings').truncate();
        assert.strictEqual(Number(await db.table('settings').count()), 0);
    });

    // ════════════════════════ TRANSACCIONES ════════════════════════
    section('Transacciones');

    await test('commit aplica todo', async () => {
        await db.transaction(async trx => {
            await trx.table('users').where('id', '=', 1).update({ balance: 900 });
            await trx.table('users').where('id', '=', 2).update({ balance: 655 });
        });
        assert.strictEqual(Number((await db.table('users').find(1)).balance), 900);
        assert.strictEqual(Number((await db.table('users').find(2)).balance), 655);
    });

    await test('rollback revierte todo', async () => {
        await assert.rejects(db.transaction(async trx => {
            await trx.table('users').where('id', '=', 1).update({ balance: -1 });
            await trx.table('users').where('id', '=', 2).update({ balance: -1 });
            throw new Error('boom');
        }), /boom/);
        assert.strictEqual(Number((await db.table('users').find(1)).balance), 900);
        assert.strictEqual(Number((await db.table('users').find(2)).balance), 655);
    });

    await test('lecturas dentro de TX ven cambios no commiteados', async () => {
        await db.transaction(async trx => {
            await trx.table('users').where('id', '=', 5).update({ balance: 77777 });
            const inside = await trx.table('users').find(5);
            assert.strictEqual(Number(inside.balance), 77777);
        });
        assert.strictEqual(Number((await db.table('users').find(5)).balance), 77777);
        await db.table('users').where('id', '=', 5).update({ balance: 1200 });
    });

    await test('insert + delete dentro de TX con rollback', async () => {
        const before = Number(await db.table('users').count());
        await assert.rejects(db.transaction(async trx => {
            await trx.table('users').insert([{ ...(IS_MONGO ? { id: 99 } : {}), name: 'Ghost', email: 'ghost@ft.dev', age: 1 }]);
            await trx.table('orders').where('user_id', '=', 1).delete();
            throw new Error('abort');
        }), /abort/);
        assert.strictEqual(Number(await db.table('users').count()), before);
        assert.strictEqual(Number(await db.table('orders').where('user_id', '=', 1).count()), 2);
    });

    if (!IS_MONGO) {
        await test('raw dentro de TX participa del rollback', async () => {
            await assert.rejects(db.transaction(async trx => {
                await trx.raw(`UPDATE users SET balance = 0 WHERE id = ${PH(1)}`, [1]);
                throw new Error('undo');
            }), /undo/);
            assert.strictEqual(Number((await db.table('users').find(1)).balance), 900);
        });
    }

    await test('transacciones secuenciales rápidas (10)', async () => {
        for (let i = 0; i < 10; i++) {
            await db.transaction(async trx => {
                await trx.table('users').where('id', '=', 1).increment('balance', 1);
            });
        }
        assert.strictEqual(Number((await db.table('users').find(1)).balance), 910);
    });

    await test('el valor de retorno del callback se propaga', async () => {
        const result = await db.transaction(async trx => {
            const u = await trx.table('users').find(1);
            return u.name;
        });
        assert.strictEqual(result, 'Ada Lovelace');
    });

    // ════════════════════════ RELACIONES ════════════════════════
    section('Relaciones (eager loading)');

    await test('with() hasMany explícito', async () => {
        const users = await db.table('users')
            .with('orders', { table: 'orders', foreignKey: 'user_id', localKey: 'id', type: 'many' })
            .orderBy('id', 'ASC').get();
        assert.strictEqual(users[0].orders.length, 2);
        assert.strictEqual(users[2].orders.length, 0);
    });

    await test('with() belongsTo explícito', async () => {
        const orders = await db.table('orders')
            .with('buyer', { table: 'users', foreignKey: 'user_id', type: 'one' })
            .get();
        assert.ok(orders.every(o => o.buyer && o.buyer.name));
    });

    await test('with() + where + orderBy combinados', async () => {
        const rows = await db.table('users')
            .where('status', '=', 'active')
            .with('orders', { table: 'orders', foreignKey: 'user_id', type: 'many' })
            .orderBy('age', 'DESC')
            .get();
        assert.ok(rows.length >= 2);
        assert.ok(Array.isArray(rows[0].orders));
    });

    // ════════════════════════ RAW ════════════════════════
    section('raw()');

    if (IS_MONGO) {
        await test('raw command document: find con filtro y sort', async () => {
            const res = await db.raw(JSON.stringify({ find: 'users', filter: { age: { $gt: 50 } }, sort: { age: -1 } }));
            const batch = res?.[0]?.cursor?.firstBatch ?? [];
            assert.strictEqual(batch.length, 2);
            assert.strictEqual(batch[0].name, 'Grace Hopper');
        });
        await test('raw command: aggregate pipeline', async () => {
            const res = await db.raw(JSON.stringify({
                aggregate: 'orders',
                pipeline: [{ $group: { _id: '$user_id', spent: { $sum: '$total' } } }],
                cursor: {}
            }));
            const batch = res?.[0]?.cursor?.firstBatch ?? [];
            assert.ok(batch.length >= 3);
        });
    } else {
        await test('raw select con params', async () => {
            // age > 35: ada(36), linus(54), grace(85), alan(41)
            const rows = await db.raw(`SELECT name FROM users WHERE age > ${PH(1)} ORDER BY age DESC`, [35]);
            assert.strictEqual(rows.length, 4);
            assert.strictEqual(rows[0].name, 'Grace Hopper');
        });
        await test('raw DML devuelve affectedRows', async () => {
            const res = await db.raw(`UPDATE users SET score = score WHERE id = ${PH(1)}`, [1]);
            assert.ok(Array.isArray(res));
        });
        await test('raw DDL (CREATE INDEX)', async () => {
            await db.raw('CREATE INDEX idx_ft_users_status ON users(status)');
            await db.raw('DROP INDEX ' + (ENGINE === 'mysql' ? 'idx_ft_users_status ON users' : 'idx_ft_users_status'));
        });
    }

    // ════════════════════════ EDGE CASES ════════════════════════
    section('Edge cases de datos');

    await test('comillas, backslashes y SQL-injection strings sobreviven', async () => {
        const nasty = [
            `O'Brien`,
            `double "quoted" text`,
            `back\\slash \\' mix`,
            `'; DROP TABLE users; --`,
            `Robert"); DELETE FROM users;--`,
        ];
        for (let i = 0; i < nasty.length; i++) {
            await db.table('edge').insert([{ ...(IS_MONGO ? { id: i + 1 } : {}), txt: nasty[i], num: i, flag: ENGINE === 'postgres' ? true : 1 }]);
        }
        for (let i = 0; i < nasty.length; i++) {
            const row = await db.table('edge').where('num', '=', i).first();
            assert.strictEqual(row.txt, nasty[i], `string ${i} se corrompió`);
        }
        // la tabla users sigue viva (no hubo injection)
        assert.strictEqual(Number(await db.table('users').count()), 5);
    });

    await test('unicode: emojis, chino, árabe, acentos', async () => {
        const texts = ['héllo wörld ñandú', '你好世界', 'مرحبا بالعالم', '🚀🔥💚 emoji', 'Ω≈ç√∫˜µ'];
        for (let i = 0; i < texts.length; i++) {
            await db.table('edge').insert([{ ...(IS_MONGO ? { id: 10 + i } : {}), txt: texts[i], num: 10 + i, flag: ENGINE === 'postgres' ? false : 0 }]);
        }
        for (let i = 0; i < texts.length; i++) {
            const row = await db.table('edge').where('num', '=', 10 + i).first();
            assert.strictEqual(row.txt, texts[i]);
        }
    });

    await test('string largo (100 KB)', async () => {
        const big = 'x'.repeat(100_000);
        await db.table('edge').insert([{ ...(IS_MONGO ? { id: 50 } : {}), txt: big, num: 50, flag: ENGINE === 'postgres' ? true : 1 }]);
        const row = await db.table('edge').where('num', '=', 50).first();
        assert.strictEqual(row.txt.length, 100_000);
    });

    await test('null explícito y números límite', async () => {
        await db.table('edge').insert([
            { ...(IS_MONGO ? { id: 60 } : {}), txt: null, num: 0, flag: ENGINE === 'postgres' ? false : 0 },
            { ...(IS_MONGO ? { id: 61 } : {}), txt: 'neg', num: -99999.5, flag: ENGINE === 'postgres' ? false : 0 },
            { ...(IS_MONGO ? { id: 62 } : {}), txt: 'float', num: 3.141592653589793, flag: ENGINE === 'postgres' ? true : 1 },
        ]);
        assert.strictEqual((await db.table('edge').where('num', '=', -99999.5).first()).txt, 'neg');
        const pi = await db.table('edge').where('txt', '=', 'float').first();
        assert.ok(Math.abs(Number(pi.num) - Math.PI) < 1e-9);
        const nullRow = await db.table('edge').where('num', '=', 0).whereNull('txt').first();
        assert.ok(nullRow, 'whereNull no encontró la fila con txt null');
    });

    await test('update a null y de vuelta', async () => {
        await db.table('edge').where('txt', '=', 'neg').update({ txt: null });
        assert.strictEqual(Number(await db.table('edge').where('num', '=', -99999.5).whereNull('txt').count()), 1);
    });

    await test('whereIn con lista grande (500 ids)', async () => {
        const ids = Array.from({ length: 500 }, (_, i) => i + 1);
        const rows = await db.table('users').whereIn('id', ids).get();
        assert.strictEqual(rows.length, 5);
    });

    if (!IS_MONGO) {
        await test('un INSERT que viola UNIQUE lanza error (no falla en silencio)', async () => {
            await assert.rejects(
                () => db.table('users').insert([{ name: 'Dup', email: 'ada@ft.dev', age: 1 }]),
                /.+/,
                'el insert duplicado no lanzó'
            );
            // y no insertó nada
            assert.strictEqual(Number(await db.table('users').count()), 5);
        });

        await test('un UPDATE inválido lanza error', async () => {
            await assert.rejects(
                () => db.table('users').where('id', '=', 1).update({ email: 'linus@ft.dev' }), // UNIQUE de otro
                /.+/
            );
        });
    }

    // ════════════════════════ BULK + PERFORMANCE ════════════════════════
    section('Bulk + performance');

    await test('bulk insert 1500 filas (TURBO path) y verificación EXACTA', async () => {
        const rows = Array.from({ length: 1500 }, (_, i) => ({
            ...(IS_MONGO ? { id: i + 1 } : {}),
            n: i,
            label: `row-${i}`,
        }));
        const t0 = Date.now();
        await db.table('bulk').insert(rows);
        const ms = Date.now() - t0;
        const count = Number(await db.table('bulk').count());
        assert.strictEqual(count, 1500, `bulk insert: esperaba 1500, hay ${count} — ¡filas perdidas!`);
        // spot-checks de contenido
        assert.strictEqual((await db.table('bulk').where('n', '=', 0).first()).label, 'row-0');
        assert.strictEqual((await db.table('bulk').where('n', '=', 1499).first()).label, 'row-1499');
        assert.strictEqual((await db.table('bulk').where('n', '=', 750).first()).label, 'row-750');
        console.log(`     ↳ 1500 filas en ${ms}ms (${(1500 / ms * 1000).toFixed(0)} filas/s)`);
    });

    await test('sum sobre 1500 filas correcto', async () => {
        const s = Number(await db.table('bulk').sum('n'));
        assert.strictEqual(s, (1499 * 1500) / 2);
    });

    await test('100 queries secuenciales — latencia promedio', async () => {
        const t0 = Date.now();
        for (let i = 0; i < 100; i++) {
            await db.table('users').where('id', '=', (i % 5) + 1).first();
        }
        const ms = Date.now() - t0;
        console.log(`     ↳ ${ms}ms total · ${(ms / 100).toFixed(2)}ms/query`);
        assert.ok(ms < 30000, `demasiado lento: ${ms}ms`);
    });

    await test('50 queries concurrentes (Promise.all)', async () => {
        const t0 = Date.now();
        const results = await Promise.all(Array.from({ length: 50 }, (_, i) =>
            db.table('users').where('id', '=', (i % 5) + 1).first()
        ));
        const ms = Date.now() - t0;
        assert.ok(results.every(r => r && r.name), 'alguna query concurrente falló o devolvió mal');
        // verificar que cada respuesta corresponde a su query (no cruzadas)
        results.forEach((r, i) => assert.strictEqual(Number(r.id), (i % 5) + 1, `respuesta cruzada en query ${i}`));
        console.log(`     ↳ 50 concurrentes en ${ms}ms`);
    });

    await test('lecturas mezcladas con escrituras concurrentes', async () => {
        const ops = [];
        for (let i = 0; i < 10; i++) {
            ops.push(db.table('users').where('id', '=', 1).first());
            ops.push(db.table('bulk').where('n', '=', i).update({ label: `upd-${i}` }));
            ops.push(db.table('bulk').where('n', '<', 5).get());
        }
        await Promise.all(ops);
        assert.strictEqual((await db.table('bulk').where('n', '=', 3).first()).label, 'upd-3');
    });

    await test('chunk sobre 1500 filas', async () => {
        let total = 0;
        await db.table('bulk').chunk(200, rows => { total += rows.length; });
        assert.strictEqual(total, 1500);
    });

    await test('delete masivo con where', async () => {
        await db.table('bulk').where('n', '>=', 1000).delete();
        assert.strictEqual(Number(await db.table('bulk').count()), 1000);
    });

    // ════════════════════════ RESUMEN ════════════════════════
    section('');
    const totalMs = Date.now() - suiteStart;
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`  [${ENGINE}] ${passed} pasaron · ${failed} fallaron · ${(totalMs / 1000).toFixed(1)}s`);
    console.log(`${'═'.repeat(50)}`);
    console.log('  Tiempos por sección:');
    for (const s of sectionTimes.filter(s => s.name)) {
        console.log(`    ${s.name}: ${s.ms}ms`);
    }
    if (failed > 0) {
        console.log('\n  FALLOS:');
        for (const f of failures) console.log(`    ❌ [${f.section}] ${f.name}\n       ${f.err.message}`);
    }
    console.log('');

    try { await db.disconnect(); } catch { /* */ }
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('💥 Fatal:', err); process.exit(1); });
