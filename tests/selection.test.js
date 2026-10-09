const test=require('node:test');
const assert=require('node:assert/strict');
const {parseNames,eligibleNames,randomIndex}=require('../app.js');
test('names are trimmed, blank lines removed, duplicates case insensitive',()=>{assert.deepEqual(parseNames(' Анна\n\nМаксим\nанна '),['Анна','Максим']);});
test('fair mode selects only least-assigned current participants',()=>{
  const history=[{name:'Анна'},{name:'анна'},{name:'Максим'},{name:'Ушедший'}];
  assert.deepEqual(eligibleNames(['Анна','Максим','Даша'],history,true),['Даша']);
  assert.deepEqual(eligibleNames(['Анна','Максим'],history,true),['Максим']);
  assert.deepEqual(eligibleNames(['Анна','Максим'],history,false),['Анна','Максим']);
});
test('ties include everyone and removing assignments restores eligibility',()=>{assert.deepEqual(eligibleNames(['А','Б'],[{name:'А'},{name:'Б'}],true),['А','Б']);assert.deepEqual(eligibleNames(['А','Б'],[{name:'Б'}],true),['А']);});
test('random generator rejects invalid pools and stays in bounds',()=>{assert.throws(()=>randomIndex(0));for(let n=1;n<=30;n++)for(let i=0;i<100;i++){const result=randomIndex(n);assert.ok(result>=0 && result<n);}});
