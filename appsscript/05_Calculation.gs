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
    'Статус / Предупреждения',         // 40 AN
    'Реком. зачёркнутая цена, ₽',      // 41 AO (ОкрВверх(Целевая × (1 + B15), B11))
    'Отклонение от целевой, ₽',        // 42 AP (Цена с акцией − Целевая цена)
    'Отклонение от целевой, %',        // 43 AQ ((Цена с акцией − Целевая) / Целевая)
    'Выкуплено за период, шт',         // 44 AR (из «Продажи» J/E)
    'Выручка за период, ₽',            // 45 AS (из «Продажи» D)
    'Прибыль на объём продаж, ₽'       // 46 AT (Прибыль до налогов × Выкуплено шт)
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
 * Классификация артикула в понятную товарную группу / бренд по Offer id и названию.
 * Используется для заполнения пустых ячеек «Номенклатура!P» (ручные значения не перезаписывает).
 */
function inferProductGroup_(offerId, name) {
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
 * Дозаполняет только ПУСТЫЕ ячейки колонки P («Категория») в «Номенклатуре»
 * понятными товарными группами/брендами. Существующие значения не перезаписывает.
 */
function fillEmptyNomProductGroups_(nom) {
  if (!nom) return 0;
  try {
    const last = nom.getLastRow();
    if (last < 2) return 0;
    const n = last - 1;
    const colIdx = CFG.NOM_COL_CAT || 16;
    const offers = nom.getRange(2, 1, n, 3).getValues();
    const curCats = nom.getRange(2, colIdx, n, 1).getValues();
    const formulas = nom.getRange(2, colIdx, n, 1).getFormulas();
    if (formulas.some(function (r) { return String(r[0] || '') !== ''; })) return 0;

    let filled = 0;
    const out = offers.map(function (r, i) {
      const cur = curCats[i][0];
      if (cur !== '' && cur !== null && cur !== undefined) return [cur];
      const grp = inferProductGroup_(r[0], r[2]);
      if (!grp) return [''];
      filled++;
      return [grp];
    });
    if (filled > 0) {
      if (String(nom.getRange(1, colIdx).getValue() || '').trim() === '') {
        nom.getRange(1, colIdx).setValue('Категория (товарная группа)').setFontWeight('bold');
      }
      nom.getRange(2, colIdx, n, 1).setValues(out);
    }
    return filled;
  } catch (e) {
    return 0;
  }
}

/**
 * Чтение общих параметров расчёта с листа «Параметры» (B4..B15).
 * ВАЖНО: Параметры!B14 никогда не модифицируется калькулятором.
 * Если строки 15 («Надбавка для зачёркнутой цены») ещё нет — мягко добавляет её со значением 40%.
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
    commissionDiscount: CFG.COMMISSION_DISCOUNT_DEFAULT,
    oldPriceMarkup: CFG.OLD_PRICE_MARKUP_DEFAULT !== undefined ? CFG.OLD_PRICE_MARKUP_DEFAULT : 0.40
  };

  const par = ss_().getSheetByName('Параметры');
  if (!par || par.getLastRow() < 1) return defaults;

  const last = par.getLastRow();
  const rows = par.getRange(1, 1, last, 2).getValues();
  let hasOldPriceMarkupRow = false;
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
    } else if (/зачёркнут|зачеркнут/i.test(label) || idx === 14) {
      hasOldPriceMarkupRow = true;
      const f = calcToFraction_(val);
      if (f !== null && f >= 0) defaults.oldPriceMarkup = f;
    }
  });

  if (!hasOldPriceMarkupRow && last >= 14) {
    try {
      const targetRow = last + 1;
      if (par.getMaxRows() < targetRow) par.insertRowsAfter(par.getMaxRows(), targetRow - par.getMaxRows());
      par.getRange(targetRow, 1, 1, 3).setValues([[
        'Надбавка для зачёркнутой цены (от целевой)',
        defaults.oldPriceMarkup,
        'Рекомендованная зачёркнутая цена = ОкрВверх(Целевая цена × (1 + надбавка), шаг B11). По умолчанию +40% (0,40).'
      ]]);
      par.getRange(targetRow, 2).setNumberFormat('0%');
    } catch (e) {}
  }

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

    // --- 6. Автозаполнение пустых ячеек «Номенклатура!P» товарными группами и чтение строк ---
    const filledGroups = fillEmptyNomProductGroups_(nom);
    const nomCols = Math.max(nom.getMaxColumns(), CFG.NOM_COLS);
    const nomRows = nom.getRange(2, 1, nom.getLastRow() - 1, nomCols).getValues();

    const calcRows = [];
    const skuContextByOffer = {};
    const groupCounts = {};
    let calculated = 0, skippedNoCost = 0, skippedNoFact = 0, blockedZeroBuyout = 0;
    let commFromFact = 0, commFromFallback = 0;
    let buyoutFromSales = 0, buyoutFallback = 0;
    let belowMinMarkup = 0, belowTargetPrice = 0, actionConflicts = 0;
    let totalDeliveredUnits = 0, totalSalesRevenue = 0, totalVolumeProfit = 0, skusWithSales = 0;

    nomRows.forEach(function (nr) {
      const oid = String(nr[0] === undefined || nr[0] === null ? '' : nr[0]).trim();
      if (!oid) return;

      const sku = String(nr[1] === undefined || nr[1] === null ? '' : nr[1]).trim();
      const name = String(nr[2] === undefined || nr[2] === null ? '' : nr[2]);
      const costPerUnit = calcNum_(nr[5]); // F
      const multRaw = calcNum_(nr[6]);     // G
      const multiplicity = multRaw !== null ? Math.round(multRaw * 1e6) / 1e6 : null;
      const packagingRaw = nr[7];          // H
      const packaging = calcNum_(packagingRaw) || 0;
      const nomStockFbo = calcNum_(nr[11]); // L
      const nomScheme = String(nr[13] || '').trim().toUpperCase(); // N
      const rawCategory = nr[15] !== undefined && nr[15] !== null ? String(nr[15]).trim() : ''; // P
      const category = rawCategory !== '' ? rawCategory : inferProductGroup_(oid, name);
      const syncFlag = nr[16] !== undefined && nr[16] !== null ? String(nr[16]).trim() : ''; // Q

      if (category) {
        groupCounts[category] = (groupCounts[category] || 0) + 1;
      }

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

      // Выкуп из Продажи!M + объём продаж (Продажи!J доставлено / E выкуплено, D выручка)
      const sRow = salesByOffer[oid] || (sku ? salesBySku[sku] : null) || null;
      const salesBuyoutRaw = sRow ? sRow[12] : '';
      const buyoutInfo = resolveItemBuyout_(salesBuyoutRaw, params.buyoutDefault);
      if (buyoutInfo.warning) warnings.push(buyoutInfo.warning);
      if (buyoutInfo.source === 'Продажи!M') buyoutFromSales++;
      else buyoutFallback++;

      const delivRaw = sRow ? (calcNum_(sRow[9]) !== null ? calcNum_(sRow[9]) : calcNum_(sRow[4])) : null;
      const deliveredUnits = delivRaw !== null && delivRaw > 0 ? Math.round(delivRaw) : 0;
      const revRaw = sRow ? calcNum_(sRow[3]) : null;
      const salesRevenue = revRaw !== null && revRaw > 0 ? revRaw : 0;
      if (deliveredUnits > 0 || salesRevenue > 0) {
        skusWithSales++;
        totalDeliveredUnits += deliveredUnits;
        totalSalesRevenue += salesRevenue;
      }

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
          statusStr,
          '',
          '',
          '',
          deliveredUnits > 0 ? deliveredUnits : 0,
          salesRevenue > 0 ? calcRound2_(salesRevenue) : 0,
          ''
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
      const oldMarkup = (params.oldPriceMarkup !== undefined && params.oldPriceMarkup !== null)
        ? params.oldPriceMarkup
        : (CFG.OLD_PRICE_MARKUP_DEFAULT !== undefined ? CFG.OLD_PRICE_MARKUP_DEFAULT : 0.40);
      const recommendedOldRounded = (!priceBlocked && targetRounded !== null && targetRounded > 0)
        ? calcRoundUp_(targetRounded * (1 + oldMarkup), params.roundStep)
        : null;
      const deltaRub = (!priceBlocked && curPrice !== null && curPrice > 0 && targetRounded !== null)
        ? (curPrice - targetRounded)
        : null;
      const deltaPct = (deltaRub !== null && targetRounded !== null && targetRounded > 0)
        ? Math.round((deltaRub / targetRounded) * 10000) / 100
        : null;

      const profitBeforeTax = (!priceBlocked && curPrice !== null && curPrice > 0)
        ? (curPrice * h - totalLogistics - acq - land)
        : null;
      const vatAmount = (curPrice !== null && curPrice > 0 && vatRate > 0)
        ? (curPrice * vatRate / (1 + vatRate))
        : 0;
      const profitTax = (profitBeforeTax !== null && profitBeforeTax > 0 && params.profitTaxRate > 0)
        ? (profitBeforeTax * params.profitTaxRate)
        : 0;
      const volumeProfit = (profitBeforeTax !== null)
        ? (deliveredUnits > 0 ? profitBeforeTax * deliveredUnits : 0)
        : null;
      if (volumeProfit !== null && deliveredUnits > 0) {
        totalVolumeProfit += volumeProfit;
      }

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
        statusText,
        recommendedOldRounded !== null ? calcRound2_(recommendedOldRounded) : '',
        deltaRub !== null ? calcRound2_(deltaRub) : '',
        deltaPct !== null ? deltaPct : '',
        deliveredUnits,
        calcRound2_(salesRevenue),
        volumeProfit !== null ? calcRound2_(volumeProfit) : ''
      ]);
    });

    // --- 7. Проверяем каждую текущую строку листа «Акции» ---
    let actChecked = 0, actAllowed = 0, actBlocked = 0, actBelowFloor = 0;
    let updatedActRows = [];
    if (actSh && actRows.length) {
      const aHeaders = actHeaders_();
      if (actSh.getMaxColumns() < aHeaders.length && typeof actSh.insertColumnsAfter === 'function') {
        actSh.insertColumnsAfter(actSh.getMaxColumns(), aHeaders.length - actSh.getMaxColumns());
      }
      actSh.getRange(1, 1, 1, aHeaders.length).setValues([aHeaders]).setFontWeight('bold');

      updatedActRows = actRows.map(function (r) {
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
        if (chk.allowed) {
          actAllowed++;
          if (String(chk.status || '').indexOf('ниже нашего пола') !== -1) actBelowFloor++;
        } else {
          actBlocked++;
        }
        base.push(chk.floorRub, chk.headroomRub, chk.actionMarkupPct, chk.status);
        return base;
      });
      actSh.getRange(2, 1, updatedActRows.length, aHeaders.length).setValues(updatedActRows);
      styleActionsSheet_(actSh, updatedActRows);
    }

    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');
    const summary = {
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
      actionsBelowFloor: actBelowFloor,
      actionsBlocked: actBlocked,
      filledProductGroups: filledGroups,
      productGroupsCount: Object.keys(groupCounts).length,
      skusWithSales: skusWithSales,
      totalDeliveredUnits: totalDeliveredUnits,
      totalSalesRevenue: Math.round(totalSalesRevenue * 100) / 100,
      totalVolumeProfit: Math.round(totalVolumeProfit * 100) / 100,
      updatedAt: today
    };

    // --- 8. Записываем лист «Расчёт» (KPI-шапка в строках 1–3, заголовки в строке 4, данные с 5-й) ---
    const hdrRow = CFG.CALC_HEADER_ROW || 4;
    const dataStartRow = CFG.CALC_DATA_START_ROW || 5;
    let calcSh = ss.getSheetByName(CFG.SHEETS.CALC);
    if (!calcSh) calcSh = ss.insertSheet(CFG.SHEETS.CALC);
    if (calcSh.getMaxColumns() < CFG.CALC_COLS && typeof calcSh.insertColumnsAfter === 'function') {
      calcSh.insertColumnsAfter(calcSh.getMaxColumns(), CFG.CALC_COLS - calcSh.getMaxColumns());
    }
    const needRows = Math.max(calcRows.length + dataStartRow - 1, dataStartRow);
    if (calcSh.getMaxRows() < needRows) {
      calcSh.insertRowsAfter(calcSh.getMaxRows(), needRows - calcSh.getMaxRows());
    }
    calcSh.getRange(1, 1, Math.max(calcSh.getMaxRows(), needRows), CFG.CALC_COLS).clearContent();

    const bannerRows = buildCalcKpiBanner_(summary, params);
    calcSh.getRange(1, 1, 3, CFG.CALC_COLS).setValues(bannerRows);
    calcSh.getRange(hdrRow, 1, 1, CFG.CALC_COLS).setValues([calcHeaders_()]);
    if (calcRows.length) {
      calcSh.getRange(dataStartRow, 1, calcRows.length, CFG.CALC_COLS).setValues(calcRows);
    }

    styleCalcSheet_(calcSh, calcRows, summary, params);
    styleCalcSettingsSheet_(ss.getSheetByName(CFG.SHEETS.CALC_SETTINGS), groupCounts);
    refreshProjectSheet_(ss, summary, params);
    organizeWorkbookTabs_(ss);

    logMsg_('INFO', 'Расчёт Э2/Э3 завершён: всего SKU ' + calcRows.length +
      ', рассчитано ' + calculated +
      ', пропущено без СС/кратности ' + skippedNoCost +
      ', заблокировано (выкуп 0%) ' + blockedZeroBuyout +
      '. Комиссия: из «Комиссия факт» ' + commFromFact + ', из «Факт Ozon» ' + commFromFallback +
      '. Продажи: выкуплено ' + totalDeliveredUnits + ' шт, прибыль на объём ' + Math.round(totalVolumeProfit) + ' ₽' +
      '. Акции: строк проверено ' + actChecked + ' (проходят ' + actAllowed + ', конфликт/блок ' + actBlocked + ').');

    recalc_();
    return summary;
  } catch (e) {
    logMsg_('ERROR', 'calculateUnitEconomics: ' + e.message);
    throw e;
  }
}

// =====================================================================
// UX / UI ОФОРМЛЕНИЕ РАБОЧЕЙ ТАБЛИЦЫ
// =====================================================================

/**
 * Формирует 3 строки верхней закреплённой KPI-панели на листе «Расчёт» (46 колонок).
 * ВАЖНО: все подписи и значения размещаются в главных колонках, которые остаются
 * видимыми при свёрнутых группах [+]: A(0), B(1), C(2), D(3), E(4), I(8), O(14), Q(16),
 * U(20), Y(24), AF(31), AG(32), AI(34), AJ(35), AM(38), AN(39), AO(40), AP(41), AT(45).
 */
function buildCalcKpiBanner_(summary, params) {
  const r1 = new Array(CFG.CALC_COLS).fill('');
  const r2 = new Array(CFG.CALC_COLS).fill('');
  const r3 = new Array(CFG.CALC_COLS).fill('');

  const okHealthy = Math.max(0, (summary.calculated || 0) - (summary.belowTargetPrice || 0));
  const drrPct = Math.round((params.drr || 0) * 10000) / 100;
  const defBuyoutPct = Math.round((params.buyoutDefault || 0) * 10000) / 100;
  const minMpPct = Math.round((params.minMarkup || 0) * 10000) / 100;
  const tgtMpPct = Math.round((params.targetMarkup || 0) * 10000) / 100;
  const oldMpPct = Math.round(((params.oldPriceMarkup !== undefined ? params.oldPriceMarkup : 0.40) || 0) * 10000) / 100;

  // Строка 1 — заголовки KPI-плашек
  r1[0]  = '📊 ЮНИТ-ЭКОНОМИКА И ЦЕНЫ (Э2/Э3)';
  r1[1]  = 'Всего SKU';
  r1[2]  = 'Покрытие базы (в расчёте / без СС / блок 0%)';
  r1[3]  = 'Товарных групп';
  r1[4]  = 'Схема';
  r1[8]  = 'Выкуп (Продажи / B8)';
  r1[14] = 'База ДРР / Выкуп';
  r1[16] = 'Комиссия (Факт / Ozon)';
  r1[20] = 'В норме (≥ цели)';
  r1[24] = 'Ниже мин. наценки';
  r1[31] = 'Наценка цель / мин.';
  r1[32] = 'Ниже целевой цены';
  r1[34] = 'Акций проверено';
  r1[35] = 'Акции ОК / Ниже пола';
  r1[38] = 'Конфликт лимита Ozon';
  r1[39] = 'Обновлено';
  r1[40] = 'Правило зачёркн. цены';
  r1[41] = 'Выкуплено за период, шт';
  r1[45] = 'Прибыль на объём, ₽';

  // Строка 2 — значения KPI-плашек
  r2[0]  = 'Сводка по магазину';
  r2[1]  = summary.total || 0;
  r2[2]  = 'Рассчитано: ' + (summary.calculated || 0) +
           '  |  Без СС: ' + (summary.skippedNoCost || 0) +
           '  |  Блок (0%): ' + (summary.blockedZeroBuyout || 0);
  r2[3]  = summary.productGroupsCount || 0;
  r2[4]  = String(params.scheme || 'Авто');
  r2[8]  = (summary.buyoutFromSales || 0) + ' / ' + (summary.buyoutFallback || 0);
  r2[14] = 'ДРР ' + drrPct + '% | Выкуп ' + defBuyoutPct + '%';
  r2[16] = (summary.commFromFact || 0) + ' / ' + (summary.commFromFallback || 0);
  r2[20] = okHealthy;
  r2[24] = summary.belowMinMarkup || 0;
  r2[31] = tgtMpPct + '% / ' + minMpPct + '% (шаг ' + (params.roundStep || 1) + ' ₽)';
  r2[32] = summary.belowTargetPrice || 0;
  r2[34] = summary.actionsChecked || 0;
  r2[35] = (summary.actionsAllowed || 0) + ' ОК / ' + (summary.actionsBelowFloor || 0) + ' ниже пола';
  r2[38] = summary.actionsBlocked || 0;
  r2[39] = summary.updatedAt || '';
  r2[40] = '+' + oldMpPct + '% к целевой (B15)';
  r2[41] = (summary.totalDeliveredUnits || 0) + ' шт (' + (summary.skusWithSales || 0) + ' SKU)';
  r2[45] = summary.totalVolumeProfit !== undefined ? calcRound2_(summary.totalVolumeProfit) : 0;

  // Строка 3 — подсказка по навигации и легенда светофора
  r3[0]  = '💡 Раскройте [+] над столбцами для деталей затрат и налогов';
  r3[2]  = 'Фильтр [▼] в строке 4 позволяет отобрать группу (D), убыточные SKU или конфликты акций';
  r3[20] = '🟢 Зелёный: наценка ≥ цели, акция ОК';
  r3[24] = '🟡 Жёлтый: ниже цели или ниже нашего пола';
  r3[38] = '🔴 Красный: убыток (<0%) или пол > лимита Ozon';
  r3[39] = '⚪ Серый: нет СС/кратности в 1С';
  r3[41] = 'Раскройте [+] справа от AP для % отклонения и выручки';

  return [r1, r2, r3];
}

/**
 * Сбрасывает и заново включает автофильтр на заданном диапазоне листа.
 */
function resetSheetFilter_(sh, headerRow, totalRows, numCols) {
  if (!sh) return;
  try {
    const existing = typeof sh.getFilter === 'function' ? sh.getFilter() : null;
    if (existing && typeof existing.remove === 'function') existing.remove();
    if (totalRows >= 1 && typeof sh.getRange === 'function') {
      const rng = sh.getRange(headerRow, 1, totalRows, numCols);
      if (rng && typeof rng.createFilter === 'function') rng.createFilter();
    }
  } catch (e) {}
}

/**
 * Настраивает сворачиваемые группы колонок [+/-] на листе «Расчёт».
 * В свёрнутом состоянии остаются главные управленческие колонки на один экран.
 */
function setupCalcColumnGroups_(sh) {
  if (!sh || typeof sh.getRange !== 'function') return;
  try {
    if (typeof sh.expandAllColumnGroups === 'function') sh.expandAllColumnGroups();
    const fullRow = sh.getRange(1, 1, 1, CFG.CALC_COLS);
    if (fullRow && typeof fullRow.shiftColumnGroupDepth === 'function') {
      for (let d = 0; d < 4; d++) {
        try { fullRow.shiftColumnGroupDepth(-1); } catch (e0) { break; }
      }
      const groups = CFG.CALC_COLUMN_GROUPS || [];
      groups.forEach(function (grp) {
        try {
          sh.getRange(1, grp[0], 1, grp[1]).shiftColumnGroupDepth(1);
        } catch (eg) {}
      });
      if (typeof sh.collapseAllColumnGroups === 'function') sh.collapseAllColumnGroups();
      if (typeof sh.setColumnGroupControlPosition === 'function' &&
          typeof SpreadsheetApp !== 'undefined' &&
          SpreadsheetApp.GroupControlTogglePosition) {
        sh.setColumnGroupControlPosition(SpreadsheetApp.GroupControlTogglePosition.AFTER);
      }
    }
  } catch (e) {}
}

/**
 * Пакетное UX/UI оформление листа «Расчёт»:
 * - KPI-шапка (строки 1–3) + легенда светофора;
 * - цветовые блоки заголовков (строка 4);
 * - светофор ячеек по всем строкам товаров (с 5-й строки);
 * - форматы чисел (без экспоненты в SKU, целые рубли в ценах, проценты);
 * - закрепление 4 строк и 3 колонок (Offer id, SKU, Наименование);
 * - группировка второстепенных колонок [+/-] и автофильтр.
 */
function styleCalcSheet_(sh, calcRows, summary, params) {
  if (!sh) return;
  const hdrRow = CFG.CALC_HEADER_ROW || 4;
  const dataStartRow = CFG.CALC_DATA_START_ROW || 5;
  const cols = CFG.CALC_COLS;

  // 1. Закрепление шапки (4 строки) и ключевых колонок товара (A..C)
  try {
    sh.setFrozenRows(hdrRow);
    if (typeof sh.setFrozenColumns === 'function') sh.setFrozenColumns(3);
  } catch (e) {}

  // 2. Оформление KPI-панели (строки 1–3) и шапки таблицы (строка 4)
  const topBgs = [
    new Array(cols).fill('#f1f3f4'),
    new Array(cols).fill('#ffffff'),
    new Array(cols).fill('#eef3fc'),
    new Array(cols).fill('#202124')
  ];
  const topFcs = [
    new Array(cols).fill('#5f6368'),
    new Array(cols).fill('#202124'),
    new Array(cols).fill('#3c4043'),
    new Array(cols).fill('#ffffff')
  ];
  const topFws = [
    new Array(cols).fill('bold'),
    new Array(cols).fill('bold'),
    new Array(cols).fill('normal'),
    new Array(cols).fill('bold')
  ];

  // Акценты KPI-плашек в строке 1–2
  topBgs[0][0] = '#1e8e3e'; topFcs[0][0] = '#ffffff';
  topBgs[1][0] = '#e6f4ea'; topFcs[1][0] = '#137333';
  topBgs[1][2] = '#f8f9fa'; topFcs[1][2] = '#202124';
  topBgs[1][3] = '#e8f0fe'; topFcs[1][3] = '#1967d2';
  topBgs[1][20] = '#e6f4ea'; topFcs[1][20] = '#137333';
  topBgs[1][24] = (summary && summary.belowMinMarkup > 0) ? '#fce8e6' : '#e6f4ea';
  topFcs[1][24] = (summary && summary.belowMinMarkup > 0) ? '#c5221f' : '#137333';
  topBgs[1][32] = (summary && summary.belowTargetPrice > 0) ? '#fef7e0' : '#e6f4ea';
  topFcs[1][32] = (summary && summary.belowTargetPrice > 0) ? '#b06000' : '#137333';
  topBgs[1][35] = (summary && summary.actionsBelowFloor > 0) ? '#fef7e0' : '#e6f4ea';
  topFcs[1][35] = (summary && summary.actionsBelowFloor > 0) ? '#b06000' : '#137333';
  topBgs[1][38] = (summary && summary.actionsBlocked > 0) ? '#fce8e6' : '#e6f4ea';
  topFcs[1][38] = (summary && summary.actionsBlocked > 0) ? '#c5221f' : '#137333';
  topBgs[1][40] = '#ede7f6'; topFcs[1][40] = '#4a235a';
  topBgs[1][41] = '#e8f0fe'; topFcs[1][41] = '#1967d2';
  topBgs[1][45] = (summary && summary.totalVolumeProfit < 0) ? '#fce8e6' : '#e6f4ea';
  topFcs[1][45] = (summary && summary.totalVolumeProfit < 0) ? '#c5221f' : '#137333';

  // Цветовое кодирование 7 смысловых блоков в строке 4 (шапка таблицы)
  const primaryCols = {
    0:1, 1:1, 2:1, 3:1, 4:1, 8:1, 14:1, 16:1, 20:1, 24:1,
    31:1, 32:1, 34:1, 35:1, 38:1, 39:1, 40:1, 41:1, 45:1
  };
  for (let c = 0; c < cols; c++) {
    const isPrim = Boolean(primaryCols[c]);
    if (c <= 4) {
      topBgs[3][c] = isPrim ? '#202124' : '#3c4043'; // Блок 1: Товар, группа и схема
    } else if (c <= 19) {
      topBgs[3][c] = isPrim ? '#1f4e79' : '#2e6da4'; // Блок 2: Затраты, логистика, комиссия
    } else if (c <= 27) {
      topBgs[3][c] = isPrim ? '#0e6251' : '#148f77'; // Блок 3: Текущие цены и факт. наценка (Э2)
    } else if (c <= 34) {
      topBgs[3][c] = isPrim ? '#4a235a' : '#6c3483'; // Блок 4: Каскад и расчётные цены (Э3)
    } else if (c <= 37) {
      topBgs[3][c] = isPrim ? '#7e5109' : '#9c640c'; // Блок 5: Прибыль и налоги ОСНО
    } else if (c <= 39) {
      topBgs[3][c] = '#263238';                      // Блок 6: Контроль акций и статус
    } else {
      topBgs[3][c] = isPrim ? '#1b4f72' : '#2874a6'; // Блок 7: Реком. old_price, дельта и объём продаж
    }
  }

  const topRange = sh.getRange(1, 1, hdrRow, cols);
  if (typeof topRange.setBackgrounds === 'function') topRange.setBackgrounds(topBgs);
  if (typeof topRange.setFontColors === 'function') topRange.setFontColors(topFcs);
  if (typeof topRange.setFontWeights === 'function') topRange.setFontWeights(topFws);
  sh.getRange(hdrRow, 1, 1, cols).setWrap(true);

  try {
    if (typeof sh.setRowHeight === 'function') {
      sh.setRowHeight(1, 22);
      sh.setRowHeight(2, 26);
      sh.setRowHeight(3, 22);
      sh.setRowHeight(4, 38);
    }
  } catch (e) {}

  // 3. Пакетный светофор и числовые форматы для строк данных
  if (calcRows && calcRows.length) {
    const n = calcRows.length;
    const bgs = new Array(n);
    const fcs = new Array(n);
    const fws = new Array(n);

    // Шаблон числовых форматов на 1 строку из 46 колонок
    const fmtRow = [
      '@',               // 1 A: Offer id
      '0',               // 2 B: SKU (без экспоненты!)
      '@',               // 3 C: Наименование
      '@',               // 4 D: Категория (товарная группа)
      '@',               // 5 E: Схема
      '#,##0.00',        // 6 F: СС за ед.
      '0.###',           // 7 G: Кратность
      '#,##0.00',        // 8 H: Упаковка
      '#,##0.00',        // 9 I: Ленд-кост
      '#,##0.00',        // 10 J: Логистика прямая
      '#,##0.00',        // 11 K: Тариф возврата
      '0.00"%"',         // 12 L: Выкуп, %
      '@',               // 13 M: Источник выкупа
      '#,##0.00',        // 14 N: Возвраты на 1 выкуп., ₽
      '#,##0.00',        // 15 O: Логистика с возвратами, ₽
      '#,##0.00',        // 16 P: Эквайринг, ₽
      '0.00"%"',         // 17 Q: Комиссия, %
      '@',               // 18 R: Источник комиссии
      '0.00"%"',         // 19 S: ДРР, %
      '0.00"%"',         // 20 T: Запас цены, %
      '#,##0',           // 21 U: Цена с акцией, ₽
      '#,##0',           // 22 V: Цена без акции, ₽
      '#,##0',           // 23 W: Зачёркнутая цена, ₽
      '#,##0',           // 24 X: min_price Ozon, ₽
      '0.00"%"',         // 25 Y: Наценка по цене с акцией, %
      '0.00"%"',         // 26 Z: Наценка по цене без акции, %
      '0.00"%"',         // 27 AA: Наценка по зачёркнутой цене, %
      '0.00"%"',         // 28 AB: Наценка по min_price, %
      '0.00"%"',         // 29 AC: Мин. наценка, %
      '0.00"%"',         // 30 AD: Целевая наценка, %
      '@',               // 31 AE: Источник наценки
      '#,##0',           // 32 AF: Безубыточность, ₽
      '#,##0',           // 33 AG: Ограничение для акций (наш пол), ₽
      '#,##0.00',        // 34 AH: Целевая цена (до окр.), ₽
      '#,##0',           // 35 AI: Целевая цена, ₽
      '#,##0.00',        // 36 AJ: Прибыль до налогов, ₽
      '#,##0.00',        // 37 AK: НДС в цене, ₽
      '#,##0.00',        // 38 AL: Налог на прибыль, ₽
      '@',               // 39 AM: Статус акций
      '@',               // 40 AN: Статус / Предупреждения
      '#,##0',           // 41 AO: Реком. зачёркнутая цена, ₽
      '+#,##0;-#,##0;0', // 42 AP: Отклонение от целевой, ₽
      '0.00"%"',         // 43 AQ: Отклонение от целевой, %
      '#,##0',           // 44 AR: Выкуплено за период, шт
      '#,##0.00',        // 45 AS: Выручка за период, ₽
      '#,##0.00'         // 46 AT: Прибыль на объём продаж, ₽
    ];
    const fmts = new Array(n);

    for (let i = 0; i < n; i++) {
      const r = calcRows[i];
      const statusText = String(r[39] || '');
      const actText = String(r[38] || '');
      const isSkipped = statusText.indexOf('ПРОПУСК:') === 0;
      const isBlocked = statusText.indexOf('БЛОК ЦЕНЫ:') === 0;

      const zebra = (i % 2 === 1) ? '#f8f9fa' : '#ffffff';
      const rowBg = new Array(cols).fill(isSkipped ? '#f4f5f7' : zebra);
      const rowFc = new Array(cols).fill(isSkipped ? '#80868b' : '#202124');
      const rowFw = new Array(cols).fill('normal');
      fmts[i] = fmtRow;

      if (isSkipped) {
        rowBg[39] = '#e8eaed';
        rowFc[39] = '#5f6368';
      } else {
        // Выделяем ключевые расчётные колонки (Ленд-кост, Логистика с возвр., Наш пол, Целевая цена, Реком. old_price)
        rowFw[0]  = 'bold';
        rowFw[8]  = 'bold';
        rowFw[14] = 'bold';
        rowBg[32] = '#f3e8fd'; rowFc[32] = '#4a235a'; rowFw[32] = 'bold'; // AG: Наш пол акций
        rowBg[34] = '#ede7f6'; rowFc[34] = '#311b92'; rowFw[34] = 'bold'; // AI: Целевая цена
        rowBg[40] = '#f3e8fd'; rowFc[40] = '#4a235a'; rowFw[40] = 'bold'; // AO: Реком. зачёркнутая цена

        // Схема FBO / FBS
        if (r[4] === 'FBO') {
          rowBg[4] = '#e8f0fe'; rowFc[4] = '#1967d2'; rowFw[4] = 'bold';
        } else if (r[4] === 'FBS') {
          rowBg[4] = '#fef7e0'; rowFc[4] = '#b06000'; rowFw[4] = 'bold';
        }

        if (isBlocked) {
          rowBg[11] = '#fce8e6'; rowFc[11] = '#c5221f'; rowFw[11] = 'bold';
          rowBg[31] = '#fce8e6'; rowBg[32] = '#fce8e6'; rowBg[34] = '#fce8e6';
          rowBg[39] = '#fce8e6'; rowFc[39] = '#c5221f'; rowFw[39] = 'bold';
        } else {
          const curPrice = calcNum_(r[20]);
          const mCur = calcNum_(r[24]);
          const minMp = calcNum_(r[28]);
          const tgtMp = calcNum_(r[29]);
          const floorP = calcNum_(r[32]);
          const targetP = calcNum_(r[34]);
          const profit = calcNum_(r[35]);
          const deltaRub = calcNum_(r[41]);
          const volUnits = calcNum_(r[43]);
          const volProfit = calcNum_(r[45]);

          // Светофор для текущей цены (U) относительно пола и целевой цены
          if (curPrice !== null && floorP !== null && curPrice < floorP) {
            rowBg[20] = '#fce8e6'; rowFc[20] = '#c5221f'; rowFw[20] = 'bold';
          } else if (curPrice !== null && targetP !== null && curPrice < targetP) {
            rowBg[20] = '#fef7e0'; rowFc[20] = '#b06000'; rowFw[20] = 'bold';
          } else if (curPrice !== null) {
            rowBg[20] = '#e6f4ea'; rowFc[20] = '#137333'; rowFw[20] = 'bold';
          }

          // Светофор для фактической наценки по цене с акцией (Y)
          if (mCur !== null) {
            rowFw[24] = 'bold';
            if (mCur < 0) {
              rowBg[24] = '#fce8e6'; rowFc[24] = '#c5221f';
            } else if (minMp !== null && mCur < minMp) {
              rowBg[24] = '#fce8e6'; rowFc[24] = '#c5221f';
            } else if (tgtMp !== null && mCur < tgtMp) {
              rowBg[24] = '#fef7e0'; rowFc[24] = '#b06000';
            } else {
              rowBg[24] = '#e6f4ea'; rowFc[24] = '#137333';
            }
          }

          // Светофор для прибыли до налогов на 1 ед. (AJ)
          if (profit !== null) {
            rowFw[35] = 'bold';
            if (profit < 0) {
              rowBg[35] = '#fce8e6'; rowFc[35] = '#c5221f';
            } else if (profit > 0) {
              rowBg[35] = '#e6f4ea'; rowFc[35] = '#137333';
            }
          }

          // Светофор для отклонения цены от целевой (AP)
          if (deltaRub !== null) {
            rowFw[41] = 'bold';
            if (curPrice !== null && floorP !== null && curPrice < floorP) {
              rowBg[41] = '#fce8e6'; rowFc[41] = '#c5221f';
            } else if (deltaRub < 0) {
              rowBg[41] = '#fef7e0'; rowFc[41] = '#b06000';
            } else {
              rowBg[41] = '#e6f4ea'; rowFc[41] = '#137333';
            }
          }

          // Светофор для прибыли на объём продаж (AT)
          if (volProfit !== null && volUnits !== null && volUnits > 0) {
            rowFw[45] = 'bold';
            if (volProfit < 0) {
              rowBg[45] = '#fce8e6'; rowFc[45] = '#c5221f';
            } else if (volProfit > 0) {
              rowBg[45] = '#e6f4ea'; rowFc[45] = '#137333';
            }
          }

          // Светофор для общего статуса (AN)
          if (statusText === 'ОК') {
            rowBg[39] = '#e6f4ea'; rowFc[39] = '#137333'; rowFw[39] = 'bold';
          } else if (statusText.indexOf('КОНФЛИКТ') !== -1 || (mCur !== null && mCur < 0)) {
            rowBg[39] = '#fce8e6'; rowFc[39] = '#c5221f'; rowFw[39] = 'bold';
          } else if (statusText.indexOf('ВНИМАНИЕ:') === 0) {
            rowBg[39] = '#fef7e0'; rowFc[39] = '#b06000';
          }
        }

        // Светофор для статуса акций (AM)
        if (actText.indexOf('КОНФЛИКТ') !== -1 || actText.indexOf('БЛОК') !== -1) {
          rowBg[38] = '#fce8e6'; rowFc[38] = '#c5221f'; rowFw[38] = 'bold';
        } else if (actText.indexOf('ВНИМАНИЕ') !== -1) {
          rowBg[38] = '#fef7e0'; rowFc[38] = '#b06000'; rowFw[38] = 'bold';
        } else if (actText.indexOf('ОК') === 0) {
          rowBg[38] = '#e6f4ea'; rowFc[38] = '#137333';
        }
      }

      bgs[i] = rowBg;
      fcs[i] = rowFc;
      fws[i] = rowFw;
    }

    const dataRange = sh.getRange(dataStartRow, 1, n, cols);
    if (typeof dataRange.setNumberFormats === 'function') dataRange.setNumberFormats(fmts);
    if (typeof dataRange.setBackgrounds === 'function') dataRange.setBackgrounds(bgs);
    if (typeof dataRange.setFontColors === 'function') dataRange.setFontColors(fcs);
    if (typeof dataRange.setFontWeights === 'function') dataRange.setFontWeights(fws);
  }

  // 4. Оптимальные ширины главных колонок
  const widths = {
    1: 165,  // A: Offer id
    2: 105,  // B: SKU
    3: 270,  // C: Наименование
    4: 155,  // D: Категория (товарная группа)
    5: 68,   // E: Схема
    9: 105,  // I: Ленд-кост, ₽
    15: 120, // O: Логистика с возвратами, ₽
    17: 95,  // Q: Комиссия, %
    21: 110, // U: Цена с акцией, ₽
    25: 115, // Y: Наценка по цене с акцией, %
    32: 110, // AF: Безубыточность, ₽
    33: 125, // AG: Ограничение для акций (наш пол), ₽
    35: 115, // AI: Целевая цена, ₽
    36: 115, // AJ: Прибыль до налогов, ₽
    39: 210, // AM: Статус акций
    40: 340, // AN: Статус / Предупреждения
    41: 125, // AO: Реком. зачёркнутая цена, ₽
    42: 120, // AP: Отклонение от целевой, ₽
    46: 135  // AT: Прибыль на объём продаж, ₽
  };
  Object.keys(widths).forEach(function (colKey) {
    try { sh.setColumnWidth(Number(colKey), widths[colKey]); } catch (e) {}
  });

  // 5. Группировка деталей [+/-] и автофильтр по строке 4
  setupCalcColumnGroups_(sh);
  resetSheetFilter_(sh, hdrRow, (calcRows ? calcRows.length : 0) + 1, cols);
}

/**
 * UX/UI оформление листа «Акции»:
 * - шапка A1:K1 (данные Ozon) и L1:O1 (наш блок контроля пола);
 * - светофор по строкам в колонках L:O и F:G;
 * - закрепление 1 строки и 4 колонок, автофильтр.
 */
function styleActionsSheet_(sh, actRows) {
  if (!sh) return;
  const cols = CFG.ACT_COLS || 15;
  try {
    sh.setFrozenRows(1);
    if (typeof sh.setFrozenColumns === 'function') sh.setFrozenColumns(4);
  } catch (e) {}

  const hdrBg = new Array(cols).fill('#1f4e79');
  const hdrFc = new Array(cols).fill('#ffffff');
  const hdrFw = new Array(cols).fill('bold');
  for (let c = 11; c < cols; c++) hdrBg[c] = '#0e6251'; // L..O — блок контроля ограничений

  const hdrRange = sh.getRange(1, 1, 1, cols);
  if (typeof hdrRange.setBackgrounds === 'function') hdrRange.setBackgrounds([hdrBg]);
  if (typeof hdrRange.setFontColors === 'function') hdrRange.setFontColors([hdrFc]);
  if (typeof hdrRange.setFontWeights === 'function') hdrRange.setFontWeights([hdrFw]);
  hdrRange.setWrap(true);

  if (actRows && actRows.length) {
    const n = actRows.length;
    const bgs = new Array(n);
    const fcs = new Array(n);
    const fws = new Array(n);
    const fmtRow = [
      '0', '@', '@', '0', '#,##0', '#,##0', '#,##0', '0', '0', '@', '@',
      '#,##0', '#,##0', '0.00"%"', '@'
    ];
    const fmts = new Array(n);

    for (let i = 0; i < n; i++) {
      const r = actRows[i];
      const status = String(r[14] || '');
      const zebra = (i % 2 === 1) ? '#f8f9fa' : '#ffffff';
      const rowBg = new Array(cols).fill(zebra);
      const rowFc = new Array(cols).fill('#202124');
      const rowFw = new Array(cols).fill('normal');
      fmts[i] = fmtRow;

      rowFw[2] = 'bold';  // Offer id
      rowFw[11] = 'bold'; // Наш мин. пол

      if (status.indexOf('КОНФЛИКТ') === 0) {
        for (let c = 11; c < cols; c++) {
          rowBg[c] = '#fce8e6'; rowFc[c] = '#c5221f'; rowFw[c] = 'bold';
        }
        rowBg[6] = '#fce8e6'; rowFc[6] = '#c5221f'; rowFw[6] = 'bold'; // Макс. допустимая цена Ozon
      } else if (status.indexOf('ВНИМАНИЕ') === 0) {
        for (let c = 11; c < cols; c++) {
          rowBg[c] = '#fef7e0'; rowFc[c] = '#b06000'; rowFw[c] = 'bold';
        }
        rowBg[5] = '#fef7e0'; rowFc[5] = '#b06000'; rowFw[5] = 'bold'; // Цена акции
      } else if (status.indexOf('ОК') === 0) {
        for (let c = 11; c < cols; c++) {
          rowBg[c] = '#e6f4ea'; rowFc[c] = '#137333';
        }
        rowFw[14] = 'bold';
      } else if (status.indexOf('БЛОК') === 0) {
        for (let c = 11; c < cols; c++) {
          rowBg[c] = '#f1f3f4'; rowFc[c] = '#5f6368';
        }
      }

      bgs[i] = rowBg;
      fcs[i] = rowFc;
      fws[i] = rowFw;
    }

    const dataRange = sh.getRange(2, 1, n, cols);
    if (typeof dataRange.setNumberFormats === 'function') dataRange.setNumberFormats(fmts);
    if (typeof dataRange.setBackgrounds === 'function') dataRange.setBackgrounds(bgs);
    if (typeof dataRange.setFontColors === 'function') dataRange.setFontColors(fcs);
    if (typeof dataRange.setFontWeights === 'function') dataRange.setFontWeights(fws);
  }

  const widths = { 1: 95, 2: 240, 3: 165, 4: 105, 5: 110, 6: 110, 7: 135, 12: 120, 13: 135, 14: 135, 15: 250 };
  Object.keys(widths).forEach(function (colKey) {
    try { sh.setColumnWidth(Number(colKey), widths[colKey]); } catch (e) {}
  });
  resetSheetFilter_(sh, 1, (actRows ? actRows.length : 0) + 1, cols);
}

/**
 * UX/UI оформление листа «Настройки расчёта»:
 * - шапка A1:E1 в синем стиле настроек;
 * - памятка с правилами каскада и живым справочником товарных групп справа в колонках G:H.
 */
function styleCalcSettingsSheet_(sh, groupCounts) {
  if (!sh) return;
  try { sh.setFrozenRows(1); } catch (e) {}

  const hdr = calcSettingsHeaders_();
  const hdrRange = sh.getRange(1, 1, 1, hdr.length);
  hdrRange.setValues([hdr]).setFontWeight('bold').setWrap(true);
  if (typeof hdrRange.setBackground === 'function') hdrRange.setBackground('#1a73e8');
  if (typeof hdrRange.setFontColor === 'function') hdrRange.setFontColor('#ffffff');

  // Памятка справа в колонках G:H (не мешает чтению A:E) + живой справочник товарных групп
  try {
    const guide = [
      ['📌 КАК РАБОТАЕТ КАСКАД НАЦЕНОК (Э3)', 'Приоритет сверху вниз:'],
      ['1. Уровень SKU (высший приоритет)', 'Укажите в кол. A «SKU», а в кол. B — Offer id (напр. Кромка-Дуб-44мм-5м.п.) или числовой SKU Ozon.'],
      ['2. Уровень Категория (товарная группа)', 'Укажите в кол. A «Категория», а в кол. B — название товарной группы из «Номенклатура!P» (см. список ниже).'],
      ['3. По умолчанию (общая)', 'Если ни SKU, ни категория здесь не заданы — берутся Параметры!B10 (целевая) и Параметры!B9 (мин.).'],
      ['Формат наценок (колонки C и D)', 'Можно вводить числом в процентах (например 35 или 20) либо долей (0,35 или 0,20).'],
      ['Пример строки 1 (для артикула):', 'SKU  |  Кромка-Дуб-44мм-5м.п.  |  35  |  22  |  Индивидуальная цель по хиту'],
      ['Пример строки 2 (для товарной группы):', 'Категория  |  Mirka  |  28  |  18  |  Базовая наценка для бренда Mirka']
    ];
    if (groupCounts && typeof groupCounts === 'object') {
      const sortedGroups = Object.keys(groupCounts).sort(function (a, b) {
        return (groupCounts[b] || 0) - (groupCounts[a] || 0);
      });
      if (sortedGroups.length) {
        guide.push(['📂 ТОВАРНЫЕ ГРУППЫ В «НОМЕНКЛАТУРЕ!P»', 'Скопируйте название группы в колонку B при уровне «Категория»:']);
        sortedGroups.slice(0, 15).forEach(function (g) {
          guide.push([g, 'Товаров в группе: ' + groupCounts[g] + ' шт.']);
        });
      }
    }
    if (sh.getMaxColumns() < 8 && typeof sh.insertColumnsAfter === 'function') {
      sh.insertColumnsAfter(sh.getMaxColumns(), 8 - sh.getMaxColumns());
    }
    if (sh.getMaxRows() < guide.length && typeof sh.insertRowsAfter === 'function') {
      sh.insertRowsAfter(sh.getMaxRows(), guide.length - sh.getMaxRows());
    }
    const gRange = sh.getRange(1, 7, guide.length, 2);
    gRange.setValues(guide).setWrap(true);
    sh.getRange(1, 7, 1, 2).setBackground('#e8f0fe').setFontColor('#1967d2').setFontWeight('bold');
    sh.getRange(2, 7, guide.length - 1, 2).setBackground('#f8f9fa').setFontColor('#3c4043');
    if (guide.length > 7) {
      sh.getRange(8, 7, 1, 2).setBackground('#e8f0fe').setFontColor('#1967d2').setFontWeight('bold');
    }
  } catch (e) {}

  const widths = { 1: 190, 2: 230, 3: 150, 4: 150, 5: 260, 6: 30, 7: 250, 8: 420 };
  Object.keys(widths).forEach(function (colKey) {
    try { sh.setColumnWidth(Number(colKey), widths[colKey]); } catch (e) {}
  });
}

/**
 * UX/UI оформление листа «Параметры» как пульта управления.
 */
function styleParamsSheet_(sh) {
  if (!sh || sh.getLastRow() < 11) return;
  try {
    sh.setFrozenRows(3);
    sh.getRange(1, 1, 1, 3).setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold');
    sh.getRange(3, 1, 1, 3).setBackground('#202124').setFontColor('#ffffff').setFontWeight('bold');
    const lastR = Math.min(sh.getLastRow(), 15);
    if (lastR >= 4) {
      sh.getRange(4, 1, lastR - 3, 1).setFontWeight('bold').setBackground('#f8f9fa');
      sh.getRange(4, 2, Math.min(10, lastR - 3), 1).setBackground('#e8f0fe').setFontColor('#1967d2').setFontWeight('bold');
      sh.getRange(4, 3, lastR - 3, 1).setWrap(true).setFontColor('#5f6368');
      if (lastR >= 14) {
        sh.getRange(14, 2, 1, 1).setBackground('#f1f3f4').setFontColor('#3c4043').setFontWeight('bold');
      }
      if (lastR >= 15) {
        sh.getRange(15, 2, 1, 1).setBackground('#e8f0fe').setFontColor('#1967d2').setFontWeight('bold');
      }
    }
    sh.setColumnWidth(1, 330);
    sh.setColumnWidth(2, 120);
    sh.setColumnWidth(3, 560);
  } catch (e) {}
}

/**
 * Автоматически актуализирует лист «Проект» (паспорт модели, статус этапов Э0–Э6
 * и живая сводка последнего расчёта).
 */
function refreshProjectSheet_(ss, summary, params) {
  if (!ss) return;
  const sh = ss.getSheetByName('Проект');
  if (!sh) return;
  try {
    const s = summary || {};
    const p = params || readCalcParams_();
    const minMpPct = Math.round((p.minMarkup || 0) * 10000) / 100;
    const tgtMpPct = Math.round((p.targetMarkup || 0) * 10000) / 100;
    const oldMpPct = Math.round(((p.oldPriceMarkup !== undefined ? p.oldPriceMarkup : 0.40) || 0) * 10000) / 100;
    const drrPct = Math.round((p.drr || 0) * 10000) / 100;

    const rows = [
      ['ПАСПОРТ ПРОЕКТА «OZON UNIT — РАБОЧАЯ МОДЕЛЬ»', 'Актуализировано автоматически: ' + (s.updatedAt || '')],
      ['Раздел / Показатель', 'Текущий статус и живые метрики книги'],
      ['Статус этапов проекта', 'Э0 (Каркас) ✅ | Э1 (Синхронизация Ozon) ✅ | Э2 (Факт наценки) ✅ | Э3 (Целевая цена и пол акций) ✅ | Э6 (UX и валидация) ✅ | Э5 (Экспорт цен в Ozon) ⏸ вне скоупа'],
      ['Главные рабочие листы', '1. «Расчёт» (46 кол., KPI-шапка + группы [+/-])  |  2. «Акции» (15 кол., контроль пола L:O)  |  3. «Проблемы данных»'],
      ['Листы настроек и базы 1С', '4. «Параметры» (B4:B15)  |  5. «Настройки расчёта» (каскад SKU → группа → общая)  |  6. «Номенклатура» (база SKU и СС 1С)'],
      ['Авто-листы Ozon API', '7. «Факт Ozon»  |  8. «Комиссия факт»  |  9. «Продажи»  |  10. «Реклама ДРР»  |  11. «Лог»'],
      ['Всего артикулов в «Номенклатуре»', (s.total || 0) + ' SKU (товарных групп в «Номенклатура!P»: ' + (s.productGroupsCount || 0) + ')'],
      ['Покрытие расчёта Э2/Э3', 'Рассчитано: ' + (s.calculated || 0) + ' SKU  |  Пропущено без СС/кратности 1С: ' + (s.skippedNoCost || 0) + ' SKU  |  Блок (выкуп 0%): ' + (s.blockedZeroBuyout || 0) + ' SKU'],
      ['Источники комиссии и выкупа', 'Комиссия: из «Комиссия факт!J» — ' + (s.commFromFact || 0) + ' SKU, из «Факт Ozon!W/X» — ' + (s.commFromFallback || 0) + ' SKU  |  Выкуп: из «Продажи!M» — ' + (s.buyoutFromSales || 0) + ' SKU, из B8 — ' + (s.buyoutFallback || 0) + ' SKU'],
      ['Параметры расчёта (Параметры!B4:B15)', 'ДРР: ' + drrPct + '%  |  Целевая наценка: ' + tgtMpPct + '%  |  Мин. наценка (пол): ' + minMpPct + '%  |  Шаг округления: ' + (p.roundStep || 1) + ' ₽  |  Зачёркнутая цена: +' + oldMpPct + '% к целевой'],
      ['Контроль рентабельности текущих цен', 'В норме (≥ целевой цены): ' + Math.max(0, (s.calculated || 0) - (s.belowTargetPrice || 0)) + ' SKU  |  Ниже целевой цены: ' + (s.belowTargetPrice || 0) + ' SKU  |  Ниже мин. наценки: ' + (s.belowMinMarkup || 0) + ' SKU'],
      ['Контроль акций Ozon (лист «Акции»)', 'Проверено строк: ' + (s.actionsChecked || 0) + '  |  Проходят лимит (пол ≤ макс. цены Ozon): ' + (s.actionsAllowed || 0) + '  |  Конфликт / блок: ' + (s.actionsBlocked || 0)],
      ['Объём продаж и прибыль за период («Продажи»)', 'Выкуплено: ' + (s.totalDeliveredUnits || 0) + ' шт (' + (s.skusWithSales || 0) + ' SKU с продажами)  |  Выручка: ' + (s.totalSalesRevenue || 0) + ' ₽  |  Расчётная прибыль до налогов на объём: ' + (s.totalVolumeProfit || 0) + ' ₽'],
      ['Правило безопасности Э5', 'Калькулятор работает строго внутри Google Таблицы и НЕ отправляет цены в Ozon API (/v1/product/import/prices не вызывается).']
    ];

    if (sh.getMaxRows() < rows.length && typeof sh.insertRowsAfter === 'function') {
      sh.insertRowsAfter(sh.getMaxRows(), rows.length - sh.getMaxRows());
    }
    if (sh.getMaxColumns() < 2 && typeof sh.insertColumnsAfter === 'function') {
      sh.insertColumnsAfter(sh.getMaxColumns(), 2 - sh.getMaxColumns());
    }
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), rows.length), 2).clearContent();
    sh.getRange(1, 1, rows.length, 2).setValues(rows).setWrap(true);
    sh.setFrozenRows(2);
    sh.getRange(1, 1, 1, 2).setBackground('#1e8e3e').setFontColor('#ffffff').setFontWeight('bold');
    sh.getRange(2, 1, 1, 2).setBackground('#202124').setFontColor('#ffffff').setFontWeight('bold');
    sh.getRange(3, 1, rows.length - 2, 1).setBackground('#f8f9fa').setFontWeight('bold');
    sh.getRange(3, 2, rows.length - 2, 1).setBackground('#ffffff').setFontColor('#202124');
    sh.setColumnWidth(1, 310);
    sh.setColumnWidth(2, 680);
  } catch (e) {}
}

/**
 * Упорядочивает вкладки книги слева направо по 4 ролевым зонам и красит ярлычки.
 */
function organizeWorkbookTabs_(ss) {
  if (!ss) return;
  const layout = CFG.TAB_LAYOUT || [];
  if (!layout.length) return;

  // 1. Красим ярлычки всех известных вкладок
  layout.forEach(function (item) {
    const sh = ss.getSheetByName(item.name);
    if (sh && typeof sh.setTabColor === 'function') {
      try { sh.setTabColor(item.color); } catch (e) {}
    }
  });

  // 2. Проверяем, нужно ли переставлять вкладки
  try {
    if (typeof ss.getSheets !== 'function' || typeof ss.moveActiveSheet !== 'function') return;
    const desiredNames = [];
    layout.forEach(function (item) {
      if (ss.getSheetByName(item.name)) desiredNames.push(item.name);
    });
    const currentNames = ss.getSheets().map(function (s) { return s.getName(); });
    let alreadyOrdered = true;
    for (let i = 0; i < desiredNames.length; i++) {
      if (currentNames[i] !== desiredNames[i]) {
        alreadyOrdered = false;
        break;
      }
    }
    if (alreadyOrdered) return;

    const prevActive = typeof ss.getActiveSheet === 'function' ? ss.getActiveSheet() : null;
    for (let pos = 0; pos < desiredNames.length; pos++) {
      const sh = ss.getSheetByName(desiredNames[pos]);
      if (sh) {
        ss.setActiveSheet(sh);
        ss.moveActiveSheet(pos + 1);
      }
    }
    const calcSh = ss.getSheetByName(CFG.SHEETS.CALC) || prevActive;
    if (calcSh && typeof ss.setActiveSheet === 'function') ss.setActiveSheet(calcSh);
  } catch (e) {}
}

/**
 * Комплексное наведение порядка и UX/UI дизайна во всей книге:
 * пересчитывает и оформляет «Расчёт» и «Акции», оформляет «Параметры»,
 * «Настройки расчёта», «Проблемы данных» и упорядочивает вкладки по зонам.
 */
function applyWorkbookUx() {
  const ss = ss_();
  ensureSheets();
  const res = calculateUnitEconomics();
  styleParamsSheet_(ss.getSheetByName('Параметры'));
  styleCalcSettingsSheet_(ss.getSheetByName(CFG.SHEETS.CALC_SETTINGS));
  const probSh = ss.getSheetByName(CFG.SHEETS.PROBLEMS);
  if (probSh && probSh.getLastRow() >= 1) {
    try {
      probSh.setFrozenRows(1);
      probSh.getRange(1, 1, 1, 4).setBackground('#b06000').setFontColor('#ffffff').setFontWeight('bold');
      resetSheetFilter_(probSh, 1, probSh.getLastRow(), 4);
    } catch (e) {}
  }
  organizeWorkbookTabs_(ss);
  recalc_();
  return res;
}
