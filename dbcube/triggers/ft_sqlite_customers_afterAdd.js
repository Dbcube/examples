
async function GeneralTriggerExecuteFunction({db, oldData, newData}){
    let gdb = null;
    try { gdb = require('dbcube').dbcube; } catch (e) { /* optional */ }
    
    async function afterAdd({db, oldData, newData, gdb}) {
        console.log(`[audit] customer created: ${newData.email}`)
}
    await afterAdd({db, oldData, newData, gdb});
}

module.exports = GeneralTriggerExecuteFunction;
