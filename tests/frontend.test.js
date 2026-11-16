const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function context(){const elements=new Map();const context={localStorage:{getItem(){throw Error('storage disabled')}},document:{getElementById(id){if(!elements.has(id))elements.set(id,{value:({territory:'Tutti i territori',min:'0'})[id]||'',innerHTML:'',textContent:''});return elements.get(id)}},grants:[],sourceRegistry:[],setTimeout,clearTimeout,Date};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),context);return context;}
test('frontend boots when local storage unavailable',()=>assert.ok(context()));
test('unverified candidates cannot be recommended for applying',()=>{const c=context();assert.equal(vm.runInContext("classify({officialStatus:'REVIEW'}) .k",c),'VERIFICARE')});
test('recorded partner decision is retained',()=>{const c=context();assert.equal(vm.runInContext("classify({what:'PARTNER · Priorità A',program:'R&S',officialStatus:'OPEN'}) .k",c),'PARTNER')});
test('ISO deadlines are parsed instead of invalid concatenation',()=>{const c=context();assert.equal(vm.runInContext("Number.isFinite(days({deadline:'2027-02-02T00:00:00.000Z'}))",c),true)});
test('closed measures override recorded positive decisions',()=>{const c=context();assert.equal(vm.runInContext("classify({what:'CANDIDARSI',program:'R&S',officialStatus:'CLOSED'}) .k",c),'SCARTARE')});
test('high technical affinity alone never authorizes applying',()=>{const c=context();assert.equal(vm.runInContext("classify({what:'Descrizione ricerca',program:'R&S',officialStatus:'OPEN',sectors:['Energia','Elettronica','Digitalizzazione'],kw:['AI','IoT','digital twin','energia','automazione'],territory:['Italia']}).k",c),'VERIFICARE')});
test('mentioning a decision in prose does not override assessment',()=>{const c=context();assert.notEqual(vm.runInContext("classify({what:'Non CANDIDARSI senza valutazione',program:'R&S',officialStatus:'OPEN',sectors:[],kw:[],territory:[]}).k",c),'CANDIDARSI')});
test('more than 50 cards are deferred until requested',()=>{const c=context();c.grants=Array.from({length:70},(_,i)=>({id:'x'+i,title:'Bando '+i,what:'Da verificare',officialStatus:'REVIEW',type:'R&S',sectors:[],kw:[],territory:[],expenses:[],fit:[],risks:[]}));vm.runInContext('render()',c);const html=c.document.getElementById('grantGrid').innerHTML;assert.equal((html.match(/class="grant"/g)||[]).length,50);assert.match(html,/Mostra altre 50/)});
test('source filter selects MIMIT and combines with keyword search',()=>{const c=context();const item=(id,sourceId,title)=>({id,sourceId,title,source:'Portale',what:'Da verificare',officialStatus:'REVIEW',type:'R&S',sectors:[],kw:[],territory:[],expenses:[],fit:[],risks:[]});c.grants=[item('a','mimit','Automotive'),item('b','invitalia','Automotive'),item('c','mimit','Energia')];c.document.getElementById('sourceFilter').value='mimit';c.document.getElementById('q').value='automotive';vm.runInContext('render()',c);const html=c.document.getElementById('grantGrid').innerHTML;assert.match(html,/detail\('a'\)/);assert.doesNotMatch(html,/detail\('b'\)|detail\('c'\)/);assert.equal(c.document.getElementById('resultCount').textContent,'1 opportunità trovate su 3');c.document.getElementById('sourceFilter').value='';vm.runInContext('render()',c);assert.match(c.document.getElementById('grantGrid').innerHTML,/detail\('b'\)/)});

test('deadline order keeps missing dates at the end and supports rolling windows',()=>{
 const c=context();
 const item=(id,deadline)=>({id,deadline,title:'Bando '+id,what:'Da verificare',officialStatus:'REVIEW',type:'R&S',sectors:[],kw:[],territory:[],expenses:[],fit:[],risks:[]});
 const today=vm.runInContext('todayInRome()',c);
 const iso=days=>new Date(today+days*86400000).toISOString().slice(0,10);
 c.grants=[item('missing',null),item('later',iso(31)),item('soon',iso(7)),item('past',iso(-1)),item('today',iso(0))];
 const filter=c.document.getElementById('deadlineFilter');
 const order=c.document.getElementById('deadlineOrder');
 const ids=()=>{vm.runInContext('render()',c);return Array.from(c.document.getElementById('grantGrid').innerHTML.matchAll(/detail\('([^']+)'\)/g),match=>match[1]);};
 order.value='earliest';
 assert.deepEqual(ids(),['today','soon','later','missing']);
 filter.value='7';
 assert.deepEqual(ids(),['today','soon']);
 filter.value='';
 order.value='latest';
 assert.deepEqual(ids(),['later','soon','today','missing']);
 filter.value='unknown';
 assert.deepEqual(ids(),['missing']);
});

test('classifies Sicilian notices separately from funding and unverified candidates',()=>{
 const c=context();
 const kind=(title,officialStatus='REVIEW')=>{
   c.sample={title,officialStatus};
   return vm.runInContext('noticeKind(sample)',c);
 };
 assert.equal(kind('Avviso STEP - FAQ aggiornate al 31/08/2026'),'FAQ o chiarimenti');
 assert.equal(kind('Approvazione graduatoria provvisoria Avviso Ripresa Sicilia Plus'),'Graduatoria o esito');
 assert.equal(kind('Avviso STEP - proroga dei termini'),'Proroga o riapertura');
 assert.equal(kind('OPEN INNOVATION SICILIA - Avvisi per la selezione'),'Segnalazione da verificare');
 assert.equal(kind('Accordi per l’innovazione Automotive','OPEN'),'Bando o misura');
});

test('archives past deadlines and funding exhaustion without duplicating active results',()=>{
 const c=context();
 const item=(id,deadline,officialStatus,what='')=>({id,deadline,officialStatus,what,title:id,type:'R&S',sectors:[],kw:[],territory:[],expenses:[],fit:[],risks:[]});
 c.grants=[
   item('expired','2000-01-01','OPEN'),
   item('exhausted',null,'CLOSED','Sportello sospeso per esaurimento risorse'),
   item('active','2099-01-01','OPEN')
 ];
 vm.runInContext('render()',c);
 const live=c.document.getElementById('grantGrid').innerHTML;
 const archive=c.document.getElementById('archiveGrid').innerHTML;
 assert.match(live,/detail\('active'\)/);
 assert.doesNotMatch(live,/expired|exhausted/);
 assert.match(archive,/Scaduto/);
 assert.match(archive,/Fondi esauriti/);
 c.document.getElementById('deadlineFilter').value='past';
 vm.runInContext('render()',c);
 assert.match(c.document.getElementById('archiveGrid').innerHTML,/detail\('expired'\)/);
 assert.doesNotMatch(c.document.getElementById('archiveGrid').innerHTML,/exhausted/);
});
