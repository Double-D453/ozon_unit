const ENV = makeEnv();
const SpreadsheetApp = ENV.SpreadsheetApp, PropertiesService = ENV.PropertiesService,
      Utilities = ENV.Utilities, Session = ENV.Session;

// ---------- «Номенклатура»: 17 колонок, 4 строки ----------
const NOMH = ['Offer id','SKU','Наименование','Код 1С','Номенклатура 1С','СС за ед., ₽','Кратность',
  'Упаковка, ₽','Ленд-кост, ₽','Вес, кг','Объём, л','Остаток Ozon','Остаток свои','Схема','Статус',
  'Категория (для комиссии)','Синк с Ozon'];
const nom = SpreadsheetApp._get('Номенклатура');
nom.getRange(1,1,1,17).setValues([NOMH]);
const blank = ['','','','','','','','','','','','','','','','',''];
function nomRow(oid, sku, name, ss) { const r = blank.slice(); r[0]=oid; r[1]=sku; r[2]=name; r[5]=ss; r[14]='Продается'; return r; }
nom.getRange(2,1,4,17).setValues([
  nomRow('Кромка-Дуб-44мм-5м.п.', 907795882, 'Кромка Дуб', 1343.66),
  nomRow('Кромка-Бук', 907700001, 'Кромка Бук', 300),
  nomRow('Кромка-Без-СС', 907700002, 'Кромка без себестоимости', ''),
  nomRow('Нет-в-Ozon', '', 'Товар, которого нет в магазине', 100)
]);
nom.getRange(2,9,4,1).setFormulas([
  ['=IF(OR(F2="",G2="",H2=""),"",(F2*G2+H2))'],['=IF(OR(F3="",G3="",H3=""),"",(F3*G3+H3))'],
  ['=IF(OR(F4="",G4="",H4=""),"",(F4*G4+H4))'],['=IF(OR(F5="",G5="",H5=""),"",(F5*G5+H5))']]);

const par = SpreadsheetApp._get('Параметры');
par.getRange(1,1,13,3).setValues([
  ['ПАРАМЕТРЫ','',''],['','',''],['Параметр','Значение','Комментарий'],
  ['ДРР (доля рекламных расходов)',0.15,'V3: 15%'],['Эквайринг',0.015,''],['НДС, ставка',0.22,''],
  ['Налог на прибыль',0.25,''],['% выкупа',1,''],['Мин. наценка',0.2,''],['Целевая наценка',0.3,''],
  ['Шаг округления',1,''],['Склад','МСК',''],['Схема работы','Авто','']]);

const prob = SpreadsheetApp._get('Проблемы данных');
prob.getRange(1,1,2,4).setValues([['Offer id','Наименование','Что не хватает','Что делать'],
  ['Mirka-Gold-150mm-P80-10','Круг шлифовальный','нет СС в 1С','Добавить себестоимость']]);

// ---------- магазин: 2 старых + 2 новых + 1 отсутствующий в базе ----------
productListAll_ = function () {
  return [{product_id:476340284, offer_id:'Кромка-Дуб-44мм-5м.п.'},
          {product_id:476340285, offer_id:'Кромка-Бук'},
          {product_id:476340286, offer_id:'Кромка-Без-СС'},
          {product_id:700000001, offer_id:'Mirka-WPF-230x280mm-P400-10'},
          {product_id:700000002, offer_id:'Kleiberit-303-10kg'}];
};
const REAL = {"acquiring":10.73,"offer_id":"Кромка-Дуб-44мм-5м.п.","product_id":476340284,
 "commissions":{"fbo_deliv_to_customer_amount":25,"fbo_direct_flow_trans_max_amount":254,
 "fbo_direct_flow_trans_min_amount":75,"fbo_return_flow_amount":115,"fbs_deliv_to_customer_amount":25,
 "fbs_direct_flow_trans_min_amount":75,"fbs_direct_flow_trans_max_amount":254,"fbs_first_mile_max_amount":10,
 "fbs_first_mile_min_amount":0,"fbs_return_flow_amount":254,"sales_percent_fbo":49.5,"sales_percent_fbs":49.5},
 "price":{"marketing_seller_price":1073,"min_price":1615,"old_price":2355,"price":1757,"vat":0.22}};
function mk(oid, price, fbo, fbs) {
  const x = JSON.parse(JSON.stringify(REAL));
  x.offer_id = oid; x.price.price = price; x.price.marketing_seller_price = 0;
  x.commissions.sales_percent_fbo = fbo; x.commissions.sales_percent_fbs = fbs;
  x.acquiring = Math.round(price * 0.0061 * 100) / 100;
  return x;
}
pricesMap_ = function (offers) {
  const m = {};
  offers.forEach(function (o) {
    if (o === 'Нет-в-Ozon') return;                      // карточки нет
    m[o] = mk(o, o === 'Кромка-Дуб-44мм-5м.п.' ? 1757 : 680, 49.5, 49.5);
  });
  return m;
};
productInfoMap_ = function (offers) {
  const m = {}; let i = 0;
  offers.forEach(function (o) {
    if (o === 'Нет-в-Ozon') return;
    m[o] = { product_id: 476340000 + (i++), sku: String(907700000 + i), name: 'Название для ' + o };
  });
  return m;
};
stocksMap_ = function (offers) {
  const m = {};
  offers.forEach(function (o, i) { m[o] = i % 2 ? { fbo: 0, fbs: 5 } : { fbo: 3, fbs: 0 }; });
  return m;
};

console.log('========== ПРОГОН A: syncFact с автодобавлением ==========');
const rA = syncFact();
console.log('результат:', JSON.stringify(rA));
console.log('строк в «Номенклатуре»:', nom.getLastRow() - 1, '(было 4)');
for (let i = 2; i <= nom.getLastRow(); i++) {
  const r = nom.getRange(i,1,1,17).getValues()[0];
  console.log('  строка '+i+':', r[0], '| SKU', r[1], '| СС', r[5], '| схема', r[13], '| Q:', JSON.stringify(r[16]),
              '| I:', String(r[8]).slice(0,34));
}
const f = SpreadsheetApp._get('Факт Ozon');
console.log('\n«Факт Ozon»: строк', f.getLastRow()-1, 'колонок', factHeaders_().length);
console.log('шапка W/X:', f.getRange(1,23,1,2).getValues()[0]);
for (let i=2;i<=f.getLastRow();i++) {
  const r=f.getRange(i,1,1,24).getValues()[0];
  console.log('  ', r[0], '| G(списочная)='+r[6], 'H='+r[7], '| W(к расчёту)='+r[22], 'X='+r[23], '| Q экв='+r[16]);
}
console.log('\n«Параметры»:');
for (let i=13;i<=par.getLastRow();i++) console.log('  ', JSON.stringify(par.getRange(i,1,1,3).getValues()[0]).slice(0,150));
console.log('\n«Проблемы данных»: строк', prob.getLastRow()-1);
for (let i=2;i<=prob.getLastRow();i++) console.log('  ', JSON.stringify(prob.getRange(i,1,1,4).getValues()[0]).slice(0,140));

console.log('\n========== ПРОГОН B: повторный запуск (идемпотентность) ==========');
const rB = syncFact();
console.log('результат:', JSON.stringify(rB));
console.log('строк в «Номенклатуре»:', nom.getLastRow()-1, '(не должно вырасти)');
console.log('строк в «Проблемы данных»:', prob.getLastRow()-1, '(дублей быть не должно)');

console.log('\n(diagCommission покрыт отдельным тестом comm7.js)');
