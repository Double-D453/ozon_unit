const ENV = makeEnv();
const SpreadsheetApp = ENV.SpreadsheetApp, PropertiesService = ENV.PropertiesService,
      Utilities = ENV.Utilities, Session = ENV.Session;

// «Параметры» — 14 строк (строка 14 = скидка к комиссии)
const par = SpreadsheetApp._get('Параметры');
par.getRange(1,1,14,3).setValues([
  ['ПАРАМЕТРЫ','',''],['','',''],['Параметр','Значение','Комментарий'],
  ['ДРР (доля рекламных расходов)',0.15,''],['Эквайринг',0.015,''],['НДС, ставка',0.22,''],
  ['Налог на прибыль',0.25,''],['% выкупа',1,''],['Мин. наценка',0.2,''],['Целевая наценка',0.3,''],
  ['Шаг округления',1,''],['Склад','МСК',''],['Схема работы','Авто',''],
  ['Скидка к комиссии Ozon (отсрочка выплаты), п.п.',1.5,'значение по умолчанию']]);

// «Номенклатура» с ДУБЛЕМ — проверяем, что v0.7 его находит
const NOMH = ['Offer id','SKU','Наименование','Код 1С','Номенклатура 1С','СС за ед., ₽','Кратность',
  'Упаковка, ₽','Ленд-кост, ₽','Вес, кг','Объём, л','Остаток Ozon','Остаток свои','Схема','Статус',
  'Категория (для комиссии)','Синк с Ozon'];
const nom = SpreadsheetApp._get('Номенклатура');
nom.getRange(1,1,1,17).setValues([NOMH]);
const bl = ['','','','','','','','','','','','','','','','',''];
function nr(o,s,n,ss){const r=bl.slice();r[0]=o;r[1]=s;r[2]=n;r[5]=ss;return r;}
nom.getRange(2,1,3,17).setValues([
  nr('Дубль-1',900001,'Товар-дубль',100),
  nr('Дубль-1',900001,'Товар-дубль',100),
  nr('Обычный',900002,'Обычный товар',200)]);
SpreadsheetApp._get('Проблемы данных').getRange(1,1,1,4)
  .setValues([['Offer id','Наименование','Что не хватает','Что делать']]);

productListAll_ = function(){ return [{product_id:1,offer_id:'Дубль-1'},{product_id:2,offer_id:'Обычный'}]; };
pricesMap_ = function(off){ const m={}; off.forEach(function(o){ m[o]={acquiring:5,offer_id:o,
  commissions:{sales_percent_fbo:49.5,sales_percent_fbs:49.5,fbo_direct_flow_trans_min_amount:75,
  fbo_direct_flow_trans_max_amount:254,fbo_deliv_to_customer_amount:25,fbo_return_flow_amount:115,
  fbs_first_mile_min_amount:0,fbs_first_mile_max_amount:10,fbs_direct_flow_trans_min_amount:75,
  fbs_direct_flow_trans_max_amount:254,fbs_deliv_to_customer_amount:25,fbs_return_flow_amount:254},
  price:{price:1000,old_price:1200,min_price:900,marketing_seller_price:0,vat:0.22}}; }); return m; };
productInfoMap_ = function(off){ const m={}; off.forEach(function(o,i){ m[o]={product_id:i+1,sku:String(90000+i),name:'Имя '+o}; }); return m; };
stocksMap_ = function(off){ const m={}; off.forEach(function(o){ m[o]={fbo:2,fbs:0}; }); return m; };

console.log('========== 1. ДУБЛИ В «НОМЕНКЛАТУРЕ» ==========');
const rf = syncFact();
console.log('результат:', JSON.stringify(rf));
console.log('ожидаем duplicates=1, uniqueOffers=2 →', rf.duplicates===1 && rf.uniqueOffers===2 ? 'OK' : 'ПРОВАЛ');
const pr = SpreadsheetApp._get('Проблемы данных');
for (let i=2;i<=pr.getLastRow();i++) console.log('  проблема:', JSON.stringify(pr.getRange(i,1,1,4).getValues()[0]).slice(0,120));

console.log('\n========== 2. КОМИССИЯ: отчёт о реализации по дням (Premium Plus) ==========');
function realRow(oid, sku, amount, fee, qty, ratio, total, sellerPrice, adjustments) {
  const price = sellerPrice === undefined ? amount/qty : sellerPrice;
  const adj = adjustments || {};
  return { item:{offer_id:oid, sku:sku, name:'Товар '+oid, barcode:'x'},
           commission_ratio: ratio, seller_price_per_instance: price,
           delivery_commission:{ amount:amount, standard_fee:fee, commission:0, total:total,
             quantity:qty, price_per_instance:amount/qty, bonus:adj.bonus||0,
             bank_coinvestment:adj.bank_coinvestment||0, stars:adj.stars||0,
             pick_up_point_coinvestment:adj.pick_up_point_coinvestment||0,
             compensation:adj.compensation||0 },
           return_commission:{ amount:0, standard_fee:0, total:0, quantity:0 } };
}
const DAYS = [];
for (let i=0;i<12;i++) {
  const oid = 'SKU-' + (i+1);
  // Синтетический регрессионный случай: комиссия от seller-base 10 000 ₽,
  // amount 9 000 ₽; бонус 1 000 ₽. Категория 49,5%, фактический fee 48%.
  DAYS.push(realRow(oid, 910000+i, 9000, 4800, 10, 0.495, 5200, 1000, { bonus:1000 }));
}
// Категория и факт 35%; base 4 000 ₽, amount 3 000 ₽ + bonus 1 000 ₽.
DAYS.push(realRow('ОСОБЫЙ', 910099, 3000, 1400, 4, 0.35, 2600, 1000, { bonus:1000 }));
let byDayCalls = 0;
realizationByDay_ = function(y,m,d){ byDayCalls++; return DAYS.slice(); };
realizationMonth_ = function(){ throw new Error('не должен вызываться, когда by-day сработал'); };

// Регрессия: совпадение ставки с audit-like строками не должно перезаписывать B14.
const savedDays = DAYS.slice();
DAYS.length = 0;
for (let i=0;i<12;i++) {
  DAYS.push(realRow('AUDIT-' + i, 920000+i, 600, 495, 1, 0.495, 505, 1000, { bonus:400 }));
}
const b14BeforeAudit = Number(par.getRange(14,2).getValue());
const auditLike = diagCommission(14);
const b14AfterAudit = Number(par.getRange(14,2).getValue());
const auditLikePassed = !auditLike.applied && b14AfterAudit===b14BeforeAudit &&
  auditLike.factPercent===49.5 && auditLike.controlPassed===true;
console.log('audit-like: fact', auditLike.factPercent, 'B14 до/после', b14BeforeAudit, b14AfterAudit,
  auditLikePassed ? 'OK' : 'ПРОВАЛ');
if (!auditLikePassed) throw new Error('audit-like: ставка должна быть 49,5%, B14 не должен измениться');
DAYS.length = 0;
Array.prototype.push.apply(DAYS, savedDays);
byDayCalls = 0;

const rc = diagCommission(14);
console.log('результат:', JSON.stringify(rc));
console.log('дней запрошено:', byDayCalls);
console.log('ОЖИДАЕМ: listPercent 49.03 (взвешенно, с артикулом 35%), factPercent 47.58, скидка 1.45, артикулов 13');
const periodDates = String(rc.period || '').match(/^(\d{2}\.\d{2}\.\d{4}) — (\d{2}\.\d{2}\.\d{4})/);
function periodStamp(s) { const p=s.split('.').map(Number); return Date.UTC(p[2],p[1]-1,p[0]); }
const orderedPeriod = !!periodDates && periodStamp(periodDates[1]) <= periodStamp(periodDates[2]);
console.log('период должен идти от старого к новому:', orderedPeriod ? 'OK' : 'ПРОВАЛ → ' + rc.period);
if (!orderedPeriod) throw new Error('period должен быть упорядочен от старого к новому');
const cf = SpreadsheetApp._get('Комиссия факт');
console.log('лист «Комиссия факт»: строк', cf.getLastRow()-1, 'колонок', commHeaders_().length);
console.log('  шапка:', JSON.stringify(cf.getRange(1,1,1,13).getValues()[0]));
console.log('  строка 2:', JSON.stringify(cf.getRange(2,1,1,13).getValues()[0]));
console.log('  итоги N:O');
for (let i=1;i<=12;i++) console.log('   ', JSON.stringify(cf.getRange(i,14,1,2).getValues()[0]));
console.log('«Параметры» строка 14:', JSON.stringify(par.getRange(14,1,1,3).getValues()[0]).slice(0,220));

console.log('\n========== 3. КОМИССИЯ: откат на месячный отчёт ==========');
realizationByDay_ = function(){ throw new Error('HTTP 403: доступ запрещён (нужен Premium Plus)'); };
let monthCalls = 0;
realizationMonth_ = function(y,m){ monthCalls++; return { rows: DAYS.slice(), header:{ number:'R-2026-09', start_date:'01.09', stop_date:'30.09' } }; };
const rc2 = diagCommission(14);
console.log('результат:', JSON.stringify(rc2));
console.log('месячных запросов:', monthCalls, '| источник:', rc2.source, '| период:', rc2.period);

console.log('\n========== 4. КОМИССИЯ: откат на отправления FBO/FBS ==========');
realizationMonth_ = function(){ return { rows: [], header: {} }; };
fboPostingsWithFinance_ = function(since,to){ return [
  { posting_number:'FBO-1', products:[{offer_id:'Дубль-1',sku:900001,price:'1000',quantity:2,name:'x'}],
    financial_data:{products:[{price:1000,commission_amount:480,commission_percent:48,payout:1520,quantity:2}]} }]; };
fbsPostingsWithFinance_ = function(since,to){ return [
  { posting_number:'FBS-1', products:[{offer_id:'Обычный',sku:900002,price:'1000',quantity:1,name:'y'}],
    financial_data:{products:[{price:1000,commission_amount:490,commission_percent:49,payout:510,quantity:1}]} }]; };
const rc3 = diagCommission(14);
console.log('результат:', JSON.stringify(rc3));
console.log('артикулов:', rc3.offers, '| факт %:', rc3.factPercent, '| ставка %:', rc3.listPercent);
console.log('ОЖИДАЕМ: факт ≈48.33% (480×2 + 490) / (2000 + 1000) — самокалибровка «за единицу»');
console.log('(данных мало → скидку в «Параметры» писать НЕ должен):', rc3.applied ? 'НАПИСАЛ — ПРОВАЛ' : 'не написал — OK');

console.log('\n========== 5. ПРАВА API-КЛЮЧА ==========');
apiRoles_ = function(){ return { expires_at:'2027-03-01T00:00:00Z', roles:[
  { name:'Товары и цены', methods:['/v5/product/info/prices','/v3/product/list','/v4/product/info/stocks'] },
  { name:'Аналитика', methods:['/v1/analytics/data'] } ] }; };
const rr = diagRoles();
console.log('результат:', JSON.stringify(rr));
console.log('ожидаем в missing: realization/by-day, realization, posting fbo/fbs, actions/products');

console.log('\n========== 6. ПРОДАЖИ С PREMIUM-МЕТРИКАМИ (% выкупа) ==========');
analyticsAll_ = function(metrics, dim, from, to){
  console.log('  запрошены метрики:', JSON.stringify(metrics));
  return [
    {id:'900001', name:'Дубль', metrics:[100000, 100, 92, 5, 3]},
    {id:'900002', name:'Обычный', metrics:[50000, 40, 38, 1, 1]},
    {id:'999999', name:'Нет в базе', metrics:[1000, 2, 2, 0, 0]}];
};
const rs = syncSales(14);
console.log('результат:', JSON.stringify(rs));
const sl = SpreadsheetApp._get('Продажи');
console.log('«Продажи»: строк', sl.getLastRow()-1, 'колонок в шапке', salesHeaders_().length, 'CFG.SALES_COLS', CFG.SALES_COLS);
console.log('  шапка:', JSON.stringify(sl.getRange(1,1,1,13).getValues()[0]));
for (let i=2;i<=sl.getLastRow();i++) console.log('  ', JSON.stringify(sl.getRange(i,1,1,13).getValues()[0]));
console.log('  итоги O:P');
for (let i=1;i<=8;i++) console.log('   ', JSON.stringify(sl.getRange(i,15,1,2).getValues()[0]));
const rev = salesRevenueMap_();
console.log('salesRevenueMap_: total', rev.total, '| период', rev.period, '| SKU', Object.keys(rev.bySku).length,
            '→', (rev.total===151000 && rev.period) ? 'OK' : 'ПРОВАЛ');
