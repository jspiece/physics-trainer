import * as pdfjs from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
const $=id=>document.getElementById(id);
const names=["Kinematics","Accelerated motion","Dynamics","Forces, vectors & moments","Work, energy & power","Momentum","Matter & materials","Current, p.d. & resistance","Kirchhoff's laws","Resistance & resistivity","Practical circuits","Waves","Superposition","Stationary waves","Atomic & particle physics"];
const KEY="mms_physics_web_v05";
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||"{}")}catch{}
// Initial chapter-9 classroom rollout: migrate old Chapter-8-only preference once.
if(!saved.ch9Pilot && (!saved.selected || (saved.selected.length===1 && saved.selected[0]===8))){saved.selected=[9];saved.ch9Pilot=true;localStorage.setItem(KEY,JSON.stringify(saved));}
let questions=[],selected=new Set(saved.selected||[9]),seen=new Set(saved.seen||[]),history=saved.history||[],favs=new Set(saved.favs||[]);
let current=null,tab="qp",scale=1.15,files=new Map(),renderToken=0;
let mode=saved.mode||"P2", attempts=saved.attempts||{}, savedDirHandle=null;
let sessions=saved.sessions||[], mcqSession=saved.mcqSession||null, paper2Grades=saved.paper2Grades||{};
const SESSION_TARGET=20;
const save=()=>localStorage.setItem(KEY,JSON.stringify({selected:[...selected],seen:[...seen],history:history.slice(-500),favs:[...favs],ch9Pilot:true,mode,attempts,sessions:sessions.slice(-100),mcqSession,paper2Grades}));
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const chapters=q=>(q.chapters||"").split(",").map(x=>Number(x.trim()));
const paper=q=>q.source?.match(/9702\/(\d)/)?.[1]==="1"?"P1":"P2";
function pool(){return questions.filter(q=>chapters(q).some(c=>selected.has(c))&&paper(q)===mode)}
function sidebar(){const counts=Array.from({length:15},(_,i)=>questions.filter(q=>chapters(q).includes(i+1)).length);
 $("chapters").innerHTML=names.map((n,i)=>`<label class="chapter"><input type="checkbox" data-ch="${i+1}" ${selected.has(i+1)?"checked":""}><span>${String(i+1).padStart(2,"0")} &nbsp; ${esc(n)}</span><span class="count">${counts[i]}</span></label>`).join("");
 document.querySelectorAll("[data-ch]").forEach(el=>el.onchange=()=>{let n=Number(el.dataset.ch);el.checked?selected.add(n):selected.delete(n);save();stats()});
 stats()}
function stats(){
 const p=pool(),left=p.filter(q=>!seen.has(q.id)).length;
 $("selectionCount").textContent=selected.size+" selected";
 $("progress").textContent=mode==="P1"&&mcqSession ? "Session "+mcqSession.answers.length+"/"+mcqSession.limit+" · "+sessionCorrect()+"/"+mcqSession.answers.length+" correct" : left+" unseen / "+p.length+" available";
 updateProgressPanel();
}
function open(q,record=true){if(!q)return;current=q;mode=paper(q);refreshModeButtons();if(record){history.push(q.id);history=history.slice(-500)}save();
 $("heading").textContent=`${q.source} · Question ${q.question}`;
 $("subheading").textContent=q.topic||"Original Cambridge examination question";
 $("paperBadge").textContent=paper(q);$("marksBadge").textContent=`${q.marks||"—"} marks`;$("chapterBadge").textContent="Ch. "+q.chapters;
 $("favourite").textContent=favs.has(q.id)?"★ Favourite":"☆ Favourite";setTab("qp");stats();renderPaper2Grade()}
function setTab(t){tab=t;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===t));render()}
function pdfFile(name){return files.get((name||"").toLowerCase())}
function pages(str){return String(str||"").split(",").flatMap(s=>{let [a,b]=s.trim().split("-").map(Number);return b?Array.from({length:b-a+1},(_,i)=>a+i):[a]}).filter(x=>x>0)}
async function render(){const token=++renderToken,view=$("viewer");view.innerHTML="";
 if(current && mode==="P1"){await renderMcq(token,view);return;}
 if(!current){view.innerHTML='<div class="empty"><div class="emptyicon">∑</div><h2>Ready to practise?</h2><p>Generate a question to begin.</p></div>';return}
 if(tab==="solution"){
 const steps=current.solution_steps;
 if(steps?.length){
   const content=steps.map((step,i)=>`<section class="solution-step"><h3>Step ${i+1} — ${esc(step.title)}</h3><p>${esc(step.body).replace(/\\*\\*(.*?)\\*\\*/g,"<strong>$1</strong>")}</p></section>`).join("");
   view.innerHTML=`<article class="solution"><h2>Explained solution</h2><p class="notice">Teacher commentary for <strong>${esc(current.source)} · Q${esc(current.question)}</strong>. This is not the official Cambridge mark scheme. Read the original question and check the official marking points.</p>${content}</article>`;
 } else {
   view.innerHTML=`<article class="solution"><h2>Study guidance</h2><p class="notice">A question-specific explanation has not yet been prepared. For marking, use the <strong>Official mark scheme</strong> tab.</p><p><strong>Topic:</strong> ${esc(current.topic||"AS Physics")}</p><h3>Useful approach</h3><p>Read the circuit or diagram carefully, identify the physical quantities and choose the relevant equation. Show every substitution with SI units and check your reasoning against the official mark scheme.</p></article>`;
 }
 try{await window.MathJax?.typesetPromise?.([view]);}catch(err){console.warn("MathJax typesetting",err)}
 return;
 }
 const name=current[tab+"_file"],f=pdfFile(name);
 if(!f){view.innerHTML=`<div class="empty"><h2>Local PDF not found</h2><p>Expected: <strong>${esc(name)}</strong></p><p>Choose the folder containing your extracted QP and MS PDFs in the sidebar.<br>Files remain entirely on this device.</p></div>`;return}
 view.innerHTML='<div class="empty">Rendering original PDF pages…</div>';
 try{const data=await f.arrayBuffer();const doc=await pdfjs.getDocument({data:new Uint8Array(data)}).promise;if(token!==renderToken)return;
 view.innerHTML="";for(const p of pages(current[tab+"_pages"])){if(token!==renderToken)break;if(p>doc.numPages)continue;
 const page=await doc.getPage(p);const viewport=page.getViewport({scale});const canvas=document.createElement("canvas");canvas.width=Math.floor(viewport.width);canvas.height=Math.floor(viewport.height);view.append(canvas);
 await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise}
 if(!view.children.length)view.textContent="No pages available for this reference.";
 }catch(e){view.innerHTML=`<div class="empty">Could not open PDF: ${esc(e.message)}</div>`}}
function generate(){
 if(mode==="P1"){nextMcq();return}
 const p=pool().filter(q=>!seen.has(q.id));
 if(!p.length){alert(pool().length?"All matching Paper 2 questions have been seen. Use Reset seen if you want to practise them again.":"No Paper 2 questions indexed for this chapter selection.");return}
 const q=p[Math.floor(Math.random()*p.length)];seen.add(q.id);open(q);
}
function sessionCorrect(){return (mcqSession?.answers||[]).filter(a=>a.correct).length}
function sessionAvailable(){return pool().filter(q=>!seen.has(q.id)).length}
function newMcqSession(){
 const n=sessionAvailable();
 if(!n){alert(pool().length?"All matching MCQs have been seen. Click Reset seen to practise again.":"No MCQs indexed for these chapters.");return false}
 const limit=Math.min(SESSION_TARGET,n);
 mcqSession={startedAt:new Date().toISOString(),chapters:[...selected],limit,answers:[],ended:false};
 save();stats();return true;
}
function finishSession(){
 if(!mcqSession||mcqSession.ended)return;
 if(mcqSession.answers.length===0){mcqSession=null;save();stats();return}
 mcqSession.ended=true;
 sessions.push({date:new Date().toISOString(),chapters:mcqSession.chapters,limit:mcqSession.limit,answers:mcqSession.answers.map(a=>({...a})),correct:sessionCorrect()});
 sessions=sessions.slice(-100);save();showSessionSummary();stats();
}
function chooseNextMcq(){
 const usedInSession=new Set((mcqSession?.answers||[]).map(a=>a.id));
 const remaining=pool().filter(q=>!seen.has(q.id)&&!usedInSession.has(q.id));
 if(!remaining.length)return null;
 const recentGroups=new Set((mcqSession?.answers||[]).slice(-3).map(a=>questions.find(q=>q.id===a.id)?.mcq_group).filter(Boolean));
 const diverse=remaining.filter(q=>!q.mcq_group||!recentGroups.has(q.mcq_group));
 const choices=diverse.length?diverse:remaining;
 return choices[Math.floor(Math.random()*choices.length)];
}
function nextMcq(){
 if(!mcqSession||mcqSession.ended){if(!newMcqSession())return}
 if(current&&paper(current)==="P1"&&!mcqSession.answers.some(a=>a.id===current.id)&&!mcqSession.ended){alert("Answer the current question before moving on.");return}
 if(mcqSession.answers.length>=mcqSession.limit){finishSession();return}
 const q=chooseNextMcq();if(!q){finishSession();return}
 seen.add(q.id);open(q);save();
}
function recordMcq(q,choice){
 if(!mcqSession||mcqSession.ended||mcqSession.answers.some(a=>a.id===q.id))return;
 attempts[q.id]=choice;
 mcqSession.answers.push({id:q.id,choice,correct:choice===q.answer,chapters:q.chapters});
 save();stats();refreshMcqEndButton();
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
 $("subheading").textContent="Your results are saved locally in this browser.";
 const wrong=mcqSession.answers.filter(a=>!a.correct).map(a=>{
 const q=questions.find(q=>q.id===a.id);return q?'<button class="review-question" data-review="'+esc(q.id)+'">'+esc(q.source)+' · Q'+esc(q.question)+' — Your answer: '+esc(a.choice)+'; correct: '+esc(q.answer)+'</button>':""
 }).join("");
 $("viewer").innerHTML='<div class="session-summary"><h2>Session complete</h2><div class="big-score">'+correct+' / '+n+'</div><p>'+Math.round(100*correct/Math.max(1,n))+'% correct · '+n+' questions answered</p><h3>Questions to revisit ('+(n-correct)+')</h3>'+(wrong||'<p>Excellent — no mistakes to review.</p>')+'<button id="newSessionButton" class="primary">Start a new session →</button></div>';
 document.querySelectorAll("[data-review]").forEach(b=>b.onclick=()=>{const q=questions.find(q=>q.id===b.dataset.review);if(q)open(q,false)});
 $("newSessionButton").onclick=()=>{mcqSession=null;current=null;save();nextMcq()};
}
function loadFiles(list){let count=0;for(const f of list){if(f.name.toLowerCase().endsWith(".pdf")){files.set(f.name.toLowerCase(),f);count++}}$("fileStatus").textContent=`${files.size} PDF files ready locally (this browser tab).`;if(current)render()}
function showHistory(){const list=history.map(id=>questions.find(q=>q.id===id)).filter(Boolean).reverse();$("historyList").innerHTML=list.map(q=>`<button class="historyitem" data-id="${esc(q.id)}">${favs.has(q.id)?"★ ":""}${esc(q.source)} · Q${esc(q.question)} · ${esc(q.topic||"")}</button>`).join("")||"<p>No history yet.</p>";
 document.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>{open(questions.find(q=>q.id===b.dataset.id),false);$("historyDialog").close()});$("historyDialog").showModal()}

/* Paper 1 multiple-choice drill: original question content remains in local PDFs. */
function installModeSwitcher(){
 const host=document.createElement("div");host.className="mode-picker";
 host.innerHTML='<button type="button" id="switchP1">Paper 1 · MCQ drill</button><button type="button" id="switchP2">Paper 2 · Structured</button>';
 const marker=document.querySelector(".sidebar .sectionlabel:nth-of-type(2)");
 const gen=$("generate");gen.parentElement.insertBefore(host,gen);
 $("switchP1").onclick=()=>setMode("P1");
 $("switchP2").onclick=()=>setMode("P2");
 refreshModeButtons();
}
function refreshModeButtons(){
 for(const [m,id] of [["P1","switchP1"],["P2","switchP2"]]){const b=$(id);if(b)b.classList.toggle("chosen",mode===m)}
 document.body.classList.toggle("mode-p1",mode==="P1");
 const g=$("generate");if(g)g.textContent=mode==="P1"?"Generate MCQ →":"Generate question →";
}
function setMode(m){
 mode=m;current=null;save();refreshModeButtons();renderPaper2Grade();
 $("heading").textContent=m==="P1"?"Paper 1 — MCQ drill":"Paper 2 — Structured questions";
 $("subheading").textContent=m==="P1"?"Choose chapters, answer A–D, receive immediate feedback.":"Original Cambridge questions and mark schemes.";
 $("paperBadge").textContent=m;$("marksBadge").textContent=m==="P1"?"1 mark":"— marks";
 $("chapterBadge").textContent=selected.size===1?"Chapter "+[...selected][0]:"Selected chapters";
 stats();render();
}
async function renderMcq(token,view){
 const q=current,f=pdfFile(q.qp_file);
 if(!f){view.innerHTML='<div class="empty"><h2>Local Paper 1 PDF not found</h2><p>Expected: <strong>'+esc(q.qp_file)+'</strong></p><p>Connect the saved PDF folder or choose your local Question Paper PDFs. Nothing is uploaded.</p></div>';return}
 const done=mcqSession?.answers.find(a=>a.id===q.id)?.choice;
 view.innerHTML='<div class="mcq-work"><div class="mcq-top"><strong>Question '+esc(q.question)+'</strong><span>Choose ONE correct answer · 1 mark</span></div><div id="mcqPictures" class="mcq-pictures"><p>Loading original Cambridge question…</p></div><div class="mcq-actions"><div class="mcq-options">'+["A","B","C","D"].map(a=>'<button data-answer="'+a+'" class="'+(done?(a===q.answer?"is-correct":a===done&&done!==q.answer?"is-wrong":""):"")+'" '+(done?"disabled":"")+'> '+a+' </button>').join("")+'</div><div id="mcqFeedback" class="mcq-feedback"></div><button id="mcqNext" class="primary">Next MCQ →</button></div></div>';
 const feedback=$("mcqFeedback");
 function showMcqFeedback(choice){
   feedback.textContent=choice===q.answer?"✓ Correct!":"Not quite. The correct answer is "+q.answer+".";
   const panel=document.createElement("div");panel.className="mcq-explanation";
   const heading=document.createElement("strong");heading.textContent="Why?";panel.append(heading);
   const explanation=document.createElement("p");
   explanation.textContent=q.mcq_explanation||"A question-specific explanation is not yet available for this MCQ. Compare the correct option with the original question and ask your teacher about any uncertainty.";
   panel.append(explanation);feedback.append(panel);
   if(q.mcq_explanation)window.MathJax?.typesetPromise?.([explanation]).catch(console.warn);
 }
 if(done){showMcqFeedback(done);refreshMcqEndButton();}
 else document.querySelectorAll("[data-answer]").forEach(b=>b.onclick=()=>{
    if(attempts[q.id])return;
    recordMcq(q,b.dataset.answer);for(const x of document.querySelectorAll("[data-answer]")){x.disabled=true;x.classList.toggle("is-correct",x.dataset.answer===q.answer);x.classList.toggle("is-wrong",x.dataset.answer===b.dataset.answer&&b.dataset.answer!==q.answer)}
    showMcqFeedback(b.dataset.answer);
 });
 $("mcqNext").onclick=()=>{if(mcqSession?.ended)showSessionSummary();else nextMcq()};refreshMcqEndButton();
 try{
 const doc=await pdfjs.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;
 if(token!==renderToken){doc.destroy();return}
 const area=$("mcqPictures");area.textContent="";
 for(const clip of [q.qp_clip,q.qp_clip2].filter(Boolean)){
   const [number,top,bottom]=clip.split(":").map(Number),page=await doc.getPage(number),vp=page.getViewport({scale});
   const full=document.createElement("canvas");full.width=Math.floor(vp.width);full.height=Math.floor(vp.height);
   await page.render({canvasContext:full.getContext("2d"),viewport:vp}).promise;
   if(token!==renderToken)break;
   const y=Math.max(0,Math.round(top*scale)),height=Math.max(40,Math.min(full.height-y,Math.round((bottom-top)*scale)));
   const cropped=document.createElement("canvas");cropped.width=full.width;cropped.height=height;
   cropped.getContext("2d").drawImage(full,0,y,full.width,height,0,0,full.width,height);
   area.append(cropped);
 }
 await doc.destroy();
 }catch(err){if(token===renderToken)$("mcqPictures").textContent="Could not render local PDF: "+err.message}
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
 await walk(handle);loadFiles(found);$("fileStatus").textContent=found.length+" PDFs from saved folder '"+handle.name+"' · local only";
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
   savedDirHandle=handle;await saveFolderHandle(handle);await scanFolder(handle);btn.textContent="Reconnect PDF folder ✓";
  }catch(err){if(err.name!=="AbortError")$("fileStatus").textContent="Folder access: "+err.message}
 };
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
 updateProgressPanel();
}
function updateProgressPanel(){
 const bar=$("studentProgress");if(!bar)return;
 if(mode==="P1"){
  const total=mcqSession?.answers.length||0,ok=sessionCorrect(),limit=mcqSession?.limit||Math.min(SESSION_TARGET,sessionAvailable());
  const pct=total?Math.round(100*ok/total):0;
  const historical=sessions.length;
  bar.innerHTML='<div><strong>MCQ session</strong><span>'+total+'/'+limit+' answered</span><span>'+ok+'/'+total+' correct</span><span>'+pct+'% accuracy</span></div><div class="session-track"><i style="width:'+(limit?100*total/limit:0)+'%"></i></div><small>'+historical+' completed session(s) saved in this browser <button class="saved-sessions" id="savedSessionsButton">View results</button>'+(mcqSession?.ended?' · Session finished':'')+'</small>';
  $("savedSessionsButton").onclick=showSavedSessions;
 }else{
  const grades=Object.values(paper2Grades),done=grades.length,points=grades.reduce((sum,g)=>sum+Number(g.score||0),0),max=grades.reduce((sum,g)=>sum+Number(g.max||0),0);
  bar.innerHTML='<div><strong>Paper 2 self-assessment</strong><span>'+done+' graded</span><span>'+(max?Math.round(points/max*100)+'% of marks':'No marks yet')+'</span></div><small>Mark your own answers using the original mark scheme.</small>';
 }
}
function showSavedSessions(){
 const rows=sessions.slice().reverse().map(s=>{
 const date=new Date(s.date).toLocaleDateString();
 const total=s.answers.length,wrong=s.answers.filter(a=>!a.correct).length;
 return '<div class="saved-session-row"><strong>'+esc(date)+'</strong><span>Ch. '+esc(s.chapters.join(", "))+'</span><span>'+s.correct+'/'+total+' correct ('+Math.round(100*s.correct/Math.max(1,total))+'%)</span><span>'+wrong+' to review</span></div>';
 }).join("");
 const dialog=document.createElement("dialog");dialog.className="saved-sessions-dialog";
 dialog.innerHTML='<h2>My MCQ session history</h2><p>Saved on this browser only.</p>'+(rows||'<p>No completed sessions yet.</p>')+'<button id="closeSessions">Close</button>';
 document.body.append(dialog);dialog.showModal();
 dialog.querySelector("#closeSessions").onclick=()=>dialog.close();
 dialog.onclose=()=>dialog.remove();
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
 save();updateProgressPanel();$("gradeStatus").textContent="Saved on this device ✓";
 };
}

function init(){const cfg=window.TRAINER_CONFIG||{};const unlock=()=>{$("gate").classList.add("hidden");$("app").classList.remove("hidden")};
 if(cfg.demoGate&&!sessionStorage.getItem("mms_demo_access")){$("gate").classList.remove("hidden");$("gateForm").onsubmit=e=>{e.preventDefault();if($("pass").value===cfg.demoPassword){sessionStorage.setItem("mms_demo_access","yes");unlock()}else $("gateError").textContent="Incorrect code."}}else unlock();
 sidebar();installModeSwitcher();installProgressUI();setupSavedFolder();$("generate").onclick=generate;$("selectAll").onclick=()=>{selected=new Set(names.map((_,i)=>i+1));sidebar();save()};$("selectNone").onclick=()=>{selected.clear();sidebar();save()};
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
 if(mode==="P1"&&mcqSession?.ended){setMode("P1");showSessionSummary()}
 else if(last&&paper(last)===mode)open(last,false);else setMode(mode);
 stats()}
fetch("./questions.json").then(r=>{if(!r.ok)throw Error(r.status);return r.json()}).then(q=>{questions=q;init()}).catch(e=>{$("gate").classList.remove("hidden");$("gate").innerHTML='<div class="login"><h2>Launch via a local web server</h2><p>Run <code>start_local_server.bat</code> on Windows, then open http://localhost:8000. GitHub Pages will work directly.</p></div>';console.error(e)});
