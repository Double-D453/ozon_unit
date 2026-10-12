#!/bin/sh
# Тестовый стенд читает код как .js, а Apps Script хранит его как .gs.
# Перед прогоном скопировать файлы каркаса в tests/ под именами, которые ждёт all.js.
set -e
cd "$(dirname "$0")"
for f in ../appsscript/*.gs; do
  cp "$f" "$(basename "$f" .gs).js"
done
echo "скопировано $(ls ..//appsscript/*.gs | wc -l) файлов"
