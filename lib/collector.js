const crypto = require('node:crypto');
const HOSTS = ['mimit.gov.it','invitalia.it','bandi.regione.lombardia.it','openinnovation.regione.lombardia.it','euroinfosicilia.it','ec.europa.eu','cinea.ec.europa.eu','eic.ec.europa.eu'];
function allowed(value) { try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password && (!u.port || u.port==='443') && HOSTS.some(h=>u.hostname===h || u.hostname==='www.'+h); } catch { return false; } }
function plain(s) { return String(s).replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&(?:nbsp|#160);/g,' ').replace(/&#(\d+);/g,(_,n)=>Number(n)<=65535?String.fromCharCode(+n):' ').replace(/&(?:quot|#34);/g,'"').replace(/\s+/g,' ').trim(); }
function canonical(value,base) { try { const u=new URL(value.replace(/&amp;/g,'&'),base); u.hash=''; for(const k of [...u.searchParams.keys()]) if(/^utm_|^(fbclid|gclid)$/.test(k))u.searchParams.delete(k); return allowed(u.href)?u.href:null; } catch{return null;} }
function extract(html,base) {
 const found=new Map();
 for(const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
  const url=canonical(m[1],base),title=plain(m[2]);
  if(!url || title.length<12 || /\.(pdf|jpg|png|zip)(\?|$)/i.test(url))continue;
  if(!/incentiv|band[oi]|accord[oi]|contratt|automotive|ricerca|innovaz|energ|digital|cyber|horizon|funding|call|step|idrogen|elettronic|competenze|sostenib/i.test(title+' '+url))continue;
  if(url===canonical(base,base) || /privacy|cookie|accessibilit|contatt|login/i.test(title))continue;
  found.set(url,{url,title});
 }
 return [...found.values()];
}
async function fetchHtml(url,fetcher=fetch) {
 for(let hop=0;hop<4;hop++) {
  if(!allowed(url))throw new Error('url_not_allowed');
  const r=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{'user-agent':'BandiRadarMI/7.0 (+official-source-monitor)','accept':'text/html,application/xhtml+xml'}});
  if(r.status>=300&&r.status<400){url=new URL(r.headers.get('location'),url).href;continue;}
  if(!r.ok)throw new Error('http_'+r.status);
  if(!/html|xml/i.test(r.headers.get('content-type')||''))throw new Error('unsupported_content');
  const reader=r.body.getReader();let text='',size=0;const decoder=new TextDecoder();
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3000000)throw new Error('response_too_large');text+=decoder.decode(value,{stream:true});}}finally{await reader.cancel();}
  return {html:text+decoder.decode(),url};
 }
 throw new Error('redirect_limit');
}
const INSERT_CANDIDATES = `INSERT INTO opportunities (id,source_id,title,official_url,status,program,summary)
SELECT item.id,$1,item.title,item.url,'review','Da verificare',$3
FROM jsonb_to_recordset($2::jsonb) AS item(id text,title text,url text)
WHERE NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.official_url=item.url)
ON CONFLICT (id) DO NOTHING RETURNING id`;
async function scanSource(client,source,fetcher=fetch) {
 const started=new Date(); let discovered=0,inserted=0,status='failed',note='';
 const run=await client.query('INSERT INTO scan_runs (source_id,started_at,status) VALUES ($1,$2,\'running\') RETURNING id',[source.id,started]);
 try {
  const page=await fetchHtml(source.official_url,fetcher);const links=extract(page.html,page.url);discovered=links.length;
  if(!links.length)throw new Error('no_extractable_opportunities');
  const items=links.slice(0,150).map(item=>({id:'discovered-'+crypto.createHash('sha256').update(item.url).digest('hex').slice(0,24),title:item.title.slice(0,500),url:item.url}));
  const result=await client.query(INSERT_CANDIDATES,[source.id,JSON.stringify(items),'Segnalazione automatica da pagina ufficiale. Beneficiari, termini e ammissibilità NON verificati; può trattarsi di una notizia o di un aggiornamento.']);
  inserted=result.rowCount;
  status='partial'; note=JSON.stringify({version:'7.0.1',coverage:'listing_only',discovered,processed:items.length,inserted,limitation:'HTML listing only; pagination, PDFs and detail eligibility not exhaustively checked'});
 }catch(e){note=JSON.stringify({version:'7.0.1',coverage:'failed',reason:String(e.message).slice(0,160)});}
 await client.query('UPDATE scan_runs SET finished_at=now(),status=$2,discovered=$3,inserted=$4,updated=0,error_message=$5 WHERE id=$1',[run.rows[0].id,status,discovered,inserted,note]);
 await client.query('UPDATE sources SET scan_status=$2,updated_at=now() WHERE id=$1',[source.id,status]);
 return {source_id:source.id,status,discovered,inserted};
}
module.exports={allowed,plain,canonical,extract,fetchHtml,scanSource,INSERT_CANDIDATES};
