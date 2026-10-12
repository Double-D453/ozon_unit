// ВАЛИДАТОР ТЕЛ ЗАПРОСОВ по официальной OpenAPI-схеме Ozon Seller API.
// Смысл: в v0.6 «Комиссия факт» осталась пустой, потому что мы слали в
// /v3/posting/fbo/list поля dir/offset/with.barcodes/with.translit — их там нет,
// и Ozon отвечал ошибкой. Ни один мок этого не ловил. Этот тест ловит.
const ENV = makeEnv();
const SpreadsheetApp = ENV.SpreadsheetApp, PropertiesService = ENV.PropertiesService,
      Utilities = ENV.Utilities, Session = ENV.Session;
const SCHEMA = global.__OZON_PATHS__;
if (!SCHEMA) throw new Error('нет ozon_paths.json — валидатор не запустится');

PropertiesService.getScriptProperties().setProperty('OZON_CLIENT_ID', '1');
PropertiesService.getScriptProperties().setProperty('OZON_API_KEY', 'k');

const SENT = [];
const CANNED = {
  '/v3/product/list':                 { result: { items: [{ product_id: 1, offer_id: 'A' }], last_id: '', total: 1 } },
  '/v3/product/info/list':            { result: [{ id: 1, offer_id: 'A', sources: [{ sku: 907 }], name: 'A' }] },
  '/v5/product/info/prices':          { items: [{ offer_id: 'A', acquiring: 10, commissions: {}, price: {} }], cursor: '' },
  '/v4/product/info/stocks':          { items: [{ offer_id: 'A', stocks: [] }], cursor: '' },
  '/v1/actions':                      { result: [{ id: 7, title: 'x', products_count: 0 }] },
  '/v1/actions/products':             { result: { products: [], last_id: '' } },
  '/v1/product/import/prices':        { result: [] },
  '/v1/analytics/data':               { result: { data: [], totals: [] } },
  '/v3/posting/fbo/list':             { postings: [], has_next: false, cursor: '' },
  '/v3/posting/fbs/list':             { result: { postings: [], has_next: false } },
  '/v1/finance/realization/by-day':   { rows: [] },
  '/v2/finance/realization':          { result: { rows: [], header: {} } },
  '/v1/finance/realization/posting':  { result: { rows: [], header: {} } },
  '/v1/finance/accrual/postings':     { posting_accruals: [] },
  '/v1/finance/accrual/types':        { accrual_types: [] },
  '/v1/finance/accrual/by-day':       { accruals: [], last_id: '' },
  '/v1/roles':                        { expires_at: '2027-01-01T00:00:00Z', roles: [{ name: 'Admin', methods: ['/v1/analytics/data'] }] },
  '/v1/returns/list':                 { result: { returns: [] } }
};

const UrlFetchApp = {
  fetch: function (url, options) {
    const path = String(url).replace('https://api-seller.ozon.ru', '');
    let body = null;
    if (options && options.payload) { try { body = JSON.parse(options.payload); } catch (e) { body = { _unparsed: options.payload }; } }
    SENT.push({ path: path, method: (options && options.method) || 'post', body: body });
    const canned = CANNED[path];
    if (canned === undefined) throw new Error('МОК НЕ ЗНАЕТ метода ' + path + ' — добавьте ответ в CANNED');
    return { getResponseCode: function () { return 200; },
             getContentText: function () { return JSON.stringify(canned); } };
  }
};

// ---------- прогоняем все клиентские функции ----------
const t = Date.now();
productListAll_();
productInfoMap_(['A']);
pricesMap_(['A'], { done: true });
stocksMap_(['A'], { done: true });
actionsList_();
actionProducts_(7);
analyticsAll_(['revenue', 'ordered_units'], ['sku'], '2026-09-01', '2026-09-14');
fboPostingsWithFinance_('2026-09-01T00:00:00+03:00', '2026-09-14T23:59:59+03:00');
fbsPostingsWithFinance_('2026-09-01T00:00:00+03:00', '2026-09-14T23:59:59+03:00');
realizationByDay_(2026, 9, 30);
realizationMonth_(2026, 9);
apiRoles_();
importPrices_([{ offer_id: 'A', price: '100', old_price: '120', min_price: '90', vat: '0.22' }]);
testSellerConnection_();

// ---------- проверяем ----------
function bad(msg) { fails.push(msg); }
const fails = [];
const checked = {};
SENT.forEach(function (r) {
  const spec = SCHEMA[r.path];
  if (!spec) { bad('метод ' + r.path + ' не описан в схеме (проверьте ozon_paths.json)'); return; }
  checked[r.path] = (checked[r.path] || 0) + 1;
  const body = r.body;
  if (!spec.fields || !Object.keys(spec.fields).length) return;   // тело не описано / пустое
  if (body === null || body === undefined) {
    if ((spec.required || []).length) bad(r.path + ': тело пустое, а обязательны ' + spec.required.join(', '));
    return;
  }
  const allowed = Object.keys(spec.fields);
  Object.keys(body).forEach(function (k) {
    if (allowed.indexOf(k) < 0) bad(r.path + ': ЛИШНЕЕ ПОЛЕ «' + k + '» (допустимы: ' + allowed.join(', ') + ')');
  });
  (spec.required || []).forEach(function (k) {
    if (body[k] === undefined || body[k] === null) bad(r.path + ': НЕ ХВАТАЕТ обязательного «' + k + '»');
  });
  // вложенные объекты на один уровень
  allowed.forEach(function (k) {
    const sub = spec.fields[k];
    if (!Array.isArray(sub) || !sub.length) return;
    let v = body[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.keys(v).forEach(function (kk) {
        if (sub.indexOf(kk) < 0) bad(r.path + ': ЛИШНЕЕ ПОЛЕ «' + k + '.' + kk + '» (допустимы: ' + sub.join(', ') + ')');
      });
    } else if (Array.isArray(v)) {
      v.forEach(function (el, i) {
        if (el && typeof el === 'object' && !Array.isArray(el)) {
          Object.keys(el).forEach(function (kk) {
            if (sub.indexOf(kk) < 0) bad(r.path + ': ЛИШНЕЕ ПОЛЕ «' + k + '[' + i + '].' + kk + '» (допустимы: ' + sub.join(', ') + ')');
          });
        }
      });
    }
  });
  // лимиты
  if (r.path === '/v3/posting/fbo/list' && body.limit > 100) bad('fbo/list: limit ' + body.limit + ' > 100 (максимум по схеме)');
  if (r.path === '/v1/analytics/data' && body.limit > 1000) bad('analytics/data: limit ' + body.limit + ' > 1000');
});

console.log('========== ВАЛИДАТОР ЗАПРОСОВ ПО СХЕМЕ OZON ==========');
console.log('запросов отправлено:', SENT.length);
Object.keys(checked).sort().forEach(function (p) { console.log('  ✓', p, '—', checked[p], 'запрос(ов)'); });
// чего не хватает в покрытии
Object.keys(SCHEMA).forEach(function (p) {
  if (!checked[p] && p !== '/v1/finance/accrual/types' && p !== '/v1/finance/accrual/postings' &&
      p !== '/v1/finance/accrual/by-day' && p !== '/v1/finance/realization/posting' && p !== '/v1/returns/list')
    console.log('  ⚠ метод не вызван ни разу:', p);
});
if (fails.length) {
  console.log('\nОШИБОК:', fails.length);
  fails.forEach(function (f) { console.log('  ✗', f); });
  process.exitCode = 1;
} else {
  console.log('\nВСЕ ТЕЛА ЗАПРОСОВ СООТВЕТСТВУЮТ ОФИЦИАЛЬНОЙ СХЕМЕ ✓');
}
console.log('время:', Date.now() - t, 'мс');
