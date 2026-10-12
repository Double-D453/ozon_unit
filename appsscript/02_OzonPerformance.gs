/**
 * Файл 3 из 5: КЛИЕНТ OZON PERFORMANCE API (реклама → ДРР)
 * ---------------------------------------------------------------
 * Хост: api-performance.ozon.ru (старый performance.ozon.ru отключён 15.01.2025).
 * Схема: токен → кампании → заказ отчёта (UUID) → ожидание → скачивание.
 *
 * ВАЖНО про формат отчёта: если в запросе ОДНА кампания — Ozon отдаёт CSV,
 * если НЕСКОЛЬКО — ZIP-архив с CSV-файлами (по одному на кампанию).
 *
 * Реальный формат CSV-отчёта «Кампания по продвижению товаров» (увидели в логе
 * прогона №3 от 08.10.2026):
 *   строка 1: ;Кампания по продвижению товаров № 22520274, период 25.09.2026-09.10.2026
 *   строка 2: День;sku;Название товара;Предельная цена, ₽;Показы;Клики;CTR, %;
 *             Добавления в корзину;Средняя стоимость клика, ₽;Расход, ₽, с НДС;
 *             Продано товаров;Продажи в продвижении, ₽;Продано товаров модели;
 *             Продажи в продвижении с заказов модели, ₽;ДРР в продвижении, %;
 *             ДРР, %;Дата добавления
 *   строка 3: Всего;;;;0;0;0,00;...            ← итог по кампании
 *   дальше  : посуточные строки с разбивкой по sku
 * Разделитель — «;», в начале файла BOM.
 *
 * v0.3 (08.10.2026): разбор ZIP через Utilities.unzip, устойчивый парсер CSV.
 * v0.4 (08.10.2026): убран несуществующий resp.getContentType() — формат
 *                    отчёта определяется по blob и «магическим» байтам ZIP (PK).
 * v0.5 (08.10.2026) — по итогам прогона №3:
 *   • ПАРСЕР ПЕРЕПИСАН под реальные названия колонок. Раньше выручка искалась
 *     по словам «выручка/revenue», а в отчёте она называется «Продажи в
 *     продвижении, ₽» → колонка не находилась → ДРР всегда получался 0;
 *   • строка «Всего» теперь читается как итог кампании (если посуточных строк
 *     нет — берём его, а не сообщаем «0 строк»);
 *   • ОТБОР КАМПАНИЙ: в кабинете оказалось 1663 кампании, последовательный
 *     обход физически не влезает в лимит Apps Script. Берём только активные
 *     (CAMPAIGN_STATE_RUNNING) и те, что завершились уже внутри периода;
 *   • ПАРАЛЛЕЛЬНАЯ ОЧЕРЕДЬ: заказываем по 3 отчёта сразу (лимит очереди Ozon)
 *     и ждём их одновременно — в 2–3 раза быстрее;
 *   • номера готовых кампаний возвращаются наружу, чтобы синхронизация могла
 *     продолжить со следующего места при повторном запуске.
 */

/**
 * Обёртка над UrlFetchApp: проходит редиректы вручную (до 5 переходов),
 * сохраняя метод и тело запроса (Apps Script не повторяет POST при 3xx).
 */
function fetchWithRedirects_(url, options) {
  options = options || {};
  options.followRedirects = false;
  options.muteHttpExceptions = true;

  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    const resp = UrlFetchApp.fetch(current, options);
    const code = resp.getResponseCode();
    if (code < 300 || code >= 400) return resp;

    const headers = resp.getHeaders() || {};
    const loc = headers['Location'] || headers['location'];
    if (!loc) return resp;

    if (/^https?:\/\//i.test(loc)) {
      current = loc;
    } else {
      const origin = current.match(/^https?:\/\/[^\/]+/)[0];
      current = origin + (loc.charAt(0) === '/' ? loc : '/' + loc);
    }
    logMsg_('WARN', 'Редирект ' + code + ': ' + current);
  }
  throw new Error('Слишком много редиректов при запросе ' + url);
}

/** Токен Performance API (кешируем на 25 минут в свойствах скрипта). */
function perfToken_() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('PERF_TOKEN');
  const until  = Number(props.getProperty('PERF_TOKEN_UNTIL') || 0);
  if (cached && Date.now() < until) return cached;

  const clientId = props.getProperty(CFG.PROPS.PERF_ID);
  const secret   = props.getProperty(CFG.PROPS.PERF_SECRET);
  if (!clientId || !secret) {
    throw new Error('Не заданы ключи Performance API. Меню «Ozon Unit» → «Настроить ключи доступа».');
  }

  const resp = fetchWithRedirects_(CFG.PERF_BASE + '/api/client/token', {
    method: 'post',
    contentType: 'application/json',
    headers: { Accept: 'application/json' },
    payload: JSON.stringify({
      client_id: clientId,
      client_secret: secret,
      grant_type: 'client_credentials'
    })
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Performance token → HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 400));
  }
  const data = JSON.parse(resp.getContentText());
  props.setProperty('PERF_TOKEN', data.access_token);
  props.setProperty('PERF_TOKEN_UNTIL', String(Date.now() + ((data.expires_in || 1800) - 300) * 1000));
  return data.access_token;
}

/** Базовый запрос к Performance API. */
function perfFetch_(path, options) {
  options = options || {};
  options.headers = Object.assign({ Authorization: 'Bearer ' + perfToken_() }, options.headers || {});
  options.muteHttpExceptions = true;
  let attempt = 0;
  while (true) {
    const resp = fetchWithRedirects_(CFG.PERF_BASE + path, options);
    const code = resp.getResponseCode();
    if (code === 200) return resp;
    if ((code === 429 || code >= 500) && attempt < CFG.MAX_RETRY) {
      attempt++; Utilities.sleep(1000 * Math.pow(2, attempt)); continue;
    }
    throw new Error('Performance API ' + path + ' → HTTP ' + code + ': ' + resp.getContentText().slice(0, 400));
  }
}

/** Список ВСЕХ рекламных кампаний кабинета: [{id, title, state, advObjectType, fromDate, toDate}]. */
function perfCampaigns_() {
  const resp = perfFetch_('/api/client/campaign', { method: 'get' });
  const data = JSON.parse(resp.getContentText());
  const list = data.list || data.campaigns || data.result || data || [];
  return Array.isArray(list) ? list : [];
}

/**
 * Отбор кампаний, которые реально могут дать расходы за период.
 * В кабинете их может быть больше тысячи (архив за годы) — в лимит 6 минут
 * такой обход не влезает, поэтому:
 *   1) CAMPAIGN_STATE_RUNNING — активные сейчас (главный источник расходов);
 *   2) не архивные, у которых дата окончания >= начала периода
 *      (завершились во время периода или позже — расходы могли быть).
 * Сначала активные, потом недавно завершившиеся (от свежих к старым).
 */
function perfCampaignsRelevant_(dateFrom, dateTo) {
  const all = perfCampaigns_();
  const hist = {};
  all.forEach(function (c) {
    const s = String(c.state || 'не указан');
    hist[s] = (hist[s] || 0) + 1;
  });
  logMsg_('INFO', 'Performance: всего кампаний в кабинете ' + all.length + ' → ' + JSON.stringify(hist));

  const from = String(dateFrom).slice(0, 10);
  const to   = String(dateTo).slice(0, 10);
  const running = [], recent = [];

  all.forEach(function (c) {
    const id = String(c.id || c.campaignId || '');
    if (!id) return;
    const rec = {
      id: id,
      title: c.title || '',
      state: String(c.state || '').toUpperCase(),
      type: c.advObjectType || '',
      from: String(c.fromDate || '').slice(0, 10),
      to: String(c.toDate || '').slice(0, 10)
    };
    if (rec.state === 'CAMPAIGN_STATE_RUNNING') { running.push(rec); return; }
    if (rec.state === 'CAMPAIGN_STATE_ARCHIVED') return;
    if (rec.to) { if (rec.to >= from) recent.push(rec); }
    else if (rec.state === 'CAMPAIGN_STATE_INACTIVE') recent.push(rec);
  });

  recent.sort(function (a, b) { return a.to < b.to ? 1 : (a.to > b.to ? -1 : 0); });
  const out = running.concat(recent);
  logMsg_('INFO', 'Performance: к опросу кампаний ' + out.length +
    ' (активных ' + running.length + ', прочих за период ' + recent.length +
    '). Архив и давно завершённые пропущены.');
  return out;
}

/** Запрос отчёта статистики по кампаниям за период. Возвращает UUID. */
function perfRequestStatistics_(campaignIds, dateFrom, dateTo) {
  const resp = perfFetch_('/api/client/statistics', {
    method: 'post',
    contentType: 'application/json',
    headers: { Accept: 'application/json' },
    payload: JSON.stringify({
      campaigns: campaignIds.map(function (x) { return String(x); }),
      from: dateFrom,
      to: dateTo,
      groupBy: 'DATE'
    })
  });
  const data = JSON.parse(resp.getContentText());
  return data.uuid || data.UUID || '';
}

/** Спросить статус отчёта: 'OK' | 'ERROR' | 'WAIT' | '' (не распознан). */
function perfReportState_(uuid) {
  const resp = perfFetch_('/api/client/statistics/' + uuid, { method: 'get' });
  const text = resp.getContentText();
  try { return String(JSON.parse(text).state || '').toUpperCase(); } catch (e) { return ''; }
}

/** Ждём готовности одного отчёта (для диагностики). */
function perfWaitReport_(uuid) {
  for (let i = 0; i < 60; i++) {
    const state = perfReportState_(uuid);
    if (state === 'OK') return perfDownloadReport_(uuid);
    if (state === 'ERROR' || state === 'FAILED' || state === 'CANCELED') {
      throw new Error('Performance: отчёт завершился ошибкой (state=' + state + ')');
    }
    Utilities.sleep(5000);
  }
  throw new Error('Performance: отчёт не готов за 5 минут (uuid=' + uuid + ')');
}

/**
 * Скачать готовый отчёт. Понимает и CSV (1 кампания), и ZIP (2–10 кампаний).
 * ВАЖНО: у HTTPResponse в Apps Script НЕТ метода getContentType() — формат
 * определяем по blob и «магическим» байтам ZIP (PK..).
 * Возвращает [{file: '22520274_25.09.2026-09.10.2026', csv: 'текст'}].
 */
function perfDownloadReport_(uuid) {
  const resp = perfFetch_('/api/client/statistics/report?UUID=' + uuid, { method: 'get' });
  const blob = resp.getBlob();

  let ct = '';
  try { ct = String(blob.getContentType() || '').toLowerCase(); } catch (err) { ct = ''; }
  const bts = blob.getBytes();
  const zipMagic = bts.length > 3 && bts[0] === 0x50 && bts[1] === 0x4B;

  const isZip = ct.indexOf('zip') >= 0 || zipMagic;
  const blobs = isZip ? Utilities.unzip(blob) : [blob];

  return blobs.map(function (b) {
    const name = b.getName() || '';
    let csv = b.getDataAsString('UTF-8');
    if (csv.indexOf('\uFFFD') >= 0) { // старая кодировка
      try { csv = b.getDataAsString('windows-1251'); } catch (e) { /* остаётся UTF-8 */ }
    }
    return { file: name.replace(/\.csv$/i, ''), csv: csv };
  });
}

/** Последовательный вариант (одна пачка) — используется в диагностике. */
function perfFetchReportCsv_(campaignIds, dateFrom, dateTo) {
  const uuid = perfRequestStatistics_(campaignIds, dateFrom, dateTo);
  if (!uuid) throw new Error('Performance: не получен uuid отчёта');
  logMsg_('DEBUG', 'Performance: отчёт заказан, uuid=' + uuid + ' (' + campaignIds.length + ' камп.)');
  return perfWaitReport_(uuid);
}

/**
 * ПАРАЛЛЕЛЬНЫЙ заказ отчётов. Ozon держит в очереди до 3 заданий, поэтому
 * заказываем сразу несколько пачек и ждём их одновременно — иначе обход
 * campaigns × (генерация отчёта) не влезает в 6 минут Apps Script.
 *
 * chunks: [[{id:..}, ...], ...] — не больше CFG.PERF_QUEUE пачек за раз.
 * deadline: timestamp, после которого ждать перестаём.
 * Возвращает [{ids: [...], files: [{file, csv}]}] — только готовые.
 */
function perfReportsParallel_(chunks, dateFrom, dateTo, deadline) {
  const tasks = [];
  chunks.forEach(function (ch) {
    const ids = ch.map(function (c) { return String(c && c.id ? c.id : c); });
    try {
      const uuid = perfRequestStatistics_(ids, dateFrom, dateTo);
      if (uuid) tasks.push({ ids: ids, uuid: uuid, state: 'WAIT' });
      else logMsg_('WARN', 'Performance: не получен uuid для ' + ids.length + ' кампаний');
    } catch (e) {
      logMsg_('ERROR', 'Performance: отчёт не заказан (' + ids.length + ' камп.): ' + e.message);
    }
  });
  if (!tasks.length) return [];
  logMsg_('DEBUG', 'Performance: заказано отчётов ' + tasks.length + ' (' +
    tasks.map(function (t) { return t.ids.length; }).reduce(function (a, b) { return a + b; }, 0) + ' камп.)');

  let guard = 0;
  while (guard++ < 90) {
    const waiting = tasks.filter(function (t) { return t.state === 'WAIT'; });
    if (!waiting.length) break;
    if (Date.now() > deadline) {
      logMsg_('WARN', 'Performance: время вышло, не дождались отчётов: ' + waiting.length);
      break;
    }
    Utilities.sleep(CFG.PERF_POLL_MS);
    waiting.forEach(function (t) {
      try {
        const st = perfReportState_(t.uuid);
        if (st === 'OK') t.state = 'OK';
        else if (st === 'ERROR' || st === 'FAILED' || st === 'CANCELED') {
          t.state = 'ERROR';
          logMsg_('ERROR', 'Performance: отчёт ' + t.uuid + ' — ошибка (state=' + st + ')');
        }
      } catch (e) { /* остаётся WAIT, попробуем на следующем круге */ }
    });
  }

  const out = [];
  tasks.forEach(function (t) {
    if (t.state !== 'OK') return;
    try { out.push({ ids: t.ids, files: perfDownloadReport_(t.uuid) }); }
    catch (e) { logMsg_('ERROR', 'Performance: не скачан отчёт ' + t.uuid + ': ' + e.message); }
  });
  return out;
}

// ============================================================
// ПАРСЕР ОТЧЁТА PERFORMANCE
// ============================================================

/** Нормализация названия колонки: регистр, «ё», неразрывные пробелы. */
function perfNorm_(s) {
  return String(s === undefined || s === null ? '' : s)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Точные названия колонок отчёта «Кампания по продвижению товаров». */
const PERF_COLS_EXACT = {
  'день': 'date',
  'дата': 'date',
  'sku': 'sku',
  'название товара': 'name',
  'предельная цена, ₽': 'maxPrice',
  'показы': 'views',
  'клики': 'clicks',
  'ctr, %': 'ctr',
  'добавления в корзину': 'cart',
  'средняя стоимость клика, ₽': 'cpc',
  'расход, ₽, с ндс': 'spend',
  'расход, ₽': 'spend',
  'расходы, ₽': 'spend',
  'расход': 'spend',
  'продано товаров': 'sold',
  'продажи в продвижении, ₽': 'sales',
  'продано товаров модели': 'soldModel',
  'продажи в продвижении с заказов модели, ₽': 'salesModel',
  'дрр в продвижении, %': 'drrPromo',
  'дрр, %': 'drr',
  'дата добавления': 'addedAt'
};

/** Нечётный поиск — для отчётов других типов кампаний (баннеры, SIS, полка). */
function perfColKeyLoose_(n) {
  if (/^(день|дата|date)$/.test(n)) return 'date';
  if (/^(sku|артикул)$/.test(n)) return 'sku';
  if (/стоимость клика|cpc/.test(n)) return 'cpc';
  if (/^ctr/.test(n)) return 'ctr';
  if (/расход|затрат|expense|spent/.test(n)) return 'spend';
  if (/корзин|cart/.test(n)) return 'cart';
  if (/^клики|clicks/.test(n)) return 'clicks';
  if (/показ|view|impression/.test(n)) return 'views';
  if (/дрр в продвижении/.test(n)) return 'drrPromo';
  if (/дрр|drr/.test(n)) return 'drr';
  if (/продажи в продвижении с заказов модели/.test(n)) return 'salesModel';
  if (/продано товаров модели/.test(n)) return 'soldModel';
  if (/продажи в продвижении|выручк|revenue|sales/.test(n)) return 'sales';
  if (/продано товаров|заказ|order/.test(n)) return 'sold';
  if (/дата добавления/.test(n)) return 'addedAt';
  if (/назван|title|name/.test(n)) return 'name';
  return '';
}

/** Какую роль играет колонка с таким заголовком. */
function perfColKey_(cell) {
  const n = perfNorm_(cell);
  if (!n) return '';
  if (PERF_COLS_EXACT[n]) return PERF_COLS_EXACT[n];
  return perfColKeyLoose_(n);
}

/** Разбор одной строки CSV с учётом кавычек. */
function perfSplitLine_(line, sep) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === sep) { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map(function (s) { return s.replace(/^\uFEFF/, '').trim(); });
}

/**
 * Число из строки: «1 234,56 ₽» → 1234.56, «0,00» → 0, «1.234,56» → 1234.56.
 * Разделитель тысяч и десятичный определяются по последней встрече символа.
 */
function perfNum_(v) {
  if (v === undefined || v === null) return 0;
  let s = String(v).replace(/\u00A0/g, ' ').replace(/[^\d.,\-+]/g, '').trim();
  if (!s) return 0;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) {
    s = (lc > ld) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lc >= 0) {
    const parts = s.split(',');
    s = (parts.length > 2) ? parts.join('') : s.replace(',', '.');
  } else if (ld >= 0) {
    const parts = s.split('.');
    if (parts.length > 2) s = parts.join('');
  }
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

const PERF_NUM_KEYS = ['views', 'clicks', 'cart', 'cpc', 'spend', 'sold', 'sales',
                       'soldModel', 'salesModel', 'drrPromo', 'drr'];

/** Пустая «строка-результат» отчёта. */
function perfEmptyRow_() {
  const r = { date: '', sku: '', name: '' };
  PERF_NUM_KEYS.forEach(function (k) { r[k] = 0; });
  return r;
}

/**
 * Разбор CSV-отчёта Performance.
 * Возвращает:
 *  { header, sep, colIndex, campaignId, campaignTitle, period,
 *    rows: [{date, sku, name, views, clicks, cart, cpc, spend, sold,
 *            sales, soldModel, salesModel, drrPromo, drr}],
 *    totalRow: {...} | null,           ← строка «Всего» из отчёта
 *    totals: {spend, sales, salesModel, salesAll, sold, views, clicks},
 *    raw: 'начало файла'               ← если заголовок не распознан
 *  }
 * salesAll — выручка по товару всего, восстановленная из колонки «ДРР, %»
 * (выручка = расход / ДРР). Приблизительная, нужна только как запасной
 * знаменатель, если нет листа «Продажи».
 */
function perfParseCsv_(csvText) {
  const res = {
    header: [], sep: ';', colIndex: {}, campaignId: '', campaignTitle: '', period: '',
    rows: [], totalRow: null, raw: '',
    totals: { spend: 0, sales: 0, salesModel: 0, salesAll: 0, sold: 0, views: 0, clicks: 0 }
  };

  const lines = String(csvText || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(function (l) { return l.replace(/^\uFEFF/, '').replace(/\s+$/, ''); })
    .filter(function (l) { return l.trim() !== ''; });
  if (!lines.length) return res;

  // ---- номер кампании, название и период из служебной первой строки ----
  const head = lines.slice(0, 3).join(' ');
  const mId = head.match(/№\s*(\d+)/);
  if (mId) res.campaignId = mId[1];
  const mPer = head.match(/период\s*([0-9.]{6,10})\s*[-–—]\s*([0-9.]{6,10})/i);
  if (mPer) res.period = mPer[1] + '–' + mPer[2];
  const mTitle = head.match(/([А-Яа-яA-Za-z][^№|;]*?)\s*(?:№|$)/);
  if (mTitle) res.campaignTitle = mTitle[1].trim();

  // ---- ищем строку-заголовок и разделитель: где больше всего известных колонок ----
  const seps = [';', '\t', ','];
  let best = { i: -1, sep: ';', score: -1, cells: [] };
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    for (let s = 0; s < seps.length; s++) {
      const cells = perfSplitLine_(lines[i], seps[s]);
      if (cells.length < 3) continue;
      let score = 0;
      cells.forEach(function (c) { if (perfColKey_(c)) score++; });
      if (score > best.score) best = { i: i, sep: seps[s], score: score, cells: cells };
    }
  }
  if (best.i < 0 || best.score < 2) {
    res.raw = lines.slice(0, 4).join(' | ').slice(0, 600);
    return res;
  }

  res.header = best.cells;
  res.sep = best.sep;
  best.cells.forEach(function (c, idx) {
    const k = perfColKey_(c);
    if (k && res.colIndex[k] === undefined) res.colIndex[k] = idx;
  });

  // ---- данные ----
  const iDate = res.colIndex.date;
  for (let i = best.i + 1; i < lines.length; i++) {
    const cells = perfSplitLine_(lines[i], best.sep);
    if (!cells.length) continue;

    const row = perfEmptyRow_();
    ['date', 'sku', 'name'].forEach(function (k) {
      const idx = res.colIndex[k];
      if (idx !== undefined && idx < cells.length) row[k] = cells[idx];
    });
    PERF_NUM_KEYS.forEach(function (k) {
      const idx = res.colIndex[k];
      if (idx !== undefined && idx < cells.length) row[k] = perfNum_(cells[idx]);
    });

    const first = perfNorm_(cells[0]);
    const isTotal = /^(всего|итого|итоги|total)/.test(first) ||
      (iDate !== undefined && iDate < cells.length && /^(всего|итого|total)/.test(perfNorm_(cells[iDate])));
    if (isTotal) { res.totalRow = row; continue; }

    const isEmpty = !row.date && !row.sku && row.spend === 0 && row.sales === 0 &&
                    row.salesModel === 0 && row.views === 0 && row.clicks === 0;
    if (isEmpty) continue;

    res.rows.push(row);
    res.totals.spend += row.spend;
    res.totals.sales += row.sales;
    res.totals.salesModel += row.salesModel;
    res.totals.sold += row.sold;
    res.totals.views += row.views;
    res.totals.clicks += row.clicks;
    if (row.drr > 0 && row.spend > 0) res.totals.salesAll += row.spend / (row.drr / 100);
  }
  return res;
}

/** Идентификатор кампании из имени файла в ZIP («22520274_25.09.2026-09.10.2026»). */
function perfIdFromFileName_(name) {
  const m = String(name || '').match(/(\d{4,})/);
  return m ? m[1] : '';
}
