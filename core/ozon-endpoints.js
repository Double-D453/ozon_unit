'use strict';
/**
 * OZON UNIT — ДОМЕННОЕ ЯДРО: конструкторы тел запросов к Ozon Seller API
 * ------------------------------------------------------------------
 * Здесь зафиксировано то, что стоило нескольких прогонов на живом аккаунте:
 * ТОЧНЫЕ формы запросов. Ozon отвечает HTTP 400 на лишние поля, а ошибки
 * выглядят одинаково для «нет данных» и «нет прав», поэтому форма запроса —
 * это не деталь, а источник отказов.
 *
 * Каждый конструктор возвращает { path, body } и проверяется тестом
 * core.test.js по официальной OpenAPI-схеме (schema/ozon_paths.json).
 * Полный список ошибок, найденных таким способом — docs/API-MAP.md.
 *
 * Чистый JS: ни HTTP, ни секретов, ни Google Sheets.
 */

/** Ограничения, зашитые в саму схему Ozon. Превышение = гарантированный 400. */
const LIMITS = {
  PRODUCT_PAGE: 1000,        // /v3/product/list, /v5/product/info/prices, /v4/product/info/stocks
  POSTING_FBO_PAGE: 100,     // /v3/posting/fbo/list — максимум по схеме именно 100
  POSTING_FBS_PAGE: 1000,
  ANALYTICS_PAGE: 1000,      // /v1/analytics/data
  ANALYTICS_METRICS: 14,     // «Укажите до 14 метрик» — иначе InvalidArgument
  ACCRUAL_POSTINGS: 200,     // /v1/finance/accrual/postings — не более 200 номеров
  PERF_CAMPAIGNS_PER_REPORT: 10,
  PERF_QUEUE: 3,
  REALIZATION_DEPTH_DAYS: 32 // отчёт о реализации за день: не глубже 32 календарных дней
};

/**
 * Метрики /v1/analytics/data.
 * ВАЖНО: расходов на рекламу здесь НЕТ ни с какой подпиской. Метрики adv_sum_all
 * в официальной схеме Ozon не существует (проверено: 0 вхождений в схеме от
 * 08.10.2026). Реклама — только Performance API.
 */
const ANALYTICS_METRICS = {
  BASE: ['revenue', 'ordered_units'],
  // доступно только с подпиской Premium Plus
  PREMIUM: ['delivered_units', 'returns', 'cancellations', 'hits_view', 'hits_tocart',
            'conv_tocart', 'session_view', 'position_category'],
  // выручка + всё, что нужно для % выкупа и возвратов
  SALES_PREMIUM: ['revenue', 'ordered_units', 'delivered_units', 'returns', 'cancellations']
};

const ANALYTICS_DIMENSIONS = {
  BASE: ['sku', 'spu', 'day', 'week', 'month'],
  PREMIUM: ['year', 'category1', 'category2', 'brand', 'modelID', 'descriptionType']
};

/** yyyy-MM-dd из Date, без зависимости от часового пояса окружения. */
function isoDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}

/** ISO с московским смещением — Ozon ждёт date-time. */
function isoMsk(date, endOfDay) {
  return isoDay(date) + (endOfDay ? 'T23:59:59+03:00' : 'T00:00:00+03:00');
}

// ---------------------------------------------------------------- список товаров

function productList(visibility, lastId, limit) {
  return { path: '/v3/product/list', body: {
    filter: { visibility: visibility || 'ALL' },
    limit: Math.min(limit || LIMITS.PRODUCT_PAGE, LIMITS.PRODUCT_PAGE),
    last_id: lastId || ''
  } };
}

function productInfoList(offerIds) {
  return { path: '/v3/product/info/list', body: { offer_id: offerIds.slice(0, LIMITS.PRODUCT_PAGE) } };
}

/**
 * Цены, комиссии, логистика, минимальная цена, НДС, эквайринг.
 * ВНИМАНИЕ: поле acquiring лежит В КОРНЕ элемента ответа, а не внутри price —
 * из-за этого в v0.4 эквайринг из API не подхватился ни разу.
 */
function productPrices(offerIds, cursor, visibility) {
  const body = {
    filter: { offer_id: offerIds.slice(0, LIMITS.PRODUCT_PAGE), visibility: visibility || 'ALL' },
    limit: LIMITS.PRODUCT_PAGE
  };
  if (cursor) body.cursor = cursor;
  return { path: '/v5/product/info/prices', body: body };
}

function productStocks(offerIds, cursor, visibility) {
  const body = {
    filter: { offer_id: offerIds.slice(0, LIMITS.PRODUCT_PAGE), visibility: visibility || 'ALL' },
    limit: LIMITS.PRODUCT_PAGE
  };
  if (cursor) body.cursor = cursor;
  return { path: '/v4/product/info/stocks', body: body };
}

// ----------------------------------------------------------------------- аналитика

/**
 * @param {string[]} metrics  не больше 14
 * @param {Date|string} from  yyyy-MM-dd
 * @param {Date|string} to    yyyy-MM-dd — НЕ может быть в будущем:
 *        Ozon отвечает 400 «date_to must not be greater than current date».
 */
function analyticsData(metrics, dimensions, from, to, limit, offset) {
  if (!metrics || !metrics.length) throw new Error('analyticsData: не заданы метрики');
  if (metrics.length > LIMITS.ANALYTICS_METRICS) {
    throw new Error('analyticsData: метрик ' + metrics.length + ', максимум ' + LIMITS.ANALYTICS_METRICS);
  }
  const toDate = typeof to === 'string' ? to : isoDay(to);
  const today = isoDay(new Date());
  return { path: '/v1/analytics/data', body: {
    date_from: typeof from === 'string' ? from : isoDay(from),
    date_to: toDate > today ? today : toDate,     // кламп до сегодня
    metrics: metrics,
    dimension: dimensions || ['sku'],
    filters: [],
    sort: [],
    limit: Math.min(limit || LIMITS.ANALYTICS_PAGE, LIMITS.ANALYTICS_PAGE),
    offset: offset || 0
  } };
}

// ------------------------------------------------------------------------ акции

/** GET, тела нет. */
function actionsList() { return { path: '/v1/actions', body: null, method: 'get' }; }

/**
 * Товары в акции. Пагинация ЧЕРЕЗ last_id — поля offset в запросе нет.
 * В v0.6 сюда уходил offset, из-за чего дальше первой страницы не листалось.
 */
function actionProducts(actionId, lastId, limit) {
  const body = { action_id: actionId, limit: Math.min(limit || LIMITS.PRODUCT_PAGE, LIMITS.PRODUCT_PAGE) };
  if (lastId) body.last_id = lastId;
  return { path: '/v1/actions/products', body: body };
}

// --------------------------------------------------------------------- отправления

/**
 * Отправления FBO. СВОЯ форма запроса, не такая, как у FBS:
 *   cursor + sort_dir, limit ≤ 100, в with только analytics_data / financial_data / legal_info,
 *   translit — отдельный флаг верхнего уровня, а ответ приходит БЕЗ обёртки result.
 */
function postingFboList(since, to, options) {
  const o = options || {};
  const body = {
    filter: { since: toIso(since), to: toIso(to) },
    limit: Math.min(o.limit || LIMITS.POSTING_FBO_PAGE, LIMITS.POSTING_FBO_PAGE),
    sort_dir: o.sortDir || 'DESC',
    with: { analytics_data: false, financial_data: true, legal_info: false }
  };
  if (o.cursor) body.cursor = o.cursor;
  if (o.statuses && o.statuses.length) body.filter.statuses = o.statuses;
  if (o.translit) body.translit = true;
  return { path: '/v3/posting/fbo/list', body: body };
}

/**
 * Отправления FBS. Здесь форма другая: dir строчными, offset, в with есть
 * barcodes и translit, ответ — в result.postings + result.has_next.
 */
function postingFbsList(since, to, options) {
  const o = options || {};
  const body = {
    dir: (o.sortDir || 'desc').toLowerCase(),
    filter: { since: toIso(since), to: toIso(to) },
    limit: Math.min(o.limit || LIMITS.POSTING_FBS_PAGE, LIMITS.POSTING_FBS_PAGE),
    offset: o.offset || 0,
    with: { analytics_data: false, barcodes: false, financial_data: true,
            legal_info: false, translit: false }
  };
  if (o.status) body.filter.status = o.status;
  return { path: '/v3/posting/fbs/list', body: body };
}

function toIso(v) {
  if (typeof v === 'string' && v.indexOf('T') > 0) return v;   // уже date-time
  return isoMsk(typeof v === 'string' ? new Date(v) : v, true);
}

// ------------------------------------------------- отчёт о реализации (Premium Plus)

/**
 * Отчёт о реализации ЗА ДЕНЬ. Только Premium Plus / Premium Pro, глубина ≤ 32 дней.
 * Единственный доступный по API источник ФАКТИЧЕСКОЙ комиссии:
 *   commission_ratio          — ставка по категории (списочная)
 *   delivery_commission.standard_fee — что реально удержали («Базовое вознаграждение Ozon»)
 *   delivery_commission.amount       — «Реализовано на сумму»
 * Разница и есть скидка за отсрочку выплаты, которую Ozon нигде больше не показывает.
 */
function realizationByDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  return { path: '/v1/finance/realization/by-day', body: {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate()
  } };
}

/** Отчёт о реализации ЗА МЕСЯЦ. Приходит не позднее 5-го числа следующего месяца. */
function realizationMonth(year, month) {
  return { path: '/v2/finance/realization', body: { year: year, month: month } };
}

/** Позаказный отчёт о реализации. */
function realizationPosting(year, month) {
  return { path: '/v1/finance/realization/posting', body: { year: year, month: month } };
}

/**
 * Начисления по номерам отправлений — замена отключённого 08.09.2026
 * /v3/finance/transaction/list. Не более 200 номеров за запрос.
 * Несёт СБОРЫ; выручки за продажу в нём нет — она из отчёта о реализации.
 */
function accrualPostings(postingNumbers) {
  return { path: '/v1/finance/accrual/postings',
           body: { posting_numbers: postingNumbers.slice(0, LIMITS.ACCRUAL_POSTINGS) } };
}

/** Начисления за день, пагинация по last_id (живёт 15 минут). */
function accrualByDay(date, lastId) {
  const body = { date: typeof date === 'string' ? date : isoDay(date) };
  if (lastId) body.last_id = lastId;
  return { path: '/v1/finance/accrual/by-day', body: body };
}

/** Справочник типов начислений (id → человекочитаемое имя). */
function accrualTypes() { return { path: '/v1/finance/accrual/types', body: {} }; }

/** Права API-ключа: роли, срок действия и список доступных методов. */
function roles() { return { path: '/v1/roles', body: {} }; }

// ------------------------------------------------------------- выгрузка цен (Э5)

/**
 * /v1/product/import/prices: price, old_price, min_price, currency_code, vat.
 * Контроль перед отправкой обязателен: цена > 0, old_price ≥ price, min_price ≤ price,
 * иначе Ozon отправит товар в карантин цен.
 */
function importPrices(items) {
  const prices = items.map(function (it) {
    const p = {
      offer_id: String(it.offerId),
      price: String(it.price),
      currency_code: it.currency || 'RUB',
      vat: it.vat || '0.22'
    };
    if (it.oldPrice !== undefined && it.oldPrice !== null && it.oldPrice !== '') p.old_price = String(it.oldPrice);
    if (it.minPrice !== undefined && it.minPrice !== null && it.minPrice !== '') p.min_price = String(it.minPrice);
    if (it.autoActionEnabled !== undefined) p.auto_action_enabled = it.autoActionEnabled ? 'ENABLED' : 'DISABLED';
    return p;
  });
  return { path: '/v1/product/import/prices', body: { prices: prices } };
}

module.exports = {
  LIMITS, ANALYTICS_METRICS, ANALYTICS_DIMENSIONS,
  isoDay, isoMsk,
  productList, productInfoList, productPrices, productStocks,
  analyticsData, actionsList, actionProducts,
  postingFboList, postingFbsList,
  realizationByDay, realizationMonth, realizationPosting,
  accrualPostings, accrualByDay, accrualTypes, roles,
  importPrices
};
