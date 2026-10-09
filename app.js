'use strict';
const games = {
  roulette: {title:'Колесо офисной судьбы', description:'Запускайте колесо — случай выберет исполнителя.', art:'<span class="pointer">▼</span><div class="wheel"><div class="wheel-center">♠</div></div>'},
  slots: {title:'Джекпот из задач', description:'Три символа, один счастливчик. Сегодня джекпот — работа.', art:'<div class="reel">🍒</div><div class="reel">♠</div><div class="reel">★</div>'},
  cards: {title:'Карта с вашим именем', description:'Выберите одну из трёх карт после начала раунда.', art:'<div class="card">♠</div><div class="card">♣</div><div class="card">♦</div>'},
  dice: {title:'Бросок судьбы', description:'Бросьте кубики — они объявят случайного исполнителя.', art:'<div class="die">⚄</div><div class="die">⚂</div>'}
};
function randomIndex(length) {
  if (!Number.isInteger(length) || length < 1) throw new Error('Invalid pool');
  const limit = 4294967296 - (4294967296 % length);
  const buffer = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % length;
}
function parseNames(text) {
  const unique = new Map();
  for (const name of text.split('\n').map(s=>s.trim()).filter(Boolean)) {
    const key=name.toLocaleLowerCase('ru');
    if (!unique.has(key)) unique.set(key,name);
  }
  return [...unique.values()];
}
function eligibleNames(names, history, fair) {
  if (!fair) return names;
  const counts = names.map(name=>history.filter(row=>row.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')).length);
  const min = Math.min(...counts);
  return names.filter((_,i)=>counts[i]===min);
}
if (typeof module !== 'undefined') module.exports = {randomIndex,parseNames,eligibleNames};
if (typeof document !== 'undefined') {
  const $ = id=>document.getElementById(id);
  const key='office-royale-v1';
  let state={names:'', task:'', fair:true, history:[]}, game='roulette', busy=false;
  try {
    const saved=JSON.parse(localStorage.getItem(key));
    if(saved && typeof saved.names==='string' && typeof saved.task==='string' && Array.isArray(saved.history)) {
      state={names:saved.names,task:saved.task,fair:saved.fair!==false,history:saved.history.filter(r=>r && typeof r.name==='string' && typeof r.task==='string' && games[r.game] && Number.isFinite(r.date) && typeof r.id==='string')};
    }
  } catch {}
  function save(){try{localStorage.setItem(key,JSON.stringify(state));}catch{$('message').textContent='Браузер не позволяет сохранить данные. Результаты доступны до закрытия страницы.';}}
  function node(tag,text){const el=document.createElement(tag);el.textContent=text;return el;}
  function renderHistory(){
    $('history').replaceChildren();
    $('clear').disabled=busy || !state.history.length;
    if(!state.history.length){$('history').append(node('p','Пока никто не испытал удачу. Первый раунд за вами!'));$('history').firstChild.className='empty';return;}
    for(const row of [...state.history].reverse()) {
      const item=node('div','');item.className='entry';const content=node('div','');
      content.append(node('strong',row.name),node('span',' — '+row.task),node('small',games[row.game].title+' · '+new Date(row.date).toLocaleString('ru-RU')));
      const undo=node('button','Отменить');undo.className='undo';undo.disabled=busy;undo.setAttribute('aria-label','Отменить назначение: '+row.name+', '+row.task);
      undo.onclick=()=>{state.history=state.history.filter(r=>r.id!==row.id);save();renderHistory();$('result').hidden=true;$('message').textContent='Назначение отменено и больше не учитывается в распределении.';};
      item.append(content,undo);$('history').append(item);
    }
  }
  function renderGame(){
    $('stage').innerHTML=games[game].art;$('game-title').textContent=games[game].title;$('game-description').textContent=games[game].description;
    document.querySelectorAll('[data-game]').forEach(b=>{const active=b.dataset.game===game;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  }
  function setBusy(value){busy=value;$('play').disabled=value;['names','task','fair'].forEach(id=>$(id).disabled=value);document.querySelectorAll('[data-game]').forEach(b=>b.disabled=value);renderHistory();}
  $('names').value=state.names;$('task').value=state.task;$('fair').checked=state.fair;
  ['names','task','fair'].forEach(id=>$(id).addEventListener('input',()=>{state[id]=id==='fair'?$(id).checked:$(id).value;save();}));
  document.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>{game=b.dataset.game;renderGame();$('result').hidden=true;});
  $('clear').onclick=()=>{if(confirm('Очистить всю историю? Счётчики равномерного распределения тоже обнулятся.')){state.history=[];save();renderHistory();$('result').hidden=true;}};
  $('play').onclick=()=>{
    if(busy)return;
    const names=parseNames(state.names), task=state.task.trim();
    if(!task){$('message').textContent='Введите задачу для этого раунда.';$('task').focus();return;}
    if(names.length<2 || names.length>30 || names.some(n=>n.length>60)){$('message').textContent='Нужно от 2 до 30 разных имён, каждое не длиннее 60 символов.';$('names').focus();return;}
    const pool=eligibleNames(names,state.history,state.fair);
    const winner=pool[randomIndex(pool.length)];
    setBusy(true);$('result').hidden=true;$('message').textContent='Судьба выбирает…';$('stage').classList.add('busy');
    function finish(){
      $('stage').classList.remove('busy');
      if(game==='slots')document.querySelectorAll('.reel').forEach(el=>el.textContent='★');
      if(game==='dice')document.querySelectorAll('.die').forEach(el=>el.textContent=['⚀','⚁','⚂','⚃','⚄','⚅'][randomIndex(6)]);
      state.history.push({id:crypto.randomUUID(),name:winner,task,game,date:Date.now()});
      $('result').replaceChildren(node('span','Сегодня задача достаётся'),node('strong',winner),node('span',task));$('result').hidden=false;
      $('message').textContent=state.fair?'Выбор среди участников с наименьшим числом назначений.':'У всех участников был одинаковый шанс.';
      save();setBusy(false);
    }
    if(game==='cards'){
      $('stage').classList.remove('busy');$('stage').replaceChildren();$('message').textContent='Выберите карту. У каждой одинаковый шанс.';
      for(const symbol of ['♠','♣','♦']){const card=node('button',symbol);card.className='card';card.setAttribute('aria-label','Выбрать карту '+symbol);card.onclick=()=>{$('stage').replaceChildren(node('div','♠'));$('stage').firstChild.className='card';finish();};$('stage').append(card);}
    }else{setTimeout(finish,1800);}
  };
  renderGame();renderHistory();
}
