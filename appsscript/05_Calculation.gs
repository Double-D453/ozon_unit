/**
 * Файл 6 из 6: РАСЧЁТ ЮНИТ-ЭКОНОМИКИ И ЦЕЛЕВЫХ ЦЕН (Э2/Э3)
 * ---------------------------------------------------------------
 * Листы:
 *   • «Расчёт»            — полный расчёт по каждому SKU (статьи затрат,
 *                           фактические наценки по 4 ценам, целевая цена,
 *                           ограничение для акций, безубыточность, налоги,
 *                           проверка акций и предупреждения);
 *   • «Настройки расчёта» — индивидуальные и категорийные наценки для каскада
 *                           SKU → категория (Номенклатура!P) → общая (Параметры!B10/B9).
 *
 * Правила расчёта (Э2/Э3):
 *   1. Комиссия: сначала фактическая ставка по SKU из «Комиссия факт!J»;
 *      если её нет — текущая «Факт Ozon!W/X». «Параметры!B14» калькулятором не меняется.
 *   2. Выкуп: из «Продажи!M», если значение в диапазоне 0–100%. Пустое, отрицательное
 *      или >100% заменяется на «Параметры!B8» с предупреждением. Валидные 0% принимаются,
 *      но блокируют цену (ожидаемая стоимость возврата на выкупленную единицу неограниченна).
 *   3. Возвратный тариф: учитывается как тариф возврата × (1 − выкуп) / выкуп.
 *   4. Целевая цена: считается по проверенной формуле до налогов. НДС и налог на прибыль
 *      показываются отдельно; неподтверждённый входящий НДС из цены не вычитается.
 *   5. Наценки: каскад SKU → категория (Номенклатура!P) → общая (Параметры!B10/B9).
 *   6. Округление: цены округляются вверх по шагу из «Параметры!B11».
 *   7. Ограничения акций: проверяются по каждой текущей строке листа «Акции» —
 *      наш минимальный пол должен быть не выше лимита Ozon (Макс. допустимая цена).
 *      Никаких изменений цены на Ozon не отправляется (Э5 вне рамок).
 */

function calcSettingsHeaders_() {
  return [
    'Уровень (SKU / Категория)',
    'Ключ (Offer id / SKU / Категория)',
    'Целевая наценка, %',
    'Мин. наценка, %',
    'Комментарий'
  ];
}

function calcHeaders_() {
  return [
    'Offer id',                        // 1  A
    'SKU',                             // 2  B
    'Наименование',                    // 3  C
    'Категория',                       // 4  D (Номенклатура!P)
    'Схема',                           // 5  E (FBO / FBS)
    'СС за ед., ₽',                    // 6  F
    'Кратность',                       // 7  G
    'Упаковка, ₽',                     // 8  H
    'Ленд-кост, ₽',                    // 9  I
    'Логистика прямая, ₽',             // 10 J
    'Тариф возврата, ₽',               // 11 K
    'Выкуп, %',                        // 12 L
    'Источник выкупа',                 // 13 M
    'Возвраты на 1 выкуп., ₽',         // 14 N
    'Логистика с возвратами, ₽',       // 15 O
    'Эквайринг, ₽',                    // 16 P
    'Комиссия, %',                     // 17 Q
    'Источник комиссии',               // 18 R
    'ДРР, %',                          // 19 S
    'Запас цены (headroom), %',        // 20 T
    'Цена с акцией, ₽',                // 21 U
    'Цена без акции, ₽',               // 22 V
    'Зачёркнутая цена, ₽',             // 23 W
    'min_price Ozon, ₽',               // 24 X
    'Наценка по цене с акцией, %',     // 25 Y
    'Наценка по цене без акции, %',    // 26 Z
    'Наценка по зачёркнутой цене, %',  // 27 AA
    'Наценка по min_price, %',         // 28 AB
    'Мин. наценка, %',                 // 29 AC
    'Целевая наценка, %',              // 30 AD
    'Источник наценки',                // 31 AE
    'Безубыточность, ₽',               // 32 AF (округлённая вверх по B11)
    'Ограничение для акций (наш пол), ₽', // 33 AG (округлённая вверх по B11)
    'Целевая цена (до окр.), ₽',       // 34 AH
    'Целевая цена, ₽',                 // 35 AI (округлённая вверх по B11)
    'Прибыль до налогов, ₽',           // 36 AJ
    'НДС в цене, ₽',                   // 37 AK
    'Налог на прибыль, ₽',             // 38 AL
    'Статус акций',                    // 39 AM
    'Статус / Предупреждения'          // 40 AN
  ];
}

function calcNum_(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}

function calcToFraction_(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    if (s.slice(-1) === '%') {
      const p = calcNum_(s.slice(0, -1));
      return p !== null ? p / 100 : null;
    }
  }
  const n = calcNum_(v);
  if (n === null) return null;
  if (Math.abs(n) > 1) return n / 100;
  return n;
}

function calcRound2_(v) {
  const n = calcNum_(v);
  return n === null ? '' : Math.round(n * 100) / 100;
}

function calcRoundUp_(price, step) {
  const p = calcNum_(price);
  if (p === null || p <= 0) return null;
  const s = calcNum_(step);
  if (s === null || s <= 0) return p;
  const k = Math.ceil((p - 1e-9) / s);
  return Math.round((k * s) * 10000) / 10000;
}

/**
 * Чтение общих параметров расчёта с листа «Параметры» (B4..B14).
 * ВАЖНО: Параметры!B14 никогда не модифицируется калькулятором.
 */
function readCalcParams_() {
  const defaults = {
    drr: 0.15,
    acquiringRate: 0.015,
    vatRate: 0.22,
    profitTaxRate: 0.25,
    buyoutDefault: 1,
    minMarkup: 0.2,
    targetMarkup: 0.3,
    roundStep: 1,
    warehouse: 'МСК',
    scheme: 'Авто',
    commissionDiscount: CFG.COMMISSION_DISCOUNT_DEFAULT
  };

  const par = ss_().getSheetByName('Параметры');
  if (!par || par.getLastRow() < 1) return defaults;

  const last = par.getLastRow();
  const rows = par.getRange(1, 1, last, 2).getValues();
  rows.forEach(function (r, idx) {
    const label = String(r[0] || '').trim();
    const val = r[1];
    if (!label) return;
    if (/^дрр\b|доля рекламн/i.test(label) || idx === 3) {
      const f = calcToFraction_(val);
      if (f !== null && f >= 0 && f < 1) defaults.drr = f;
    } else if (/^эквайринг/i.test(label) || idx === 4) {
      const f = calcToFraction_(val);
      if (f !== null && f >= 0 && f < 1) defaults.acquiringRate = f;
    } else if (/^ндс\b/i.test(label) || idx === 5) {
      const f = calcToFraction_(val);
      if (f !== null && f >= 0 && f < 1) defaults.vatRate = f;
    } else if (/налог на прибыль/i.test(label) || idx === 6) {
      const f = calcToFraction_(val);
      if (f !== null && f >= 0 && f < 1) defaults.profitTaxRate = f;
    } else if (/выкупа/i.test(label) || idx === 7) {
      const f = calcToFraction_(val);
      if (f !== null && f >= 0 && f <= 1) defaults.buyoutDefault = f;
    } else if (/минимально допустимая наценка|мин.*наценка/i.test(label) || idx === 8) {
      const f = calcToFraction_(val);
      if (f !== null && f >= 0) defaults.minMarkup = f;
    } else if (/целевая наценка/i.test(label) || idx === 9) {
      const f = calcToFraction_(val);
      if (f !== null && f >= 0) defaults.targetMarkup = f;
    } else if (/шаг округления/i.test(label) || idx === 10) {
      const n = calcNum_(val);
      if (n !== null && n > 0) defaults.roundStep = n;
    } else if (/^склад\b/i.test(label) || idx === 11) {
      if (val !== '' && val !== null && val !== undefined) defaults.warehouse = String(val).trim();
    } else if (/схема работы/i.test(label) || idx === 12) {
      if (val !== '' && val !== null && val !== undefined) defaults.scheme = String(val).trim();
    } else if (/скидка к комиссии/i.test(label) || idx === 13) {
      const n = calcNum_(val);
      if (n !== null && n >= 0) defaults.commissionDiscount = n;
    }
  });

  return defaults;
}

/**
 * Чтение каскада наценок с листа «Настройки расчёта».
 * Поддерживает как формат [Уровень ('SKU'/'Категория'), Ключ, Целевая, Мин.],
 * так и формат [Категория, Offer id / SKU, Целевая, Мин.].
 */
function readCalcSettings_() {
  const bySku = {};
  const byCat = {};
  const sh = sheet_(CFG.SHEETS.CALC_SETTINGS, calcSettingsHeaders_());
  const last = sh.getLastRow();
  if (last < 2) return { bySku: bySku, byCat: byCat };

  const rows = sh.getRange(2, 1, last - 1, CFG.CALC_SETTINGS_COLS).getValues();
  rows.forEach(function (r) {
    const colA = String(r[0] === undefined || r[0] === null ? '' : r[0]).trim();
    const colB = String(r[1] === undefined || r[1] === null ? '' : r[1]).trim();
    const target = calcToFraction_(r[2]);
    const min = calcToFraction_(r[3]);
    if (target === null && min === null) return;

    const entry = {
      targetMarkup: target !== null && target >= 0 ? target : null,
      minMarkup: min !== null && min >= 0 ? min : null
    };

    const lowA = colA.toLowerCase();
    if (lowA === 'sku' || lowA === 'offer' || lowA === 'offer id' || lowA === 'артикул' || lowA === 'товар') {
      if (colB) bySku[colB] = entry;
    } else if (lowA === 'категория' || lowA === 'category' || lowA === 'cat') {
      if (colB) byCat[colB] = entry;
    } else if (colB && !colA) {
      bySku[colB] = entry;
    } else if (colA && !colB) {
      byCat[colA] = entry;
    } else if (colA && colB) {
      // Если заполнены обе колонки (например [Категория, Offer id, ...]), привязываем к SKU
      bySku[colB] = entry;
    }
  });

  return { bySku: bySku, byCat: byCat };
}

/**
 * Каскад наценки для конкретного товара: SKU → категория (Номенклатура!P) → общая (Параметры!B10/B9).
 */
function resolveItemMarkups_(offerId, sku, category, settings, params) {
  const oidKey = String(offerId || '').trim();
  const skuKey = String(sku || '').trim();
  const catKey = String(category || '').trim();

  const skuEntry = (oidKey && settings.bySku[oidKey]) || (skuKey && settings.bySku[skuKey]) || null;
  const catEntry = (catKey && settings.byCat[catKey]) || null;

  let targetRate = params.targetMarkup;
  let targetSource = 'Параметры!B10';
  if (skuEntry && skuEntry.targetMarkup !== null) {
    targetRate = skuEntry.targetMarkup;
    targetSource = 'SKU';
  } else if (catEntry && catEntry.targetMarkup !== null) {
    targetRate = catEntry.targetMarkup;
    targetSource = 'категория';
  }

  let minRate = params.minMarkup;
  let minSource = 'Параметры!B9';
  if (skuEntry && skuEntry.minMarkup !== null) {
    minRate = skuEntry.minMarkup;
    minSource = 'SKU';
  } else if (catEntry && catEntry.minMarkup !== null) {
    minRate = catEntry.minMarkup;
    minSource = 'категория';
  }

  const source = (targetSource === 'SKU' || minSource === 'SKU')
    ? 'SKU'
    : ((targetSource === 'категория' || minSource === 'категория') ? 'категория' : 'Параметры!B10/B9');

  return {
    targetMarkup: targetRate,
    minMarkup: minRate,
    targetSource: targetSource,
    minSource: minSource,
    source: source
  };
}

/**
 * Валидация выкупа из «Продажи!M» (0–100%) с фолбэком на «Параметры!B8».
 */
function resolveItemBuyout_(salesRaw, defaultBuyout) {
  const defRate = (defaultBuyout !== null && defaultBuyout !== undefined && defaultBuyout >= 0 && defaultBuyout <= 1)
    ? defaultBuyout
    : 1;
  const defPct = Math.round(defRate * 10000) / 100;

  if (salesRaw === '' || salesRaw === null || salesRaw === undefined || typeof salesRaw === 'boolean') {
    return {
      rate: defRate,
      percent: defPct,
      source: 'Параметры!B8',
      blocked: defRate === 0,
      warning: 'выкуп: пусто в Продажи!M, взят Параметры!B8'
    };
  }

  let raw = salesRaw;
  let explicitPct = false;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) {
      return {
        rate: defRate,
        percent: defPct,
        source: 'Параметры!B8',
        blocked: defRate === 0,
        warning: 'выкуп: пусто в Продажи!M, взят Параметры!B8'
      };
    }
    if (s.slice(-1) === '%') {
      explicitPct = true;
      raw = s.slice(0, -1);
    }
  }

  const n = calcNum_(raw);
  if (n === null) {
    return {
      rate: defRate,
      percent: defPct,
      source: 'Параметры!B8',
      blocked: defRate === 0,
      warning: 'выкуп: некорректное значение в Продажи!M, взят Параметры!B8'
    };
  }

  if (n < 0) {
    return {
      rate: defRate,
      percent: defPct,
      source: 'Параметры!B8',
      blocked: defRate === 0,
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
      rate: defRate,
      percent: defPct,
      source: 'Параметры!B8',
      blocked: defRate === 0,
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
 * Выбор комиссии: сначала фактическая ставка по SKU из «Комиссия факт!J»,
 * если её нет — текущая «Факт Ozon!W/X».
 */
function resolveItemCommission_(commRow, factRow, scheme) {
  if (commRow) {
    const factPct = calcNum_(commRow[9]); // колонка J «Комиссия факт, %»
    if (factPct !== null && factPct > 0) {
      const rate = factPct > 1 ? factPct / 100 : factPct;
      if (rate > 0 && rate < 1) {
        return {
          rate: rate,
          percent: Math.round(rate * 10000) / 100,
          source: 'Комиссия факт!J'
        };
      }
    }
  }
  if (factRow) {
    const colIdx = scheme === 'FBO' ? 22 : 23; // W (22) или X (23)
    const fallbackRaw = calcNum_(factRow[colIdx]);
    if (fallbackRaw !== null && fallbackRaw > 0) {
      const rate = fallbackRaw > 1 ? fallbackRaw / 100 : fallbackRaw;
      if (rate > 0 && rate < 1) {
        return {
          rate: rate,
          percent: Math.round(rate * 10000) / 100,
          source: scheme === 'FBO' ? 'Факт Ozon!W' : 'Факт Ozon!X'
        };
      }
    }
  }
  return { rate: null, percent: null, source: '' };
}

/**
 * Проверка одной строки листа «Акции» относительно нашего минимального пола.
 */
function checkSheetActionRow_(floorPrice, maxActionPrice, actionPrice, ctx) {
  const floor = calcNum_(floorPrice);
  const limit = calcNum_(maxActionPrice);
  const actP = calcNum_(actionPrice);

  let actionMarkupPct = '';
  if (ctx && !ctx.priceBlocked && actP !== null && actP > 0 && ctx.land > 0 && ctx.c > 0 && ctx.c < 1) {
    const m = (actP * (1 - ctx.c) * (1 - ctx.d) - ctx.totalLogistics - ctx.acquiring) / ctx.land - 1;
    actionMarkupPct = Math.round(m * 10000) / 100;
  }

  if (floor === null || floor <= 0) {
    return {
      floorRub: '',
      headroomRub: '',
      actionMarkupPct: actionMarkupPct,
      allowed: false,
      status: ctx && ctx.priceBlocked ? 'БЛОК: выкуп 0% (цена заблокирована)' : 'БЛОК: нет расчёта нашего пола',
      warning: 'акция: нет расчёта минимального пола по SKU'
    };
  }

  const headroomRub = (limit !== null && limit > 0) ? Math.round((limit - floor) * 100) / 100 : '';
  if (limit !== null && limit > 0 && floor > limit + 1e-9) {
    return {
      floorRub: calcRound2_(floor),
      headroomRub: headroomRub,
      actionMarkupPct: actionMarkupPct,
      allowed: false,
      status: 'КОНФЛИКТ: наш пол выше лимита Ozon',
      warning: 'акция: наш минимальный пол (' + calcRound2_(floor) + ' ₽) выше лимита Ozon (' + calcRound2_(limit) + ' ₽)'
    };
  }

  if (actP !== null && actP > 0 && actP < floor - 1e-9) {
    return {
      floorRub: calcRound2_(floor),
      headroomRub: headroomRub,
      actionMarkupPct: actionMarkupPct,
      allowed: true,
      status: 'ВНИМАНИЕ: цена акции ниже нашего пола',
      warning: 'акция: текущая цена акции (' + calcRound2_(actP) + ' ₽) ниже нашего пола (' + calcRound2_(floor) + ' ₽)'
    };
  }

  return {
    floorRub: calcRound2_(floor),
    headroomRub: headroomRub,
    actionMarkupPct: actionMarkupPct,
    allowed: true,
    status: 'ОК: пол ≤ лимита Ozon',
    warning: null
  };
}

/**
 * Основная функция расчёта юнит-экономики (Э2/Э3).
 * Читает «Номенклатуру», «Факт Ozon», «Комиссия факт», «Продажи», «Реклама ДРР»,
 * «Параметры», «Настройки расчёта» и «Акции», формирует лист «Расчёт» и обновляет
 * колонки проверки ограничений на листе «Акции».
 * Никаких изменений цены в Ozon НЕ отправляет.
 */
function calculateUnitEconomics() {
  const t0 = Date.now();
  try {
    const ss = ss_();
    const nom = ss.getSheetByName(CFG.SHEETS.NOM);
    if (!nom || nom.getLastRow() < 2) {
      throw new Error('Лист «Номенклатура» пуст или не найден.');
    }

    const params = readCalcParams_();
    const settings = readCalcSettings_();

    // --- 1. Индекс «Факт Ozon» по Offer id ---
    const factByOffer = {};
    const factSh = ss.getSheetByName(CFG.SHEETS.FACT);
    if (factSh && factSh.getLastRow() >= 2) {
      const fCols = Math.min(Math.max(factSh.getMaxColumns(), CFG.FACT_COLS), 30);
      factSh.getRange(2, 1, factSh.getLastRow() - 1, fCols).getValues().forEach(function (r) {
        const oid = String(r[0] || '').trim();
        if (oid) factByOffer[oid] = r;
      });
    }

    // --- 2. Индекс «Комиссия факт» по Offer id и по SKU ---
    const commByOffer = {}, commBySku = {};
    const commSh = ss.getSheetByName(CFG.SHEETS.COMM);
    if (commSh && commSh.getLastRow() >= 2) {
      const cCols = Math.min(Math.max(commSh.getMaxColumns(), CFG.COMM_COLS), 20);
      commSh.getRange(2, 1, commSh.getLastRow() - 1, cCols).getValues().forEach(function (r) {
        const oid = String(r[0] || '').trim();
        const sku = String(r[1] || '').trim();
        if (oid && !commByOffer[oid]) commByOffer[oid] = r;
        if (sku && !commBySku[sku]) commBySku[sku] = r;
      });
    }

    // --- 3. Индекс «Продажи» по Offer id и по SKU ---
    const salesByOffer = {}, salesBySku = {};
    const salesSh = ss.getSheetByName(CFG.SHEETS.SALES);
    if (salesSh && salesSh.getLastRow() >= 2) {
      const sCols = Math.min(Math.max(salesSh.getMaxColumns(), CFG.SALES_COLS), 20);
      salesSh.getRange(2, 1, salesSh.getLastRow() - 1, sCols).getValues().forEach(function (r) {
        const oid = String(r[0] || '').trim();
        const sku = String(r[1] || '').trim();
        if (oid && !salesByOffer[oid]) salesByOffer[oid] = r;
        if (sku && !salesBySku[sku]) salesBySku[sku] = r;
      });
    }

    // --- 4. Индекс «Реклама ДРР» по Offer id и по SKU ---
    const drrByOffer = {}, drrBySku = {};
    const drrSh = ss.getSheetByName(CFG.SHEETS.DRR);
    if (drrSh && drrSh.getLastRow() >= 2) {
      const dCols = Math.min(Math.max(drrSh.getMaxColumns(), CFG.DRR_COLS), 20);
      drrSh.getRange(2, 1, drrSh.getLastRow() - 1, dCols).getValues().forEach(function (r) {
        const oid = String(r[0] || '').trim();
        const sku = String(r[1] || '').trim();
        if (oid && !drrByOffer[oid]) drrByOffer[oid] = r;
        if (sku && !drrBySku[sku]) drrBySku[sku] = r;
      });
    }

    // --- 5. Читаем текущие строки листа «Акции» ---
    const actSh = ss.getSheetByName(CFG.SHEETS.ACT);
    let actRows = [];
    if (actSh && actSh.getLastRow() >= 2) {
      const aCols = Math.max(actSh.getMaxColumns(), CFG.ACT_SYNC_COLS);
      actRows = actSh.getRange(2, 1, actSh.getLastRow() - 1, aCols).getValues();
    }
    const actByOffer = {};
    actRows.forEach(function (r, idx) {
      const oid = String(r[2] || '').trim();
      if (!oid) return;
      if (!actByOffer[oid]) actByOffer[oid] = [];
      actByOffer[oid].push({ rowIndex: idx, row: r });
    });

    // --- 6. Читаем «Номенклатуру» и считаем каждый SKU ---
    const nomCols = Math.max(nom.getMaxColumns(), CFG.NOM_COLS);
    const nomRows = nom.getRange(2, 1, nom.getLastRow() - 1, nomCols).getValues();

    const calcRows = [];
    const skuContextByOffer = {};
    let calculated = 0, skippedNoCost = 0, skippedNoFact = 0, blockedZeroBuyout = 0;
    let commFromFact = 0, commFromFallback = 0;
    let buyoutFromSales = 0, buyoutFallback = 0;
    let belowMinMarkup = 0, belowTargetPrice = 0, actionConflicts = 0;

    nomRows.forEach(function (nr) {
      const oid = String(nr[0] === undefined || nr[0] === null ? '' : nr[0]).trim();
      if (!oid) return;

      const sku = String(nr[1] === undefined || nr[1] === null ? '' : nr[1]).trim();
      const name = String(nr[2] === undefined || nr[2] === null ? '' : nr[2]);
      const costPerUnit = calcNum_(nr[5]); // F
      const multiplicity = calcNum_(nr[6]); // G
      const packagingRaw = nr[7];          // H
      const packaging = calcNum_(packagingRaw) || 0;
      const nomStockFbo = calcNum_(nr[11]); // L
      const nomScheme = String(nr[13] || '').trim().toUpperCase(); // N
      const category = nr[15] !== undefined && nr[15] !== null ? String(nr[15]).trim() : ''; // P
      const syncFlag = nr[16] !== undefined && nr[16] !== null ? String(nr[16]).trim() : ''; // Q

      const warnings = [];
      const errors = [];

      if (costPerUnit === null || costPerUnit <= 0) errors.push('нет СС (1С)');
      if (multiplicity === null || multiplicity <= 0) errors.push('нет кратности');
      if (packagingRaw === '' || packagingRaw === null || packagingRaw === undefined || packaging === 0) {
        warnings.push('упаковка = 0');
      }

      const land = (costPerUnit !== null && costPerUnit > 0 && multiplicity !== null && multiplicity > 0)
        ? (costPerUnit * multiplicity + packaging)
        : null;

      const fr = factByOffer[oid] || null;
      if (!fr) errors.push('нет строки в «Факт Ozon»');

      // Определение схемы FBO / FBS
      let scheme = 'FBS';
      const paramScheme = String(params.scheme || '').trim().toUpperCase();
      if (paramScheme === 'FBO' || paramScheme === 'FBS') {
        scheme = paramScheme;
      } else if (fr) {
        const fboSt = calcNum_(fr[17]);
        const fbsSt = calcNum_(fr[18]);
        if (fboSt !== null && fboSt > 0) scheme = 'FBO';
        else if (fboSt === 0 && fbsSt !== null && fbsSt > 0) scheme = 'FBS';
        else if (nomScheme === 'FBO' || nomScheme === 'FBS') scheme = nomScheme;
        else if (nomStockFbo !== null && nomStockFbo > 0) scheme = 'FBO';
      } else if (nomScheme === 'FBO' || nomScheme === 'FBS') {
        scheme = nomScheme;
      }

      // Прямая логистика и тариф возврата
      let directLogistics = null;
      let returnTariff = 0;
      let acquiring = null;
      let curPrice = null, noActionPrice = null, oldPrice = null, ozonMinPrice = null;
      let vatRate = params.vatRate;

      if (fr) {
        curPrice = calcNum_(fr[1]);
        noActionPrice = calcNum_(fr[2]);
        oldPrice = calcNum_(fr[3]);
        ozonMinPrice = calcNum_(fr[4]);

        const fVat = calcToFraction_(fr[5]);
        if (fVat !== null && fVat > 0 && fVat < 1) vatRate = fVat;

        if (scheme === 'FBO') {
          const fboMin = calcNum_(fr[8]), fboMax = calcNum_(fr[9]), fboDeliv = calcNum_(fr[10]);
          if (fboMin !== null && fboMax !== null) {
            directLogistics = (fboMin + fboMax) / 2 + (fboDeliv || 0);
          }
          returnTariff = calcNum_(fr[20]) || 0;
        } else {
          const fmMin = calcNum_(fr[11]), fmMax = calcNum_(fr[12]);
          const fbsMin = calcNum_(fr[13]), fbsMax = calcNum_(fr[14]), fbsDeliv = calcNum_(fr[15]);
          if (fbsMin !== null && fbsMax !== null) {
            directLogistics = (fbsMin + fbsMax) / 2 + (fbsDeliv || 0) +
              ((fmMin !== null && fmMax !== null) ? (fmMin + fmMax) / 2 : 0);
          }
          returnTariff = calcNum_(fr[21]) || 0;
        }

        acquiring = calcNum_(fr[16]);
        if (acquiring === null && curPrice !== null && curPrice > 0) {
          acquiring = curPrice * params.acquiringRate;
        }
      }

      if (directLogistics === null) errors.push('нет логистики ' + scheme);
      if (curPrice === null || curPrice <= 0) errors.push('нет цены в Ozon');

      // Выкуп из Продажи!M
      const sRow = salesByOffer[oid] || (sku ? salesBySku[sku] : null) || null;
      const salesBuyoutRaw = sRow ? sRow[12] : '';
      const buyoutInfo = resolveItemBuyout_(salesBuyoutRaw, params.buyoutDefault);
      if (buyoutInfo.warning) warnings.push(buyoutInfo.warning);
      if (buyoutInfo.source === 'Продажи!M') buyoutFromSales++;
      else buyoutFallback++;

      // Комиссия: сначала Комиссия факт!J, иначе Факт Ozon!W/X
      const cRow = commByOffer[oid] || (sku ? commBySku[sku] : null) || null;
      const commInfo = resolveItemCommission_(cRow, fr, scheme);
      if (commInfo.rate === null) {
        errors.push('нет комиссии Ozon');
      } else if (commInfo.source === 'Комиссия факт!J') {
        commFromFact++;
      } else {
        commFromFallback++;
      }

      // ДРР: используем проверенную ставку Параметры!B4 (общая доля ДРР магазина)
      const d = params.drr;
      const drrPct = Math.round(d * 10000) / 100;

      // Каскад наценок: SKU → категория → Параметры!B10/B9
      const markups = resolveItemMarkups_(oid, sku, category, settings, params);

      if (errors.length) {
        if (costPerUnit === null || costPerUnit <= 0 || multiplicity === null || multiplicity <= 0) {
          skippedNoCost++;
        } else {
          skippedNoFact++;
        }
        const statusStr = 'ПРОПУСК: ' + errors.join(', ') + (syncFlag ? ' [' + syncFlag + ']' : '');
        skuContextByOffer[oid] = {
          ok: false,
          priceBlocked: true,
          actionFloorRounded: null,
          land: land,
          c: commInfo.rate,
          d: d,
          totalLogistics: null,
          acquiring: acquiring
        };
        calcRows.push([
          oid,
          sku ? (isNaN(Number(sku)) ? sku : Number(sku)) : '',
          name,
          category !== '' ? (isNaN(Number(category)) ? category : Number(category)) : '',
          scheme,
          costPerUnit !== null ? calcRound2_(costPerUnit) : '',
          multiplicity !== null ? multiplicity : '',
          calcRound2_(packaging),
          land !== null ? calcRound2_(land) : '',
          directLogistics !== null ? calcRound2_(directLogistics) : '',
          calcRound2_(returnTariff),
          buyoutInfo.percent,
          buyoutInfo.source,
          '',
          '',
          acquiring !== null ? calcRound2_(acquiring) : '',
          commInfo.percent !== null ? commInfo.percent : '',
          commInfo.source,
          drrPct,
          '',
          curPrice !== null && curPrice > 0 ? calcRound2_(curPrice) : '',
          noActionPrice !== null && noActionPrice > 0 ? calcRound2_(noActionPrice) : '',
          oldPrice !== null && oldPrice > 0 ? calcRound2_(oldPrice) : '',
          ozonMinPrice !== null && ozonMinPrice > 0 ? calcRound2_(ozonMinPrice) : '',
          '', '', '', '',
          Math.round(markups.minMarkup * 10000) / 100,
          Math.round(markups.targetMarkup * 10000) / 100,
          markups.source,
          '', '', '', '',
          '', '', '',
          (actByOffer[oid] && actByOffer[oid].length) ? 'БЛОК: нет расчёта по SKU' : '—',
          statusStr
        ]);
        return;
      }

      const c = commInfo.rate;
      const h = (1 - c) * (1 - d);
      const acq = acquiring || 0;
      const priceBlocked = Boolean(buyoutInfo.blocked);
      if (priceBlocked) blockedZeroBuyout++;
      else calculated++;

      const returnCost = !priceBlocked
        ? (buyoutInfo.rate === 1 ? 0 : (returnTariff * (1 - buyoutInfo.rate) / buyoutInfo.rate))
        : null;
      const totalLogistics = !priceBlocked ? (directLogistics + returnCost) : null;

      const calcMarkup = function (p) {
        if (priceBlocked || p === null || p <= 0 || h <= 0) return null;
        return (p * h - totalLogistics - acq) / land - 1;
      };
      const calcPrice = function (m) {
        if (priceBlocked || m === null || h <= 0) return null;
        return (land * (1 + m) + acq + totalLogistics) / h;
      };

      const mCur = calcMarkup(curPrice);
      const mNoAct = calcMarkup(noActionPrice);
      const mOld = calcMarkup(oldPrice);
      const mMin = calcMarkup(ozonMinPrice);

      const beRaw = calcPrice(0);
      const floorRaw = calcPrice(markups.minMarkup);
      const targetRaw = calcPrice(markups.targetMarkup);

      const beRounded = calcRoundUp_(beRaw, params.roundStep);
      const floorRounded = calcRoundUp_(floorRaw, params.roundStep);
      const targetRounded = calcRoundUp_(targetRaw, params.roundStep);

      const profitBeforeTax = (!priceBlocked && curPrice !== null && curPrice > 0)
        ? (curPrice * h - totalLogistics - acq - land)
        : null;
      const vatAmount = (curPrice !== null && curPrice > 0 && vatRate > 0)
        ? (curPrice * vatRate / (1 + vatRate))
        : 0;
      const profitTax = (profitBeforeTax !== null && profitBeforeTax > 0 && params.profitTaxRate > 0)
        ? (profitBeforeTax * params.profitTaxRate)
        : 0;

      if (mCur !== null && mCur < markups.minMarkup) {
        belowMinMarkup++;
        warnings.push('наценка ниже минимальной');
      }
      if (targetRounded !== null && curPrice !== null && curPrice < targetRounded) {
        belowTargetPrice++;
        warnings.push('текущая цена ниже целевой');
      }
      if (ozonMinPrice !== null && ozonMinPrice > 0 && floorRounded !== null && ozonMinPrice < floorRounded) {
        warnings.push('min_price в Ozon ниже нашего пола');
      }

      skuContextByOffer[oid] = {
        ok: true,
        priceBlocked: priceBlocked,
        actionFloorRounded: floorRounded,
        land: land,
        c: c,
        d: d,
        totalLogistics: totalLogistics,
        acquiring: acq
      };

      // Проверка ограничений акций по всем строкам листа «Акции» для этого SKU
      let actSummary = '—';
      const itemActions = actByOffer[oid] || [];
      if (itemActions.length) {
        const statuses = [];
        let hasConflict = false;
        itemActions.forEach(function (item) {
          const ar = item.row;
          const actPrice = calcNum_(ar[5]);
          const maxActPrice = calcNum_(ar[6]);
          const chk = checkSheetActionRow_(floorRounded, maxActPrice, actPrice, skuContextByOffer[oid]);
          if (!chk.allowed) hasConflict = true;
          if (chk.warning) warnings.push(chk.warning);
          statuses.push(chk.status);
        });
        if (hasConflict) actionConflicts++;
        actSummary = statuses.join(' | ');
      }

      const statusText = priceBlocked
        ? ('БЛОК ЦЕНЫ: ' + warnings.join('; '))
        : (warnings.length ? ('ВНИМАНИЕ: ' + warnings.join('; ')) : 'ОК');

      calcRows.push([
        oid,
        sku ? (isNaN(Number(sku)) ? sku : Number(sku)) : '',
        name,
        category !== '' ? (isNaN(Number(category)) ? category : Number(category)) : '',
        scheme,
        calcRound2_(costPerUnit),
        multiplicity,
        calcRound2_(packaging),
        calcRound2_(land),
        calcRound2_(directLogistics),
        calcRound2_(returnTariff),
        buyoutInfo.percent,
        buyoutInfo.source,
        returnCost !== null ? calcRound2_(returnCost) : '',
        totalLogistics !== null ? calcRound2_(totalLogistics) : '',
        calcRound2_(acq),
        commInfo.percent,
        commInfo.source,
        drrPct,
        Math.round(h * 10000) / 100,
        calcRound2_(curPrice),
        noActionPrice !== null && noActionPrice > 0 ? calcRound2_(noActionPrice) : '',
        oldPrice !== null && oldPrice > 0 ? calcRound2_(oldPrice) : '',
        ozonMinPrice !== null && ozonMinPrice > 0 ? calcRound2_(ozonMinPrice) : '',
        mCur !== null ? Math.round(mCur * 10000) / 100 : '',
        mNoAct !== null ? Math.round(mNoAct * 10000) / 100 : '',
        mOld !== null ? Math.round(mOld * 10000) / 100 : '',
        mMin !== null ? Math.round(mMin * 10000) / 100 : '',
        Math.round(markups.minMarkup * 10000) / 100,
        Math.round(markups.targetMarkup * 10000) / 100,
        markups.source,
        beRounded !== null ? calcRound2_(beRounded) : '',
        floorRounded !== null ? calcRound2_(floorRounded) : '',
        targetRaw !== null ? calcRound2_(targetRaw) : '',
        targetRounded !== null ? calcRound2_(targetRounded) : '',
        profitBeforeTax !== null ? calcRound2_(profitBeforeTax) : '',
        calcRound2_(vatAmount),
        calcRound2_(profitTax),
        actSummary,
        statusText
      ]);
    });

    // --- 7. Записываем лист «Расчёт» ---
    const calcSh = sheet_(CFG.SHEETS.CALC, calcHeaders_());
    const needRows = Math.max(calcRows.length + 1, 2);
    if (calcSh.getMaxRows() < needRows) {
      calcSh.insertRowsAfter(calcSh.getMaxRows(), needRows - calcSh.getMaxRows());
    }
    calcSh.getRange(2, 1, Math.max(calcSh.getMaxRows() - 1, 1), CFG.CALC_COLS).clearContent();
    if (calcRows.length) {
      calcSh.getRange(2, 1, calcRows.length, CFG.CALC_COLS).setValues(calcRows);
      calcSh.getRange(2, 6, calcRows.length, 6).setNumberFormat('#,##0.00');
      calcSh.getRange(2, 14, calcRows.length, 4).setNumberFormat('#,##0.00');
      calcSh.getRange(2, 21, calcRows.length, 18).setNumberFormat('#,##0.00');
    }

    // --- 8. Проверяем каждую текущую строку листа «Акции» ---
    let actChecked = 0, actAllowed = 0, actBlocked = 0;
    if (actSh && actRows.length) {
      const aHeaders = actHeaders_();
      if (actSh.getMaxColumns() < aHeaders.length && typeof actSh.insertColumnsAfter === 'function') {
        actSh.insertColumnsAfter(actSh.getMaxColumns(), aHeaders.length - actSh.getMaxColumns());
      }
      actSh.getRange(1, 1, 1, aHeaders.length).setValues([aHeaders]).setFontWeight('bold');

      const updatedActRows = actRows.map(function (r) {
        const base = [];
        for (let i = 0; i < CFG.ACT_SYNC_COLS; i++) {
          base.push(r[i] !== undefined && r[i] !== null ? r[i] : '');
        }
        const oid = String(base[2] || '').trim();
        const actPrice = calcNum_(base[5]);
        const maxActPrice = calcNum_(base[6]);
        const ctx = skuContextByOffer[oid] || null;
        const floorRounded = ctx ? ctx.actionFloorRounded : null;
        const chk = checkSheetActionRow_(floorRounded, maxActPrice, actPrice, ctx);
        actChecked++;
        if (chk.allowed) actAllowed++;
        else actBlocked++;
        base.push(chk.floorRub, chk.headroomRub, chk.actionMarkupPct, chk.status);
        return base;
      });
      actSh.getRange(2, 1, updatedActRows.length, aHeaders.length).setValues(updatedActRows);
    }

    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');
    logMsg_('INFO', 'Расчёт Э2/Э3 завершён: всего SKU ' + calcRows.length +
      ', рассчитано ' + calculated +
      ', пропущено без СС/кратности ' + skippedNoCost +
      ', заблокировано (выкуп 0%) ' + blockedZeroBuyout +
      '. Комиссия: из «Комиссия факт» ' + commFromFact + ', из «Факт Ozon» ' + commFromFallback +
      '. Акции: строк проверено ' + actChecked + ' (проходят ' + actAllowed + ', конфликт/блок ' + actBlocked + ').');

    recalc_();
    return {
      ok: true,
      total: calcRows.length,
      calculated: calculated,
      skippedNoCost: skippedNoCost,
      skippedNoFact: skippedNoFact,
      blockedZeroBuyout: blockedZeroBuyout,
      commFromFact: commFromFact,
      commFromFallback: commFromFallback,
      buyoutFromSales: buyoutFromSales,
      buyoutFallback: buyoutFallback,
      belowMinMarkup: belowMinMarkup,
      belowTargetPrice: belowTargetPrice,
      actionConflicts: actionConflicts,
      actionsChecked: actChecked,
      actionsAllowed: actAllowed,
      actionsBlocked: actBlocked,
      updatedAt: today
    };
  } catch (e) {
    logMsg_('ERROR', 'calculateUnitEconomics: ' + e.message);
    throw e;
  }
}
