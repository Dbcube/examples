/**
 * run-all.js — runs the full test suite against every engine + the CLI suite,
 * with a global summary and timing.
 *
 *     docker compose up -d --wait
 *     node run-all.js
 */
const { spawnSync } = require('child_process');

const runs = [
    ['full-test.js', 'sqlite'],
    ['full-test.js', 'mysql'],
    ['full-test.js', 'postgres'],
    ['full-test.js', 'mongodb'],
    ['cli-test.js'],
];

const results = [];
const t0 = Date.now();

for (const [script, ...args] of runs) {
    const label = `${script} ${args.join(' ')}`.trim();
    console.log(`\n${'█'.repeat(60)}\n█ ${label}\n${'█'.repeat(60)}`);
    const start = Date.now();
    const r = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit', cwd: __dirname });
    results.push({ label, ok: r.status === 0, ms: Date.now() - start });
}

console.log(`\n${'═'.repeat(60)}\n  RESUMEN GLOBAL (${((Date.now() - t0) / 1000).toFixed(1)}s)\n${'═'.repeat(60)}`);
for (const r of results) {
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.label.padEnd(30)} ${(r.ms / 1000).toFixed(1)}s`);
}
const failedRuns = results.filter(r => !r.ok);
console.log('');
process.exit(failedRuns.length > 0 ? 1 : 0);
