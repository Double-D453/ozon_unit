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
 * Привести процент или долю к доле (0..1).
 * Например: 48 -> 0.48, 0.48 -> 0.48, "30%" -> 0.30.
 */
function toFractionRate(v) {
  if (v === '' || v === null || v === undefined || typeof v === 'boolean') return null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    if (s.endsWith('%')) {
      const p = num(s.slice(0, -1));
      return p !== null ? p / 100 : null;
    }
  }
  const n = num(v);
  if (n === null) return null;
  if (Math.abs(n) > 1) return n / 100;
  return n;
}

/**
 * Выбор расчётной ставки комиссии (Э2/Э3):
 *   1) сначала фактическая ставка по SKU из «Комиссия факт!J»;
 *   2) если её нет — текущая расчётная ставка из «Факт Ozon!W/X».
 */
function resolveCommissionRate(factSkuRate, fallbackSchemeRate, schemeLabel) {
  const fact = toFractionRate(factSkuRate);
  if (fact !== null && fact > 0 && fact < 1) {
    return {
      rate: fact,
      percent: Math.round(fact * 10000) / 100,
      source: 'Комиссия факт!J'
    };
  }
  const fb = toFractionRate(fallbackSchemeRate);
  if (fb !== null && fb > 0 && fb < 1) {
    const col = schemeLabel === 'FBO' ? 'Факт Ozon!W' : (schemeLabel === 'FBS' ? 'Факт Ozon!X' : 'Факт Ozon!W/X');
    return {
      rate: fb,
      percent: Math.round(fb * 10000) / 100,
      source: col
    };
  }
  return { rate: null, percent: null, source: '' };
}

/**
 * Валидация и выбор коэффициента выкупа (Э2/Э3):
 *   • берём из «Продажи!M», если значение в диапазоне 0–100%;
 *   • пустое, отрицательное или >100% заменяем на «Параметры!B8» и предупреждаем;
 *   • валидные 0% принимаем, но блокируем цену: ожидаемая стоимость возврата
 *     на выкупленную единицу неограниченна.
 */
function resolveBuyoutRate(salesBuyout, defaultBuyout) {
  const defFrac = toFractionRate(defaultBuyout);
  const fallback = (defFrac !== null && defFrac >= 0 && defFrac <= 1) ? defFrac : 1;
  const fallbackPct = Math.round(fallback * 10000) / 100;

  if (salesBuyout === '' || salesBuyout === null || salesBuyout === undefined || typeof salesBuyout === 'boolean') {
    return {
      rate: fallback,
      percent: fallbackPct,
      source: 'Параметры!B8',
      blocked: fallback === 0,
      warning: 'выкуп: пусто в Продажи!M, взят Параметры!B8'
    };
  }

  let raw = salesBuyout;
  let explicitPct = false;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) {
      return {
        rate: fallback,
        percent: fallbackPct,
        source: 'Параметры!B8',
        blocked: fallback === 0,
        warning: 'выкуп: пусто в Продажи!M, взят Параметры!B8'
      };
    }
    if (s.endsWith('%')) {
      explicitPct = true;
      raw = s.slice(0, -1);
    }
  }

  const n = num(raw);
  if (n === null) {
    return {
      rate: fallback,
      percent: fallbackPct,
      source: 'Параметры!B8',
      blocked: fallback === 0,
      warning: 'выкуп: некорректное значение в Продажи!M, взят Параметры!B8'
    };
  }

  if (n < 0) {
    return {
      rate: fallback,
      percent: fallbackPct,
      source: 'Параметры!B8',
      blocked: fallback === 0,
      warning: 'выкуп: отрицательное значение в Продажи!M, взят Параметры!B8'
    };
  }

  if (n === 0) {
    return {
      rate: 0,
      percent: 0,
      source: 'Продажи!M',
      blocked: true,
      warning: 'выкуп 0%: расчёт цены заблокирован (ожидаемая стоимость возврата на выкупленную единицу неограниченна)'
    };
  }

  let frac;
  if (explicitPct) {
    frac = n / 100;
  } else if (n <= 1) {
    frac = n;
  } else if (n > 1 && n < 2) {
    frac = n;
  } else {
    frac = n / 100;
  }

  if (frac > 1) {
    return {
      rate: fallback,
      percent: fallbackPct,
      source: 'Параметры!B8',
      blocked: fallback === 0,
      warning: 'выкуп: значение > 100% в Продажи!M, взят Параметры!B8'
    };
  }

  return {
    rate: frac,
    percent: Math.round(frac * 10000) / 100,
    source: 'Продажи!M',
    blocked: false,
    warning: null
  };
}

/**
 * Ожидаемый расход на возвратный тариф на 1 выкупленную единицу:
 *   R = тариф возврата × (1 − выкуп) / выкуп
 * При выкупе 0% ожидаемая стоимость возврата неограниченна -> null.
 */
function returnCostPerUnit(returnTariff, buyoutRate) {
  if (buyoutRate === null || buyoutRate === undefined) return 0;
  const b = num(buyoutRate);
  if (b === null || b <= 0 || b > 1) return null;
  const rt = num(returnTariff) || 0;
  if (rt < 0) return null;
  if (b === 1 || rt === 0) return 0;
  return rt * (1 - b) / b;
}

/**
 * Каскад наценок: SKU → категория (Номенклатура!P) → общая (Параметры!B10/B9).
 */
function resolveMarkupCascade(skuMarkup, categoryMarkup, defaultMarkup) {
  const s = toFractionRate(skuMarkup);
  if (s !== null && s >= 0) return { rate: s, source: 'SKU' };
  const c = toFractionRate(categoryMarkup);
  if (c !== null && c >= 0) return { rate: c, source: 'категория' };
  const d = toFractionRate(defaultMarkup);
  if (d !== null && d >= 0) return { rate: d, source: 'Параметры' };
  return { rate: null, source: '' };
}

/**
 * Округление цены вверх (ceil) по шагу из «Параметры!B11».
 */
function roundPriceUp(price, step) {
  const p = num(price);
  if (p === null || p <= 0) return null;
  const s = num(step);
  if (s === null || s <= 0) return p;
  const k = Math.ceil((p - 1e-9) / s);
  return Math.round((k * s) * 10000) / 10000;
}

/**
 * Расчёт рекомендованной зачёркнутой цены (old_price) от целевой цены
 * по надбавке из Параметры!B15 (по умолчанию +40% = 0.40) с округлением вверх по шагу B11.
 */
function recommendedOldPrice(targetPrice, oldPriceMarkup, step) {
  const t = num(targetPrice);
  if (t === null || t <= 0) return null;
  let m = toFractionRate(oldPriceMarkup);
  if (m === null || m < 0) m = 0.40;
  const raw = t * (1 + m);
  const s = num(step);
  return (s !== null && s > 0) ? roundPriceUp(raw, s) : raw;
}

/**
 * Классификация артикула в понятную товарную группу / бренд по Offer id и названию.
 * Используется для автозаполнения пустых ячеек «Номенклатура!P» (ручные значения не перезаписывает).
 */
function inferProductGroup(offerId, name) {
  const oid = String(offerId === undefined || offerId === null ? '' : offerId).trim();
  const nm = String(name === undefined || name === null ? '' : name).trim();
  if (!oid && !nm) return '';
  const o = oid.toLowerCase();
  const s = (oid + ' ' + nm).toLowerCase();

  if (o.indexOf('mirka') === 0 || o.indexOf('mirlon') === 0 || s.indexOf('mirka') !== -1) {
    return 'Mirka';
  }
  if (o.indexOf('sunmight') === 0 || s.indexOf('sunmight') !== -1) {
    return 'Sunmight';
  }
  if (o.indexOf('onelite') === 0 || o.indexOf('inret') === 0 || o.indexOf('поролоновые') === 0 ||
      s.indexOf('шлифовальная губка') !== -1 || s.indexOf('круг шлифовальный') !== -1 ||
      s.indexOf('полировальный круг') !== -1) {
    return 'Onelite / Абразивы';
  }
  if (o.indexOf('кромка') === 0 || s.indexOf('кромка мебельная') !== -1 || s.indexOf('кромочная лента') !== -1) {
    return 'Кромка';
  }
  if (o.indexOf('доска') === 0 || s.indexOf('разделочная доска') !== -1) {
    return 'Доски разделочные';
  }
  if (o.indexOf('щит') === 0 || o.indexOf('мебельный') === 0 || o.indexOf('граб') === 0 ||
      o.indexOf('брус') === 0 || s.indexOf('мебельный щит') !== -1 || s.indexOf('брусок') !== -1) {
    return 'Щит и брус';
  }
  if (o.indexOf('kleiberit') === 0 || o.indexOf('клейберит') === 0 || o.indexOf('apel') === 0 ||
      o.indexOf('нпи') === 0 || o.indexOf('купер') === 0 || o.indexOf('смола') === 0 ||
      s.indexOf('клей') !== -1 || s.indexOf('клеевая нить') !== -1 || s.indexOf('смола') !== -1) {
    return 'Kleiberit / Клеи';
  }
  if (o.indexOf('borma') === 0 || o.indexOf('шпак') === 0 || o.indexOf('масло') === 0 ||
      o.indexOf('лак') === 0 || o.indexOf('растворитель') === 0 || o.indexOf('твердое') === 0 ||
      o.indexOf('размягчитель') === 0 || o.indexOf('r1550') === 0 || o.indexOf('r1850') === 0 ||
      s.indexOf('borma') !== -1 || s.indexOf('шпаклев') !== -1 || s.indexOf('масло') !== -1 ||
      s.indexOf('растворитель') !== -1) {
    return 'Borma / Масла и ЛКМ';
  }
  if (o.indexOf('duna') === 0 || o.indexOf('bianche') === 0 || o.indexOf('espresso') === 0 ||
      o.indexOf('albero') === 0 || o.indexOf('crown') === 0 || o.indexOf('образец') === 0 ||
      o.indexOf('каталог') === 0 || o.indexOf('венге') === 0 || o.indexOf('мдф') === 0 ||
      o.indexOf('фанера') === 0 || s.indexOf('мультишпон') !== -1 || s.indexOf('шпон') !== -1 ||
      s.indexOf('стеновые панели') !== -1 || s.indexOf('фанера') !== -1) {
    return 'Шпон и панели';
  }
  return 'Инструмент и расходники';
}

/**
 * Налоговый блок (справочно, отдельно от доналоговой целевой цены):
 *   • неподтверждённый входящий НДС из цены НЕ вычитается;
 *   • выделенный НДС с продажи = P × vat / (1 + vat);
 *   • налог на прибыль = max(0, profitBeforeTax) × profitTax.
 */
function taxBreakdown(price, profitBeforeTax, vatRate, profitTaxRate) {
  const p = num(price);
  const pbt = num(profitBeforeTax);
  const v = toFractionRate(vatRate) || 0;
  const pt = toFractionRate(profitTaxRate) || 0;
  const vatAmount = (p !== null && p > 0 && v > 0) ? (p * v / (1 + v)) : 0;
  const profitTax = (pbt !== null && pbt > 0 && pt > 0) ? (pbt * pt) : 0;
  const profitAfterProfitTax = pbt !== null ? (pbt - profitTax) : null;
  return {
    vatRate: v,
    profitTaxRate: pt,
    vatAmount,
    profitTax,
    profitBeforeTax: pbt,
    profitAfterProfitTax
  };
}

/**
 * Проверка ограничения акции по одной строке листа «Акции»:
 *   • наш минимальный пол (floorPrice) должен быть не выше лимита Ozon (maxActionPrice);
 *   • дополнительно проверяем, не ниже ли текущая цена акции нашего пола.
 */
function checkActionConstraint(floorPrice, maxActionPrice, actionPrice) {
  const floor = num(floorPrice);
  const limit = num(maxActionPrice);
  const actP = num(actionPrice);

  if (floor === null || floor <= 0) {
    return {
      ok: false,
      allowed: false,
      belowFloor: false,
      headroomRub: null,
      status: 'БЛОК: нет расчёта нашего пола',
      warning: 'акция: нет расчёта минимального пола по SKU'
    };
  }

  const headroomRub = (limit !== null && limit > 0) ? (limit - floor) : null;
  if (limit !== null && limit > 0 && floor > limit + 1e-9) {
    return {
      ok: true,
      allowed: false,
      belowFloor: (actP !== null && actP > 0) ? actP < floor - 1e-9 : true,
      headroomRub,
      status: 'КОНФЛИКТ: наш пол выше лимита Ozon',
      warning: 'акция: наш минимальный пол (' + Math.round(floor * 100) / 100 +
        ' ₽) выше лимита Ozon (' + Math.round(limit * 100) / 100 + ' ₽)'
    };
  }

  if (actP !== null && actP > 0 && actP < floor - 1e-9) {
    return {
      ok: true,
      allowed: true,
      belowFloor: true,
      headroomRub,
      status: 'ВНИМАНИЕ: цена акции ниже нашего пола',
      warning: 'акция: текущая цена акции (' + Math.round(actP * 100) / 100 +
        ' ₽) ниже нашего пола (' + Math.round(floor * 100) / 100 + ' ₽)'
    };
  }

  return {
    ok: true,
    allowed: true,
    belowFloor: false,
    headroomRub,
    status: 'ОК: пол ≤ лимита Ozon',
    warning: null
  };
}

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
 *   commissionRate  — комиссия к расчёту (ДОЛЯ). При передаче factCommissionRate
 *                     используется приоритет Комиссия факт!J → Факт Ozon!W/X
 *   drrRate         — доля рекламных расходов в выручке
 *   logistics       — ₽, считаем через logisticsFbo / logisticsFbs
 *   returnTariff    — ₽, тариф возврата (учитывается как тариф × (1 − выкуп) / выкуп)
 *   salesBuyout, defaultBuyout — % выкупа из Продажи!M и фолбэк Параметры!B8
 *   acquiring       — ₽
 *   price           — текущая цена (с акцией)
 *   priceWithoutAction — цена без акции
 *   oldPrice        — зачёркнутая цена
 *   minPrice        — ограничение из Ozon
 *   minMarkup, targetMarkup — доли (поддерживается каскад SKU → категория → общая)
 *   roundStep       — шаг округления вверх из Параметры!B11
 *   vatRate, profitTaxRate — ставки НДС и налога на прибыль (показываются отдельно)
 *   actions         — строки листа «Акции» для проверки ограничений
 */
function unitEconomics(sku) {
  const land = landCost(sku.costPerUnit, sku.multiplicity, sku.packaging, sku.transport);
  if (land === null) {
    return { ok: false, reason: 'нет ленд-коста: не заданы себестоимость и/или кратность' };
  }

  let c = null;
  let commissionSource = '';
  if (sku.factCommissionRate !== undefined || sku.schemeCommissionRate !== undefined) {
    const resolvedComm = resolveCommissionRate(
      sku.factCommissionRate,
      sku.schemeCommissionRate !== undefined ? sku.schemeCommissionRate : sku.commissionRate,
      sku.scheme
    );
    c = resolvedComm.rate;
    commissionSource = resolvedComm.source;
  } else {
    c = num(sku.commissionRate);
    commissionSource = c !== null ? (sku.scheme === 'FBO' ? 'Факт Ozon!W' : 'Факт Ozon!X') : '';
  }
  if (c === null || c >= 1) return { ok: false, reason: 'нет комиссии или она ≥ 100%' };

  const dRaw = sku.drrRate !== undefined ? sku.drrRate : sku.drr;
  const d = num(dRaw) || 0;

  let directLog = num(sku.logistics);
  if (directLog === null) {
    const scheme = sku.scheme === 'FBO' || sku.scheme === 'FBS'
      ? sku.scheme
      : ((num(sku.stockFbo) || 0) > 0 ? 'FBO' : 'FBS');
    directLog = scheme === 'FBO'
      ? logisticsFbo(sku.fboMin, sku.fboMax, sku.fboDeliv)
      : logisticsFbs(sku.firstMileMin, sku.firstMileMax, sku.fbsMin, sku.fbsMax, sku.fbsDeliv);
  }
  directLog = directLog || 0;

  // --- Выкуп и возвратный тариф ---
  let buyoutInfo = { rate: 1, percent: 100, source: 'Параметры!B8', blocked: false, warning: null };
  if (sku.salesBuyout !== undefined || sku.defaultBuyout !== undefined) {
    buyoutInfo = resolveBuyoutRate(sku.salesBuyout, sku.defaultBuyout !== undefined ? sku.defaultBuyout : sku.buyoutRate);
  } else if (sku.buyoutRate !== undefined && sku.buyoutRate !== null && sku.buyoutRate !== '') {
    buyoutInfo = resolveBuyoutRate(sku.buyoutRate, 1);
  }

  const returnTariff = num(sku.returnTariff !== undefined
    ? sku.returnTariff
    : (sku.scheme === 'FBO' ? sku.returnFbo : sku.returnFbs)) || 0;
  const returnCost = buyoutInfo.blocked ? null : returnCostPerUnit(returnTariff, buyoutInfo.rate);
  const log = returnCost !== null ? (directLog + returnCost) : directLog;

  const acq = num(sku.acquiring) || 0;
  const curPriceVal = sku.price !== undefined ? sku.price : sku.currentPrice;
  const noActionPriceVal = sku.priceWithoutAction !== undefined ? sku.priceWithoutAction : sku.noActionPrice;
  const minPriceVal = sku.minPrice !== undefined ? sku.minPrice : sku.ozonMinPrice;

  if (num(curPriceVal) === null) return { ok: false, reason: 'нет цены — считать наценку не с чего' };

  const targetCascade = resolveMarkupCascade(sku.skuTargetMarkup, sku.categoryTargetMarkup, sku.targetMarkup);
  const minCascade = resolveMarkupCascade(sku.skuMinMarkup, sku.categoryMinMarkup, sku.minMarkup);
  const effTargetMarkup = targetCascade.rate !== null ? targetCascade.rate : num(sku.targetMarkup);
  const effMinMarkup = minCascade.rate !== null ? minCascade.rate : num(sku.minMarkup);

  const priceBlocked = Boolean(buyoutInfo.blocked);

  const mPrice = !priceBlocked ? markupFromPrice(curPriceVal, c, d, land, log, acq) : null;
  const mNoAction = (!priceBlocked && num(noActionPriceVal) !== null)
    ? markupFromPrice(noActionPriceVal, c, d, land, log, acq)
    : null;
  const mOld = !priceBlocked ? markupFromPrice(sku.oldPrice, c, d, land, log, acq) : null;
  const mMin = !priceBlocked ? markupFromPrice(minPriceVal, c, d, land, log, acq) : null;

  const floor = !priceBlocked ? actionFloor(effMinMarkup, c, d, land, log, acq) : null;
  const target = !priceBlocked ? priceFromMarkup(effTargetMarkup, c, d, land, log, acq) : null;
  const breakEven = !priceBlocked ? breakEvenPrice(c, d, land, log, acq) : null;

  const step = num(sku.roundStep);
  const targetRounded = (step !== null && step > 0) ? roundPriceUp(target, step) : target;
  const floorRounded = (step !== null && step > 0) ? roundPriceUp(floor, step) : floor;
  const breakEvenRounded = (step !== null && step > 0) ? roundPriceUp(breakEven, step) : breakEven;
  const recOldPrice = !priceBlocked
    ? recommendedOldPrice(targetRounded !== null ? targetRounded : target, sku.oldPriceMarkup, step)
    : null;

  const curNum = num(curPriceVal);
  const effectiveTarget = targetRounded !== null ? targetRounded : target;
  const deltaRub = (!priceBlocked && curNum !== null && effectiveTarget !== null)
    ? Math.round((curNum - effectiveTarget) * 100) / 100
    : null;
  const deltaPercent = (deltaRub !== null && effectiveTarget > 0)
    ? Math.round((deltaRub / effectiveTarget) * 10000) / 100
    : null;

  const profitBeforeTax = (!priceBlocked && curNum !== null)
    ? (curNum * (1 - c) * (1 - d) - log - acq - land)
    : null;
  const taxes = taxBreakdown(curNum, profitBeforeTax, sku.vatRate, sku.profitTaxRate);

  const deliveredUnits = num(sku.deliveredUnits !== undefined ? sku.deliveredUnits : sku.orderedUnits);
  const salesRevenue = num(sku.salesRevenue !== undefined ? sku.salesRevenue : sku.revenue);
  const totalProfitBeforeTax = (profitBeforeTax !== null && deliveredUnits !== null && deliveredUnits >= 0)
    ? Math.round(profitBeforeTax * deliveredUnits * 100) / 100
    : null;

  const effectiveCategory = (sku.category !== undefined && sku.category !== null && String(sku.category).trim() !== '')
    ? String(sku.category).trim()
    : inferProductGroup(sku.offerId, sku.name);

  const effectiveFloorForActions = floorRounded !== null ? floorRounded : floor;
  const actionChecks = Array.isArray(sku.actions)
    ? sku.actions.map(function (act) {
        const chk = checkActionConstraint(
          effectiveFloorForActions,
          act.maxActionPrice !== undefined ? act.maxActionPrice : act.max_action_price,
          act.actionPrice !== undefined ? act.actionPrice : act.action_price
        );
        return Object.assign({}, act, chk);
      })
    : [];

  const warnings = [
    buyoutInfo.warning,
    !isFeasible(c, d)
      ? 'комиссия и ДРР вместе забирают ' + r0((1 - headroom(c, d)) * 100) +
        '% цены — расчёт формально верен, но цена выйдет нерыночной' : null,
    (num(minPriceVal) !== null && floor !== null && num(minPriceVal) < floor)
      ? 'min_price в Ozon ниже нашего ограничения для акций' : null,
    (target !== null && curNum !== null && target > curNum)
      ? 'текущая цена ниже целевой' : null,
    (mPrice !== null && effMinMarkup !== null && mPrice < effMinMarkup)
      ? 'фактическая наценка ниже минимально допустимой' : null
  ].concat(actionChecks.map(function (a) { return a.warning; })).filter(Boolean);

  return {
    ok: true,
    category: effectiveCategory,
    landCost: land,
    directLogistics: directLog,
    returnTariff,
    buyoutRate: buyoutInfo.rate,
    buyoutPercent: buyoutInfo.percent,
    buyoutSource: buyoutInfo.source,
    returnCost,
    logistics: log,
    acquiring: acq,
    commissionRate: c,
    commissionSource,
    drrRate: d,
    priceBlocked,
    markup: {
      byCurrentPrice: mPrice,     // наценка по цене с акцией
      byNoActionPrice: mNoAction, // по цене без акции
      byOldPrice: mOld,           // по зачёркнутой
      byMinPrice: mMin,           // по ограничению для акций
      targetRate: effTargetMarkup,
      minRate: effMinMarkup,
      source: targetCascade.source || minCascade.source
    },
    price: {
      current: curNum,
      target: target,             // цена при целевой наценке
      actionFloor: floor,         // ограничение для акций
      breakEven: breakEven,       // безубыточность
      targetRounded,
      actionFloorRounded: floorRounded,
      breakEvenRounded,
      recommendedOldPrice: recOldPrice,
      deltaRub,
      deltaPercent
    },
    salesVolume: {
      deliveredUnits: deliveredUnits !== null ? deliveredUnits : 0,
      revenue: salesRevenue !== null ? salesRevenue : 0,
      totalProfitBeforeTax
    },
    taxes,
    actionChecks,
    // запас цены — индикатор жизнеспособности (см. headroom)
    headroom: headroom(c, d),

    // флаги, которые в таблице были условным форматированием
    warnings
  };
}

/**
 * Запас цены: какую долю цены продавца товар переживает после комиссии и ДРР.
 *   headroom = (1 − Комиссия) × (1 − ДРР)
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

/** Округление до целого для человекочитаемых предупреждений. */
function r0(v) { return Math.round(Number(v) || 0); }

/** Пустое/''/undefined → null, иначе число. Строки с запятой как разделителем понимаем. */
function num(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}

module.exports = {
  toFractionRate,
  resolveCommissionRate,
  resolveBuyoutRate,
  returnCostPerUnit,
  resolveMarkupCascade,
  roundPriceUp,
  recommendedOldPrice,
  inferProductGroup,
  taxBreakdown,
  checkActionConstraint,
  landCost, logisticsFbo, logisticsFbs,
  markupFromPrice, priceFromMarkup, actionFloor, breakEvenPrice, markupAtPrice,
  headroom, isFeasible, MIN_HEADROOM,
  unitEconomics, num
};
