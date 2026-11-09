(async function loadRadar() {
  const banner = document.createElement('div');
  banner.id = 'live-status';
  banner.setAttribute('role', 'status');
  banner.style.cssText = 'padding:12px;margin:12px 0;border:1px solid #ccd5e1;border-radius:10px;font-size:13px';
  document.querySelector('.top').after(banner);
  banner.textContent = 'Connessione ai dati Neon in corso…';
  const safeUrl = (v) => { try { const u = new URL(String(v)); return u.protocol === 'https:' ? u.href : '#'; } catch { return '#'; } };
  const safe = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  try {
    let data;const records=new Map();let next=0,pages=0;
    do{
      const response=await fetch('/api/radar?offset='+next,{cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const page=await response.json();
      if(!Array.isArray(page.opportunities)||!Array.isArray(page.sources))throw new Error('invalid_schema');
      data ||= page;
      for(const item of page.opportunities)records.set(item.id,item);
      const cursor=page.nextOffset;
      if(cursor!=null&&(!Number.isInteger(cursor)||cursor<=next))throw new Error('invalid_pagination');
      next=cursor;pages++;
    }while(next!=null&&pages<10);
    data.opportunities=[...records.values()];data.truncated=next!=null;
    if (!Array.isArray(data.opportunities) || !Array.isArray(data.sources)) throw new Error('invalid_schema');
    const scanMap = new Map((data.lastScans || []).map(x => [x.source_id,x]));
    const sourceMap=new Map(data.sources.map(s=>[s.id,s]));
    grants = data.opportunities.filter(o => typeof o.id === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(o.id)).map(o => {
      const state = (o.status || 'da verificare').toUpperCase();
      const closed = /CLOSED|CHIUS|SOSPES|EXHAUST|SCADUT/.test(state);
      return {
        id: safe(o.id), title: safe(o.title), program:safe(o.program||''), type: /formaz/i.test(o.program || '') ? 'Formazione' : /invest/i.test(o.program || '') ? 'Investimenti' : 'R&S',
        sourceId: String(o.source_id||''), source: safe(sourceMap.get(o.source_id)?.name || o.source_id || 'Portale non indicato'), sourcePortal: safe(safeUrl(sourceMap.get(o.source_id)?.official_url)), territory: (o.territory || []).map(safe),
        date: closed ? 'NON CANDIDABILE · ' + state : 'Stato registrato: ' + state,
        deadline: o.deadline ? String(o.deadline).slice(0,10) : null,
        grant: o.grant_rate == null ? 'Da verificare' : (Number(o.grant_rate)>0 && Number(o.grant_rate)<1 ? Number(o.grant_rate)*100 : Number(o.grant_rate)) + '% (verificare regime)',
        budget: o.budget_eur == null ? 'Da verificare' : Number(o.budget_eur).toLocaleString('it-IT') + ' € (importo registrato: verificare se dotazione o progetto)',
        beneficiaries: 'Consultare la scheda ufficiale: requisito non ancora strutturato',
        what: safe(o.summary || 'Descrizione da verificare'), expenses: [], partners: 'Da verificare',
        sectors: (o.sectors || []).map(safe), kw: (o.keywords || []).map(safe), fit: [],
        risks: closed ? ['Sportello chiuso o sospeso: non presentare nuove domande'] : ['Verificare requisiti e stato prima della candidatura'],
        next: closed ? 'Monitorare eventuale riapertura' : 'Verificare condizioni ufficiali',
        url: safe(safeUrl(o.official_url)), fresh: Boolean(o.first_seen_at && Date.now()-Date.parse(o.first_seen_at)>=0 && Date.now()-Date.parse(o.first_seen_at)<7*86400000), officialStatus: state
      };
    });
    const sourceFilter=document.getElementById('sourceFilter');
    const previousSource=sourceFilter.value;
    const counts=new Map();for(const o of grants)counts.set(o.sourceId,(counts.get(o.sourceId)||0)+1);
    const choices=new Map(data.sources.map(s=>[String(s.id),String(s.name||s.id)]));
    for(const o of grants)if(!choices.has(o.sourceId))choices.set(o.sourceId,o.sourceId||'Portale non indicato');
    sourceFilter.innerHTML='<option value="">Tutte le fonti ('+grants.length+')</option>'+[...choices].sort((a,b)=>a[1].localeCompare(b[1],'it')).filter(([id])=>id).map(([id,name])=>'<option value="'+safe(id)+'">'+safe(name)+' ('+(counts.get(id)||0)+')</option>').join('');
    sourceFilter.value=choices.has(previousSource)?previousSource:'';
    sourceRegistry = data.sources.map(s => ({
      n:s.name,s:s.scope || '',u:safeUrl(s.official_url),d:s.category || '',
      status: !scanMap.has(s.id) ? 'Mai verificata' :
        (/failed|error/.test(scanMap.get(s.id).status) ? 'Errore' :
        scanMap.get(s.id).status==='running' ? (Date.now()-Date.parse(scanMap.get(s.id).last_scan)>4*60000?'Esecuzione interrotta o scaduta':'In corso') :
        scanMap.get(s.id).status==='partial' ? 'Copertura parziale' : 'Controllo registrato (copertura non certificata)')+
        (Date.now()-Date.parse(scanMap.get(s.id).last_scan)>2*86400000?' · controllo obsoleto':''),
      last:scanMap.has(s.id) ? new Date(scanMap.get(s.id).last_scan).toLocaleString('it-IT',{timeZone:'Europe/Rome'}) : 'non disponibile',
      found:data.opportunities.filter(o=>o.source_id===s.id).length
    }));
    document.getElementById('sourcegrid').innerHTML = sourceRegistry.map(x =>
      '<div class="source"><b>'+safe(x.n)+'</b><p>'+safe(x.status)+'</p><div class="muted">'+safe(x.s)+' · ultima scansione '+safe(x.last)+'</div><p>'+safe(x.d)+'</p><a target="_blank" rel="noopener noreferrer" href="'+safe(x.u)+'">Fonte ufficiale ↗</a></div>'
    ).join('');
    banner.textContent = 'Versione 7.3 · Dati live Neon · '+grants.length+' opportunità · risposta '+new Date(data.servedAt).toLocaleString('it-IT',{timeZone:'Europe/Rome'})+'. '+(data.truncated?'ATTENZIONE: caricamento limitato a 5.000 record. ':'')+'Le segnalazioni automatiche richiedono verifica; la copertura delle fonti può essere parziale.';
    const expense=document.getElementById('expense');expense.value='';expense.disabled=true;expense.title='Spese non ancora strutturate nei record: consultare le schede ufficiali.';
    render();
  } catch (e) {
    grants=[];sourceRegistry=[];render();document.getElementById('sourcegrid').textContent='Stato delle fonti non disponibile.';banner.textContent = 'Database non raggiungibile: elenco non disponibile. Riprovare più tardi.';
    console.warn('live_radar_unavailable', e.message);
  }
})();
