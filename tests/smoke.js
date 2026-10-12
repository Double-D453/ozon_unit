const ENV = makeEnv();
const SpreadsheetApp = ENV.SpreadsheetApp, PropertiesService = ENV.PropertiesService,
      Utilities = ENV.Utilities, Session = ENV.Session;
SpreadsheetApp._get('Параметры').getRange(1,1,5,3).setValues([['x','',''],['','',''],['a','b','c'],['ДРР',0.15,''],['Эквайринг',0.015,'']]);
const r = refreshInstruction();
console.log('refreshInstruction:', JSON.stringify(r));
const sh = SpreadsheetApp._get('Инструкция Apps Script');
console.log('строк:', sh.getLastRow());
console.log('A1:', sh.getRange(1,1).getValues()[0][0]);
console.log('шаг 8:', String(sh.getRange(12,2).getValues()[0][0]).slice(0,90));
console.log('последняя строка:', String(sh.getRange(sh.getLastRow(),2).getValues()[0][0]).slice(0,90));
ensureSheets();
console.log('листы после ensureSheets:', SpreadsheetApp.getSheets().map(s=>s.getName()).join(', '));
