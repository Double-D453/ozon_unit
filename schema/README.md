# Схема Ozon Seller API

## Что здесь

| Файл | Размер | Содержание |
|---|---|---|
| `ozon-seller-api-openapi.json` | 4,2 МБ | **Полная официальная OpenAPI-схема Seller API**, 482 пути |
| `ozon_paths.json` | 4 КБ | Выжимка: тела запросов **19 методов**, которыми пользуется проект |

## Откуда взято

Публичное ежедневное зеркало официальной схемы:

```bash
curl -o ozon-seller-api-openapi.json \
  https://raw.githubusercontent.com/vispar-tech/ozon-seller-api-schema/main/schemas/ozon-seller-api-openapi.json
```

Снято **08.10.2026**. Ozon отключает методы без длительного переходного периода
(за 2025–2026 отключено три, см. `../docs/API-MAP.md` §12), поэтому дата снятия
имеет значение — она записана намеренно.

## Зачем полная схема, если тесты читают только выжимку

Выжимка нужна, чтобы тесты не грузили 4,2 МБ на каждый прогон. Полная схема —
чтобы выжимку можно было **пересобрать и проверить**, а не верить ей на слово.
Извлечение делается рекурсивным обходом `components.schemas` с разрешением `$ref`.

⚠ **Известная ловушка извлечения:** фильтр ключей вида
`{k: v for k, v in node.items() if k in KEEP}` даёт пустой `fields`, потому что
применяется и внутри `properties`, где ключи — **имена полей**, а не слова из
KEEP. Рекурсия должна идти без фильтрации имён. Две первые попытки извлечения
выдали пустые схемы именно по этой причине.

## Как обновлять

1. Скачать свежую схему (команда выше).
2. Пересобрать выжимку по списку методов из `../core/ozon-endpoints.js`.
3. Прогнать `TESTFILE=schema.js node ../tests/all.js` — покажет, какие тела
   запросов перестали соответствовать.
4. Прогнать `TESTFILE=negative.js node ../tests/all.js` — подтвердит, что
   валидатор по-прежнему ловит неверные тела, а не молчит.

## Какие 19 методов в выжимке

```
/v1/roles                          /v1/finance/realization/by-day
/v3/product/list                   /v2/finance/realization
/v3/product/info/list              /v1/finance/realization/posting
/v5/product/info/prices            /v1/finance/accrual/postings
/v4/product/info/stocks            /v1/finance/accrual/types
/v1/analytics/data                 /v1/finance/accrual/by-day
/v1/actions                        /v1/product/import/prices
/v1/actions/products               /v1/returns/list
/v3/posting/fbo/list               /v1/delivery-method/list
/v3/posting/fbs/list
```

`/v1/delivery-method/list` в выжимке есть, но кодом не вызывается — валидатор
честно сообщает об этом как о непокрытом методе.
