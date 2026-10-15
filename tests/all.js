const TESTFILE=process.env.TESTFILE||'';
const fs=require('fs');
// официальная OpenAPI-схема Ozon Seller API (выжимка тел запросов) — для валидатора schema.js
try { global.__OZON_PATHS__ = JSON.parse(fs.readFileSync(__dirname+'/ozon_paths.json','utf8')); }
catch(e) { global.__OZON_PATHS__ = null; }
const parts=['env.js','00_Config.js','01_OzonSeller.js','02_OzonPerformance.js','03_Sync.js','04_Diagnostics.js',(typeof TESTFILE!=='undefined'&&TESTFILE)?TESTFILE:'test_drr.js'];
const src = parts.map(f=>fs.readFileSync(f,'utf8')).join('\n;\n');
(0,eval)(src);
