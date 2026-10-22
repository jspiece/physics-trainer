import * as pdfjs from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
const $=id=>document.getElementById(id);
const names=["Kinematics","Accelerated motion","Dynamics","Forces, vectors & moments","Work, energy & power","Momentum","Matter & materials","Current, p.d. & resistance","Kirchhoff's laws","Resistance & resistivity","Practical circuits","Waves","Superposition","Stationary waves","Atomic & particle physics"];
const KEY="mms_physics_web_v05";
function readSaved(){
 try{
  const value=JSON.parse(localStorage.getItem(KEY)||"{}");
  return value&&typeof value==="object"&&!Array.isArray(value)?value:{};
 }catch{return {}}
}
let saved=readSaved();
const list=value=>Array.isArray(value)?value:[];
const object=value=>value&&typeof value==="object"&&!Array.isArray(value)?value:{};
// Preserve the existing storage key and all results. Only migrate chapter preferences once.
if(!saved.allChaptersRollout){
 const old=list(saved.selected).map(Number);
 if(!old.length||(old.length===1&&[8,9].includes(old[0])))saved.selected=Array.from({length:15},(_,i)=>i+1);
}
let questions=[],selected=new Set((Array.isArray(saved.selected)?saved.selected:Array.from({length:15},(_,i)=>i+1)).map(Number).filter(c=>c>=1&&c<=15)),seen=new Set(list(saved.seen)),history=list(saved.history),favs=new Set(list(saved.favs));
let current=null,tab="qp",scale=1.15,files=new Map(),renderToken=0,mcqFullPage=false;
let mode=saved.mode==="P1"?"P1":"P2", attempts=object(saved.attempts), savedDirHandle=null;
let sessions=list(saved.sessions).filter(s=>s&&Array.isArray(s.answers)&&Array.isArray(s.chapters)), mcqSession=saved.mcqSession&&Array.isArray(saved.mcqSession.answers)&&Array.isArray(saved.mcqSession.chapters)&&Number.isInteger(saved.mcqSession.limit)&&saved.mcqSession.limit>0?saved.mcqSession:null, paper2Grades=object(saved.paper2Grades);
let structuredSession=saved.structuredSession&&Array.isArray(saved.structuredSession.questionIds)&&Array.isArray(saved.structuredSession.answers)&&Array.isArray(saved.structuredSession.chapters)?saved.structuredSession:null;
let structuredSessions=list(saved.structuredSessions),timerEnabled=saved.timerEnabled===true,renderReadyId=null,practiceUnlocked=false;
// A restored running timestamp must never include time spent with the browser closed.
for(const session of [mcqSession,structuredSession])if(session?.clock)session.clock.runningSince=null;
const SESSION_TARGET=20;
let progressPersisted=true;
function save(){
 try{
  localStorage.setItem(KEY,JSON.stringify({...saved,selected:[...selected],seen:[...seen],history:history.slice(-500),favs:[...favs],ch9Pilot:true,allChaptersRollout:true,mode,attempts,sessions:sessions.slice(-100),mcqSession,paper2Grades,structuredSession,structuredSessions:structuredSessions.slice(-100),timerEnabled}));
  progressPersisted=true;
  if($("status"))$("status").textContent="Saved on this browser";
  return true;
 }catch(err){
  progressPersisted=false;
  if($("status"))$("status").textContent="Progress could not be saved. Export a backup before closing this tab.";
  console.warn("Progress storage unavailable",err);return false;
 }
}
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const chapters=q=>(q.chapters||"").split(",").map(x=>Number(x.trim()));
const paper=q=>q.source?.match(/9702\/(\d)/)?.[1]==="1"?"P1":"P2";
function pool(){return questions.filter(q=>!q.excluded_from_practice&&chapters(q).some(c=>selected.has(c))&&paper(q)===mode)}
function sidebar(){const counts=Array.from({length:15},(_,i)=>questions.filter(q=>!q.excluded_from_practice&&chapters(q).includes(i+1)&&paper(q)===mode).length);
 $("chapters").innerHTML=names.map((n,i)=>`<label class="chapter"><input type="checkbox" data-ch="${i+1}" ${selected.has(i+1)?"checked":""}><span>${String(i+1).padStart(2,"0")} &nbsp; ${esc(n)}</span><span class="count">${counts[i]}</span></label>`).join("");
 document.querySelectorAll("[data-ch]").forEach(el=>el.onchange=()=>{let n=Number(el.dataset.ch);el.checked?selected.add(n):selected.delete(n);save();stats()});
 stats()}
function stats(){
 const p=pool(),left=p.filter(q=>!seen.has(q.id)).length;
 $("selectionCount").textContent=selected.size+" selected";
 $("progress").textContent=mode==="P1"&&mcqSession ? "Session "+mcqSession.answers.length+"/"+mcqSession.limit+" · "+sessionCorrect()+"/"+mcqSession.answers.length+" correct" : left+" unseen / "+p.length+" available";
 updateProgressPanel();updateClockDisplay();
}
function open(q,record=true){if(!q)return;pauseClocks();current=q;mcqFullPage=false;mode=paper(q);refreshModeButtons();if(record){history.push(q.id);history=history.slice(-500)}save();
 $("heading").textContent=`${q.source} · Question ${q.question}`;
 $("subheading").textContent=(q.excluded_from_practice?"Under review — not scored · ":"")+(q.topic||"Original Cambridge examination question")+(q.answer_verification?.status==="checked-against-official-ms"?" · Answer checked against official MS; chapter/crop review pending":" · Indexing and answers await individual source verification");
 $("paperBadge").textContent=paper(q);$("marksBadge").textContent=`${q.marks||"—"} marks`;$("chapterBadge").textContent="Ch. "+q.chapters;
 $("favourite").textContent=favs.has(q.id)?"★ Favourite":"☆ Favourite";setTab("qp");stats();renderPaper2Grade()}
function setTab(t){tab=t;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===t));render()}
function pdfFile(name){return files.get((name||"").toLowerCase())}
function pages(str){
 return String(str||"").split(",").flatMap(part=>{
  const match=part.trim().match(/^(\d+)(?:-(\d+))?$/);if(!match)return [];
  const a=Number(match[1]),b=Number(match[2]||a);
  return a>0&&b>=a&&b-a<100?Array.from({length:b-a+1},(_,i)=>a+i):[];
 });
}
async function render(){pauseClocks();renderReadyId=null;const token=++renderToken,view=$("viewer");view.innerHTML="";
 if(current && mode==="P1"){await renderMcq(token,view);return;}
 if(!current){view.innerHTML='<div class="empty"><div class="emptyicon">∑</div><h2>Ready to practise?</h2><p>Generate a question to begin.</p></div>';return}
 if(tab==="solution"){
 const steps=current.solution_steps;
 if(steps?.length){
   const content=steps.map((step,i)=>`<section class="solution-step"><h3>Step ${i+1} — ${esc(step.title)}</h3><p>${esc(step.body).replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>")}</p></section>`).join("");
   view.innerHTML=`<article class="solution"><h2>Explained solution</h2><p class="notice">Teacher commentary for <strong>${esc(current.source)} · Q${esc(current.question)}</strong>. This is not the official Cambridge mark scheme. Read the original question and check the official marking points.</p>${content}</article>`;
 } else {
   view.innerHTML=`<article class="solution"><h2>Study guidance</h2><p class="notice">A question-specific explanation has not yet been prepared. For marking, use the <strong>Official mark scheme</strong> tab.</p><p><strong>Topic:</strong> ${esc(current.topic||"AS Physics")}</p><h3>Useful approach</h3><p>${esc(current.explanation||"Read the question and any diagram carefully. Identify the physical quantities, state the relevant physical principle, show substitutions with units and check against the official mark scheme.")}</p></article>`;
 }
 try{await window.MathJax?.typesetPromise?.([view]);}catch(err){console.warn("MathJax typesetting",err)}
 return;
 }
 const name=current[tab+"_file"],f=pdfFile(name);
 if(!f){view.innerHTML=`<div class="empty"><h2>Local PDF not found</h2><p>Expected: <strong>${esc(name)}</strong></p><p>Choose the folder containing your extracted QP and MS PDFs in the sidebar.<br>Files remain entirely on this device.</p></div>`;return}
 view.innerHTML='<div class="empty">Rendering original PDF pages…</div>';
 const pageNumbers=pages(current[tab+"_pages"]),renderScale=scale;
 let doc;
 try{
  const data=await f.arrayBuffer();if(token!==renderToken)return;
  doc=await pdfjs.getDocument({data:new Uint8Array(data)}).promise;
  if(token!==renderToken)return;
  if(!pageNumbers.length||pageNumbers.some(p=>p>doc.numPages))throw Error("Invalid page reference in the question index.");
  view.innerHTML="";
  for(const p of pageNumbers){
   const page=await doc.getPage(p);if(token!==renderToken)return;
   const viewport=page.getViewport({scale:renderScale}),canvas=document.createElement("canvas");
   canvas.width=Math.floor(viewport.width);canvas.height=Math.floor(viewport.height);canvas.style.maxWidth=Math.round(renderScale/1.15*100)+"%";
   await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
   if(token!==renderToken)return;view.append(canvas);
  }
 if(token===renderToken){renderReadyId=current?.id;syncClock();}
 }catch(e){if(token===renderToken)view.innerHTML=`<div class="empty">Could not open PDF: ${esc(e.message)}</div>`}
 finally{if(doc)await doc.destroy()}
}
function newStructuredSession(){
 const available=pool();
 if(!available.length){alert("No Paper 2 questions indexed for these chapters.");return false}
 structuredSession={startedAt:new Date().toISOString(),chapters:[...selected],questionIds:[],answers:[],pendingId:null,ended:false};save();return true;
}
function structuredPool(){
 const ch=new Set(structuredSession?.chapters||[...selected]);
 return questions.filter(q=>paper(q)==="P2"&&chapters(q).some(c=>ch.has(c)));
}
function finishStructuredSession(reason="finished"){
 if(!structuredSession||structuredSession.ended)return;
 pauseClocks();structuredSession.ended=true;structuredSession.reason=reason;
 if(structuredSession.questionIds.length)structuredSessions.push({...structuredSession,questionIds:[...structuredSession.questionIds],answers:structuredSession.answers.map(a=>({...a})),date:new Date().toISOString()});
 structuredSessions=structuredSessions.slice(-100);save();stats();
}
function generate(){
 if(mode==="P1"){nextMcq();return}
 if(!structuredSession||structuredSession.ended){if(!newStructuredSession())return}
 const used=new Set(structuredSession.questionIds);
 const remaining=structuredPool().filter(q=>!used.has(q.id));
 if(!remaining.length){finishStructuredSession();alert("All questions in this Paper 2 session have been opened. Restart session to practise again; your assessments are kept.");return}
 const rank=q=>!seen.has(q.id)?0:paper2Grades[q.id]?.review?1:2;
 const best=Math.min(...remaining.map(rank)),choices=remaining.filter(q=>rank(q)===best);
 const q=choices[Math.floor(Math.random()*choices.length)];
 structuredSession.questionIds.push(q.id);structuredSession.pendingId=q.id;seen.add(q.id);open(q);
}
function sessionCorrect(){return (mcqSession?.answers||[]).filter(a=>a.correct).length}
function sessionPool(){
 const ch=new Set(mcqSession?.chapters||[...selected]);
 return questions.filter(q=>!q.excluded_from_practice&&paper(q)==="P1"&&chapters(q).some(c=>ch.has(c)));
}
function sessionAvailable(){return pool().length}
function newMcqSession(){
 const n=sessionAvailable();
 if(!n){alert(pool().length?"No matching MCQs available.":"No MCQs indexed for these chapters.");return false}
 const limit=Math.min(SESSION_TARGET,n);
 mcqSession={startedAt:new Date().toISOString(),chapters:[...selected],limit,answers:[],pendingId:null,ended:false};
 save();stats();return true;
}
function finishSession(reason="finished",showSummary=true){
 if(!mcqSession||mcqSession.ended)return;
 if(mcqSession.answers.length===0){mcqSession=null;setMode("P1");return}
 pauseClocks();mcqSession.ended=true;mcqSession.reason=reason;
 sessions.push({date:new Date().toISOString(),chapters:mcqSession.chapters,limit:mcqSession.limit,answers:mcqSession.answers.map(a=>({...a})),correct:sessionCorrect(),reason,elapsedMs:clockElapsed(mcqSession)});
 sessions=sessions.slice(-100);save();if(showSummary)showSessionSummary();stats();
}
function chooseNextMcq(){
 const usedInSession=new Set((mcqSession?.answers||[]).map(a=>a.id));
 const remaining=sessionPool().filter(q=>!usedInSession.has(q.id));
 if(!remaining.length)return null;
 const recentGroups=new Set((mcqSession?.answers||[]).slice(-3).map(a=>questions.find(q=>q.id===a.id)?.mcq_group).filter(Boolean));
 const diverse=remaining.filter(q=>!q.mcq_group||!recentGroups.has(q.mcq_group));
 const choices=diverse.length?diverse:remaining;
 // Unseen questions first, then mistakes, then previously successful questions.
 const rank=q=>!seen.has(q.id)?0:attempts[q.id]!==q.answer?1:2;
 const best=Math.min(...choices.map(rank));
 const preferred=choices.filter(q=>rank(q)===best);
 return preferred[Math.floor(Math.random()*preferred.length)];
}
function nextMcq(){
 if(!mcqSession||mcqSession.ended){if(!newMcqSession())return}
 const pending=questions.find(q=>q.id===mcqSession.pendingId);
 if(pending&&!pending.excluded_from_practice&&!mcqSession.answers.some(a=>a.id===pending.id)){open(pending,false);return}
 if(mcqSession.answers.length>=mcqSession.limit){finishSession();return}
 const q=chooseNextMcq();if(!q){finishSession();return}
 mcqSession.pendingId=q.id;seen.add(q.id);open(q);save();
}
function recordMcq(q,choice){
 if(q.excluded_from_practice||!mcqSession||mcqSession.ended||mcqSession.pendingId!==q.id||!["A","B","C","D"].includes(choice)||mcqSession.answers.some(a=>a.id===q.id))return false;
 attempts[q.id]=choice;
 mcqSession.answers.push({id:q.id,choice,correct:choice===q.answer,chapters:q.chapters,date:new Date().toISOString()});
 mcqSession.pendingId=null;
 syncClock();save();stats();refreshMcqEndButton();return true;
}
function refreshMcqEndButton(){
 const b=$("mcqNext");if(!b)return;
 b.textContent=mcqSession?.answers.length>=mcqSession?.limit?"See session results →":"Next MCQ →";
}
function showSessionSummary(){
 if(!mcqSession)return;
 current=null;renderToken++;
 const n=mcqSession.answers.length,correct=sessionCorrect();
 $("heading").textContent="MCQ Session Results";
 $("subheading").textContent=progressPersisted?"Your results are saved locally in this browser.":"Results are in memory only. Export a backup before closing this tab.";
 const wrong=mcqSession.answers.filter(a=>!a.correct).map(a=>{
 const q=questions.find(q=>q.id===a.id);return q?'<button class="review-question" data-review="'+esc(q.id)+'">'+esc(q.source)+' · Q'+esc(q.question)+' — Your answer: '+esc(a.choice)+'; correct: '+esc(q.answer)+'</button>':""
 }).join("");
 $("viewer").innerHTML='<div class="session-summary"><h2>Session complete</h2><div class="big-score">'+correct+' / '+n+'</div><p>'+Math.round(100*correct/Math.max(1,n))+'% correct · '+n+' questions answered</p><h3>Questions to revisit ('+(n-correct)+')</h3>'+(wrong||'<p>Excellent — no mistakes to review.</p>')+'<button id="newSessionButton" class="primary">Start a new session →</button></div>';
 document.querySelectorAll("[data-review]").forEach(b=>b.onclick=()=>{const q=questions.find(q=>q.id===b.dataset.review);if(q)open(q,false)});
 $("newSessionButton").onclick=()=>{mcqSession=null;current=null;save();nextMcq()};
}
function loadFiles(list){
 let duplicates=0;const batch=new Set();
 for(const f of list){const key=f.name.toLowerCase();if(!key.endsWith(".pdf"))continue;
  if(batch.has(key)){files.delete(key);duplicates++;continue}batch.add(key);files.set(key,f);
 }
 $("fileStatus").textContent=`${files.size} PDF files ready locally (this browser tab).`+(duplicates?` ${duplicates} duplicate filename(s) excluded; select one copy of each PDF.`:"");
 if(current)render();
}
function showHistory(){$("historyDialog").querySelector("h2").textContent="Question history";const list=history.map(id=>questions.find(q=>q.id===id)).filter(Boolean).reverse();$("historyList").innerHTML=list.map(q=>`<button class="historyitem" data-id="${esc(q.id)}">${favs.has(q.id)?"★ ":""}${esc(q.source)} · Q${esc(q.question)} · ${esc(q.topic||"")}</button>`).join("")||"<p>No history yet.</p>";
 document.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>{open(questions.find(q=>q.id===b.dataset.id),false);$("historyDialog").close()});$("historyDialog").showModal()}

function showReviewList(kind){
 const matches=questions.filter(q=>kind==="favourites"?favs.has(q.id):paper(q)==="P1"?attempts[q.id]&&attempts[q.id]!==q.answer:paper2Grades[q.id]?.review);
 $("historyDialog").querySelector("h2").textContent=kind==="favourites"?"My favourites":"Questions to revisit";
 $("historyList").innerHTML=matches.map(q=>`<button class="historyitem" data-review-id="${esc(q.id)}">${esc(q.source)} · Q${esc(q.question)} · Ch. ${esc(q.chapters)}</button>`).join("")||"<p>No questions in this list yet.</p>";
 document.querySelectorAll("[data-review-id]").forEach(b=>b.onclick=()=>{open(questions.find(q=>q.id===b.dataset.reviewId),false);$("historyDialog").close()});$("historyDialog").showModal();
}
function exportProgress(){
 const state={...saved,selected:[...selected],seen:[...seen],history,favs:[...favs],mode,attempts,sessions,mcqSession,paper2Grades,structuredSession,structuredSessions,timerEnabled,allChaptersRollout:true};
 const blob=new Blob([JSON.stringify({application:"mms-physics-trainer",version:1,exportedAt:new Date().toISOString(),state},null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="physics-trainer-progress.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function showPerformance(){
 const answers=sessions.flatMap(s=>s.answers).concat(mcqSession&&!mcqSession.ended?mcqSession.answers:[]);
 const rows=names.map((name,i)=>{
  const p1=answers.filter(a=>String(a.chapters||questions.find(q=>q.id===a.id)?.chapters||"").split(",").map(Number).includes(i+1));
  const grades=questions.filter(q=>paper(q)==="P2"&&chapters(q).includes(i+1)&&paper2Grades[q.id]).map(q=>paper2Grades[q.id]);
  const earned=grades.reduce((n,g)=>n+Number(g.score||0),0),max=grades.reduce((n,g)=>n+Number(g.max||0),0);
  return `<tr><td>${i+1}. ${esc(name)}</td><td>${p1.filter(a=>a.correct).length} / ${p1.length}</td><td>${earned} / ${max}</td></tr>`;
 }).join("");
 const dialog=document.createElement("dialog");dialog.innerHTML=`<h2>My progress by chapter</h2><p>MCQ attempts from the last 100 completed sessions and the active session. Paper 2 uses your latest self-assessment per question. Multi-chapter questions appear in each chapter; scores use provisional index answers.</p><table><thead><tr><th>Chapter</th><th>MCQ correct / answered</th><th>Paper 2 marks</th></tr></thead><tbody>${rows}</tbody></table><button>Close</button>`;
 document.body.append(dialog);dialog.querySelector("button").onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.showModal();
}

/* Paper 1 multiple-choice drill: original question content remains in local PDFs. */
function installModeSwitcher(){
 const host=document.createElement("div");host.className="mode-picker";
 host.innerHTML='<button type="button" id="switchP1">Paper 1 · MCQ drill</button><button type="button" id="switchP2">Paper 2 · Structured</button>';
 const gen=$("generate");gen.parentElement.insertBefore(host,gen);
 $("switchP1").onclick=()=>setMode("P1");
 $("switchP2").onclick=()=>setMode("P2");
 refreshModeButtons();
}
function refreshModeButtons(){
 for(const [m,id] of [["P1","switchP1"],["P2","switchP2"]]){const b=$(id);if(b)b.classList.toggle("chosen",mode===m)}
 document.body.classList.toggle("mode-p1",mode==="P1");
 const g=$("generate");if(g)g.textContent=mode==="P1"?"Generate MCQ →":"Generate question →";
 if(questions.length&&$("chapters"))sidebar();
}
function setMode(m){
 pauseClocks();mode=m;current=null;renderReadyId=null;save();refreshModeButtons();sidebar();renderPaper2Grade();
 $("heading").textContent=m==="P1"?"Paper 1 — MCQ drill":"Paper 2 — Structured questions";
 $("subheading").textContent=m==="P1"?"Choose chapters, answer A–D, receive immediate feedback.":"Original Cambridge questions and mark schemes.";
 $("paperBadge").textContent=m;$("marksBadge").textContent=m==="P1"?"1 mark":"— marks";
 $("chapterBadge").textContent=selected.size===1?"Chapter "+[...selected][0]:"Selected chapters";
 stats();render();
}
async function renderMcq(token,view){
 const q=current,f=pdfFile(q.qp_file),renderScale=scale,fullPage=mcqFullPage;
 if(!f){view.innerHTML='<div class="empty"><h2>Local Paper 1 PDF not found</h2><p>Expected: <strong>'+esc(q.qp_file)+'</strong></p><p>Connect the saved PDF folder or choose your local Question Paper PDFs. Nothing is uploaded.</p></div>';return}
 const canAnswer=!q.excluded_from_practice&&mcqSession&&!mcqSession.ended&&mcqSession.pendingId===q.id;
 const done=mcqSession?.answers.find(a=>a.id===q.id)?.choice||(!canAnswer?attempts[q.id]:null);
 view.innerHTML='<div class="mcq-work"><div class="mcq-top"><strong>Question '+esc(q.question)+'</strong><span>Choose ONE correct answer · 1 mark</span></div><div id="mcqPictures" class="mcq-pictures"><p>Loading original Cambridge question…</p></div><div class="mcq-actions"><div class="mcq-options">'+["A","B","C","D"].map(a=>'<button data-answer="'+a+'" class="'+(done?(a===q.answer?"is-correct":a===done&&done!==q.answer?"is-wrong":""):"")+'" disabled> '+a+' </button>').join("")+'</div><div id="mcqFeedback" class="mcq-feedback"></div><button id="mcqNext" class="primary">Next MCQ →</button></div></div>';
 const feedback=$("mcqFeedback");
 const fullButton=document.createElement("button");fullButton.textContent=mcqFullPage?"Show question crop":"Show full original page(s)";
 fullButton.onclick=()=>{mcqFullPage=!mcqFullPage;render()};view.querySelector(".mcq-top").append(fullButton);
 function showMcqFeedback(choice){
   const verified=q.answer_verification?.status==="checked-against-official-ms";
   feedback.textContent=choice===q.answer?(verified?"✓ Correct!":"✓ Matches the indexed answer (source verification pending)."):(verified?"Not quite. The official answer is "+q.answer+".":"Not quite. Indexed answer: "+q.answer+" (source verification pending).");
   const panel=document.createElement("div");panel.className="mcq-explanation";
   const heading=document.createElement("strong");heading.textContent="Why?";panel.append(heading);
   const explanation=document.createElement("p");
   explanation.textContent=q.mcq_explanation||"A question-specific explanation is not yet available for this MCQ. Compare the correct option with the original question and ask your teacher about any uncertainty.";
   panel.append(explanation);
   const source=document.createElement("small");source.textContent=q.explanation_review?"Teaching explanation, not an official Cambridge solution. Checked using "+q.qp_file+" Q"+q.question+" and "+q.ms_file+" p."+q.answer_verification?.page+".":"Teaching commentary; individual source review pending.";panel.append(source);feedback.append(panel);
   if(q.mcq_explanation)window.MathJax?.typesetPromise?.([explanation]).catch(console.warn);
 }
 if(q.excluded_from_practice){feedback.textContent=q.mcq_explanation||q.review_required;window.MathJax?.typesetPromise?.([feedback]).catch(console.warn);}
 else if(done){showMcqFeedback(done);refreshMcqEndButton();}
 else if(canAnswer) document.querySelectorAll("[data-answer]").forEach(b=>b.onclick=()=>{
    if(!canAnswer||!recordMcq(q,b.dataset.answer))return;
    for(const x of document.querySelectorAll("[data-answer]")){x.disabled=true;x.classList.toggle("is-correct",x.dataset.answer===q.answer);x.classList.toggle("is-wrong",x.dataset.answer===b.dataset.answer&&b.dataset.answer!==q.answer)}
    showMcqFeedback(b.dataset.answer);
 });
 $("mcqNext").onclick=()=>{if(mcqSession?.ended)showSessionSummary();else nextMcq()};refreshMcqEndButton();
 let doc;
 try{
 const bytes=await f.arrayBuffer();if(token!==renderToken)return;
 doc=await pdfjs.getDocument({data:new Uint8Array(bytes)}).promise;
 if(token!==renderToken)return;
 const area=$("mcqPictures");area.textContent="";
 const clips=fullPage?pages(q.qp_pages).map(n=>`${n}:0:10000`):[q.qp_clip,q.qp_clip2].filter(Boolean);
 if(!clips.length)throw Error("Missing question crop; use Show full original page(s).");
 for(const clip of clips){
   const [number,top,bottom]=clip.split(":").map(Number),page=await doc.getPage(number),vp=page.getViewport({scale:renderScale});
   if(token!==renderToken)return;
   if(!Number.isFinite(top)||!Number.isFinite(bottom)||top<0||bottom<=top||top*renderScale>=vp.height)throw Error("Invalid question crop; use full original pages.");
   const full=document.createElement("canvas");full.width=Math.floor(vp.width);full.height=Math.floor(vp.height);
   await page.render({canvasContext:full.getContext("2d"),viewport:vp}).promise;
   if(token!==renderToken)return;
   const y=Math.max(0,Math.round(top*renderScale)),height=Math.max(40,Math.min(full.height-y,Math.round((bottom-top)*renderScale)));
   const cropped=document.createElement("canvas");cropped.width=full.width;cropped.height=height;
   cropped.getContext("2d").drawImage(full,0,y,full.width,height,0,0,full.width,height);
   area.append(cropped);
 }
 if(token===renderToken){renderReadyId=q.id;if(canAnswer&&!done){for(const b of view.querySelectorAll("[data-answer]"))b.disabled=false;}syncClock();}
 }catch(err){if(token===renderToken)$("mcqPictures").textContent="Could not render local PDF: "+err.message}
 finally{if(doc)await doc.destroy()}
}
/* Optional active practice time. No deadline or automatic submission. */
function activeSession(){return mode==="P1"?mcqSession:structuredSession}
function clockElapsed(session,now=Date.now()){
 const c=session?.clock;return Math.max(0,Number(c?.elapsedMs)||0)+(c?.runningSince!=null?Math.max(0,now-c.runningSince):0);
}
function pauseClocks(){
 let changed=false;
 for(const session of [mcqSession,structuredSession]){
  if(session?.clock?.runningSince!=null){session.clock.elapsedMs=clockElapsed(session);session.clock.runningSince=null;changed=true;}
 }
 if(changed)save();updateClockDisplay();
}
function syncClock(){
 const session=activeSession();
 const eligible=practiceUnlocked&&timerEnabled&&session&&!session.ended&&current&&!current.excluded_from_practice&&renderReadyId===current.id&&session.pendingId===current.id&&!(mode==="P2"&&session.answers.some(a=>a.id===current.id))&&(mode==="P1"||tab==="qp")&&!document.hidden;
 if(session){
  const c=session.clock||(session.clock={elapsedMs:0,runningSince:null,pausedByUser:false});
  const shouldRun=eligible&&!c.pausedByUser;
  if(shouldRun&&c.runningSince==null){c.runningSince=Date.now();save()}
  else if(!shouldRun&&c.runningSince!=null){c.elapsedMs=clockElapsed(session);c.runningSince=null;save()}
 }
 updateClockDisplay();
}
function formatDuration(ms){
 const seconds=Math.floor(Math.max(0,ms)/1000),minutes=Math.floor(seconds/60);
 return String(minutes).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
}
function updateClockDisplay(){
 if(!$("practiceTime"))return;
 const session=activeSession();$("practiceTime").textContent=formatDuration(clockElapsed(session));
 $("practiceClock").classList.toggle("hidden",!timerEnabled);
 $("timerToggle").checked=timerEnabled;
 $("timerPause").textContent=session?.clock?.pausedByUser?"Resume":"Pause";
 $("timerPause").disabled=!session||session.ended;
 $("timerState").textContent=session?.ended?"Finished":session?.clock?.runningSince!=null?"Running":"Paused";
}
function restartPractice(){
 if(!pool().length){alert("Select at least one chapter with available questions before restarting.");return}
 const session=activeSession();
 if(session&&!session.ended&&!confirm("Restart this session with the selected chapters? Answers already recorded will stay in your history. The timer will restart at zero."))return;
 pauseClocks();
 if(mode==="P1"){
  if(mcqSession&&!mcqSession.ended)finishSession("restarted",false);
  mcqSession=null;current=null;save();nextMcq();
 }else{
  finishStructuredSession("restarted");structuredSession=null;current=null;save();generate();
 }
}
function installPracticeControls(){
 const controls=document.createElement("section");controls.className="practice-controls";
 controls.innerHTML='<label><input id="timerToggle" type="checkbox"> Timer (optional)</label><span id="practiceClock" class="hidden"><strong id="practiceTime">00:00</strong> <span id="timerState">Paused</span> <button id="timerPause" type="button">Pause</button></span><button id="restartSession" type="button">Restart session</button>';
 $("studentProgress").insertAdjacentElement("afterend",controls);
 $("timerToggle").onchange=()=>{timerEnabled=$("timerToggle").checked;syncClock();save()};
 $("timerPause").onclick=()=>{const session=activeSession();if(!session)return;const c=session.clock||(session.clock={elapsedMs:0,runningSince:null});c.pausedByUser=!c.pausedByUser;syncClock();save()};
 $("restartSession").onclick=restartPractice;
 document.addEventListener("visibilitychange",()=>{if(document.hidden)pauseClocks();else syncClock()});
 window.addEventListener("pagehide",pauseClocks);
 setInterval(()=>{
  const session=activeSession(),c=session?.clock;
  if(c?.runningSince!=null&&Date.now()-c.runningSince>=15000){c.elapsedMs=clockElapsed(session);c.runningSince=Date.now();save()}
  updateClockDisplay();
 },1000);updateClockDisplay();
}

/* Remember folder using Chromium's File System Access API and IndexedDB.
   Browsers can require the student to renew permission; fallback file picker remains. */
function folderStore(){
 return new Promise((resolve,reject)=>{
  const r=indexedDB.open("physics-trainer-folders",1);
  r.onupgradeneeded=()=>r.result.createObjectStore("handles");
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)
 })
}
async function getFolderHandle(){
 const db=await folderStore();return new Promise(resolve=>{const t=db.transaction("handles","readonly"),r=t.objectStore("handles").get("pdfs");r.onsuccess=()=>{resolve(r.result||null);db.close()};r.onerror=()=>{resolve(null);db.close()}})
}
async function saveFolderHandle(handle){
 const db=await folderStore();return new Promise((resolve,reject)=>{const t=db.transaction("handles","readwrite");t.objectStore("handles").put(handle,"pdfs");t.oncomplete=()=>{db.close();resolve()};t.onerror=()=>{db.close();reject(t.error)}})
}
async function scanFolder(handle){
 const found=[];
 async function walk(dir){for await(const entry of dir.values()){if(entry.kind==="directory")await walk(entry);else if(entry.name.toLowerCase().endsWith(".pdf"))found.push(await entry.getFile())}}
 await walk(handle);files.clear();loadFiles(found);$("fileStatus").textContent+=" Folder: "+handle.name+" · local only";
}
function setupSavedFolder(){
 const btn=document.createElement("button");btn.type="button";btn.id="rememberFolder";btn.className="folder-memory";btn.textContent="Connect & remember PDF folder";
 const target=$("folder").parentElement;target.insertAdjacentElement("afterend",btn);
 if(!window.showDirectoryPicker){btn.disabled=true;btn.title="Chrome or Edge required for persistent folder access";return}
 btn.onclick=async()=>{
  try{
   const handle=savedDirHandle||await window.showDirectoryPicker({mode:"read"});
   const state=await handle.requestPermission({mode:"read"});
   if(state!=="granted"){$("fileStatus").textContent="Permission not granted. Use the regular PDF picker.";return}
   savedDirHandle=handle;await scanFolder(handle);try{await saveFolderHandle(handle)}catch{ $("fileStatus").textContent+=" · Folder could not be remembered; reconnect manually next time.";}btn.textContent="Reconnect PDF folder ✓";
  }catch(err){if(err.name!=="AbortError")$("fileStatus").textContent="Folder access: "+err.message}
 };
 const change=document.createElement("button");change.textContent="Choose a different remembered folder";change.className="folder-memory";
 change.onclick=async()=>{try{const handle=await window.showDirectoryPicker({mode:"read"});savedDirHandle=handle;files.clear();await scanFolder(handle);try{await saveFolderHandle(handle)}catch{$("fileStatus").textContent+=" · Folder could not be remembered."}btn.textContent="Reconnect saved folder: "+handle.name}catch(err){if(err.name!=="AbortError")$("fileStatus").textContent="Folder access: "+err.message}};
 btn.insertAdjacentElement("afterend",change);
 getFolderHandle().then(async handle=>{
  if(!handle)return;savedDirHandle=handle;btn.textContent="Reconnect saved folder: "+handle.name;
  const permission=await handle.queryPermission({mode:"read"});
  if(permission==="granted"){try{await scanFolder(handle);btn.textContent="Saved folder connected ✓"}catch(err){$("fileStatus").textContent="Reconnect saved folder to restore PDFs."}}
  else $("fileStatus").textContent="Saved folder '"+handle.name+"' found. Click Reconnect to grant access.";
 }).catch(err=>console.warn("Folder persistence not available",err));
}


/* Paper 1 summary and Paper 2 self-assessment UI are entirely local. */
function installProgressUI(){
 const bar=document.createElement("section");bar.id="studentProgress";bar.className="student-progress";
 document.querySelector(".toolbar").insertAdjacentElement("afterend",bar);
 const grade=document.createElement("section");grade.id="paper2Assessment";grade.className="paper2-assessment hidden";
 $("viewer").insertAdjacentElement("afterend",grade);
 updateProgressPanel();updateClockDisplay();
}
function updateProgressPanel(){
 const bar=$("studentProgress");if(!bar)return;
 if(mode==="P1"){
  const total=mcqSession?.answers.length||0,ok=sessionCorrect(),limit=mcqSession?.limit||Math.min(SESSION_TARGET,sessionAvailable());
  const pct=total?Math.round(100*ok/total):0;
  const historical=sessions.length;
  bar.innerHTML='<div><strong>MCQ session</strong><span>'+total+'/'+limit+' answered</span><span>'+ok+'/'+total+' correct</span><span>'+pct+'% accuracy</span></div><div class="session-track"><i style="width:'+(limit?100*total/limit:0)+'%"></i></div><small>'+historical+' completed session(s) saved in this browser <button class="saved-sessions" id="savedSessionsButton">View results</button>'+(mcqSession?.ended?' · Session finished':'')+'</small>';
  $("savedSessionsButton").onclick=showSavedSessions;
  if(mcqSession&&!mcqSession.ended){
   const info=document.createElement("small");info.textContent="Session chapters: "+mcqSession.chapters.join(", ")+". Chapter changes apply to the next session. ";
   const end=document.createElement("button");end.textContent="End session";end.onclick=()=>{if(confirm("End this session and save the answers recorded so far?"))finishSession()};info.append(end);bar.append(info);
  }
 }else{
  const grades=Object.values(paper2Grades),done=grades.length,points=grades.reduce((sum,g)=>sum+Number(g.score||0),0),max=grades.reduce((sum,g)=>sum+Number(g.max||0),0);
  bar.innerHTML='<div><strong>Paper 2 self-assessment</strong><span>'+done+' graded</span><span>'+(max?Math.round(points/max*100)+'% of marks':'No marks yet')+'</span></div><small>Mark your own answers using the original mark scheme.</small>';
  if(structuredSession){const info=document.createElement('small');info.textContent='Current session: '+structuredSession.questionIds.length+' opened · '+structuredSession.answers.length+' assessed · Chapters '+structuredSession.chapters.join(', ')+(structuredSession.ended?' · Finished':'');bar.append(info)}
  const results=document.createElement('button');results.textContent='Paper 2 session history';results.onclick=showStructuredSessions;bar.append(results);
 }
}
function showSavedSessions(){
 const rows=sessions.slice().reverse().map(s=>{
 const date=new Date(s.date).toLocaleDateString();
 const total=s.answers.length,wrong=s.answers.filter(a=>!a.correct).length;
 return '<div class="saved-session-row"><strong>'+esc(date)+'</strong><span>Ch. '+esc(s.chapters.join(", "))+'</span><span>'+s.correct+'/'+total+' correct ('+Math.round(100*s.correct/Math.max(1,total))+'%)</span><span>'+wrong+' to review</span><span>'+formatDuration(s.elapsedMs||0)+(s.reason==='restarted'?' · restarted':'')+'</span></div>';
 }).join("");
 const dialog=document.createElement("dialog");dialog.className="saved-sessions-dialog";
 dialog.innerHTML='<h2>My MCQ session history</h2><p>Saved on this browser only.</p>'+(rows||'<p>No completed sessions yet.</p>')+'<button id="closeSessions">Close</button>';
 document.body.append(dialog);dialog.showModal();
 dialog.querySelector("#closeSessions").onclick=()=>dialog.close();
 dialog.onclose=()=>dialog.remove();
}
function showStructuredSessions(){
 const rows=structuredSessions.slice().reverse().map(session=>{
  const earned=session.answers.reduce((n,a)=>n+Number(a.score||0),0),max=session.answers.reduce((n,a)=>n+Number(a.max||0),0);
  const details=session.answers.map(a=>{const q=questions.find(q=>q.id===a.id);return `<p>${esc(q?.source||a.id)} · Q${esc(q?.question||"")} — ${a.score}/${a.max}</p>`}).join("");
  return `<details><summary>${esc(new Date(session.date).toLocaleDateString())} · ${session.questionIds.length} opened · ${session.answers.length} assessed · ${earned}/${max} marks · ${formatDuration(clockElapsed(session))}${session.reason==="restarted"?" · restarted":""}</summary>${details||"<p>No assessments recorded.</p>"}</details>`;
 }).join("");
 const dialog=document.createElement("dialog");dialog.innerHTML='<h2>Paper 2 session history</h2><p>Previous self-assessments are preserved here when a session is restarted.</p>'+(rows||'<p>No completed sessions yet.</p>')+'<button>Close</button>';
 document.body.append(dialog);dialog.querySelector("button").onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.showModal();
}
function renderPaper2Grade(){
 const box=$("paper2Assessment");if(!box)return;
 box.classList.toggle("hidden",mode!=="P2"||!current);
 if(mode!=="P2"||!current)return;
 const q=current,g=paper2Grades[q.id],maximum=Number(q.marks)||0;
 box.innerHTML='<h3>Self-assessment · Paper 2</h3><p>Check the official mark scheme, then record your own marks. This is not automatic marking.</p><label>Marks earned <input id="paper2Score" type="number" min="0" max="'+maximum+'" step="1" placeholder="0–'+maximum+'" value="'+(g?g.score:"")+'"></label> <span>/ '+maximum+'</span><label class="paper2-review"><input id="paper2Review" type="checkbox" '+(g?.review?"checked":"")+'> Needs revision</label><button id="saveP2Grade">Save assessment</button><span id="gradeStatus"></span>';
 $("saveP2Grade").onclick=()=>{
 const scoreText=$("paper2Score").value.trim();
 if(scoreText===""||!Number.isInteger(Number(scoreText))||Number(scoreText)<0||Number(scoreText)>maximum){alert("Enter a whole number between 0 and "+maximum);return}
 paper2Grades[q.id]={score:Number(scoreText),max:maximum,review:$("paper2Review").checked,date:new Date().toISOString()};
 if(structuredSession&&!structuredSession.ended&&structuredSession.questionIds.includes(q.id)){
  const result={id:q.id,...paper2Grades[q.id]},index=structuredSession.answers.findIndex(a=>a.id===q.id);
  if(index<0)structuredSession.answers.push(result);else structuredSession.answers[index]=result;
 }
 syncClock();const persisted=save();updateProgressPanel();$("gradeStatus").textContent=persisted?"Saved on this device ✓":"In memory only — export a backup before closing.";
 };
}

function init(){const cfg=window.TRAINER_CONFIG||{};const unlock=()=>{$("gate").classList.add("hidden");$("app").classList.remove("hidden");practiceUnlocked=true;syncClock()};
 if(cfg.demoGate&&!sessionStorage.getItem("mms_demo_access")){$("gate").classList.remove("hidden");$("gateForm").onsubmit=e=>{e.preventDefault();if($("pass").value===cfg.demoPassword){sessionStorage.setItem("mms_demo_access","yes");unlock()}else $("gateError").textContent="Incorrect code."}}else unlock();
 sidebar();installModeSwitcher();installProgressUI();installPracticeControls();setupSavedFolder();
 $("favouritesList").onclick=()=>showReviewList("favourites");$("reviewList").onclick=()=>showReviewList("review");$("exportProgress").onclick=exportProgress;$("performance").onclick=showPerformance;$("generate").onclick=generate;$("selectAll").onclick=()=>{selected=new Set(names.map((_,i)=>i+1));sidebar();save()};$("selectNone").onclick=()=>{selected.clear();sidebar();save()};
 $("paper1").parentElement.parentElement.style.display="none";
 $("folder").onchange=e=>loadFiles(e.target.files);$("files").onchange=e=>loadFiles(e.target.files);
 $("previous").onclick=()=>{if(history.length>1){history.pop();open(questions.find(q=>q.id===history[history.length-1]),false);save()}};
 $("historyBtn").onclick=showHistory;$("closeHistory").onclick=()=>$("historyDialog").close();
 $("favourite").onclick=()=>{if(!current)return;favs.has(current.id)?favs.delete(current.id):favs.add(current.id);save();$("favourite").textContent=favs.has(current.id)?"★ Favourite":"☆ Favourite"};
 $("reset").onclick=()=>{if(confirm("Reset seen questions? History and favourites are preserved.")){seen.clear();save();stats()}};
 document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
 $("zoomIn").onclick=()=>{scale=Math.min(2.8,scale+.2);$("zoomLabel").textContent=Math.round(scale/1.15*100)+"%";if(tab!=="solution")render()};
 $("zoomOut").onclick=()=>{scale=Math.max(.5,scale-.2);$("zoomLabel").textContent=Math.round(scale/1.15*100)+"%";if(tab!=="solution")render()};
 const last=questions.find(q=>q.id===history[history.length-1]);
 if(mcqSession&&!mcqSession.ended&&!mcqSession.pendingId&&last&&paper(last)==="P1"&&!mcqSession.answers.some(a=>a.id===last.id))mcqSession.pendingId=last.id;
 if(mode==="P1"&&mcqSession?.ended){setMode("P1");showSessionSummary()}
 else if(mode==="P1"&&mcqSession?.pendingId)nextMcq();
 else if(mode==="P2"&&structuredSession?.pendingId){const q=questions.find(q=>q.id===structuredSession.pendingId);if(q)open(q,false);else setMode(mode)}
 else if(last&&paper(last)===mode)open(last,false);else setMode(mode);
 stats()}
fetch("./questions.json").then(r=>{if(!r.ok)throw Error(r.status);return r.json()}).then(q=>{questions=q;init()}).catch(e=>{$("gate").classList.remove("hidden");$("gate").innerHTML='<div class="login"><h2>Unable to start the trainer</h2><p>Reload the page and check your internet connection. The question index or a required dependency could not be loaded. Your saved progress has not been reset.</p></div>';console.error(e)});
