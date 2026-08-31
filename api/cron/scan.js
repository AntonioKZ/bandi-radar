const sources=[
  {name:'MIMIT',url:'https://www.mimit.gov.it/it/incentivi'},
  {name:'Invitalia',url:'https://www.invitalia.it/per-le-imprese/incentivi-e-strumenti'},
  {name:'Regione Lombardia',url:'https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/ricerca-innovazione'},
  {name:'Open Innovation Lombardia',url:'https://www.openinnovation.regione.lombardia.it/it/bandi-e-sperimentazioni'}
];
module.exports=async function handler(req,res){
  const started=new Date().toISOString();
  const results=[];
  for(const s of sources){
    try{
      const r=await fetch(s.url,{headers:{'user-agent':'Mozilla/5.0 BandiRadarMI/1.0','accept':'text/html,application/xhtml+xml','accept-language':'it-IT,it;q=0.9,en;q=0.8'},redirect:'follow'});
      const text=await r.text();
      results.push({source:s.name,reachable:r.ok,status:r.status,bytes:text.length,checkedAt:new Date().toISOString()});
    }catch(e){results.push({source:s.name,reachable:false,status:null,error:String(e),checkedAt:new Date().toISOString()});}
  }
  const reachable=results.filter(x=>x.reachable).length;
  const degraded=reachable<results.length;
  res.setHeader('Cache-Control','no-store');
  res.status(200).json({ok:reachable>0,degraded,reachable,total:results.length,started,finished:new Date().toISOString(),results,note:'Scan HTTP reale. Una fonte può bloccare richieste server-to-server senza invalidare l’intero job. La persistenza automatica su Neon richiede DATABASE_URL server-side.'});
}