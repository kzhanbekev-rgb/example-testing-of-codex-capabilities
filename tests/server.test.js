const test=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{mkdtempSync,rmSync}=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
test('accounts, invitations, stakes, moves, expiry and balances persist through server restart',async t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'royale-test-')),port=32000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;let child;
 async function start(){child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),DATA_DIR:dir},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.stdout.on('data',b=>{if(b.toString().includes('listening'))resolve();});child.once('exit',code=>reject(new Error('Server exit '+code)));setTimeout(()=>reject(new Error('Server startup timeout')),5000).unref();});}
 async function stop(){if(child.exitCode!==null)return;const p=new Promise(r=>child.once('exit',r));child.kill();await p;}
 t.after(async()=>{await stop();rmSync(dir,{recursive:true,force:true});});await start();
 async function req(route,body,cookie,headers={}){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 assert.equal((await req('/api/state')).status,401);
 const alice=await req('/api/register',{login:'alice',password:'test-pass-123'}),bob=await req('/api/register',{login:'bob',password:'test-pass-456'});assert.equal(alice.status,200);assert.equal(bob.data.me.chips,1000);
 assert.match(alice.cookie,/royale=/);assert.equal((await req('/api/login',{login:'alice',password:'incorrect'})).status,400);
 assert.equal((await req('/api/register',{login:'ALICE',password:'test-pass-123'})).status,400);
 assert.equal((await req('/api/invite',{recipient:bob.data.me.id,type:'chess',stake:-2,task:''},alice.cookie)).status,400);
 assert.equal((await req('/api/invite',{recipient:bob.data.me.id,type:'chess',stake:20,task:''},alice.cookie,{Origin:'https://evil.example'})).status,400);
 await req('/api/invite',{recipient:bob.data.me.id,type:'chess',stake:50,task:'Склад'},alice.cookie);
 const invite=(await req('/api/state',undefined,bob.cookie)).data.invites[0];assert.ok(invite.expires>Date.now()+290000);
 assert.equal((await req('/api/respond',{id:invite.id,accept:true},alice.cookie)).status,400);
 assert.equal((await req('/api/respond',{id:invite.id,accept:true},bob.cookie)).status,200);
 assert.equal((await req('/api/respond',{id:invite.id,accept:true},bob.cookie)).status,400);
 let a=(await req('/api/state',undefined,alice.cookie)).data,b=(await req('/api/state',undefined,bob.cookie)).data;assert.equal(a.me.chips,950);assert.equal(b.me.chips,950);const id=a.games[0].id;
 assert.equal((await req('/api/move',{id,action:{from:'e7',to:'e5'}},bob.cookie)).status,400);
 for(const [cookie,from,to]of [[alice.cookie,'f2','f3'],[bob.cookie,'e7','e5'],[alice.cookie,'g2','g4'],[bob.cookie,'d8','h4']])assert.equal((await req('/api/move',{id,action:{from,to}},cookie)).status,200);
 b=(await req('/api/state',undefined,bob.cookie)).data;assert.equal(b.me.chips,1050);assert.equal(b.games[0].state.outcome,b.me.id);assert.equal((await req('/api/move',{id,action:{kind:'resign'}},alice.cookie)).status,400);
 await req('/api/invite',{recipient:b.me.id,type:'poker',stake:20,task:''},alice.cookie);const pokerInvite=(await req('/api/state',undefined,bob.cookie)).data.invites[0];await req('/api/respond',{id:pokerInvite.id,accept:true},bob.cookie);
 a=(await req('/api/state',undefined,alice.cookie)).data;const poker=a.games[0];assert.deepEqual(poker.state.hands[1],[]);assert.equal(poker.state.pile,undefined);
 await req('/api/move',{id:poker.id,action:{kind:'draw',cards:[]}},alice.cookie);await req('/api/move',{id:poker.id,action:{kind:'draw',cards:[]}},bob.cookie);
 a=(await req('/api/state',undefined,alice.cookie)).data;b=(await req('/api/state',undefined,bob.cookie)).data;assert.equal(a.me.chips+b.me.chips,2000);
 await req('/api/invite',{recipient:b.me.id,type:'durak',stake:0,task:''},alice.cookie);const exp=(await req('/api/state',undefined,bob.cookie)).data.invites[0];const db=new DatabaseSync(path.join(dir,'royale.sqlite'));db.prepare('UPDATE invites SET expires=? WHERE id=?').run(Date.now()-1,exp.id);db.close();assert.equal((await req('/api/respond',{id:exp.id,accept:true},bob.cookie)).status,400);
 await req('/api/invite',{recipient:b.me.id,type:'durak',stake:0,task:''},alice.cookie);const liveInvite=(await req('/api/state',undefined,bob.cookie)).data.invites[0];await req('/api/respond',{id:liveInvite.id,accept:true},bob.cookie);
 b=(await req('/api/state',undefined,bob.cookie)).data;const active=b.games.find(g=>g.status==='active'),hand=active.state.hands[1];
 const balance=b.me.chips;await stop();await start();b=(await req('/api/state',undefined,bob.cookie)).data;assert.equal(b.me.chips,balance);assert.equal(b.games.length,3);assert.deepEqual(b.games.find(g=>g.id===active.id).state.hands[1],hand);
 const login=await req('/api/login',{login:'bob',password:'test-pass-456'});assert.equal(login.status,200);
 const ledger=b.ledger;assert.ok(ledger.some(row=>row.reason.startsWith('Выигрыш')));
});
