/**
 * 08 — Fully-typed queries with TypeScript (reference example).
 *
 * Generate interfaces from your .cube schema:
 *     npx dbcube generate        → creates dbcube/types.ts
 *
 * Then every query is typed end to end.
 */
import { dbcube } from 'dbcube';

// In a real project these come from `npx dbcube generate`:
//   import type { User, NewUser, Order } from './dbcube/types';
interface User {
    id: number;
    uuid: string;
    name: string;
    email: string | null;
    age: number | null;
    status: string;
    balance: number;
}

interface Order {
    id: number;
    uuid: string;
    user_id: number;
    product: string;
    total: number;
}

async function main(): Promise<void> {
    const db = dbcube.database('demo');

    // table<T>() flows the row type through the whole chain
    const users = await db.table<User>('users')
        .where('age', '>', 30)
        .orderBy('age', 'DESC')
        .get();                                   // → User[]

    const first = await db.table<User>('users').first();   // → User | null
    if (first) console.log(first.name.toUpperCase());      // first.name: string ✅

    // insert takes Partial<T> — generated columns (id, uuid) are optional
    await db.table<User>('users').insert([
        { name: 'Edsger Dijkstra', email: 'edsger@example.com', age: 72 },
    ]);

    // paginate is typed too: PaginatedResult<User>
    const page = await db.table<User>('users').paginate(1, 10);
    const names: string[] = page.items.map(u => u.name);

    // chunk callbacks receive User[]
    await db.table<User>('users').chunk(100, (rows: User[]) => {
        for (const u of rows) console.log(u.email);
    });

    // raw<R>() lets you type ad-hoc projections
    const stats = await db.raw<{ status: string; n: number }>(
        'SELECT status, COUNT(*) AS n FROM users GROUP BY status'
    );
    console.log(stats[0].n + 1); // n: number ✅

    // typos and wrong types fail at COMPILE time:
    // await db.table<User>('users').insert([{ nmae: 'x' }]);      // ❌ TS error
    // const bad: number = (await db.table<User>('users').first())!.name; // ❌ TS error

    console.log(`typed query returned ${users.length} users, page has ${names.length}`);
}

main().catch(console.error);
