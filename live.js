(async function loadRadar() {
  const banner = document.createElement('div');
  banner.id = 'live-status';
  banner.setAttribute('role', 'status');
  banner.style.cssText = 'padding:12px;margin:12px 0;border:1px solid #ccd5e1;border-radius:10px;font-size:13px';
  document.querySelector('.top').after(banner);
  banner.textContent = 'Connessione ai dati Neon in corso…';
  const safe = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  try {
    const response = await fetch('/api/radar', {cache:'no-store'});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (!Array.isArray(data.opportunities) || !Array.isArray(data.sources)) throw new Error('invalid_schema');
    const scanMap = new Map((data.lastScans || []).map(x => [x.source_id,x.last_scan]));
    grants = data.opportunities.map(o => {
      const state = (o.status || 'da verificare').toUpperCase();
      const closed = /CLOSED|CHIUS|SOSPES|EXHAUST|SCADUT/.test(state);
      return {
        id: o.id, title: o.title, type: /invest/i.test(o.program || '') ? 'Investimenti' : 'R&S',
        source: o.source_id || 'Fonte ufficiale', territory: o.territory || [],
        date: closed ? 'NON CANDIDABILE · ' + state : 'Stato ufficiale: ' + state,
        deadline: o.deadline ? String(o.deadline).slice(0,10) : null,
        grant: o.grant_rate == null ? 'Da verificare' : o.grant_rate + '% (verificare regime)',
        budget: o.budget_eur == null ? 'Da verificare' : Number(o.budget_eur).toLocaleString('it-IT') + ' €',
        beneficiaries: 'Consultare la scheda ufficiale: requisito non ancora strutturato',
        what: o.summary || 'Descrizione da verificare', expenses: [], partners: 'Da verificare',
        sectors: o.sectors || [], kw: o.keywords || [], fit: [],
        risks: closed ? ['Sportello chiuso o sospeso: non presentare nuove domande'] : ['Verificare requisiti e stato prima della candidatura'],
        next: closed ? 'Monitorare eventuale riapertura' : 'Verificare condizioni ufficiali',
        url: o.official_url || '#', fresh: false, officialStatus: state
      };
    });
    sourceRegistry = data.sources.map(s => ({
      n:s.name,s:s.scope || '',u:s.official_url || '#',d:s.category || '',
      status:s.scan_status === 'scanned' ? 'Scansionata' : 'Da verificare',
      last:scanMap.has(s.id) ? new Date(scanMap.get(s.id)).toLocaleString('it-IT',{timeZone:'Europe/Rome'}) : 'non disponibile',
      found:data.opportunities.filter(o=>o.source_id===s.id).length
    }));
    document.getElementById('sourcegrid').innerHTML = sourceRegistry.map(x =>
      '<div class="source"><b>'+safe(x.n)+'</b><div class="muted">'+safe(x.s)+' · ultima scansione '+safe(x.last)+'</div><p>'+safe(x.d)+'</p><a target="_blank" rel="noopener noreferrer" href="'+safe(x.u)+'">Fonte ufficiale ↗</a></div>'
    ).join('');
    banner.textContent = 'Dati live Neon · '+grants.length+' opportunità · risposta '+new Date(data.servedAt).toLocaleString('it-IT',{timeZone:'Europe/Rome'})+'. Stato e requisiti non verificati sono indicati esplicitamente.';
    render();
  } catch (e) {
    banner.textContent = 'ATTENZIONE: database non raggiungibile. Sono visibili dati dimostrativi locali NON aggiornati; non utilizzarli per decidere candidature.';
    console.warn('live_radar_unavailable', e.message);
  }
})();
