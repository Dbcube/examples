
async function GeneralTriggerExecuteFunction({db, oldData, newData}){
    let gdb = null;
    try { gdb = require('dbcube').dbcube; } catch (e) { /* optional */ }
    
    async function afterDelete({db, oldData, newData, gdb}) {
        console.log(`[audit] user deleted: ${oldData.email}`)
}
    await afterDelete({db, oldData, newData, gdb});
}

module.exports = GeneralTriggerExecuteFunction;
