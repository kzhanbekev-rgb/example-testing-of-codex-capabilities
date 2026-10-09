'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes,randomUUID,scrypt,timingSafeEqual,createHash}=require('node:crypto');
const {promisify}=require('node:util');const hashPassword=promisify(scrypt);
const {createGame,action,view}=require('./games');
const data=process.env.DATA_DIR||path.join(__dirname,'data');fs.mkdirSync(data,{recursive:true});
const db=new DatabaseSync(path.join(data,'royale.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,login TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password TEXT NOT NULL,chips INTEGER NOT NULL CHECK(chips>=0));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY,sender TEXT NOT NULL,recipient TEXT NOT NULL,type TEXT NOT NULL,stake INTEGER NOT NULL,task TEXT NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY,p1 TEXT NOT NULL,p2 TEXT NOT NULL,type TEXT NOT NULL,stake INTEGER NOT NULL,task TEXT NOT NULL,state TEXT NOT NULL,status TEXT NOT NULL,updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,user TEXT NOT NULL,amount INTEGER NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL);`);
const q=(sql,...args)=>db.prepare(sql).all(...args),get=(sql,...args)=>db.prepare(sql).get(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
function need(ok,msg){if(!ok)throw new Error(msg);}
function credit(user,amount,reason){run('UPDATE users SET chips=chips+? WHERE id=?',amount,user);run('INSERT INTO ledger VALUES(?,?,?,?,?)',randomUUID(),user,amount,reason,Date.now());}
const streams=new Map(),rates=new Map();
function emit(){for(const clients of streams.values())for(const res of clients)res.write('event: update\ndata: {}\n\n');}
function cleanup(){run("UPDATE invites SET status='expired' WHERE status='pending' AND expires<=?",Date.now());run('DELETE FROM sessions WHERE expires<=?',Date.now());}
const timer=setInterval(()=>{cleanup();emit();for(const [key,r]of rates)if(r.until<Date.now())rates.delete(key);},15000);timer.unref();
function session(req){const token=/\broyale=([^;]+)/.exec(req.headers.cookie||'')?.[1];if(!token)return null;return get('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user WHERE token=? AND expires>?',createHash('sha256').update(token).digest('hex'),Date.now());}
function cookie(res,user){const token=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',createHash('sha256').update(token).digest('hex'),user,Date.now()+7*86400000);res.setHeader('Set-Cookie',`royale=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);}
function publicUser(u){return{id:u.id,login:u.login,chips:u.chips,online:streams.has(u.id)};}
function snapshot(user){cleanup();return{me:publicUser(get('SELECT * FROM users WHERE id=?',user.id)),players:q('SELECT id,login,chips FROM users WHERE id<>? ORDER BY login',user.id).map(publicUser),invites:q("SELECT i.*,a.login senderName,b.login recipientName FROM invites i JOIN users a ON a.id=i.sender JOIN users b ON b.id=i.recipient WHERE (sender=? OR recipient=?) AND status='pending' AND expires>? ORDER BY expires",user.id,user.id,Date.now()),games:q('SELECT * FROM games WHERE p1=? OR p2=? ORDER BY updated DESC LIMIT 25',user.id,user.id).map(g=>({...g,state:view(JSON.parse(g.state),user.id),names:[get('SELECT login FROM users WHERE id=?',g.p1).login,get('SELECT login FROM users WHERE id=?',g.p2).login]})),ledger:q('SELECT amount,reason,created FROM ledger WHERE user=? ORDER BY created DESC LIMIT 20',user.id)};}
function limited(key,max){const now=Date.now();let r=rates.get(key);if(!r||r.until<now){r={count:0,until:now+60000};rates.set(key,r);}need(++r.count<=max,'Слишком много запросов. Подождите минуту.');}
async function body(req){let text='';for await(const chunk of req){text+=chunk;need(Buffer.byteLength(text)<=16384,'Слишком большой запрос');}try{return JSON.parse(text||'{}');}catch{throw new Error('Некорректный JSON');}}
const staticFiles={'/':'index.html','/client.js':'client.js','/garage.css':'garage.css','/tasks.html':'tasks.html','/app.js':'app.js','/style.css':'style.css'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
 const url=new URL(req.url,'http://localhost');
 function json(value,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
 try{
  if(!url.pathname.startsWith('/api/')){const file=staticFiles[url.pathname];if(!file||req.method!=='GET'){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');fs.createReadStream(path.join(__dirname,file)).pipe(res);return;}
  if(req.method==='POST'){
   if(req.headers.origin){const expected=process.env.PUBLIC_ORIGIN||`http://${req.headers.host}`;need(req.headers.origin===expected,'Запрос с другого сайта отклонён');}
   need((req.headers['content-type']||'').startsWith('application/json'),'Ожидается JSON');
  }
  if(['/api/register','/api/login'].includes(url.pathname)&&req.method==='POST'){
   limited('auth:'+req.socket.remoteAddress,15);const b=await body(req);need(typeof b.login==='string'&&/^[a-zA-Zа-яА-ЯёЁ0-9_-]{3,24}$/.test(b.login),'Логин: 3–24 буквы, цифры, _ или -');need(typeof b.password==='string'&&b.password.length>=8&&b.password.length<=128,'Пароль: от 8 до 128 символов');const login=b.login.toLocaleLowerCase('ru');
   let u=get('SELECT * FROM users WHERE login=?',login);
   if(url.pathname==='/api/register'){
    need(!u,'Этот логин уже занят');const salt=randomBytes(16).toString('hex'),password=(await hashPassword(b.password,salt,64)).toString('hex');
    transaction(()=>{need(!get('SELECT id FROM users WHERE login=?',login),'Этот логин уже занят');const id=randomUUID();run('INSERT INTO users VALUES(?,?,?,?,?)',id,login,salt,password,0);credit(id,1000,'Стартовые фишки');u=get('SELECT * FROM users WHERE id=?',id);});
   }else{const candidate=await hashPassword(b.password,u?.salt||'unknown-account',64);need(u&&timingSafeEqual(candidate,Buffer.from(u.password,'hex')),'Неверный логин или пароль');}
   cookie(res,u.id);json({me:publicUser(u)});emit();return;
  }
  const user=session(req);if(!user){json({error:'Войдите в аккаунт'},401);return;}
  if(url.pathname==='/api/events'&&req.method==='GET'){
   let clients=streams.get(user.id);if(!clients){clients=new Set();streams.set(user.id,clients);}need(clients.size<5,'Слишком много открытых вкладок');res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write('event: update\ndata: {}\n\n');clients.add(res);emit();req.on('close',()=>{clients.delete(res);if(!clients.size)streams.delete(user.id);emit();});return;
  }
  if(url.pathname==='/api/state'&&req.method==='GET'){json(snapshot(user));return;}
  need(req.method==='POST','Метод не поддерживается');limited('user:'+user.id,120);const b=await body(req);
  if(url.pathname==='/api/logout'){const token=/\broyale=([^;]+)/.exec(req.headers.cookie||'')?.[1];run('DELETE FROM sessions WHERE token=?',createHash('sha256').update(token).digest('hex'));res.setHeader('Set-Cookie','royale=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');json({ok:true});return;}
  if(url.pathname==='/api/invite'){
   need(['poker','durak','chess'].includes(b.type),'Выберите игру');need(Number.isInteger(b.stake)&&b.stake>=0&&b.stake<=1000000,'Ставка должна быть целым числом от 0 до 1000000');need(typeof b.task==='string'&&b.task.length<=160,'Задача слишком длинная');
   need(b.recipient!==user.id&&get('SELECT id FROM users WHERE id=?',b.recipient),'Выберите другого игрока');need(get('SELECT chips FROM users WHERE id=?',user.id).chips>=b.stake,'Не хватает фишек');cleanup();
   need(!get("SELECT id FROM games WHERE status='active' AND (p1 IN (?,?) OR p2 IN (?,?))",user.id,b.recipient,user.id,b.recipient),'Один из игроков уже в игре');
   need(q("SELECT id FROM invites WHERE sender=? AND status='pending'",user.id).length<5,'У вас уже 5 приглашений');
   run('INSERT INTO invites VALUES(?,?,?,?,?,?,?,?)',randomUUID(),user.id,b.recipient,b.type,b.stake,b.task.trim(),Date.now()+300000,'pending');
  }else if(url.pathname==='/api/respond'){
   transaction(()=>{const inv=get('SELECT * FROM invites WHERE id=?',b.id);need(inv&&inv.status==='pending'&&inv.expires>Date.now(),'Приглашение истекло или уже обработано');need(inv.recipient===user.id||inv.sender===user.id&&b.accept===false,'Это не ваше приглашение');
    if(b.accept===false){run("UPDATE invites SET status='declined' WHERE id=?",inv.id);return;}need(b.accept===true&&inv.recipient===user.id,'Некорректный ответ');
    need(!get("SELECT id FROM games WHERE status='active' AND (p1 IN (?,?) OR p2 IN (?,?))",inv.sender,inv.recipient,inv.sender,inv.recipient),'Один из игроков уже в игре');
    for(const id of [inv.sender,inv.recipient])need(get('SELECT chips FROM users WHERE id=?',id).chips>=inv.stake,'У одного из игроков не хватает фишек');
    const id=randomUUID();for(const u of [inv.sender,inv.recipient])credit(u,-inv.stake,`Ставка · ${id}`);
    run('INSERT INTO games VALUES(?,?,?,?,?,?,?,?,?)',id,inv.sender,inv.recipient,inv.type,inv.stake,inv.task,JSON.stringify(createGame(inv.type,[inv.sender,inv.recipient])),'active',Date.now());run("UPDATE invites SET status='accepted' WHERE id=?",inv.id);
    run("UPDATE invites SET status='declined' WHERE status='pending' AND (sender IN (?,?) OR recipient IN (?,?))",inv.sender,inv.recipient,inv.sender,inv.recipient);
   });
  }else if(url.pathname==='/api/move'){
   transaction(()=>{const g=get('SELECT * FROM games WHERE id=?',b.id);need(g&&(g.p1===user.id||g.p2===user.id),'Игра не найдена');need(g.status==='active','Игра уже завершена');need(b.action&&typeof b.action==='object','Ход не указан');const s=action(JSON.parse(g.state),user.id,b.action);
    if(s.outcome){if(s.outcome==='draw'){credit(g.p1,g.stake,`Возврат при ничьей · ${g.id}`);credit(g.p2,g.stake,`Возврат при ничьей · ${g.id}`);}else credit(s.outcome,g.stake*2,`Выигрыш · ${g.id}`);}
    run('UPDATE games SET state=?,status=?,updated=? WHERE id=?',JSON.stringify(s),s.outcome?'finished':'active',Date.now(),g.id);
   });
  }else throw new Error('Неизвестный запрос');
  json({ok:true});emit();
 }catch(e){const expected=e.message;json({error:expected.includes('constraint')?'Не удалось выполнить операцию':expected},400);}
});
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log(`Office Royale listening on port ${Number(process.env.PORT)||3000}`));
