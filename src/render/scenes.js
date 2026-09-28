import { clamp, lerp, clockText, TEAMS } from '../core/math.js';

const C = Object.freeze({paper:'#fff1ce',ink:'#0b1329',green:'#143c16',blue:'#153c9a',orange:'#ffae50',muted:'#8fa5b9'});

/** Presentation is deliberately independent of the game rules and input adapters. */
export class GameScene {
  constructor(renderer){this.r=renderer;this.showGuides=true;}
  project(x,y,z,camera){return {x:x+(1-y/204)*28-camera,y:96+y*0.63-z};}
  draw(game,{title=false,titleTime=0}={}){
    const r=this.r,s=game.s;r.begin();
    if(s.phase==='dunk')this.dunk(game);
    else {
      this.court(game);
      this.scoreboard(game);
      if(s.phase==='halftime')this.halftime(game);
      if(s.phase==='period')this.period(game);
      if(s.phase==='final')this.final(game);
    }
    if(title)this.title(game,titleTime);
    if(s.paused && !title)this.pause(game);
    r.flush();
  }
  scoreboard(game){
    const r=this.r,s=game.s;
    r.rect(0,0,256,59,'#090e22');
    r.rect(3,8,250,48,C.green);r.border(3,8,250,48,'#b4cadd');r.border(5,10,246,44,C.paper);
    const period=s.overtime?'OVERTIME '+s.overtime:'PERIOD '+s.period;
    r.rect(88,1,85,10,'#090e22');r.text(period,128,1,C.paper,1,'center');
    const left=game.settings.mode==='demo'?'CPU':game.settings.mode==='versus'?'1UP':'1UP';
    const right=game.settings.mode==='versus'?'2UP':'CPU';
    r.rect(11,18,26,9,'#070f12');r.text(left,13,19,C.paper);
    r.rect(220,18,26,9,'#070f12');r.text(right,223,19,C.paper);
    r.text('TIME',99,18,C.paper,1,'center');
    r.rect(115,15,53,13,'#07100e');r.text(game.settings.mode==='practice'?'--:--':clockText(s.clock),142,18,C.paper,1,'center');
    const score0=String(s.score[0]).padStart(2,'0'),score1=String(s.score[1]).padStart(2,'0');
    r.text(score0,13,36,C.paper);r.text('PTS',13+score0.length*6+2,38,'#9fbdff');
    r.text(score1,223,36,C.paper,1,'right');r.text('PTS',227,38,'#9fbdff');
    const ticker=s.messageTime>0?s.message:game.settings.mode==='practice'?'PRACTICE':`${game.team(0).short} VS ${game.team(1).short}`;
    const centerWidth=158;
    if(ticker.length*6>centerWidth)r.text(ticker.slice(0,26),128,46,C.paper,1,'center');
    else r.text(ticker,128,36,C.paper,1,'center');
    if(this.showGuides && s.messageTime<=0){
      r.rect(97,46,62,6,'#0a2011');r.text('24',102,46,'#8eb19a');
      r.rect(119,48,35,3,'#26372c');r.rect(119,48,Math.ceil(s.shotClock/24*35),3,s.shotClock<5?'#ff965d':'#93b583');
    }
  }
  court(game){
    const r=this.r,s=game.s,cam=Math.round(s.camera);
    r.rect(0,57,256,183,C.blue);
    r.quad('crowd-'+(Math.floor(s.time*3)%2),-16-cam,57);
    r.quad('court',-16-cam,94);
    // Feet and ball shadows precede sprites, preserving the sense of ball height.
    for(const p of s.players){
      if(game.settings.mode==='practice' && p.team===1)continue;
      const pt=this.project(p.x,p.y,0,cam);
      r.quad('shadow',pt.x-8,pt.y-2);
      if(s.selected[p.team]===p.id && game.human(p.team))r.quad('selected',pt.x-10,pt.y-2,null,null,p.team===0?'#ffffff':'#ffb672');
    }
    const b=s.ball,shadow=this.project(b.x,b.y,0,cam);
    if(b.owner<0)r.quad('ball-shadow',shadow.x-3,shadow.y-1);
    const objects=s.players.filter(p=>game.settings.mode!=='practice'||p.team===0).map(p=>({y:p.y,player:p}));
    objects.push({y:104,basket:0},{y:104,basket:1});
    if(s.phase==='tip')objects.push({y:107,ref:true});
    objects.sort((a,b)=>a.y-b.y);
    for(const item of objects){
      if(item.player)this.player(game,item.player,cam);
      else if(item.ref){const pt=this.project(240,111,0,cam);r.quad('referee',pt.x-12,pt.y-33);}
      else {
        const right=item.basket===1,pt=this.project(right?456:24,102,0,cam);
        r.quad('basket-'+item.basket,pt.x-(right?11:24),pt.y-51+(s.rimShake>0?Math.round(Math.sin(s.time*70)):0));
      }
    }
    if(b.kind!=='dunk'){
      const bp=this.project(b.x,b.y,b.z,cam);r.quad('ball',bp.x-4,bp.y-4);
    }
    if(s.phase==='tip'){
      r.rect(74,208,108,12,'#0b1730e8');r.text('B / Z TO JUMP',128,211,C.paper,1,'center');
    }
    if(s.phase==='inbound' && s.phaseTime>=s.inbound.delay){
      const human=game.human(s.inbound.team);
      r.rect(37,212,182,13,'#0b1730ed');
      r.text(human?'A / X TO INBOUND  '+Math.ceil(s.inbound.count):'INBOUNDING',128,215,C.paper,1,'center');
    }
    if(s.phase==='freeThrow'){
      const p=s.players[s.freeThrow.shooter];
      r.rect(48,207,160,21,'#0b1730f2');r.text('FREE THROW '+(s.freeThrow.total-s.freeThrow.remaining+1)+'/'+s.freeThrow.total,128,210,C.paper,1,'center');
      r.text('HOLD B / Z - RELEASE',128,219,'#c5b996',1,'center');
      if(p.charge>=0)this.meter(112,197,p.charge/0.88);
    }
    if(s.feedbackTime>0 && this.showGuides && s.phase==='live'){
      r.rect(66,227,124,11,'#0a1830e8');
      r.text(s.shotFeedback,128,229,s.shotFeedback.startsWith('PERFECT')?'#bbefa8':C.paper,1,'center');
    }
  }
  player(game,p,cam){
    const r=this.r,s=game.s,pt=this.project(p.x,p.y,p.z,cam);
    const pose=['idle','run','shoot','jump','reach'].includes(p.action)?p.action:'idle';
    const frame=pose==='run'?Math.floor(p.run)%4:0;
    r.quad(`player-${s.teams[p.team]}-${p.skin}-${pose}-${frame}`,pt.x-12,pt.y-33,null,null,'#ffffff',p.face<0);
    if(s.selected[p.team]===p.id && game.human(p.team) && s.phase!=='final'){
      const blink=Math.floor(s.time*8)%2===0;
      r.quad('marker',pt.x-3,pt.y-41,null,null,p.team===0?'#ffffff':'#ffb672');
      if(blink)r.rect(pt.x-1,pt.y-20,2,2,C.paper);
      if(this.showGuides && p.charge>=0 && s.phase==='live')this.meter(pt.x-16,pt.y+5,p.charge/0.88);
    }
    if(this.showGuides && s.ball.owner>=0 && game.human(s.possession) && p.team===s.possession && p.id!==s.ball.owner && s.phase==='live'){
      const receiver=game.bestReceiver(game.owner,{x:game.owner.face,y:0});
      if(receiver?.id===p.id){r.rect(pt.x-1,pt.y-38,2,2,'#d6c98e');}
    }
  }
  meter(x,y,value){
    const r=this.r;
    r.rect(x,y,33,5,'#101923');r.border(x,y,33,5,'#f2e3b5');
    r.rect(x+13,y+1,7,3,'#75c596');r.rect(x+1+clamp(Math.round(value*30),0,30),y-1,2,7,'#fff9e2');
  }
  title(game,time){
    const r=this.r;
    if(time>15 && Math.floor(time/9)%2===0){
      r.rect(23,205,210,16,'#0b1434f2');r.text('DEMO - PRESS ENTER TO PLAY',128,210,'#fff3d0',1,'center');return;
    }
    r.rect(25,89,206,107,'#08162cf5');r.border(25,89,206,107,'#c0cee4');r.border(28,92,200,101,'#e79845');
    r.text('DOUBLE',131,102,'#502e20',3,'center');r.text('DOUBLE',128,100,'#ffbd64',3,'center');
    r.text('DRIBBLE',131,128,'#502e20',3,'center');r.text('DRIBBLE',128,126,'#fff2ca',3,'center');
    r.text('FIVE ON FIVE BASKETBALL',128,158,'#a5b8c9',1,'center');
    if(Math.floor(time*1.6)%2===0)r.text('PRESS ENTER TO START',128,178,'#ffbd64',1,'center');
    r.rect(12,221,232,13,'#0b1730f2');r.text('INDEPENDENT BROWSER RECREATION',128,224,'#b4c1d0',1,'center');
  }
  pause(game){
    const r=this.r;r.rect(0,58,256,182,'#080f24b8');
    r.rect(47,99,162,65,'#0b1833');r.border(47,99,162,65,'#c5d2dd');
    r.text('PAUSED',128,110,C.paper,2,'center');r.text('ENTER TO RESUME',128,139,'#d9b476',1,'center');
    r.text('RETURN TO THE COURT',128,152,'#a1b2c5',1,'center');
  }
  period(game){
    const r=this.r,s=game.s;r.rect(37,110,182,64,'#0b1733f7');r.border(37,110,182,64,'#d6d2bb');
    r.text(s.period>=4?'OVERTIME':'END OF PERIOD '+s.period,128,123,C.paper,1,'center');
    r.text(`${s.score[0]}  -  ${s.score[1]}`,128,139,'#ffbd64',2,'center');
    r.text('ENTER TO CONTINUE',128,164,'#96aabd',1,'center');
  }
  halftime(game){
    const r=this.r,s=game.s,cam=s.camera;
    r.rect(62,62,132,12,'#0b1934');r.text('HALF TIME SHOW',128,65,C.paper,1,'center');
    for(let i=0;i<5;i++){
      const y=97+i*24,x=240+Math.sin(s.phaseTime*2+i)*13,pt=this.project(x,y,Math.abs(Math.sin(s.phaseTime*4+i))*7,cam);
      r.quad(`player-1-${i%3}-${Math.floor(s.phaseTime*3)%2?'jump':'shoot'}-0`,pt.x-12,pt.y-33);
    }
    r.rect(58,218,140,12,'#0b1730ef');r.text('ENTER TO SKIP',128,221,'#e8d9b8',1,'center');
  }
  final(game){
    const r=this.r,s=game.s,won=s.winner===0,rank=clamp(game.settings.level-1,0,2);
    r.rect(0,58,256,182,'#08172dea');
    r.text(won?'YOU WIN!':'GAME OVER',128,69,won?'#ffcf72':'#fff1d2',2,'center');
    r.text(game.team(s.winner).city+' WINS',128,89,'#a9bfd0',1,'center');
    r.quad('trophy-'+rank,104,103);
    r.text(game.team(0).short,49,116,C.paper,1,'center');r.text(game.team(1).short,207,116,C.paper,1,'center');
    r.text(String(s.score[0]),49,133,C.paper,3,'center');r.text(String(s.score[1]),207,133,C.paper,3,'center');
    r.text('FINAL SCORE',128,176,'#fff0c2',1,'center');
    if(won && game.settings.mode==='championship' && game.settings.level<3)r.text('NEXT: LEVEL '+(game.settings.level+1),128,196,'#e1b86e',1,'center');
    else r.text('THANKS FOR PLAYING',128,196,'#9fbbcb',1,'center');
    r.text('PRESS ENTER',128,221,'#ffcd77',1,'center');
  }
  dunk(game){
    const r=this.r,s=game.s,d=s.dunk,p=s.players[d.shooter],t=s.phaseTime;
    const dark='#121c52';
    r.rect(0,0,256,240,'#3366af');
    // Banded, curving stadium tiers, all rendered as pixel rectangles and atlas sprites.
    for(let y=87;y<216;y+=4){
      const inset=Math.round(Math.sin((y-87)/130*Math.PI)*16);
      r.rect(0,y,256,3,(Math.floor(y/12)%2)?'#112653':'#75889f');
      r.rect(inset,y+1,256-inset*2,1,'#adbec8');
      for(let x=0;x<256;x+=7){const yy=y+((x*13+y)%3);r.rect(x,yy,2,2,(x+y)%5?'#efb675':'#e4d6b8');}
    }
    for(const [x,y,w] of [[23,30,23],[86,46,17],[125,23,24],[203,34,20]]){
      r.rect(x,y,w,3,'#bcd9e4');r.rect(x+3,y-1,w-6,1,'#e2e8d7');r.rect(x+4,y+3,w-8,1,'#17264b');
    }
    // Support, backboard, target square, and rim are separated for dunk-ball occlusion.
    r.rect(225,51,31,7,'#131c43');r.rect(227,52,29,3,'#d5ddd5');
    r.rect(198,36,39,47,'#111934');r.rect(201,39,33,41,'#d3e0d8');r.border(207,52,20,25,'#273965',2);r.border(212,58,12,17,'#d25842',2);
    const jump= Math.sin(clamp(t/1.3,0,1)*Math.PI)*40;
    let hx=lerp(48,133,clamp(t/1.1,0,1)),hy=116-jump;
    const frame=t>0.90?2:t>0.38?1:0;
    if(t>1.15)hy+=Math.min(35,(t-1.15)*90);
    r.quad(`hero-${s.teams[p.team]}-${d.style}-${frame}`,hx,hy);
    let bx=hx+(d.style===1?41:30),by=hy+4;
    if(d.released){const fly=clamp((t-d.releaseTime)/0.35,0,1);bx=lerp(bx,193,fly);by=lerp(by,81,fly)-Math.sin(fly*Math.PI)*13;
      if(t>d.releaseTime+0.35){if(d.made)by+=Math.min(75,(t-d.releaseTime-0.35)*135);else{bx-=Math.min(80,(t-d.releaseTime-0.35)*95);by-=Math.sin(clamp((t-d.releaseTime-0.35)/0.8,0,1)*Math.PI)*48;}}
    }
    if(by<207)r.quad('big-ball',bx-10,by-10);
    r.rect(182,81,27,3,'#111b3f');r.rect(183,81,25,2,'#ffb275');r.rect(181,79,26,2,'#f79a55');
    for(let i=0;i<5;i++){r.rect(184+i*5,85+i%2,1,16-i%2*2,'#e3e8d4');r.rect(187+i*3,101,1,3,'#e3e8d4');}
    for(let i=0;i<3;i++)r.rect(185+i,88+i*5,21-i*2,1,'#d8e0d1');
    r.rect(0,0,256,17,dark);r.text(['TWO-HAND SLAM','WINDMILL','REVERSE JAM'][d.style],128,5,C.paper,1,'center');
    r.rect(0,211,256,29,dark);
    const label=t<0.98?(d.released?s.shotFeedback:'RELEASE B / Z AT THE TOP'):d.made?'SLAM DUNK!':'OFF THE RIM!';
    r.text(label,128,218,t>0.98?'#ffd388':'#fff2d2',1,'center');
    if(!d.released && this.showGuides)this.meter(112,231,t/1.15);
    else r.text(game.team(p.team).city,128,232,'#a6bad0',1,'center');
  }
}
