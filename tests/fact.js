const ENV = makeEnv();
const SpreadsheetApp = ENV.SpreadsheetApp, PropertiesService = ENV.PropertiesService,
      Utilities = ENV.Utilities, Session = ENV.Session;

// «Номенклатура»: 3 SKU (один без карточки в Ozon)
const nom = SpreadsheetApp._get('Номенклатура');
nom.getRange(1,1,1,16).setValues([['Offer id','SKU','Наименование','a','b','c','d','e','f','g','h','i','j','k','l','p']]);
nom.getRange(2,1,3,16).setValues([
  ['Кромка-Дуб-44мм-5м.п.', 907795882, 'Кромка Дуб','','','','','','','','','','','','',''],
  ['Кромка-Бук',            907700001, 'Кромка Бук','','','','','','','','','','','','',''],
  ['Нет-в-Ozon',            '',         'Нет карточки','','','','','','','','','','','','','']]);

// РЕАЛЬНЫЙ образец ответа /v5/product/info/prices из лога прогона №3
const REAL = {"acquiring":10.73,"offer_id":"Кромка-Дуб-44мм-5м.п.","product_id":476340284,"volume_weight":0.3,
 "commissions":{"fbo_deliv_to_customer_amount":25,"fbo_direct_flow_trans_max_amount":254,"fbo_direct_flow_trans_min_amount":75,
 "fbo_return_flow_amount":115,"fbs_deliv_to_customer_amount":25,"fbs_direct_flow_trans_min_amount":75,
 "fbs_direct_flow_trans_max_amount":254,"fbs_first_mile_max_amount":10,"fbs_first_mile_min_amount":0,
 "fbs_return_flow_amount":254,"sales_percent_fbo":49.5,"sales_percent_fbs":49.5,"sales_percent_rfbs":49.5,"sales_percent_fbp":49.5},
 "price":{"auto_action_enabled":false,"currency_code":"RUB","marketing_seller_price":1073,"min_price":1615,
 "old_price":2355,"price":1757,"retail_price":0,"vat":0.22,"net_price":0}};
const BUK = JSON.parse(JSON.stringify(REAL));
BUK.offer_id='Кромка-Бук'; BUK.acquiring=4.11; BUK.price.price=680; BUK.price.marketing_seller_price=0;
BUK.price.min_price=700; BUK.price.vat=0.22;

productInfoMap_ = function(o){ const m={}; m['Кромка-Дуб-44мм-5м.п.']={product_id:476340284, sku:'907795882', name:'Кромка Дуб'};
  m['Кромка-Бук']={product_id:476340285, sku:'907700001', name:'Кромка Бук'}; return m; };
pricesMap_ = function(o){ const m={}; m['Кромка-Дуб-44мм-5м.п.']=REAL; m['Кромка-Бук']=BUK; return m; };
stocksMap_ = function(o){ return {'Кромка-Дуб-44мм-5м.п.':{fbo:1,fbs:345}, 'Кромка-Бук':{fbo:0,fbs:12}}; };
productListAll_ = function(){ return [{product_id:476340284,offer_id:'Кромка-Дуб-44мм-5м.п.'},
  {product_id:476340285,offer_id:'Кромка-Бук'},{product_id:9,offer_id:'Mirka-WPF-230x280mm-P400-10'}]; };

const r = syncFact();
console.log('результат:', JSON.stringify(r));
const f = SpreadsheetApp._get('Факт Ozon');
console.log('\nшапка ('+factHeaders_().length+' колонок):', JSON.stringify(f.getRange(1,1,1,22).getValues()[0]));
for (let i=2;i<=f.getLastRow();i++) console.log('строка '+i+':', JSON.stringify(f.getRange(i,1,1,22).getValues()[0]));
console.log('\n--- разбор по Кромке-Дуб ---');
const row = f.getRange(2,1,1,22).getValues()[0];
const h = factHeaders_();
h.forEach(function(x,i){ console.log('  '+String.fromCharCode(65+i)+' '+x+' = '+JSON.stringify(row[i])); });
console.log('\nЭКВАЙРИНГ: Дуб =', row[16], '(ожидали 10.73 из API, НЕ 26.36=1,5%)');
console.log('ЭКВАЙРИНГ: Бук =', f.getRange(3,17).getValues()[0][0], '(ожидали 4.11)');
console.log('цена с акцией Дуб =', row[1], '(marketing_seller_price 1073)');
console.log('цена с акцией Бук =', f.getRange(3,2).getValues()[0][0], '(marketing 0 → должна быть price 680)');
console.log('НДС =', row[5], '% (ожидали 22, не 0.22)');
console.log('\nSKU в «Номенклатуре»:', JSON.stringify(nom.getRange(2,2,3,1).getValues().map(r=>r[0])));
