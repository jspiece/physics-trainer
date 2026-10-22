// Metadata consistency only. This cannot verify physics answers or official PDF content.
const fs=require('node:fs');
const qs=JSON.parse(fs.readFileSync('questions.json','utf8'));
const errors=[],warnings=[],ids=new Set(),refs=new Set();
const coverage=Array.from({length:15},(_,i)=>({chapter:i+1,P1:0,P2:0}));
const classifications={},spans=new Map();
for(const q of qs){
 const fail=message=>errors.push({id:q.id,message});
 if(ids.has(q.id))fail('Duplicate ID');ids.add(q.id);
 const source=q.source.match(/^9702\/(1[123]|2[123])\/(F\/M|M\/J|O\/N)\/(\d{2})$/);
 if(!source){fail('Invalid source reference');continue}
 const [,component,season,year]=source,paper=component[0]==='1'?'P1':'P2';
 const stem=`9702_${({'F/M':'m','M/J':'s','O/N':'w'})[season]}${year}`;
 for(const type of ['qp','ms']){
  if(q[type+'_file']!==`${stem}_${type}_${component}.pdf`)fail(type+' filename does not match source');
  if(!/^\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*$/.test(q[type+'_pages']))fail(type+' pages malformed');
  for(const p of q[type+'_pages'].split(',')){const [a,b=a]=p.split('-').map(Number);if(a<1||a>b)fail(type+' page range invalid')}
 }
 const ref=q.qp_file+':'+q.question;if(refs.has(ref))fail('Duplicate source question');refs.add(ref);
 const ch=q.chapters.split(',').map(Number);if(ch.some(c=>!Number.isInteger(c)||c<1||c>15))fail('Invalid chapter');else for(const c of new Set(ch))coverage[c-1][paper]++;
 if(!(Number(q.marks)>0))fail('Invalid marks');
 if(paper==='P1'){
  if(!/^[ABCD]$/.test(q.answer))fail('Invalid MCQ answer format');
  if(!q.qp_clip)fail('Missing MCQ crop');
  for(const clip of [q.qp_clip,q.qp_clip2].filter(Boolean)){
   const v=clip.split(':').map(Number);if(v.length!==3||v.some(n=>!Number.isFinite(n))||v[0]<1||v[1]<0||v[2]<=v[1])fail('Malformed crop');
   const key=q.qp_file+':'+v[0];if(!spans.has(key))spans.set(key,[]);spans.get(key).push({id:q.id,top:v[1],bottom:v[2]});
   if(v[2]-v[1]>650)warnings.push({id:q.id,message:'Large crop (>650 PDF points); check extra questions / missing continuation'});
  }
 }
 const classification=q.classification||'unspecified';classifications[classification]=(classifications[classification]||0)+1;
}
for(const [page,clips] of spans){clips.sort((a,b)=>a.top-b.top);for(let i=1;i<clips.length;i++){if(clips[i].top<clips[i-1].bottom)warnings.push({page,ids:[clips[i-1].id,clips[i].id],message:'Overlapping crops; inspect originals'})}}
const report={scope:'Metadata-only checks; no official answer, chapter, marks or PDF-page validation',total:qs.length,P1:qs.filter(q=>q.source.startsWith('9702/1')).length,P2:qs.filter(q=>q.source.startsWith('9702/2')).length,mcqExplanations:qs.filter(q=>q.mcq_explanation).length,structuredSolutions:qs.filter(q=>q.solution_steps?.length).length,officialMcqAnswersChecked:qs.filter(q=>q.answer_verification?.status==="checked-against-official-ms").length,excludedFromPractice:qs.filter(q=>q.excluded_from_practice).map(q=>q.id),classifications,coverage,errors,warnings};
console.log(JSON.stringify(report,null,2));if(errors.length)process.exitCode=1;
