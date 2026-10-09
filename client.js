'use strict';
const $=id=>document.getElementById(id),titles={poker:'Пятикарточный покер',durak:'Подкидной дурак',chess:'Шахматы'};
let state=null,events=null,selectedGame=null,selectedCards=new Set(),selectedSquare=null,defendIndex=0,working=false,loading=false,refreshAgain=false;
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function button(text,fn,cls=''){const b=el('button',text,cls);b.type='button';b.onclick=()=>perform(fn);b.disabled=working;return b;}
function notice(text){$('notice').textContent=text;}
async function api(url,data){const res=await fetch(url,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const body=await res.json();if(!res.ok){if(res.status===401)showAuth();throw new Error(body.error||'Ошибка сервера');}return body;}
async function perform(fn){if(working)return;working=true;try{await fn();if(state)await refresh();}catch(e){notice(e.message);}finally{working=false;if(state)render();}}
function showAuth(){state=null;events?.close();events=null;$('auth').hidden=false;$('dashboard').hidden=true;$('logout').hidden=true;}
async function refresh(){if(loading){refreshAgain=true;return;}loading=true;try{const next=await api('/api/state');const changed=JSON.stringify(next)!==JSON.stringify(state);state=next;$('auth').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;if(changed)render();if(!events){events=new EventSource('/api/events');events.addEventListener('update',()=>refresh().catch(e=>notice(e.message)));events.onopen=()=>{$('connection').textContent='● Соединение активно';};events.onerror=()=>{$('connection').textContent='Переподключение…';};}}finally{loading=false;if(refreshAgain){refreshAgain=false;refresh().catch(e=>notice(e.message));}}}
async function authenticate(register){const form=$('auth-form');if(!form.reportValidity())return;await api(register?'/api/register':'/api/login',{login:$('login').value,password:$('password').value});$('password').value='';notice(register?'Аккаунт создан. На балансе 1000 фишек.':'Добро пожаловать в гараж.');await refresh();}
$('auth-form').onsubmit=e=>{e.preventDefault();perform(()=>authenticate(false));};$('register').onclick=()=>perform(()=>authenticate(true));
$('logout').onclick=()=>perform(async()=>{await api('/api/logout',{});showAuth();notice('Вы вышли из аккаунта.');});
$('invite-form').onsubmit=e=>{e.preventDefault();perform(async()=>{await api('/api/invite',{recipient:$('opponent').value,type:$('game-type').value,stake:Number($('stake').value),task:$('task').value});notice('Вызов отправлен. У соперника 5 минут на ответ.');});};
function render(){
 $('driver').textContent=state.me.login;$('balance').textContent=state.me.chips.toLocaleString('ru-RU');const previous=$('opponent').value;$('opponent').replaceChildren();
 $('opponent').append(el('option',state.players.length?'Выберите соперника':'Пока нет других аккаунтов'));$('opponent').firstChild.value='';
 for(const p of state.players){const o=el('option',`${p.online?'●':'○'} ${p.login} · ${p.chips} фишек`);o.value=p.id;$('opponent').append(o);}$('opponent').value=previous;
 $('invite-count').textContent=state.invites.filter(i=>i.recipient===state.me.id).length;$('invites').replaceChildren();
 if(!state.invites.length)$('invites').append(el('p','Нет активных приглашений.','muted'));
 for(const i of state.invites){const incoming=i.recipient===state.me.id,n=el('div',undefined,'invite');n.append(el('strong',incoming?`Вызов от ${i.senderName}`:`Вызов для ${i.recipientName}`),el('small',`${titles[i.type]} · ставка ${i.stake} с каждого${i.task?' · задача: '+i.task:''}`));const clock=el('div','','countdown');clock.dataset.expires=i.expires;n.append(clock);const actions=el('div',undefined,'buttons');if(incoming)actions.append(button('Принять',async()=>{await api('/api/respond',{id:i.id,accept:true});selectedGame=null;selectedCards.clear();notice('Игра началась. Ставки внесены в банк.');}));actions.append(button(incoming?'Отклонить':'Отменить',()=>api('/api/respond',{id:i.id,accept:false}),'ghost'));n.append(actions);$('invites').append(n);}
 updateCountdowns();
 const active=state.games.find(g=>g.status==='active');if(active)selectedGame=active.id;else if(!selectedGame&&state.games.length)selectedGame=state.games[0].id;
 const g=state.games.find(g=>g.id===selectedGame);if(g)renderArena(g);
 $('matches').replaceChildren();if(!state.games.length)$('matches').append(el('p','Здесь появятся ваши партии.','muted'));
 for(const match of state.games){const row=el('div',undefined,'match'),text=el('div');text.append(el('strong',`${titles[match.type]} · ${match.names.join(' vs ')}`),el('small',`${match.status==='active'?'В процессе':outcomeText(match)} · банк ${match.stake*2}`));row.append(text,button('Открыть',()=>{selectedGame=match.id;selectedCards.clear();selectedSquare=null;renderArena(match);},'ghost'));$('matches').append(row);}
 $('ledger').replaceChildren();for(const row of state.ledger){const n=el('div',undefined,'transaction');n.append(el('span',row.reason.replace(/ · [a-f0-9-]{36}$/,'')),el('b',`${row.amount>0?'+':''}${row.amount}`,row.amount>=0?'positive':'negative'));$('ledger').append(n);}
}
function outcomeText(g){return g.state.outcome==='draw'?'Ничья':g.state.outcome===state.me.id?'Вы победили':'Вы проиграли';}
function updateCountdowns(){document.querySelectorAll('[data-expires]').forEach(n=>{const seconds=Math.max(0,Math.ceil((Number(n.dataset.expires)-Date.now())/1000));n.textContent=seconds?`Ответить за ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Приглашение истекло';n.closest('.invite').querySelectorAll('button').forEach(b=>b.disabled=working||seconds===0);});}
setInterval(updateCountdowns,1000);
function card(c,fn,selected=false){const rank=({11:'J',12:'Q',13:'K',14:'A'})[c.rank]||c.rank,n=fn?button(`${rank}${c.suit}`,fn):el('div',`${rank}${c.suit}`);n.className=`playing-card${['♥','♦'].includes(c.suit)?' red':''}${selected?' selected':''}`;return n;}
function renderArena(g){
 const s=g.state,area=$('arena');area.replaceChildren();const top=el('div',undefined,'arena-top'),label=el('div');label.append(el('h2',titles[g.type]),el('span',`${g.names.join(' vs ')}${g.task?' · '+g.task:''}`,'muted'));top.append(label,el('div',`Банк ${g.stake*2}`,'pot'));area.append(top);
 if(s.outcome){const banner=el('div',undefined,'result-banner');banner.append(el('h2',outcomeText(g)),el('p',s.outcome==='draw'?'Ставки возвращены обоим игрокам.':`Победитель: ${g.names[s.players.indexOf(s.outcome)]}. Банк ${g.stake*2} фишек начислен.${g.task?' Задача проигравшему: '+g.task:''}`));area.append(banner);}
 const move=a=>api('/api/move',{id:g.id,action:a});
 if(g.type==='chess')renderChess(area,g,move);else renderCards(area,g,move);
 if(!s.outcome){const actions=el('div',undefined,'buttons');actions.append(button('Сдаться',async()=>{if(confirm(`Сдаться? Соперник получит банк ${g.stake*2} фишек.`))await move({kind:'resign'});},'ghost'));area.append(actions);}
}
function renderChess(area,g,move){
 const s=g.state,me=s.yourIndex,pieces={p:'♟',r:'♜',n:'♞',b:'♝',q:'♛',k:'♚',P:'♙',R:'♖',N:'♘',B:'♗',Q:'♕',K:'♔'};
 area.append(el('p',`${me===0?'Вы играете белыми':'Вы играете чёрными'} · ${s.outcome?'Партия завершена':s.turn===state.me.id?'Ваш ход':'Ход соперника'}${s.check?' · Шах':''}`,'muted'));
 const cells={};s.fen.split(' ')[0].split('/').forEach((row,r)=>{let f=0;for(const p of row){if(/\d/.test(p))f+=Number(p);else cells['abcdefgh'[f++]+(8-r)]=p;}});
 const board=el('div',undefined,'board'),ranks=me===0?[8,7,6,5,4,3,2,1]:[1,2,3,4,5,6,7,8],files=me===0?'abcdefgh':'hgfedcba';
 for(const r of ranks)for(const f of files){const square=f+r,target=(s.legal||[]).some(m=>m.from===selectedSquare&&m.to===square),b=button(pieces[cells[square]]||'',async()=>{
   if(s.outcome||s.turn!==state.me.id)return;
   if(selectedSquare&&target){const legal=s.legal.filter(m=>m.from===selectedSquare&&m.to===square);let promotion;if(legal.some(m=>m.promotion)){promotion=prompt('Превращение: q — ферзь, r — ладья, b — слон, n — конь','q');if(!promotion)return;if(!['q','r','b','n'].includes(promotion))throw new Error('Выберите q, r, b или n');}await move({kind:'move',from:selectedSquare,to:square,promotion});selectedSquare=null;
   }else{selectedSquare=selectedSquare===square?null:square;renderArena(g);}
  });b.className=`square${('abcdefgh'.indexOf(f)+r)%2===0?' dark':''}${square===selectedSquare?' selected':''}${target?' target':''}`;b.setAttribute('aria-label',`${square}${cells[square]?' '+pieces[cells[square]]:''}`);b.append(el('span',square,'coord'));board.append(b);}
 area.append(board);area.append(el('small','Выберите фигуру, затем подсвеченное поле. При превращении можно выбрать новую фигуру. Ходы: '+(s.moves.join(' ')||'ещё нет')));
}
function renderCards(area,g,move){
 const s=g.state,i=s.yourIndex,other=1-i,hand=s.hands[i],opponent=el('div',undefined,'hand');
 if(s.outcome)for(const c of s.hands[other])opponent.append(card(c));else for(let j=0;j<Math.min(s.opponentCount,12);j++)opponent.append(el('div','♠','playing-card back'));
 area.append(el('p',`Соперник: ${g.names[other]} · ${s.opponentCount} карт${g.type==='durak'?' · колода '+s.deckCount+' · козырь '+s.trump:''}`,'muted'),opponent);
 if(g.type==='durak'){
  area.append(el('p',s.outcome?'Партия завершена':`${s.attacker===i?'Вы атакуете':'Вы защищаетесь'}${s.taking?' · защитник берёт карты':''}`,'muted'));
  const table=el('div',undefined,'table-cards');s.table.forEach((pair,index)=>{const p=el('div',undefined,'pair');p.append(card(pair.attack,!s.outcome&&s.attacker!==i&&!pair.defense&&!s.taking?()=>{defendIndex=index;renderArena(g);}:null,defendIndex===index&&!pair.defense));if(pair.defense)p.append(card(pair.defense));table.append(p);});area.append(table);
 }
 const mine=el('div',undefined,'hand');for(const c of hand)mine.append(card(c,s.outcome?null:g.type==='poker'?()=>{if(s.drawn[i])return;selectedCards.has(c.id)?selectedCards.delete(c.id):selectedCards.add(c.id);renderArena(g);}:()=>move(s.attacker===i?{kind:'attack',card:c.id}:{kind:'defend',card:c.id,index:defendIndex}),selectedCards.has(c.id)));area.append(el('p','Ваша рука','muted'),mine);
 if(s.outcome){if(s.scores){const combos=['Старшая карта','Пара','Две пары','Тройка','Стрит','Флеш','Фулл-хаус','Каре','Стрит-флеш'];area.append(el('p',g.names.map((n,j)=>`${n}: ${combos[s.scores[j][0]]}`).join(' · '),'muted'));}return;}
 const actions=el('div',undefined,'buttons');
 if(g.type==='poker'){
  area.append(el('small','Один обмен до пяти карт. Отметьте ненужные карты и подтвердите обмен, либо оставьте все. Когда оба готовы, сервер сравнит комбинации. Дополнительных ставок в раунде нет.'));
  const draw=button(selectedCards.size?`Обменять ${selectedCards.size} карт`:'Оставить все карты',async()=>{await move({kind:'draw',cards:[...selectedCards]});selectedCards.clear();});draw.disabled=working||s.drawn[i];actions.append(draw);if(s.drawn[i])area.append(el('p','Вы готовы. Ожидаем соперника.','muted'));
 }else{
  area.append(el('small','Атакуйте картой, затем подкидывайте совпадающие ранги (не более 6). Для защиты выберите карту на столе, затем свою. Козырь бьёт некозырь. После покрытия или взятия атакующий завершает раунд.'));
  if(s.attacker===i){const end=button(s.taking?'Завершить подкидывание':'Бито · завершить раунд',()=>move({kind:'end'}));end.disabled=working||!s.table.length||!s.taking&&!s.table.every(p=>p.defense);actions.append(end);}else{const take=button('Взять карты',()=>move({kind:'take'}),'ghost');take.disabled=working||!s.table.length||s.taking;actions.append(take);}
 }area.append(actions);
}
refresh().catch(e=>{if(state)notice(e.message);});
