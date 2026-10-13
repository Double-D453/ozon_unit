/**
 * Файл 4 из 5: СИНХРОНИЗАЦИЯ ДАННЫХ С OZON В ТАБЛИЦУ
 * ---------------------------------------------------------------
 * Меню «Ozon Unit» в таблице:
 *   • Синхронизировать данные из Ozon  — цены, комиссии, логистика, возвраты → лист «Факт Ozon»
 *   • Синхронизировать акции          — акции и участие товаров → лист «Акции»
 *   • Синхронизировать продажи        — аналитика Seller API → лист «Продажи» (знаменатель ДРР)
 *   • Синхронизировать рекламу (ДРР)  — Performance API → лист «Реклама ДРР» + параметр ДРР
 *   • Добавить недостающие SKU в базу — новые карточки магазина в «Номенклатуру»
 *   • Проверить комиссию по отчёту о реализации — фактическая ставка по базе продавца
 *   • Проверить подключение / Сверить цены / Диагностика ДРР
 *   • Настроить ключи доступа         — ключи в свойствах скрипта (в таблицу не попадают!)
 *   • Показать лог
 *
 * v0.6 (09.10.2026) — по итогам прогона №5 и ответов владельца:
 *   • НОМЕНКЛАТУРА ОБНОВЛЯЕТСЯ ИЗ OZON АВТОМАТИЧЕСКИ: новые карточки магазина
 *     дописываются строками (Offer id, SKU, название, остаток, схема), а в новой
 *     колонке Q «Синк с Ozon» помечается, чем артикул проблемный — «новый из Ozon,
 *     нет данных 1С», «нет себестоимости», «нет в магазине Ozon», «нет карточки».
 *     Причины дописываются в лист «Проблемы данных» (без дублей);
 *   • СКИДКА К КОМИССИИ за отсрочку выплаты: API её не отдаёт (в prices всегда
 *     списочные 49,5%), поэтому добавлен параметр «Скидка к комиссии Ozon, п.п.»
 *     и колонки W/X «Факт Ozon» — комиссия к расчёту. Фактическая ставка меряется
 *     по реальным отправлениям (commission_amount / price) — меню
 *     «Проверить комиссию по отчёту о реализации», лист «Комиссия факт»;
 *   • Продажи: /v1/analytics/data отвергает date_to в будущем
 *     («date_to must not be greater than current date») — конец периода теперь сегодня;
 *   • «Факт Ozon» — 24 колонки (добавлены W/X).
 *
 * v0.5 (08.10.2026) — по итогам прогона №3:
 *   • ИСПРАВЛЕН ЭКВАЙРИНГ: поле acquiring лежит В КОРНЕ ответа /v5/product/info/prices,
 *     а не внутри price — поэтому в прошлый раз из API подхватилось 0 значений
 *     и все 1265 SKU получили оценку 1,5%;
 *   • syncFact дозаполняет пустой SKU в «Номенклатуре» (колонка B) — по нему
 *     раскладываем рекламу и аналитику продаж;
 *   • ДРР ПЕРЕПИСАН: отчёты Performance содержат готовый разрез по sku и колонку
 *     «ДРР, %» — расход теперь ложится на каждый артикул, а не одной средней;
 *     кампании отбираются (активные + завершившиеся в периоде), отчёты заказываются
 *     по 3 параллельно, обработанные запоминаются — повторный запуск продолжает
 *     с места остановки (в кабинете 1663 кампании, за один раз не обойти);
 *   • НОВЫЙ лист «Продажи»: выручка и заказы по SKU из /v1/analytics/data —
 *     это правильный знаменатель ДРР (расход / ВСЯ выручка, а не только рекламная);
 *   • НОВОЕ действие «Добавить недостающие SKU в базу»: 202 товара магазина,
 *     которых нет в «Номенклатуре», добавляются строками (себестоимость — вручную).
 *
 * v0.4 (08.10.2026) — по итогам прогона №2:
 *   • syncFact заполняет ВСЮ логистику I–P из ответа API (commissions:
 *     логистика FBO/FBS мин/макс, доставка, обработка FBS);
 *   • эквайринг берётся из API (поле acquiring), НДС приводится к процентам,
 *     «цена с акцией» = marketing_seller_price;
 *   • добавлены колонки U/V: «Возврат FBO, ₽», «Возврат FBS, ₽» (итого 22);
 *   • в конце syncFact — сверка с магазином (productListAll_): сколько товаров
 *     магазина нет в нашей базе и наоборот;
 *   • syncDrr: защита от лимита времени Apps Script (6 минут).
 */

// ============================================================
// СЛУЖЕБНОЕ
// ============================================================

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

/** Лист по имени; шапка приводится к нужной (обновляется, если отличается). */
function sheet_(name, headers) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (headers && headers.length) {
    const cur = (sh.getLastRow() >= 1) ? sh.getRange(1, 1, 1, headers.length).getValues()[0] : [];
    let same = cur.length === headers.length;
    if (same) {
      for (let i = 0; i < headers.length; i++) {
        if (String(cur[i]) !== String(headers[i])) { same = false; break; }
      }
    }
    if (!same) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setBackground('#1F4E79').setFontColor('#FFFFFF');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

/** Sink по умолчанию: лист «Лог»; формат строки и ротация сохранены. */
function sheetLogSink_(record) {
  const sh = sheet_(CFG.SHEETS.LOG, ['Время', 'Уровень', 'Сообщение']);
  sh.appendRow([record.time, record.level, record.message]);
  const last = sh.getLastRow();
  if (last > CFG.LOG_KEEP + 1) sh.deleteRows(2, last - CFG.LOG_KEEP - 1);
}

/**
 * Подключаемый приёмник журнала. По умолчанию пишет в Google Sheets;
 * в другом окружении его можно заменить консолью, Pino или хранилищем.
 * Запись sink получает как {time: Date, level, message}.
 */
var LOG_SINK_ = sheetLogSink_;

/** Пишет в sink, не позволяя ошибке логирования прервать основной процесс. */
function logMsg_(level, text) {
  const record = { time: new Date(), level: level, message: String(text).slice(0, 5000) };
  try {
    if (typeof LOG_SINK_ === 'function') LOG_SINK_(record);
  } catch (e) { /* лог не должен ломать основной процесс */ }
  if (level === 'ERROR') console.error(text); else console.log(text);
}

/** Пересчёт формул на листах. */
function recalc_() { SpreadsheetApp.flush(); }

/** Период по московскому времени (как группирует отчёты Ozon). */
function mskRange_(periodDays) {
  const p = periodDays || 14;
  const day = function (offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return Utilities.formatDate(d, 'Europe/Moscow', 'yyyy-MM-dd') + 'T00:00:00+03:00';
  };
  return { from: day(-p + 1), to: day(1), period: p };
}

/** Шапка листа «Факт Ozon» (24 колонки, A..X). */
function factHeaders_() {
  return [
    'Offer id', 'Цена с акцией, ₽', 'Цена без акции, ₽', 'Зачёркнутая цена, ₽',
    'Ограничение для акций, ₽', 'НДС, %', 'Комиссия FBO, %', 'Комиссия FBS, %',
    'Логистика FBO мин', 'Логистика FBO макс', 'Доставка FBO',
    'Обработка FBS мин', 'Обработка FBS макс', 'Логистика FBS мин', 'Логистика FBS макс', 'Доставка FBS',
    'Эквайринг, ₽', 'Остаток Ozon', 'Остаток свои', 'Дата среза',
    'Возврат FBO, ₽', 'Возврат FBS, ₽',
    'Комиссия FBO к расчёту, %', 'Комиссия FBS к расчёту, %'
  ];
}

// ============================================================
// ОСНОВНАЯ СИНХРОНИЗАЦИЯ: ЦЕНЫ, КОМИССИИ, ЛОГИСТИКА, ОСТАТКИ
// ============================================================

/**
 * Читает существующее значение B14 «Скидка к комиссии Ozon, п.п.».
 * Это настройка расчёта, а не подтверждённый замер: аудит 18 строк не выявил
 * отдельной скидки. Здесь значение не меняется; отчёт может обновить его только
 * при достаточной выборке и прошедшем контроле начисления.
 */
function ensureParams_() {
  const def = CFG.COMMISSION_DISCOUNT_DEFAULT;
  const par = ss_().getSheetByName('Параметры');
  if (!par) { logMsg_('WARN', 'Лист «Параметры» не найден — беру скидку к комиссии по умолчанию ' + def); return def; }

  const last = par.getLastRow();
  let row = -1;
  if (last >= 1) {
    const col = par.getRange(1, 1, last, 1).getValues();
    for (let i = 0; i < col.length; i++) {
      if (/скидка к комиссии/i.test(String(col[i][0] || ''))) { row = i + 1; break; }
    }
  }
  if (row < 0) {
    row = last + 1;
    par.getRange(row, 1, 1, 3).setValues([[
      'Скидка к комиссии Ozon (отсрочка выплаты), п.п.', def,
      'Текущая настройка, не подтверждённая сырым аудитом. Комиссионная ставка ' +
      'в отчёте считается как standard_fee / (seller_price_per_instance × quantity). ' +
      'B14 меняется только при достаточной выборке и прошедшей сверке начисления.'
    ]]);
    par.getRange(row, 2).setNumberFormat('0.0');
    logMsg_('INFO', '«Параметры»: добавлена строка «Скидка к комиссии Ozon» = ' + def +
      ' п.п. — проверьте её меню «Проверить комиссию по отчёту о реализации».');
  }
  const v = Number(par.getRange(row, 2).getValue());
  return isNaN(v) ? 0 : v;
}

/** Копирует формулу ленд-коста (колонка I) в новые строки «Номенклатуры». */
function copyLandCostFormula_(nom, sampleRow, count) {
  try {
    const tmpl = String(nom.getRange(sampleRow, 9).getFormula() || '');
    if (tmpl.charAt(0) !== '=' || tmpl.indexOf('!') >= 0 || count < 1) return 0;
    const fs = [];
    for (let k = 0; k < count; k++) {
      const nr = sampleRow + 1 + k;
      fs.push([tmpl.replace(/(\$?)([A-Z]{1,2})(\$?)(\d+)/g, function (m, d1, col, d2, rowNum) {
        return d1 + col + d2 + (d2 === '$' ? rowNum : String(nr));
      })]);
    }
    nom.getRange(sampleRow + 1, 9, count, 1).setFormulas(fs);
    return count;
  } catch (e) {
    logMsg_('WARN', 'Не удалось скопировать формулу ленд-коста: ' + e.message);
    return 0;
  }
}

/**
 * Дописывает строки в лист «Проблемы данных», не создавая дублей
 * (дубль = тот же Offer id + та же причина).
 */
function addProblems_(items) {
  if (!items || !items.length) return 0;
  try {
    const sh = sheet_(CFG.SHEETS.PROBLEMS, ['Offer id', 'Наименование', 'Что не хватает', 'Что делать']);
    const last = sh.getLastRow();
    const seen = {};
    if (last >= 2) {
      sh.getRange(2, 1, last - 1, 3).getValues().forEach(function (r) {
        seen[String(r[0] || '') + '||' + String(r[2] || '')] = true;
      });
    }
    const rows = [];
    items.forEach(function (it) {
      if (seen[it.offer + '||' + it.what]) return;
      rows.push([it.offer, it.name || '', it.what, it.todo || '']);
    });
    if (!rows.length) return 0;
    const need = last + rows.length;
    if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    sh.getRange(last + 1, 1, rows.length, 4).setValues(rows);
    return rows.length;
  } catch (e) {
    logMsg_('WARN', '«Проблемы данных»: не удалось дописать строки — ' + e.message);
    return 0;
  }
}

/**
 * Главная синхронизация.
 *
 * Что делает (v0.6):
 *  1. читает «Номенклатуру» и список товаров магазина;
 *  2. НОВЫЕ карточки магазина автоматически дописывает в «Номенклатуру»
 *     (с пометкой, что по ним нет данных 1С — себестоимости пока нет);
 *  3. тянет по всем артикулам цены, комиссии, логистику, возвраты, эквайринг,
 *     остатки → лист «Факт Ozon» (24 колонки);
 *  4. считает комиссию «к расчёту» = списочная ставка минус скидка за отсрочку
 *     выплаты (колонки W/X);
 *  5. проставляет в «Номенклатуре» колонку Q «Синк с Ozon» — чем артикул проблемный;
 *  6. дописывает причины в «Проблемы данных».
 */
function syncFact() {
  const t0 = Date.now();
  try {
    const nom = sheet_(CFG.SHEETS.NOM);
    const lastRow = nom.getLastRow();
    if (lastRow < 2) throw new Error('Лист «Номенклатура» пуст — сначала залейте реестр SKU.');

    // ---- база: артикул + номер строки + есть ли себестоимость ----
    const nomVals = nom.getRange(2, 1, lastRow - 1, CFG.NOM_COLS).getValues();
    const offers = [], offerRow = [], noCost = {};
    nomVals.forEach(function (r, idx) {
      const o = String(r[0] === undefined || r[0] === null ? '' : r[0]).trim();
      if (!o) return;
      offers.push(o);
      offerRow.push(idx + 2);
      const ss = r[CFG.NOM_COL_SS - 1];
      if (ss === '' || ss === null || ss === undefined || Number(ss) === 0) noCost[o] = true;
    });
    const known = {};
    offers.forEach(function (o) { known[o] = true; });

    // ---- магазин: что реально есть в Ozon ----
    let store = [];
    const storeById = {};
    try {
      store = productListAll_();
      store.forEach(function (it) { storeById[String(it.offer_id)] = it; });
    } catch (e) {
      logMsg_('WARN', 'Список товаров магазина не получен (' + e.message + ') — продолжаю по базе.');
    }

    // ---- новые карточки магазина → дописываем в «Номенклатуру» ----
    const isNew = {};
    const missingInBase = store.filter(function (it) { return !known[String(it.offer_id)]; })
      .map(function (it) { return String(it.offer_id); });
    let newRowStart = 0;
    if (CFG.AUTO_ADD_MISSING && missingInBase.length) {
      newRowStart = lastRow + 1;
      const stubs = missingInBase.map(function (oid) {
        const r = [];
        for (let c = 0; c < CFG.NOM_COLS; c++) r.push('');
        r[0] = oid;
        r[14] = 'Новый из API';
        r[CFG.NOM_COL_SYNC - 1] = 'новый из Ozon — нет данных 1С';
        return r;
      });
      const needRows = lastRow + stubs.length;
      if (nom.getMaxRows() < needRows) nom.insertRowsAfter(nom.getMaxRows(), needRows - nom.getMaxRows());
      nom.getRange(newRowStart, 1, stubs.length, CFG.NOM_COLS).setValues(stubs);
      missingInBase.forEach(function (oid, k) {
        offers.push(oid);
        offerRow.push(newRowStart + k);
        known[oid] = true;
        isNew[oid] = true;
        noCost[oid] = true;
      });
      logMsg_('INFO', 'Номенклатура: добавлено новых карточек из Ozon — ' + stubs.length +
        ' (строки ' + newRowStart + '–' + (newRowStart + stubs.length - 1) +
        '). Помечены в колонке Q: по ним нет себестоимости, в расчёт не идут.');
    }

    const sample = { done: false };
    logMsg_('INFO', 'Синхронизация: SKU к обработке — ' + offers.length +
      ' (в базе было ' + (offers.length - missingInBase.length) + ', добавлено ' + missingInBase.length + ')');

    const info   = productInfoMap_(offers);
    const prices = pricesMap_(offers, sample);
    const stocks = stocksMap_(offers, sample);
    const commDisc = ensureParams_();

    fillNomSku_(nom, info);
    fillNomCategory_(nom, info);

    // ---- дозаполняем новые строки: SKU, название, остаток, схема, категория ----
    if (newRowStart) {
      const filledRows = missingInBase.map(function (oid) {
        const it = info[oid] || {};
        const st = stocks[oid] || { fbo: 0, fbs: 0 };
        const r = [];
        for (let c = 0; c < CFG.NOM_COLS; c++) r.push('');
        r[0]  = oid;
        r[1]  = it.sku ? (isNaN(Number(it.sku)) ? it.sku : Number(it.sku)) : '';
        r[2]  = it.name || '';
        r[11] = st.fbo;
        r[13] = st.fbo > 0 ? 'FBO' : (st.fbs > 0 ? 'FBS' : '');
        r[14] = 'Новый из API';
        r[CFG.NOM_COL_CAT - 1] = it.category_id ? (isNaN(Number(it.category_id)) ? it.category_id : Number(it.category_id)) : '';
        r[CFG.NOM_COL_SYNC - 1] = 'новый из Ozon — нет данных 1С';
        return r;
      });
      nom.getRange(newRowStart, 1, filledRows.length, CFG.NOM_COLS).setValues(filledRows);
      const got = copyLandCostFormula_(nom, lastRow, filledRows.length);
      const withSku = filledRows.filter(function (r) { return r[1] !== ''; }).length;
      logMsg_('INFO', 'Новые строки заполнены: SKU получен у ' + withSku + ' из ' + filledRows.length +
        ', формула ленд-коста скопирована в ' + got + ' строк.');
    }

    // ---- лист «Факт Ozon» ----
    const fact = sheet_(CFG.SHEETS.FACT, factHeaders_());
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');
    const numOr = function (v) { return (v === undefined || v === null) ? '' : Number(v); };
    const withDiscount = function (v) {
      return (v === '' || isNaN(Number(v))) ? '' : Math.round((Number(v) - commDisc) * 100) / 100;
    };
    let noCm = 0, noLog = 0, acqApi = 0, acqCalc = 0;

    const rows = offers.map(function (oid) {
      const p  = prices[oid] || {};
      const pr = p.price || {};
      const cm = p.commissions || {};
      const st = stocks[oid] || { fbo: 0, fbs: 0 };

      const price  = Number(pr.price || 0);
      const mprice = Number(pr.marketing_seller_price || 0);

      // НДС: API отдаёт долю (0.22) — приводим к процентам
      const vatRaw = Number(pr.vat);
      const vatPct = (isNaN(vatRaw) || vatRaw === 0) ? '' : (vatRaw <= 1 ? Math.round(vatRaw * 10000) / 100 : vatRaw);

      // Эквайринг: точное значение из API, иначе оценка 1,5%.
      // ВАЖНО: acquiring лежит В КОРНЕ элемента ответа, а не внутри price (баг v0.4).
      const acqA = Number(p.acquiring || pr.acquiring || 0);
      let acq;
      if (acqA > 0) { acq = acqA; acqApi++; }
      else { acq = Math.round(price * 0.015 * 100) / 100; acqCalc++; }

      if (cm.sales_percent_fbo === undefined) noCm++;
      if (cm.fbo_direct_flow_trans_min_amount === undefined || cm.fbo_direct_flow_trans_min_amount === null) noLog++;

      const cmFbo = numOr(cm.sales_percent_fbo);
      const cmFbs = numOr(cm.sales_percent_fbs);

      // A..X = 24 колонки. I–P: логистика FBO/FBS, U/V: возвраты, W/X: комиссия к расчёту.
      const row = [
        oid,                                          // A: Offer id
        mprice > 0 ? mprice : price,                  // B: цена с акцией (marketing_seller_price)
        price,                                        // C: цена без акции
        Number(pr.old_price || 0),                    // D: зачёркнутая
        Number(pr.min_price || 0),                    // E: ограничение для акций
        vatPct,                                       // F: НДС, %
        cmFbo,                                        // G: комиссия FBO, % (списочная)
        cmFbs,                                        // H: комиссия FBS, % (списочная)
        numOr(cm.fbo_direct_flow_trans_min_amount),   // I: логистика FBO мин
        numOr(cm.fbo_direct_flow_trans_max_amount),   // J: логистика FBO макс
        numOr(cm.fbo_deliv_to_customer_amount),       // K: доставка FBO
        numOr(cm.fbs_first_mile_min_amount),          // L: обработка FBS мин
        numOr(cm.fbs_first_mile_max_amount),          // M: обработка FBS макс
        numOr(cm.fbs_direct_flow_trans_min_amount),   // N: логистика FBS мин
        numOr(cm.fbs_direct_flow_trans_max_amount),   // O: логистика FBS макс
        numOr(cm.fbs_deliv_to_customer_amount),       // P: доставка FBS
        acq,                                          // Q: эквайринг, ₽
        st.fbo,                                       // R: остаток FBO
        st.fbs,                                       // S: остаток FBS
        today,                                        // T: дата среза
        numOr(cm.fbo_return_flow_amount),             // U: возврат FBO, ₽
        numOr(cm.fbs_return_flow_amount),             // V: возврат FBS, ₽
        withDiscount(cmFbo),                          // W: комиссия FBO к расчёту, %
        withDiscount(cmFbs)                           // X: комиссия FBS к расчёту, %
      ];
      while (row.length < CFG.FACT_COLS) row.push(''); // страховка от рассинхрона
      return row;
    });

    const need = rows.length + 1;
    if (fact.getMaxRows() < need) fact.insertRowsAfter(fact.getMaxRows(), need - fact.getMaxRows());

    fact.getRange(2, 1, fact.getMaxRows() - 1, CFG.FACT_COLS).clearContent();
    fact.getRange(2, 1, rows.length, CFG.FACT_COLS).setValues(rows);
    fact.getRange(2, 2, rows.length, CFG.FACT_COLS - 1).setNumberFormat('#,##0.00');

    // ---- колонка Q «Синк с Ozon»: чем артикул проблемный ----
    const missingInStore = [];
    const flagByRow = {};
    offers.forEach(function (oid, i) {
      let f = '';
      if (isNew[oid]) f = 'новый из Ozon — нет данных 1С';
      else if (store.length && !storeById[oid]) { f = 'нет в магазине Ozon'; missingInStore.push(oid); }
      else if (!prices[oid]) f = 'нет карточки/цен в Ozon';
      else if (noCost[oid]) f = 'нет себестоимости (1С)';
      if (f) flagByRow[offerRow[i]] = f;
    });

    const nomLast = nom.getLastRow();
    if (nom.getRange(1, CFG.NOM_COL_SYNC).getValue() === '') {
      nom.getRange(1, CFG.NOM_COL_SYNC).setValue('Синк с Ozon').setFontWeight('bold');
    }
    const qCol = [];
    for (let r = 2; r <= nomLast; r++) qCol.push([flagByRow[r] || '']);
    nom.getRange(2, CFG.NOM_COL_SYNC, qCol.length, 1).setValues(qCol);

    // ---- «Проблемы данных»: дописываем причины (без дублей) ----
    const problems = [];
    offers.forEach(function (oid) {
      if (isNew[oid]) {
        problems.push({ offer: oid, name: (info[oid] || {}).name || '',
          what: 'нет в 1С: карточка добавлена из Ozon',
          todo: 'Завести в 1С (МСК): себестоимость, кратность, упаковку — без этого SKU не участвует в расчёте' });
      } else if (store.length && !storeById[oid]) {
        problems.push({ offer: oid, name: (info[oid] || {}).name || '',
          what: 'нет в магазине Ozon',
          todo: 'Проверить Offer id: товар удалён или в архиве — исключить из расчёта либо вернуть в продажу' });
      }
    });
    // ---- дубли Offer id: строка в базе должна быть одна на артикул ----
    const seenCnt = {}, dups = [];
    offers.forEach(function (o) {
      if (seenCnt[o]) { if (seenCnt[o] === 1) dups.push(o); seenCnt[o]++; }
      else seenCnt[o] = 1;
    });
    const uniq = offers.length - dups.reduce(function (a, d) { return a + seenCnt[d] - 1; }, 0);
    if (dups.length) {
      logMsg_('WARN', '«Номенклатура»: дублей Offer id — ' + dups.length + ' (строк ' + offers.length +
        ', уникальных артикулов ' + uniq + '): ' + dups.slice(0, 10).join(', ') +
        (dups.length > 10 ? ' …' : '') + '. Дубль попадает в расчёт дважды — лишнюю строку надо удалить.');
      dups.forEach(function (d) {
        problems.push({ offer: d, name: (info[d] || {}).name || '',
          what: 'дубль Offer id в «Номенклатуре» (' + seenCnt[d] + ' строк)',
          todo: 'Оставить одну строку (ту, где заполнена себестоимость), остальные удалить' });
      });
    } else {
      logMsg_('DEBUG', '«Номенклатура»: дублей Offer id нет, уникальных артикулов ' + uniq);
    }

    const addedProblems = addProblems_(problems);

    logMsg_('INFO', 'Синхронизация завершена за ' + Math.round((Date.now() - t0) / 1000) + ' с. ' +
      'Цен: ' + Object.keys(prices).length + ', остатков: ' + Object.keys(stocks).length +
      ', колонок: ' + CFG.FACT_COLS + '. Логистика: без данных ' + noLog + ' SKU. ' +
      'Комиссии: без данных ' + noCm + ' SKU, скидка к комиссии ' + commDisc + ' п.п. ' +
      'Эквайринг: из API ' + acqApi + ', оценкой 1,5% — ' + acqCalc + '.');

    if (store.length) {
      logMsg_('INFO', 'Сверка с магазином: в магазине ' + store.length + ', в базе теперь ' + offers.length +
        '. Добавлено новых: ' + missingInBase.length +
        (missingInBase.length ? ' → ' + missingInBase.slice(0, 10).join(', ') +
          (missingInBase.length > 10 ? ' …' : '') : '') +
        '. Есть в базе, но нет в магазине: ' + missingInStore.length +
        (missingInStore.length ? ' → ' + missingInStore.slice(0, 10).join(', ') : '') +
        '. Проблемных артикулов помечено в колонке Q: ' + Object.keys(flagByRow).length +
        (addedProblems ? ', в «Проблемы данных» дописано строк: ' + addedProblems : '') +
        (dups.length ? '. ВНИМАНИЕ: дублей Offer id — ' + dups.length : '') + '.');
    }
    recalc_();
    return { ok: true, rows: rows.length, cols: CFG.FACT_COLS,
             store: store.length, added: missingInBase.length,
             missingInStore: missingInStore.length,
             flagged: Object.keys(flagByRow).length,
             uniqueOffers: uniq, duplicates: dups.length,
             commissionDiscount: commDisc,
             acquiringFromApi: acqApi,
             seconds: Math.round((Date.now() - t0) / 1000) };
  } catch (e) {
    logMsg_('ERROR', 'syncFact: ' + e.message);
    throw e;
  }
}

// ============================================================
// АКЦИИ
// ============================================================

function syncActions() {
  try {
    const list = actionsList_();
    logMsg_('INFO', 'Акции: найдено в кабинете — ' + list.length);

    // Карта product_id → offer_id: API по акциям отдаёт внутренний id товара,
    // а модель работает по Offer id (нашему артикулу).
    const idMap = {};
    try {
      productListAll_().forEach(function (it) { idMap[String(it.product_id)] = it.offer_id; });
      logMsg_('INFO', 'Акции: карта сопоставления товаров — ' + Object.keys(idMap).length);
    } catch (e) {
      logMsg_('WARN', 'Акции: не удалось построить карту товаров: ' + e.message);
    }

    const headers = actHeaders_();
    const sh = sheet_(CFG.SHEETS.ACT, headers);
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');

    const out = [];
    const cap = 30;
    const slice = list.slice(0, cap);
    if (list.length > cap) logMsg_('WARN', 'Акции: обработаны первые ' + cap + ' из ' + list.length + ' (берегу лимиты API)');

    slice.forEach(function (a) {
      const id = a.id || a.action_id;
      const title = a.title || a.name || '';
      const dateEnd = a.date_end || a.dateEnd || '';
      try {
        const products = actionProducts_(id);
        let mapped = 0;
        products.forEach(function (p) {
          const pid = String(p.id || p.product_id || '');
          const offer = p.offer_id || idMap[pid] || '';
          if (offer) mapped++;
          const row = [
            id, title, offer, pid,
            Number(p.price || 0),
            Number(p.action_price || 0),
            Number(p.max_action_price || 0),
            Number(p.min_stock || p.min_action_quantity || 0),
            Number(p.stock || 0),
            p.add_mode || '',
            today
          ];
          while (row.length < headers.length) row.push('');
          out.push(row);
        });
        logMsg_('INFO', 'Акция ' + id + ' («' + title + '»' + (dateEnd ? ', до ' + dateEnd : '') + '): товаров ' +
          products.length + ', сопоставлено с нашим артикулом — ' + mapped);
      } catch (e) {
        logMsg_('WARN', 'Акция ' + id + ' («' + title + '»): ' + e.message);
      }
      Utilities.sleep(CFG.PAUSE_MS);
    });

    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), headers.length).clearContent();
    if (out.length) sh.getRange(2, 1, out.length, headers.length).setValues(out);
    logMsg_('INFO', 'Акции: строк по товарам — ' + out.length);
    return { ok: true, actions: list.length, rows: out.length };
  } catch (e) {
    logMsg_('ERROR', 'syncActions: ' + e.message);
    throw e;
  }
}

/**
 * Дозаполняет колонку B «Номенклатуры» (SKU товара в Ozon) там, где пусто.
 * SKU — это ключ, по которому к артикулу подтягиваются реклама (Performance)
 * и аналитика продаж (/v1/analytics/data). Существующие значения не трогаем.
 */
function fillNomSku_(nom, info) {
  try {
    const n = nom.getLastRow() - 1;
    if (n < 1) return;
    const ab = nom.getRange(2, 1, n, 2).getValues();

    let filled = 0, haveSku = 0;
    const col = ab.map(function (r) {
      const oid = String(r[0] === undefined || r[0] === null ? '' : r[0]).trim();
      const cur = (r[1] === undefined || r[1] === null) ? '' : r[1];
      if (String(cur).trim() !== '') { haveSku++; return [cur]; }
      const sk = (info[oid] || {}).sku || '';
      if (!sk) return [cur];
      filled++; haveSku++;
      return [isNaN(Number(sk)) ? sk : Number(sk)];
    });

    if (!filled) {
      logMsg_('INFO', 'Номенклатура: SKU заполнен у ' + haveSku + ' из ' + n +
        ' — новых значений из API не потребовалось.');
      return;
    }
    const formulas = nom.getRange(2, 2, n, 1).getFormulas();
    const hasFormula = formulas.some(function (r) { return String(r[0] || '') !== ''; });
    if (hasFormula) {
      logMsg_('WARN', 'Номенклатура: в колонке SKU есть формулы — перезапись пропущена (' +
        filled + ' пустых ячеек)');
      return;
    }
    nom.getRange(2, 2, n, 1).setValues(col);
    logMsg_('INFO', 'Номенклатура: дозаполнено SKU из API — ' + filled + ' (всего с SKU: ' +
      haveSku + ' из ' + n + ')');
  } catch (e) {
    logMsg_('WARN', 'Номенклатура: не удалось дозаполнить SKU — ' + e.message);
  }
}

/**
 * Дозаполняет пустую колонку P «Номенклатуры» (Категория, CFG.NOM_COL_CAT) значением
 * category_id / description_category_id из Ozon без перезаписи существующих значений.
 */
function fillNomCategory_(nom, info) {
  try {
    const colIdx = CFG.NOM_COL_CAT || 16;
    if (nom.getMaxColumns() < colIdx) return;
    const n = nom.getLastRow() - 1;
    if (n < 1) return;
    const offers = nom.getRange(2, 1, n, 3).getValues();
    const curCats = nom.getRange(2, colIdx, n, 1).getValues();

    let filled = 0, haveCat = 0;
    const col = offers.map(function (r, idx) {
      const oid = String(r[0] === undefined || r[0] === null ? '' : r[0]).trim();
      const name = String(r[2] === undefined || r[2] === null ? '' : r[2]).trim();
      const cur = (curCats[idx] && curCats[idx][0] !== undefined && curCats[idx][0] !== null)
        ? curCats[idx][0]
        : '';
      if (String(cur).trim() !== '') { haveCat++; return [cur]; }
      const cat = (info[oid] || {}).category_id;
      const fallbackGrp = typeof inferProductGroup_ === 'function' ? inferProductGroup_(oid, name || (info[oid] || {}).name || '') : '';
      const resolved = (cat !== undefined && cat !== null && String(cat).trim() !== '') ? cat : fallbackGrp;
      if (resolved === undefined || resolved === null || String(resolved).trim() === '') return [cur];
      filled++; haveCat++;
      return [isNaN(Number(resolved)) ? String(resolved).trim() : Number(resolved)];
    });

    if (!filled) return;

    const formulas = nom.getRange(2, colIdx, n, 1).getFormulas();
    const hasFormula = formulas.some(function (r) { return String(r[0] || '') !== ''; });
    if (hasFormula) {
      logMsg_('WARN', 'Номенклатура: в колонке P (Категория) есть формулы — перезапись пропущена (' +
        filled + ' пустых ячеек)');
      return;
    }
    nom.getRange(2, colIdx, n, 1).setValues(col);
    logMsg_('INFO', 'Номенклатура: дозаполнено категорий (P) — ' + filled +
      ' (всего с категорией: ' + haveCat + ' из ' + n + ')');
  } catch (e) {
    logMsg_('WARN', 'Номенклатура: не удалось дозаполнить категорию (P) — ' + e.message);
  }
}

function actHeaders_() {
  return CFG.ACT_HEADERS || [
    'Акция (ID)', 'Название акции', 'Offer id', 'Product id', 'Цена до акции, ₽',
    'Цена акции, ₽', 'Макс. допустимая цена, ₽', 'Мин. кол-во', 'В акции, шт',
    'Способ', 'Дата среза',
    'Наш мин. пол, ₽', 'Запас к лимиту Ozon, ₽', 'Наценка по цене акции, %', 'Статус ограничения'
  ];
}

/**
 * Добавляет в «Номенклатуру» товары, которые есть в магазине Ozon,
 * но которых нет в нашей базе (по итогам прогона №3 — 202 штуки).
 * Существующие строки НЕ меняются, только дописываются в конец:
 * Offer id, SKU, название, остатки, схема (FBO/FBS) и статус-пометка.
 * Себестоимость, кратность и упаковку по ним нужно завести вручную —
 * без этого строка попадёт в «Проблемы данных» и в расчёт не пойдёт.
 */
function addMissingSkus() {
  const t0 = Date.now();
  try {
    const nom = sheet_(CFG.SHEETS.NOM);
    const last = nom.getLastRow();
    if (last < 2) throw new Error('Лист «Номенклатура» пуст — некуда добавлять.');

    const base = {};
    nom.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) {
      const o = String(r[0] || '').trim();
      if (o) base[o] = true;
    });

    const store = productListAll_();
    const missing = store.filter(function (it) { return !base[String(it.offer_id)]; });
    if (!missing.length) {
      logMsg_('INFO', 'Новых SKU нет: база «Номенклатуры» покрывает весь магазин (' +
        store.length + ' товаров)');
      return { ok: true, added: 0, store: store.length };
    }
    logMsg_('INFO', 'Добавление SKU: в магазине ' + store.length + ', в базе ' +
      Object.keys(base).length + ', добавить надо ' + missing.length);

    const offers = missing.map(function (it) { return String(it.offer_id); });
    const info = productInfoMap_(offers);
    const stocks = stocksMap_(offers, { done: false });
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');

    const rows = offers.map(function (oid) {
      const it = info[oid] || {};
      const st = stocks[oid] || { fbo: 0, fbs: 0 };
      const row = [];
      for (let c = 0; c < CFG.NOM_COLS; c++) row.push('');
      row[0]  = oid;                                        // A Offer id
      row[1]  = it.sku ? (isNaN(Number(it.sku)) ? it.sku : Number(it.sku)) : ''; // B SKU
      row[2]  = it.name || '';                              // C Наименование
      row[11] = st.fbo;                                     // L Остаток Ozon (FBO)
      row[13] = st.fbo > 0 ? 'FBO' : (st.fbs > 0 ? 'FBS' : '');  // N Схема
      row[14] = 'Новый из API — нет в 1С';                  // O Статус
      row[CFG.NOM_COL_CAT - 1] = it.category_id ? (isNaN(Number(it.category_id)) ? it.category_id : Number(it.category_id)) : ''; // P Категория
      row[CFG.NOM_COL_SYNC - 1] = 'новый из Ozon — нет данных 1С'; // Q Синк с Ozon
      return row;
    });

    const need = last + rows.length;
    if (nom.getMaxRows() < need) nom.insertRowsAfter(nom.getMaxRows(), need - nom.getMaxRows());
    nom.getRange(last + 1, 1, rows.length, CFG.NOM_COLS).setValues(rows);

    // формулу ленд-коста (колонка I) копируем с последней строки, если она там есть
    copyLandCostFormula_(nom, last, rows.length);

    const withSku = rows.filter(function (r) { return r[1] !== ''; }).length;
    logMsg_('INFO', 'Добавлено строк в «Номенклатуру»: ' + rows.length +
      ' (SKU получен у ' + withSku + '). Заполните себестоимость, кратность и упаковку — ' +
      'без них строки не участвуют в расчёте. Время ' + Math.round((Date.now() - t0) / 1000) + ' с.');
    recalc_();
    return { ok: true, added: rows.length, withSku: withSku, store: store.length,
             seconds: Math.round((Date.now() - t0) / 1000) };
  } catch (e) {
    logMsg_('ERROR', 'addMissingSkus: ' + e.message);
    throw e;
  }
}

// ============================================================
// ПРОДАЖИ ПО SKU (Seller API, /v1/analytics/data)
// ============================================================

/** Шапка листа «Продажи» (9 колонок, A..I). */
/**
 * Шапка листа «Продажи» (13 колонок, A..M).
 * A..I — как раньше (salesRevenueMap_ читает SKU из B, выручку из D, период из H).
 * J..M — добавлены в v0.7: с подпиской Premium Plus /v1/analytics/data отдаёт
 * delivered_units, returns и cancellations, из которых считается РЕАЛЬНЫЙ % выкупа
 * по каждому SKU (владельцу нужно среднее фактическое значение, а не параметр «на глаз»).
 */
function salesHeaders_() {
  return ['Offer id', 'SKU', 'Название товара', 'Выручка, ₽', 'Заказано, шт',
          'Расход на рекламу, ₽', 'ДРР, %', 'Период', 'Дата среза',
          'Доставлено, шт', 'Возвраты, шт', 'Отмены, шт', '% выкупа'];
}

/** Карта SKU → Offer id по «Номенклатуре» (колонка B → колонка A). */
function nomSkuMap_() {
  const map = {};
  const nom = ss_().getSheetByName(CFG.SHEETS.NOM);
  if (!nom || nom.getLastRow() < 2) return map;
  nom.getRange(2, 1, nom.getLastRow() - 1, 2).getValues().forEach(function (r) {
    const oid = String(r[0] || '').trim();
    let sku = String(r[1] === undefined || r[1] === null ? '' : r[1]).trim();
    sku = sku.replace(/\.0+$/, '');
    if (oid && sku) map[sku] = oid;
  });
  return map;
}

/**
 * Продажи по SKU за период: выручка и заказы (доступно всем); с подпиской
 * Premium Plus дополнительно доставлено / возвраты / отмены → реальный % выкупа
 * по каждому SKU (колонки J..M листа «Продажи»).
 * Выручка нужна как знаменатель ДРР: расход на рекламу / ВСЯ выручка товара.
 * Расходов на рекламу этот метод НЕ отдаёт ни с какой подпиской — они приходят
 * из Performance API в меню «Синхронизировать рекламу (ДРР)».
 */
function syncSales(days) {
  const t0 = Date.now();
  try {
    const periodDays = days || 14;
    const rng = mskRange_(periodDays);
    // ВАЖНО: /v1/analytics/data отвергает date_to в будущем
    // («date_to must not be greater than current date»), поэтому конец периода — сегодня.
    const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const from = rng.from.slice(0, 10);
    const to = rng.to.slice(0, 10) > todayStr ? todayStr : rng.to.slice(0, 10);
    const label = from + ' — ' + to;
    const skuMap = nomSkuMap_();
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');

    // Метрики: всем доступны revenue и ordered_units; с Premium Plus — ещё
    // delivered_units, returns, cancellations. Расходов на рекламу в этом методе
    // НЕТ вообще (adv_sum_all в официальной схеме Ozon не существует) — рекламу
    // берём из Performance API, колонки F/G заполняет «Синхронизировать рекламу (ДРР)».
    let premium = false, raw = [];
    if (CFG.HAS_PREMIUM_PLUS) {
      try {
        raw = analyticsAll_(CFG.SALES_METRICS_PREMIUM, ['sku'], from, to);
        premium = true;
      } catch (e1) {
        logMsg_('WARN', 'Продажи: Premium-метрики не прошли — ' + String(e1.message).slice(0, 220));
      }
    }
    if (!raw.length) {
      try {
        raw = analyticsAll_(CFG.SALES_METRICS_BASE, ['sku'], from, to);
      } catch (e2) {
        throw new Error('/v1/analytics/data недоступен: ' + String(e2.message).slice(0, 300));
      }
      if (premium) logMsg_('WARN', 'Продажи: продолжаю без Premium-метрик — % выкупа не будет.');
      premium = false;
    }

    const rows = [];
    let sumRev = 0, sumUnits = 0, sumDeliv = 0, sumRet = 0, sumCancel = 0, noOffer = 0;
    // Ozon может вернуть delivered_units нулями, даже если метрика формально доступна.
    // Нуль вместо «нет данных» — это ложь (% выкупа 0%), поэтому проверяем отдельно.
    let delivOk = premium && raw.some(function (r) { return (Number((r.metrics || [])[2]) || 0) > 0; });
    if (premium && !delivOk) {
      logMsg_('WARN', 'Продажи: delivered_units пришёл нулями по всем SKU — % выкупа не считаю, ' +
        'колонки J..M оставлены как есть по возвратам/отменам. Проверьте права ключа ' +
        '(меню «Проверить права API-ключа») и доступность Premium Plus.');
    }
    raw.forEach(function (r) {
      const sku = String(r.id || '').replace(/\.0+$/, '');
      const m = r.metrics || [];
      const rev = Number(m[0]) || 0;
      const units = Number(m[1]) || 0;
      const deliv = premium ? (Number(m[2]) || 0) : '';
      const ret = premium ? (Number(m[3]) || 0) : '';
      const canc = premium ? (Number(m[4]) || 0) : '';
      const offer = skuMap[sku] || '';
      if (!offer) noOffer++;
      sumRev += rev; sumUnits += units;
      if (premium) { sumDeliv += Number(deliv); sumRet += Number(ret); sumCancel += Number(canc); }
      // % выкупа = доставлено / заказано. Именно его владелец просил брать средним по SKU.
      const buyout = (premium && delivOk && units > 0 && Number(deliv) > 0)
        ? Math.round(Number(deliv) / units * 10000) / 100 : '';
      rows.push([
        offer, sku, r.name || '',
        Math.round(rev * 100) / 100, units,
        '', '',                       // F/G — расход на рекламу и ДРР, заполняет syncDrr
        label, today,
        deliv, ret, canc, buyout
      ]);
    });

    rows.sort(function (a, b) { return Number(b[3]) - Number(a[3]); });

    const sh = sheet_(CFG.SHEETS.SALES, salesHeaders_());
    const need = rows.length + 1;
    if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), CFG.SALES_COLS).clearContent();
    if (rows.length) {
      sh.getRange(2, 1, rows.length, CFG.SALES_COLS).setValues(rows);
      sh.getRange(2, 4, rows.length, 1).setNumberFormat('#,##0.00');
      sh.getRange(2, 6, rows.length, 2).setNumberFormat('#,##0.00');
      sh.getRange(2, 13, rows.length, 1).setNumberFormat('0.00');
    }
    sh.getRange(1, 15, 8, 2).setValues([
      ['Выручка всего, ₽', Math.round(sumRev * 100) / 100],
      ['Заказано, шт', sumUnits],
      ['Доставлено, шт', premium ? sumDeliv : 'нет Premium-метрик'],
      ['Возвраты, шт', premium ? sumRet : ''],
      ['Отмены, шт', premium ? sumCancel : ''],
      ['% выкупа (всего)', (premium && delivOk && sumUnits) ? Math.round(sumDeliv / sumUnits * 10000) / 100 : 'нет данных'],
      ['Период', label],
      ['Обновлено', today]
    ]).setFontWeight('bold');

    logMsg_('INFO', 'Продажи: SKU с данными ' + rows.length + ', выручка ' + Math.round(sumRev) +
      ' ₽, заказано ' + sumUnits + ' шт за ' + label + '. Не нашлось в «Номенклатуре»: ' + noOffer +
      ' SKU. Метрики: ' + (premium ? 'Premium Plus (с доставкой/возвратами/отменами)' : 'базовые') + '.');

    if (premium && delivOk && sumUnits > 0) {
      logMsg_('INFO', 'Продажи: % выкупа в среднем ' + Math.round(sumDeliv / sumUnits * 10000) / 100 +
        '% (доставлено ' + sumDeliv + ' из ' + sumUnits + ' заказанных), возвраты ' + sumRet +
        ' шт, отмены ' + sumCancel + ' шт.');
    }
    if (sumRev > 0) {
      logMsg_('INFO', 'Продажи: выручка сохранена — она будет знаменателем ДРР в меню ' +
        '«Синхронизировать рекламу (ДРР)».');
    }
    recalc_();
    return { ok: true, sku: rows.length, revenue: Math.round(sumRev), units: sumUnits,
             premiumMetrics: premium, delivered: (premium && delivOk) ? sumDeliv : '',
             returns: premium ? sumRet : '', cancellations: premium ? sumCancel : '',
             buyoutPercent: (premium && delivOk && sumUnits) ? Math.round(sumDeliv / sumUnits * 10000) / 100 : '',
             period: label, seconds: Math.round((Date.now() - t0) / 1000) };
  } catch (e) {
    logMsg_('ERROR', 'syncSales: ' + e.message);
    throw e;
  }
}

/** Прочитать выручку по SKU с листа «Продажи» (если он заполнен). */
function salesRevenueMap_() {
  const out = { bySku: {}, total: 0, filled: false, period: '' };
  const sh = ss_().getSheetByName(CFG.SHEETS.SALES);
  if (!sh || sh.getLastRow() < 2) return out;
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, CFG.SALES_COLS).getValues();
  vals.forEach(function (r) {
    const sku = String(r[1] || '').trim();
    const rev = Number(r[3]) || 0;
    if (!sku) return;
    out.bySku[sku] = rev;
    out.total += rev;
    if (!out.period) out.period = String(r[7] || '');
  });
  out.filled = out.total > 0;
  return out;
}

// ============================================================
// РЕКЛАМА / ДРР (Performance API) — расход по каждому SKU
// ============================================================

/** Шапка листа «Реклама ДРР» (14 колонок, A..N). */
function drrHeaders_() {
  return ['Offer id', 'SKU', 'Название товара', 'Расход, ₽',
          'Продажи в продвижении, ₽', 'Выручка SKU (из отчёта), ₽', 'Выручка SKU (аналитика), ₽',
          'ДРР, %', 'Продано, шт', 'Показы', 'Клики', 'Кампаний', 'Период', 'Обновлено'];
}

/** Список в свойствах скрипта, разбитый на куски (лимит значения — 9 КБ). */
function propListGet_(key) {
  const props = PropertiesService.getScriptProperties();
  let out = [];
  for (let i = 0; i < 80; i++) {
    const v = props.getProperty(key + '_' + i);
    if (!v) break;
    out = out.concat(v.split(',').filter(function (x) { return x !== ''; }));
  }
  return out;
}

function propListAppend_(key, items) {
  const cur = propListGet_(key).concat(items);
  const props = PropertiesService.getScriptProperties();
  for (let i = 0; i < 80; i++) props.deleteProperty(key + '_' + i);
  const CH = 600;
  for (let j = 0, k = 0; j < cur.length; j += CH, k++) {
    props.setProperty(key + '_' + k, cur.slice(j, j + CH).join(','));
  }
  return cur.length;
}

function propListReset_(key) {
  const props = PropertiesService.getScriptProperties();
  for (let i = 0; i < 80; i++) props.deleteProperty(key + '_' + i);
}

/** Отличается ли текущая шапка листа от нужной. */
function sheetLayoutDiffers_(name, headers) {
  const sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 1) return true;
  const cur = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  for (let i = 0; i < headers.length; i++) {
    if (String(cur[i] === undefined || cur[i] === null ? '' : cur[i]) !== String(headers[i])) return true;
  }
  return false;
}

/** Прочитать накопленные данные с листа «Реклама ДРР» (чтобы продолжать между запусками). */
function readDrrAgg_() {
  const agg = {};
  const sh = ss_().getSheetByName(CFG.SHEETS.DRR);
  if (!sh || sh.getLastRow() < 2) return agg;
  sh.getRange(2, 1, sh.getLastRow() - 1, CFG.DRR_COLS).getValues().forEach(function (r) {
    const key = String(r[1] || '').trim();
    if (!key) return;
    agg[key] = {
      sku: key,
      offer: String(r[0] || ''),
      name: String(r[2] || ''),
      spend: Number(r[3]) || 0,
      sales: Number(r[4]) || 0,
      salesAll: Number(r[5]) || 0,
      sold: Number(r[8]) || 0,
      views: Number(r[9]) || 0,
      clicks: Number(r[10]) || 0,
      campaigns: Number(r[11]) || 0
    };
  });
  return agg;
}

/** Записать ДРР в «Параметры» (B4 — доля, формат 0.0%) и пояснить источник в C4. */
function writeDrrParam_(value, note) {
  const par = ss_().getSheetByName('Параметры');
  if (!par) { logMsg_('WARN', 'Лист «Параметры» не найден — ДРР некуда записать'); return false; }
  const v = Math.round(value * 10000) / 10000;
  par.getRange(4, 2).setValue(v);
  par.getRange(4, 3).setValue('Факт из API: ' + note);
  logMsg_('INFO', 'ДРР записан в «Параметры»: ' + (v * 100).toFixed(2) + '% (' + note + ')');
  return true;
}

/**
 * Синхронизация рекламы (ДРР).
 *
 * Как устроено (важно для понимания таймингов):
 *  1. берём только те кампании, которые могут дать расходы за период
 *     (активные + завершившиеся не раньше начала периода) — в кабинете их
 *     может быть больше тысячи, а архив нам не нужен;
 *  2. пропускаем кампании, обработанные в прошлые запуски (период тот же);
 *  3. заказываем отчёты по 3 пачки сразу (лимит очереди Ozon) и ждём параллельно;
 *  4. раскладываем расход по SKU и дописываем к уже накопленному на листе;
 *  5. если время подходит к лимиту Apps Script — останавливаемся и просим
 *     запустить ещё раз: продолжим с места остановки.
 */
function syncDrr(days) {
  const t0 = Date.now();
  try {
    const periodDays = days || 14;
    const rng = mskRange_(periodDays);
    const from = rng.from.slice(0, 10), to = rng.to.slice(0, 10);
    const label = from + ' — ' + to;
    const periodKey = from + '|' + to;
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');

    const props = PropertiesService.getScriptProperties();
    const headers = drrHeaders_();
    const layoutChanged = sheetLayoutDiffers_(CFG.SHEETS.DRR, headers);

    // период сменился (или сменилась шапка листа) → начинаем накопление заново
    if (props.getProperty('DRR_PERIOD') !== periodKey || layoutChanged) {
      propListReset_('DRR_DONE');
      props.setProperty('DRR_PERIOD', periodKey);
      const old = ss_().getSheetByName(CFG.SHEETS.DRR);
      if (old && old.getLastRow() > 1) {
        old.getRange(2, 1, old.getLastRow() - 1, Math.max(old.getMaxColumns(), CFG.DRR_COLS)).clearContent();
      }
      logMsg_('INFO', 'ДРР: ' + (layoutChanged ? 'обновлена структура листа' : 'новый период ' + label) +
        ' — накопленные данные очищены');
    }

    const doneSet = {};
    propListGet_('DRR_DONE').forEach(function (x) { doneSet[x] = true; });
    const skuMap = nomSkuMap_();
    const sales = salesRevenueMap_();

    const relevant = perfCampaignsRelevant_(rng.from, rng.to);
    const todo = relevant.filter(function (c) { return !doneSet[String(c.id)]; });
    if (!relevant.length) {
      logMsg_('WARN', 'ДРР: Performance API не вернул ни одной подходящей кампании.');
    }
    logMsg_('INFO', 'ДРР: период ' + label + ', кампаний к опросу ' + todo.length +
      ' (уже обработано раньше: ' + Object.keys(doneSet).length + ')');

    const deadline = t0 + CFG.TIME_GUARD_MS;
    const agg = readDrrAgg_();
    const WAVE = CFG.PERF_QUEUE * CFG.PERF_CHUNK; // 3 отчёта × 10 кампаний = 30 за волну
    let i = 0, waves = 0, campDone = 0, campWithData = 0, campEmpty = 0, campNoRows = 0;

    while (i < todo.length) {
      if (Date.now() > deadline) break;
      const wave = todo.slice(i, i + WAVE);
      i += WAVE;
      waves++;

      const chunks = [];
      for (let j = 0; j < wave.length; j += CFG.PERF_CHUNK) chunks.push(wave.slice(j, j + CFG.PERF_CHUNK));

      let reports = [];
      try {
        reports = perfReportsParallel_(chunks, rng.from, rng.to, deadline);
      } catch (e) {
        logMsg_('ERROR', 'ДРР: волна ' + waves + ' не получена: ' + e.message);
      }

      const titleById = {};
      wave.forEach(function (c) { titleById[String(c.id)] = c.title; });
      let waveSpend = 0, waveFiles = 0, waveData = 0, waveEmpty = 0, waveBad = 0;

      reports.forEach(function (rep) {
        (rep.files || []).forEach(function (f) {
          waveFiles++;
          const parsed = perfParseCsv_(f.csv);
          const cid = parsed.campaignId || perfIdFromFileName_(f.file) || '';
          const title = titleById[cid] || parsed.campaignTitle || f.file || '';

          if (!parsed.header.length) {
            campNoRows++; waveBad++;
            logMsg_('WARN', 'ДРР: кампания ' + (cid || f.file) + ' — заголовок отчёта не распознан. Начало: ' +
              (parsed.raw || f.csv.slice(0, 200).replace(/\r?\n/g, ' | ')));
            return;
          }

          const t = parsed.totals;
          const tr = parsed.totalRow || {};
          const spend = Math.max(t.spend || 0, Number(tr.spend) || 0);
          const salesPromo = Math.max(t.sales || 0, Number(tr.sales) || 0);

          if (spend === 0 && salesPromo === 0 && !parsed.rows.length) {
            campEmpty++; waveEmpty++; // пусто — в лог не пишем, иначе на 1600 кампаний не хватит журнала
          } else {
            campWithData++; waveData++;
            waveSpend += spend;
            logMsg_('DEBUG', 'ДРР: кампания ' + cid + ' («' + title + '»): строк ' + parsed.rows.length +
              ', расход ' + spend.toFixed(2) + ' ₽, продажи в продвижении ' + salesPromo.toFixed(2) + ' ₽');
          }

          // --- раскладываем по SKU ---
          if (parsed.rows.length) {
            parsed.rows.forEach(function (r) {
              const key = String(r.sku || '').trim() || ('КАМПАНИЯ ' + cid);
              const a = agg[key] || { sku: key, offer: '', name: '', spend: 0, sales: 0, salesAll: 0,
                                      sold: 0, views: 0, clicks: 0, campaigns: 0, campIds: {} };
              if (!a.name && r.name) a.name = r.name;
              a.spend += r.spend; a.sales += r.sales; a.sold += r.sold;
              a.views += r.views; a.clicks += r.clicks;
              if (r.drr > 0 && r.spend > 0) a.salesAll += r.spend / (r.drr / 100);
              a.campIds = a.campIds || {};
              if (cid && !a.campIds[cid]) { a.campIds[cid] = true; a.campaigns++; }
              agg[key] = a;
            });
          } else if (spend > 0 || salesPromo > 0) {
            // строк по дням нет, но итог кампании есть — пишем уровнем кампании
            const key = 'КАМПАНИЯ ' + cid;
            const a = agg[key] || { sku: key, offer: '', name: title, spend: 0, sales: 0, salesAll: 0,
                                    sold: 0, views: 0, clicks: 0, campaigns: 0, campIds: {} };
            a.spend += spend; a.sales += salesPromo;
            a.sold += Number(tr.sold) || t.sold || 0;
            a.views += Number(tr.views) || t.views || 0;
            a.clicks += Number(tr.clicks) || t.clicks || 0;
            a.campIds = a.campIds || {};
            if (cid && !a.campIds[cid]) { a.campIds[cid] = true; a.campaigns++; }
            agg[key] = a;
          }
        });
      });

      // обработанными считаем только те кампании, по которым отчёт реально получен;
      // остальные останутся в очереди и будут повторены при следующем запуске
      const newly = [];
      reports.forEach(function (rep) {
        (rep.ids || []).forEach(function (id) {
          id = String(id);
          if (!doneSet[id]) { doneSet[id] = true; newly.push(id); }
        });
      });
      if (newly.length) propListAppend_('DRR_DONE', newly);
      campDone += newly.length;
      logMsg_('INFO', 'ДРР, волна ' + waves + ': кампаний ' + wave.length + ' (отчётов ' + waveFiles +
        '), с расходом ' + waveData + ', пустых ' + waveEmpty +
        (waveBad ? ', нераспознанных ' + waveBad : '') + ', расход волны ' +
        waveSpend.toFixed(2) + ' ₽, секунд ' + Math.round((Date.now() - t0) / 1000));
    }

    // ---- итог по всем накопленным данным ----
    let totalSpend = 0, totalSalesPromo = 0, totalSalesAll = 0, totalSold = 0, unmatched = 0;
    const keys = Object.keys(agg);
    keys.forEach(function (k) {
      const a = agg[k];
      if (!a.offer && skuMap[k]) a.offer = skuMap[k];
      a.revAnalytics = sales.bySku[k] || '';
      if (!a.offer && /^\d+$/.test(k) && a.spend > 0) unmatched++;
      totalSpend += a.spend; totalSalesPromo += a.sales; totalSalesAll += a.salesAll; totalSold += a.sold;
    });
    if (unmatched) {
      logMsg_('WARN', 'ДРР: расход есть, но SKU не найден в «Номенклатуре» (колонка B) у ' + unmatched +
        ' позиций — они останутся в листе без артикула. Обновите SKU: меню «Синхронизировать данные из Ozon» ' +
        'дозаполняет колонку B автоматически.');
    }
    keys.sort(function (x, y) { return agg[y].spend - agg[x].spend; });

    const rows = keys.map(function (k) {
      const a = agg[k];
      const revA = (a.revAnalytics === '' || a.revAnalytics === undefined) ? '' : Number(a.revAnalytics);
      const denom = (revA !== '' && revA > 0) ? revA : (a.salesAll > 0 ? a.salesAll : (a.sales > 0 ? a.sales : 0));
      const drr = (a.spend > 0 && denom > 0) ? Math.round(a.spend / denom * 10000) / 100 : '';
      return [
        a.offer, k, a.name || '',
        Math.round(a.spend * 100) / 100,
        Math.round(a.sales * 100) / 100,
        a.salesAll > 0 ? Math.round(a.salesAll * 100) / 100 : '',
        revA === '' ? '' : Math.round(revA * 100) / 100,
        drr, a.sold, a.views, a.clicks, a.campaigns || 0, label, today
      ];
    });

    const sh = sheet_(CFG.SHEETS.DRR, headers);
    const need = rows.length + 1;
    if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), CFG.DRR_COLS).clearContent();
    if (rows.length) {
      sh.getRange(2, 1, rows.length, CFG.DRR_COLS).setValues(rows);
      sh.getRange(2, 4, rows.length, 4).setNumberFormat('#,##0.00');
      sh.getRange(2, 6, rows.length, 2).setNumberFormat('#,##0.00');
    }

    // ---- общий ДРР ----
    const denomTotal = sales.filled ? sales.total : (totalSalesAll > 0 ? totalSalesAll : totalSalesPromo);
    const denomNote = sales.filled ? 'вся выручка из «Продажи»'
      : (totalSalesAll > 0 ? 'выручка рекламируемых SKU (оценка из колонки «ДРР, %» отчёта)'
                           : 'продажи в продвижении (ДРР будет завышен)');
    const drr = denomTotal > 0 ? totalSpend / denomTotal : 0;

    const doneTotal = Object.keys(doneSet).length;
    sh.getRange(1, 16, 10, 2).setValues([
      ['Расход всего, ₽', Math.round(totalSpend * 100) / 100],
      ['Продажи в продвижении, ₽', Math.round(totalSalesPromo * 100) / 100],
      ['Выручка (знаменатель), ₽', Math.round(denomTotal * 100) / 100],
      ['ДРР (доля)', Math.round(drr * 10000) / 10000],
      ['Знаменатель', denomNote],
      ['Период', label],
      ['Кампаний обработано', doneTotal + ' из ' + relevant.length],
      ['Осталось кампаний', Math.max(relevant.length - doneTotal, 0)],
      ['SKU с расходом', keys.filter(function (k) { return agg[k].spend > 0; }).length],
      ['Обновлено', today]
    ]).setFontWeight('bold');
    sh.getRange(4, 17).setNumberFormat('0.0%');

    if (drr > 0) {
      writeDrrParam_(drr, 'расход ' + Math.round(totalSpend) + ' ₽ / ' + denomNote + ' ' +
        Math.round(denomTotal) + ' ₽ за ' + label);
    } else {
      logMsg_('WARN', 'ДРР = 0: расходов на рекламу за период не найдено. ' +
        (relevant.length ? 'Проверьте «Диагностика ДРР».' : 'Performance API не вернул кампаний.'));
    }

    const left = Math.max(relevant.length - doneTotal, 0);
    logMsg_('INFO', 'ДРР: за этот запуск обработано кампаний ' + campDone + ' (с расходом ' + campWithData +
      ', пустых ' + campEmpty + ', нераспознанных ' + campNoRows + '), волн ' + waves +
      '. Всего обработано ' + doneTotal + ' из ' + relevant.length + ', осталось ' + left +
      ', SKU без сопоставления ' + unmatched +
      '. Расход ' + Math.round(totalSpend) + ' ₽, ДРР ' + (drr * 100).toFixed(2) + '%. Время ' +
      Math.round((Date.now() - t0) / 1000) + ' с.');
    if (left > 0) {
      logMsg_('WARN', 'ДРР: осталось ' + left + ' кампаний — запустите «Синхронизировать рекламу (ДРР)» ' +
        'ещё раз, продолжим с места остановки.');
    }

    recalc_();
    return { ok: true, period: label, campaignsDone: campDone, campaignsTotal: doneTotal,
             campaignsLeft: left, skuWithSpend: keys.filter(function (k) { return agg[k].spend > 0; }).length,
             unmatchedSku: unmatched,
             spend: Math.round(totalSpend * 100) / 100, drr: Math.round(drr * 10000) / 10000,
             denominator: denomNote, seconds: Math.round((Date.now() - t0) / 1000) };
  } catch (e) {
    logMsg_('ERROR', 'syncDrr: ' + e.message);
    throw e;
  }
}

/** Диагностика ДРР: показывает в логе, что именно вернул Performance API. */
function diagDrrRaw() {
  const rng = mskRange_(14);
  const campaigns = perfCampaignsRelevant_(rng.from, rng.to);
  logMsg_('INFO', 'ДИАГНОСТИКА ДРР: кампаний всего ' + campaigns.length);
  logMsg_('INFO', 'ДИАГНОСТИКА ДРР: первые кампании → ' + JSON.stringify(campaigns.slice(0, 6)).slice(0, 900));
  if (!campaigns.length) return { ok: false, note: 'Performance не вернул ни одной подходящей кампании' };

  const withSpend = campaigns.slice(0, 2).map(function (c) { return String(c.id); });
  let files = [];
  try {
    files = perfFetchReportCsv_(withSpend, rng.from, rng.to);
  } catch (e) {
    logMsg_('ERROR', 'ДИАГНОСТИКА ДРР: ' + e.message);
    return { ok: false, note: e.message };
  }
  const out = [];
  files.forEach(function (f) {
    const p = perfParseCsv_(f.csv);
    logMsg_('INFO', 'ДИАГНОСТИКА ДРР: файл ' + f.file + ', размер ' + f.csv.length + ' символов, ' +
      'колонок в заголовке ' + p.header.length + ', строк данных ' + p.rows.length +
      ', итог кампании: расход ' + ((p.totalRow || {}).spend || 0) + ' ₽');
    logMsg_('INFO', 'ДИАГНОСТИКА ДРР: роли колонок → ' + JSON.stringify(p.colIndex));
    logMsg_('INFO', 'ДИАГНОСТИКА ДРР: начало файла → ' + f.csv.slice(0, 900).replace(/\r?\n/g, ' | '));
    if (p.rows.length) logMsg_('INFO', 'ДИАГНОСТИКА ДРР: первая строка → ' + JSON.stringify(p.rows[0]));
    out.push({ file: f.file, cols: p.header.length, rows: p.rows.length,
               spend: ((p.totalRow || {}).spend || p.totals.spend) });
  });
  return { ok: true, files: files.length, detail: out };
}

// ============================================================
// ФАКТИЧЕСКАЯ КОМИССИЯ: отчёт о реализации против списочной ставки
// ============================================================

/** Шапка листа «Комиссия факт» (13 колонок, A..M). */
function commHeaders_() {
  return ['Offer id', 'SKU', 'Наименование', 'Реализовано, ₽', 'База комиссии, ₽',
          'Комиссия удержана, ₽', 'К начислению, ₽', 'Продано, шт',
          'Ставка по категории, %', 'Комиссия факт, %', 'Разница, п.п.', 'Источник', 'Период'];
}

/**
 * commission_ratio Ozon может отдать и долей (0.495), и процентами (49.5).
 * Приводим к процентам, иначе разница со списочной ставкой уедет на порядок.
 */
function ratioToPercent_(v) {
  const n = Number(v) || 0;
  if (!n) return 0;
  return n <= 1 ? Math.round(n * 10000) / 100 : Math.round(n * 100) / 100;
}

/**
 * ФАКТИЧЕСКАЯ КОМИССИЯ ПО ОТЧЁТУ О РЕАЛИЗАЦИИ.
 *
 * Сырой аудит 18 строк API подтвердил: standard_fee соответствует
 * commission_ratio × seller_price_per_instance × quantity. Знаменатель
 * delivery_commission.amount — другая ценовая база; деление на него даёт ставки
 * выше 100%. Ставка считается от цены продавца, а amount и корректировки
 * используются отдельно для сверки начисления.
 *
 * Источники по порядку:
 *   1. /v1/finance/realization/by-day — по дням (нужен Premium Plus/Pro, ≤32 дней);
 *   2. /v2/finance/realization — за последний закрытый месяц;
 *   3. /v3/posting/fbo|fbs/list с financial_data — комиссия по отправлениям.
 *
 * Результат: лист «Комиссия факт» (по каждому артикулу). B14 меняется только
 * при достаточной выборке, положительной разнице ставок и прошедшей сверке total
 * с корректировками; если ставки совпадают, B14 не меняется.
 */
function diagCommission(days) {
  const t0 = Date.now();
  const tz = Session.getScriptTimeZone();
  const wantDays = Math.min(Math.max(Number(days) || CFG.REALIZATION_DAYS, 1), CFG.REALIZATION_MAX_DAYS);
  const agg = {};          // offer_id → суммы и база seller_price_per_instance × quantity
  let source = '', period = '', note = '';

  function bucket(offer, sku, name) {
    return agg[offer] || (agg[offer] = {
      sku: String(sku || ''), name: String(name || ''),
      amount: 0, commissionBase: 0, fee: 0, total: 0, adjustments: 0,
      expectedTotal: 0, qty: 0, ratioW: 0, rows: 0, rowsWithoutBase: 0
    });
  }

  function commissionAdjustments(dc) {
    return (Number(dc.bonus) || 0) + (Number(dc.bank_coinvestment) || 0) +
      (Number(dc.stars) || 0) + (Number(dc.pick_up_point_coinvestment) || 0) +
      (Number(dc.compensation) || 0);
  }

  /** Разбор строк отчёта о реализации (by-day и v2 — структура одинаковая). */
  function eatRealization(rows, srcName, perLabel) {
    let added = 0;
    rows.forEach(function (r) {
      const it = r.item || {};
      const dc = r.delivery_commission || {};
      const amount = Number(dc.amount) || 0;
      const quantity = Number(dc.quantity) || 0;
      const sellerPrice = Number(r.seller_price_per_instance) || 0;
      const commissionBase = sellerPrice * quantity;
      // standard_fee — «Базовое вознаграждение Ozon» в ₽.
      // commission — fallback для старых отчётов до 30.04.2024.
      const fee = Number(dc.standard_fee) || Number(dc.commission) || 0;
      const total = Number(dc.total) || 0;
      const adjustments = commissionAdjustments(dc);
      const offer = String(it.offer_id || '').trim();
      if (!offer || (!amount && !fee && !commissionBase && !total)) return;
      const a = bucket(offer, it.sku, it.name);
      a.amount += amount;
      a.commissionBase += commissionBase;
      a.fee += fee;
      a.total += total;
      a.adjustments += adjustments;
      a.expectedTotal += amount - fee + adjustments;
      a.qty += quantity;
      a.ratioW += ratioToPercent_(r.commission_ratio) * commissionBase;
      if ((amount || fee || total) && !(commissionBase > 0)) a.rowsWithoutBase++;
      a.rows++;
      added++;
    });
    if (added) { source = srcName; period = perLabel; }
    return added;
  }

  // ---------- источник 1: отчёт о реализации по дням ----------
  if (CFG.HAS_PREMIUM_PLUS) {
    const errs = [];
    let daysOk = 0, newest = null, oldest = null;
    for (let i = 1; i <= wantDays; i++) {
      const d = new Date(Date.now() - i * 86400000);
      const y = Number(Utilities.formatDate(d, tz, 'yyyy'));
      const m = Number(Utilities.formatDate(d, tz, 'MM'));
      const dd = Number(Utilities.formatDate(d, tz, 'dd'));
      const lab = Utilities.formatDate(d, tz, 'dd.MM.yyyy');
      try {
        const rows = realizationByDay_(y, m, dd);
        if (rows.length) { daysOk++; if (!newest) newest = lab; oldest = lab; }
        eatRealization(rows, 'Отчёт о реализации по дням (/v1/finance/realization/by-day)',
                       (oldest || lab) + ' — ' + (newest || lab));
      } catch (e) {
        errs.push(lab + ': ' + String(e.message).slice(0, 130));
        if (errs.length >= 2) break;
      }
      Utilities.sleep(CFG.PAUSE_MS);
    }
    if (daysOk) {
      // идём от вчера вглубь, поэтому oldest нашли последним — ставим его в начало
      period = (oldest || '') + ' — ' + (newest || '') + ' (' + daysOk + ' дн. из ' + wantDays + ')';
      logMsg_('INFO', 'Комиссия: отчёт о реализации по дням — дней с данными ' + daysOk +
        ' из ' + wantDays + ', период ' + period);
    } else {
      note = 'by-day не дал данных' + (errs.length ? ': ' + errs[0] : ' (пусто за все дни)');
      logMsg_('WARN', 'Комиссия: ' + note);
    }
  } else {
    note = 'подписка Premium Plus не заявлена в конфиге — by-day пропускаю';
  }

  // ---------- источник 2: отчёт о реализации за закрытый месяц ----------
  if (!Object.keys(agg).length) {
    const prev = new Date(Date.now() - 35 * 86400000);   // гарантированно закрытый месяц
    const y = Number(Utilities.formatDate(prev, tz, 'yyyy'));
    const m = Number(Utilities.formatDate(prev, tz, 'MM'));
    try {
      const rep = realizationMonth_(y, m);
      const n = eatRealization(rep.rows, 'Отчёт о реализации за месяц (/v2/finance/realization)',
                               m + '/' + y);
      if (n) {
        period = 'месяц ' + m + '/' + y + (rep.header && rep.header.number ? ', отчёт № ' + rep.header.number : '');
        logMsg_('INFO', 'Комиссия: месячный отчёт о реализации — строк ' + n + ', период ' + period);
      } else {
        note += (note ? ' | ' : '') + 'месячный отчёт ' + m + '/' + y + ' пуст';
        logMsg_('WARN', 'Комиссия: месячный отчёт о реализации за ' + m + '/' + y + ' пуст ' +
          '(отчёт приходит не позднее 5-го числа следующего месяца)');
      }
    } catch (e) {
      note += (note ? ' | ' : '') + 'v2/finance/realization: ' + String(e.message).slice(0, 130);
      logMsg_('WARN', 'Комиссия: /v2/finance/realization недоступен — ' + e.message);
    }
  }

  // ---------- источник 3: отправления с financial_data ----------
  if (!Object.keys(agg).length) {
    const from = new Date(Date.now() - wantDays * 86400000);
    const since = Utilities.formatDate(from, tz, 'yyyy-MM-dd') + 'T00:00:00+03:00';
    const to = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd') + 'T23:59:59+03:00';
    const pairs = [['FBO', 'fbo'], ['FBS', 'fbs']];
    let scaleUnit = 0, scaleLine = 0;
    pairs.forEach(function (pair) {
      let postings = [];
      try {
        postings = pair[1] === 'fbo' ? fboPostingsWithFinance_(since, to)
                                     : fbsPostingsWithFinance_(since, to);
      } catch (e) {
        logMsg_('WARN', 'Комиссия: /v3/posting/' + pair[1] + '/list — ' + String(e.message).slice(0, 200));
        note += (note ? ' | ' : '') + 'posting/' + pair[1] + ': ' + String(e.message).slice(0, 100);
        return;
      }
      logMsg_('INFO', 'Комиссия: отправлений ' + pair[0] + ' за ' + wantDays + ' дней — ' + postings.length);
      postings.forEach(function (p) {
        const prods = p.products || [];
        const fin = (p.financial_data && p.financial_data.products) || [];
        prods.forEach(function (pr, i) {
          const f = fin[i] || {};
          const price = Number(f.price || pr.price || 0);
          const qty = Number(pr.quantity) || 1;
          const amount = price * qty;
          let fee = Number(f.commission_amount) || 0;
          const offer = String(pr.offer_id || '').trim();
          if (!offer || !amount || !fee) return;
          // НЕЯСНОСТЬ В СХЕМЕ OZON: commission_amount — «размер комиссии за товар»,
          // но не сказано, за единицу или за всю позицию отправления. Калибруемся по
          // соседнему полю commission_percent: какая трактовка ближе к нему, та и верна.
          const pct = Number(f.commission_percent) || 0;
          if (pct > 0 && qty > 1) {
            const asUnit = fee / price * 100;          // комиссия указана за единицу
            const asLine = fee / amount * 100;         // комиссия указана за позицию
            if (Math.abs(asLine - pct) > Math.abs(asUnit - pct)) {
              fee = fee * qty;                         // приводим к стоимости позиции
              scaleUnit++;
            } else {
              scaleLine++;
            }
          }
          const a = bucket(offer, pr.sku, pr.name);
          a.amount += amount; a.commissionBase += amount; a.fee += fee;
          a.total += Number(f.payout) || 0; a.expectedTotal += amount - fee; a.qty += qty;
          // списочную ставку для отправлений берём из прайса (см. ниже)
          a.rows++;
        });
      });
    });
    if (Object.keys(agg).length) {
      source = 'Отправления FBO/FBS (/v3/posting/*/list, financial_data)';
      if (scaleUnit + scaleLine) {
        logMsg_('DEBUG', 'Комиссия: commission_amount истолкован как «за единицу» в ' + scaleUnit +
          ' позициях и как «за позицию» в ' + scaleLine + ' (калибровка по commission_percent).');
      }
      period = Utilities.formatDate(new Date(Date.now() - wantDays * 86400000), tz, 'dd.MM.yyyy') +
               ' — ' + Utilities.formatDate(new Date(), tz, 'dd.MM.yyyy');
      // подтягиваем списочные ставки, чтобы было с чем сравнивать
      const offers = Object.keys(agg).slice(0, 500);
      try {
        const prices = pricesMap_(offers, { done: false });
        offers.forEach(function (o) {
          const cm = (prices[o] || {}).commissions || {};
          const pct = Number(cm.sales_percent_fbo || cm.sales_percent_fbs) || 0;
          if (pct) agg[o].ratioW = pct * agg[o].commissionBase;
        });
      } catch (e) {
        logMsg_('WARN', 'Комиссия: списочные ставки не получены — ' + e.message);
      }
    }
  }

  const offers = Object.keys(agg);
  if (!offers.length) {
    logMsg_('ERROR', 'Комиссия: ни один источник не дал данных. ' + (note || '') +
      ' Проверьте права ключа: меню «Проверить права API-ключа» (/v1/roles).');
    return { ok: false, note: note || 'нет данных ни в одном источнике' };
  }

  // ---------- считаем ставку от базы продавца ----------
  let sumAmount = 0, sumBase = 0, sumFee = 0, sumTotal = 0, sumAdjustments = 0;
  let sumExpectedTotal = 0, sumQty = 0, sumRatioW = 0, rowsWithoutBase = 0;
  const deltas = [];
  offers.forEach(function (o) {
    const a = agg[o];
    a.listPct = a.commissionBase ? Math.round(a.ratioW / a.commissionBase * 100) / 100 : 0;
    a.factPct = a.commissionBase ? Math.round(a.fee / a.commissionBase * 10000) / 100 : 0;
    a.delta = (a.listPct && a.factPct) ? Math.round((a.listPct - a.factPct) * 100) / 100 : '';
    if (a.delta !== '' && a.delta > 0.05 && a.delta < 15) deltas.push(a.delta);
    sumAmount += a.amount; sumBase += a.commissionBase; sumFee += a.fee; sumTotal += a.total;
    sumAdjustments += a.adjustments; sumExpectedTotal += a.expectedTotal;
    sumQty += a.qty; sumRatioW += a.ratioW; rowsWithoutBase += a.rowsWithoutBase;
  });
  const listAll = sumBase ? Math.round(sumRatioW / sumBase * 100) / 100 : 0;
  const factAll = sumBase ? Math.round(sumFee / sumBase * 10000) / 100 : 0;
  const deltaAll = Math.round((listAll - factAll) * 100) / 100;
  deltas.sort(function (x, y) { return x - y; });
  const med = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 0;
  const spread = deltas.length ? Math.round((deltas[deltas.length - 1] - deltas[0]) * 100) / 100 : 0;

  // API-сверка: total = amount - standard_fee + bonus + bank_coinvestment +
  // stars + pick_up_point_coinvestment + compensation.
  const checkDiff = sumBase ? Math.round((sumExpectedTotal - sumTotal) / sumBase * 10000) / 100 : null;
  const controlPassed = checkDiff !== null && Math.abs(checkDiff) < 0.05 && rowsWithoutBase === 0;

  logMsg_('INFO', 'Комиссия [' + source + '], период ' + period + ': артикулов ' + offers.length +
    ', реализация ' + Math.round(sumAmount) + ' ₽, база продавца ' + Math.round(sumBase) +
    ' ₽, удержано ' + Math.round(sumFee) + ' ₽, шт ' + sumQty);
  logMsg_('INFO', 'Комиссия: ставка по категории ' + listAll + '%, фактически удержано ' + factAll +
    '% → разница ' + deltaAll + ' п.п. (медиана по артикулам ' + med + ', разброс ' + spread + ' п.п.)');
  if (checkDiff !== null) {
    logMsg_(controlPassed ? 'DEBUG' : 'WARN',
      'Контроль начисления с корректировками: ожидаемо ' + Math.round(sumExpectedTotal * 100) / 100 +
      ' ₽, API total ' + Math.round(sumTotal * 100) / 100 + ', отклонение ' + checkDiff +
      '% от базы продавца' + (controlPassed ? ' (сходится)' : ' — скидку не обновляю'));
  }
  offers.slice(0, 5).forEach(function (o) {
    const a = agg[o];
    logMsg_('DEBUG', 'Пример: ' + o + ' — комиссия ' + Math.round(a.fee) + ' ₽ / база продавца ' +
      Math.round(a.commissionBase) + ' ₽ = ' + a.factPct + '% при ставке категории ' + a.listPct + '%');
  });

  // ---------- лист «Комиссия факт» ----------
  const headers = commHeaders_();
  const sh = sheet_(CFG.SHEETS.COMM, headers);
  const list = offers.map(function (o) {
    const a = agg[o];
    return [o, a.sku, a.name,
            Math.round(a.amount * 100) / 100, Math.round(a.commissionBase * 100) / 100,
            Math.round(a.fee * 100) / 100, Math.round(a.total * 100) / 100, a.qty,
            a.listPct || '', a.factPct || '', a.delta === '' ? '' : a.delta,
            source, period];
  }).sort(function (x, y) { return Number(y[3]) - Number(x[3]); });

  const need = list.length + 1;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), headers.length).clearContent();
  if (list.length) {
    sh.getRange(2, 1, list.length, headers.length).setValues(list);
    sh.getRange(2, 4, list.length, 4).setNumberFormat('#,##0.00');
    sh.getRange(2, 8, list.length, 1).setNumberFormat('0');
    sh.getRange(2, 9, list.length, 3).setNumberFormat('0.00');
  }
  sh.getRange(1, 14, 12, 2).clearContent();
  sh.getRange(1, 14, 12, 2).setValues([
    ['Источник', source],
    ['Период', period],
    ['Артикулов в выборке', offers.length],
    ['Реализовано, ₽', Math.round(sumAmount * 100) / 100],
    ['База комиссии продавца, ₽', Math.round(sumBase * 100) / 100],
    ['Удержано комиссии, ₽', Math.round(sumFee * 100) / 100],
    ['К начислению, ₽', Math.round(sumTotal * 100) / 100],
    ['Корректировки начисления, ₽', Math.round(sumAdjustments * 100) / 100],
    ['Ставка по категории, %', listAll],
    ['Комиссия факт, %', factAll],
    ['Разница, п.п.', deltaAll],
    ['Медиана / разброс, п.п.', med + ' / ' + spread]
  ]).setFontWeight('bold');

  // ---------- параметр в «Параметрах» ----------
  let applied = '';
  const par = ss_().getSheetByName('Параметры');
  const enough = offers.length >= 10 && sumBase > 0 && rowsWithoutBase === 0;
  const sane = deltaAll > 0.05 && deltaAll < 6;
  // Не обновляем B14 без полной сверки суммы начисления с корректировками API.
  if (par && enough && sane && controlPassed) {
    const col = par.getRange(1, 1, par.getLastRow(), 1).getValues();
    let row = -1;
    for (let i = 0; i < col.length; i++) {
      if (/скидка к комиссии/i.test(String(col[i][0] || ''))) { row = i + 1; break; }
    }
    if (row > 0) {
      const old = Number(par.getRange(row, 2).getValue());
      par.getRange(row, 2).setValue(deltaAll);
      par.getRange(row, 3).setValue('Замерено ' + Utilities.formatDate(new Date(), tz, 'dd.MM.yyyy HH:mm') +
        ' по источнику «' + source + '», период ' + period + ': база продавца ' + Math.round(sumBase) +
        ' ₽, удержано ' + Math.round(sumFee) + ' ₽ = ' + factAll + '% при ставке категории ' + listAll +
        '%. Сверка начисления прошла с учётом корректировок. Было ' + old + ' п.п., стало ' + deltaAll +
        ' п.п. Медиана по артикулам ' + med + ', разброс ' + spread + ' п.п.');
      applied = old + ' → ' + deltaAll + ' п.п.';
      logMsg_('INFO', 'Комиссия: скидка в «Параметрах» обновлена: ' + applied);
    } else {
      logMsg_('WARN', 'Комиссия: строка «Скидка к комиссии Ozon» в «Параметрах» не найдена — ' +
        'сначала запустите «Синхронизировать данные из Ozon».');
    }
  } else {
    logMsg_('WARN', 'Комиссия: «Параметры» не меняю — артикулов ' + offers.length +
      ' (нужно ≥10), база продавца ' + Math.round(sumBase) + ' ₽, строк без базы ' + rowsWithoutBase +
      ', разница ставок ' + deltaAll + ' п.п. (нужна 0,05…6), контроль начисления ' +
      (controlPassed ? 'пройден' : 'НЕ пройден') + '. B14 оставлен без изменений; данные — на листе «Комиссия факт».');
  }

  logMsg_('INFO', 'Комиссия: готово за ' + Math.round((Date.now() - t0) / 1000) + ' с');
  return { ok: true, source: source, period: period, offers: offers.length,
           amount: Math.round(sumAmount), commissionBase: Math.round(sumBase),
           fee: Math.round(sumFee), total: Math.round(sumTotal),
           listPercent: listAll, factPercent: factAll,
           discountWeighted: deltaAll, discountMedian: med, spread: spread,
           checkDiffPercent: checkDiff, controlPassed: controlPassed,
           applied: applied, note: note };
}

// ============================================================
// ДИАГНОСТИКА ЦЕН
// ============================================================

function diagPriceCompare() {
  const fact = ss_().getSheetByName(CFG.SHEETS.FACT);
  if (!fact || fact.getLastRow() < 2) { logMsg_('WARN', 'diagPriceCompare: лист «Факт Ozon» пуст'); return; }
  const offers = fact.getRange(2, 1, fact.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); });
  const sample = offers.slice(0, 15);
  const prices = pricesMap_(sample);
  sample.forEach(function (oid) {
    const api = Number(((prices[oid] || {}).price || {}).price || 0);
    logMsg_('DEBUG', 'Сверка ' + oid + ': API=' + api);
  });
  logMsg_('INFO', 'diagPriceCompare: сверено ' + sample.length + ' SKU (значения — в логе выше)');
}

function testConnections() {
  const out = [];
  try { out.push(testSellerConnection_()); } catch (e) { out.push('Seller API: ОШИБКА — ' + e.message); }
  try {
    const c = perfCampaigns_();
    out.push('Performance API OK, кампаний: ' + c.length);
  } catch (e) { out.push('Performance API: ОШИБКА — ' + e.message); }
  logMsg_('INFO', 'Проверка подключений: ' + out.join(' | '));
  return out;
}

// ============================================================
// МЕНЮ И НАСТРОЙКА КЛЮЧЕЙ
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Ozon Unit')
    .addItem('Синхронизировать данные из Ozon', 'menuSyncFact')
    .addItem('Синхронизировать продажи (аналитика)', 'menuSyncSales')
    .addItem('Синхронизировать рекламу (ДРР)', 'menuSyncDrr')
    .addItem('Синхронизировать акции', 'menuSyncActions')
    .addItem('Рассчитать юнит-экономику (Э2/Э3)', 'menuCalculate')
    .addItem('Навести порядок и обновить дизайн таблицы', 'menuApplyUx')
    .addSeparator()
    .addItem('Добавить недостающие SKU в базу', 'menuAddMissing')
    .addItem('Обновить инструкцию в таблице', 'menuRefreshInstruction')
    .addItem('Проверить подключение', 'menuTest')
    .addItem('Проверить комиссию по отчёту о реализации', 'menuDiagCommission')
    .addItem('Снять сырые поля комиссии (без изменения B14)', 'menuDiagCommissionSourceRaw')
    .addItem('Проверить права API-ключа', 'menuDiagRoles')
    .addItem('Сверить цены (диагностика)', 'menuDiagPrices')
    .addItem('Диагностика ДРР (сырой ответ)', 'menuDiagDrr')
    .addSeparator()
    .addItem('Настроить ключи доступа', 'menuKeys')
    .addItem('Показать лог', 'menuLog')
    .addToUi();
}

function formatCalcAlert_(res) {
  if (!res || typeof res !== 'object') return 'Готово.';
  return [
    'Расчёт юнит-экономики (Э2/Э3) завершён (' + (res.updatedAt || '') + '):',
    '',
    '• Всего артикулов в базе: ' + (res.total || 0) +
      ' (товарных групп: ' + (res.productGroupsCount || 0) + ')',
    '• Рассчитано цен: ' + (res.calculated || 0) +
      ' (пропущено без СС/кратности: ' + (res.skippedNoCost || 0) +
      ', блок при выкупе 0%: ' + (res.blockedZeroBuyout || 0) + ')',
    '• Комиссия: из «Комиссия факт» — ' + (res.commFromFact || 0) +
      ', из «Факт Ozon» — ' + (res.commFromFallback || 0),
    '• Выкуп: из «Продажи» — ' + (res.buyoutFromSales || 0) +
      ', по умолчанию (Параметры!B8) — ' + (res.buyoutFallback || 0),
    '• Продажи за период: выкуплено ' + (res.totalDeliveredUnits || 0) +
      ' шт (' + (res.skusWithSales || 0) + ' SKU), прибыль на объём: ' + (res.totalVolumeProfit || 0) + ' ₽',
    '• Наценка ниже минимальной: ' + (res.belowMinMarkup || 0) + ' SKU',
    '• Цена ниже целевой: ' + (res.belowTargetPrice || 0) + ' SKU',
    '• Акции (проверено строк: ' + (res.actionsChecked || 0) + '):',
    '  — проходят лимит Ozon: ' + (res.actionsAllowed || 0) +
      (res.actionsBelowFloor ? ' (из них цена акции ниже нашего пола: ' + res.actionsBelowFloor + ')' : ''),
    '  — КОНФЛИКТ (наш пол > лимита Ozon): ' + (res.actionsBlocked || 0),
    '',
    'Листы «Расчёт» (46 кол., KPI-шапка, группы [+], светофор), «Акции» и «Проект» обновлены.'
  ].join('\n');
}

function menuSyncFact()    { ui_('Синхронизация данных', syncFact); }
function menuSyncSales()   { ui_('Продажи по SKU', syncSales14); }
function menuSyncActions() { ui_('Синхронизация акций', syncActions); }
function menuSyncDrr()     { ui_('Синхронизация рекламы', syncDrr14); }
function menuCalculate() {
  const ui = SpreadsheetApp.getUi();
  try {
    const res = calculateUnitEconomics();
    ui.alert('Расчёт юнит-экономики (Э2/Э3)', formatCalcAlert_(res), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Расчёт юнит-экономики (Э2/Э3)', 'Ошибка: ' + e.message + '\n\nПодробности — меню «Показать лог».', ui.ButtonSet.OK);
  }
}
function menuApplyUx() {
  const ui = SpreadsheetApp.getUi();
  try {
    const res = applyWorkbookUx();
    ui.alert('Дизайн и порядок вкладок обновлены', formatCalcAlert_(res), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Дизайн и порядок вкладок', 'Ошибка: ' + e.message + '\n\nПодробности — меню «Показать лог».', ui.ButtonSet.OK);
  }
}
function menuAddMissing()  {
  const ui = SpreadsheetApp.getUi();
  const r = ui.alert('Добавить недостающие SKU',
    'В магазине Ozon есть товары, которых нет в «Номенклатуре».\n' +
    'Добавить их строками в конец листа?\n\n' +
    'Существующие строки не меняются. Себестоимость, кратность и упаковку\n' +
    'по новым строкам нужно будет завести вручную.',
    ui.ButtonSet.YES_NO);
  if (r === ui.Button.YES) ui_('Добавление SKU', addMissingSkus);
}
function menuDiagPrices()  { ui_('Сверка цен', diagPriceCompare); }
function menuDiagCommission() { ui_('Комиссия: факт против списочной ставки', diagCommissionDefault); }
function menuDiagCommissionSourceRaw() { ui_('Аудит исходных полей комиссии', diagCommissionSourceRawDefault); }
function menuDiagRoles() { ui_('Права API-ключа', diagRoles); }
function diagCommissionDefault() { return diagCommission(CFG.REALIZATION_DAYS); }
function diagCommissionSourceRawDefault() { return diagCommissionSourceRaw(CFG.REALIZATION_DAYS); }
function menuDiagDrr()     { ui_('Диагностика ДРР', diagDrrRaw); }
function menuRefreshInstruction() { ui_('Инструкция', refreshInstruction); }

/** Обёртки для меню и триггеров: триггер передаёт объект события, поэтому
 *  функции с аргументом «дни» напрямую на триггер вешать нельзя. */
function syncDrr14()   { return syncDrr(14); }
function syncSales14() { return syncSales(14); }

function ui_(title, fn) {
  const ui = SpreadsheetApp.getUi();
  try {
    const res = fn();
    ui.alert(title, 'Готово.\n' + JSON.stringify(res).slice(0, 1500), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert(title, 'Ошибка: ' + e.message + '\n\nПодробности — меню «Показать лог».', ui.ButtonSet.OK);
  }
}

function menuTest() {
  ui_('Проверка подключения', testConnections);
}

function menuLog() {
  const sh = sheet_(CFG.SHEETS.LOG, ['Время', 'Уровень', 'Сообщение']);
  const last = sh.getLastRow();
  const from = Math.max(2, last - 25);
  const values = last >= 2 ? sh.getRange(from, 1, last - from + 1, 3).getValues() : [];
  const text = values.map(function (r) {
    return Utilities.formatDate(new Date(r[0]), Session.getScriptTimeZone(), 'HH:mm:ss') + ' [' + r[1] + '] ' + r[2];
  }).join('\n');
  SpreadsheetApp.getUi().alert('Последние записи лога', text || 'Лог пуст', SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Настройка ключей: значения сохраняются в свойствах скрипта (в таблицу не попадают). */
function menuKeys() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();

  const ask = function (title, key, hint) {
    const cur = props.getProperty(key) ? '***задан***' : '(не задан)';
    const r = ui.prompt(title, hint + '\nТекущее значение: ' + cur + '\nОставьте пустым, чтобы не менять.', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() === ui.Button.OK) {
      const v = r.getResponseText().trim();
      if (v) props.setProperty(key, v);
    }
  };

  ask('Seller API: Client-Id', CFG.PROPS.CLIENT_ID, 'Кабинет Ozon → Настройки → Seller API');
  ask('Seller API: Api-Key', CFG.PROPS.API_KEY, 'Создаётся там же. Хранится только в свойствах скрипта.');
  ask('Performance API: Client-Id', CFG.PROPS.PERF_ID, 'Рекламный кабинет → API');
  ask('Performance API: Client-Secret', CFG.PROPS.PERF_SECRET, 'Хранится только в свойствах скрипта.');
  logMsg_('INFO', 'Ключи доступа обновлены через меню');
  ui.alert('Готово', 'Ключи сохранены в свойствах скрипта. Проверьте: меню → «Проверить подключение».', ui.ButtonSet.OK);
}
