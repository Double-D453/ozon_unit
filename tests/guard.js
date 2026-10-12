const ENV = makeEnv();
const SpreadsheetApp = ENV.SpreadsheetApp, PropertiesService = ENV.PropertiesService,
      Utilities = ENV.Utilities, Session = ENV.Session;
const CAMS = [];
for (let i=0;i<200;i++) CAMS.push({id:String(22600000+i), title:'Активная '+i, state:'CAMPAIGN_STATE_RUNNING', advObjectType:'SKU', fromDate:'2026-01-01', toDate:'2027-01-01'});
perfCampaigns_ = function(){ return CAMS.slice(); };
let WAVES = 0;
perfReportsParallel_ = function(chunks){
  WAVES++;
  return chunks.map(function(ch){ return { ids: ch.map(function(c){return String(c.id);}), files: ch.map(function(c){
    return { file: c.id+'_x', csv: '\uFEFF;Кампания по продвижению товаров № '+c.id+', период 25.09.2026-09.10.2026\nДень;sku;Расход, ₽, с НДС;Продажи в продвижении, ₽;ДРР, %\nВсего;;;0,00;0,00;0,00\n25.09.2026;907795882;10,00;100,00;10,00\n' }; }) }; });
};
const nom = SpreadsheetApp._get('Номенклатура');
nom.getRange(1,1,1,16).setValues([['Offer id','SKU','Наименование','a','b','c','d','e','f','g','h','i','j','k','l','p']]);
nom.getRange(2,1,1,16).setValues([['Кромка-Дуб', 907795882,'Кромка','','','','','','','','','','','','','']]);
SpreadsheetApp._get('Параметры').getRange(1,1,5,3).setValues([['x','',''],['','',''],['a','b','c'],['ДРР',0.15,''],['Эквайринг',0.015,'']]);

// время: каждый вызов Date.now() +40 секунд → предохранитель 4,5 мин сработает на ~7-й волне
const real = Date.now; let t = real(); let calls = 0;
Date.now = function(){ calls++; if (calls > 3) t += 40000; return t; };
const r1 = syncDrr(14);
Date.now = real;
console.log('\n>>> ПРОГОН 1 (обрыв по времени):', JSON.stringify(r1));
console.log('>>> волн:', WAVES);
const r2 = syncDrr(14);
console.log('\n>>> ПРОГОН 2 (продолжение):', JSON.stringify(r2));
const r3 = syncDrr(14);
console.log('\n>>> ПРОГОН 3:', JSON.stringify(r3));
console.log('\n>>> строк на листе «Реклама ДРР»:', SpreadsheetApp._get('Реклама ДРР').getLastRow());
console.log('>>> накоплено:', JSON.stringify(SpreadsheetApp._get('Реклама ДРР').getRange(2,1,1,14).getValues()[0]));
console.log('>>> запомнено кампаний:', propListGet_('DRR_DONE').length, '(в 2 свойствах:', Object.keys(ENV.store).filter(k=>k.indexOf('DRR_DONE')===0).join(',')+')');
