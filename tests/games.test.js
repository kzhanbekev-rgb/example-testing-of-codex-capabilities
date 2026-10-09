const test=require('node:test'),assert=require('node:assert/strict');
const {createGame,action,view,score,compare}=require('../games');
const players=['alice','bob'];
test('poker ranks straight flush, full house, wheel and tie correctly',()=>{
 const h=(ranks,suits=['♠','♥','♦','♣','♠'])=>ranks.map((rank,i)=>({rank,suit:suits[i]}));
 assert.deepEqual(score(h([14,5,4,3,2])),[4,5]);
 assert.equal(score(h([10,11,12,13,14],Array(5).fill('♠')))[0],8);
 assert.equal(score(h([10,10,10,8,8]))[0],6);
 assert.equal(score(h([14,14,3,3,9]))[0],2);
 assert.ok(compare(score(h([14,14,3,3,9])),score(h([13,13,12,12,14])))>0);
 assert.equal(compare(score(h([9,9,14,10,2])),score(h([9,9,14,10,2]))),0);
});
test('poker hides opponent/deck and settles after one exchange from each player',()=>{
 const s=createGame('poker',players);assert.equal(new Set([...s.pile,...s.hands.flat()].map(c=>c.id)).size,52);
 const visible=view(s,'alice');assert.deepEqual(visible.hands[1],[]);assert.equal(visible.pile,undefined);
 assert.throws(()=>action(s,'alice',{kind:'draw',cards:['fake']}));
 action(s,'alice',{kind:'draw',cards:s.hands[0].slice(0,3).map(c=>c.id)});assert.equal(s.hands[0].length,5);assert.equal(s.outcome,undefined);
 assert.throws(()=>action(s,'alice',{kind:'draw',cards:[]}));action(s,'bob',{kind:'draw',cards:[]});assert.ok(s.outcome);assert.equal(view(s,'alice').hands[1].length,5);
 assert.throws(()=>action(s,'bob',{kind:'resign'}));
});
test('chess rejects out-of-turn and illegal moves, detects mate',()=>{
 const s=createGame('chess',players);assert.throws(()=>action(s,'bob',{from:'e7',to:'e5'}));assert.throws(()=>action(s,'alice',{from:'e2',to:'e5'}));
 for(const [u,from,to]of [['alice','f2','f3'],['bob','e7','e5'],['alice','g2','g4'],['bob','d8','h4']])action(s,u,{from,to});
 assert.equal(s.outcome,'bob');assert.equal(s.moves.length,4);assert.throws(()=>action(s,'alice',{kind:'resign'}));
});
test('chess tracks repetition for draw',()=>{const s=createGame('chess',players);for(let j=0;j<2;j++)for(const [u,from,to]of [['alice','g1','f3'],['bob','g8','f6'],['alice','f3','g1'],['bob','f6','g8']])action(s,u,{from,to});assert.equal(s.outcome,'draw');});
test('durak validates defense, throwing rank, take and refill',()=>{
 const c=(rank,suit)=>({rank,suit,id:suit+rank});const s={type:'durak',players,pile:[c(10,'♥')],hands:[[c(6,'♠'),c(8,'♣')],[c(7,'♠'),c(6,'♥')]],trump:'♥',attacker:0,table:[],taking:false,limit:2};
 action(s,'alice',{kind:'attack',card:'♠6'});assert.throws(()=>action(s,'bob',{kind:'defend',card:'♠7',index:3}));
 action(s,'bob',{kind:'defend',card:'♠7',index:0});assert.throws(()=>action(s,'alice',{kind:'attack',card:'♣8'}));
 action(s,'alice',{kind:'end'});assert.equal(s.attacker,1);assert.equal(s.hands[0].length,2);assert.equal(s.pile.length,0);
 action(s,'bob',{kind:'attack',card:'♥6'});action(s,'alice',{kind:'take'});action(s,'bob',{kind:'end'});assert.equal(s.outcome,'bob');assert.equal(s.hands[0].length,3);
});
test('durak complete games terminate with valid cards, hidden hands and legal actions',()=>{
 for(let round=0;round<10;round++){
  const s=createGame('durak',players);assert.equal(new Set([...s.pile,...s.hands.flat()].map(c=>c.id)).size,36);
  assert.deepEqual(view(s,players[0]).hands[1],[]);
  let moves=0;
  while(!s.outcome&&moves++<1000){
   const a=s.attacker,d=1-a;
   if(!s.table.length)action(s,players[a],{kind:'attack',card:s.hands[a][0].id});
   else if(s.taking||s.table.every(p=>p.defense))action(s,players[a],{kind:'end'});
   else{const index=s.table.findIndex(p=>!p.defense),attack=s.table[index].attack;const defense=s.hands[d].find(c=>c.suit===attack.suit&&c.rank>attack.rank||c.suit===s.trump&&attack.suit!==s.trump);action(s,players[d],defense?{kind:'defend',card:defense.id,index}:{kind:'take'});}
  }assert.ok(s.outcome,'match must terminate');
 }
});
