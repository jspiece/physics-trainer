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
const save=()=>localStorage.setItem(KEY,JSON.stringify({selected:[...selected],seen:[...seen],history:history.slice(-500),favs:[...favs],ch9Pilot:true}));
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const chapters=q=>(q.chapters||"").split(",").map(x=>Number(x.trim()));
const paper=q=>q.source?.match(/9702\/(\d)/)?.[1]==="1"?"P1":"P2";
function pool(){return questions.filter(q=>chapters(q).some(c=>selected.has(c))&&$(paper(q)==="P1"?"paper1":"paper2").checked)}
function sidebar(){const counts=Array.from({length:15},(_,i)=>questions.filter(q=>chapters(q).includes(i+1)).length);
 $("chapters").innerHTML=names.map((n,i)=>`<label class="chapter"><input type="checkbox" data-ch="${i+1}" ${selected.has(i+1)?"checked":""}><span>${String(i+1).padStart(2,"0")} &nbsp; ${esc(n)}</span><span class="count">${counts[i]}</span></label>`).join("");
 document.querySelectorAll("[data-ch]").forEach(el=>el.onchange=()=>{let n=Number(el.dataset.ch);el.checked?selected.add(n):selected.delete(n);save();stats()});
 stats()}
function stats(){const p=pool(),left=p.filter(q=>!seen.has(q.id)).length;$("selectionCount").textContent=selected.size+" selected";$("progress").textContent=`${left} unseen / ${p.length} available`;}
function open(q,record=true){if(!q)return;current=q;if(record){history.push(q.id);history=history.slice(-500)}save();
 $("heading").textContent=`${q.source} · Question ${q.question}`;
 $("subheading").textContent=q.topic||"Original Cambridge examination question";
 $("paperBadge").textContent=paper(q);$("marksBadge").textContent=`${q.marks||"—"} marks`;$("chapterBadge").textContent="Ch. "+q.chapters;
 $("favourite").textContent=favs.has(q.id)?"★ Favourite":"☆ Favourite";setTab("qp");stats()}
function setTab(t){tab=t;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===t));render()}
function pdfFile(name){return files.get((name||"").toLowerCase())}
function pages(str){return String(str||"").split(",").flatMap(s=>{let [a,b]=s.trim().split("-").map(Number);return b?Array.from({length:b-a+1},(_,i)=>a+i):[a]}).filter(x=>x>0)}
async function render(){const token=++renderToken,view=$("viewer");view.innerHTML="";
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
function init(){const cfg=window.TRAINER_CONFIG||{};const unlock=()=>{$("gate").classList.add("hidden");$("app").classList.remove("hidden")};
 if(cfg.demoGate&&!sessionStorage.getItem("mms_demo_access")){$("gate").classList.remove("hidden");$("gateForm").onsubmit=e=>{e.preventDefault();if($("pass").value===cfg.demoPassword){sessionStorage.setItem("mms_demo_access","yes");unlock()}else $("gateError").textContent="Incorrect code."}}else unlock();
 sidebar();$("generate").onclick=generate;$("selectAll").onclick=()=>{selected=new Set(names.map((_,i)=>i+1));sidebar();save()};$("selectNone").onclick=()=>{selected.clear();sidebar();save()};
 $("paper1").onchange=stats;$("paper2").onchange=stats;
 $("folder").onchange=e=>loadFiles(e.target.files);$("files").onchange=e=>loadFiles(e.target.files);
 $("previous").onclick=()=>{if(history.length>1){history.pop();open(questions.find(q=>q.id===history[history.length-1]),false);save()}};
 $("historyBtn").onclick=showHistory;$("closeHistory").onclick=()=>$("historyDialog").close();
 $("favourite").onclick=()=>{if(!current)return;favs.has(current.id)?favs.delete(current.id):favs.add(current.id);save();$("favourite").textContent=favs.has(current.id)?"★ Favourite":"☆ Favourite"};
 $("reset").onclick=()=>{if(confirm("Reset seen questions? History and favourites are preserved.")){seen.clear();save();stats()}};
 document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
 $("zoomIn").onclick=()=>{scale=Math.min(2.8,scale+.2);$("zoomLabel").textContent=Math.round(scale/1.15*100)+"%";if(tab!=="solution")render()};
 $("zoomOut").onclick=()=>{scale=Math.max(.5,scale-.2);$("zoomLabel").textContent=Math.round(scale/1.15*100)+"%";if(tab!=="solution")render()};
 const last=questions.find(q=>q.id===history[history.length-1]);if(last)open(last,false);stats()}
fetch("./questions.json").then(r=>{if(!r.ok)throw Error(r.status);return r.json()}).then(q=>{questions=q;init()}).catch(e=>{$("gate").classList.remove("hidden");$("gate").innerHTML='<div class="login"><h2>Launch via a local web server</h2><p>Run <code>start_local_server.bat</code> on Windows, then open http://localhost:8000. GitHub Pages will work directly.</p></div>';console.error(e)});
