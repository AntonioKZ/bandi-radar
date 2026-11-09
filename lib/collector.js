const crypto = require('node:crypto');
const HOSTS = ['mimit.gov.it','invitalia.it','bandi.regione.lombardia.it','openinnovation.regione.lombardia.it','euroinfosicilia.it','ec.europa.eu','cinea.ec.europa.eu','eic.ec.europa.eu'];
const RELEVANT = /incentiv|band[oi]|accord[oi]|contratt|automotive|ricerca|innovaz|energ|digital|cyber|horizon|funding|call|step|idrogen|elettronic|competenze|sostenib/i;
function allowed(value) {
 try { const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&HOSTS.some(h=>u.hostname===h||u.hostname==='www.'+h); } catch{return false;}
}
function plain(s) {
 return String(s).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&(?:nbsp|#160);/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const v=/^x/i.test(n)?parseInt(n.slice(1),16):Number(n);return v>0&&v<=0x10ffff?String.fromCodePoint(v):' ';}).replace(/&(?:quot|#34);/g,'"').replace(/&apos;/g,"'").replace(/\s+/g,' ').trim();
}
function canonical(value,base) {
 try { const u=new URL(value.replace(/&amp;/g,'&'),base);u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);u.searchParams.sort();if(u.pathname!=='/')u.pathname=u.pathname.replace(/\/+$/,'');return allowed(u.href)?u.href:null;}catch{return null;}
}
function identity(url) { const u=new URL(url);u.hostname=u.hostname.replace(/^www\./,'');return u.href; }
function anchors(html,base) {
 const result=[];
 for(const m of html.matchAll(/<a\b([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)){
  const url=canonical(m[2],base);if(url)result.push({url,title:plain(m[4]),attributes:m[1]+' '+m[3]});
 }return result;
}
function extract(html,base) {
 const found=new Map(),origin=new URL(base).hostname.replace(/^www\./,'');
 for(const item of anchors(html,base)){
  const {url,title}=item,u=new URL(url);
  // A source must not import navigation links to another funding portal.
  if(u.hostname.replace(/^www\./,'')!==origin||title.length<12||title.length>500||/\.(pdf|jpg|png|zip)(\?|$)/i.test(url))continue;
  if(!RELEVANT.test(title)||identity(url)===identity(canonical(base,base)))continue;
  if(/privacy|cookie|accessibilit|contatt|login|^(tutti i|elenco|cerca|scopri|leggi|vai a|bandi e servizi$|incentivi e strumenti$|ricerca e innovazione$)/i.test(title))continue;
  if(/\brel\s*=\s*["'][^"']*\bnext\b/i.test(item.attributes))continue;
  found.set(identity(url),{url,title});
 }return [...found.values()];
}
function nextPages(html,base) {
 const origin=new URL(base);return anchors(html,base).filter(a=>{
  const u=new URL(a.url);return u.origin===origin.origin&&u.pathname===origin.pathname&&u.search!==origin.search&&(/\brel\s*=\s*["'][^"']*\bnext\b/i.test(a.attributes)||/^(successiv[ao]|next|avanti|[›»])$/i.test(a.title));
 }).map(a=>a.url);
}
async function fetchHtml(url,fetcher=fetch,deadline=Date.now()+15000) {
 for(let hop=0;hop<4;hop++){
  if(!allowed(url))throw new Error('url_not_allowed');
  const remaining=deadline-Date.now();if(remaining<=0)throw new Error('source_time_budget');
  const r=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(Math.min(6000,remaining)),headers:{'user-agent':'BandiRadarMI/7.1 (+official-source-monitor)','accept':'text/html,application/xhtml+xml'}});
  if(r.status>=300&&r.status<400){const location=r.headers.get('location');if(!location)throw new Error('redirect_without_location');url=new URL(location,url).href;await r.body?.cancel();continue;}
  if(!r.ok){await r.body?.cancel();throw new Error('http_'+r.status);}
  if(!/text\/html|application\/xhtml\+xml/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();throw new Error('unsupported_content');}
  const reader=r.body.getReader();let text='',size=0;const decoder=new TextDecoder();
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3000000)throw new Error('response_too_large');text+=decoder.decode(value,{stream:true});}}finally{await reader.cancel();}
  return {html:text+decoder.decode(),url};
 }throw new Error('redirect_limit');
}
const INSERT_CANDIDATES = `INSERT INTO opportunities (id,source_id,title,official_url,status,program,summary)
SELECT item.id,$1,item.title,item.url,'review','Da verificare',$3
FROM jsonb_to_recordset($2::jsonb) AS item(id text,title text,url text)
WHERE NOT EXISTS (SELECT 1 FROM opportunities o WHERE
rtrim(regexp_replace(o.official_url,'^https://www[.]','https://'),'/') = rtrim(regexp_replace(item.url,'^https://www[.]','https://'),'/'))
ON CONFLICT (id) DO NOTHING RETURNING id`;
async function scanSource(client,source,fetcher=fetch,options={}) {
 const started=new Date(),deadline=Math.min(Date.now()+18000,options.deadline||Infinity);
 let discovered=0,inserted=0,status='failed',note='',pages=0;const errors=[];
 const run=await client.query('INSERT INTO scan_runs (source_id,started_at,status) VALUES ($1,$2,\'running\') RETURNING id',[source.id,started]);
 try {
  const queue=[source.official_url],visited=new Set(),found=new Map();
  while(queue.length&&pages<3&&Date.now()<deadline){
   const url=queue.shift();if(visited.has(url))continue;visited.add(url);
   try{const page=await fetchHtml(url,fetcher,deadline);pages++;for(const item of extract(page.html,page.url))found.set(identity(item.url),item);for(const next of nextPages(page.html,page.url))if(!visited.has(next))queue.push(next);}
   catch(e){errors.push(String(e.message).slice(0,100));}
  }
  discovered=found.size;
  if(!discovered)throw new Error(errors[0]||'no_extractable_opportunities');
  const items=[...found.values()].slice(0,150).map(item=>({id:'discovered-'+crypto.createHash('sha256').update(identity(item.url)).digest('hex').slice(0,24),title:item.title,url:item.url}));
  inserted=(await client.query(INSERT_CANDIDATES,[source.id,JSON.stringify(items),'Segnalazione automatica da pagina ufficiale. Beneficiari, termini e ammissibilità NON verificati; può trattarsi di una notizia o di un aggiornamento.'])).rowCount;
  status='partial';note=JSON.stringify({version:'7.2.0',coverage:'bounded_listings',pages,discovered,processed:items.length,inserted,more_pages:queue.length>0,errors,limitation:'Max 3 pagine HTML e 150 candidati; PDF, contenuti dinamici e requisiti richiedono revisione.'});
 }catch(e){note=JSON.stringify({version:'7.2.0',coverage:'failed',pages,reason:String(e.message).slice(0,160),errors});}
 await client.query('UPDATE scan_runs SET finished_at=now(),status=$2,discovered=$3,inserted=$4,updated=0,error_message=$5 WHERE id=$1',[run.rows[0].id,status,discovered,inserted,note]);
 await client.query('UPDATE sources SET scan_status=$2,updated_at=now() WHERE id=$1',[source.id,status]);
 return {source_id:source.id,status,discovered,inserted,pages};
}
module.exports={allowed,plain,canonical,identity,extract,nextPages,fetchHtml,scanSource,INSERT_CANDIDATES};
