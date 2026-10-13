/**
 * Файл 5 из 5: ДИАГНОСТИКА, РАСПИСАНИЕ, ПРОВЕРКИ
 * ---------------------------------------------------------------
 * Дополнительные функции: проверка структуры файла, автообновление по
 * расписанию, а также заглушка-экспорт цен (Э5 — включим после Э2–Э3).
 *
 * v0.5 (08.10.2026): триггеры вешаются на обёртки без аргументов
 * (syncDrr14, syncSales14) — триггер передаёт объект события, и раньше он
 * попадал в параметр «дни», из-за чего период ломался.
 */

/** Проверка структуры рабочего файла. Ничего не меняет, пишет в лог. */
function validateWorkbook() {
  const need = ['Номенклатура', 'Факт Ozon', 'Тарифы Ozon', 'Параметры', 'Себестоимость 1С МСК', 'Кратность и упаковка'];
  const ss = ss_();
  const miss = need.filter(function (n) { return !ss.getSheetByName(n); });
  if (miss.length) logMsg_('WARN', 'validateWorkbook: не найдены листы — ' + miss.join(', '));
  else logMsg_('INFO', 'validateWorkbook: структура в порядке');

  const nom = ss.getSheetByName('Номенклатура');
  if (nom && nom.getLastRow() > 1) {
    const rows = nom.getRange(2, 1, nom.getLastRow() - 1, 16).getValues();
    let noSs = 0, noK = 0, noUpk = 0, dup = {};
    let dupCount = 0;
    rows.forEach(function (r) {
      const oid = String(r[0] || '').trim();
      if (!oid) return;
      if (dup[oid]) dupCount++; else dup[oid] = true;
      if (r[5] === '' || r[5] === null) noSs++;
      if (r[6] === '' || r[6] === null) noK++;
      if (r[7] === '' || r[7] === null || r[7] === 0) noUpk++;
    });
    logMsg_('INFO', 'Данные: SKU=' + rows.length + ', без себестоимости=' + noSs +
      ', без кратности=' + noK + ', без упаковки=' + noUpk + ', дублей Offer id=' + dupCount);
  }
}

/** Создать все служебные листы заранее (если их ещё нет). */
function ensureSheets() {
  sheet_(CFG.SHEETS.LOG, ['Время', 'Уровень', 'Сообщение']);
  sheet_(CFG.SHEETS.FACT, factHeaders_());
  sheet_(CFG.SHEETS.ACT, actHeaders_());
  sheet_(CFG.SHEETS.SALES, salesHeaders_());
  sheet_(CFG.SHEETS.DRR, drrHeaders_());
  sheet_(CFG.SHEETS.PROBLEMS, ['Offer id', 'Наименование', 'Что не хватает', 'Что делать']);
  sheet_(CFG.SHEETS.COMM, commHeaders_());
  if (typeof calcSettingsHeaders_ === 'function') sheet_(CFG.SHEETS.CALC_SETTINGS, calcSettingsHeaders_());
  if (typeof calcHeaders_ === 'function') sheet_(CFG.SHEETS.CALC, calcHeaders_());
  logMsg_('INFO', 'ensureSheets: служебные листы на месте (' +
    ss_().getSheets().length + ' листов в файле)');
}

/**
 * Права API-ключа: POST /v1/roles возвращает роли и список методов, доступных ключу.
 * Самая частая причина «пустых» данных при рабочем подключении — ключ создан
 * с ограниченным набором ролей, и нужные методы отвечают 403.
 */
function diagRoles() {
  let data;
  try {
    data = apiRoles_();
  } catch (e) {
    logMsg_('ERROR', '/v1/roles недоступен: ' + e.message);
    return { ok: false, error: String(e.message).slice(0, 300) };
  }
  const roles = data.roles || [];
  const names = [];
  const methods = [];
  roles.forEach(function (r) {
    names.push(String(r.name || ''));
    (r.methods || []).forEach(function (m) { methods.push(String(typeof m === 'object' ? (m.name || JSON.stringify(m)) : m)); });
  });
  logMsg_('INFO', 'API-ключ: ролей ' + roles.length + ' → ' + (names.join(', ') || '—') +
    (data.expires_at ? '; ключ действует до ' + String(data.expires_at).slice(0, 10) : ''));
  logMsg_('INFO', 'API-ключ: методов доступно ' + methods.length);

  // точечно проверяем то, что нужно этому проекту
  const NEED = [
    ['/v1/finance/realization/by-day', 'фактическая комиссия (отчёт о реализации за день)'],
    ['/v2/finance/realization',        'фактическая комиссия (отчёт о реализации за месяц)'],
    ['/v3/posting/fbo/list',           'отправления FBO (запасной источник комиссии)'],
    ['/v3/posting/fbs/list',           'отправления FBS (запасной источник комиссии)'],
    ['/v1/analytics/data',             'выручка и % выкупа по SKU'],
    ['/v5/product/info/prices',        'цены, комиссии, логистика'],
    ['/v4/product/info/stocks',        'остатки FBO/FBS'],
    ['/v3/product/list',               'список товаров магазина'],
    ['/v1/actions/products',           'товары в акциях']
  ];
  const missing = [];
  const lines = NEED.map(function (n) {
    // в списке ролей методы приходят именами вида «/v1/...» или «V1...» — сравниваем мягко
    const key = n[0].replace(/^\/+/, '').replace(/\//g, '');
    const hit = methods.some(function (m) {
      const mm = m.replace(/^\/+/, '').replace(/\//g, '').toLowerCase();
      return mm === key.toLowerCase() || mm.indexOf(key.toLowerCase()) >= 0;
    });
    if (!hit && methods.length) missing.push(n[0]);
    return (hit || !methods.length ? '✓' : '✗') + ' ' + n[0] + ' — ' + n[1];
  });
  lines.forEach(function (l) { logMsg_('INFO', 'Права ключа: ' + l); });
  if (missing.length) {
    logMsg_('WARN', 'Права ключа: НЕТ доступа к ' + missing.join(', ') +
      '. Перевыпустите ключ в кабинете Ozon (Настройки → API-ключи) с ролью, ' +
      'дающей доступ к финансам и заказам, и введите его заново меню «Настроить ключи доступа».');
  } else if (methods.length) {
    logMsg_('INFO', 'Права ключа: все нужные методы доступны.');
  } else {
    logMsg_('WARN', 'Права ключа: Ozon вернул роли, но пустой список методов — ' +
      'сверить доступ автоматически не получилось. Смотрите роли в логе выше.');
  }
  return { ok: true, roles: names, methodsCount: methods.length,
           expiresAt: data.expires_at || '', missing: missing };
}

/**
 * Автообновление. ВНИМАНИЕ: на триггер вешаем только функции БЕЗ аргументов —
 * триггер передаёт объект события, и он попал бы в параметр «дни».
 * Расписание:
 *   07:00 ежедневно      — цены, комиссии, логистика, остатки («Факт Ozon»);
 *   07:20 ежедневно      — реклама (ДРР): один запуск проходит часть кампаний,
 *                          следующий запуск продолжит с места остановки;
 *   08:30 по понедельникам — продажи по SKU (аналитика, медленный лимит Ozon).
 */
function installTriggers() {
  removeTriggers();
  ScriptApp.newTrigger('syncFact').timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger('syncDrr14').timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger('syncSales14').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  logMsg_('INFO', 'installTriggers: расписание установлено (данные — 07:00 ежедневно, ' +
    'ДРР — 07:00 ежедневно, продажи — пн 08:00)');
}

/**
 * Обновляет лист «Инструкция Apps Script» в таблице.
 * Зачем: сам файл модели заменять нельзя — к нему привязан проект Apps Script
 * и ключи в свойствах скрипта, поэтому инструкция живёт в коде и обновляется
 * из меню вместе с версией каркаса.
 */
function refreshInstruction() {
  const sh = sheet_('Инструкция Apps Script');
  const steps = [
    'Откройте «Ozon Unit — рабочая модель» → меню Расширения → Apps Script.',
    'В редакторе 5 файлов: 00_Config.gs, 01_OzonSeller.gs, 02_OzonPerformance.gs, 03_Sync.gs, ' +
      '04_Diagnostics.gs. При обновлении версии заменяйте файл ЦЕЛИКОМ: Ctrl+A → вставить → Ctrl+S.',
    'Сохраните, вернитесь в таблицу и обновите страницу — появится меню «Ozon Unit».',
    'Меню → «Настроить ключи доступа»: Seller Client-Id, Seller Api-Key, Performance Client-Id, ' +
      'Performance Client-Secret. Ключи хранятся только в свойствах скрипта, в таблицу не попадают.',
    'Меню → «Проверить подключение»: в логе должно быть «Seller API OK…» и «Performance API OK».',
    'Меню → «Синхронизировать данные из Ozon» → лист «Факт Ozon» (24 колонки A–X): цены, зачёркнутая, ' +
      'ограничение для акций, НДС, комиссия FBO/FBS списочная, логистика и доставка FBO/FBS, обработка FBS, ' +
      'возвраты FBO/FBS, эквайринг, остатки и в W/X — комиссия к расчёту (списочная минус скидка). ' +
      'Заодно: дозаполняет пустой SKU в «Номенклатуре» (B), ДОБАВЛЯЕТ новые карточки магазина строками, ' +
      'помечает проблемные в колонке Q «Синк с Ozon» и дописывает причины в лист «Проблемы данных».',
    'Меню → «Синхронизировать продажи (аналитика)» → лист «Продажи»: выручка и заказы по SKU за 14 дней. ' +
      'Это знаменатель ДРР. Идёт ~2 минуты: без подписки Premium Ozon даёт 1 запрос в минуту.',
    'Меню → «Синхронизировать рекламу (ДРР)» → лист «Реклама ДРР»: расход и ДРР по каждому SKU; общий ДРР ' +
      'пишется в «Параметры» B4. Кампаний много — за один запуск скрипт успевает часть. Если в логе ' +
      '«осталось N кампаний», запустите ещё раз: продолжит с места остановки.',
    'Меню → «Синхронизировать акции» → лист «Акции».',
    'Меню → «Добавить недостающие SKU в базу»: то же самое, но отдельной командой — дописывает в ' +
      '«Номенклатуру» товары магазина, которых нет в базе (202 штуки на 08.10). Существующие строки не меняются.',
    'Меню → «Проверить комиссию по отчёту о реализации»: считает ставку как standard_fee / ' +
      '(seller_price_per_instance × quantity), не по amount. Источники: отчёт по дням, месячный отчёт, ' +
      'затем финансовые данные FBO/FBS. Лист «Комиссия факт» показывает обе базы и контроль total; ' +
      'B14 меняется только при достаточной выборке и прошедшей сверке начисления.',
    'Меню → «Проверить права API-ключа»: показывает роли ключа и какие методы доступны. Если данные ' +
      'пустые при рабочем подключении — сначала сюда: скорее всего ключ создан без нужной роли.',
    'Один раз запустите в редакторе: ensureSheets, validateWorkbook, installTriggers ' +
      '(данные — 07:00 ежедневно, ДРР — 07:20 ежедневно, продажи — понедельник 08:30).',
    'Если что-то не так: «Показать лог», «Проверить права API-ключа», «Диагностика ДРР (сырой ответ)», ' +
      '«Сверить цены (диагностика)». Повторы при 429/5xx скрипт делает сам.'
  ];
  const notes = [
    'В таблице ключи не храним. Если ключи где-то «светились» в открытом виде — перевыпустите их в кабинете Ozon.',
    'Логистика (I–P), возвраты (U–V), эквайринг (Q), комиссия и НДС приходят из API по каждому SKU. ' +
      'Проверено: СРЗНАЧ(75; 254) + доставка 25 = 189,50 ₽ — совпало с расчётом в файле V3.',
    'КОМИССИЯ: сырой аудит 18 ответов API показал, что standard_fee соответствует ' +
      'commission_ratio × seller_price_per_instance × quantity. amount — отдельная цена реализации; ' +
      'деление standard_fee на amount завышало процент, иногда выше 100%. total сверяется как ' +
      'amount − standard_fee + bonus, bank_coinvestment, stars, pick_up_point_coinvestment и compensation. ' +
      'B14 аудитом не калибруется и автоматически меняется только при достаточной выборке и ' +
      'прошедшем контроле; в расчёт идут колонки W/X листа «Факт Ozon», а не G/H.',
    'РАСХОДОВ НА РЕКЛАМУ в /v1/analytics/data НЕТ ни с какой подпиской: метрики adv_sum_all в официальной ' +
      'схеме Ozon не существует. Единственный источник рекламы — Performance API (меню «ДРР»).',
    '% ВЫКУПА: с Premium Plus аналитика отдаёт delivered_units, returns и cancellations — реальные ' +
      'доставки, возвраты и отмены по каждому SKU. Колонки J..M листа «Продажи», % выкупа = доставлено / ' +
      'заказано. Это закрывает требование считать невыкупы по факту, а не параметром «на глаз».',
    'Все тела запросов сверены с официальной OpenAPI-схемой Ozon (зеркало от 08.10.2026): у ' +
      '/v3/posting/fbo/list пагинация через cursor и sort_dir, лимит 100 и ответ БЕЗ обёртки result; ' +
      'у /v1/actions/products — last_id вместо offset. Раньше туда уходили лишние поля, и метод ' +
      'отвечал ошибкой — отсюда пустой лист «Комиссия факт» в v0.6.',
    'НОВЫЕ КАРТОЧКИ появляются в «Номенклатуре» автоматически, но БЕЗ себестоимости и кода 1С — в колонке Q ' +
      'стоит «новый из Ozon — нет данных 1С». Такие строки в расчёт не идут и не искажают цифры: сначала ' +
      'заведите товар в 1С, потом подтяните себестоимость.',
    '«Проблемы данных» — общий список того, что мешает считать: нет себестоимости, нет кратности, нет ' +
      'карточки в магазине, товар добавлен из Ozon. Записи не дублируются между запусками.',
    'Эквайринг: поле acquiring лежит В КОРНЕ ответа /v5/product/info/prices, не внутри price. ' +
      'Если API его не отдал, ставится оценка 1,5% — сколько тех и других, видно в логе.',
    'ДРР = расход на рекламу / ВСЯ выручка товара. Знаменатель берётся с листа «Продажи»; если его нет — ' +
      'выручка рекламируемых SKU (тогда ДРР завышен). Источник всегда подписан в «Параметры» C4.',
    'Ошибка «date_to must not be greater than current date» исправлена: /v1/analytics/data не принимает ' +
      'будущие даты, конец периода теперь сегодняшнее число.',
    'Витринную цену покупателя Ozon через API не отдаёт (marketing_price отключён 12.11.2025). ' +
      'В колонке B «Факт Ozon» — marketing_seller_price, цена продавца с учётом акций и бустинга.',
    'НДС из API приходит долей (0.22) — скрипт приводит к процентам (22). Ставка только 22%.',
    'Отчёт Performance при нескольких кампаниях приходит ZIP-архивом, разделитель в CSV — «;», ' +
      'выручка называется «Продажи в продвижении, ₽». Парсер рассчитан на этот формат.',
    'Лимиты Ozon: 1000 товаров на запрос; в Performance — 10 кампаний в отчёте и 3 задания в очереди.',
    'Лимит Apps Script — 6 минут на запуск, поэтому в ДРР встроен предохранитель 4,5 минуты ' +
      'и продолжение с места остановки.',
    'В Ozon ничего НЕ отправляется: скрипт только читает. Выгрузка цен — этап Э5, после проверки расчёта.'
  ];

  sh.clear();
  sh.getRange(1, 1).setValue('ПОДКЛЮЧЕНИЕ АВТОСИНХРОНИЗАЦИИ С OZON (Apps Script) — каркас v0.7')
    .setFontWeight('bold').setFontSize(13);
  sh.getRange(3, 2).setValue('Что это: автосинхронизация с Ozon. Скрипт ЧИТАЕТ данные (цены, комиссии, ' +
    'логистику, возвраты, эквайринг, остатки, продажи, рекламу, акции). В Ozon ничего не отправляется.');
  let r = 5;
  steps.forEach(function (t, i) {
    sh.getRange(r, 1).setValue(i + 1).setFontWeight('bold');
    sh.getRange(r, 2).setValue(t).setWrap(true);
    r++;
  });
  r += 1;
  sh.getRange(r, 1).setValue('ЧТО УЧЕСТЬ').setFontWeight('bold');
  r++;
  notes.forEach(function (t) {
    sh.getRange(r, 2).setValue('• ' + t).setWrap(true);
    r++;
  });
  sh.setColumnWidth(1, 34);
  sh.setColumnWidth(2, 900);
  logMsg_('INFO', 'Инструкция в таблице обновлена (каркас v0.7): шагов ' + steps.length +
    ', примечаний ' + notes.length);
  return { ok: true, steps: steps.length, notes: notes.length };
}

/** Полный прогон всех синхронизаций подряд (для ручной проверки). */
function syncAll() {
  const out = [];
  try { out.push('Данные: ' + JSON.stringify(syncFact())); }   catch (e) { out.push('Данные: ОШИБКА ' + e.message); }
  try { out.push('Продажи: ' + JSON.stringify(syncSales(14))); } catch (e) { out.push('Продажи: ОШИБКА ' + e.message); }
  try { out.push('ДРР: ' + JSON.stringify(syncDrr(14))); }     catch (e) { out.push('ДРР: ОШИБКА ' + e.message); }
  try { out.push('Акции: ' + JSON.stringify(syncActions())); } catch (e) { out.push('Акции: ОШИБКА ' + e.message); }
  logMsg_('INFO', 'syncAll: ' + out.join(' | ').slice(0, 1500));
  return out;
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  logMsg_('INFO', 'removeTriggers: все триггеры удалены');
}

/**
 * Э5 (заглушка): предпросмотр выгрузки цен.
 * Пока просто собирает данные листа «Расчёт» (когда он появится) и пишет в лог,
 * НИЧЕГО не отправляет в Ozon. Реальная отправка — через importPrices_()
 * после того, как соберём лист «Экспорт цен» и защиту от убыточных цен.
 */
function previewExport() {
  const sh = ss_().getSheetByName('Экспорт цен');
  if (!sh || sh.getLastRow() < 2) {
    logMsg_('WARN', 'previewExport: лист «Экспорт цен» ещё не создан (появится на этапе Э3–Э5)');
    return;
  }
  const n = sh.getLastRow() - 1;
  logMsg_('INFO', 'previewExport: к выгрузке ' + n + ' строк. Отправка в Ozon пока отключена (безопасный режим).');
}

/**
 * Сырой аудит полей отчёта о реализации — только для выяснения семантики комиссии.
 * Читает Seller API за последние N дней и сохраняет несколько показательных товаров
 * в отдельную вкладку «Аудит комиссии API». Не меняет «Комиссия факт» и «Параметры»;
 * в частности, не записывает B14.
 */
function diagCommissionSourceRaw(days) {
  const t0 = Date.now();
  const tz = Session.getScriptTimeZone();
  const wantDays = Math.min(Math.max(Number(days) || CFG.REALIZATION_DAYS, 1), CFG.REALIZATION_MAX_DAYS);
  const targets = {};
  const addTarget = function (offer, reason) {
    const id = String(offer || '').trim();
    if (id && !targets[id]) targets[id] = reason;
  };

  // Всегда берём товар, на котором заметили >100%, и добавляем четыре наибольших
  // процента из текущего листа плюс товар с медианным результатом для сравнения.
  addTarget('Каталог-Мультишпон', 'контрольный пример >100%');
  const comm = ss_().getSheetByName(CFG.SHEETS.COMM);
  if (comm && comm.getLastRow() > 1) {
    const values = comm.getRange(2, 1, comm.getLastRow() - 1, 9).getValues();
    const candidates = values.filter(function (r) { return String(r[0] || '').trim(); });
    const byFact = candidates.slice().sort(function (a, b) {
      return (Number(b[8]) || 0) - (Number(a[8]) || 0);
    });
    byFact.slice(0, 4).forEach(function (r) { addTarget(r[0], 'один из максимальных процентов в «Комиссия факт»'); });
    const byMedian = candidates.slice().sort(function (a, b) {
      return (Number(a[8]) || 0) - (Number(b[8]) || 0);
    });
    if (byMedian.length) addTarget(byMedian[Math.floor(byMedian.length / 2)][0], 'медианный пример');
  }

  const headers = [
    'Дата API', 'Причина выборки', 'Offer id', 'SKU', 'Наименование', 'rowNumber',
    'commission_ratio (raw)', 'seller_price_per_instance',
    'delivery_commission.amount', 'delivery_commission.standard_fee',
    'delivery_commission.commission', 'delivery_commission.total',
    'delivery_commission.quantity', 'delivery_commission.price_per_instance',
    'delivery_commission.bonus', 'delivery_commission.bank_coinvestment',
    'delivery_commission.stars', 'delivery_commission.pick_up_point_coinvestment',
    'delivery_commission.compensation',
    'return_commission.amount', 'return_commission.standard_fee',
    'return_commission.commission', 'return_commission.total',
    'return_commission.quantity', 'return_commission.price_per_instance',
    'return_commission.bonus', 'return_commission.bank_coinvestment',
    'return_commission.stars', 'return_commission.pick_up_point_coinvestment',
    'return_commission.compensation',
    'fee / amount, % (текущий расчёт)',
    'fee / (fee + total), % (сверка)',
    'fee / (seller_price_per_instance × quantity), % (сверка)'
  ];
  const output = [headers];
  const errors = [];
  let requestsOk = 0;

  function value(obj, key) {
    return obj && obj[key] !== undefined && obj[key] !== null ? obj[key] : '';
  }

  for (let i = 1; i <= wantDays; i++) {
    const d = new Date(Date.now() - i * 86400000);
    const year = Number(Utilities.formatDate(d, tz, 'yyyy'));
    const month = Number(Utilities.formatDate(d, tz, 'MM'));
    const day = Number(Utilities.formatDate(d, tz, 'dd'));
    const dateLabel = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    let rows;
    try {
      rows = realizationByDay_(year, month, day);
      requestsOk++;
    } catch (e) {
      errors.push(dateLabel + ': ' + String(e.message).slice(0, 180));
      if (errors.length >= 2) break;
      continue;
    }

    rows.forEach(function (r) {
      const item = r.item || {};
      const offer = String(item.offer_id || '').trim();
      if (!targets[offer]) return;
      const dc = r.delivery_commission || {};
      const rc = r.return_commission || {};
      const fee = Number(dc.standard_fee) || Number(dc.commission) || 0;
      const amount = Number(dc.amount) || 0;
      const total = Number(dc.total) || 0;
      const quantity = Number(dc.quantity) || 0;
      const sellerPrice = Number(r.seller_price_per_instance) || 0;
      const feeOverBase = fee + total ? Math.round(fee / (fee + total) * 10000) / 100 : '';
      const sellerBase = sellerPrice * quantity;
      output.push([
        dateLabel, targets[offer], offer, value(item, 'sku'), value(item, 'name'), value(r, 'rowNumber'),
        value(r, 'commission_ratio'), value(r, 'seller_price_per_instance'),
        value(dc, 'amount'), value(dc, 'standard_fee'), value(dc, 'commission'), value(dc, 'total'),
        value(dc, 'quantity'), value(dc, 'price_per_instance'), value(dc, 'bonus'),
        value(dc, 'bank_coinvestment'), value(dc, 'stars'), value(dc, 'pick_up_point_coinvestment'),
        value(dc, 'compensation'),
        value(rc, 'amount'), value(rc, 'standard_fee'), value(rc, 'commission'), value(rc, 'total'),
        value(rc, 'quantity'), value(rc, 'price_per_instance'), value(rc, 'bonus'),
        value(rc, 'bank_coinvestment'), value(rc, 'stars'), value(rc, 'pick_up_point_coinvestment'),
        value(rc, 'compensation'),
        amount ? Math.round(fee / amount * 10000) / 100 : '', feeOverBase,
        sellerBase ? Math.round(fee / sellerBase * 10000) / 100 : ''
      ]);
    });
    Utilities.sleep(CFG.PAUSE_MS);
  }

  const sheetName = 'Аудит комиссии API';
  const ss = ss_();
  const sh = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  sh.clearContents();
  sh.getRange(1, 1, output.length, headers.length).setValues(output);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sh.setFrozenRows(1);

  errors.forEach(function (e) { logMsg_('WARN', 'Аудит комиссии API: ' + e); });
  logMsg_('INFO', 'Аудит комиссии API: строк ' + (output.length - 1) + ', товаров ' +
    Object.keys(targets).length + ', успешных запросов ' + requestsOk + ' из ' + wantDays +
    '. B14 и лист «Комиссия факт» не менялись.');
  return {
    ok: output.length > 1,
    sheet: sheetName,
    rows: output.length - 1,
    targets: Object.keys(targets),
    requestsOk: requestsOk,
    requestedDays: wantDays,
    errors: errors.length,
    elapsedSeconds: Math.round((Date.now() - t0) / 1000)
  };
}
