// Прогон syncDrr / syncSales в мок-окружении Apps Script.

const ENV = makeEnv();
const SpreadsheetApp = ENV.SpreadsheetApp, PropertiesService = ENV.PropertiesService,
      Utilities = ENV.Utilities, Session = ENV.Session;

// ---------- мок кампаний: как в реальном кабинете (1663 штуки) ----------
const CAMS = [];
for (let i = 0; i < 1600; i++) {
  CAMS.push({ id: String(22000000 + i), title: 'Архивная ' + i, state: 'CAMPAIGN_STATE_STOPPED',
              advObjectType: 'SKU', fromDate: '2023-01-01', toDate: '2024-01-01' });
}
for (let i = 0; i < 40; i++) {
  CAMS.push({ id: String(22520200 + i), title: 'Трафарет активный ' + i, state: 'CAMPAIGN_STATE_RUNNING',
              advObjectType: 'SKU', fromDate: '2026-01-01', toDate: '2027-01-01' });
}
for (let i = 0; i < 11; i++) {
  CAMS.push({ id: String(22530000 + i), title: 'Завершилась в периоде ' + i, state: 'CAMPAIGN_STATE_STOPPED',
              advObjectType: 'SKU', fromDate: '2026-09-01', toDate: '2026-10-0' + (1 + (i % 9)) });
}
for (let i = 0; i < 12; i++) {
  CAMS.push({ id: String(22540000 + i), title: 'Архив ' + i, state: 'CAMPAIGN_STATE_ARCHIVED',
              advObjectType: 'SKU', fromDate: '2022-01-01', toDate: '2023-01-01' });
}
perfCampaigns_ = function () { return CAMS.slice(); };

// ---------- мок отчётов: формат один в один как в логе прогона №3 ----------
const HDR = 'День;sku;Название товара;Предельная цена, ₽;Показы;Клики;CTR, %;Добавления в корзину;' +
  'Средняя стоимость клика, ₽;Расход, ₽, с НДС;Продано товаров;Продажи в продвижении, ₽;' +
  'Продано товаров модели;Продажи в продвижении с заказов модели, ₽;ДРР в продвижении, %;ДРР, %;Дата добавления';
const BOM = '\uFEFF';
let WAVELOG = [];

function csvFor(id) {
  const n = Number(id.slice(-1));
  const head = BOM + ';Кампания по продвижению товаров № ' + id + ', период 25.09.2026-09.10.2026\n' + HDR + '\n';
  if (n % 3 !== 0) { // пустая кампания — ровно то, что прислал лог
    return head + 'Всего;;;;0;0;0,00;0;0,00;0,00;0;0,00;0;0,00;0,00;0,00;\n';
  }
  const spend = 100 + n;                       // детерминированный расход
  const rows = [
    '25.09.2026;907795882;Кромка мебельная Дуб;1615;1234;56;4,54;3;2,10;' + spend.toFixed(2) +
      ';2;3514,00;1;1757,00;3,35;6,72;20.09.2026',
    '26.09.2026;907805356;Кромка Ясень;700;900;40;4,44;2;2,05;50,00;1;700,00;0;0,00;7,14;7,14;21.09.2026'
  ];
  const tot = (spend + 50).toFixed(2);
  return head + 'Всего;;;;2134;96;4,50;5;2,08;' + tot + ';3;4214,00;1;1757,00;4,10;6,90;\n' +
    rows.join('\n') + '\n';
}

perfReportsParallel_ = function (chunks, dateFrom, dateTo, deadline) {
  WAVELOG.push(chunks.map(function (c) { return c.length; }));
  return chunks.map(function (ch) {
    return {
      ids: ch.map(function (c) { return String(c.id); }),
      files: ch.map(function (c) { return { file: c.id + '_25.09.2026-09.10.2026', csv: csvFor(String(c.id)) }; })
    };
  });
};

// ---------- готовим таблицу ----------
const nom = SpreadsheetApp._get('Номенклатура');
nom.getRange(1, 1, 1, 17).setValues([['Offer id', 'SKU', 'Наименование', 'Код 1С', 'Номенклатура 1С',
  'СС за ед., ₽', 'Кратность', 'Упаковка, ₽', 'Ленд-кост, ₽', 'Вес, кг', 'Объём, л', 'Остаток Ozon',
  'Остаток свои', 'Схема', 'Статус', 'Категория', 'Синк с Ozon']]);
nom.getRange(2, 1, 3, 16).setValues([
  ['Кромка-Дуб-44мм-5м.п.', 907795882, 'Кромка мебельная, кромка Дуб SK/S 44 мм', '', '', 1343.66, 0.22, 16,
    '=IF(OR(F2="",G2="",H2=""),"",(F2*G2+H2))', '', 1.7, 1, 346, 'FBO', 'Продается', ''],
  ['Кромка-Ясень-23мм-10м.', 907805356, 'Кромка мебельная Ясень', '', '', 750.64, 0.23, 16,
    '=IF(OR(F3="",G3="",H3=""),"",(F3*G3+H3))', '', 1.2, 1, 481, 'FBS', 'Продается', ''],
  ['Тест-Без-SKU', '', 'Товар без SKU', '', '', 10, 1, 1, '', '', 1, 1, 5, 'FBO', 'Продается', '']
]);
nom.getRange(2, 9, 3, 1).setFormulas([['=IF(OR(F2="",G2="",H2=""),"",(F2*G2+H2))'],
  ['=IF(OR(F3="",G3="",H3=""),"",(F3*G3+H3))'], ['=IF(OR(F4="",G4="",H4=""),"",(F4*G4+H4))']]);

const par = SpreadsheetApp._get('Параметры');
par.getRange(1, 1, 5, 3).setValues([['ПАРАМЕТРЫ','',''], ['','',''], ['Параметр', 'Значение', 'Комментарий'],
  ['ДРР (доля рекламных расходов)', 0.15, 'Файл V3: 15%'], ['Эквайринг', 0.015, '']]);

const sal = SpreadsheetApp._get('Продажи');
// v0.7: «Продажи» — 13 колонок (A..M), J..M добавлены под Premium-метрики
const SC = salesHeaders_().length;
sal.getRange(1, 1, 1, SC).setValues([salesHeaders_()]);
function srow(o, sku, n, rev, u) {
  const r = new Array(SC).fill('');
  r[0]=o; r[1]=sku; r[2]=n; r[3]=rev; r[4]=u; r[7]='2026-09-25 — 2026-10-09';
  return r;
}
sal.getRange(2, 1, 2, SC).setValues([
  srow('Кромка-Дуб-44мм-5м.п.', '907795882', 'Кромка Дуб', 50000, 30),
  srow('Кромка-Ясень-23мм-10м.', '907805356', 'Кромка Ясень', 20000, 12)
]);

// ================= ПРОГОН 1 =================
console.log('========== ПРОГОН 1 ==========');
ENV.resetSleep();
let r1 = syncDrr(14);
console.log('результат:', JSON.stringify(r1));
console.log('волны (кампаний в пачке):', JSON.stringify(WAVELOG));
console.log('«Параметры» B4 =', par.getRange(4, 2).getValue ? par.getRange(4, 2).getValue() : par.getRange(4, 2).getValues()[0][0]);
console.log('«Параметры» C4 =', par.getRange(4, 3).getValues()[0][0]);

const drr = SpreadsheetApp._get('Реклама ДРР');
console.log('\nлист «Реклама ДРР»:');
console.log('шапка:', JSON.stringify(drr.getRange(1, 1, 1, 14).getValues()[0]));
const n1 = drr.getLastRow();
for (let i = 2; i <= n1; i++) console.log('  строка ' + i + ':', JSON.stringify(drr.getRange(i, 1, 1, 14).getValues()[0]));
console.log('итоговый блок P:Q');
for (let i = 1; i <= 10; i++) console.log('  ', JSON.stringify(drr.getRange(i, 16, 1, 2).getValues()[0]));

const done1 = propListGet_('DRR_DONE');
console.log('\nзапомнено кампаний:', done1.length, '| период:', PropertiesService.getScriptProperties().getProperty('DRR_PERIOD'));

// ================= ПРОГОН 2 (идемпотентность) =================
console.log('\n========== ПРОГОН 2 (повторный запуск) ==========');
WAVELOG = [];
const r2 = syncDrr(14);
console.log('результат:', JSON.stringify(r2));
console.log('волны:', JSON.stringify(WAVELOG), '— должно быть пусто (всё уже обработано)');
const n2 = SpreadsheetApp._get('Реклама ДРР').getLastRow();
console.log('строк на листе: было', n1, '→ стало', n2, '(дублироваться не должно)');
console.log('запомнено кампаний:', propListGet_('DRR_DONE').length);

// ================= ПРОГОН 3 (смена периода → сброс) =================
console.log('\n========== ПРОГОН 3 (период изменился) ==========');
PropertiesService.getScriptProperties().setProperty('DRR_PERIOD', '2020-01-01|2020-01-14');
WAVELOG = [];
const r3 = syncDrr(14);
console.log('результат:', JSON.stringify(r3));
console.log('строк на листе:', SpreadsheetApp._get('Реклама ДРР').getLastRow());

// ================= ПРОГОН 4 (обрыв по времени → продолжение) =================
console.log('\n========== ПРОГОН 4 (лимит времени, продолжение с места остановки) ==========');
PropertiesService.getScriptProperties().setProperty('DRR_PERIOD', 'другой|период');
const realNow = Date.now;
let t = realNow();
Date.now = function () { const v = t; t += 60000; return v; };  // каждый вызов +1 минута
WAVELOG = [];
const r4 = syncDrr(14);
Date.now = realNow;
console.log('результат:', JSON.stringify(r4));
console.log('волны:', JSON.stringify(WAVELOG), '(должно оборваться раньше конца)');
console.log('запомнено кампаний:', propListGet_('DRR_DONE').length);
const r5 = syncDrr(14);
console.log('довели до конца вторым запуском:', JSON.stringify(r5));
console.log('всего запомнено кампаний:', propListGet_('DRR_DONE').length);

// ================= fillNomSku_ =================
console.log('\n========== fillNomSku_ ==========');
fillNomSku_(nom, { 'Тест-Без-SKU': { sku: '123456789' }, 'Кромка-Дуб-44мм-5м.п.': { sku: '999' } });
console.log('колонка B:', JSON.stringify(nom.getRange(2, 2, 3, 1).getValues().map(function (r) { return r[0]; })),
  '— из-за формул в B перезапись должна быть пропущена только если формулы в B');

// ================= syncSales =================
console.log('\n========== syncSales (Premium-метрики: delivered/returns/cancellations) ==========');
let CALLS = 0;
analyticsAll_ = function (metrics, dim, from, to) {
  CALLS++;
  if (metrics.indexOf('adv_sum_all') >= 0) throw new Error('HTTP 400: [{"code":3,"message":"deprecated metrics used"}]');
  return [{ id: '907795882', name: 'Кромка Дуб', metrics: [61000, 34] },
          { id: '907805356', name: 'Кромка Ясень', metrics: [18500, 11] },
          { id: '777777777', name: 'Товар не из базы', metrics: [500, 1] }];
};
const rs = syncSales(14);
console.log('результат:', JSON.stringify(rs));
const s2 = SpreadsheetApp._get('Продажи');
for (let i = 1; i <= s2.getLastRow(); i++) console.log('  ', JSON.stringify(s2.getRange(i, 1, 1, SC).getValues()[0]));
console.log('ДРР в «Параметрах» после продаж:', par.getRange(4, 2).getValues()[0][0], '|', par.getRange(4, 3).getValues()[0][0]);

// ================= addMissingSkus =================
console.log('\n========== addMissingSkus ==========');
productListAll_ = function () {
  return [{ product_id: 1, offer_id: 'Кромка-Дуб-44мм-5м.п.' }, { product_id: 2, offer_id: 'Кромка-Ясень-23мм-10м.' },
          { product_id: 3, offer_id: 'Тест-Без-SKU' }, { product_id: 4, offer_id: 'Mirka-WPF-230x280mm-P400-10' },
          { product_id: 5, offer_id: 'Kleiberit-303-10kg' }];
};
productInfoMap_ = function (offers) {
  const m = {};
  offers.forEach(function (o, i) { m[o] = { product_id: 100 + i, sku: String(500000 + i), name: 'Название ' + o }; });
  return m;
};
stocksMap_ = function (offers) { const m = {}; offers.forEach(function (o, i) { m[o] = { fbo: i % 2 ? 0 : 7, fbs: i % 2 ? 3 : 0 }; }); return m; };
const ra = addMissingSkus();
console.log('результат:', JSON.stringify(ra));
for (let i = nom.getLastRow() - 2; i <= nom.getLastRow(); i++) {
  console.log('  строка ' + i + ':', JSON.stringify(nom.getRange(i, 1, 1, 16).getValues()[0]));
}
