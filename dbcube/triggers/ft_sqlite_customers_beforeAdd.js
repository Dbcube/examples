
async function GeneralTriggerExecuteFunction({db, oldData, newData}){
    let gdb = null;
    try { gdb = require('dbcube').dbcube; } catch (e) { /* optional */ }
    
    async function beforeAdd({db, oldData, newData, gdb}) {
        if (newData.email) {
    newData.email = String(newData.email).toLowerCase();
    }
}
    await beforeAdd({db, oldData, newData, gdb});
}

module.exports = GeneralTriggerExecuteFunction;
