'use strict';
/**
 * OZON UNIT — ДОМЕННОЕ ЯДРО: фактическая комиссия
 * ------------------------------------------------------------------
 * Задача: Ozon нигде в ценах и тарифах не показывает скидку за отсрочку выплаты.
 * Но в отчёте о реализации по каждому товару есть и списочная ставка, и то,
 * что реально удержали. Их разница и есть скидка.
 *
 * Здесь — только агрегация и арифметика, без HTTP и без Google Sheets.
 * Строки отчёта приходят из realizationByDay / realizationMonth
 * (см. core/ozon-endpoints.js), структура описана в docs/API-MAP.md.
 */

/**
 * commission_ratio Ozon может отдать и долей (0.495), и процентами (49,5).
 * Без нормализации разница со списочной ставкой уезжает на порядок.
 */
function ratioToPercent(v) {
  const n = Number(v) || 0;
  if (!n) return 0;
  return n <= 1 ? Math.round(n * 10000) / 100 : Math.round(n * 100) / 100;
}

function r2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

/**
 * Агрегирует строки отчёта о реализации по артикулам.
 * @param {Array} rows  строки из rows[] отчёта
 * @returns {object} карта offer_id → накопленные суммы
 */
function aggregate(rows) {
  const agg = {};
  (rows || []).forEach(function (row) {
    const item = row.item || {};
    const dc = row.delivery_commission || {};
    const offer = String(item.offer_id || '').trim();
    const amount = Number(dc.amount) || 0;
    // standard_fee — «Базовое вознаграждение Ozon», то есть что удержали.
    // commission — «Итого комиссия с учётом скидок и наценки», заполнялось только
    // в отчётах до 30.04.2024, поэтому берём его лишь запасным вариантом.
    const fee = Number(dc.standard_fee) || Number(dc.commission) || 0;
    if (!offer || (!amount && !fee)) return;
    const a = agg[offer] || (agg[offer] = {
      offerId: offer, sku: String(item.sku || ''), name: String(item.name || ''),
      amount: 0, fee: 0, total: 0, quantity: 0, ratioWeighted: 0, rows: 0
    });
    a.amount += amount;
    a.fee += fee;
    a.total += Number(dc.total) || 0;
    a.quantity += Number(dc.quantity) || 0;
    a.ratioWeighted += ratioToPercent(row.commission_ratio) * amount;
    a.rows++;
  });
  return agg;
}

/**
 * Считает ставки по каждому артикулу и итог по всей выборке.
 * Итоговая скидка — ВЗВЕШЕННАЯ по выручке, а не среднее по артикулам:
 * артикул с оборотом 10 ₽ не должен влиять так же, как артикул на 1 млн ₽.
 */
function summarize(agg) {
  const offers = Object.keys(agg);
  let sumAmount = 0, sumFee = 0, sumTotal = 0, sumQty = 0, sumRatioW = 0;
  const deltas = [];

  offers.forEach(function (o) {
    const a = agg[o];
    a.listPercent = a.amount ? r2(a.ratioWeighted / a.amount) : 0;
    a.factPercent = a.amount ? r2(a.fee / a.amount * 100) : 0;
    a.delta = (a.listPercent && a.factPercent) ? r2(a.listPercent - a.factPercent) : null;
    if (a.delta !== null && a.delta > 0.05 && a.delta < 15) deltas.push(a.delta);
    sumAmount += a.amount; sumFee += a.fee; sumTotal += a.total;
    sumQty += a.quantity; sumRatioW += a.ratioWeighted;
  });

  deltas.sort(function (x, y) { return x - y; });
  const listPercent = sumAmount ? r2(sumRatioW / sumAmount) : 0;
  const factPercent = sumAmount ? r2(sumFee / sumAmount * 100) : 0;
  const discount = r2(listPercent - factPercent);
  const median = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 0;
  const spread = deltas.length ? r2(deltas[deltas.length - 1] - deltas[0]) : 0;

  // Самоконтроль: «Реализовано» − «Комиссия» должно быть близко к «Итого к начислению».
  // Если расходится — значит standard_fee не вся комиссия и скидке верить нельзя.
  const controlDeviation = sumAmount ? r2((sumAmount - sumFee - sumTotal) / sumAmount * 100) : null;

  return {
    offers: offers.length,
    amount: r2(sumAmount), fee: r2(sumFee), total: r2(sumTotal), quantity: sumQty,
    listPercent: listPercent, factPercent: factPercent,
    discountWeighted: discount, discountMedian: median, discountSpread: spread,
    controlDeviationPercent: controlDeviation,
    controlPassed: controlDeviation === null ? null : Math.abs(controlDeviation) < 3,
    byOffer: agg
  };
}

/**
 * Можно ли доверять замеру настолько, чтобы подставить скидку в расчёт.
 * Правила те же, что в Apps Script, — и они намеренно консервативные:
 * лучше оставить значение по умолчанию, чем молча исказить весь прайс.
 */
function isTrustworthy(summary, options) {
  const o = options || {};
  const minOffers = o.minOffers || 10;
  const minDelta = o.minDelta === undefined ? 0.05 : o.minDelta;
  const maxDelta = o.maxDelta === undefined ? 6 : o.maxDelta;
  const reasons = [];
  if (summary.offers < minOffers) reasons.push('артикулов ' + summary.offers + ', нужно минимум ' + minOffers);
  if (!(summary.amount > 0)) reasons.push('нет суммы реализации');
  if (!(summary.discountWeighted > minDelta && summary.discountWeighted < maxDelta)) {
    reasons.push('скидка ' + summary.discountWeighted + ' п.п. вне правдоподобного диапазона ' +
                 minDelta + '…' + maxDelta);
  }
  if (summary.controlPassed === false) {
    reasons.push('самоконтроль отчёта не сошёлся (отклонение ' + summary.controlDeviationPercent + '%)');
  }
  return { trustworthy: reasons.length === 0, reasons: reasons };
}

/**
 * Разница между списочной ставкой из цен и фактической — то, что уходит
 * в параметр «Скидка к комиссии Ozon, п.п.».
 * @param {number} listRate  доля или процент, как отдал API
 * @param {number} discount  п.п.
 * @returns {number} ставка к расчёту, в процентах
 */
function rateForCalculation(listRate, discount) {
  return r2(ratioToPercent(listRate) - (Number(discount) || 0));
}

module.exports = { ratioToPercent, aggregate, summarize, isTrustworthy, rateForCalculation, r2 };
