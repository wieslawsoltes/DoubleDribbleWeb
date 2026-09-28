import test from 'node:test';
import assert from 'node:assert/strict';
import { BasketballGame } from '../src/core/game.js';
import { LocalStore } from '../src/storage.js';

function memory(){
  const data=new Map();
  globalThis.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
  return data;
}
test('missing storage is nonfatal and returns the requested fallback',()=>{
  delete globalThis.localStorage;const store=new LocalStore();
  assert.deepEqual(store.read('preferences',{}),{});assert.equal(store.available,false);assert.equal(store.write('a',1),false);
});
test('preferences serialize and round-trip independently from matches',()=>{
  memory();const store=new LocalStore();store.write('preferences',{volume:.2,team:3});assert.deepEqual(store.read('preferences'),{volume:.2,team:3});
});
test('invalid or oversized JSON does not execute or enter the simulation',()=>{
  const data=memory(),store=new LocalStore();data.set('dd-browser-v1:preferences','{bad json');assert.equal(store.read('preferences',42),42);
  data.set('dd-browser-v1:preferences',' '.repeat(1500001));assert.equal(store.read('preferences',42),42);
});
test('save produces a paused copy without pausing or mutating the live game',()=>{
  memory();const store=new LocalStore(),game=new BasketballGame({seed:173});const before=game.snapshot();
  assert.equal(store.saveGame(game),true);assert.deepEqual(game.snapshot(),before);
  const restored=store.loadGame();assert.ok(restored.savedAt>0);assert.equal(restored.game.s.paused,true);assert.equal(restored.game.random.state,game.random.state);
});
test('attract and completed matches are not saved',()=>{
  memory();const store=new LocalStore();assert.equal(store.saveGame(new BasketballGame({mode:'demo'})),false);
  const game=new BasketballGame();game.s.phase='final';assert.equal(store.saveGame(game),false);assert.equal(store.read('match'),null);
});
test('structurally invalid saves are removed rather than partially loaded',()=>{
  const data=memory(),store=new LocalStore(),game=new BasketballGame();store.saveGame(game);
  const value=JSON.parse(data.get('dd-browser-v1:match'));value.data.state.players=[];data.set('dd-browser-v1:match',JSON.stringify(value));
  assert.equal(store.loadGame(),null);assert.equal(data.has('dd-browser-v1:match'),false);
});
test('storage quota failures leave the running game usable',()=>{
  memory();const store=new LocalStore(),game=new BasketballGame();globalThis.localStorage.setItem=()=>{throw new Error('QuotaExceededError');};
  assert.equal(store.saveGame(game),false);assert.equal(store.available,false);game.step(1/60);assert.equal(game.s.frame,1);
});
test('removing a match preserves other saved preferences',()=>{
  memory();const store=new LocalStore();store.write('preferences',{crt:true});store.saveGame(new BasketballGame());store.remove('match');
  assert.equal(store.loadGame(),null);assert.deepEqual(store.read('preferences'),{crt:true});
});
