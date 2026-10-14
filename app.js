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
const save=()=>localStorage.setItem(KEY,JSON.stringify({selected:[...selected],seen:[...seen],history:history.slice(-500),favs:[...favs],ch9Pilot:true,mode,attempts}));
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const chapters=q=>(q.chapters||"").split(",").map(x=>Number(x.trim()));
const paper=q=>q.source?.match(/9702\/(\d)/)?.[1]==="1"?"P1":"P2";
function pool(){return questions.filter(q=>chapters(q).some(c=>selected.has(c))&&paper(q)===mode)}
function sidebar(){const counts=Array.from({length:15},(_,i)=>questions.filter(q=>chapters(q).includes(i+1)).length);
 $("chapters").innerHTML=names.map((n,i)=>`<label class="chapter"><input type="checkbox" data-ch="${i+1}" ${selected.has(i+1)?"checked":""}><span>${String(i+1).padStart(2,"0")} &nbsp; ${esc(n)}</span><span class="count">${counts[i]}</span></label>`).join("");
 document.querySelectorAll("[data-ch]").forEach(el=>el.onchange=()=>{let n=Number(el.dataset.ch);el.checked?selected.add(n):selected.delete(n);save();stats()});
 stats()}
function stats(){const p=pool(),left=p.filter(q=>!seen.has(q.id)).length;$("selectionCount").textContent=selected.size+" selected";$("progress").textContent=`${left} unseen / ${p.length} available`;}
function open(q,record=true){if(!q)return;current=q;mode=paper(q);refreshModeButtons();if(record){history.push(q.id);history=history.slice(-500)}save();
 $("heading").textContent=`${q.source} · Question ${q.question}`;
 $("subheading").textContent=q.topic||"Original Cambridge examination question";
 $("paperBadge").textContent=paper(q);$("marksBadge").textContent=`${q.marks||"—"} marks`;$("chapterBadge").textContent="Ch. "+q.chapters;
 $("favourite").textContent=favs.has(q.id)?"★ Favourite":"☆ Favourite";setTab("qp");stats()}
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
function generate(){const p=pool().filter(q=>!seen.has(q.id));if(!p.length){alert(pool().length?"All matching questions have been seen. Use Reset seen to start again.":"No questions indexed for this chapter/paper selection.");return}
 const q=p[Math.floor(Math.random()*p.length)];seen.add(q.id);open(q)}
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
 mode=m;current=null;save();refreshModeButtons();
 $("heading").textContent=m==="P1"?"Paper 1 — MCQ drill":"Paper 2 — Structured questions";
 $("subheading").textContent=m==="P1"?"Choose chapters, answer A–D, receive immediate feedback.":"Original Cambridge questions and mark schemes.";
 $("paperBadge").textContent=m;$("marksBadge").textContent=m==="P1"?"1 mark":"— marks";
 $("chapterBadge").textContent=selected.size===1?"Chapter "+[...selected][0]:"Selected chapters";
 stats();render();
}
async function renderMcq(token,view){
 const q=current,f=pdfFile(q.qp_file);
 if(!f){view.innerHTML='<div class="empty"><h2>Local Paper 1 PDF not found</h2><p>Expected: <strong>'+esc(q.qp_file)+'</strong></p><p>Connect the saved PDF folder or choose your local Question Paper PDFs. Nothing is uploaded.</p></div>';return}
 const done=attempts[q.id];
 view.innerHTML='<div class="mcq-work"><div class="mcq-top"><strong>Question '+esc(q.question)+'</strong><span>Choose ONE correct answer · 1 mark</span></div><div id="mcqPictures" class="mcq-pictures"><p>Loading original Cambridge question…</p></div><div class="mcq-actions"><div class="mcq-options">'+["A","B","C","D"].map(a=>'<button data-answer="'+a+'" class="'+(done?(a===q.answer?"is-correct":a===done&&done!==q.answer?"is-wrong":""):"")+'" '+(done?"disabled":"")+'> '+a+' </button>').join("")+'</div><div id="mcqFeedback" class="mcq-feedback"></div><button id="mcqNext" class="primary">Next MCQ →</button></div></div>';
 const feedback=$("mcqFeedback");if(done)feedback.textContent=done===q.answer?"✓ Correct!":"Not quite. The correct answer is "+q.answer+".";
 else document.querySelectorAll("[data-answer]").forEach(b=>b.onclick=()=>{
    if(attempts[q.id])return;
    attempts[q.id]=b.dataset.answer;save();for(const x of document.querySelectorAll("[data-answer]")){x.disabled=true;x.classList.toggle("is-correct",x.dataset.answer===q.answer);x.classList.toggle("is-wrong",x.dataset.answer===b.dataset.answer&&b.dataset.answer!==q.answer)}
    feedback.textContent=b.dataset.answer===q.answer?"✓ Correct!":"Not quite. The correct answer is "+q.answer+".";
 });
 $("mcqNext").onclick=generate;
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

function init(){const cfg=window.TRAINER_CONFIG||{};const unlock=()=>{$("gate").classList.add("hidden");$("app").classList.remove("hidden")};
 if(cfg.demoGate&&!sessionStorage.getItem("mms_demo_access")){$("gate").classList.remove("hidden");$("gateForm").onsubmit=e=>{e.preventDefault();if($("pass").value===cfg.demoPassword){sessionStorage.setItem("mms_demo_access","yes");unlock()}else $("gateError").textContent="Incorrect code."}}else unlock();
 sidebar();installModeSwitcher();setupSavedFolder();$("generate").onclick=generate;$("selectAll").onclick=()=>{selected=new Set(names.map((_,i)=>i+1));sidebar();save()};$("selectNone").onclick=()=>{selected.clear();sidebar();save()};
 $("paper1").parentElement.parentElement.style.display="none";
 $("folder").onchange=e=>loadFiles(e.target.files);$("files").onchange=e=>loadFiles(e.target.files);
 $("previous").onclick=()=>{if(history.length>1){history.pop();open(questions.find(q=>q.id===history[history.length-1]),false);save()}};
 $("historyBtn").onclick=showHistory;$("closeHistory").onclick=()=>$("historyDialog").close();
 $("favourite").onclick=()=>{if(!current)return;favs.has(current.id)?favs.delete(current.id):favs.add(current.id);save();$("favourite").textContent=favs.has(current.id)?"★ Favourite":"☆ Favourite"};
 $("reset").onclick=()=>{if(confirm("Reset seen questions? History and favourites are preserved.")){seen.clear();save();stats()}};
 document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
 $("zoomIn").onclick=()=>{scale=Math.min(2.8,scale+.2);$("zoomLabel").textContent=Math.round(scale/1.15*100)+"%";if(tab!=="solution")render()};
 $("zoomOut").onclick=()=>{scale=Math.max(.5,scale-.2);$("zoomLabel").textContent=Math.round(scale/1.15*100)+"%";if(tab!=="solution")render()};
 const last=questions.find(q=>q.id===history[history.length-1]);if(last&&paper(last)===mode)open(last,false);else setMode(mode);stats()}
fetch("./questions.json").then(r=>{if(!r.ok)throw Error(r.status);return r.json()}).then(q=>{questions=q;init()}).catch(e=>{$("gate").classList.remove("hidden");$("gate").innerHTML='<div class="login"><h2>Launch via a local web server</h2><p>Run <code>start_local_server.bat</code> on Windows, then open http://localhost:8000. GitHub Pages will work directly.</p></div>';console.error(e)});
