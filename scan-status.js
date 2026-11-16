(async function monitorScan() {
  const indicator = document.getElementById('scan-indicator');
  let lastCompleted;

  async function refreshStatus() {
    try {
      const response = await fetch('/api/radar?scanStatus=1', {cache:'no-store',signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw new Error('status_unavailable');
      const {scan} = await response.json();
      indicator.classList.toggle('is-scanning', Boolean(scan?.active));
      if (scan?.active) {
        indicator.textContent = 'Scansione in corso… I risultati si aggiorneranno automaticamente.';
      } else if (scan?.finished_at) {
        const when = new Date(scan.finished_at).toLocaleString('it-IT',{timeZone:'Europe/Rome'});
        indicator.textContent = (scan.status === 'failed' ? 'Ultima scansione fallita' : 'Ultima scansione terminata') +
          ' · ' + when + ' · ' + (scan.inserted || 0) + ' nuove segnalazioni';
        if (lastCompleted !== undefined && lastCompleted !== scan.id) await loadRadar();
        lastCompleted = scan.id;
      } else {
        indicator.textContent = scan ? 'L’ultima scansione non è stata completata.' : 'Nessuna scansione registrata.';
        lastCompleted ??= null;
      }
      if (scan?.active) lastCompleted ??= null;
    } catch {
      indicator.classList.remove('is-scanning');
      indicator.textContent = 'Stato della scansione momentaneamente non disponibile.';
    } finally {
      setTimeout(refreshStatus, document.hidden ? 30000 : 5000);
    }
  }

  await refreshStatus();
})();
