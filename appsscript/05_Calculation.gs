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
    'Предельная цена (сейчас), ₽',     // 21 U (единая цена в «Ценах» и «Акциях от Ozon», marketing_seller_price)
    'Предельная цена без акций, ₽',    // 22 V (цена до скидки по акциям, price)
    'Зачёркнутая цена, ₽',             // 23 W (old_price)
    'Ограничение для акций в Ozon, ₽', // 24 X (min_price, автоотключается в Ozon через 30 дней)
    'Наценка по Предельной цене, %',   // 25 Y (ROI к ленд-косту по текущей Предельной цене)
    'Наценка по Предельной без акций, %', // 26 Z
    'Наценка по зачёркнутой цене, %',  // 27 AA
    'Наценка по ограничению Ozon, %',  // 28 AB
    'Мин. наценка, %',                 // 29 AC
    'Целевая наценка, %',              // 30 AD
    'Источник наценки',                // 31 AE
    'Безубыточность, ₽',               // 32 AF (округлённая вверх по B11)
    'Мин. Предельная цена (наш пол), ₽', // 33 AG (округлённая вверх по B11)
    'Целевая Предельная цена (до окр.), ₽', // 34 AH
    'Целевая Предельная цена, ₽',      // 35 AI (округлённая вверх по B11)
    'Прибыль до налогов, ₽',           // 36 AJ
    'НДС в цене, ₽',                   // 37 AK
    'Налог на прибыль, ₽',             // 38 AL
    'Статус акций',                    // 39 AM
    'Статус / Предупреждения',         // 40 AN
    'Реком. зачёркнутая цена, ₽',      // 41 AO (ОкрВверх(Целевая × (1 + B15), B11))
    'Отклонение от целевой, ₽',        // 42 AP (Предельная сейчас − Целевая Предельная)
    'Отклонение от целевой, %',        // 43 AQ ((Предельная сейчас − Целевая) / Целевая)
    'Выкуплено за период, шт',         // 44 AR (из «Продажи» J/E)
    'Выручка за период, ₽',            // 45 AS (из «Продажи» D)
    'Прибыль на объём продаж, ₽',      // 46 AT (Прибыль до налогов × Выкуплено шт)
    'Маржинальность цены (ROS), %',    // 47 AU (Прибыль до налогов / Предельная цена)
    'Источник ДРР',                    // 48 AV (Продажи!G / Реклама ДРР!H / Параметры!B4)
    'Доля кластера МСК (гео), %',      // 49 AW (из «Продажи» T / P9 / Параметры!B16)
    'Целевая цена на FBO, ₽',          // 50 AX (целевая Предельная цена при работе по FBO)
    'Выгода FBO к FBS, ₽/шт',          // 51 AY (Целевая FBS − Целевая FBO, ₽/шт)
    'Остаток всего (FBO+FBS), шт',     // 52 AZ (суммарный остаток FBO + FBS)
    'ABC по прибыли',                  // 53 BA (A 80% / B 15% / C 5% / УБЫТОК / Нет продаж)
    'Цена для мин. бустинга (акция Ozon), ₽', // 54 BB (max_action_price из «Акции!G»)
    'Решение по акции / бустингу (Предельная цена)', // 55 BC (В акции / Выбор / Выйти из акции: Предельная > BB)
    'Реком. Предельная цена без акций, ₽' // 56 BD (ОкрВверх(Целевая × (1 + B18), B11))
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
 * Синхронизирует себестоимость из листа «Себестоимость 1С МСК» (по Коду 1С / Номенклатуре 1С)
 * и кратность/упаковку из листа «Кратность и упаковка» (по Offer id) в лист «Номенклатура» (колонки E..H).
 * Правила безопасности:
 *  - Ячейки с формулами (=...) не перезаписываются;
 *  - Если товара нет в «Себестоимость 1С МСК» или там пусто/0, текущая СС в «Номенклатуре!F» сохраняется;
 *  - Коды 1С сопоставляются точно, без ведущих нулей ('00000001612' ↔ '1612'), по точному названию 1С,
 *    а также без буквенного префикса ('В0000013466' ↔ '13466'), если такой номер однозначен.
 */
function sync1cCostsToNomenclature_(ss) {
  const result = {
    updatedCost: 0,
    filledCost: 0,
    filledMult: 0,
    updatedMult: 0,
    filledPack: 0,
    updatedPack: 0,
    filledName1c: 0
  };
  if (!ss) return result;
  const nom = ss.getSheetByName(CFG.SHEETS.NOM);
  if (!nom || nom.getLastRow() < 2) return result;

  try {
    const normCodeExact = function (c) {
      return String(c === undefined || c === null ? '' : c)
        .trim()
        .replace(/\.0+$/, '')
        .toUpperCase();
    };
    const normCodeNoLeadingZeros = function (c) {
      return normCodeExact(c).replace(/^0+(?=\d)/, '');
    };
    const normCodeStripped = function (c) {
      return normCodeExact(c)
        .replace(/^[А-ЯЁA-Z]+0*(?=\d)/, '')
        .replace(/^0+(?=\d)/, '');
    };
    const normName = function (s) {
      return String(s === undefined || s === null ? '' : s)
        .trim()
        .toLowerCase()
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ');
    };

    // 1. Читаем «Себестоимость 1С МСК» (A: Код 1С, B: Номенклатура 1С, C: Остаток, D: Сбс за ед., ₽)
    const byCodeExact = {};
    const byCodeNoZero = {};
    const byCodeStripped = {};
    const byName1c = {};
    const sbsSh = ss.getSheetByName('Себестоимость 1С МСК');
    if (sbsSh && sbsSh.getLastRow() >= 2) {
      const sCols = Math.min(Math.max(sbsSh.getMaxColumns(), 4), 10);
      const sRows = sbsSh.getRange(2, 1, sbsSh.getLastRow() - 1, sCols).getValues();
      sRows.forEach(function (r) {
        const costRaw = calcNum_(r[3]);
        if (costRaw === null || costRaw <= 0) return;
        const cost = Math.round(costRaw * 100) / 100;
        const rawCode = r[0];
        const rawName = String(r[1] === undefined || r[1] === null ? '' : r[1]).trim();
        const entry = { cost: cost, name1c: rawName, code1c: normCodeExact(rawCode) };

        const cExact = normCodeExact(rawCode);
        const cNoZero = normCodeNoLeadingZeros(rawCode);
        const cStrip = normCodeStripped(rawCode);
        const nKey = normName(rawName);

        if (cExact) byCodeExact[cExact] = entry;
        if (cNoZero) byCodeNoZero[cNoZero] = entry;
        if (nKey) byName1c[nKey] = entry;
        if (cStrip) {
          if (byCodeStripped[cStrip] && Math.abs(byCodeStripped[cStrip].cost - cost) > 0.005) {
            byCodeStripped[cStrip] = { ambiguous: true };
          } else if (!byCodeStripped[cStrip]) {
            byCodeStripped[cStrip] = entry;
          }
        }
      });
    }

    // 2. Читаем «Кратность и упаковка» (A: Offer id, B: Продаем (кратность), C: Упаковка, ₽)
    const kuByOffer = {};
    const kuSh = ss.getSheetByName('Кратность и упаковка');
    if (kuSh && kuSh.getLastRow() >= 2) {
      const kCols = Math.min(Math.max(kuSh.getMaxColumns(), 3), 6);
      const kRows = kuSh.getRange(2, 1, kuSh.getLastRow() - 1, kCols).getValues();
      kRows.forEach(function (r) {
        const oid = String(r[0] === undefined || r[0] === null ? '' : r[0]).trim();
        if (!oid) return;
        const mult = calcNum_(r[1]);
        const pack = calcNum_(r[2]);
        kuByOffer[oid] = {
          mult: mult !== null && mult > 0 ? Math.round(mult * 1e6) / 1e6 : null,
          pack: pack !== null && pack >= 0 ? Math.round(pack * 100) / 100 : null
        };
      });
    }

    const hasSbs = Object.keys(byCodeExact).length > 0 || Object.keys(byName1c).length > 0;
    const hasKu = Object.keys(kuByOffer).length > 0;
    if (!hasSbs && !hasKu) return result;

    // 3. Обновляем «Номенклатуру» (колонки E=5, F=6, G=7, H=8)
    const nRows = nom.getLastRow() - 1;
    const nomVals = nom.getRange(2, 1, nRows, 8).getValues();
    const efghFormulas = nom.getRange(2, 5, nRows, 4).getFormulas();
    let changed = false;

    const newEfgh = nomVals.map(function (r, idx) {
      const oid = String(r[0] === undefined || r[0] === null ? '' : r[0]).trim();
      const code1c = r[3];
      let curName1c = r[4];
      let curCost = r[5];
      let curMult = r[6];
      let curPack = r[7];
      const fRow = efghFormulas[idx] || ['', '', '', ''];

      // Сопоставление себестоимости из «Себестоимость 1С МСК»
      if (hasSbs) {
        const cExact = normCodeExact(code1c);
        const cNoZero = normCodeNoLeadingZeros(code1c);
        const cStrip = normCodeStripped(code1c);
        const nKey = normName(curName1c);

        let match = null;
        if (cExact && byCodeExact[cExact]) {
          match = byCodeExact[cExact];
        } else if (cNoZero && byCodeNoZero[cNoZero]) {
          match = byCodeNoZero[cNoZero];
        } else if (nKey && byName1c[nKey]) {
          match = byName1c[nKey];
        } else if (cStrip && byCodeStripped[cStrip] && !byCodeStripped[cStrip].ambiguous) {
          match = byCodeStripped[cStrip];
        }

        if (match && match.cost > 0) {
          if (!String(fRow[1] || '').trim()) {
            const oldNum = calcNum_(curCost);
            if (oldNum === null || oldNum <= 0) {
              curCost = match.cost;
              result.filledCost++;
              changed = true;
            } else if (Math.abs(oldNum - match.cost) > 0.005) {
              curCost = match.cost;
              result.updatedCost++;
              changed = true;
            }
          }
          if (!String(fRow[0] || '').trim() &&
              (curName1c === '' || curName1c === null || curName1c === undefined) &&
              match.name1c) {
            curName1c = match.name1c;
            result.filledName1c++;
            changed = true;
          }
        }
      }

      // Сопоставление кратности и упаковки из «Кратность и упаковка»
      if (hasKu && oid && kuByOffer[oid]) {
        const ku = kuByOffer[oid];
        if (ku.mult !== null && ku.mult > 0 && !String(fRow[2] || '').trim()) {
          const oldMult = calcNum_(curMult);
          if (oldMult === null || oldMult <= 0) {
            curMult = ku.mult;
            result.filledMult++;
            changed = true;
          } else if (Math.abs(oldMult - ku.mult) > 1e-6) {
            curMult = ku.mult;
            result.updatedMult++;
            changed = true;
          }
        }
        if (ku.pack !== null && ku.pack >= 0 && !String(fRow[3] || '').trim()) {
          const oldPack = calcNum_(curPack);
          if (oldPack === null || curPack === '' || curPack === null || curPack === undefined) {
            curPack = ku.pack;
            result.filledPack++;
            changed = true;
          } else if (Math.abs(oldPack - ku.pack) > 0.005) {
            curPack = ku.pack;
            result.updatedPack++;
            changed = true;
          }
        }
      }

      return [
        String(fRow[0] || '').trim() ? fRow[0] : curName1c,
        String(fRow[1] || '').trim() ? fRow[1] : curCost,
        String(fRow[2] || '').trim() ? fRow[2] : curMult,
        String(fRow[3] || '').trim() ? fRow[3] : curPack
      ];
    });

    if (changed) {
      nom.getRange(2, 5, nRows, 4).setValues(newEfgh);
      logMsg_('INFO', '1С → Номенклатура: обновлена СС у ' + result.updatedCost +
        ' SKU, заполнена новая СС у ' + result.filledCost +
        ' SKU, кратность (новых ' + result.filledMult + ', изм. ' + result.updatedMult +
        '), упаковка (новых ' + result.filledPack + ', изм. ' + result.updatedPack + ').');
    }
  } catch (e) {
    logMsg_('WARN', 'sync1cCostsToNomenclature_: ' + e.message);
  }
  return result;
}

/** Публичная функция для ручного обновления СС и кратности из листов 1С с пересчётом юнит-экономики. */
function sync1cToNomenclature() {
  const ss = ss_();
  const syncRes = sync1cCostsToNomenclature_(ss);
  const calcRes = calculateUnitEconomics();
  calcRes.sync1c = syncRes;
  return calcRes;
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
 * Чтение общих параметров расчёта с листа «Параметры» (B4..B18).
 * ВАЖНО: Параметры!B14 никогда не модифицируется калькулятором.
 * Если строк 15..18 ещё нет — мягко добавляет их со значениями по умолчанию.
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
    oldPriceMarkup: CFG.OLD_PRICE_MARKUP_DEFAULT !== undefined ? CFG.OLD_PRICE_MARKUP_DEFAULT : 0.40,
    localShareDefault: CFG.LOCAL_SHARE_DEFAULT !== undefined ? CFG.LOCAL_SHARE_DEFAULT : 0.50,
    defectReserveRate: CFG.DEFECT_RESERVE_DEFAULT !== undefined ? CFG.DEFECT_RESERVE_DEFAULT : 0,
    noActionMarkup: CFG.NO_ACTION_MARKUP_DEFAULT !== undefined ? CFG.NO_ACTION_MARKUP_DEFAULT : 0.10
  };

  const par = ss_().getSheetByName('Параметры');
  if (!par || par.getLastRow() < 1) return defaults;

  const last = par.getLastRow();
  const rows = par.getRange(1, 1, last, 2).getValues();
  let hasOldPriceMarkupRow = false;
  let hasLocalShareRow = false;
  let hasDefectReserveRow = false;
  let hasNoActionMarkupRow = false;
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
    } else if (/локальн.*продаж|доля.*кластер.*мск/i.test(label) || idx === 15) {
      hasLocalShareRow = true;
      const f = calcToFraction_(val);
      if (f !== null && f >= 0 && f <= 1) defaults.localShareDefault = f;
    } else if (/резерв.*брак|резерв.*возврат|резерв.*хранен/i.test(label) || idx === 16) {
      hasDefectReserveRow = true;
      const f = calcToFraction_(val);
      if (f !== null && f >= 0 && f < 1) defaults.defectReserveRate = f;
    } else if (/предельн.*без акц|без акц.*надбавк/i.test(label) || idx === 17) {
      hasNoActionMarkupRow = true;
      const f = calcToFraction_(val);
      if (f !== null && f >= 0) defaults.noActionMarkup = f;
    }
  });

  if (last >= 14) {
    try {
      const appendRows = [];
      if (!hasOldPriceMarkupRow) {
        appendRows.push([
          'Надбавка для зачёркнутой цены (от целевой)',
          defaults.oldPriceMarkup,
          'Рекомендованная зачёркнутая цена = ОкрВверх(Целевая Предельная × (1 + надбавка), шаг B11). По умолчанию +40% (0,40).'
        ]);
      }
      if (!hasLocalShareRow) {
        appendRows.push([
          'Доля локальных продаж в кластере МСК (по умолчанию)',
          defaults.localShareDefault,
          'Вес минимального тарифа логистики при отсутствии географии заказов в «Продажи» (70% = 0,70 ближе к min, 50% = среднее min/max).'
        ]);
      }
      if (!hasDefectReserveRow) {
        appendRows.push([
          'Резерв на брак, невыкуп и хранение (% от ЛК)',
          defaults.defectReserveRate,
          'Необязательная надбавка к ленд-косту на списание возвратного брака и платное хранение (по умолчанию 0%).'
        ]);
      }
      if (!hasNoActionMarkupRow) {
        appendRows.push([
          'Надбавка для Предельной цены без акций (от целевой)',
          defaults.noActionMarkup,
          'Реком. Предельная цена без акций = ОкрВверх(Целевая Предельная × (1 + надбавка), шаг B11). По умолчанию +10% (0,10), чтобы соблюдалась лестница Ozon: Пол AG < Предельная AI ≤ Без акций BD < Зачёркнутая AO.'
        ]);
      }
      if (appendRows.length) {
        const startR = par.getLastRow() + 1;
        const needMax = startR + appendRows.length - 1;
        if (par.getMaxRows() < needMax) par.insertRowsAfter(par.getMaxRows(), needMax - par.getMaxRows());
        par.getRange(startR, 1, appendRows.length, 3).setValues(appendRows);
        par.getRange(startR, 2, appendRows.length, 1).setNumberFormat('0%');
      }
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
 * Выбор ДРР: сначала фактический ДРР по товару из «Продажи!G» (или F/D) / «Реклама ДРР!H»
 * с защитным потолком (по умолчанию 50%), иначе общая норма «Параметры!B4».
 */
function resolveItemDrr_(sRow, dRow, defaultDrr, maxSkuDrrCap) {
  const defRate = (defaultDrr !== null && defaultDrr !== undefined && defaultDrr >= 0 && defaultDrr < 1)
    ? defaultDrr
    : 0.15;
  const cap = (maxSkuDrrCap !== null && maxSkuDrrCap !== undefined && maxSkuDrrCap > 0 && maxSkuDrrCap < 1)
    ? maxSkuDrrCap
    : (CFG.MAX_SKU_DRR_CAP || 0.50);

  let rawRate = null;
  let source = 'Параметры!B4';

  if (sRow) {
    const sDrrPct = calcNum_(sRow[6]); // колонка G «ДРР от всей выручки, %» (в процентах: 0.76 = 0,76%, 8.0 = 8,0%)
    const sAdvSpend = calcNum_(sRow[5]); // колонка F «Расход на рекламу, ₽»
    const sRev = calcNum_(sRow[3]); // колонка D «Выручка, ₽»
    if (sAdvSpend !== null && sAdvSpend > 0 && sRev !== null && sRev > 0) {
      rawRate = sAdvSpend / sRev;
      source = (sDrrPct !== null && sDrrPct > 0) ? 'Продажи!G (SKU)' : 'Продажи!F/D (SKU)';
    } else if (sDrrPct !== null && sDrrPct > 0) {
      rawRate = sDrrPct / 100;
      source = 'Продажи!G (SKU)';
    }
  }

  if (rawRate === null && dRow) {
    const dSpend = calcNum_(dRow[3]); // колонка D «Расход, ₽»
    const dRevAn = calcNum_(dRow[6]); // колонка G «Выручка SKU (аналитика), ₽»
    const dRevRep = calcNum_(dRow[5]); // колонка F «Выручка SKU (из отчёта), ₽»
    const dRevAdv = calcNum_(dRow[4]); // колонка E «Продажи в продвижении, ₽»
    const dDenom = (dRevAn !== null && dRevAn > 0) ? dRevAn
      : ((dRevRep !== null && dRevRep > 0) ? dRevRep : ((dRevAdv !== null && dRevAdv > 0) ? dRevAdv : null));
    const dPct = calcNum_(dRow[7]); // колонка H «ДРР от всей выручки SKU, %» (в процентах: 0.76 = 0,76%)
    if (dSpend !== null && dSpend > 0 && dDenom !== null && dDenom > 0) {
      rawRate = dSpend / dDenom;
      source = 'Реклама ДРР!H (SKU)';
    } else if (dPct !== null && dPct > 0) {
      rawRate = dPct / 100;
      source = 'Реклама ДРР!H (SKU)';
    }
  }

  if (rawRate !== null && rawRate > 0) {
    if (rawRate > cap) {
      return {
        rate: cap,
        percent: Math.round(cap * 10000) / 100,
        source: source + ' (потолок ' + Math.round(cap * 100) + '%)',
        warning: 'ДРР по SKU (' + Math.round(rawRate * 10000) / 100 + '%) ограничен потолком ' + Math.round(cap * 100) + '%'
      };
    }
    return {
      rate: rawRate,
      percent: Math.round(rawRate * 10000) / 100,
      source: source,
      warning: null
    };
  }

  return {
    rate: defRate,
    percent: Math.round(defRate * 10000) / 100,
    source: 'Параметры!B4',
    warning: null
  };
}

/**
 * Определяет долю локальных продаж в домашнем кластере МСК по товару:
 * 1) «Продажи!T» (индивидуальная география SKU, если есть заказы с гео в «Продажи!S»);
 * 2) «Продажи!P9» (средняя доля кластера МСК по магазину);
 * 3) «Параметры!B16» (по умолчанию 50% = среднее min и max).
 */
function resolveItemLocalShare_(sRow, storeGeoShareFraction, defaultLocalShare) {
  if (sRow && sRow.length >= 20) {
    const mskOrders = calcNum_(sRow[17]); // R (18-я кол., индекс 17) «Заказов в МСК, шт»
    const geoOrders = calcNum_(sRow[18]); // S (19-я кол., индекс 18) «Заказов с гео, шт»
    const geoPct = calcNum_(sRow[19]);    // T (20-я кол., индекс 19) «Доля кластера МСК, %» (0..100)
    if (geoOrders !== null && geoOrders > 0) {
      let f = null;
      if (mskOrders !== null && mskOrders >= 0 && mskOrders <= geoOrders) {
        f = mskOrders / geoOrders;
      } else if (geoPct !== null && geoPct >= 0 && geoPct <= 100) {
        f = geoPct / 100;
      }
      if (f !== null) {
        return {
          share: f,
          percent: Math.round(f * 10000) / 100,
          source: 'Продажи!T (SKU)'
        };
      }
    }
  }
  if (storeGeoShareFraction !== null && storeGeoShareFraction !== undefined &&
      storeGeoShareFraction >= 0 && storeGeoShareFraction <= 1) {
    return {
      share: storeGeoShareFraction,
      percent: Math.round(storeGeoShareFraction * 10000) / 100,
      source: 'Продажи!P9 (магазин)'
    };
  }
  const def = (defaultLocalShare !== null && defaultLocalShare !== undefined &&
               defaultLocalShare >= 0 && defaultLocalShare <= 1)
    ? defaultLocalShare
    : 0.50;
  return {
    share: def,
    percent: Math.round(def * 10000) / 100,
    source: 'Параметры!B16'
  };
}

/**
 * ABC-классификация товаров по вкладу в положительную суммарную прибыль за период:
 * A — первые 80% прибыли, B — следующие 15% (до 95%), C — оставшиеся 5%.
 */
function classifyAbcByProfit_(calcRows) {
  if (!calcRows || !calcRows.length) return;
  let totalPosProfit = 0;
  const posIndices = [];
  for (let i = 0; i < calcRows.length; i++) {
    const statusText = String(calcRows[i][39] || '');
    if (statusText.indexOf('ПРОПУСК:') === 0) {
      calcRows[i][52] = '';
      continue;
    }
    const units = calcNum_(calcRows[i][43]) || 0;
    const vp = calcNum_(calcRows[i][45]);
    if (vp !== null && vp > 0) {
      totalPosProfit += vp;
      posIndices.push({ idx: i, profit: vp });
    } else if (vp !== null && vp < 0) {
      calcRows[i][52] = 'УБЫТОК';
    } else if (units > 0) {
      calcRows[i][52] = 'C (5% прибыли)';
    } else {
      calcRows[i][52] = 'Нет продаж';
    }
  }
  if (totalPosProfit <= 0) return;

  posIndices.sort(function (a, b) { return b.profit - a.profit; });
  let cum = 0;
  posIndices.forEach(function (item) {
    const prevShare = cum / totalPosProfit;
    cum += item.profit;
    if (prevShare < 0.80 - 1e-9) {
      calcRows[item.idx][52] = 'A (80% прибыли)';
    } else if (prevShare < 0.95 - 1e-9) {
      calcRows[item.idx][52] = 'B (15% прибыли)';
    } else {
      calcRows[item.idx][52] = 'C (5% прибыли)';
    }
  });
}

/**
 * Оценка участия товара в акции / «Эластичном бустинге» Ozon по новой механике «Предельной цены»
 * и «Цены для минимального бустинга» (max_action_price из листа «Акции!G»):
 *   • Сценарий 1 (target <= boostLimit): 🟢 В АКЦИИ (полная маржа) — ставим Предельную цену = target;
 *   • Сценарий 2 (floor <= boostLimit < target): 🟡 ВЫБОР — ставим Предельную цену = boostLimit (мин. бустинг)
 *     ИЛИ = target (выйти из бустинга на полную маржу);
 *   • Сценарий 3 (boostLimit < floor): 🔴 ВЫЙТИ ИЗ АКЦИИ — ставим Предельную цену = target (> boostLimit),
 *     что автоматически выводит товар из невыгодной акции Ozon.
 */
function evaluateItemBoosting_(floorRounded, targetRounded, itemActions) {
  let boostLimit = null;
  if (itemActions && itemActions.length) {
    itemActions.forEach(function (item) {
      const ar = item.row || [];
      const mp = calcNum_(ar[6]);
      if (mp !== null && mp > 0 && (boostLimit === null || mp < boostLimit)) {
        boostLimit = mp;
      }
    });
  }
  const floor = calcNum_(floorRounded);
  const target = calcNum_(targetRounded);

  if (floor === null || floor <= 0 || target === null || target <= 0) {
    return {
      maxActionPrice: boostLimit !== null ? calcRound2_(boostLimit) : '',
      scenario: 'BLOCKED',
      recommendation: '— (нет расчёта цены)'
    };
  }

  if (boostLimit === null || boostLimit <= 0) {
    return {
      maxActionPrice: '',
      scenario: 'NO_ACTION',
      recommendation: 'Вне акций: Предельная = ' + Math.round(target) + ' ₽'
    };
  }

  if (target <= boostLimit + 1e-9) {
    return {
      maxActionPrice: calcRound2_(boostLimit),
      scenario: 'IN_ACTION_TARGET',
      recommendation: '🟢 В АКЦИИ (полная маржа): Предельная = ' + Math.round(target) +
        ' ₽ (лимит ' + Math.round(boostLimit) + ' ₽)'
    };
  }

  if (floor <= boostLimit + 1e-9) {
    return {
      maxActionPrice: calcRound2_(boostLimit),
      scenario: 'CHOICE_BOOST_OR_MARGIN',
      recommendation: '🟡 ВЫБОР: ' + Math.round(boostLimit) + ' ₽ (мин. бустинг) ИЛИ ' +
        Math.round(target) + ' ₽ (выйти на полную маржу)'
    };
  }

  return {
    maxActionPrice: calcRound2_(boostLimit),
    scenario: 'EXIT_ACTION',
    recommendation: '🔴 ВЫЙТИ ИЗ АКЦИИ: поставить Предельную = ' + Math.round(target) +
      ' ₽ (> ' + Math.round(boostLimit) + ' ₽)'
  };
}

/**
 * Проверка одной строки листа «Акции» относительно нашего минимального пола и «Цены для минимального бустинга».
 */
function checkSheetActionRow_(floorPrice, maxActionPrice, actionPrice, ctx) {
  const floor = calcNum_(floorPrice);
  const limit = calcNum_(maxActionPrice);
  const actP = calcNum_(actionPrice);

  let actionMarkupPct = '';
  if (ctx && !ctx.priceBlocked && actP !== null && actP > 0 && ctx.land > 0 && ctx.c > 0 && ctx.c < 1) {
    const h = 1 - ctx.c - (ctx.d || 0);
    if (h > 0) {
      const m = (actP * h - ctx.totalLogistics - ctx.acquiring) / ctx.land - 1;
      actionMarkupPct = Math.round(m * 10000) / 100;
    }
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
      status: 'КОНФЛИКТ: наш пол выше лимита Ozon (выйти: Предельная > ' + calcRound2_(limit) + ' ₽)',
      warning: 'акция: наш минимальный пол (' + calcRound2_(floor) + ' ₽) выше цены мин. бустинга Ozon (' + calcRound2_(limit) + ' ₽)'
    };
  }

  if (actP !== null && actP > 0 && actP < floor - 1e-9) {
    return {
      floorRub: calcRound2_(floor),
      headroomRub: headroomRub,
      actionMarkupPct: actionMarkupPct,
      allowed: true,
      status: 'ВНИМАНИЕ: цена акции ниже нашего пола (поднять Предельную ≥ ' + calcRound2_(floor) + ' ₽)',
      warning: 'акция: текущая Предельная цена (' + calcRound2_(actP) + ' ₽) ниже нашего пола (' + calcRound2_(floor) + ' ₽)'
    };
  }

  return {
    floorRub: calcRound2_(floor),
    headroomRub: headroomRub,
    actionMarkupPct: actionMarkupPct,
    allowed: true,
    status: 'ОК: пол ≤ лимита Ozon' + (limit !== null && limit > 0 ? ' (в бустинге до ' + calcRound2_(limit) + ' ₽)' : ''),
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

    // --- 3. Индекс «Продажи» по Offer id и по SKU + сводная доля кластера МСК по магазину ---
    const salesByOffer = {}, salesBySku = {};
    let storeGeoShareFraction = null;
    const salesSh = ss.getSheetByName(CFG.SHEETS.SALES);
    if (salesSh && salesSh.getLastRow() >= 2) {
      const sCols = Math.min(Math.max(salesSh.getMaxColumns(), CFG.SALES_COLS), 25);
      salesSh.getRange(2, 1, salesSh.getLastRow() - 1, sCols).getValues().forEach(function (r) {
        const oid = String(r[0] || '').trim();
        const sku = String(r[1] || '').trim();
        if (oid && !salesByOffer[oid]) salesByOffer[oid] = r;
        if (sku && !salesBySku[sku]) salesBySku[sku] = r;
      });
      try {
        if (salesSh.getMaxRows() >= 9 && salesSh.getMaxColumns() >= 16) {
          const p9Val = salesSh.getRange(9, 16).getValue();
          const p9Num = calcNum_(p9Val);
          if (p9Num !== null && p9Num >= 0 && p9Num <= 100) {
            storeGeoShareFraction = p9Num > 1 ? p9Num / 100 : p9Num;
          }
        }
      } catch (eg) {}
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

    // --- 6. Автосинхронизация СС и кратности из листов 1С, товарных групп «Номенклатура!P» и чтение строк ---
    const sync1cStats = sync1cCostsToNomenclature_(ss);
    const filledGroups = fillEmptyNomProductGroups_(nom);
    const nomCols = Math.max(nom.getMaxColumns(), CFG.NOM_COLS);
    const nomRows = nom.getRange(2, 1, nom.getLastRow() - 1, nomCols).getValues();

    const calcRows = [];
    const skuContextByOffer = {};
    const groupCounts = {};
    let calculated = 0, skippedNoCost = 0, skippedNoFact = 0, blockedZeroBuyout = 0;
    let commFromFact = 0, commFromFallback = 0;
    let buyoutFromSales = 0, buyoutFallback = 0;
    let drrFromSku = 0, drrFallback = 0;
    let belowMinMarkup = 0, belowTargetPrice = 0, actionConflicts = 0, unprotectedMinPrice = 0;
    let boostInActionTarget = 0, boostChoice = 0, boostExitRequired = 0;
    let totalDeliveredUnits = 0, totalSalesRevenue = 0, totalVolumeProfit = 0, skusWithSales = 0;
    let inStockSkus = 0;

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
      const nomStockFbs = calcNum_(nr[12]); // M
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

      const defectRes = (params.defectReserveRate !== null && params.defectReserveRate !== undefined &&
                         params.defectReserveRate > 0 && params.defectReserveRate < 1)
        ? params.defectReserveRate
        : 0;
      const land = (costPerUnit !== null && costPerUnit > 0 && multiplicity !== null && multiplicity > 0)
        ? ((costPerUnit * multiplicity + packaging) * (1 + defectRes))
        : null;

      const fr = factByOffer[oid] || null;
      if (!fr) errors.push('нет строки в «Факт Ozon»');

      // Суммарный остаток FBO + FBS
      const fboStVal = fr && calcNum_(fr[17]) !== null ? calcNum_(fr[17]) : (nomStockFbo || 0);
      const fbsStVal = fr && calcNum_(fr[18]) !== null ? calcNum_(fr[18]) : (nomStockFbs || 0);
      const totalStock = Math.max(0, Math.round((fboStVal || 0) + (fbsStVal || 0)));
      if (totalStock > 0) inStockSkus++;

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

      // Выкуп, объём продаж и география из Продажи
      const sRow = salesByOffer[oid] || (sku ? salesBySku[sku] : null) || null;
      const dRow = drrByOffer[oid] || (sku ? drrBySku[sku] : null) || null;
      const geoInfo = resolveItemLocalShare_(sRow, storeGeoShareFraction, params.localShareDefault);
      const localShare = geoInfo.share;

      // Прямая логистика и тариф возврата (с взвешиванием по доле кластера МСК) + расчёт обеих схем FBO и FBS
      let directLogistics = null;
      let returnTariff = 0;
      let directFbo = null, returnFbo = 0;
      let directFbs = null, returnFbs = 0;
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

        const fboMin = calcNum_(fr[8]), fboMax = calcNum_(fr[9]), fboDeliv = calcNum_(fr[10]);
        if (fboMin !== null && fboMax !== null) {
          directFbo = (fboMin * localShare + fboMax * (1 - localShare)) + (fboDeliv || 0);
        }
        returnFbo = calcNum_(fr[20]) || 0;

        const fmMin = calcNum_(fr[11]), fmMax = calcNum_(fr[12]);
        const fbsMin = calcNum_(fr[13]), fbsMax = calcNum_(fr[14]), fbsDeliv = calcNum_(fr[15]);
        if (fbsMin !== null && fbsMax !== null) {
          directFbs = (fbsMin * localShare + fbsMax * (1 - localShare)) + (fbsDeliv || 0) +
            ((fmMin !== null && fmMax !== null) ? (fmMin * localShare + fmMax * (1 - localShare)) : 0);
        }
        returnFbs = calcNum_(fr[21]) || 0;

        if (scheme === 'FBO') {
          directLogistics = directFbo;
          returnTariff = returnFbo;
        } else {
          directLogistics = directFbs;
          returnTariff = returnFbs;
        }

        acquiring = calcNum_(fr[16]);
        if (acquiring === null && curPrice !== null && curPrice > 0) {
          acquiring = curPrice * params.acquiringRate;
        }
      }

      if (directLogistics === null) errors.push('нет логистики ' + scheme);
      if (curPrice === null || curPrice <= 0) errors.push('нет цены в Ozon');

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

      // ДРР: сначала фактический ДРР по SKU из Продажи!G / Реклама ДРР!H (с потолком 50%), иначе Параметры!B4
      const drrInfo = resolveItemDrr_(sRow, dRow, params.drr, CFG.MAX_SKU_DRR_CAP);
      if (drrInfo.warning) warnings.push(drrInfo.warning);
      if (drrInfo.source === 'Параметры!B4') drrFallback++;
      else drrFromSku++;
      const d = drrInfo.rate;
      const drrPct = drrInfo.percent;

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
        const skippedBoost = evaluateItemBoosting_(null, null, actByOffer[oid] || []);
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
          '',
          '',
          drrInfo.source,
          geoInfo.percent,
          '',
          '',
          totalStock,
          '',
          skippedBoost.maxActionPrice,
          '',
          ''
        ]);
        return;
      }

      const c = commInfo.rate;
      // Честная аддитивная формула запаса цены: 1 - c - d (комиссия и ДРР вычитаются от полной цены реализации)
      const h = Math.max(0, 1 - c - d);
      const acq = acquiring || 0;
      const priceBlocked = Boolean(buyoutInfo.blocked) || h <= 0;
      if (buyoutInfo.blocked) blockedZeroBuyout++;
      else calculated++;
      if (h <= 0.2) {
        warnings.push('при комиссии ' + Math.round(c * 1000) / 10 + '% и ДРР ' + Math.round(d * 1000) / 10 +
          '% на товар и логистику остаётся ' + Math.round(h * 1000) / 10 + '% от цены — целевая цена получается нерыночной');
      }

      const returnCost = !buyoutInfo.blocked
        ? (buyoutInfo.rate === 1 ? 0 : (returnTariff * (1 - buyoutInfo.rate) / buyoutInfo.rate))
        : null;
      const totalLogistics = !buyoutInfo.blocked ? (directLogistics + returnCost) : null;

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
      const noActMarkup = (params.noActionMarkup !== undefined && params.noActionMarkup !== null)
        ? params.noActionMarkup
        : (CFG.NO_ACTION_MARKUP_DEFAULT !== undefined ? CFG.NO_ACTION_MARKUP_DEFAULT : 0.10);
      const recommendedNoActionRounded = (!priceBlocked && targetRounded !== null && targetRounded > 0)
        ? calcRoundUp_(targetRounded * (1 + noActMarkup), params.roundStep)
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
      const rosMarginPct = (profitBeforeTax !== null && curPrice !== null && curPrice > 0)
        ? Math.round((profitBeforeTax / curPrice) * 10000) / 100
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

      // Сравнение FBO против FBS по целевой цене (Идея 3)
      let fboTargetRounded = null;
      let fbsTargetRounded = null;
      let fboAdvantageRub = null;
      if (!buyoutInfo.blocked && fr) {
        const commFbo = resolveItemCommission_(cRow, fr, 'FBO');
        const commFbs = resolveItemCommission_(null, fr, 'FBS');
        const cFbo = commFbo.rate !== null ? commFbo.rate : c;
        const cFbs = commFbs.rate !== null ? commFbs.rate : c;
        const hFbo = Math.max(0, 1 - cFbo - d);
        const hFbs = Math.max(0, 1 - cFbs - d);
        if (directFbo !== null && hFbo > 0) {
          const retFboCost = buyoutInfo.rate === 1 ? 0 : (returnFbo * (1 - buyoutInfo.rate) / buyoutInfo.rate);
          const rawFbo = (land * (1 + markups.targetMarkup) + acq + directFbo + retFboCost) / hFbo;
          fboTargetRounded = calcRoundUp_(rawFbo, params.roundStep);
        }
        if (directFbs !== null && hFbs > 0) {
          const retFbsCost = buyoutInfo.rate === 1 ? 0 : (returnFbs * (1 - buyoutInfo.rate) / buyoutInfo.rate);
          const rawFbs = (land * (1 + markups.targetMarkup) + acq + directFbs + retFbsCost) / hFbs;
          fbsTargetRounded = calcRoundUp_(rawFbs, params.roundStep);
        }
        if (fboTargetRounded !== null && fbsTargetRounded !== null) {
          fboAdvantageRub = fbsTargetRounded - fboTargetRounded;
        }
      }

      if (mCur !== null && mCur < markups.minMarkup) {
        belowMinMarkup++;
        warnings.push('наценка ниже минимальной');
      }
      if (targetRounded !== null && curPrice !== null && curPrice < targetRounded) {
        belowTargetPrice++;
        warnings.push('текущая цена ниже целевой');
      }
      if (floorRounded !== null && floorRounded > 0) {
        if (ozonMinPrice === null || ozonMinPrice <= 0) {
          unprotectedMinPrice++;
          warnings.push('min_price в Ozon не задан (риск автоакций)');
        } else if (ozonMinPrice < floorRounded - 1e-9) {
          unprotectedMinPrice++;
          warnings.push('min_price в Ozon ниже нашего пола');
        }
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

      // Проверка ограничений акций и расчёт решения по «Цене для минимального бустинга» для этого SKU
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
      const boostDecision = evaluateItemBoosting_(floorRounded, targetRounded, itemActions);
      if (boostDecision.scenario === 'IN_ACTION_TARGET') boostInActionTarget++;
      else if (boostDecision.scenario === 'CHOICE_BOOST_OR_MARGIN') boostChoice++;
      else if (boostDecision.scenario === 'EXIT_ACTION') boostExitRequired++;

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
        volumeProfit !== null ? calcRound2_(volumeProfit) : '',
        rosMarginPct !== null ? rosMarginPct : '',
        drrInfo.source,
        geoInfo.percent,
        fboTargetRounded !== null ? calcRound2_(fboTargetRounded) : '',
        fboAdvantageRub !== null ? calcRound2_(fboAdvantageRub) : '',
        totalStock,
        '',
        boostDecision.maxActionPrice,
        boostDecision.recommendation,
        recommendedNoActionRounded !== null ? calcRound2_(recommendedNoActionRounded) : ''
      ]);
    });

    // ABC-классификация по прибыли на объём продаж (заполняет 53-ю колонку BA, индекс 52)
    classifyAbcByProfit_(calcRows);

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
      drrFromSku: drrFromSku,
      drrFallback: drrFallback,
      belowMinMarkup: belowMinMarkup,
      belowTargetPrice: belowTargetPrice,
      unprotectedMinPrice: unprotectedMinPrice,
      inStockSkus: inStockSkus,
      actionConflicts: actionConflicts,
      boostInActionTarget: boostInActionTarget,
      boostChoice: boostChoice,
      boostExitRequired: boostExitRequired,
      actionsChecked: actChecked,
      actionsAllowed: actAllowed,
      actionsBelowFloor: actBelowFloor,
      actionsBlocked: actBlocked,
      filledProductGroups: filledGroups,
      sync1c: sync1cStats,
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
      '. ДРР: по SKU ' + drrFromSku + ', из B4 ' + drrFallback +
      '. Не защищены min_price: ' + unprotectedMinPrice +
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
 * Формирует 3 строки верхней закреплённой KPI-панели на листе «Расчёт» (56 колонок).
 * ВАЖНО: все подписи и значения размещаются в главных колонках, которые остаются
 * видимыми при свёрнутых группах [+]: A(0), B(1), C(2), D(3), E(4), I(8), O(14), Q(16),
 * U(20), Y(24), AF(31), AG(32), AI(34), AJ(35), AM(38), AN(39), AO(40), AP(41), AT(45),
 * AU(46), AY(50), AZ(51), BA(52), BB(53), BC(54), BD(55).
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
  const noActMpPct = Math.round(((params.noActionMarkup !== undefined ? params.noActionMarkup : 0.10) || 0) * 10000) / 100;
  const locPct = Math.round(((params.localShareDefault !== undefined ? params.localShareDefault : 0.50) || 0) * 10000) / 100;

  // Строка 1 — заголовки KPI-плашек
  r1[0]  = '📊 ЮНИТ-ЭКОНОМИКА И ЦЕНЫ (Э2/Э3)';
  r1[1]  = 'Всего SKU';
  r1[2]  = 'Покрытие базы (в расчёте / без СС / блок 0%)';
  r1[3]  = 'Товарных групп';
  r1[4]  = 'Схема';
  r1[8]  = 'Выкуп (Продажи / B8)';
  r1[14] = 'ДРР (SKU / B4) и Гео';
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
  r1[46] = 'Формула запаса цены';
  r1[50] = 'Сравнение FBO к FBS';
  r1[51] = 'В наличии (FBO+FBS)';
  r1[52] = 'Не защищены min_price';
  r1[53] = 'Бустинг (в акции / выбор)';
  r1[54] = 'Выйти из акции (Предельная > BB)';
  r1[55] = 'Предельная без акций';

  // Строка 2 — значения KPI-плашек
  r2[0]  = 'Сводка по магазину';
  r2[1]  = summary.total || 0;
  r2[2]  = 'Рассчитано: ' + (summary.calculated || 0) +
           '  |  Без СС: ' + (summary.skippedNoCost || 0) +
           '  |  Блок (0%): ' + (summary.blockedZeroBuyout || 0);
  r2[3]  = summary.productGroupsCount || 0;
  r2[4]  = String(params.scheme || 'Авто');
  r2[8]  = (summary.buyoutFromSales || 0) + ' / ' + (summary.buyoutFallback || 0);
  r2[14] = 'ДРР SKU: ' + (summary.drrFromSku || 0) + ' / B4 (' + drrPct + '%) | МСК ' + locPct + '%';
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
  r2[46] = '1 − Комиссия − ДРР';
  r2[50] = 'Выгода ₽/шт на FBO';
  r2[51] = (summary.inStockSkus || 0) + ' SKU > 0 шт';
  r2[52] = (summary.unprotectedMinPrice || 0) + ' SKU (< пола AG)';
  r2[53] = '🟢 ' + (summary.boostInActionTarget || 0) + '  |  🟡 ' + (summary.boostChoice || 0) + ' SKU';
  r2[54] = '🔴 ' + (summary.boostExitRequired || 0) + ' SKU (пол AG > лимита BB)';
  r2[55] = '+' + noActMpPct + '% к целевой (B18)';

  // Строка 3 — подсказка по навигации и легенда светофора
  r3[0]  = '💡 Раскройте [+] над столбцами для деталей затрат и налогов';
  r3[2]  = 'Фильтр [▼] в строке 4 позволяет отобрать группу (D), товары в наличии (AZ > 0), класс A (BA) или решение по бустингу (BC)';
  r3[20] = '🟢 Зелёный: наценка ≥ цели, акция ОК';
  r3[24] = '🟡 Жёлтый: ниже цели или ниже нашего пола';
  r3[38] = '🔴 Красный: убыток (<0%) или пол > лимита Ozon';
  r3[39] = '⚪ Серый: нет СС/кратности в 1С';
  r3[41] = 'Раскройте [+] справа от AP для % отклонения и выручки';
  r3[46] = 'ROS (AU) = Прибыль / Цена | ROI (Y) = Прибыль / Ленд-кост';
  r3[50] = 'Раскройте [+] слева от AY для источника ДРР, гео МСК и цены FBO';
  r3[53] = 'Чтобы убрать товар из невыгодной акции Ozon, поставьте Предельную цену (AI) выше Цены для мин. бустинга (BB)';

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
  topBgs[1][46] = '#e8f0fe'; topFcs[1][46] = '#1967d2';
  topBgs[1][50] = '#e8f0fe'; topFcs[1][50] = '#1967d2';
  topBgs[1][51] = '#e6f4ea'; topFcs[1][51] = '#137333';
  topBgs[1][52] = (summary && summary.unprotectedMinPrice > 0) ? '#fef7e0' : '#e6f4ea';
  topFcs[1][52] = (summary && summary.unprotectedMinPrice > 0) ? '#b06000' : '#137333';
  topBgs[1][53] = '#e6f4ea'; topFcs[1][53] = '#137333';
  topBgs[1][54] = (summary && summary.boostExitRequired > 0) ? '#fce8e6' : '#e6f4ea';
  topFcs[1][54] = (summary && summary.boostExitRequired > 0) ? '#c5221f' : '#137333';
  topBgs[1][55] = '#ede7f6'; topFcs[1][55] = '#4a235a';

  // Цветовое кодирование 7 смысловых блоков в строке 4 (шапка таблицы)
  const primaryCols = {
    0:1, 1:1, 2:1, 3:1, 4:1, 8:1, 14:1, 16:1, 20:1, 24:1,
    31:1, 32:1, 34:1, 35:1, 38:1, 39:1, 40:1, 41:1, 45:1,
    46:1, 50:1, 51:1, 52:1, 53:1, 54:1, 55:1
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
      topBgs[3][c] = isPrim ? '#1b4f72' : '#2874a6'; // Блок 7: Реком. old_price, объём, ROS, FBO vs FBS, ABC
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

    // Шаблон числовых форматов на 1 строку из 53 колонок
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
      '#,##0.00',        // 46 AT: Прибыль на объём продаж, ₽
      '0.00"%"',         // 47 AU: Маржинальность цены (ROS), %
      '@',               // 48 AV: Источник ДРР
      '0.00"%"',         // 49 AW: Доля кластера МСК (гео), %
      '#,##0',           // 50 AX: Целевая цена FBO, ₽
      '+#,##0;-#,##0;0', // 51 AY: Выгода FBO к FBS, ₽/шт
      '#,##0',           // 52 AZ: Остаток всего (FBO+FBS), шт
      '@',               // 53 BA: ABC по прибыли
      '#,##0',           // 54 BB: Цена для мин. бустинга (акция Ozon), ₽
      '@',               // 55 BC: Решение по акции / бустингу (Предельная цена)
      '#,##0'            // 56 BD: Реком. Предельная цена без акций, ₽
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
        // Выделяем ключевые расчётные колонки (Ленд-кост, Логистика с возвр., Наш пол, Целевая Предельная, Реком. зачёркнутая, Реком. без акций)
        rowFw[0]  = 'bold';
        rowFw[8]  = 'bold';
        rowFw[14] = 'bold';
        rowBg[32] = '#f3e8fd'; rowFc[32] = '#4a235a'; rowFw[32] = 'bold'; // AG: Наш пол акций
        rowBg[34] = '#ede7f6'; rowFc[34] = '#311b92'; rowFw[34] = 'bold'; // AI: Целевая Предельная цена
        rowBg[40] = '#f3e8fd'; rowFc[40] = '#4a235a'; rowFw[40] = 'bold'; // AO: Реком. зачёркнутая цена
        rowBg[55] = '#f3e8fd'; rowFc[55] = '#4a235a'; rowFw[55] = 'bold'; // BD: Реком. Предельная цена без акций

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
          const ozonMinP = calcNum_(r[23]);
          const mCur = calcNum_(r[24]);
          const minMp = calcNum_(r[28]);
          const tgtMp = calcNum_(r[29]);
          const floorP = calcNum_(r[32]);
          const targetP = calcNum_(r[34]);
          const profit = calcNum_(r[35]);
          const deltaRub = calcNum_(r[41]);
          const volUnits = calcNum_(r[43]);
          const volProfit = calcNum_(r[45]);
          const rosPct = calcNum_(r[46]);
          const fboAdv = calcNum_(r[50]);
          const totStock = calcNum_(r[51]);
          const abcClass = String(r[52] || '');

          // Светофор для текущей цены (U) относительно пола и целевой цены
          if (curPrice !== null && floorP !== null && curPrice < floorP) {
            rowBg[20] = '#fce8e6'; rowFc[20] = '#c5221f'; rowFw[20] = 'bold';
          } else if (curPrice !== null && targetP !== null && curPrice < targetP) {
            rowBg[20] = '#fef7e0'; rowFc[20] = '#b06000'; rowFw[20] = 'bold';
          } else if (curPrice !== null) {
            rowBg[20] = '#e6f4ea'; rowFc[20] = '#137333'; rowFw[20] = 'bold';
          }

          // Светофор для защиты min_price Ozon (X) относительно нашего пола (AG)
          if (floorP !== null && floorP > 0) {
            if (ozonMinP === null || ozonMinP <= 0) {
              rowBg[23] = '#fef7e0'; rowFc[23] = '#b06000';
            } else if (ozonMinP < floorP - 1e-9) {
              rowBg[23] = '#fce8e6'; rowFc[23] = '#c5221f'; rowFw[23] = 'bold';
            } else {
              rowBg[23] = '#e6f4ea'; rowFc[23] = '#137333'; rowFw[23] = 'bold';
            }
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

          // Светофор для маржинальности цены ROS (AU)
          if (rosPct !== null) {
            rowFw[46] = 'bold';
            if (rosPct < 0) {
              rowBg[46] = '#fce8e6'; rowFc[46] = '#c5221f';
            } else if (mCur !== null && tgtMp !== null && mCur < tgtMp) {
              rowBg[46] = '#fef7e0'; rowFc[46] = '#b06000';
            } else {
              rowBg[46] = '#e6f4ea'; rowFc[46] = '#137333';
            }
          }

          // Светофор для выгоды FBO к FBS (AY)
          if (fboAdv !== null && fboAdv > 0) {
            rowBg[50] = '#e8f0fe'; rowFc[50] = '#1967d2'; rowFw[50] = 'bold';
          }

          // Светофор для остатка (AZ)
          if (totStock !== null && totStock > 0) {
            rowFw[51] = 'bold';
          }

          // Светофор для ABC по прибыли (BA)
          if (abcClass.indexOf('A') === 0) {
            rowBg[52] = '#e6f4ea'; rowFc[52] = '#137333'; rowFw[52] = 'bold';
          } else if (abcClass.indexOf('B') === 0) {
            rowBg[52] = '#e8f0fe'; rowFc[52] = '#1967d2'; rowFw[52] = 'bold';
          } else if (abcClass === 'УБЫТОК') {
            rowBg[52] = '#fce8e6'; rowFc[52] = '#c5221f'; rowFw[52] = 'bold';
          }

          // Светофор для Цены мин. бустинга (BB) и Решения по бустингу (BC)
          const boostLimitVal = calcNum_(r[53]);
          const boostRecText = String(r[54] || '');
          if (boostLimitVal !== null && boostLimitVal > 0 && floorP !== null && targetP !== null) {
            rowFw[53] = 'bold';
            if (boostLimitVal < floorP - 1e-9) {
              rowBg[53] = '#fce8e6'; rowFc[53] = '#c5221f';
            } else if (boostLimitVal < targetP - 1e-9) {
              rowBg[53] = '#fef7e0'; rowFc[53] = '#b06000';
            } else {
              rowBg[53] = '#e6f4ea'; rowFc[53] = '#137333';
            }
          }
          if (boostRecText.indexOf('🟢') === 0) {
            rowBg[54] = '#e6f4ea'; rowFc[54] = '#137333'; rowFw[54] = 'bold';
          } else if (boostRecText.indexOf('🟡') === 0) {
            rowBg[54] = '#fef7e0'; rowFc[54] = '#b06000'; rowFw[54] = 'bold';
          } else if (boostRecText.indexOf('🔴') === 0) {
            rowBg[54] = '#fce8e6'; rowFc[54] = '#c5221f'; rowFw[54] = 'bold';
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
    46: 135, // AT: Прибыль на объём продаж, ₽
    47: 125, // AU: Маржинальность цены (ROS), %
    51: 125, // AY: Выгода FBO к FBS, ₽/шт
    52: 120, // AZ: Остаток всего (FBO+FBS), шт
    53: 135, // BA: ABC по прибыли
    54: 130, // BB: Цена для мин. бустинга (акция Ozon), ₽
    55: 290, // BC: Решение по акции / бустингу (Предельная цена)
    56: 135  // BD: Реком. Предельная цена без акций, ₽
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
    const lastR = Math.min(sh.getLastRow(), 18);
    if (lastR >= 4) {
      sh.getRange(4, 1, lastR - 3, 1).setFontWeight('bold').setBackground('#f8f9fa');
      sh.getRange(4, 2, Math.min(10, lastR - 3), 1).setBackground('#e8f0fe').setFontColor('#1967d2').setFontWeight('bold');
      sh.getRange(4, 3, lastR - 3, 1).setWrap(true).setFontColor('#5f6368');
      if (lastR >= 14) {
        sh.getRange(14, 2, 1, 1).setBackground('#f1f3f4').setFontColor('#3c4043').setFontWeight('bold');
      }
      if (lastR >= 15) {
        sh.getRange(15, 2, lastR - 14, 1).setBackground('#e8f0fe').setFontColor('#1967d2').setFontWeight('bold');
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
    const noActMpPct = Math.round(((p.noActionMarkup !== undefined ? p.noActionMarkup : 0.10) || 0) * 10000) / 100;
    const drrPct = Math.round((p.drr || 0) * 10000) / 100;
    const locPct = Math.round(((p.localShareDefault !== undefined ? p.localShareDefault : 0.50) || 0) * 10000) / 100;
    const defResPct = Math.round(((p.defectReserveRate !== undefined ? p.defectReserveRate : 0) || 0) * 10000) / 100;

    const rows = [
      ['ПАСПОРТ ПРОЕКТА «OZON UNIT — РАБОЧАЯ МОДЕЛЬ»', 'Актуализировано автоматически: ' + (s.updatedAt || '')],
      ['Раздел / Показатель', 'Текущий статус и живые метрики книги'],
      ['Статус этапов проекта', 'Э0 (Каркас) ✅ | Э1 (Синхронизация Ozon) ✅ | Э2 (Факт наценки и ROS) ✅ | Э3 (Предельная цена, бустинг, FBO vs FBS) ✅ | Э6 (UX, ABC, защита min_price) ✅ | Э5 (Экспорт цен в Ozon) ⏸ вне скоупа'],
      ['Главные рабочие листы', '1. «Расчёт» (56 кол. A..BD, KPI-шапка + группы [+/-])  |  2. «Акции» (15 кол., контроль пола и бустинга L:O)  |  3. «Проблемы данных»'],
      ['Листы настроек и базы 1С', '4. «Параметры» (B4:B18)  |  5. «Настройки расчёта» (каскад SKU → группа → общая)  |  6. «Номенклатура» (база SKU и СС 1С)'],
      ['Авто-листы Ozon API', '7. «Факт Ozon»  |  8. «Комиссия факт»  |  9. «Продажи» (с гео кластера МСК R..U)  |  10. «Реклама ДРР»  |  11. «Лог»'],
      ['Всего артикулов в «Номенклатуре»', (s.total || 0) + ' SKU (товарных групп в «Номенклатура!P»: ' + (s.productGroupsCount || 0) + ', в наличии FBO+FBS > 0: ' + (s.inStockSkus || 0) + ' SKU)'],
      ['Покрытие расчёта Э2/Э3', 'Рассчитано: ' + (s.calculated || 0) + ' SKU  |  Пропущено без СС/кратности 1С: ' + (s.skippedNoCost || 0) + ' SKU  |  Блок (выкуп 0%): ' + (s.blockedZeroBuyout || 0) + ' SKU'],
      ['Источники комиссии, выкупа и ДРР', 'Комиссия: факт ' + (s.commFromFact || 0) + ' / Ozon ' + (s.commFromFallback || 0) + '  |  Выкуп: Продажи ' + (s.buyoutFromSales || 0) + ' / B8 ' + (s.buyoutFallback || 0) + '  |  ДРР: по SKU ' + (s.drrFromSku || 0) + ' / B4 ' + (s.drrFallback || 0)],
      ['Параметры расчёта (Параметры!B4:B18)', 'Формула запаса цены: 1 − Комиссия − ДРР  |  ДРР по умолч.: ' + drrPct + '%  |  Цель ROI: ' + tgtMpPct + '% / Мин. ROI: ' + minMpPct + '%  |  Без акций (B18): +' + noActMpPct + '%  |  Зачёркн. цена (B15): +' + oldMpPct + '%  |  Доля МСК: ' + locPct + '%  |  Резерв брака: ' + defResPct + '%'],
      ['Новые правила цен и акций Ozon (сентябрь 2026)', '«Предельная цена» (кол. U и AI) — единая цена в разделах «Цены» и «Акции от Ozon» (вкл. «Эластичный бустинг» и «Скидка на сток»). Чтобы убрать товар из невыгодной акции, поставьте «Предельную цену» (AI) выше «Цены для минимального бустинга» (кол. BB) — см. готовое решение в кол. BC. Лестница цен для ЛК Ozon: Ограничение AG < Предельная AI ≤ Предельная без акций BD < Зачёркнутая AO. Помните: «Ограничение для акций» (min_price) в ЛК Ozon автоотключается через 30 дней.'],
      ['Как читать Наценку (ROI, кол. Y) vs Маржинальность (ROS, кол. AU)', 'Наценка к ленд-косту (ROI) = Прибыль / Ленд-кост (отдача на вложенный в товар рубль: при цели 30% на каждые 100 ₽ себестоимости зарабатываем 30 ₽). Маржинальность цены (ROS) = Прибыль / Предельная цена (доля чистой прибыли в чеке покупателя и запас прочности к скидке/рекламе: если ROS = 8%, то дополнительная скидка 8% или рост ДРР на +8 п.п. обнулит прибыль).'],
      ['Контроль рентабельности и защиты min_price', 'В норме (≥ целевой цены): ' + Math.max(0, (s.calculated || 0) - (s.belowTargetPrice || 0)) + ' SKU  |  Ниже целевой: ' + (s.belowTargetPrice || 0) + ' SKU  |  Ниже мин. наценки: ' + (s.belowMinMarkup || 0) + ' SKU  |  Не защищены min_price (< пола AG): ' + (s.unprotectedMinPrice || 0) + ' SKU'],
      ['Контроль акций и бустинга Ozon', 'Строк в «Акциях»: ' + (s.actionsChecked || 0) + ' (проходят лимит: ' + (s.actionsAllowed || 0) + ', конфликт: ' + (s.actionsBlocked || 0) + ')  |  По товарам (кол. BC): 🟢 В акции с полной маржой: ' + (s.boostInActionTarget || 0) + ' SKU  |  🟡 Выбор (бустинг vs маржа): ' + (s.boostChoice || 0) + ' SKU  |  🔴 Выйти из акции (Предельная > BB): ' + (s.boostExitRequired || 0) + ' SKU'],
      ['Объём продаж и прибыль за период («Продажи»)', 'Выкуплено: ' + (s.totalDeliveredUnits || 0) + ' шт (' + (s.skusWithSales || 0) + ' SKU с продажами)  |  Выручка: ' + (s.totalSalesRevenue || 0) + ' ₽  |  Расчётная прибыль до налогов на объём: ' + (s.totalVolumeProfit || 0) + ' ₽'],
      ['Правило безопасности Э5', 'Калькулятор работает строго внутри Google Таблицы и НЕ отправляет цены в Ozon API (/v1/product/import/prices не вызывается).']
    ];

    if (sh.getMaxRows() < rows.length && typeof sh.insertRowsAfter === 'function') {
      sh.insertRowsAfter(sh.getMaxRows(), rows.length - sh.getMaxRows());
    }
    if (sh.getMaxColumns() < 2 && typeof sh.insertColumnsAfter === 'function') {
      sh.insertColumnsAfter(sh.getMaxColumns(), 2 - sh.getMaxColumns());
    }
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), rows.length), Math.max(sh.getMaxColumns(), 2)).clearContent();
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
