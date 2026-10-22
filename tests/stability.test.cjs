const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8').replace(/^import .*;\n/, 'const pdfjs=globalThis.pdfMock;\n').split('fetch("./questions.json")')[0];
function harness(saved={}, failStorage=false){
 const nodes=new Map();
 function element(){return {textContent:'',children:[],style:{},dataset:{},disabled:false,classList:{toggle(){},add(){},remove(){}},append(x){this.children.push(x)},querySelector(){return element()},querySelectorAll(){return []},insertAdjacentElement(){},remove(){},showModal(){},close(){},getContext(){return {drawImage(){}}},set innerHTML(v){this.html=v;this.children=[]},get innerHTML(){return this.html||''}}}
 const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 let stored=JSON.stringify(saved),destroyed=0;
 const context=vm.createContext({console:{warn(){},error(){}},Uint8Array,Blob,URL,setTimeout,clearTimeout,alert(){},confirm(){return true},document:{getElementById:node,querySelectorAll(){return []},querySelector(){return element()},createElement:element,body:element()},window:{TRAINER_CONFIG:{demoGate:false}},sessionStorage:{getItem(){return 'yes'}},localStorage:{getItem(){return stored},setItem(k,v){if(failStorage)throw Error('QuotaExceeded');stored=v}},pdfMock:{GlobalWorkerOptions:{},getDocument(){return {promise:Promise.resolve({numPages:20,getPage:async()=>({getViewport:()=>({width:600,height:842}),render:()=>({promise:Promise.resolve()})}),destroy:async()=>{destroyed++}})}}}});
 vm.runInContext(source,context);
 return {run:code=>vm.runInContext(code,context),node,context,stored:()=>JSON.parse(stored),destroyed:()=>destroyed};
}
const fixture=Array.from({length:25},(_,i)=>({id:'q'+i,source:'9702/12/M/J/25',question:String(i+1),chapters:i<22?'1':'2',answer:'A',qp_file:'fixture.pdf',qp_pages:'1',qp_clip:'1:60:200'}));
function sessionHarness(saved){const h=harness(saved);h.run(`questions=${JSON.stringify(fixture)}; mode="P1";selected=new Set([1]);open=q=>{current=q};stats=()=>{};showSessionSummary=()=>{};`);return h}
test('session caps at 20, no duplicate IDs, second attempt works without Reset seen',()=>{
 const h=sessionHarness();
 h.run('nextMcq()');
 for(let i=0;i<20;i++){assert.equal(h.run('recordMcq(current,"A")'),true);assert.equal(h.run('recordMcq(current,"B")'),false);h.run('nextMcq()')}
 assert.equal(h.run('mcqSession.ended'),true);assert.equal(h.run('new Set(mcqSession.answers.map(a=>a.id)).size'),20);assert.equal(h.run('sessionCorrect()'),20);
 h.run('seen=new Set(questions.map(q=>q.id));nextMcq()');assert.equal(h.run('recordMcq(current,"B")'),true);assert.equal(h.run('mcqSession.answers.length'),1);
});
test('changing chapters and consulting history cannot lose pending question or contaminate session',()=>{
 const h=sessionHarness();h.run('nextMcq();globalThis.pending=current.id;selected=new Set([2]);current=questions[24];nextMcq()');assert.equal(h.run('current.id===pending'),true);
 assert.equal(h.run('recordMcq(questions[24],"A")'),false);h.run('recordMcq(current,"A");nextMcq()');assert.equal(h.run('current.chapters'),'1');
});
test('reload resumes pending ID, preserves favourites, grades, answers and storage key',()=>{
 const h=sessionHarness({favs:['q1'],paper2Grades:{p2:{score:3,max:5,review:true}}});h.run('nextMcq();save()');const before=h.stored();
 const resumed=sessionHarness(before);resumed.run('nextMcq()');assert.equal(resumed.run('current.id'),before.mcqSession.pendingId);assert.equal(resumed.run('favs.has("q1")'),true);assert.equal(resumed.run('paper2Grades.p2.score'),3);
});
test('storage quota failure is visible and does not crash session scoring',()=>{
 const h=sessionHarness(); // separate failing storage instance
 const bad=harness({},true);bad.run(`questions=${JSON.stringify(fixture)};mode="P1";stats=()=>{};open=q=>{current=q};nextMcq();recordMcq(current,"A")`);
 assert.match(bad.node('status').textContent,/could not be saved/);assert.equal(bad.run('mcqSession.answers.length'),1);
});
test('invalid root saved values do not crash boot; intentionally empty selection is preserved',()=>{
 for(const value of [null,[],42,{selected:[],allChaptersRollout:true},{history:null,favs:{},seen:3}]){const h=harness(value);assert.doesNotThrow(()=>h.run('save()'))}
 assert.equal(harness({selected:[],allChaptersRollout:true}).run('selected.size'),0);
});
test('mistakes are prioritised over previous successes after unseen pool is exhausted',()=>{
 const h=sessionHarness();h.run('newMcqSession();seen=new Set(questions.map(q=>q.id));attempts=Object.fromEntries(questions.map(q=>[q.id,"A"]));attempts.q4="B"');assert.equal(h.run('chooseNextMcq().id'),'q4');
});
test('PDF pages: valid ranges only; stale P2 render cannot overwrite a newer question and destroys document',async()=>{
 const h=harness();assert.equal(h.run('pages("2-4,7").join(",")'),'2,3,4,7');assert.equal(h.run('pages("4-2,NaN,0,1-999999").length'),0);
 let release;const pending=new Promise(r=>{release=r});h.context.renderWait=pending;
 h.run('pdfjs.getDocument=()=>({promise:renderWait});current={id:"p2",source:"9702/22/M/J/25",qp_file:"fixture.pdf",qp_pages:"1"};files.set("fixture.pdf",{arrayBuffer:async()=>new ArrayBuffer(0)});globalThis.work=render();');
 await Promise.resolve();h.run('renderToken++;$("viewer").textContent="new question"');let destroyed=false;release({destroy:async()=>{destroyed=true}});await h.context.work;
 assert.equal(h.node('viewer').textContent,'new question');assert.equal(destroyed,true);
});
test('Paper 2 render destroys PDF resources on success and reports invalid page references',async()=>{
 const h=harness();await h.run('current={source:"9702/22/M/J/25",qp_file:"fixture.pdf",qp_pages:"1-2"};files.set("fixture.pdf",{arrayBuffer:async()=>new ArrayBuffer(0)});render()');assert.equal(h.destroyed(),1);assert.equal(h.node('viewer').children.length,2);
 await h.run('current.qp_pages="25";render()');assert.equal(h.destroyed(),2);assert.match(h.node('viewer').innerHTML,/Invalid page reference/);
});
test('Paper 2 self-assessment stores zero, rejects fractions and out-of-range marks',()=>{
 const h=harness();h.run('current={id:"p2",source:"9702/22/M/J/25",marks:"5"};renderPaper2Grade();$("paper2Score").value="0";$("saveP2Grade").onclick()');assert.equal(h.run('paper2Grades.p2.score'),0);
 h.run('$("paper2Score").value="6";$("saveP2Grade").onclick()');assert.equal(h.run('paper2Grades.p2.score'),0);
 h.run('$("paper2Score").value="2.5";$("saveP2Grade").onclick()');assert.equal(h.run('paper2Grades.p2.score'),0);
});
test('duplicate filenames in one selection are excluded instead of silently replacing PDF',()=>{
 const h=harness();h.run('loadFiles([{name:"paper.pdf"},{name:"PAPER.pdf"}])');assert.equal(h.run('files.size'),0);assert.match(h.node('fileStatus').textContent,/duplicate/);
});
test('MCQ answers unlock only after successful PDF render and PDF resources are released',async()=>{
 const h=harness();const buttons=['A','B','C','D'].map(answer=>({disabled:true,dataset:{answer}}));
 h.node('viewer').querySelectorAll=()=>buttons;
 h.run(`questions=${JSON.stringify(fixture)};mode="P1";current=questions[0];mcqSession={chapters:[1],limit:20,answers:[],pendingId:current.id,ended:false};files.set("fixture.pdf",{arrayBuffer:async()=>new ArrayBuffer(0)})`);
 const work=h.run('render()');assert.ok(buttons.every(b=>b.disabled));await work;assert.ok(buttons.every(b=>!b.disabled));assert.equal(h.destroyed(),1);
});
test('MCQ PDF failure leaves answers disabled; review mode never enables scoring',async()=>{
 const h=harness();const buttons=Array.from({length:4},()=>({disabled:true}));h.node('viewer').querySelectorAll=()=>buttons;
 h.run(`mode="P1";current=${JSON.stringify(fixture[0])};mcqSession={chapters:[1],limit:20,answers:[],pendingId:current.id,ended:false};files.set("fixture.pdf",{arrayBuffer:async()=>{throw Error("unreadable")}})`);
 await h.run('render()');assert.ok(buttons.every(b=>b.disabled));assert.match(h.node('mcqPictures').textContent,/unreadable/);
 await h.run('files.set("fixture.pdf",{arrayBuffer:async()=>new ArrayBuffer(0)});mcqSession.pendingId="another-question";render()');assert.ok(buttons.every(b=>b.disabled));assert.equal(h.run('recordMcq(current,"A")'),false);
});
test('MCQ invalid crop reports a failure and still releases PDF resources',async()=>{
 const h=harness();await h.run(`mode="P1";current=${JSON.stringify(fixture[0])};current.qp_clip="1:900:950";files.set("fixture.pdf",{arrayBuffer:async()=>new ArrayBuffer(0)});render()`);assert.match(h.node('mcqPictures').textContent,/Invalid question crop/);assert.equal(h.destroyed(),1);
});
