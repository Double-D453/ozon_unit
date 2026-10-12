'use strict';
/**
 * OZON UNIT — ДОМЕННОЕ ЯДРО: юнит-экономика товара
 * ------------------------------------------------------------------
 * Чистый JavaScript без единой зависимости от Google Sheets / Apps Script.
 * Переносится в SaaS-бэкенд как есть (Node, Deno, браузер, TypeScript через .d.ts).
 *
 * Все формулы выведены из файла «Калькулятор Озон V 3» и подтверждены
 * обратным пересчётом (round-trip): цена → наценка → цена совпадает.
 * См. docs/FORMULAS.md и тест core.test.js.
 *
 * СОГЛАШЕНИЕ О ЕДИНИЦАХ (важно, здесь легко ошибиться):
 *   commissionRate, drrRate, markup, minMarkup — ДОЛИ (0.483 = 48,3%), не проценты;
 *   landCost, logistics, acquiring, price — РУБЛИ за единицу товара;
 *   все функции возвращают долю или рубли, округление — на стороне вызывающего.
 */

/**
 * Ленд-кост — полная себестоимость единицы товара на складе.
 *   ЛК = СС × Кратность + Упаковка + Транспорт
 * Кратность нужна, потому что себестоимость в 1С заведена за упаковку
 * (например, за 10 м.п. кромки), а продаётся поштучно.
 *
 * @returns {number|null} null, если не хватает входных данных —
 *   такой товар в расчёт брать НЕЛЬЗЯ (см. правило качества данных в docs/DECISIONS.md)
 */
function landCost(costPerUnit, multiplicity, packaging, transport) {
  const c = num(costPerUnit);
  const k = num(multiplicity);
  if (c === null || k === null || c <= 0 || k <= 0) return null;
  const p = num(packaging) || 0;      // упаковка может legitimately отсутствовать
  const t = num(transport) || 0;
  return c * k + p + t;
}

/**
 * Логистика FBO, ₽ за единицу.
 * Ozon отдаёт вилку тарифа (мин/макс) — берём середину, как в исходном файле V3.
 *   L_FBO = СРЗНАЧ(магистраль мин; магистраль макс) + Доставка до выдачи
 */
function logisticsFbo(transportMin, transportMax, deliveryToCustomer) {
  const a = num(transportMin), b = num(transportMax), d = num(deliveryToCustomer);
  if (a === null || b === null) return null;
  return (a + b) / 2 + (d || 0);
}

/**
 * Логистика FBS, ₽ за единицу. Здесь к магистрали добавляется первая миля.
 *   L_FBS = СРЗНАЧ(first_mile мин; макс) + СРЗНАЧ(магистраль мин; макс) + Доставка до выдачи
 */
function logisticsFbs(firstMileMin, firstMileMax, transportMin, transportMax, deliveryToCustomer) {
  const base = logisticsFbo(transportMin, transportMax, deliveryToCustomer);
  if (base === null) return null;
  const f1 = num(firstMileMin), f2 = num(firstMileMax);
  if (f1 === null || f2 === null) return base;   // первая миля может быть нулевой
  return base + (f1 + f2) / 2;
}

/**
 * ОБРАТНЫЙ РАСЧЁТ — фактическая наценка по известной цене.
 *
 *   m = (Цена × (1 − Комиссия) × (1 − ДРР) − Логистика − Эквайринг) / Ленд-кост − 1
 *
 * Смысл: из цены покупателя вычитаем то, что забирает Ozon (комиссия),
 * то, что уходит в рекламу (ДРР), логистику и эквайринг. Остаток делим
 * на ленд-кост — получаем наценку.
 *
 * @returns {number|null} доля (0.8133 = 81,33%) или null, если данных не хватает
 */
function markupFromPrice(price, commissionRate, drrRate, land, logistics, acquiring) {
  const p = num(price);
  const c = num(commissionRate);
  const l = num(land);
  if (p === null || c === null || l === null || l <= 0) return null;
  if (c >= 1) return null;                        // комиссия 100%+ — бессмыслица
  const d = num(drrRate) || 0;
  const log = num(logistics) || 0;
  const acq = num(acquiring) || 0;
  return (p * (1 - c) * (1 - d) - log - acq) / l - 1;
}

/**
 * ПРЯМОЙ РАСЧЁТ — цена покупателя из целевой наценки.
 * Обратна markupFromPrice, получена её алгебраическим обращением:
 *
 *   Цена = (Ленд-кост × (1 + m) + Эквайринг + Логистика) / ((1 − Комиссия) × (1 − ДРР))
 *
 * @returns {number|null} цена в ₽
 */
function priceFromMarkup(markup, commissionRate, drrRate, land, logistics, acquiring) {
  const m = num(markup);
  const c = num(commissionRate);
  const l = num(land);
  if (m === null || c === null || l === null || l <= 0) return null;
  if (c >= 1) return null;
  const d = num(drrRate) || 0;
  if (d >= 1) return null;
  const denom = (1 - c) * (1 - d);
  if (denom <= 0) return null;
  return (l * (1 + m) + (num(acquiring) || 0) + (num(logistics) || 0)) / denom;
}

/**
 * ОГРАНИЧЕНИЕ ДЛЯ АКЦИЙ — минимально допустимая цена.
 * Та же формула прямого расчёта, но на минимальной наценке.
 * Это цена, ниже которой товар становится убыточным относительно порога,
 * и она же — ориентир для min_price в Ozon.
 */
function actionFloor(minMarkup, commissionRate, drrRate, land, logistics, acquiring) {
  return priceFromMarkup(minMarkup, commissionRate, drrRate, land, logistics, acquiring);
}

/** Цена безубыточности: наценка = 0. */
function breakEvenPrice(commissionRate, drrRate, land, logistics, acquiring) {
  return priceFromMarkup(0, commissionRate, drrRate, land, logistics, acquiring);
}

/**
 * Наценка по цене ограничения для акций — нужна, чтобы видеть запас
 * между текущей ценой и полом.
 */
function markupAtPrice(price, ctx) {
  return markupFromPrice(price, ctx.commissionRate, ctx.drrRate, ctx.landCost, ctx.logistics, ctx.acquiring);
}

/**
 * Полный расчёт по одному SKU — то, что в таблице было размазано по колонкам.
 * Возвращает либо объект со всеми показателями, либо { ok: false, reason }.
 *
 * @param {object} sku
 *   costPerUnit, multiplicity, packaging, transport   — ленд-кост
 *   commissionRate  — комиссия к расчёту (ДОЛЯ). В v0.7 это списочная ставка минус
 *                     скидка за отсрочку выплаты, см. docs/API-MAP.md
 *   drrRate         — доля рекламных расходов в выручке
 *   logistics       — ₽, считаем через logisticsFbo / logisticsFbs
 *   acquiring       — ₽
 *   price           — текущая цена (с акцией)
 *   oldPrice        — зачёркнутая цена
 *   minPrice        — ограничение из Ozon
 *   minMarkup, targetMarkup — доли
 */
function unitEconomics(sku) {
  const land = landCost(sku.costPerUnit, sku.multiplicity, sku.packaging, sku.transport);
  if (land === null) {
    return { ok: false, reason: 'нет ленд-коста: не заданы себестоимость и/или кратность' };
  }
  const c = num(sku.commissionRate);
  if (c === null || c >= 1) return { ok: false, reason: 'нет комиссии или она ≥ 100%' };
  const d = num(sku.drrRate) || 0;
  const log = num(sku.logistics) || 0;
  const acq = num(sku.acquiring) || 0;

  const mPrice = markupFromPrice(sku.price, c, d, land, log, acq);
  const mOld = markupFromPrice(sku.oldPrice, c, d, land, log, acq);
  const mMin = markupFromPrice(sku.minPrice, c, d, land, log, acq);
  const floor = actionFloor(sku.minMarkup, c, d, land, log, acq);
  const target = priceFromMarkup(sku.targetMarkup, c, d, land, log, acq);
  const breakEven = breakEvenPrice(c, d, land, log, acq);

  if (mPrice === null) return { ok: false, reason: 'нет цены — считать наценку не с чего' };

  return {
    ok: true,
    landCost: land,
    logistics: log,
    acquiring: acq,
    markup: {
      byCurrentPrice: mPrice,     // наценка по цене с акцией
      byOldPrice: mOld,           // по зачёркнутой
      byMinPrice: mMin            // по ограничению для акций
    },
    price: {
      current: num(sku.price),
      target: target,             // цена при целевой наценке
      actionFloor: floor,         // ограничение для акций
      breakEven: breakEven        // безубыточность
    },
    // запас цены — индикатор жизнеспособности (см. headroom)
    headroom: headroom(c, d),

    // флаги, которые в таблице были условным форматированием
    warnings: [
      !isFeasible(c, d)
        ? 'комиссия и ДРР вместе забирают ' + r0((1 - headroom(c, d)) * 100) +
          '% цены — расчёт формально верен, но цена выйдет нерыночной' : null,
      (num(sku.minPrice) !== null && floor !== null && num(sku.minPrice) < floor)
        ? 'min_price в Ozon ниже нашего ограничения для акций' : null,
      (target !== null && num(sku.price) !== null && target > num(sku.price))
        ? 'текущая цена ниже целевой' : null,
      (mPrice !== null && num(sku.minMarkup) !== null && mPrice < num(sku.minMarkup))
        ? 'фактическая наценка ниже минимально допустимой' : null
    ].filter(Boolean)
  };
}

/**
 * Запас цены: какую долю цены продавца товар переживает после комиссии и ДРР.
 *   headroom = (1 − Комиссия) × (1 − ДРР)
 * Это знаменатель прямого расчёта, и он же — главный индикатор жизнеспособности.
 * headroom = 0.085 означает, что 91,5% цены забирают Ozon и реклама; чтобы
 * отбить ленд-кост 311 ₽, цену придётся ставить около 7 100 ₽. Формула при этом
 * формально корректна, а бизнес-смысла в результате нет — в SaaS с чужими данными
 * такое будет постоянно, поэтому считаем это отдельным состоянием, а не ошибкой.
 */
function headroom(commissionRate, drrRate) {
  const c = num(commissionRate), d = num(drrRate) || 0;
  if (c === null || c >= 1 || d >= 1) return null;
  return (1 - c) * (1 - d);
}

/** Порог, ниже которого расчёт формально верен, но экономически бессмыслен. */
const MIN_HEADROOM = 0.2;

function isFeasible(commissionRate, drrRate) {
  const h = headroom(commissionRate, drrRate);
  return h !== null && h >= MIN_HEADROOM;
}

/** Пустое/''/undefined → null, иначе число. Строки с запятой как разделителем понимаем. */
/** Округление до целого для человекочитаемых предупреждений. */
function r0(v) { return Math.round(Number(v) || 0); }

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}

module.exports = {
  landCost, logisticsFbo, logisticsFbs,
  markupFromPrice, priceFromMarkup, actionFloor, breakEvenPrice, markupAtPrice,
  headroom, isFeasible, MIN_HEADROOM,
  unitEconomics, num
};
