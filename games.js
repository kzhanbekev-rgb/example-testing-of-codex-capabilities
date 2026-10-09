'use strict';
const {randomInt}=require('node:crypto');
const {Chess}=require('chess.js');
const SUITS=['♠','♥','♦','♣'];
function deck(min=2){const cards=[];for(const suit of SUITS)for(let rank=min;rank<=14;rank++)cards.push({rank,suit,id:`${suit}${rank}`});for(let i=cards.length-1;i>0;i--){const j=randomInt(i+1);[cards[i],cards[j]]=[cards[j],cards[i]];}return cards;}
function need(condition,message){if(!condition)throw new Error(message);}
function score(hand){
 const ranks=hand.map(c=>c.rank).sort((a,b)=>b-a),count=new Map();for(const r of ranks)count.set(r,(count.get(r)||0)+1);
 const groups=[...count].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
 const flush=hand.every(c=>c.suit===hand[0].suit), unique=[...new Set(ranks)];
 const straight=unique.length===5&&(ranks[0]-ranks[4]===4?ranks[0]:ranks.join(',')==='14,5,4,3,2'?5:0);
 if(flush&&straight)return[8,straight];if(groups[0][1]===4)return[7,groups[0][0],groups[1][0]];
 if(groups[0][1]===3&&groups[1][1]===2)return[6,groups[0][0],groups[1][0]];
 if(flush)return[5,...ranks];if(straight)return[4,straight];if(groups[0][1]===3)return[3,...groups.map(g=>g[0])];
 if(groups[0][1]===2&&groups[1][1]===2)return[2,...groups.map(g=>g[0])];if(groups[0][1]===2)return[1,...groups.map(g=>g[0])];return[0,...ranks];
}
function compare(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){if((a[i]||0)!==(b[i]||0))return(a[i]||0)>(b[i]||0)?1:-1;}return 0;}
function createGame(type,players){
 if(type==='chess')return{type,players,moves:[],fen:new Chess().fen(),turn:players[0]};
 const pile=deck(type==='durak'?6:2),hands=players.map(()=>pile.splice(0,type==='poker'?5:6));
 if(type==='poker')return{type,players,pile,hands,drawn:[false,false]};
 need(type==='durak','Неизвестная игра');const trump=pile[pile.length-1].suit;
 const lowest=hands.map(h=>Math.min(...h.filter(c=>c.suit===trump).map(c=>c.rank),99));const attacker=lowest[0]===lowest[1]?randomInt(2):lowest[0]<lowest[1]?0:1;
 return{type,players,pile,hands,trump,attacker,table:[],taking:false,limit:6};
}
function cardFrom(hand,id){const at=hand.findIndex(c=>c.id===id);need(at>=0,'Карты нет в вашей руке');return hand.splice(at,1)[0];}
function finishRound(s){
 const old=s.attacker,def=1-old;
 if(s.taking)s.hands[def].push(...s.table.flatMap(pair=>pair.defense?[pair.attack,pair.defense]:[pair.attack]));
 for(const i of [old,def])while(s.hands[i].length<6&&s.pile.length)s.hands[i].push(s.pile.shift());
 s.attacker=s.taking?old:def;s.table=[];s.taking=false;s.limit=Math.min(6,s.hands[1-s.attacker].length);
 if(!s.pile.length){const empty=s.hands.map(h=>!h.length);if(empty[0]&&empty[1])s.outcome='draw';else if(empty[0]||empty[1])s.outcome=s.players[empty[0]?0:1];}
}
function action(s,user,a){
 const i=s.players.indexOf(user);need(i>=0,'Вы не участник');need(!s.outcome,'Игра завершена');
 if(a.kind==='resign'){s.outcome=s.players[1-i];return s;}
 if(s.type==='chess'){
  const chess=new Chess();for(const move of s.moves)chess.move(move);need(chess.turn()===(i===0?'w':'b'),'Сейчас ход соперника');
  let move;try{move=chess.move({from:a.from,to:a.to,promotion:a.promotion||'q'});}catch{throw new Error('Недопустимый ход');}need(move,'Недопустимый ход');
  s.moves.push(move.san);s.fen=chess.fen();s.turn=s.players[chess.turn()==='w'?0:1];
  if(chess.isCheckmate())s.outcome=user;else if(chess.isDraw())s.outcome='draw';s.check=chess.isCheck();return s;
 }
 if(s.type==='poker'){
  need(a.kind==='draw','Выберите карты для обмена');need(!s.drawn[i],'Вы уже обменяли карты');
  const ids=a.cards;need(Array.isArray(ids)&&ids.length<=5&&new Set(ids).size===ids.length&&ids.every(id=>s.hands[i].some(c=>c.id===id)),'Некорректный обмен');
  for(const id of ids)cardFrom(s.hands[i],id);while(s.hands[i].length<5)s.hands[i].push(s.pile.shift());s.drawn[i]=true;
  if(s.drawn.every(Boolean)){s.scores=s.hands.map(score);const c=compare(...s.scores);s.outcome=c===0?'draw':s.players[c>0?0:1];}return s;
 }
 const attacker=s.attacker,defender=1-attacker;
 if(a.kind==='attack'){
  need(i===attacker,'Вы сейчас защищаетесь');need(s.table.length<s.limit,'Лимит карт в атаке');
  const c=s.hands[i].find(c=>c.id===a.card);need(c,'Карты нет в вашей руке');
  need(!s.table.length||s.table.some(p=>p.attack.rank===c.rank||p.defense?.rank===c.rank),'Подкидывать можно только совпадающий ранг');
  s.table.push({attack:cardFrom(s.hands[i],a.card),defense:null});
 }else if(a.kind==='defend'){
  need(i===defender&&!s.taking,'Сейчас нельзя защищаться');const pair=s.table[a.index];need(pair&&!pair.defense,'Выберите непокрытую карту');
  const c=s.hands[i].find(c=>c.id===a.card);need(c,'Карты нет в вашей руке');need(c.suit===pair.attack.suit&&c.rank>pair.attack.rank||c.suit===s.trump&&pair.attack.suit!==s.trump,'Эта карта не бьёт атакующую');pair.defense=cardFrom(s.hands[i],a.card);
 }else if(a.kind==='take'){need(i===defender&&s.table.length&&!s.taking,'Нельзя взять карты сейчас');s.taking=true;
 }else if(a.kind==='end'){need(i===attacker&&s.table.length&&(s.taking||s.table.every(p=>p.defense)),'Раунд ещё не завершён');finishRound(s);
 }else throw new Error('Неизвестный ход');return s;
}
function view(s,user){
 const i=s.players.indexOf(user),v=structuredClone(s);delete v.pile;v.deckCount=s.pile?.length;v.yourIndex=i;
 if(s.hands){v.opponentCount=s.hands[1-i].length;if(!s.outcome)v.hands=s.hands.map((h,j)=>j===i?h:[]);}
 if(s.type==='chess'&&!s.outcome){const c=new Chess(s.fen);v.legal=c.turn()===(i===0?'w':'b')?c.moves({verbose:true}).map(m=>({from:m.from,to:m.to,promotion:m.promotion})):[];}
 return v;
}
module.exports={createGame,action,view,score,compare};
