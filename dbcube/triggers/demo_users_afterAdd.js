
async function GeneralTriggerExecuteFunction({db, oldData, newData}){
    let gdb = null;
    try { gdb = require('dbcube').dbcube; } catch (e) { /* optional */ }
    
    async function afterAdd({db, oldData, newData, gdb}) {
        console.log(`[audit] user created: ${newData.email}`);
    // You can use `db` here to write to other tables, e.g. an audit table.
    // Keep trigger logic idempotent if your app retries failed requests.
}
    await afterAdd({db, oldData, newData, gdb});
}

module.exports = GeneralTriggerExecuteFunction;
