/**
 * Файл 2 из 5: КЛИЕНТ OZON SELLER API
 * ---------------------------------------------------------------
 * Все запросы к api-seller.ozon.ru. Авторизация: заголовки Client-Id + Api-Key.
 * Есть повторы при 429/5xx и паузы между запросами.
 */

/** Базовый запрос к Seller API. Возвращает распарсенный JSON. */
function sellerFetch_(path, payload, method) {
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty(CFG.PROPS.CLIENT_ID);
  const apiKey   = props.getProperty(CFG.PROPS.API_KEY);
  if (!clientId || !apiKey) {
    throw new Error('Не заданы ключи Seller API. Меню «Ozon Unit» → «Настроить ключи доступа».');
  }

  const options = {
    method: method || 'post',
    contentType: 'application/json',
    headers: { 'Client-Id': clientId, 'Api-Key': apiKey },
    muteHttpExceptions: true
  };
  if (payload !== undefined && payload !== null) {
    options.payload = JSON.stringify(payload);
  }

  let attempt = 0;
  while (true) {
    const resp = UrlFetchApp.fetch(CFG.SELLER_BASE + path, options);
    const code = resp.getResponseCode();
    if (code === 200) {
      const text = resp.getContentText();
      return text ? JSON.parse(text) : {};
    }
    if ((code === 429 || code >= 500) && attempt < CFG.MAX_RETRY) {
      attempt++;
      const wait = 1000 * Math.pow(2, attempt);
      logMsg_('WARN', 'Seller API ' + path + ' → HTTP ' + code + ', повтор через ' + wait + ' мс');
      Utilities.sleep(wait);
      continue;
    }
    throw new Error('Seller API ' + path + ' → HTTP ' + code + ': ' + resp.getContentText().slice(0, 600));
  }
}

/** Список всех товаров: [{product_id, offer_id}]. Пагинация через last_id. */
function productListAll_() {
  const out = [];
  let lastId = '';
  while (true) {
    const body = { filter: { visibility: 'ALL' }, limit: CFG.LIMIT, last_id: lastId };
    const data = sellerFetch_('/v3/product/list', body);
    const res = data.result || {};
    const items = res.items || [];
    items.forEach(function (x) { out.push(x); });
    if (!res.last_id || items.length === 0) break;
    if (res.total && out.length >= res.total) break;
    lastId = res.last_id;
    Utilities.sleep(CFG.PAUSE_MS);
  }
  logMsg_('INFO', 'product/list: получено ' + out.length + ' товаров');
  return out;
}

/** Карточки товаров по offer_id (чанками до 1000). Возвращает карту offer_id → объект. */
function productInfoMap_(offers) {
  const map = {};
  for (let i = 0; i < offers.length; i += CFG.LIMIT) {
    const chunk = offers.slice(i, i + CFG.LIMIT);
    const data = sellerFetch_('/v3/product/info/list', { offer_id: chunk });
    const items = data.items || [];
    items.forEach(function (it) {
      map[String(it.offer_id)] = {
        product_id: it.id,
        sku: pickSku_(it),
        name: it.name,
        category_id: it.description_category_id || it.category_id || '',
        type_id: it.type_id || '',
        weight: it.weight || '',
        volume_weight: it.volume_weight || '',
        barcode: (it.barcodes && it.barcodes[0]) || ''
      };
    });
    Utilities.sleep(CFG.PAUSE_MS);
  }
  logMsg_('INFO', 'product/info/list: карточек ' + Object.keys(map).length);
  return map;
}

/**
 * Цены + комиссии по offer_id: /v5/product/info/prices (пагинация через cursor).
 * Возвращает карту offer_id → {price:{...}, commissions:{...}}.
 */
function pricesMap_(offers, sampleLogger) {
  const map = {};
  for (let i = 0; i < offers.length; i += CFG.LIMIT) {
    const chunk = offers.slice(i, i + CFG.LIMIT);
    let cursor = '';
    while (true) {
      const body = { filter: { offer_id: chunk, visibility: 'ALL' }, limit: CFG.LIMIT };
      if (cursor) body.cursor = cursor;
      const data = sellerFetch_('/v5/product/info/prices', body);
      const items = data.items || [];
      if (sampleLogger && !sampleLogger.done && items.length > 0) {
        sampleLogger.done = true;
        logMsg_('DEBUG', 'Пример ответа prices: ' + JSON.stringify(items[0]).slice(0, 2500));
      }
      items.forEach(function (it) { map[String(it.offer_id)] = it; });
      cursor = data.cursor || '';
      if (!cursor || items.length === 0) break;
      Utilities.sleep(CFG.PAUSE_MS);
    }
    Utilities.sleep(CFG.PAUSE_MS);
  }
  logMsg_('INFO', 'product/info/prices: позиций ' + Object.keys(map).length);
  return map;
}

/**
 * Остатки по offer_id: /v4/product/info/stocks.
 * Возвращает карту offer_id → {fbo: шт, fbs: шт}.
 */
function stocksMap_(offers, sampleLogger) {
  const map = {};
  for (let i = 0; i < offers.length; i += CFG.LIMIT) {
    const chunk = offers.slice(i, i + CFG.LIMIT);
    let cursor = '';
    while (true) {
      const body = { filter: { offer_id: chunk, visibility: 'ALL' }, limit: CFG.LIMIT };
      if (cursor) body.cursor = cursor;
      const data = sellerFetch_('/v4/product/info/stocks', body);
      const items = data.items || [];
      if (sampleLogger && !sampleLogger.done && items.length > 0) {
        sampleLogger.done = true;
        logMsg_('DEBUG', 'Пример ответа stocks: ' + JSON.stringify(items[0]).slice(0, 1500));
      }
      items.forEach(function (it) {
        const oid = String(it.offer_id);
        const acc = map[oid] || { fbo: 0, fbs: 0 };
        (it.stocks || []).forEach(function (s) {
          const t = String(s.type || '').toLowerCase();
          const present = Number(s.present || 0);
          if (t === 'fbo') acc.fbo += present;
          if (t === 'fbs') acc.fbs += present;
        });
        map[oid] = acc;
      });
      cursor = data.cursor || '';
      if (!cursor || items.length === 0) break;
      Utilities.sleep(CFG.PAUSE_MS);
    }
    Utilities.sleep(CFG.PAUSE_MS);
  }
  logMsg_('INFO', 'product/info/stocks: позиций ' + Object.keys(map).length);
  return map;
}

/** Список акций: GET /v1/actions. */
function actionsList_() {
  const data = sellerFetch_('/v1/actions', null, 'get');
  return data.result || data.actions || [];
}

/**
 * Товары в акции: POST /v1/actions/products.
 * ВНИМАНИЕ (сверено с официальной OpenAPI-схемой Ozon от 08.10.2026):
 * пагинация здесь через last_id, поля offset в запросе НЕТ — раньше мы слали offset,
 * из-за чего дальше первой страницы метод не листался.
 */
function actionProducts_(actionId) {
  const out = [];
  let lastId = '';
  let guard = 0;
  while (guard++ < 200) {
    const body = { action_id: actionId, limit: CFG.LIMIT };
    if (lastId) body.last_id = lastId;
    const data = sellerFetch_('/v1/actions/products', body);
    const res = data.result || {};
    const items = res.products || [];
    items.forEach(function (x) { out.push(x); });
    if (!res.last_id || items.length === 0) break;
    lastId = String(res.last_id);
    Utilities.sleep(CFG.PAUSE_MS);
  }
  return out;
}

/**
 * Выгрузка цен и ограничений в Ozon: POST /v1/product/import/prices.
 * prices: [{offer_id, price, old_price, min_price, vat, auto_action_enabled}]
 * Используем на этапе Э5 (после терки «лист Экспорт цен»).
 */
function importPrices_(prices) {
  const results = [];
  for (let i = 0; i < prices.length; i += CFG.LIMIT) {
    const chunk = prices.slice(i, i + CFG.LIMIT);
    const data = sellerFetch_('/v1/product/import/prices', { prices: chunk });
    (data.result || []).forEach(function (r) { results.push(r); });
    Utilities.sleep(CFG.PAUSE_MS);
  }
  return results;
}

/** Проверка подключения: минимальный запрос к Seller API. */
function testSellerConnection_() {
  const data = sellerFetch_('/v3/product/list', { filter: { visibility: 'ALL' }, limit: 1, last_id: '' });
  const total = (data.result && data.result.total) || 0;
  return 'Seller API OK, товаров в магазине: ' + total;
}

/**
 * SKU товара из карточки. Ozon отдаёт его по-разному в разных версиях метода:
 *  • /v3/product/info/list — поле sku (в новых ответах) или массив sources;
 *  • /v2/product/info — sku, fbo_sku, fbs_sku;
 *  • stocks.entries[].sku.
 * Основной SKU товара — там, где shipment_type = 'general'.
 */
function pickSku_(item) {
  if (!item) return '';
  if (item.sku) return String(item.sku);

  let general = '', any = '';
  (item.sources || []).forEach(function (s) {
    if (!s || !s.sku) return;
    if (!any) any = String(s.sku);
    if (String(s.shipment_type || '').toLowerCase() === 'general') general = String(s.sku);
  });
  if (general) return general;
  if (item.fbo_sku) return String(item.fbo_sku);
  if (item.fbs_sku) return String(item.fbs_sku);

  const entries = (item.stocks && item.stocks.entries) || [];
  entries.forEach(function (e) { if (!any && e && e.sku) any = String(e.sku); });
  return any;
}

// ============================================================
// АНАЛИТИКА ПРОДАЖ: /v1/analytics/data
// ============================================================

/**
 * Один запрос аналитики.
 * Метрики всем: revenue, ordered_units.
 * Метрики Premium Plus: delivered_units, returns, cancellations, hits_*, session_*,
 *   conv_*, position_category.
 * Измерения всем: sku, spu, day, week, month; Premium Plus: year, category1,
 *   category2, brand, modelID, descriptionType.
 * РАСХОДОВ НА РЕКЛАМУ ЗДЕСЬ НЕТ: метрики adv_sum_all в официальной схеме Ozon не
 * существует (проверено по схеме от 08.10.2026) — реклама только через Performance API.
 * Без Premium: данные за последние 3 месяца, лимит 1 запрос в минуту и 50 в сутки.
 */
function analyticsData_(metrics, dimension, dateFrom, dateTo, limit, offset) {
  return sellerFetch_('/v1/analytics/data', {
    date_from: dateFrom,
    date_to: dateTo,
    metrics: metrics,
    dimension: dimension,
    filters: [],
    sort: [],
    limit: limit || CFG.LIMIT,
    offset: offset || 0
  });
}

/**
 * Все страницы аналитики. Возвращает [{id, name, metrics:[...]}],
 * где id — это SKU товара (при dimension = ['sku']).
 * Между страницами большая пауза: без Premium Ozon даёт 1 запрос в минуту.
 */
function analyticsAll_(metrics, dimension, dateFrom, dateTo) {
  const out = [];
  let offset = 0, pages = 0;
  while (true) {
    const data = analyticsData_(metrics, dimension, dateFrom, dateTo, CFG.LIMIT, offset);
    const res = data.result || data || {};
    const rows = res.data || [];
    pages++;
    rows.forEach(function (r) {
      const d = (r.dimensions || [])[0] || {};
      out.push({ id: String(d.id || ''), name: d.name || '', metrics: r.metrics || [] });
    });
    if (rows.length < CFG.LIMIT) break;
    offset += CFG.LIMIT;
    if (offset > 50000) { logMsg_('WARN', 'analytics/data: остановились на 50 000 строк'); break; }
    logMsg_('DEBUG', 'analytics/data: страница ' + pages + ', строк ' + out.length +
      ' — ждём ' + Math.round(CFG.ANALYTICS_PAUSE_MS / 1000) + ' с (лимит Ozon: 1 запрос/мин без Premium)');
    Utilities.sleep(CFG.ANALYTICS_PAUSE_MS);
  }
  logMsg_('INFO', 'analytics/data: строк ' + out.length + ' (метрики: ' + metrics.join(', ') +
    ', страницы: ' + pages + ')');
  return out;
}

/**
 * Отправления FBO с финансовыми данными: POST /v3/posting/fbo/list.
 *
 * СВЕРЕНО С ОФИЦИАЛЬНОЙ СХЕМОЙ OZON (08.10.2026). У FBO-метода СВОЯ форма запроса,
 * не такая, как у FBS — в v0.6 мы слали туда dir/offset/with.barcodes/with.translit
 * и читали ответ из result.postings, из-за чего метод возвращал ошибку, а лист
 * «Комиссия факт» оставался пустым. Правильно:
 *   запрос:  {cursor, filter:{since, to, statuses[]}, limit (1..100), sort_dir: ASC|DESC,
 *             translit, with:{analytics_data, financial_data, legal_info}}
 *   ответ:   {cursor, has_next, postings[]}   — БЕЗ обёртки result
 *   в with НЕТ barcodes, а translit — отдельный флаг верхнего уровня.
 */
function fboPostingsWithFinance_(sinceIso, toIso, statuses) {
  const out = [];
  let cursor = '';
  let guard = 0;
  while (guard++ < 80) {                        // 80 × 100 = до 8 000 отправлений
    const body = {
      filter: { since: sinceIso, to: toIso },
      limit: 100,                               // максимум по схеме — 100
      sort_dir: 'DESC',
      with: { analytics_data: true, financial_data: true, legal_info: false }
    };
    if (statuses && statuses.length) body.filter.statuses = statuses;
    if (cursor) body.cursor = cursor;
    const data = sellerFetch_('/v3/posting/fbo/list', body);
    const postings = data.postings || (data.result && data.result.postings) || [];
    postings.forEach(function (p) { out.push(p); });
    cursor = data.cursor || '';
    if (!data.has_next || !cursor || postings.length === 0) break;
    Utilities.sleep(CFG.PAUSE_MS);
  }
  return out;
}

/**
 * Отправления FBS с финансовыми данными: POST /v3/posting/fbs/list.
 * Здесь форма другая: dir (строчными!), offset, with.barcodes/translit — можно,
 * ответ в result.postings + result.has_next.
 */
function fbsPostingsWithFinance_(sinceIso, toIso) {
  const out = [];
  let offset = 0;
  let guard = 0;
  while (guard++ < 80) {
    const data = sellerFetch_('/v3/posting/fbs/list', {
      dir: 'desc',
      filter: { since: sinceIso, to: toIso },
      limit: 100,
      offset: offset,
      with: { analytics_data: true, barcodes: false, financial_data: true,
              legal_info: false, translit: false }
    });
    const res = data.result || {};
    const postings = res.postings || [];
    postings.forEach(function (p) { out.push(p); });
    offset += postings.length;
    if (!res.has_next || postings.length === 0) break;
    Utilities.sleep(CFG.PAUSE_MS);
  }
  return out;
}

// ============================================================
// ОТЧЁТ О РЕАЛИЗАЦИИ — ФАКТИЧЕСКАЯ КОМИССИЯ (Premium Plus / Pro)
// ============================================================

/**
 * Отчёт о реализации ЗА ДЕНЬ: POST /v1/finance/realization/by-day {day, month, year}.
 * Доступен только с подпиской Premium Plus или Premium Pro, глубина — не более
 * 32 календарных дней. Отмены и невыкупы не включаются.
 *
 * Строка отчёта (по каждому товару):
 *   item{offer_id, sku, name, barcode}
 *   commission_ratio            — доля комиссии за продажу по категории (списочная ставка)
 *   seller_price_per_instance   — цена продавца с учётом скидки
 *   delivery_commission{amount, standard_fee, commission, total, quantity,
 *                       price_per_instance, bonus, bank_coinvestment, stars,
 *                       pick_up_point_coinvestment, compensation}
 *   return_commission{...то же...}
 * Где: amount = «Реализовано на сумму»; standard_fee = «Базовое вознаграждение Ozon»
 * (денежная комиссия, ₽); total = «Итого к начислению». На проверенных строках
 * база комиссии = seller_price_per_instance × quantity, а не amount. total сверяется
 * как amount − standard_fee + bonus и остальные корректировки.
 */
function realizationByDay_(year, month, day) {
  const data = sellerFetch_('/v1/finance/realization/by-day',
                            { year: year, month: month, day: day });
  return data.rows || (data.result && data.result.rows) || [];
}

/**
 * Отчёт о реализации ЗА МЕСЯЦ: POST /v2/finance/realization {month, year}.
 * Отчёт приходит не позднее 5-го числа следующего месяца; периоды — не раньше августа 2023.
 * Структура строк та же, что у by-day, плюс result.header (номер отчёта, даты, ИНН).
 */
function realizationMonth_(year, month) {
  const data = sellerFetch_('/v2/finance/realization', { year: year, month: month });
  const res = data.result || data || {};
  return { rows: res.rows || [], header: res.header || {} };
}

/**
 * Права API-ключа: POST /v1/roles (пустое тело).
 * Ответ: {expires_at, roles:[{name, methods:[string]}]} — по нему сразу видно,
 * есть ли у ключа доступ к нужным методам (частая причина «пустых» данных — 403).
 */
function apiRoles_() {
  return sellerFetch_('/v1/roles', {});
}
