'use strict';
/**
 * Тесты доменного ядра. Запуск: node core/core.test.js
 * Никаких зависимостей, никакого Apps Script — этот файл должен работать
 * и в CI, и в будущем SaaS-бэкенде.
 */
const ue = require('./unit-economics');
const cm = require('./commission');
const ep = require('./ozon-endpoints');
const fs = require('fs');
const path = require('path');

let pass = 0;
const fails = [];
function ok(cond, name, detail) {
  if (cond) { pass++; }
  else { fails.push(name + (detail ? ' → ' + detail : '')); }
}
function near(a, b, eps, name) {
  ok(a !== null && Math.abs(a - b) <= (eps === undefined ? 0.01 : eps), name,
     'получили ' + a + ', ждали ' + b);
}

// ============================================ 1. ЮНИТ-ЭКОНОМИКА

console.log('=== 1. Ленд-кост и логистика ===');

// проверенный образец: «Кромка-Дуб-44мм-5м.п.», product_id 476340284
// fbo_direct_flow_trans 75/254, fbo_deliv_to_customer 25 → 189,50 ₽
// fbs_first_mile 0/10 → 194,50 ₽
near(ue.logisticsFbo(75, 254, 25), 189.5, 0.001, 'логистика FBO = СРЗНАЧ(75;254)+25');
near(ue.logisticsFbs(0, 10, 75, 254, 25), 194.5, 0.001, 'логистика FBS = 5 + 164,5 + 25');
near(ue.logisticsFbs(0, 0, 75, 254, 25), 189.5, 0.001, 'нулевая первая миля не меняет FBS до уровня FBO');
ok(ue.logisticsFbo(null, 254, 25) === null, 'нет вилки тарифа → null, а не 0');

near(ue.landCost(1000, 0.2, 5, 100), 305, 0.001, 'ЛК = СС×Кратность + Упаковка + Транспорт');
ok(ue.landCost('', 0.2, 5, 0) === null, 'нет себестоимости → null (в расчёт не берём)');
ok(ue.landCost(1000, 0, 5, 0) === null, 'нет кратности → null (в расчёт не берём)');
near(ue.landCost(1000, 0.2, '', ''), 200, 0.001, 'пустые упаковка и транспорт = 0');
near(ue.landCost('1 343,66', 0.2, 42.89, 0), 311.622, 0.001, 'строка с запятой и пробелом понимается');

console.log('=== 2. Round-trip: цена → наценка → цена ===');
// Главное свойство модели: прямой и обратный расчёт должны быть взаимно обратными.
// Именно это подтверждалось на реальных SKU при аудите файла V3.
let rtMax = 0;
const cases = [];
[0.1, 0.483, 0.495, 0.6].forEach(function (c) {
  [0, 0.05, 0.15, 0.3].forEach(function (d) {
    [50, 311.61, 1343.66].forEach(function (land) {
      [0, 189.5].forEach(function (log) {
        [0, 10.73].forEach(function (acq) {
          [-0.2, 0, 0.3, 0.8133, 2].forEach(function (m) {
            cases.push({ c: c, d: d, land: land, log: log, acq: acq, m: m });
          });
        });
      });
    });
  });
});
cases.forEach(function (k) {
  const p = ue.priceFromMarkup(k.m, k.c, k.d, k.land, k.log, k.acq);
  if (p === null) return;
  const back = ue.markupFromPrice(p, k.c, k.d, k.land, k.log, k.acq);
  if (back === null) { fails.push('round-trip вернул null при c=' + k.c + ' m=' + k.m); return; }
  const diff = Math.abs(back - k.m);
  if (diff > rtMax) rtMax = diff;
});
ok(rtMax < 1e-9, 'round-trip на ' + cases.length + ' комбинациях', 'макс. расхождение ' + rtMax);

console.log('=== 3. Монотонность и здравый смысл ===');
const base = { c: 0.483, d: 0.15, land: 311.61, log: 189.5, acq: 10.73 };
const pLow = ue.priceFromMarkup(0.2, base.c, base.d, base.land, base.log, base.acq);
const pHigh = ue.priceFromMarkup(0.3, base.c, base.d, base.land, base.log, base.acq);
ok(pHigh > pLow, 'больше наценка → больше цена');
const be = ue.breakEvenPrice(base.c, base.d, base.land, base.log, base.acq);
ok(be < pLow, 'цена безубыточности ниже цены с наценкой 20%', 'be=' + be + ' pLow=' + pLow);
ok(ue.markupFromPrice(be, base.c, base.d, base.land, base.log, base.acq) < 1e-9,
   'наценка по цене безубыточности = 0');
// (1−c)(1−d) ≤ 0 только при c ≥ 1 или d ≥ 1 — такие доли отсекаем явно
ok(ue.priceFromMarkup(0.3, 1, base.d, base.land, base.log, base.acq) === null, 'комиссия 100% → null');
ok(ue.priceFromMarkup(0.3, base.c, 1, base.land, base.log, base.acq) === null, 'ДРР 100% → null');
// комиссия 90% формально разрешена, но запас цены мизерный — это отдельный флаг
near(ue.headroom(0.9, 0.15), 0.085, 0.0001, 'запас цены при комиссии 90% и ДРР 15%');
ok(!ue.isFeasible(0.9, 0.15), 'комиссия 90% + ДРР 15% — экономика нежизнеспособна');
ok(ue.isFeasible(base.c, base.d), 'комиссия 48,3% + ДРР 15% — жизнеспособна');
const infeasible = ue.unitEconomics(Object.assign({}, {
  costPerUnit: 1343.66, multiplicity: 0.2, packaging: 42.89, transport: 0,
  commissionRate: 0.9, drrRate: 0.15, logistics: 189.5, acquiring: 10.73,
  price: 1757, oldPrice: 2355, minPrice: 1615, minMarkup: 0.2, targetMarkup: 0.3
}));
ok(infeasible.ok === true, 'нездравая экономика считается, а не падает');
ok(infeasible.warnings.some(function (w) { return /нерыночной/.test(w); }),
   'и сопровождается понятным предупреждением', JSON.stringify(infeasible.warnings));
near(ue.headroom(base.c, base.d), 0.43945, 0.0001, 'запас цены на проверенном образце');
ok(ue.markupFromPrice(1757, 1, 0, base.land, base.log, base.acq) === null, 'комиссия 100% → null');
ok(ue.markupFromPrice(1757, base.c, base.d, 0, base.log, base.acq) === null, 'нулевой ленд-кост → null, а не Infinity');

console.log('=== 4. unitEconomics целиком ===');
const full = ue.unitEconomics({
  costPerUnit: 1343.66, multiplicity: 0.2, packaging: 42.89, transport: 0,
  commissionRate: 0.483, drrRate: 0.15, logistics: 189.5, acquiring: 10.73,
  price: 1757, oldPrice: 2355, minPrice: 1615,
  minMarkup: 0.2, targetMarkup: 0.3
});
ok(full.ok, 'расчёт собрался', JSON.stringify(full.reason || ''));
near(full.landCost, 311.622, 0.001, 'ленд-кост в полном расчёте');
ok(full.markup.byCurrentPrice > full.markup.byMinPrice, 'наценка по цене с акцией выше, чем по min_price');
ok(full.price.actionFloor < full.price.target, 'ограничение для акций ниже целевой цены');
const noCost = ue.unitEconomics({ costPerUnit: '', multiplicity: 1, commissionRate: 0.483, price: 1000 });
ok(!noCost.ok && /ленд-кост/.test(noCost.reason), 'без себестоимости — явный отказ, а не молчаливый расчёт',
   noCost.reason);
const noComm = ue.unitEconomics({ costPerUnit: 100, multiplicity: 1, price: 1000 });
ok(!noComm.ok && /комисс/.test(noComm.reason), 'без комиссии — явный отказ', noComm.reason);

// ============================================ 5. КОМИССИЯ

console.log('=== 5. Фактическая комиссия из отчёта о реализации ===');
function row(oid, sku, amount, fee, qty, ratio, total, sellerPrice, adjustments) {
  const adj = adjustments || {};
  return { item: { offer_id: oid, sku: sku, name: 'Товар ' + oid },
           commission_ratio: ratio,
           seller_price_per_instance: sellerPrice === undefined ? amount / qty : sellerPrice,
           delivery_commission: { amount: amount, standard_fee: fee, commission: 0, total: total, quantity: qty,
             bonus: adj.bonus || 0, bank_coinvestment: adj.bank_coinvestment || 0, stars: adj.stars || 0,
             pick_up_point_coinvestment: adj.pick_up_point_coinvestment || 0,
             compensation: adj.compensation || 0 } };
}
const rows = [];
for (let i = 0; i < 12; i++) rows.push(row('SKU-' + i, 910000 + i, 10000, 4800, 10, 0.495, 5200));
const s = cm.summarize(cm.aggregate(rows));
ok(s.offers === 12, 'артикулов 12', String(s.offers));
near(s.listPercent, 49.5, 0.01, 'ставка по категории 49,5%');
near(s.factPercent, 48, 0.01, 'фактически удержано 48%');
near(s.discountWeighted, 1.5, 0.01, 'скидка 1,5 п.п.');
near(s.amount, 120000, 0.01, 'реализовано 120 000 ₽');
near(s.fee, 57600, 0.01, 'удержано 57 600 ₽');
ok(s.controlPassed === true, 'самоконтроль с корректировками начисления сошёлся',
   String(s.controlDeviationPercent));
ok(cm.isTrustworthy(s).trustworthy, 'замеру можно верить');

// Синтетический регрессионный пример (не доказательство семантики API): amount
// ниже seller-базы из-за корректировки. Старый знаменатель дал бы 82,5% вместо 49,5%.
const auditRegression = cm.summarize(cm.aggregate([
  row('BASE-CHECK', 2, 600, 495, 1, 0.495, 505, 1000, { bonus: 400 })
]));
near(auditRegression.commissionBase, 1000, 0.001, 'база = seller_price_per_instance × quantity');
near(auditRegression.factPercent, 49.5, 0.01, 'ставка рассчитана от базы продавца');
near(auditRegression.fee / auditRegression.amount * 100, 82.5, 0.01, 'старый знаменатель даёт завышенный процент');
near(auditRegression.listPercent, 49.5, 0.01, 'ставка категории обрабатывается независимо от amount');
near(auditRegression.discountWeighted, 0, 0.01, 'при совпадении ставок скидка не выводится');
ok(auditRegression.controlPassed === true, 'total сверяется с бонусом и другими корректировками',
   String(auditRegression.controlDeviationPercent));
ok(auditRegression.rowsWithoutBase === 0, 'для строки доступна база продавца');

// взвешивание по базе продавца, а не среднее по артикулам
const skewed = cm.summarize(cm.aggregate([
  row('BIG', 1, 1000000, 480000, 1000, 0.495, 520000),
  row('TINY', 2, 10, 0, 1, 0.495, 10)
]));
near(skewed.listPercent, 49.5, 0.05, 'взвешенная ставка не искажается артикулом-крошкой');
near(skewed.factPercent, 48, 0.05, 'взвешенный факт = 48%');

// нормализация ratio: Ozon может отдать и 0.495, и 49.5
near(cm.ratioToPercent(0.495), 49.5, 0.001, 'ratio долей → проценты');
near(cm.ratioToPercent(49.5), 49.5, 0.001, 'ratio процентами остаётся процентами');
const pctRows = cm.summarize(cm.aggregate([row('P', 1, 1000, 480, 1, 49.5, 520)]));
near(pctRows.listPercent, 49.5, 0.01, 'ставка в процентах обрабатывается так же, как доля');

// недоверие к слабому замеру
const weak = cm.summarize(cm.aggregate([row('ONE', 1, 1000, 480, 1, 0.495, 520)]));
const v = cm.isTrustworthy(weak);
ok(!v.trustworthy && v.reasons.length > 0, 'один артикул — недостаточная выборка', v.reasons.join('; '));
const broken = cm.summarize(cm.aggregate([row('B', 1, 1000, 900, 1, 0.495, 520)]));
ok(!cm.isTrustworthy(broken).trustworthy, 'скидка 40+ п.п. отклоняется как неправдоподобная');
const badControl = cm.summarize(cm.aggregate(rows.map(function (r, i) {
  const c = JSON.parse(JSON.stringify(r)); c.delivery_commission.total = 100; return c;
})));
ok(badControl.controlPassed === false, 'расхождение «к начислению» ловится самоконтролем');
ok(!cm.isTrustworthy(badControl).trustworthy, 'при несошедшемся самоконтроле скидку не подставляем');

near(cm.rateForCalculation(0.495, 1.5), 48, 0.001, 'ставка к расчёту = списочная − скидка (из доли)');
near(cm.rateForCalculation(49.5, 1.5), 48, 0.001, 'то же из процентов');

// ============================================ 6. ТЕЛА ЗАПРОСОВ ПО СХЕМЕ OZON

console.log('=== 6. Конструкторы запросов против официальной схемы Ozon ===');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schema', 'ozon_paths.json'), 'utf8'));

function check(name, req) {
  const spec = SCHEMA[req.path];
  if (!spec) { fails.push(name + ': метод ' + req.path + ' не описан в схеме'); return; }
  if (req.body === null || req.body === undefined) {
    if ((spec.required || []).length) fails.push(name + ': тело пустое, обязательны ' + spec.required.join(','));
    return;
  }
  const allowed = Object.keys(spec.fields || {});
  Object.keys(req.body).forEach(function (k) {
    if (allowed.length && allowed.indexOf(k) < 0) {
      fails.push(name + ': ЛИШНЕЕ ПОЛЕ «' + k + '» в ' + req.path + ' (можно: ' + allowed.join(', ') + ')');
    }
  });
  (spec.required || []).forEach(function (k) {
    if (req.body[k] === undefined || req.body[k] === null) {
      fails.push(name + ': нет обязательного «' + k + '» в ' + req.path);
    }
  });
  allowed.forEach(function (k) {
    const sub = spec.fields[k];
    if (!Array.isArray(sub) || !sub.length) return;
    const v = req.body[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.keys(v).forEach(function (kk) {
        if (sub.indexOf(kk) < 0) fails.push(name + ': ЛИШНЕЕ ПОЛЕ «' + k + '.' + kk + '» в ' + req.path);
      });
    }
  });
  pass++;
}

const today = new Date();
const ago = new Date(Date.now() - 14 * 86400000);
check('productList', ep.productList('ALL', '', 1000));
check('productInfoList', ep.productInfoList(['A']));
check('productPrices', ep.productPrices(['A'], 'cursor1'));
check('productStocks', ep.productStocks(['A']));
check('actionsList', ep.actionsList());
check('actionProducts', ep.actionProducts(7, 12345, 1000));
check('analyticsData', ep.analyticsData(ep.ANALYTICS_METRICS.SALES_PREMIUM, ['sku'], ago, today, 1000, 0));
check('postingFboList', ep.postingFboList(ago, today, { cursor: 'x', statuses: ['delivered'] }));
check('postingFbsList', ep.postingFbsList(ago, today, { offset: 100, status: 'delivered' }));
check('realizationByDay', ep.realizationByDay(ago));
check('realizationMonth', ep.realizationMonth(2026, 9));
check('realizationPosting', ep.realizationPosting(2026, 9));
check('accrualPostings', ep.accrualPostings(['9121072335-0187-1']));
check('accrualByDay', ep.accrualByDay('2026-10-01', 'last-id'));
check('accrualTypes', ep.accrualTypes());
check('roles', ep.roles());
check('importPrices', ep.importPrices([{ offerId: 'A', price: 1757, oldPrice: 2355, minPrice: 1615, vat: '0.22' }]));

console.log('=== 7. Ограничения и защита от известных ошибок Ozon ===');
ok(ep.postingFboList(ago, today, { limit: 5000 }).body.limit === 100,
   'FBO: limit клампится до 100 (максимум по схеме)');
const future = ep.analyticsData(['revenue'], ['sku'], ago, new Date(Date.now() + 5 * 86400000));
ok(future.body.date_to <= ep.isoDay(new Date()),
   'analytics: date_to в будущем клампится до сегодня (иначе 400)', future.body.date_to);
let threw = false;
try { ep.analyticsData(new Array(15).fill('revenue'), ['sku'], ago, today); } catch (e) { threw = true; }
ok(threw, 'analytics: больше 14 метрик — явная ошибка, а не 400 от Ozon');
ok(ep.postingFboList(ago, today).body.with.barcodes === undefined,
   'FBO: в with нет barcodes (его там не существует — причина пустой комиссии в v0.6)');
ok(ep.postingFboList(ago, today).body.dir === undefined && ep.postingFboList(ago, today).body.offset === undefined,
   'FBO: нет dir/offset (у FBO cursor и sort_dir)');
ok(ep.postingFbsList(ago, today).body.dir === 'desc', 'FBS: dir строчными, как ждёт Ozon');
ok(ep.actionProducts(7).body.offset === undefined, 'акции: нет offset (пагинация через last_id)');
ok(ep.accrualPostings(new Array(500).fill('n')).body.posting_numbers.length === 200,
   'начисления: не более 200 номеров отправления за запрос');
ok(ep.ANALYTICS_METRICS.BASE.concat(ep.ANALYTICS_METRICS.PREMIUM).indexOf('adv_sum_all') < 0,
   'adv_sum_all не используется: такой метрики в схеме Ozon не существует');

console.log('=== 8. Расчёт Э2/Э3: комиссия, выкуп, возвраты, каскад наценки, округление, налоги и акции ===');
const oakSku = {
  costPerUnit: 1343.66, multiplicity: 0.2, packaging: 42.89, transport: 0,
  commissionRate: 0.483, drrRate: 0.15, logistics: 189.5, acquiring: 10.73,
  price: 1757, oldPrice: 2355, minPrice: 1615,
  minMarkup: 0.2, targetMarkup: 0.3
};
const cFromFact = ue.resolveCommissionRate(16.32, 48, 'FBS');
const cFromFallback = ue.resolveCommissionRate('', 48, 'FBO');
ok(Math.abs(cFromFact.rate - 0.1632) < 1e-6 && cFromFact.source === 'Комиссия факт!J' &&
   Math.abs(cFromFallback.rate - 0.48) < 1e-6 && cFromFallback.source === 'Факт Ozon!W',
   'Комиссия: приоритет Комиссия факт!J (16.32%), при отсутствии — Факт Ozon!W/X (48%)');

const bValid = ue.resolveBuyoutRate(80, 1);
const bEmpty = ue.resolveBuyoutRate('', 0.95);
const bNeg = ue.resolveBuyoutRate(-5, 0.95);
const bOver = ue.resolveBuyoutRate(104.74, 0.95);
ok(Math.abs(bValid.rate - 0.8) < 1e-6 && !bValid.warning &&
   Math.abs(bEmpty.rate - 0.95) < 1e-6 && Boolean(bEmpty.warning) &&
   Math.abs(bNeg.rate - 0.95) < 1e-6 && Boolean(bNeg.warning) &&
   Math.abs(bOver.rate - 0.95) < 1e-6 && Boolean(bOver.warning),
   'Выкуп: 0–100% из Продажи!M; пустое, отрицательное и >100% заменяются на Параметры!B8 с предупреждением');

const zeroBuyoutSku = Object.assign({}, oakSku, { salesBuyout: 0, defaultBuyout: 1, returnTariff: 115 });
const zeroBuyoutRes = ue.unitEconomics(zeroBuyoutSku);
ok(zeroBuyoutRes.ok && zeroBuyoutRes.buyoutRate === 0 && zeroBuyoutRes.priceBlocked &&
   zeroBuyoutRes.price.target === null && zeroBuyoutRes.price.actionFloor === null &&
   zeroBuyoutRes.warnings.some(function (w) { return w.indexOf('выкуп 0%') >= 0; }),
   'Выкуп 0%: принимается как валидные 0%, но блокирует цену из-за неограниченного возврата');

const returnSku = Object.assign({}, oakSku, { salesBuyout: 80, defaultBuyout: 1, returnTariff: 115 });
const returnRes = ue.unitEconomics(returnSku);
near(returnRes.returnCost, 115 * 0.2 / 0.8, 0.01,
     'Возвратный тариф: 115 × (1 − 0,8) / 0,8 = 28,75 ₽ на выкупленную единицу');

const mSku = ue.resolveMarkupCascade(0.42, 0.35, 0.30);
const mCat = ue.resolveMarkupCascade('', 0.35, 0.30);
const mDef = ue.resolveMarkupCascade('', '', 0.30);
ok(mSku.rate === 0.42 && mSku.source === 'SKU' &&
   mCat.rate === 0.35 && mCat.source === 'категория' &&
   mDef.rate === 0.30 && mDef.source === 'Параметры',
   'Каскад наценок: SKU → категория (Номенклатура!P) → общая (Параметры!B10/B9)');

ok(ue.roundPriceUp(1377.42, 1) === 1378 && ue.roundPriceUp(1377.42, 10) === 1380 && ue.roundPriceUp(1370.01, 10) === 1380,
   'Округление цен: вверх (ceil) по шагу Параметры!B11');

const taxSku = Object.assign({}, oakSku, { vatRate: 0.22, profitTaxRate: 0.25, roundStep: 1 });
const taxRes = ue.unitEconomics(taxSku);
ok(Math.abs(taxRes.price.target - 1377.49) < 0.05 && taxRes.price.targetRounded === 1378 &&
   Math.abs(taxRes.taxes.vatAmount - 1757 * 0.22 / 1.22) < 0.01 &&
   Math.abs(taxRes.taxes.profitTax - Math.max(0, taxRes.taxes.profitBeforeTax) * 0.25) < 0.01,
   'Налоги: целевая цена по формуле до налогов (1377,49 → 1378 ₽), НДС и налог на прибыль показаны отдельно');

const actSku = Object.assign({}, oakSku, {
  roundStep: 1,
  actions: [
    { actionId: 1977747, maxActionPrice: 1060, actionPrice: 1073 },
    { actionId: 2000001, maxActionPrice: 1350, actionPrice: 1320 }
  ]
});
const actRes = ue.unitEconomics(actSku);
ok(actRes.actionChecks.length === 2 &&
   actRes.actionChecks[0].allowed === false &&
   actRes.actionChecks[1].allowed === true,
   'Ограничения акций: наш пол (1307 ₽) выше лимита 1060 ₽ блокируется, а при лимите 1350 ₽ проходит');

// ============================================ ИТОГ
console.log('\n' + '='.repeat(58));
console.log('ПРОШЛО: ' + pass + '   ПРОВАЛЕНО: ' + fails.length);
if (fails.length) { fails.forEach(function (f) { console.log('  ✗ ' + f); }); process.exitCode = 1; }
else console.log('ЯДРО И ТЕЛА ЗАПРОСОВ СООТВЕТСТВУЮТ СХЕМЕ OZON ✓');
