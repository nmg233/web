const { parentPort, workerData } = require('node:worker_threads');
try { parentPort.postMessage({ rows: require('./accountImportParser').parseInput(workerData) }); }
catch (err) { parentPort.postMessage({ error: err.message }); }
