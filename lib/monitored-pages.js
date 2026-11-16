const SICILY_SOURCE = {
  id: 'sicilia-dap',
  name: 'Regione Siciliana – Attività produttive',
  url: 'https://www.regione.sicilia.it/la-regione-informa?f%5B0%5D=group%3A14'
};

const WATCHED_PAGES = [
  ['www.mimit.gov.it', '/it/incentivi/automotive-accordi-per-linnovazione-nella-filiera'],
  ['www.mimit.gov.it', '/it/normativa/decreti-ministeriali/decreto-ministeriale-11-agosto-2026-mini-contratti-di-sviluppo-programmi-di-investimento-delle-imprese-della-filiera-automotive'],
  ['www.regione.sicilia.it', '/la-regione-informa/open-innovation-sicilia-avvisi-selezione-soggetti-aderenti-ai-programmi-accelerazione-eo-incubazione-d-impresa']
];

function watchedPages(source) {
  const host = new URL(source.official_url).hostname.replace(/^www\./, '');
  return WATCHED_PAGES.filter(([domain]) =>
    domain === 'www.' + host && (host !== 'regione.sicilia.it' || source.id === SICILY_SOURCE.id)
  ).map(([domain, path]) => 'https://' + domain + path);
}

module.exports = { SICILY_SOURCE, watchedPages };
