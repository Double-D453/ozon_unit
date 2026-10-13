// Проверяет подключаемый sink логирования и совместимость со старым листом «Лог».
const ENV = makeEnv();
const SpreadsheetApp = ENV.SpreadsheetApp;
function assertLogSink_(condition, message) {
  if (!condition) throw new Error('LOG_SINK: ' + message);
}

const savedLogSink = LOG_SINK_;
const savedLogKeep = CFG.LOG_KEEP;
const savedConsoleLog = console.log;
const savedConsoleError = console.error;
try {
  assertLogSink_(LOG_SINK_ === sheetLogSink_, 'по умолчанию должен быть выбран sink листа');
  assertLogSink_(!SpreadsheetApp.getSheetByName(CFG.SHEETS.LOG), 'лист не должен создаваться до записи');

  const captured = [];
  LOG_SINK_ = function (record) { captured.push(record); };
  logMsg_('INFO', 'тест внедряемого sink');
  assertLogSink_(captured.length === 1, 'запись должна попасть во внедряемый sink');
  assertLogSink_(captured[0].level === 'INFO', 'уровень должен сохраниться');
  assertLogSink_(captured[0].message === 'тест внедряемого sink', 'сообщение должно сохраниться');
  assertLogSink_(captured[0].time instanceof Date, 'в записи должна быть дата');
  assertLogSink_(!SpreadsheetApp.getSheetByName(CFG.SHEETS.LOG), 'внедряемый sink не должен обращаться к Sheets');

  // Длинный текст не должен засорять вывод теста; проверяем его длину в sink.
  console.log = function () {};
  LOG_SINK_ = function (record) { captured.push(record); };
  logMsg_('DEBUG', 'x'.repeat(5001));
  assertLogSink_(captured[1].message.length === 5000, 'сообщение должно обрезаться до 5000 символов');

  // Ошибка sink — best effort: она не должна ломать основной код.
  console.error = function () {};
  LOG_SINK_ = function () { throw new Error('ожидаемая ошибка sink'); };
  let loggingThrew = false;
  try { logMsg_('ERROR', 'ошибка sink не должна прервать работу'); }
  catch (e) { loggingThrew = true; }
  assertLogSink_(!loggingThrew, 'ошибка sink не должна выйти из logMsg_');

  LOG_SINK_ = sheetLogSink_;
  logMsg_('WARN', 'тест стандартного sink');
  const logSheet = SpreadsheetApp.getSheetByName(CFG.SHEETS.LOG);
  assertLogSink_(!!logSheet, 'стандартный sink должен создать лист «Лог»');
  const rows = logSheet.getRange(1, 1, 2, 3).getValues();
  assertLogSink_(rows[0].join('|') === 'Время|Уровень|Сообщение', 'формат заголовка листа должен сохраниться');
  assertLogSink_(rows[1][1] === 'WARN' && rows[1][2] === 'тест стандартного sink', 'строка журнала должна сохраниться');
  assertLogSink_(rows[1][0] instanceof Date, 'на лист должна записываться дата');

  CFG.LOG_KEEP = 1;
  logMsg_('INFO', 'последняя запись');
  assertLogSink_(logSheet.getLastRow() === 2, 'ротация должна оставлять заголовок и заданное число записей');
  assertLogSink_(logSheet.getRange(2, 3).getValue() === 'последняя запись', 'последняя запись должна сохраниться после ротации');
} finally {
  LOG_SINK_ = savedLogSink;
  CFG.LOG_KEEP = savedLogKeep;
  console.log = savedConsoleLog;
  console.error = savedConsoleError;
}
console.log('LOG_SINK: инъекция, безопасный отказ, ограничение длины, лист и ротация — OK');
