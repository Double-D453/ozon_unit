/**
 * OZON UNIT — КАЛЬКУЛЯТОР ЮНИТ-ЭКОНОМИКИ
 * Файл 1 из 5: КОНФИГУРАЦИЯ
 * ---------------------------------------------------------------
 * Каркас синхронизации данных с Ozon Seller API + Performance API.
 * Версия: v0.7 (09.10.2026)
 *
 * v0.7: у владельца подтверждена подписка PREMIUM PLUS. Добавлен отчёт о реализации
 * как основной источник фактической комиссии; исправлены формы запросов
 * /v3/posting/fbo/list (cursor + sort_dir, limit ≤ 100, ответ БЕЗ обёртки result)
 * и /v1/actions/products (last_id вместо offset). Метрики adv_sum_all в
 * /v1/analytics/data НЕ СУЩЕСТВУЕТ — вместо неё Premium-метрики delivered_units,
 * returns, cancellations (реальный % выкупа по SKU).
 *
 * ВАЖНО: ключи доступа НЕ хранятся в коде и НЕ хранятся в таблице.
 * Они лежат в «Свойствах скрипта» (Script Properties) — задаются
 * через меню «Ozon Unit» → «Настроить ключи доступа».
 */

const CFG = {
  // --- API ---
  SELLER_BASE: 'https://api-seller.ozon.ru',
  // ВАЖНО: старый хост performance.ozon.ru отключён 15.01.2025 и отвечает редиректом 307.
  // Актуальный хост — api-performance.ozon.ru (см. фикс v0.2 от 08.10.2026).
  PERF_BASE:   'https://api-performance.ozon.ru',

  // Ключи в Script Properties (значения-идентификаторы, не сами ключи!)
  PROPS: {
    CLIENT_ID:   'OZON_CLIENT_ID',        // Seller API: Client-Id
    API_KEY:     'OZON_API_KEY',          // Seller API: Api-Key
    PERF_ID:     'OZON_PERF_CLIENT_ID',   // Performance API: client_id
    PERF_SECRET: 'OZON_PERF_CLIENT_SECRET'// Performance API: client_secret
  },

  // --- Листы таблицы ---
  SHEETS: {
    NOM:   'Номенклатура',   // мастер-реестр SKU (ключ — Offer id, колонка A)
    FACT:  'Факт Ozon',      // срез цен/комиссий/остатков из API
    LOG:   'Лог',            // журнал работы скрипта
    ACT:   'Акции',          // акции и участие товаров
    DRR:   'Реклама ДРР',    // расходы на рекламу по SKU (Performance API)
    SALES: 'Продажи',        // выручка и заказы по SKU (Seller API, аналитика)
    PROBLEMS: 'Проблемы данных', // что не так с данными по каждому артикулу
    COMM:  'Комиссия факт',  // фактическая комиссия из заказов (сверка со списочной)
    CALC:  'Расчёт',         // расчёт юнит-экономики и целевых цен (Э2/Э3)
    CALC_SETTINGS: 'Настройки расчёта' // каскад наценок: SKU → категория → Параметры!B10/B9
  },

  // --- Лимиты и паузы (Ozon любит 429) ---
  LIMIT:     1000,   // максимум элементов в одном запросе
  PAUSE_MS:  350,    // пауза между запросами, мс
  MAX_RETRY: 4,      // повторы при 429/5xx

  // --- Реклама (Performance API) ---
  PERF_QUEUE:    3,     // Ozon держит в очереди максимум 3 задания на отчёты
  PERF_CHUNK:    10,    // максимум кампаний в одном отчёте
  PERF_POLL_MS:  6000,  // как часто спрашиваем «отчёт готов?»
  TIME_GUARD_MS: 4.5 * 60 * 1000, // предохранитель: лимит Apps Script — 6 минут

  // --- Аналитика продаж (Seller API /v1/analytics/data) ---
  // Без подписки Premium Ozon даёт 1 запрос в минуту и 50 в сутки — пауза большая.
  ANALYTICS_PAUSE_MS: 65000,

  // --- Номенклатура ---
  // Новые карточки магазина добавляются в «Номенклатуру» автоматически, с пометкой
  // в колонке Q «Синк с Ozon»: по ним ещё нет сопоставления с 1С, значит нет
  // себестоимости — в расчёт они не идут, пока их не заведут.
  AUTO_ADD_MISSING: true,
  NOM_COLS:  17,     // колонок в «Номенклатуре» (A..Q): A Offer id, B SKU, F СС, P Категория, Q «Синк с Ozon»
  NOM_COL_SKU:  2,
  NOM_COL_SS:   6,
  NOM_COL_CAT:  16,  // колонка P — категория (description_category_id / category_id из Ozon или ручная)
  NOM_COL_SYNC: 17,

  // --- Подписка ---
  // ВАЖНО: подтверждено владельцем 09.10.2026 — активна подписка PREMIUM PLUS.
  // Она открывает: /v1/finance/realization/by-day (отчёт о реализации за день,
  // не глубже 32 дней), /v2/finance/realization (за месяц), а в /v1/analytics/data —
  // метрики delivered_units, returns, cancellations и измерения category1/category2/brand.
  HAS_PREMIUM_PLUS: true,

  // Фактическая комиссия из отчёта: standard_fee / (seller_price_per_instance × quantity).
  // delivery_commission.amount — другая база, в знаменателе ставки не используется.
  // 1,5 п.п. — существующее значение B14; сырой аудит его не подтверждает и не меняет.
  COMMISSION_DISCOUNT_DEFAULT: 1.5,
  REALIZATION_DAYS: 14,   // сколько дней отчёта о реализации брать (максимум 31)
  REALIZATION_MAX_DAYS: 31,

  // Метрики /v1/analytics/data. Расходов на рекламу здесь НЕТ ни с какой подпиской
  // (adv_sum_all в официальной схеме не существует) — реклама только через Performance API.
  SALES_METRICS_BASE:    ['revenue', 'ordered_units'],
  SALES_METRICS_PREMIUM: ['revenue', 'ordered_units', 'delivered_units', 'returns', 'cancellations'],

  // --- Служебное ---
  FACT_COLS: 24,     // колонок на листе «Факт Ozon» (A..X): W/X — комиссия с учётом скидки
  DRR_COLS:  14,     // колонок на листе «Реклама ДРР» (A..N)
  SALES_COLS: 13,    // колонок на листе «Продажи» (A..M): J..M — доставка/возвраты/отмены/% выкупа
  COMM_COLS: 13,     // колонок на листе «Комиссия факт» (A..M)
  ACT_SYNC_COLS: 11, // колонок сырых данных API на листе «Акции» (A..K)
  ACT_COLS:  15,     // всего колонок на листе «Акции» (A..O: A..K из API + L..O проверка пола)
  ACT_HEADERS: [
    'Акция (ID)', 'Название акции', 'Offer id', 'Product id', 'Цена до акции, ₽',
    'Цена акции, ₽', 'Макс. допустимая цена, ₽', 'Мин. кол-во', 'В акции, шт',
    'Способ', 'Дата среза',
    'Наш мин. пол, ₽', 'Запас к лимиту Ozon, ₽', 'Наценка по цене акции, %', 'Статус ограничения'
  ],
  CALC_SETTINGS_COLS: 5, // колонок на листе «Настройки расчёта» (A..E)
  CALC_COLS: 40,     // колонок на листе «Расчёт» (A..AN)
  LOG_KEEP:  3000    // сколько строк лога хранить
};
