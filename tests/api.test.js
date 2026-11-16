const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function load(file,env,Pool){const box={require:name=>name==='pg'?{Pool}:require(name),process:{env},Buffer,console,module:{exports:{}}};if(file.includes('/cron/'))box.require=name=>name==='../../lib/collector'?require('../lib/collector'):name==='../../lib/monitored-pages'?require('../lib/monitored-pages'):name==='../../lib/scan-lease'?require('../lib/scan-lease'):name==='pg'?{Pool}:require(name);vm.runInNewContext(fs.readFileSync(file,'utf8'),box);return box.module.exports;}
function response(){return {code:0,body:null,setHeader(){},status(c){this.code=c;return this},json(b){this.body=b;return this}};}
test('cron fails closed without secret and rejects unauthorized calls before DB access',async()=>{for(const [env,expected] of [[{},503],[{CRON_SECRET:'test'},401]]){const fn=load(require.resolve('../api/cron/scan'),env,class{constructor(){throw Error('unexpected DB access')}});const res=response();await fn({method:'GET',headers:{}},res);assert.equal(res.code,expected)}});
test('cron returns controlled unavailable response for DB connection failure',async()=>{const fn=load(require.resolve('../api/cron/scan'),{CRON_SECRET:'test',DATABASE_URL:'test'},class{async connect(){throw Error('offline')}});const res=response();await fn({method:'GET',headers:{authorization:'Bearer test'}},res);assert.equal(res.code,503)});
test('read API includes partial/failed latest attempts and signals record truncation',async()=>{const queries=[];class Pool{async query(q){queries.push(q);return {rows:q.includes('FROM opportunities')?Array.from({length:501},(_,id)=>({id})):[]}}};const fn=load(require.resolve('../api/radar'),{DATABASE_URL:'test'},Pool);const res=response();await fn({method:'GET'},res);assert.equal(res.code,200);assert.equal(res.body.opportunities.length,500);assert.equal(res.body.truncated,true);assert.match(queries[2],/DISTINCT ON/);assert.doesNotMatch(queries[2],/WHERE status/)});

test('manual scans require POST and their dedicated key', async () => {
  const fn=load(require.resolve('../api/cron/scan'),
    {CRON_SECRET:'scheduled',RADAR_ADMIN_KEY:'manual',DATABASE_URL:'test'},
    class { async connect(){throw Error('isolated test DB');} });
  for (const [method,authorization,expected] of [
    ['GET','RadarAdmin manual',401],
    ['POST','RadarAdmin scheduled',401],
    ['POST','Bearer manual',401],
    ['POST','RadarAdmin manual',503]
  ]) {
    const res=response();
    await fn({method,headers:{authorization}},res);
    assert.equal(res.code,expected);
    if(expected===503)assert.equal(res.body.error,'scan_failed');
  }
});

test('manual session cookie supports automatic POST and rejects missing cookie',async()=>{
 const fn=load(require.resolve('../api/cron/scan'),
  {CRON_SECRET:'scheduled',RADAR_ADMIN_KEY:'manual'},
  class{constructor(){throw Error('unexpected DB access');}});
 const login=response();
 let cookie;
 login.setHeader=(name,value)=>{if(name==='Set-Cookie')cookie=value;};
 await fn({method:'POST',headers:{authorization:'RadarAdmin manual'}},login);
 assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
 const authenticated=response();
 await fn({method:'POST',headers:{'x-radar-admin':'1',cookie:cookie.split(';')[0]}},authenticated);
 assert.equal(authenticated.body.error,'database_not_configured');
 const anonymous=response();
 await fn({method:'POST',headers:{'x-radar-admin':'1'}},anonymous);
 assert.equal(anonymous.code,401);
});
