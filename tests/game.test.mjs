import test from 'node:test';
import assert from 'node:assert/strict';
import { BasketballGame } from '../src/core/game.js';
import { COURT, TEAMS, LEVELS, Random, isThreePoint, clockText, blankInput, normalized } from '../src/core/math.js';

const DT=1/60;
function tick(g,n,one={},two={}){for(let i=0;i<n;i++)g.step(DT,[{...blankInput(),...one},{...blankInput(),...two}]);}
function fixture(options={}){
  const g=new BasketballGame({mode:'versus',team:1,opponent:0,seed:8127,...options});
  g.s.phase='live';g.s.phaseTime=0;
  for(const p of g.s.players){p.x=80+p.slot*45;p.y=p.team?15:185;p.targetX=p.x;p.targetY=p.y;p.cooldown=0;p.charge=-1;p.immune=0;}
  const p=g.s.players[0];p.x=310;p.y=102;g.giveBall(p,true);g.s.selected[1]=5;
  // Rule fixtures freeze off-ball tactics, not input or ball simulation.
  g.updateAI=()=>{};g.separatePlayers=()=>{};
  return g;
}
function assertFinite(g){
  const s=g.s;
  assert.ok(Number.isFinite(s.clock)&&s.clock>=0);assert.ok(Number.isFinite(s.camera));
  assert.ok(s.score.every(v=>Number.isInteger(v)&&v>=0));assert.ok(s.ball.owner>=-1&&s.ball.owner<=9);
  for(const p of s.players)for(const field of ['x','y','z','vx','vy','charge'])assert.ok(Number.isFinite(p[field]),`${field} for ${p.id}`);
  for(const field of ['x','y','z'])assert.ok(Number.isFinite(s.ball[field]),`ball ${field}`);
  if(s.phase==='inbound')assert.ok(s.inbound&&g.owner?.id===s.inbound.player);
  if(s.phase==='dunk')assert.ok(s.dunk);
  if(s.phase==='freeThrow')assert.ok(s.freeThrow);
  for(let t=0;t<2;t++){
    assert.equal(s.teamStats[t].points,s.score[t]);
    assert.equal(s.players.filter(p=>p.team===t).reduce((v,p)=>v+p.stats.points,0),s.score[t]);
  }
}

test('four cities, three levels, equal team attributes, ten unique players',()=>{
  assert.equal(TEAMS.length,4);assert.equal(LEVELS.length,3);
  const g=new BasketballGame();assert.equal(g.s.players.length,10);
  assert.equal(new Set(g.s.players.map(p=>p.id)).size,10);
  for(let n=0;n<5;n++)assert.equal(g.s.players[n].speed,g.s.players[n+5].speed);
});
test('all four period choices and all difficulty levels initialize',()=>{
  for(const minutes of [5,10,20,30])for(const level of [1,2,3]){
    const g=new BasketballGame({minutes,level});assert.equal(g.s.clock,minutes*60);assert.equal(g.difficulty,LEVELS[level-1]);
  }
});
test('single player CPU is Boston; versus forbids identical teams',()=>{
  const one=new BasketballGame({team:2,opponent:3});assert.deepEqual(one.s.teams,[2,0]);
  const two=new BasketballGame({mode:'versus',team:0,opponent:0});assert.deepEqual(two.s.teams,[0,1]);
});
test('all four teams are selectable in versus mode',()=>{
  for(let team=0;team<4;team++){const g=new BasketballGame({mode:'versus',team,opponent:(team+1)%4});assert.equal(g.s.teams[0],team);}
});
test('deterministic random generator can be resumed',()=>{
  const a=new Random(12),b=new Random(12);for(let i=0;i<1000;i++)assert.equal(a.next(),b.next());
  const c=new Random();c.state=a.state;assert.equal(a.next(),c.next());
});
test('clock formatting is stable at period and minute boundaries',()=>{
  assert.equal(clockText(300),'05:00');assert.equal(clockText(299.99),'05:00');assert.equal(clockText(299),'04:59');assert.equal(clockText(0),'00:00');assert.equal(clockText(-2),'00:00');
});
test('shot classification matches the rendered circular arc and corner lines',()=>{
  assert.equal(isThreePoint(400,102,456),false);assert.equal(isThreePoint(343,102,456),true);
  assert.equal(isThreePoint(430,15,456),true);assert.equal(isThreePoint(430,17,456),false);
  assert.equal(isThreePoint(137,102,24),true);assert.equal(isThreePoint(136,102,24),false);
});
test('diagonal normalization prevents faster diagonal movement',()=>{
  assert.ok(Math.abs(Math.hypot(...Object.values(normalized(1,1)))-1)<1e-12);
  const a=fixture(),b=fixture();a.move(a.owner,1,0,DT,true);const v=normalized(1,1);b.move(b.owner,v.x,v.y,DT,true);
  assert.ok(Math.abs(a.owner.vx-Math.hypot(b.owner.vx,b.owner.vy/0.82))<1e-10);
});
test('well-timed jump wins the tip over a late opposing jump',()=>{
  const g=new BasketballGame({mode:'versus'});tick(g,70);tick(g,1,{b:true});tick(g,15);tick(g,1,{}, {b:true});tick(g,33);
  assert.equal(g.s.phase,'live');assert.equal(g.owner.team,0);
});
test('shooting requires release, not just a press',()=>{
  const g=fixture();tick(g,24,{b:true});assert.equal(g.s.ball.kind,'held');assert.ok(g.owner.charge>0.38);
  tick(g,1);assert.equal(g.s.ball.kind,'shot');assert.equal(g.s.teamStats[0].fga,1);assert.equal(g.s.shotFeedback,'PERFECT RELEASE');
});
test('holding a jump through the landing is traveling',()=>{
  const g=fixture();tick(g,56,{b:true});assert.equal(g.s.phase,'inbound');assert.equal(g.s.inbound.team,1);assert.equal(g.s.teamStats[0].turnovers,1);
});
test('an aimed pass changes control to the chosen receiver and preserves the shot clock',()=>{
  const g=fixture(),p=g.owner,q=g.s.players[1];q.x=365;q.y=102;g.s.shotClock=17;
  assert.equal(g.pass(p,{x:1,y:0},q),true);assert.equal(g.s.selected[0],q.id);
  tick(g,40);assert.equal(g.owner?.id,q.id);assert.ok(g.s.shotClock<17&&g.s.shotClock>15);assert.equal(g.s.teamStats[0].fga,0);
});
test('passing at a defender can be intercepted',()=>{
  const g=fixture(),q=g.s.players[1],defender=g.s.players[5];q.x=380;q.y=102;defender.x=348;defender.y=102;
  g.pass(g.owner,{x:1,y:0},q);tick(g,25);
  assert.equal(g.s.teamStats[1].steals,1);assert.equal(g.owner.team,1);assert.equal(g.s.teamStats[0].turnovers,1);
});
test('a two-point basket updates player, team, period, and match totals once',()=>{
  const g=fixture(),p=g.owner;p.x=397;
  g.beginShot(p);p.charge=.42;g.releaseShot(p);g.s.ball.shot.made=true;tick(g,75);
  assert.deepEqual(g.s.score,[2,0]);assert.equal(p.stats.points,2);assert.equal(g.s.teamStats[0].fgm,1);assert.deepEqual(g.s.periodScores,[[2,0]]);assert.equal(g.s.phase,'inbound');assertFinite(g);
});
test('three-point attempts and makes are accounted separately',()=>{
  const g=fixture(),p=g.owner;p.x=320;g.beginShot(p);p.charge=.42;g.releaseShot(p);g.s.ball.shot.made=true;tick(g,90);
  assert.equal(g.s.score[0],3);assert.equal(g.s.teamStats[0].threes,1);assert.equal(g.s.teamStats[0].threeAttempts,1);assertFinite(g);
});
test('a recent completed pass awards an assist on a basket',()=>{
  const g=fixture(),q=g.s.players[1];q.x=377;q.y=102;g.pass(g.owner,{x:1,y:0},q);tick(g,40);
  g.beginShot(q);q.charge=.42;g.releaseShot(q);g.s.ball.shot.made=true;tick(g,80);
  assert.equal(g.s.players[0].stats.assists,1);assert.equal(g.s.teamStats[0].assists,1);
});
test('a missed shot becomes a physical, reboundable loose ball',()=>{
  const g=fixture(),p=g.owner;g.beginShot(p);p.charge=.42;g.releaseShot(p);g.s.ball.shot.made=false;
  while(g.s.ball.kind==='shot')tick(g,1);
  assert.equal(g.s.ball.kind,'loose');assert.equal(g.s.ball.rebound,true);assert.ok(g.s.ball.vz>0);assert.equal(g.s.score[0],0);
  const q=g.s.players[5];q.x=g.s.ball.x;q.y=g.s.ball.y;g.s.ball.z=2;g.s.ball.vz=0;g.s.ball.vx=g.s.ball.vy=0;g.s.ball.age=.5;
  tick(g,1);assert.equal(g.owner.id,q.id);assert.equal(q.stats.rebounds,1);assert.equal(g.s.teamStats[1].rebounds,1);assert.equal(g.s.shotClock,24);
});
test('nearby jumping defenders can block a live shot',()=>{
  const g=fixture(),p=g.owner,q=g.s.players[5];g.beginShot(p);p.charge=.42;g.releaseShot(p);
  g.s.ball.age=.09;const t=g.s.ball.age/g.s.ball.shot.duration;q.x=310+(456-310)*t;q.y=102;q.jump=.34;q.z=15;
  tick(g,1);assert.equal(g.s.teamStats[1].blocks,1);assert.equal(g.s.ball.kind,'loose');
});
test('inbound pauses the match clock and returns to live play with A',()=>{
  const g=fixture();g.setupInbound(0,'baseline','BASKET',.2);const clock=g.s.clock;tick(g,30);
  assert.equal(g.s.clock,clock);tick(g,1,{a:true,x:1});assert.equal(g.s.phase,'live');assert.equal(g.s.ball.kind,'pass');
});
test('inbound passes are protected from instant interceptions',()=>{
  const g=fixture();g.setupInbound(0,'baseline','',0);const p=g.owner,q=g.s.players[1];q.x=30;q.y=p.y;const d=g.s.players[5];d.x=10;d.y=p.y;
  g.pass(p,{x:1,y:0},q);tick(g,25);assert.equal(g.owner.team,0);assert.equal(g.s.teamStats[1].steals,0);
});
test('five-second inbound violation hands the ball to the opponent',()=>{
  const g=fixture();g.setupInbound(0,'baseline','',0);tick(g,302);assert.equal(g.s.inbound.team,1);assert.equal(g.s.teamStats[0].turnovers,1);
});
test('stationary ball holding triggers the five-second violation',()=>{
  const g=fixture();tick(g,302);assert.equal(g.s.phase,'inbound');assert.equal(g.s.message,'5 SECOND VIOLATION');
});
test('a backcourt team must cross half court in ten seconds',()=>{
  const g=fixture();g.owner.x=110;g.s.crossedHalf=false;g.s.backcourtTime=9.99;
  tick(g,1,{x:1});assert.equal(g.s.message,'10 SECOND VIOLATION');assert.equal(g.s.inbound.team,1);
});
test('carrying the ball back across half court is a turnover',()=>{
  const g=fixture();g.owner.x=231;g.s.crossedHalf=true;tick(g,1,{x:-1});assert.equal(g.s.message,'BACKCOURT');
});
test('shot-clock expiration is a turnover, but an already released shot can finish',()=>{
  const g=fixture();g.s.shotClock=.01;tick(g,1,{x:1});assert.equal(g.s.message,'24 SECOND VIOLATION');
  const h=fixture(),p=h.owner;h.beginShot(p);p.charge=.42;h.releaseShot(p);h.s.ball.shot.made=true;h.s.shotClock=.01;
  tick(h,90);assert.equal(h.s.score[0],3);
});
test('out-of-bounds ball carriers surrender possession',()=>{
  const g=fixture();g.owner.y=-3;tick(g,1,{y:-1});assert.equal(g.s.message,'OUT OF BOUNDS');assert.equal(g.s.inbound.team,1);
});
test('steals reset possession and shot clock without changing scores',()=>{
  const g=fixture(),q=g.s.players[5];q.x=g.owner.x+9;q.y=g.owner.y;g.owner.immune=0;g.random.next=()=>0;g.s.shotClock=2;
  assert.equal(g.steal(q,true),true);assert.equal(g.owner.id,q.id);assert.equal(g.s.shotClock,24);assert.equal(g.s.teamStats[1].steals,1);assert.deepEqual(g.s.score,[0,0]);
});
test('a fifth team foul sends the victim to the free-throw line',()=>{
  const g=fixture(),victim=g.owner,defender=g.s.players[5];g.s.teamFouls[1]=4;g.foul(defender,victim);
  assert.equal(g.s.phase,'freeThrow');assert.equal(g.s.freeThrow.remaining,2);assert.equal(g.s.teamFouls[1],5);assert.equal(defender.stats.fouls,1);
});
test('free throws count one point and do not increment field-goal attempts',()=>{
  const g=fixture(),p=g.owner;g.setupFreeThrows(p.id,2);const clock=g.s.clock;
  for(let n=0;n<2;n++){
    p.charge=.42;g.releaseShot(p,true);g.s.ball.shot.made=true;
    while(g.s.ball.kind==='shot')tick(g,1);
  }
  assert.deepEqual(g.s.score,[2,0]);assert.equal(g.s.teamStats[0].fta,2);assert.equal(g.s.teamStats[0].ftm,2);assert.equal(g.s.teamStats[0].fga,0);assert.equal(g.s.clock,clock);assert.equal(g.s.phase,'inbound');assertFinite(g);
});
test('an untaken free throw expires without stalling the match',()=>{
  const g=fixture();g.setupFreeThrows(0,1);tick(g,360);
  assert.equal(g.s.freeThrow,null);assert.equal(g.s.teamStats[0].fta,1);assert.equal(g.s.teamStats[0].ftm,0);assert.equal(g.s.phase,'live');
});
test('all three close-up styles resolve with timed, two-point dunks',()=>{
  for(let style=0;style<3;style++){
    const g=fixture(),p=g.owner;p.x=430;p.y=102;g.beginShot(p);assert.equal(g.s.phase,'dunk');g.s.dunk.style=style;
    g.random.next=()=>0;tick(g,33,{b:true});tick(g,1);assert.ok(g.s.dunk.released);tick(g,90);
    assert.equal(g.s.score[0],2);assert.equal(g.s.teamStats[0].fga,1);assert.equal(g.s.teamStats[0].fgm,1);assert.equal(g.s.phase,'inbound');
  }
});
test('a mistimed dunk can miss and stays reboundable',()=>{
  const g=fixture(),p=g.owner;p.x=430;p.y=102;g.beginShot(p);g.random.next=()=>.99;tick(g,1,{b:true});tick(g,1);tick(g,112);
  assert.equal(g.s.score[0],0);assert.equal(g.s.ball.kind,'loose');assert.equal(g.s.phase,'live');assert.equal(g.s.teamStats[0].fga,1);
});
test('the horn waits for a shot already in flight and includes its score',()=>{
  const g=fixture(),p=g.owner;g.s.period=4;p.x=310;g.beginShot(p);p.charge=.42;g.releaseShot(p);g.s.ball.shot.made=true;g.s.clock=.01;
  tick(g,1);assert.equal(g.s.phase,'live');assert.equal(g.s.clock,0);
  tick(g,130);assert.equal(g.s.phase,'final');assert.equal(g.s.winner,0);assert.equal(g.s.score[0],3);
});
test('a missed buzzer shot ends the period instead of beginning a rebound',()=>{
  const g=fixture(),p=g.owner;g.beginShot(p);p.charge=.42;g.releaseShot(p);g.s.ball.shot.made=false;g.s.clock=.01;
  tick(g,130);assert.equal(g.s.phase,'period');
});
test('halftime swaps baskets and resets the team foul count',()=>{
  const g=fixture();g.s.period=2;assert.equal(g.direction(0),1);g.s.teamFouls=[3,4];g.endPeriod();assert.equal(g.s.phase,'halftime');g.nextPeriod();
  assert.equal(g.s.period,3);assert.equal(g.direction(0),-1);assert.equal(g.hoop(0).x,24);assert.deepEqual(g.s.teamFouls,[0,0]);
});
test('tied regulation advances to one-minute overtime',()=>{
  const g=fixture();g.s.period=4;g.endPeriod();assert.equal(g.s.phase,'period');g.nextPeriod();assert.equal(g.s.overtime,1);assert.equal(g.s.period,5);assert.equal(g.s.clock,60);
});
test('terminal results and paused games never advance their clock or position',()=>{
  const g=fixture();g.s.paused=true;const before=g.snapshot();tick(g,120,{x:1});assert.deepEqual(g.snapshot(),before);
  g.s.paused=false;g.s.period=4;g.s.score=[1,0];g.endPeriod();const final=g.snapshot();tick(g,120,{x:1});assert.deepEqual(g.snapshot(),final);
});
test('practice has no clock or shot-clock violations',()=>{
  const g=new BasketballGame({mode:'practice'});const clock=g.s.clock;tick(g,60*40);
  assert.equal(g.s.phase,'live');assert.equal(g.s.clock,clock);assert.equal(g.s.teamStats[0].turnovers,0);
});
test('quick clock changes only the match clock, not movement or possession timing',()=>{
  const a=fixture({clockRate:1}),b=fixture({clockRate:3});tick(a,60,{x:1});tick(b,60,{x:1});
  assert.ok(Math.abs(a.s.clock-(a.periodLength-1))<1e-8);assert.ok(Math.abs(b.s.clock-(b.periodLength-3))<1e-8);
  assert.equal(a.owner.x,b.owner.x);assert.equal(a.s.shotClock,b.s.shotClock);
});
test('snapshot round-trip reproduces future simulation exactly',()=>{
  const a=new BasketballGame({mode:'demo',seed:98763});tick(a,1200);
  const b=BasketballGame.restore(JSON.parse(JSON.stringify(a.snapshot())));
  tick(a,3000);tick(b,3000);assert.deepEqual(a.snapshot(),b.snapshot());
});
test('save/load works in every structured phase',()=>{
  const g=fixture();
  const checks=()=>{const restored=BasketballGame.restore(JSON.parse(JSON.stringify(g.snapshot())));assert.deepEqual(restored.snapshot(),g.snapshot());};
  checks();g.setupInbound(0);checks();g.setupFreeThrows(0,2);checks();
  g.s.phase='live';g.s.players[0].x=g.hoop(0).x-20;g.s.players[0].y=102;g.giveBall(g.s.players[0],true);g.s.players[0].cooldown=0;g.beginShot(g.s.players[0]);checks();
});
test('invalid snapshot versions, positions, IDs, and ball owners are rejected',()=>{
  const g=new BasketballGame();
  for(const mutate of [d=>d.version=99,d=>d.state.players[0].x=NaN,d=>d.state.players[0].id=9,d=>d.state.ball.owner=20,d=>d.state.clock=-1,d=>d.state.phase='invalid']){
    const d=g.snapshot();mutate(d);assert.throws(()=>BasketballGame.restore(d));
  }
});
test('nonpositive and oversized simulation steps are rejected',()=>{
  const g=new BasketballGame();for(const dt of [0,-1,.2,NaN,Infinity])assert.throws(()=>g.step(dt),RangeError);
});
for(let level=1;level<=3;level++)test(`CPU level ${level}: complete accelerated match with finite state and consistent stats`,()=>{
  const g=new BasketballGame({mode:'demo',level,seed:1649+level,periodSeconds:30});
  let frames=0,baskets=0,passes=0;
  while(g.s.phase!=='final'&&frames<60*450){
    g.step(DT);frames++;
    for(const e of g.events){if(e.type==='score'||e.type==='dunk')baskets++;if(e.type==='pass')passes++;}
    if(frames%120===0)assertFinite(g);
  }
  assert.equal(g.s.phase,'final');assert.ok(baskets>=2);assert.ok(passes>=5);assertFinite(g);
});
test('all five modes tolerate mixed controls without invalid state',()=>{
  for(const mode of ['single','versus','championship','practice','demo']){
    const g=new BasketballGame({mode,periodSeconds:15,seed:19}),rng=new Random(25);
    let one=blankInput(),two=blankInput();
    for(let n=0;n<9000&&g.s.phase!=='final';n++){
      if(n%12===0){one={x:rng.int(3)-1,y:rng.int(3)-1,a:rng.next()<.3,b:rng.next()<.55};two={x:rng.int(3)-1,y:rng.int(3)-1,a:rng.next()<.3,b:rng.next()<.55};}
      g.step(DT,[one,two]);if(n%120===0)assertFinite(g);
    }
    assertFinite(g);
  }
});
