/**
 * cli-test.js — full CLI + schema lifecycle test against real engines.
 *
 * Exercises: validate, table:fresh, seeder:add, trigger:fresh (+ runtime
 * trigger verification), computed fields, .alter.cube migrations with
 * dry-run/apply/status/rollback, generate, pull and doctor.
 *
 * Run AFTER `docker compose up -d --wait` (uses ft_sqlite as primary target,
 * which needs no services, but the config keeps all engines registered).
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');

const CLI = path.join(__dirname, 'node_modules', '@dbcube', 'cli', 'src', 'index.js');

/** Mata daemons residuales de corridas anteriores: en Windows mantienen un
 *  handle abierto sobre el .db y el unlink falla en silencio. */
function killDaemons() {
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/F', '/IM', 'query-engine-v1.1.0-windows-x64.exe'], { stdio: 'ignore' });
    } else {
        spawnSync('pkill', ['-f', 'query-engine'], { stdio: 'ignore' });
    }
    try { fs.rmSync(path.join(__dirname, '.dbcube', 'daemon'), { recursive: true, force: true }); } catch { /* */ }
}

let passed = 0, failed = 0;
const failures = [];

function cli(args, opts = {}) {
    try {
        const out = execFileSync(process.execPath, [CLI, ...args], {
            cwd: __dirname,
            encoding: 'utf8',
            timeout: opts.timeout ?? 120000,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { code: 0, out };
    } catch (e) {
        return { code: e.status ?? 1, out: `${e.stdout || ''}\n${e.stderr || ''}` };
    }
}

async function test(name, fn) {
    const t0 = Date.now();
    try {
        await fn();
        passed++;
        console.log(`  ✅ ${name} (${Date.now() - t0}ms)`);
    } catch (err) {
        failed++;
        failures.push({ name, err });
        console.log(`  ❌ ${name}: ${err.message}`);
    }
}

async function main() {
    const suiteStart = Date.now();
    console.log('\n🧪 DBCube CLI FULL TEST (ft_sqlite)\n');

    // Clean state: kill stale daemons, fresh DB file, no stale migration history.
    // config.db guarda el registro interno de alters/computes/triggers del
    // schema-engine — sin borrarlo, un alter de una corrida anterior queda
    // marcado como aplicado y el run nuevo dice "No changes".
    killDaemons();
    for (const f of ['fulltest.db', 'fulltest.db-shm', 'fulltest.db-wal']) {
        try { fs.unlinkSync(path.join(__dirname, f)); } catch { /* */ }
    }
    try { fs.unlinkSync(path.join(__dirname, '.dbcube', 'config.db')); } catch { /* */ }
    const migrationsFile = path.join(__dirname, 'dbcube', 'migrations.json');
    try { fs.unlinkSync(migrationsFile); } catch { /* */ }
    const alterFile = path.join(__dirname, 'dbcube', 'cubes', 'ft', 'customers.alter.cube');
    try { fs.unlinkSync(alterFile); } catch { /* */ }

    // ── validate ─────────────────────────────────────────────────────────
    await test('dbcube validate → exit 0 con cubes válidos', async () => {
        const r = cli(['validate']);
        assert.strictEqual(r.code, 0, r.out.slice(-500));
    });

    await test('dbcube validate detecta cube inválido → exit 1', async () => {
        const bad = path.join(__dirname, 'dbcube', 'cubes', 'broken.table.cube');
        fs.writeFileSync(bad, '@database("ft_sqlite");\n@meta({ name: ; });\n');
        const r = cli(['validate']);
        fs.unlinkSync(bad);
        assert.notStrictEqual(r.code, 0, 'validate aceptó un cube roto');
    });

    // ── table:fresh ──────────────────────────────────────────────────────
    await test('dbcube run table:fresh --force crea las tablas', async () => {
        const r = cli(['run', 'table:fresh', '--force'], { timeout: 300000 });
        assert.strictEqual(r.code, 0, r.out.slice(-800));
    });

    const { dbcube } = require('dbcube');
    const db = dbcube.database('ft_sqlite');

    await test('la tabla customers existe y está vacía', async () => {
        assert.strictEqual(Number(await db.table('customers').count()), 0);
    });

    // ── seeders ──────────────────────────────────────────────────────────
    await test('dbcube run seeder:add inserta el dataset', async () => {
        const r = cli(['run', 'seeder:add'], { timeout: 300000 });
        assert.strictEqual(r.code, 0, r.out.slice(-800));
        assert.strictEqual(Number(await db.table('customers').count()), 3);
    });

    // ── triggers ─────────────────────────────────────────────────────────
    await test('dbcube run trigger:fresh registra triggers y genera JS', async () => {
        const r = cli(['run', 'trigger:fresh'], { timeout: 300000 });
        assert.strictEqual(r.code, 0, r.out.slice(-800));
        const triggersDir = path.join(__dirname, 'dbcube', 'triggers');
        const files = fs.existsSync(triggersDir) ? fs.readdirSync(triggersDir) : [];
        assert.ok(files.some(f => f.includes('customers') && f.endsWith('.js')),
            `no se generaron archivos JS de trigger (hay: ${files.join(', ') || 'ninguno'})`);
    });

    await test('runtime: beforeAdd normaliza el email en un insert real', async () => {
        const dbT = await db.useTriggers();
        await dbT.table('customers').insert([
            { first_name: 'Alan', last_name: 'Turing', email: 'ALAN@TRIGGER.DEV' }
        ]);
        const alan = await db.table('customers').where('last_name', '=', 'Turing').first();
        assert.ok(alan, 'no se insertó la fila');
        assert.strictEqual(alan.email, 'alan@trigger.dev', `trigger no normalizó: ${alan.email}`);
    });

    await test('runtime: afterAdd escribió el log de auditoría', async () => {
        const logDir = path.join(__dirname, 'dbcube', 'logs', 'triggers', 'ft_sqlite');
        assert.ok(fs.existsSync(logDir), `no existe ${logDir}`);
        const logs = fs.readdirSync(logDir);
        const afterLog = logs.find(f => f.includes('afterAdd'));
        assert.ok(afterLog, `no hay log de afterAdd (hay: ${logs.join(', ')})`);
        const content = fs.readFileSync(path.join(logDir, afterLog), 'utf8');
        assert.ok(content.includes('alan@trigger.dev'), 'el log no registró el insert');
    });

    // ── computed fields ──────────────────────────────────────────────────
    await test('computed field full_name se calcula al leer', async () => {
        const dbC = await db.useComputes();
        const rows = await dbC.table('customers').select(['first_name', 'last_name', 'full_name']).get();
        const ada = rows.find(r => r.first_name === 'Ada');
        assert.ok(ada, 'no se encontró la fila Ada');
        assert.strictEqual(ada.full_name, 'Ada Lovelace', `computed devolvió: ${ada.full_name}`);
    });

    // ── migraciones (.alter.cube) ────────────────────────────────────────
    await test('table:alter --dry-run muestra SQL sin ejecutar', async () => {
        fs.writeFileSync(alterFile, `@database("ft_sqlite");
@table("customers");

@addColumn({
    phone: {
        type: "varchar";
        length: "30";
    };
});
`);
        const r = cli(['run', 'table:alter', '--dry-run'], { timeout: 300000 });
        assert.strictEqual(r.code, 0, r.out.slice(-800));
        // dry-run NO debe aplicar
        const cols = await db.raw(`PRAGMA table_info(customers)`);
        assert.ok(!cols.some(c => c.name === 'phone'), 'dry-run aplicó el ALTER');
    });

    await test('table:alter aplica la migración pendiente', async () => {
        const r = cli(['run', 'table:alter'], { timeout: 300000 });
        assert.strictEqual(r.code, 0, r.out.slice(-800));
        const cols = await db.raw(`PRAGMA table_info(customers)`);
        assert.ok(cols.some(c => c.name === 'phone'),
            `la columna phone no se agregó. Output del alter:\n${r.out.slice(-1200)}`);
        assert.ok(fs.existsSync(migrationsFile), 'no se creó migrations.json');
    });

    await test('re-ejecutar table:alter no duplica (solo pendientes)', async () => {
        const r = cli(['run', 'table:alter'], { timeout: 300000 });
        assert.strictEqual(r.code, 0, r.out.slice(-800));
        const history = JSON.parse(fs.readFileSync(migrationsFile, 'utf8'));
        const applied = Array.isArray(history) ? history : (history.applied ?? []);
        assert.strictEqual(applied.length, 1, `historial duplicado: ${applied.length} entradas`);
    });

    await test('migrate:status lista la migración aplicada', async () => {
        const r = cli(['migrate:status']);
        assert.strictEqual(r.code, 0, r.out.slice(-500));
        assert.ok(/customers/.test(r.out), 'status no menciona la migración');
    });

    await test('migrate:rollback revierte la columna', async () => {
        const r = cli(['migrate:rollback'], { timeout: 300000 });
        assert.strictEqual(r.code, 0, r.out.slice(-800));
        const cols = await db.raw(`PRAGMA table_info(customers)`);
        assert.ok(!cols.some(c => c.name === 'phone'), 'rollback no quitó la columna phone');
    });

    // ── generate ─────────────────────────────────────────────────────────
    await test('dbcube generate produce types.ts con la interfaz', async () => {
        const r = cli(['generate']);
        assert.strictEqual(r.code, 0, r.out.slice(-500));
        const typesFile = path.join(__dirname, 'dbcube', 'types.ts');
        assert.ok(fs.existsSync(typesFile), 'no existe dbcube/types.ts');
        const content = fs.readFileSync(typesFile, 'utf8');
        assert.ok(/interface\s+Customer/i.test(content) || /interface\s+Customers/i.test(content),
            'types.ts no contiene la interfaz de customers');
    });

    // ── pull (introspección) ─────────────────────────────────────────────
    await test('dbcube run pull genera cubes sin la columna uuid', async () => {
        const dbDir = path.join(__dirname, 'dbcube');
        const before = new Set(fs.readdirSync(dbDir));
        const r = cli(['run', 'pull', 'ft_sqlite'], { timeout: 300000 });
        const created = fs.readdirSync(dbDir).filter(f => !before.has(f));
        try {
            assert.strictEqual(r.code, 0, r.out.slice(-800));
            assert.ok(created.length > 0, 'pull no generó ningún archivo');
            // los cubes generados NO deben declarar uuid (la gestiona DBCube;
            // declararla rompería el próximo table:fresh)
            for (const f of created) {
                const content = fs.readFileSync(path.join(dbDir, f), 'utf8');
                assert.ok(!/^\s*uuid\s*:/m.test(content), `${f} declara la columna uuid`);
            }
        } finally {
            // limpiar SIEMPRE: un cube generado que quede aquí contamina la
            // próxima corrida de table:fresh
            for (const f of created) {
                try { fs.unlinkSync(path.join(dbDir, f)); } catch { /* */ }
            }
        }
    });

    // ── doctor + version + help ──────────────────────────────────────────
    await test('dbcube doctor termina OK', async () => {
        const r = cli(['doctor'], { timeout: 300000 });
        assert.strictEqual(r.code, 0, r.out.slice(-500));
    });

    await test('dbcube -v muestra versiones', async () => {
        const r = cli(['-v']);
        assert.strictEqual(r.code, 0);
        assert.ok(/5\.2/.test(r.out), 'no muestra la versión 5.2.x');
    });

    await test('comando inexistente → exit 1 + sugerencia', async () => {
        const r = cli(['tabel:fresh']);
        assert.notStrictEqual(r.code, 0);
        assert.ok(/Did you mean/i.test(r.out), 'sin sugerencia did-you-mean');
    });

    // ── resumen ──────────────────────────────────────────────────────────
    const totalMs = Date.now() - suiteStart;
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`  [CLI] ${passed} pasaron · ${failed} fallaron · ${(totalMs / 1000).toFixed(1)}s`);
    console.log(`${'═'.repeat(50)}`);
    if (failed > 0) {
        console.log('\n  FALLOS:');
        for (const f of failures) console.log(`    ❌ ${f.name}\n       ${f.err.message.slice(0, 400)}`);
    }
    console.log('');
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('💥 Fatal:', err); process.exit(1); });
