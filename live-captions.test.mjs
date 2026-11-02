import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function setup(){
 const window={},sent=[],shown=[],restored=[],requests=[],timers=new Map();let clock=0;
 vm.runInNewContext(fs.readFileSync('dist/live-captions.js','utf8'),{window,setTimeout,clearTimeout,Date,Promise,Map,Set});
 const me={id:'teacher',role:'teacher',language:'zh'},student={id:'student',role:'student',language:'pt'};
 const manager=window.liveCaptionFactory.create({self:()=>me,target:l=>l==='zh'?'pt':'zh',send:p=>sent.push(p),render:(m,p)=>shown.push({...p}),restore:(...a)=>restored.push(a),setTimer:f=>{const id=++clock;timers.set(id,()=>{timers.delete(id);f()});return id},clearTimer:id=>timers.delete(id),translate:(source,target,text)=>manager.cachedTranslate(source,target,text,()=>{const d=deferred();requests.push({text,...d});return d.promise})});
 return {manager,me,student,sent,shown,restored,requests,timers};
}
test('live captions keep latest raw preview while enriching it with slower translated context',async()=>{
 const s=setup();s.manager.preview('你好','one');await tick();s.manager.preview('你好同学','one');s.manager.preview('你好同学们','one');
 assert.equal(s.shown.at(-1).text,'你好同学们');assert.equal(s.requests.length,1);
 s.requests[0].resolve('Olá');await tick();assert.equal(s.shown.at(-1).text,'你好同学们');assert.equal(s.shown.at(-1).translationSource,'你好');assert.equal(s.shown.at(-1).translated,'Olá');assert.equal(s.requests.length,2);assert.equal(s.requests[1].text,'你好同学们');
 s.manager.confirmed(s.me.id,'one');s.requests[1].resolve('Olá turma');await tick();assert.equal(s.manager.has('teacher'),false);assert.equal(s.shown.at(-1).translated,'Olá');s.manager.close();
});
test('sealing a turn drops its pending preview, shares final result and reuses an identical in-flight translation',async()=>{
 const s=setup();s.manager.preview('你好','one');await tick();s.manager.preview('你好同学','one');s.manager.seal('one');s.manager.final('你好','one');
 s.requests[0].resolve('Olá');await tick();assert.equal(s.requests.length,1);assert.ok(s.sent.some(p=>p.kind==='final-translation'&&p.translated==='Olá'));
 s.manager.preview('下一句','two');await tick();assert.equal(s.requests.length,1);s.manager.settled('one');await tick();assert.equal(s.requests.length,2);s.requests[1].resolve('Próxima');await tick();s.manager.close();
});
test('received final translation resolves a peer wait without another model request',async()=>{
 const s=setup(),packet={kind:'final-wait',turnId:'student:1',revision:2,language:'pt',target:'zh',text:'Bom dia'};
 s.manager.receive(s.student,packet);let calls=0;const result=s.manager.cachedTranslate('pt','zh','Bom dia',()=>{calls++;return 'wrong'});
 s.manager.receive(s.student,{...packet,kind:'final-translation',translated:'早上好'});
 assert.equal(await result,'早上好');assert.equal(calls,0);assert.equal(s.restored.at(-1)[1],'student:1');assert.equal(s.timers.size,0);s.manager.close();
});
test('expired peer wait falls back, malformed packets are ignored and confirmed old turns cannot erase a newer preview',async()=>{
 const s=setup(),p={kind:'draft',turnId:'a',revision:1,language:'pt',target:'zh',text:'Oi'};
 for(const wrong of [{...p,language:'zh'},{...p,target:'pt'},{...p,text:{html:'x'}},{...p,revision:NaN},{...p,translated:'a'.repeat(3501)}])s.manager.receive(s.student,wrong);
 assert.equal(s.shown.length,0);s.manager.receive(s.student,p);s.manager.receive(s.student,{...p,turnId:'b',revision:3,text:'Novo'});s.manager.confirmed(s.student.id,'a');s.manager.receive(s.student,{...p,revision:2});assert.equal(s.shown.at(-1).text,'Novo');
 s.manager.receive(s.student,{...p,kind:'final-wait',turnId:'c',text:'Tarde',revision:4});let calls=0;const result=s.manager.cachedTranslate('pt','zh','Tarde',()=>{calls++;return '下午'});
 [...s.timers.values()].at(-1)();assert.equal(await result,'下午');assert.equal(calls,1);s.manager.close();assert.equal(s.timers.size,0);
});
test('confirmed source cannot resurrect through a late translated draft; local work is serial and deduplicated',async()=>{
 const s=setup(),a=deferred();let calls=0;
 const first=s.manager.cachedTranslate('zh','pt','a',()=>{calls++;return a.promise});const repeated=s.manager.cachedTranslate('zh','pt','a',()=>{throw Error('duplicate')});const second=s.manager.cachedTranslate('pt','zh','b',()=>{calls++;return '乙'});
 await tick();assert.equal(calls,1);a.resolve('A');assert.equal(await first,'A');assert.equal(await repeated,'A');assert.equal(await second,'乙');assert.equal(calls,2);
 s.manager.confirmed(s.student.id,'old');s.manager.receive(s.student,{kind:'draft',turnId:'old',revision:5,language:'pt',target:'zh',text:'Oi',translated:'你好'});assert.equal(s.shown.length,0);s.manager.close();
});

test('a reconnected peer can restart its revision counter without stale captions blocking it',()=>{
 const s=setup(),p={kind:'draft',turnId:'old-session',revision:80,language:'pt',target:'zh',text:'Antes'};
 s.manager.receive(s.student,p);s.manager.resetPeer(s.student.id);assert.equal(s.manager.has('student'),false);s.manager.receive(s.student,{...p,turnId:'new-session',revision:1,text:'Depois'});assert.equal(s.shown.at(-1).text,'Depois');s.manager.close();
});
