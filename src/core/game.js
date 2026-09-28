import { clamp, lerp, distance, normalized, segmentDistance, Random, COURT, TEAMS, LEVELS, isThreePoint, blankInput } from './math.js';

const GAME_VERSION = 1;
const NUMBERS = [4, 7, 9, 11, 15];
const stats = () => ({ points: 0, fgm: 0, fga: 0, threes: 0, threeAttempts: 0, ftm: 0, fta: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fouls: 0, turnovers: 0 });

/**
 * Fixed-step, renderer-independent basketball simulation.
 * Coordinates are feet positions in a 480 × 204 court; ball height is independent.
 * Consume `events` after each step. A = pass/steal; B = shoot/switch.
 */
export class BasketballGame {
  constructor(options = {}) {
    this.settings = {
      mode: ['single','versus','championship','practice','demo'].includes(options.mode) ? options.mode : 'single',
      team: clamp(Math.trunc(options.team ?? 1), 0, 3),
      opponent: clamp(Math.trunc(options.opponent ?? 0), 0, 3),
      level: clamp(Math.trunc(options.level ?? 1), 1, 3),
      minutes: [5,10,20,30].includes(options.minutes) ? options.minutes : 5,
      clockRate: [1,2,3].includes(options.clockRate) ? options.clockRate : 1,
      seed: options.seed ?? 198709,
      // Small periods are exposed only to headless tests, never to persisted UI settings.
      periodSeconds: Number.isFinite(options.periodSeconds) ? clamp(options.periodSeconds, 1, 1800) : null
    };
    if (this.settings.mode !== 'versus') this.settings.opponent = 0;
    if (this.settings.team === this.settings.opponent) {
      if (this.settings.mode === 'versus') this.settings.opponent = (this.settings.team + 1) % 4;
      else this.settings.team = 1;
    }
    this.random = new Random(this.settings.seed);
    this.events = [];
    this.previousInputs = [blankInput(), blankInput()];
    this.state = {
      version: GAME_VERSION, frame: 0, time: 0, phase: 'tip', phaseTime: 0, paused: false,
      period: 1, overtime: 0, clock: this.periodLength, shotClock: 24,
      score: [0,0], teamStats: [stats(),stats()], periodScores: [[0,0]], teamFouls: [0,0],
      players: [], selected: [0,5], teams: [this.settings.team, this.settings.opponent],
      ball: { owner: -1, kind: 'tip', x: 240, y: 102, z: 5, vx: 0, vy: 0, vz: 0, age: 0, lastTouch: 0 },
      possession: 0, possessionTime: 0, crossedHalf: false, backcourtTime: 0,
      camera: 127, message: 'JUMP BALL', messageTime: 2.1, shotFeedback: '', feedbackTime: 0,
      lastPass: null, tipQuality: [-1,-1], tipJump: [false,false],
      inbound: null, freeThrow: null, dunk: null, pendingPeriod: false, winner: -1,
      rimShake: 0, lastScoreTeam: -1, lastScoreValue: 0, celebration: 0
    };
    for (let team=0; team<2; team++) for (let slot=0; slot<5; slot++) {
      this.state.players.push({
        id: team*5+slot, team, slot, number: NUMBERS[slot], skin: slot%3,
        x: 240, y: 102, vx: 0, vy: 0, face: team===0?1:-1, speed: 68-slot*1.5,
        action: 'idle', run: 0, z: 0, jump: 0, charge: -1, cooldown: 0,
        reach: 0, immune: 0, noCatch: 0, think: this.random.range(0,0.12),
        targetX: 240, targetY: 102, stationary: 0, aiRelease: 0.42,
        hasBallTime: 0, stats: stats()
      });
    }
    this.setTipPositions();
    if (this.settings.mode === 'practice') this.resetPractice();
  }

  get periodLength() { return this.settings.periodSeconds ?? this.settings.minutes*60; }
  get s() { return this.state; }
  get owner() { return this.s.ball.owner >= 0 ? this.s.players[this.s.ball.owner] : null; }
  get difficulty() { return LEVELS[this.settings.level-1]; }
  direction(team) { return (team===0 ? 1 : -1) * (this.s.period >= 3 ? -1 : 1); }
  hoop(team) { return { x: this.direction(team)>0 ? COURT.rightRim : COURT.leftRim, y: COURT.centerY }; }
  human(team) { return this.settings.mode !== 'demo' && (team===0 || this.settings.mode==='versus'); }
  team(team) { return TEAMS[this.s.teams[team]]; }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  message(text, duration=1.8) { this.s.message=text; this.s.messageTime=duration; }
  togglePause() { if (this.s.phase !== 'final') this.s.paused=!this.s.paused; this.previousInputs=[blankInput(),blankInput()]; return this.s.paused; }

  setTipPositions() {
    const offsets = [[-9,0],[-64,-52],[-34,63],[-92,23],[-102,-30]];
    for (const p of this.s.players) {
      const sign = this.direction(p.team), off = offsets[p.slot];
      p.x = 240 + off[0]*sign; p.y = 102 + off[1]*(p.team===0?1:-1);
      p.targetX=p.x; p.targetY=p.y; p.face=sign; p.action='idle'; p.charge=-1; p.z=0; p.jump=0;
    }
    this.s.selected=[0,5];
    this.s.ball={ owner:-1, kind:'tip', x:240,y:102,z:3,vx:0,vy:0,vz:0,age:0,lastTouch:0 };
  }

  resetPractice() {
    const s=this.s, dir=this.direction(0), rim=this.hoop(0);
    for (const p of s.players) {
      p.x=p.team===1 ? -200 : rim.x-dir*(110+p.slot*14);
      p.y=45+p.slot*28; p.targetX=p.x; p.targetY=p.y; p.charge=-1; p.z=0;
    }
    s.phase='live'; s.phaseTime=0; s.ball.owner=-1; this.giveBall(s.players[0],true);
    s.players[0].y=102; s.players[0].x=rim.x-dir*140;
    s.camera=clamp(s.players[0].x-118, -12, 268);
    this.message('SHOOT AROUND',2);
  }

  giveBall(p, newPossession=false, rebound=false) {
    const s=this.s, oldTeam=s.possession;
    if (newPossession || oldTeam!==p.team) {
      s.shotClock=24; s.possessionTime=0; s.backcourtTime=0;
      s.crossedHalf=this.direction(p.team)*(p.x-240)>=0;
      s.lastPass=null;
    }
    if (rebound) {
      p.stats.rebounds++; s.teamStats[p.team].rebounds++; s.shotClock=24;
      this.emit('rebound',{team:p.team});
    }
    s.possession=p.team;
    s.ball={ owner:p.id, kind:'held',x:p.x,y:p.y,z:7,vx:0,vy:0,vz:0,age:0,lastTouch:p.id };
    p.immune=0.48; p.hasBallTime=0; p.stationary=0; p.charge=-1;
    s.selected[p.team]=p.id;
    if (oldTeam!==p.team || newPossession) this.selectNearest(1-p.team, false);
  }

  selectNearest(team, jump=true) {
    const s=this.s;
    let best=null,bestD=Infinity;
    for (const p of s.players) if (p.team===team) {
      const d=distance(p,s.ball);
      if(d<bestD){best=p;bestD=d;}
    }
    if(!best)return;
    s.selected[team]=best.id;
    if(jump && best.cooldown<=0 && (s.ball.kind==='shot' || s.ball.kind==='loose')) {
      best.jump=0.58; best.cooldown=0.45; best.action='jump'; this.emit('jump');
    }
  }

  step(dt=1/60, inputs=[blankInput(),blankInput()]) {
    if (!(dt > 0 && dt <= 0.1)) throw new RangeError('Step must be greater than zero and at most 0.1 seconds.');
    this.events=[];
    if(this.s.paused || this.s.phase==='final') return;
    const s=this.s;
    const edges=[0,1].map(t=>{
      const raw=inputs[t]||blankInput(), prev=this.previousInputs[t];
      const i={x:clamp(Number(raw.x)||0,-1,1),y:clamp(Number(raw.y)||0,-1,1),a:!!raw.a,b:!!raw.b};
      const e={...i, ap:!!raw.aPressed || (i.a&&!prev.a), bp:!!raw.bPressed || (i.b&&!prev.b), br:!!raw.bReleased || (!i.b&&prev.b)};
      this.previousInputs[t]=i; return e;
    });
    s.frame++; s.time+=dt; s.phaseTime+=dt;
    s.messageTime=Math.max(0,s.messageTime-dt); s.feedbackTime=Math.max(0,s.feedbackTime-dt);
    s.rimShake=Math.max(0,s.rimShake-dt); s.celebration=Math.max(0,s.celebration-dt);
    for(const p of s.players) {
      p.cooldown=Math.max(0,p.cooldown-dt); p.immune=Math.max(0,p.immune-dt);
      p.noCatch=Math.max(0,p.noCatch-dt); p.reach=Math.max(0,p.reach-dt);
      if(p.jump>0){p.jump=Math.max(0,p.jump-dt);p.z=Math.sin(p.jump/0.58*Math.PI)*16;}
      else if(p.charge<0)p.z=0;
    }
    if(s.phase==='tip') this.updateTip(dt,edges);
    else if(s.phase==='inbound') this.updateInbound(dt,edges);
    else if(s.phase==='freeThrow') this.updateFreeThrow(dt,edges);
    else if(s.phase==='dunk') this.updateDunk(dt,edges);
    else if(s.phase==='period' || s.phase==='halftime') this.updateIntermission(dt);
    else if(s.phase==='live') this.updateLive(dt,edges);
    const lead=this.owner ? this.owner.vx*0.14 : 0;
    const target=clamp(s.ball.x + (1-s.ball.y/204)*28 - 128 + lead, -4, 252);
    if(s.phase!=='dunk') s.camera=lerp(s.camera,target,1-Math.exp(-dt*7.5));
  }

  updateTip(dt,inputs) {
    const s=this.s,t=s.phaseTime;
    s.ball.z = t<0.65 ? 9 : Math.max(0, 10 + (t-0.65)*83 - (t-0.65)**2*57);
    for(let team=0;team<2;team++) {
      const p=s.players[team*5], cpuTime=1.17+(3-this.settings.level)*0.07;
      if(!s.tipJump[team] && (this.human(team) ? inputs[team].bp : t>=cpuTime)) {
        s.tipJump[team]=true;s.tipQuality[team]=1-Math.abs(t-1.2);
        p.jump=0.58;p.action='jump';this.emit('jump');
      }
    }
    if(t>1.9){
      let winner=s.tipQuality[0]>s.tipQuality[1]?0:1;
      if(s.tipQuality[0]===s.tipQuality[1])winner=this.random.int(2);
      s.phase='live';s.phaseTime=0;this.giveBall(s.players[winner*5],true);
      this.message(this.team(winner).city+' BALL',1.4);this.emit('whistle');
    }
  }

  updateLive(dt,inputs) {
    const s=this.s;
    if(this.settings.mode!=='practice'){
      s.clock=Math.max(0,s.clock-dt*this.settings.clockRate);
      s.shotClock=Math.max(0,s.shotClock-dt);
      s.possessionTime+=dt;
      if(!s.crossedHalf)s.backcourtTime+=dt;
    }
    for(let team=0;team<2;team++) if(this.human(team)) this.controlPlayer(team, inputs[team], dt);
    if(s.phase!=='live') return;
    for(const p of s.players) {
      if(this.settings.mode==='practice' && p.team===1)continue;
      const controlled=this.human(p.team)&&s.selected[p.team]===p.id;
      if(!controlled) this.updateAI(p,dt);
      if(s.phase!=='live')return;
    }
    this.separatePlayers();
    if(s.phase!=='live') return;
    this.updateBall(dt);
    if(s.phase!=='live')return;
    const owner=this.owner;
    if(owner){
      if(this.settings.mode!=='practice'){
        if(owner.x < -2 || owner.x > 482 || owner.y < -2 || owner.y > 206){this.violation('OUT OF BOUNDS',owner.team);return;}
        const front=this.direction(owner.team)*(owner.x-240);
        if(front>3)s.crossedHalf=true;
        else if(s.crossedHalf && front < -7){this.violation('BACKCOURT',owner.team);return;}
        if(!s.crossedHalf && s.backcourtTime>=10){this.violation('10 SECOND VIOLATION',owner.team);return;}
        if(owner.stationary>=5){this.violation('5 SECOND VIOLATION',owner.team);return;}
      }
      owner.hasBallTime+=dt;
    }
    if(this.settings.mode!=='practice'){
      if(s.clock<=0 && s.ball.kind!=='shot') {this.endPeriod();return;}
      if(s.shotClock<=0 && s.ball.kind!=='shot') {this.violation('24 SECOND VIOLATION',s.possession);return;}
    }
  }

  controlPlayer(team,input,dt) {
    const s=this.s;
    let p=s.players[s.selected[team]];
    if(!p)return;
    if(input.bp && s.ball.owner!==p.id && s.ball.owner>=0 && this.owner.team!==team){this.selectNearest(team);p=s.players[s.selected[team]];}
    if(input.bp && s.ball.owner<0 && s.ball.kind!=='pass'){this.selectNearest(team);p=s.players[s.selected[team]];}
    const move=normalized(input.x,input.y);
    this.move(p,move.x,move.y,dt,true);
    if(input.ap) {
      if(s.ball.owner===p.id)this.pass(p,move);
      else if(this.owner && this.owner.team!==team)this.steal(p,true);
    }
    if(s.phase!=='live')return;
    if(input.bp && s.ball.owner===p.id && p.charge<0 && p.cooldown<=0)this.beginShot(p);
    if(s.phase!=='live')return;
    if(p.charge>=0) {
      p.charge+=dt;p.z=Math.max(0,Math.sin(clamp(p.charge/0.88,0,1)*Math.PI)*17);
      if(input.br)this.releaseShot(p);
      else if(p.charge>0.88){
        p.charge=-1;p.z=0;
        if(this.settings.mode==='practice')this.message('RELEASE AT THE TOP',1.6);
        else this.violation('TRAVELING',p.team);
      }
    }
  }

  move(p,mx,my,dt,human=false) {
    const owned=this.s.ball.owner===p.id;
    const mult=human?1:(p.team===0&&this.settings.mode!=='demo'?0.97:this.difficulty.speed);
    const speed=p.speed*mult*(p.charge>=0?0.20:1);
    p.vx=mx*speed;p.vy=my*speed*0.82;
    p.x+=p.vx*dt;p.y+=p.vy*dt;
    const extra=human?10:0;
    p.x=clamp(p.x, -extra+5, COURT.width+extra-5);p.y=clamp(p.y,-extra+4,COURT.height+extra-4);
    if(Math.abs(mx)>0.08)p.face=mx>0?1:-1;
    const moving=Math.hypot(mx,my)>0.15;
    if(moving)p.run+=dt*8;
    if(p.charge>=0)p.action='shoot';
    else if(p.jump>0)p.action='jump';
    else if(p.reach>0)p.action='reach';
    else p.action=moving?'run':'idle';
    if(owned){
      if(moving)p.stationary=0;else p.stationary+=dt;
    }
  }

  updateAI(p,dt) {
    const s=this.s,ball=s.ball,owner=this.owner,dir=this.direction(p.team),rim=this.hoop(p.team);
    if(p.charge>=0){
      p.charge+=dt;p.z=Math.max(0,Math.sin(p.charge/0.88*Math.PI)*17);p.action='shoot';p.vx=0;p.vy=0;
      if(p.charge>=p.aiRelease)this.releaseShot(p);
      return;
    }
    p.think-=dt;
    if(p.think<=0){
      p.think=this.difficulty.think + this.random.range(0,0.045);
      if(ball.owner===p.id){
        const d=distance(p,rim),pressure=this.pressure(p);
        const minTime=this.settings.mode==='demo'?1.0:1.4;
        const shoot = p.hasBallTime>0.34 && p.cooldown<=0 && ((d<51) || (d<117 && s.possessionTime>minTime && pressure<0.55 && this.random.next()<0.28) || s.shotClock<2.2);
        if(shoot){this.beginShot(p);return;}
        if(p.hasBallTime>0.65 && ((pressure>0.48 && this.random.next()<0.42) || (p.hasBallTime>2 && this.random.next()<0.14))){
          const target=this.bestReceiver(p,{x:dir,y:0});
          if(target && this.pressure(target)<pressure+0.05 && distance(p,target)>24){this.pass(p,{x:target.x-p.x,y:target.y-p.y},target);return;}
        }
        let dodge=0,near=Infinity;
        for(const q of s.players)if(q.team!==p.team){const qd=distance(p,q);if(qd<near){near=qd;dodge=p.y<q.y?-30:30;}}
        p.targetX=rim.x-dir*20;
        p.targetY=102+(near<32?dodge:Math.sin(s.time*0.5+p.slot)*20);
      } else if(ball.owner<0 && (ball.kind==='loose' || ball.kind==='shot')) {
        const tx=ball.kind==='shot'?ball.shot.toX:clamp(ball.x+ball.vx*0.2,8,472);
        const ty=ball.kind==='shot'?ball.shot.toY:clamp(ball.y+ball.vy*0.2,8,196);
        p.targetX=tx+(p.slot-2)*7;p.targetY=ty+(p.slot%2?8:-8);
        if(ball.kind==='shot' && owner===null && ball.shot && ball.shot.team!==p.team && ball.age<0.28 && distance(p,s.players[ball.shot.shooter])<17 && p.cooldown<=0){
          p.jump=0.58;p.cooldown=1.1;p.action='jump';
        }
      } else if(owner && owner.team===p.team) {
        const depth=[52,116,67,110,29][p.slot], lane=[102,32,174,157,75][p.slot];
        const desired=rim.x-dir*depth;
        p.targetX=dir>0?Math.min(desired,owner.x+110):Math.max(desired,owner.x-110);
        p.targetX=clamp(p.targetX,25,455);p.targetY=lane+Math.sin(s.time*0.65+p.slot)*7;
        if(distance(p,owner)<25){p.targetY=clamp(owner.y+(p.slot%2?38:-38),16,188);}
      } else if(owner) {
        let closest=null,near=Infinity;
        for(const q of s.players)if(q.team===p.team){const d=distance(q,owner);if(d<near){near=d;closest=q;}}
        const attackDir=this.direction(owner.team);
        const mark=s.players[(1-p.team)*5+p.slot];
        if(p===closest){p.targetX=owner.x+attackDir*11;p.targetY=owner.y;}
        else {
          p.targetX=lerp(mark.x,this.hoop(owner.team).x,0.11)+attackDir*8;
          p.targetY=lerp(mark.y,102,0.10);
        }
        if(distance(p,owner)<17 && p.cooldown<=0 && this.random.next()<this.difficulty.steal) this.steal(p,false);
      } else if(ball.kind==='pass') {
        const target=s.players[ball.pass.target];
        if(target.id===p.id){p.targetX=p.x;p.targetY=p.y;}
      }
    }
    if(s.phase!=='live')return;
    const dx=p.targetX-p.x,dy=p.targetY-p.y;
    const move=Math.hypot(dx,dy)>3?normalized(dx,dy):{x:0,y:0};
    this.move(p,move.x,move.y,dt);
  }

  pressure(p) {
    if(this.settings.mode==='practice')return 0;
    let pressure=0;
    for(const q of this.s.players)if(q.team!==p.team)pressure=Math.max(pressure,clamp(1-distance(p,q)/34,0,1));
    return pressure;
  }

  separatePlayers() {
    const ps=this.s.players;
    for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
      const a=ps[i],b=ps[j];
      if(this.settings.mode==='practice' && (a.team===1||b.team===1))continue;
      let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
      if(d<9 && a.z<12 && b.z<12){
        if(d<0.001){dx=1;dy=0;d=1;}
        const push=(9-d)*0.5;dx=dx/d*push;dy=dy/d*push;
        a.x-=dx;a.y-=dy;b.x+=dx;b.y+=dy;
      }
    }
  }

  bestReceiver(p,aim={x:0,y:0}) {
    let best=null,score=-Infinity;
    let v=normalized(aim.x,aim.y);
    if(!v.x&&!v.y)v={x:this.direction(p.team),y:0};
    for(const q of this.s.players)if(q.team===p.team && q.id!==p.id){
      const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);
      if(d<8)continue;
      const alignment=(dx*v.x+dy*v.y)/d;
      let candidate=alignment*95-d*0.13-this.pressure(q)*15;
      if(alignment<-0.3)candidate-=80;
      if(candidate>score){score=candidate;best=q;}
    }
    return best;
  }

  pass(p,aim={x:0,y:0},chosen=null) {
    if(this.s.ball.owner!==p.id || p.cooldown>0)return false;
    const target=chosen || this.bestReceiver(p,aim);
    if(!target)return false;
    const s=this.s,wasInbound=s.phase==='inbound';
    p.charge=-1;p.cooldown=0.18;p.reach=0.18;p.noCatch=0.3;
    s.ball={owner:-1,kind:'pass',x:p.x,y:p.y,z:16,age:0,vx:0,vy:0,vz:0,lastTouch:p.id,
      pass:{fromX:p.x,fromY:p.y,target:target.id,duration:clamp(distance(p,target)/290,0.22,0.72),safe:wasInbound}};
    s.lastPass={from:p.id,to:target.id,time:s.time};
    s.selected[p.team]=target.id;
    if(wasInbound){s.phase='live';s.phaseTime=0;s.inbound=null;s.shotClock=24;p.x=clamp(p.x,8,472);p.y=clamp(p.y,8,196);}
    this.emit('pass');return true;
  }

  steal(p,human=false) {
    const owner=this.owner;
    if(!owner || owner.team===p.team || p.cooldown>0)return false;
    p.cooldown=0.65;p.reach=0.23;p.action='reach';this.emit('reach');
    const d=distance(p,owner);
    if(d>20 || owner.immune>0 || owner.z>10)return false;
    const inFront=(p.x-owner.x)*owner.face>=-4;
    if(!inFront && d<13 && this.random.next()<0.22){this.foul(p,owner);return false;}
    const chance=(human?0.82:0.45+this.settings.level*0.09)*(inFront?1:0.42)*(1-(d/45));
    if(this.random.next()<chance){
      p.stats.steals++;this.s.teamStats[p.team].steals++;
      owner.stats.turnovers++;this.s.teamStats[owner.team].turnovers++;
      owner.charge=-1;this.giveBall(p,true);this.message('NICE STEAL!',1.0);this.emit('steal');return true;
    }
    return false;
  }

  beginShot(p) {
    if(this.s.ball.owner!==p.id || p.charge>=0 || p.cooldown>0)return false;
    p.charge=0;p.action='shoot';p.stationary=0;
    p.aiRelease=clamp(0.42+this.random.range(-this.difficulty.accuracy,this.difficulty.accuracy),0.15,0.73);
    const rim=this.hoop(p.team),d=distance(p,rim);
    if(d<49 && Math.abs(p.y-102)<34 && this.pressure(p)<0.65){
      this.s.phase='dunk';this.s.phaseTime=0;
      this.s.dunk={shooter:p.id,team:p.team,style:this.random.int(3),released:false,releaseTime:0,made:false,quality:0};
      this.s.ball.owner=-1;this.s.ball.kind='dunk';
      this.message('TO THE RIM!',0.6);this.emit('dunkStart');
    } else this.emit('jump');
    return true;
  }

  releaseShot(p,freeThrow=false) {
    const s=this.s;
    if(s.ball.owner!==p.id)return false;
    const timing=p.charge,quality=clamp(1-Math.abs(timing-0.42)/0.30,0,1),rim=this.hoop(p.team),d=distance(p,rim);
    const three=!freeThrow && isThreePoint(p.x,p.y,rim.x);
    let base=freeThrow?0.95:d<55?0.96:d<108?0.81:d<166?0.67:clamp(0.58-(d-166)/250,0.06,0.58);
    // An approximate corner advantage, not a reverse-engineered original hot-spot table.
    if(three && Math.abs(p.y-102)>80 && Math.abs(p.x-rim.x)<80)base+=0.12;
    const chance=clamp(base*(0.22+quality*0.78)-(freeThrow?0:this.pressure(p)*0.30),0.015,0.98);
    const made=this.random.next()<chance;
    const st=p.stats,ts=s.teamStats[p.team];
    if(freeThrow){st.fta++;ts.fta++;}else {st.fga++;ts.fga++;if(three){st.threeAttempts++;ts.threeAttempts++;}}
    s.ball={owner:-1,kind:'shot',x:p.x,y:p.y,z:23+p.z,age:0,vx:0,vy:0,vz:0,lastTouch:p.id,
      shot:{shooter:p.id,team:p.team,fromX:p.x,fromY:p.y,fromZ:23+p.z,toX:rim.x,toY:rim.y,duration:clamp(0.53+d/330,0.66,1.62),made,value:freeThrow?1:three?3:2,freeThrow,quality}};
    p.charge=-1;p.jump=0.32;p.noCatch=0.5;p.cooldown=0.4;
    s.shotFeedback=quality>0.84?'PERFECT RELEASE':timing<0.42?'EARLY RELEASE':'LATE RELEASE';s.feedbackTime=1.5;
    if(this.human(p.team))this.emit('shot',{quality,team:p.team});
    this.selectNearest(1-p.team,false);
    return true;
  }

  updateBall(dt) {
    const s=this.s,b=s.ball;b.age+=dt;
    if(b.owner>=0){
      const p=this.owner;
      b.x=p.x+p.face*7;b.y=p.y+1;
      b.z=p.charge>=0 ? 22+p.z : (Math.abs(Math.sin(s.time*9.5))*10+3);
      b.lastTouch=p.id;
      if(p.charge<0 && Math.floor((s.time-dt)*9.5/Math.PI)!==Math.floor(s.time*9.5/Math.PI))this.emit('bounce');
      return;
    }
    if(b.kind==='pass'){
      const pass=b.pass,target=s.players[pass.target],t=clamp(b.age/pass.duration,0,1);
      b.x=lerp(pass.fromX,target.x,t);b.y=lerp(pass.fromY,target.y,t);b.z=13+Math.sin(t*Math.PI)*8;
      if(!pass.safe && t>0.16 && t<0.94){
        for(const p of s.players)if(p.team!==target.team && distance(p,b)<8.3 && p.noCatch<=0){
          p.stats.steals++;s.teamStats[p.team].steals++;
          const from=s.players[b.lastTouch];from.stats.turnovers++;s.teamStats[from.team].turnovers++;
          this.giveBall(p,true);this.message('INTERCEPTED!',1);this.emit('steal');return;
        }
      }
      if(t>=1){
        const previous=s.lastPass;this.giveBall(target,false);s.lastPass=previous;
      }
    } else if(b.kind==='shot'){
      const sh=b.shot,t=clamp(b.age/sh.duration,0,1);
      b.x=lerp(sh.fromX,sh.toX,t);b.y=lerp(sh.fromY,sh.toY,t);b.z=lerp(sh.fromZ,COURT.rimZ,t)+Math.sin(t*Math.PI)*(31+sh.duration*10);
      if(!sh.freeThrow && t<0.29 && t>0.045){
        for(const p of s.players)if(p.team!==sh.team && p.jump>0 && p.z>9 && distance(p,b)<12 && b.z<40+p.z){
          p.stats.blocks++;s.teamStats[p.team].blocks++;p.noCatch=0.16;
          this.looseBall(b.x,b.y,30,-this.direction(sh.team)*48,this.random.range(-35,35),30,p.id,false);
          this.message('BLOCKED!',1.2);this.emit('block');return;
        }
      }
      if(t>=1){
        if(sh.freeThrow){this.finishFreeThrow(sh);return;}
        if(sh.made)this.scoreBasket(sh.team,sh.value,sh.shooter);
        else {
          s.rimShake=0.35;this.emit('rim');
          if(s.clock<=0 && this.settings.mode!=='practice'){this.endPeriod();return;}
          this.looseBall(sh.toX,sh.toY,27,-this.direction(sh.team)*this.random.range(24,68),this.random.range(-46,46),this.random.range(35,55),sh.shooter,true);
          s.shotClock=24;this.selectNearest(0,false);this.selectNearest(1,false);
        }
      }
    } else if(b.kind==='loose'){
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;b.vz-=125*dt;
      b.vx*=Math.exp(-dt*0.7);b.vy*=Math.exp(-dt*0.7);
      if(b.z<2){b.z=2;if(Math.abs(b.vz)>12){b.vz=-b.vz*0.47;this.emit('bounce');}else b.vz=0;}
      let nearest=null,near=Infinity;
      for(const p of s.players){
        if(this.settings.mode==='practice' && p.team===1)continue;
        if(p.noCatch>0 || b.age<0.14 || b.z>13+p.z)continue;
        const d=distance(p,b);
        if(d<11 && d<near){near=d;nearest=p;}
      }
      if(nearest){this.giveBall(nearest,s.possession!==nearest.team,b.rebound);return;}
      if(b.x<-8 || b.x>488 || b.y<-8 || b.y>212){
        if(this.settings.mode==='practice'){this.resetPractice();return;}
        this.violation('OUT OF BOUNDS',s.players[b.lastTouch].team);return;
      }
    }
  }

  looseBall(x,y,z,vx,vy,vz,lastTouch,rebound=false) {
    this.s.ball={owner:-1,kind:'loose',x,y,z,vx,vy,vz,age:0,lastTouch,rebound};
  }

  scoreBasket(team,value,shooter,fromDunk=false) {
    const s=this.s,p=s.players[shooter],st=p.stats,ts=s.teamStats[team];
    s.score[team]+=value;st.points+=value;ts.points+=value;
    s.periodScores[s.periodScores.length-1][team]+=value;
    if(value===1){st.ftm++;ts.ftm++;}else {st.fgm++;ts.fgm++;if(value===3){st.threes++;ts.threes++;}}
    if(value>1 && s.lastPass && s.lastPass.to===shooter && s.time-s.lastPass.time<4.5){
      const passer=s.players[s.lastPass.from];if(passer.team===team){passer.stats.assists++;ts.assists++;}
    }
    s.lastPass=null;s.rimShake=0.5;s.lastScoreTeam=team;s.lastScoreValue=value;s.celebration=2;
    this.emit(fromDunk?'dunk':'score',{value,team});
    if(s.clock<=0 && this.settings.mode!=='practice'){this.endPeriod();return;}
    if(this.settings.mode==='practice'){
      this.resetPractice();this.message(value===3?'THREE POINTER!':'NICE SHOT!',1.3);return;
    }
    this.setupInbound(1-team,'baseline',value===3?'THREE POINTER!':fromDunk?'SLAM DUNK!':'BASKET!',1.25);
  }

  updateDunk(dt,inputs) {
    const s=this.s,d=s.dunk,p=s.players[d.shooter],t=s.phaseTime;
    if(!d.released){
      const release=this.human(p.team) ? inputs[p.team].br : t>=p.aiRelease+0.10;
      if(release || t>0.98){
        d.released=true;d.releaseTime=t;
        d.quality=clamp(1-Math.abs(t-0.56)/0.39,0,1);
        d.made=this.random.next()<clamp(0.34+d.quality*0.65,0.04,0.99);
        p.stats.fga++;s.teamStats[p.team].fga++;
        s.shotFeedback=d.quality>0.83?'PERFECT RELEASE':t<0.56?'EARLY RELEASE':'LATE RELEASE';s.feedbackTime=2;
        this.emit('shot',{quality:d.quality,team:p.team});
      }
    }
    if(t>1.85){
      p.charge=-1;p.z=0;p.noCatch=0.45;s.dunk=null;
      if(d.made)this.scoreBasket(d.team,2,d.shooter,true);
      else {
        this.message('OFF THE RIM!',1.5);this.emit('rim');
        if(s.clock<=0 && this.settings.mode!=='practice'){this.endPeriod();return;}
        s.phase='live';s.phaseTime=0;
        const rim=this.hoop(d.team);
        this.looseBall(rim.x,rim.y,30,-this.direction(d.team)*60,this.random.range(-35,35),45,d.shooter,true);
        this.selectNearest(0,false);this.selectNearest(1,false);s.shotClock=24;
      }
    }
  }

  violation(message,team) {
    const s=this.s,p=this.owner;
    s.teamStats[team].turnovers++;
    if(p && p.team===team)p.stats.turnovers++;
    this.emit('whistle');
    this.setupInbound(1-team,'sideline',message,1.1);
  }

  setupInbound(team,type='baseline',message='',delay=0.7) {
    const s=this.s,dir=this.direction(team),lastX=s.ball.x;
    const x=type==='baseline'?(dir>0?-6:486):clamp(lastX,24,456);
    const y=type==='baseline'?102:(s.ball.y<102?-5:209);
    for(const p of s.players){
      const own=p.team===team,side=this.direction(p.team);
      p.charge=-1;p.z=0;p.jump=0;p.cooldown=0.2;p.vx=0;p.vy=0;p.stationary=0;p.action='idle';
      if(type==='baseline'){
        p.x=dir>0 ? (own?42+p.slot*24:130+p.slot*25) : 480-(own?42+p.slot*24:130+p.slot*25);
        p.y=30+p.slot*34;
      }else{
        p.x=clamp(x+dir*(own?24+p.slot*20:45+p.slot*20),12,468);
        p.y=clamp((y<102?40:164)+(p.slot-2)*23,16,188);
      }
      p.face=side;p.targetX=p.x;p.targetY=p.y;
    }
    const inbounder=s.players[team*5];inbounder.x=x;inbounder.y=y;
    this.giveBall(inbounder,true);
    s.phase='inbound';s.phaseTime=0;s.inbound={team,player:inbounder.id,type,delay,count:5};
    s.shotClock=24;s.backcourtTime=0;s.crossedHalf=this.direction(team)*(x-240)>0;
    if(message)this.message(message,delay+1.0);
  }

  updateInbound(dt,inputs) {
    const s=this.s,i=s.inbound,p=s.players[i.player];
    s.ball.x=p.x;s.ball.y=p.y;s.ball.z=15;
    if(s.phaseTime<i.delay)return;
    i.count-=dt;
    if(this.human(i.team)){
      p.face=inputs[i.team].x!==0?(inputs[i.team].x>0?1:-1):this.direction(i.team);
      if(inputs[i.team].ap)this.pass(p,{x:inputs[i.team].x,y:inputs[i.team].y});
    }else if(s.phaseTime>i.delay+0.7)this.pass(p,{x:this.direction(i.team),y:0});
    if(s.phase==='inbound' && i.count<=0)this.violation('5 SECOND INBOUND',i.team);
  }

  foul(defender,victim) {
    const s=this.s;
    defender.stats.fouls++;s.teamStats[defender.team].fouls++;s.teamFouls[defender.team]++;
    this.emit('whistle');this.message('PUSHING FOUL',1.7);
    if(victim.charge>=0 || s.teamFouls[defender.team]>=5)this.setupFreeThrows(victim.id,2);
    else this.setupInbound(victim.team,'sideline','PUSHING FOUL',1.2);
  }

  setupFreeThrows(shooter,count=2) {
    const s=this.s,p=s.players[shooter],rim=this.hoop(p.team),dir=this.direction(p.team);
    for(const q of s.players){
      q.charge=-1;q.z=0;q.jump=0;q.action='idle';q.cooldown=0.2;
      q.x=rim.x-dir*(32+q.slot*11);q.y=102+(q.team===0?-32:32);
    }
    p.x=rim.x-dir*88;p.y=102;p.face=dir;
    this.giveBall(p,false);
    s.phase='freeThrow';s.phaseTime=0;s.freeThrow={shooter,remaining:count,total:count,wait:0.85,count:5};
    this.message('FREE THROWS',1.5);
  }

  updateFreeThrow(dt,inputs) {
    const s=this.s,f=s.freeThrow,p=s.players[f.shooter];
    if(s.ball.kind==='shot'){this.updateBall(dt);return;}
    if(s.phaseTime<f.wait)return;
    f.count-=dt;
    const inp=inputs[p.team],human=this.human(p.team);
    if(p.charge<0 && (human ? inp.bp : s.phaseTime>f.wait+0.6)){
      p.charge=0;p.action='shoot';p.aiRelease=0.42+this.random.range(-this.difficulty.accuracy,this.difficulty.accuracy);
    }
    if(p.charge>=0){
      p.charge+=dt;p.z=Math.max(0,Math.sin(clamp(p.charge/0.88,0,1)*Math.PI)*12);
      s.ball.x=p.x;s.ball.y=p.y;s.ball.z=23+p.z;
      if((human?inp.br:p.charge>=p.aiRelease)||p.charge>0.88)this.releaseShot(p,true);
    }
    if(f.count<=0 && s.ball.kind!=='shot'){
      p.stats.fta++;s.teamStats[p.team].fta++;
      this.finishFreeThrow({team:p.team,shooter:p.id,made:false,value:1});
    }
  }

  finishFreeThrow(sh) {
    const s=this.s,f=s.freeThrow,p=s.players[sh.shooter];
    if(sh.made){
      s.score[sh.team]++;p.stats.points++;p.stats.ftm++;s.teamStats[sh.team].points++;s.teamStats[sh.team].ftm++;
      s.periodScores[s.periodScores.length-1][sh.team]++;this.emit('score',{value:1,team:sh.team});
    }else this.emit('rim');
    f.remaining--;p.charge=-1;p.z=0;
    if(f.remaining>0){
      this.giveBall(p,false);s.phaseTime=0;f.count=5;f.wait=0.85;
      this.message(sh.made?'GOOD! ONE MORE':'ONE MORE SHOT',1.3);
    }else{
      s.freeThrow=null;
      if(sh.made)this.setupInbound(1-sh.team,'baseline','FREE THROW GOOD',0.8);
      else{
        const rim=this.hoop(sh.team);s.phase='live';s.phaseTime=0;
        this.looseBall(rim.x,rim.y,27,-this.direction(sh.team)*45,this.random.range(-24,24),38,p.id,true);
        s.shotClock=24;this.selectNearest(0,false);this.selectNearest(1,false);
      }
    }
  }

  endPeriod() {
    const s=this.s;
    s.clock=0;
    for(const p of s.players){p.charge=-1;p.z=0;p.jump=0;p.action='idle';}
    this.emit('buzzer');
    if(s.period>=4 && s.score[0]!==s.score[1]){
      s.phase='final';s.phaseTime=0;s.winner=s.score[0]>s.score[1]?0:1;
      this.message('FINAL SCORE',1000);this.emit('final',{winner:s.winner});
    }else{
      s.phase=s.period===2?'halftime':'period';s.phaseTime=0;
      this.message(s.period===2?'HALF TIME SHOW':s.period>=4?'OVERTIME':'END OF PERIOD',5);
    }
  }

  updateIntermission(dt) {
    const s=this.s;
    if(s.phaseTime>(s.phase==='halftime'?7.5:3.4))this.nextPeriod();
  }

  nextPeriod() {
    const s=this.s;
    s.period++;if(s.period>4)s.overtime++;
    s.periodScores.push([0,0]);s.teamFouls=[0,0];
    s.clock=s.period>4?60:this.periodLength;s.shotClock=24;s.pendingPeriod=false;
    s.phase='tip';s.phaseTime=0;s.tipQuality=[-1,-1];s.tipJump=[false,false];
    this.setTipPositions();this.message(s.period>4?'OVERTIME':'PERIOD '+s.period,2);
    this.emit('whistle');
  }

  snapshot() {
    return { version:GAME_VERSION,settings:structuredClone(this.settings),state:structuredClone(this.s),random:this.random.state,previousInputs:structuredClone(this.previousInputs) };
  }

  static restore(data) {
    if(!data || data.version!==GAME_VERSION || data.state?.version!==GAME_VERSION)throw new Error('Unsupported saved game version.');
    const st=data.state;
    if(!Array.isArray(st.players)||st.players.length!==10||!Array.isArray(st.score)||st.score.length!==2)throw new Error('Invalid saved game.');
    if(!['tip','live','inbound','freeThrow','dunk','period','halftime','final'].includes(st.phase))throw new Error('Invalid saved phase.');
    if(!Number.isInteger(st.ball?.owner)||st.ball.owner<-1||st.ball.owner>9)throw new Error('Invalid ball owner.');
    for(let n=0;n<10;n++){
      const p=st.players[n];
      if(p.id!==n || p.team!==Math.floor(n/5) || !Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>10000||Math.abs(p.y)>10000)throw new Error('Invalid player data.');
    }
    if(!st.score.every(v=>Number.isFinite(v)&&v>=0&&v<100000)||!Number.isFinite(st.clock)||st.clock<0||st.clock>1800||!Number.isInteger(st.period)||st.period<1||st.period>1000)throw new Error('Invalid score or clock.');
    const g=new BasketballGame(data.settings);g.state=structuredClone(st);g.random.state=data.random>>>0||1;
    g.previousInputs=(data.previousInputs||[blankInput(),blankInput()]).map(v=>({...blankInput(),...v}));
    g.events=[];return g;
  }
}
