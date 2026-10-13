'use strict';
/**
 * OZON UNIT — ДОМЕННОЕ ЯДРО: комиссия по отчёту о реализации
 * ------------------------------------------------------------------
 * На проверенных строках /v1/finance/realization/by-day денежная сумма комиссии
 * (`standard_fee`) соответствует ставке от seller_price_per_instance × quantity.
 * `delivery_commission.amount` — другая ценовая база; деление на неё способно
 * дать значения выше 100%. Корректировки начисления сверяются отдельно.
 *
 * Только агрегация и арифметика — без HTTP и Google Sheets.
 */

/** commission_ratio Ozon может отдать и долей (0.495), и процентами (49.5). */
function ratioToPercent(v) {
  const n = Number(v) || 0;
  if (!n) return 0;
  return n <= 1 ? Math.round(n * 10000) / 100 : Math.round(n * 100) / 100;
}

function r2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

function commissionAdjustments(dc) {
  return ['bonus', 'bank_coinvestment', 'stars', 'pick_up_point_coinvestment', 'compensation']
    .reduce(function (sum, key) { return sum + (Number(dc[key]) || 0); }, 0);
}

/** Агрегирует строки отчёта о реализации по offer_id. */
function aggregate(rows) {
  const agg = {};
  (rows || []).forEach(function (row) {
    const item = row.item || {};
    const dc = row.delivery_commission || {};
    const offer = String(item.offer_id || '').trim();
    const amount = Number(dc.amount) || 0;
    const quantity = Number(dc.quantity) || 0;
    const sellerPrice = Number(row.seller_price_per_instance) || 0;
    const commissionBase = sellerPrice * quantity;
    // В актуальном отчёте standard_fee — базовое вознаграждение Ozon в рублях.
    // commission — fallback для старых отчётов (до 30.04.2024).
    const fee = Number(dc.standard_fee) || Number(dc.commission) || 0;
    const total = Number(dc.total) || 0;
    const adjustments = commissionAdjustments(dc);
    if (!offer || (!amount && !fee && !commissionBase && !total)) return;

    const a = agg[offer] || (agg[offer] = {
      offerId: offer, sku: String(item.sku || ''), name: String(item.name || ''),
      amount: 0, commissionBase: 0, fee: 0, total: 0, adjustments: 0,
      expectedTotal: 0, quantity: 0, ratioWeighted: 0, rows: 0, rowsWithoutBase: 0
    });
    a.amount += amount;
    a.commissionBase += commissionBase;
    a.fee += fee;
    a.total += total;
    a.adjustments += adjustments;
    a.expectedTotal += amount - fee + adjustments;
    a.quantity += quantity;
    a.ratioWeighted += ratioToPercent(row.commission_ratio) * commissionBase;
    if ((amount || fee || total) && !(commissionBase > 0)) a.rowsWithoutBase++;
    a.rows++;
  });
  return agg;
}

/** Считает фактическую ставку от базы продавца и контроль начисления. */
function summarize(agg) {
  const offers = Object.keys(agg);
  let sumAmount = 0, sumBase = 0, sumFee = 0, sumTotal = 0;
  let sumAdjustments = 0, sumExpectedTotal = 0, sumQty = 0, sumRatioW = 0, rowsWithoutBase = 0;
  const deltas = [];

  offers.forEach(function (o) {
    const a = agg[o];
    a.listPercent = a.commissionBase ? r2(a.ratioWeighted / a.commissionBase) : 0;
    a.factPercent = a.commissionBase ? r2(a.fee / a.commissionBase * 100) : 0;
    a.delta = (a.listPercent && a.factPercent) ? r2(a.listPercent - a.factPercent) : null;
    if (a.delta !== null && a.delta > 0.05 && a.delta < 15) deltas.push(a.delta);
    sumAmount += a.amount;
    sumBase += a.commissionBase;
    sumFee += a.fee;
    sumTotal += a.total;
    sumAdjustments += a.adjustments;
    sumExpectedTotal += a.expectedTotal;
    sumQty += a.quantity;
    sumRatioW += a.ratioWeighted;
    rowsWithoutBase += a.rowsWithoutBase;
  });

  deltas.sort(function (x, y) { return x - y; });
  const listPercent = sumBase ? r2(sumRatioW / sumBase) : 0;
  const factPercent = sumBase ? r2(sumFee / sumBase * 100) : 0;
  const discount = r2(listPercent - factPercent);
  const median = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 0;
  const spread = deltas.length ? r2(deltas[deltas.length - 1] - deltas[0]) : 0;

  // Контроль по подтверждённой формуле отчёта с учётом корректировок.
  const controlDeviation = sumBase ? r2((sumExpectedTotal - sumTotal) / sumBase * 100) : null;
  const controlPassed = controlDeviation === null ? null : Math.abs(controlDeviation) < 0.05;

  return {
    offers: offers.length,
    amount: r2(sumAmount), commissionBase: r2(sumBase), fee: r2(sumFee), total: r2(sumTotal),
    adjustments: r2(sumAdjustments), expectedTotal: r2(sumExpectedTotal), quantity: sumQty,
    listPercent: listPercent, factPercent: factPercent,
    discountWeighted: discount, discountMedian: median, discountSpread: spread,
    rowsWithoutBase: rowsWithoutBase,
    controlDeviationPercent: controlDeviation,
    controlPassed: controlPassed,
    byOffer: agg
  };
}

/** Можно ли доверять замеру настолько, чтобы использовать его в расчёте. */
function isTrustworthy(summary, options) {
  const o = options || {};
  const minOffers = o.minOffers || 10;
  const minDelta = o.minDelta === undefined ? 0.05 : o.minDelta;
  const maxDelta = o.maxDelta === undefined ? 6 : o.maxDelta;
  const reasons = [];
  if (summary.offers < minOffers) reasons.push('артикулов ' + summary.offers + ', нужно минимум ' + minOffers);
  if (!(summary.amount > 0)) reasons.push('нет суммы реализации');
  if (!(summary.commissionBase > 0)) reasons.push('нет базы комиссии продавца');
  if (summary.rowsWithoutBase > 0) reasons.push('нет seller_price_per_instance в строках: ' + summary.rowsWithoutBase);
  if (!(summary.discountWeighted > minDelta && summary.discountWeighted < maxDelta)) {
    reasons.push('разница ставок ' + summary.discountWeighted + ' п.п. вне диапазона ' +
                 minDelta + '…' + maxDelta);
  }
  if (summary.controlPassed !== true) {
    reasons.push(summary.controlPassed === false
      ? 'контроль начисления не сошёлся (отклонение ' + summary.controlDeviationPercent + '%)'
      : 'контроль начисления недоступен');
  }
  return { trustworthy: reasons.length === 0, reasons: reasons };
}

/** Ставка к расчёту после вычета заданной скидки, в процентах. */
function rateForCalculation(listRate, discount) {
  return r2(ratioToPercent(listRate) - (Number(discount) || 0));
}

module.exports = { ratioToPercent, aggregate, summarize, isTrustworthy, rateForCalculation, r2 };
