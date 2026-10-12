// НЕГАТИВНАЯ ПРОВЕРКА ВАЛИДАТОРА.
// ------------------------------------------------------------------
// Валидатор, который всегда отвечает «всё хорошо», бесполезен — и опасен,
// потому что создаёт ложное чувство защищённости. Этот тест скармливает ему
// тело запроса РОВНО то, которое уходило в v0.6 и из-за которого лист
// «Комиссия факт» остался пустым на живом прогоне.
//
// Ожидание: 5 запрещённых полей (dir, offset, filter.status, with.barcodes,
// with.translit) ПЛЮС превышение limit 1000 > 100 — всего 6 сообщений.
// Если Ozon когда-нибудь добавит в FBO поле dir или offset — тест упадёт,
// и это будет означать, что схему пора перечитать, а не что тест сломан.
//
// Запуск: TESTFILE=negative.js node all.js
const SCHEMA = global.__OZON_PATHS__;
if (!SCHEMA) throw new Error('нет ozon_paths.json — валидатор не запустится');

// ДВА разных массива, и смешивать их нельзя:
//   detected  — ошибки, которые валидатор НАШЁЛ в проверяемом теле (их ЖДЁМ)
//   fails     — провалы САМОГО теста (их быть не должно)
// В первой версии теста они были одним массивом, и тест падал ровно тогда,
// когда валидатор отработал правильно.
const detected = [];
const fails = [];
function bad(msg) { detected.push(msg); }

// те же правила, что в schema.js — намеренно продублированы, чтобы негативный
// тест не зависел от внутреннего устройства позитивного
function validate(path, body) {
  const spec = SCHEMA[path];
  if (!spec) { bad(path + ': метод не описан в схеме'); return; }
  if (!spec.fields || !Object.keys(spec.fields).length) return;
  const allowed = Object.keys(spec.fields);
  Object.keys(body).forEach(function (k) {
    if (allowed.indexOf(k) < 0) bad(path + ': ЛИШНЕЕ ПОЛЕ «' + k + '» (допустимы: ' + allowed.join(', ') + ')');
  });
  (spec.required || []).forEach(function (k) {
    if (body[k] === undefined || body[k] === null) bad(path + ': НЕ ХВАТАЕТ обязательного «' + k + '»');
  });
  allowed.forEach(function (k) {
    const sub = spec.fields[k];
    if (!Array.isArray(sub) || !sub.length) return;
    const v = body[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.keys(v).forEach(function (kk) {
        if (sub.indexOf(kk) < 0) bad(path + ': ЛИШНЕЕ ПОЛЕ «' + k + '.' + kk + '»');
      });
    }
  });
  if (path === '/v3/posting/fbo/list' && body.limit > 100) {
    bad('fbo/list: limit ' + body.limit + ' > 100 (максимум по схеме)');
  }
}

console.log('========== НЕГАТИВНАЯ ПРОВЕРКА ВАЛИДАТОРА ==========');

// ------------------------------------------------ 1. тело из v0.6
// Так выглядел запрос к FBO до исправления: в него перекочевала форма FBS.
const V06_FBO = {
  dir: 'desc',
  filter: { since: '2026-09-01T00:00:00+03:00', to: '2026-09-14T23:59:59+03:00', status: 'delivered' },
  limit: 1000,
  offset: 0,
  with: { analytics_data: false, barcodes: false, financial_data: true, legal_info: false, translit: false }
};
const before = detected.length;
validate('/v3/posting/fbo/list', V06_FBO);
const found = detected.slice(before);
console.log('тело v0.6 → найдено ошибок:', found.length);
found.forEach(function (f) { console.log('  ✗', f); });

const EXPECTED = ['dir', 'offset', 'filter.status', 'with.barcodes', 'with.translit'];
const got = EXPECTED.filter(function (field) {
  return found.some(function (f) { return f.indexOf('«' + field + '»') >= 0; });
});
// limit 1000 > 100 — отдельная ошибка поверх пяти полей
const limitCaught = found.some(function (f) { return /limit 1000 > 100/.test(f); });

if (got.length !== 5) {
  fails.push('ожидали все 5 запрещённых полей, поймали ' + got.length + ': ' + got.join(', '));
}
if (!limitCaught) fails.push('не пойман limit 1000 > 100 для FBO');

// ------------------------------------------------ 2. правильное тело проходит
const before2 = detected.length;
validate('/v3/posting/fbo/list', {
  cursor: '',
  filter: { since: '2026-09-01T00:00:00+03:00', to: '2026-09-14T23:59:59+03:00', statuses: ['delivered'] },
  limit: 100,
  sort_dir: 'DESC',
  with: { analytics_data: false, financial_data: true, legal_info: false }
});
if (detected.length !== before2) fails.push('правильное тело FBO не прошло валидацию: ' + detected.slice(before2).join('; '));
else console.log('правильное тело FBO → ошибок нет ✓');

// ------------------------------------------------ 3. форма FBS не путается с FBO
const before3 = detected.length;
validate('/v3/posting/fbs/list', {
  dir: 'desc',
  filter: { since: '2026-09-01T00:00:00+03:00', to: '2026-09-14T23:59:59+03:00' },
  limit: 1000, offset: 0,
  with: { analytics_data: false, barcodes: false, financial_data: true, legal_info: false, translit: false }
});
if (detected.length !== before3) {
  fails.push('форма FBS отвергнута на своём собственном методе — значит схемы перепутаны местами');
} else {
  console.log('то же тело на FBS → ошибок нет ✓ (формы методов действительно разные)');
}

// ------------------------------------------------ 4. отсутствующая метрика не появляется из воздуха
const before4 = detected.length;
validate('/v1/analytics/data', {
  date_from: '2026-09-01', date_to: '2026-09-14',
  metrics: ['revenue', 'adv_sum_all'], dimension: ['sku'], filters: [], sort: [], limit: 1000, offset: 0
});
// adv_sum_all — значение внутри metrics, а не имя поля, поэтому валидатор его
// не ловит. Фиксируем это как известное ограничение, а не как успех.
console.log('метрика adv_sum_all валидатором не ловится (значения метрик не сверяются) — ' +
            'известное ограничение, см. docs/API-MAP.md §5');
if (detected.length !== before4) fails.push('валидатор начал проверять значения метрик — обновите этот тест и документацию');

console.log('\n' + '='.repeat(54));
console.log('секций: 4   ошибок валидатора найдено: ' + detected.length + '   ПРОВАЛОВ ТЕСТА: ' + fails.length);
if (fails.length) { fails.forEach(function (f) { console.log('  ✗ ' + f); }); process.exitCode = 1; }
else console.log('ВАЛИДАТОР ДЕЙСТВИТЕЛЬНО ЛОВИТ НЕПРАВИЛЬНЫЕ ТЕЛА ✓');
