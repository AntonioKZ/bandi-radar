const sources=[
  {name:'MIMIT',url:'https://www.mimit.gov.it/it/incentivi'},
  {name:'Invitalia',url:'https://www.invitalia.it/incentivi-e-strumenti'},
  {name:'Regione Lombardia',url:'https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/ricerca-innovazione'},
  {name:'Open Innovation Lombardia',url:'https://www.openinnovation.regione.lombardia.it/it/bandi-e-sperimentazioni'}
];
module.exports=async function handler(req,res){
  const started=new Date().toISOString();
  const results=[];
  for(const s of sources){
    try{
      const r=await fetch(s.url,{headers:{'user-agent':'BandiRadarMI/1.0'},redirect:'follow'});
      const text=await r.text();
      results.push({source:s.name,ok:r.ok,status:r.status,bytes:text.length,checkedAt:new Date().toISOString()});
    }catch(e){results.push({source:s.name,ok:false,error:String(e),checkedAt:new Date().toISOString()});}
  }
  res.setHeader('Cache-Control','no-store');
  res.status(200).json({ok:results.every(x=>x.ok),started,finished:new Date().toISOString(),results,note:'Scan HTTP reale. La persistenza automatica su Neon richiede DATABASE_URL server-side.'});
}