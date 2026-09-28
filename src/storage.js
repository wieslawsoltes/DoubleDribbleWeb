import { BasketballGame } from './core/game.js';

const PREFIX='dd-browser-v1:';
export class LocalStore {
  constructor(){this.available=true;this.warning='';}
  read(name,fallback=null){
    try{const text=localStorage.getItem(PREFIX+name);if(!text)return fallback;if(text.length>1500000)return fallback;return JSON.parse(text);}
    catch{this.available=false;this.warning='Local storage is unavailable; this session will not be saved.';return fallback;}
  }
  write(name,value){try{localStorage.setItem(PREFIX+name,JSON.stringify(value));return true;}catch{this.available=false;this.warning='Local storage is full or disabled. Your current game still works.';return false;}}
  remove(name){try{localStorage.removeItem(PREFIX+name);}catch{this.available=false;}}
  saveGame(game){if(game.settings.mode==='demo'||game.s.phase==='final')return false;const data=game.snapshot();data.state.paused=true;return this.write('match',{savedAt:Date.now(),data});}
  loadGame(){
    const value=this.read('match');if(!value)return null;
    try{return {game:BasketballGame.restore(value.data),savedAt:value.savedAt};}
    catch{this.remove('match');return null;}
  }
}
