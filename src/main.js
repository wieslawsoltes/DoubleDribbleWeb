import { BasketballGame } from './core/game.js';
import { TEAMS, clamp, clockText, blankInput } from './core/math.js';
import { makeAtlas } from './render/atlas.js';
import { PixelRenderer } from './render/renderer.js';
import { GameScene } from './render/scenes.js';
import { GameInput } from './input/controls.js';
import { FrameInputs } from './input/frame-inputs.js';
import { CourtAudio } from './audio/synth.js';
import { LocalStore } from './storage.js';

async function bootstrap(){
  const $=id=>document.getElementById(id);
  const store=new LocalStore(),savedPrefs=store.read('preferences',{});
  const prefs={mode:'single',team:1,opponent:0,level:1,minutes:5,clockRate:1,crt:false,guides:true,sound:true,volume:0.38,touch:null};
  if(savedPrefs&&typeof savedPrefs==='object'){
    for(const key of ['crt','guides','sound'])if(typeof savedPrefs[key]==='boolean')prefs[key]=savedPrefs[key];
    if(typeof savedPrefs.touch==='boolean')prefs.touch=savedPrefs.touch;
    if(['single','versus','championship','practice'].includes(savedPrefs.mode))prefs.mode=savedPrefs.mode;
    for(const key of ['team','opponent'])if(Number.isInteger(savedPrefs[key])&&savedPrefs[key]>=0&&savedPrefs[key]<4)prefs[key]=savedPrefs[key];
    if([1,2,3].includes(savedPrefs.level))prefs.level=savedPrefs.level;
    if([5,10,20,30].includes(savedPrefs.minutes))prefs.minutes=savedPrefs.minutes;
    if([1,3].includes(savedPrefs.clockRate))prefs.clockRate=savedPrefs.clockRate;
    if(Number.isFinite(savedPrefs.volume))prefs.volume=clamp(savedPrefs.volume,0,1);
  }
  let career=store.read('career',{levels:[],wins:0,played:0});
  if(!career||!Array.isArray(career.levels))career={levels:[],wins:0,played:0};
  career.levels=career.levels.filter(x=>[1,2,3].includes(x));
  let game=new BasketballGame({...prefs,mode:'demo',seed:198709}),title=true,titleTime=0;
  let saved=store.loadGame(),accumulator=0,lastTime=0,lastUI=0,saveElapsed=0,frameCount=0,fpsTime=0,currentFPS=0,renderCPU=0;
  const audio=new CourtAudio({enabled:prefs.sound,volume:prefs.volume});
  let input,scene,renderer,toastTimer;
  const frameInputs=new FrameInputs();
  function clearControls(){input?.clear();frameInputs.clear();}
  const dialogs=new Map();
  const toast=message=>{ $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200); };
  const savePrefs=()=>store.write('preferences',prefs);

  function sanitizeTeams(){
    if(prefs.mode!=='versus'){
      prefs.opponent=0;if(prefs.team===0)prefs.team=1;
    }else if(prefs.team===prefs.opponent)prefs.opponent=(prefs.team+1)%4;
  }
  function renderPreferences(){
    sanitizeTeams();
    document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===prefs.mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-team]').forEach(b=>{const active=Number(b.dataset.team)===prefs.team;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));b.disabled=prefs.mode!=='versus'&&b.dataset.team==='0';b.title=b.disabled?'Boston is the CPU team in one-player modes':TEAMS[Number(b.dataset.team)].city;});
    for(const [attr,key] of [['level','level'],['minutes','minutes']])document.querySelectorAll(`[data-${attr}]`).forEach(b=>{const active=Number(b.dataset[attr])===prefs[key];b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    $('opponent-select').disabled=prefs.mode!=='versus';$('opponent-select').value=String(prefs.opponent);
    for(const option of $('opponent-select').options)option.disabled=Number(option.value)===prefs.team;
    $('opponent-label').textContent=prefs.mode==='versus'?'PLAYER 2 TEAM':'CPU OPPONENT';
    $('player-two-hint').hidden=prefs.mode!=='versus';
    $('level-description').textContent=['LEARN THE COURT','RAISE YOUR GAME','PLAY TO WIN'][prefs.level-1];
    $('quick-clock').checked=prefs.clockRate===3;
    $('crt-toggle').setAttribute('aria-checked',String(prefs.crt));$('guides-toggle').setAttribute('aria-checked',String(prefs.guides));
    $('screen-window').classList.toggle('crt',prefs.crt);if(scene)scene.showGuides=prefs.guides;
    $('volume').value=String(Math.round(prefs.volume*100));$('sound-button').setAttribute('aria-pressed',String(prefs.sound));$('sound-button').setAttribute('aria-label',prefs.sound?'Mute sound':'Enable sound');
    document.body.classList.toggle('show-touch',prefs.touch===true);$('touch-controls').classList.toggle('force-hidden',prefs.touch===false);
    $('touch-toggle').setAttribute('aria-pressed',String(prefs.touch??matchMedia('(max-width: 860px)').matches));
    $('resume-button').hidden=!saved||!title;
    $('start-label').textContent=title?'TIP OFF':game.s.phase==='final'&&game.s.winner===0&&game.settings.mode==='championship'&&game.settings.level<3?'NEXT LEVEL':'NEW MATCH';
    $('start-caption').textContent=title?'OR PRESS ENTER TO PLAY':game.settings.mode==='practice'?'UNLIMITED SHOOT AROUND':'ENTER TO PAUSE / RESUME';
    document.querySelectorAll('[data-medal]').forEach(m=>m.classList.toggle('earned',career.levels.includes(Number(m.dataset.medal))));
    $('career-text').textContent=career.levels.length?`${career.levels.length}/3 LEVELS WON · ${career.wins||0} WINS`:'THREE LEVELS. ONE TROPHY.';
  }
  function tab(name){
    for(const n of ['setup','stats']){const active=n===name;$(n+'-tab').classList.toggle('active',active);$(n+'-tab').setAttribute('aria-selected',String(active));$(n+'-panel').hidden=!active;}
  }
  function saveCurrent(){
    if(title||game.s.phase==='final')return;
    if(store.saveGame(game))saved={game:BasketballGame.restore(game.snapshot()),savedAt:Date.now()};
  }
  function start(options={}){
    audio.unlock();clearControls();sanitizeTeams();
    const actual={...prefs,seed:Date.now()>>>0,...options};
    game=new BasketballGame(actual);title=false;titleTime=0;accumulator=0;saveElapsed=0;
    Object.assign(prefs,{mode:game.settings.mode==='demo'?'single':game.settings.mode,team:game.settings.team,opponent:game.settings.opponent,level:game.settings.level});
    store.remove('match');saved=null;savePrefs();renderPreferences();tab('stats');updateUI();
    $('screen-window').focus({preventScroll:true});audio.play({type:'whistle'});
    return game;
  }
  function requestStart(){
    if(title){start();return;}
    if(game.s.phase==='final'){
      const next=game.settings.mode==='championship'&&game.s.winner===0&&game.settings.level<3?game.settings.level+1:prefs.level;
      start({level:next});return;
    }
    openDialog('reset-dialog');
  }
  function resumeSaved(){
    const value=store.loadGame();if(!value){saved=null;renderPreferences();toast('No valid saved match was found.');return;}
    game=value.game;game.s.paused=false;game.previousInputs=[blankInput(),blankInput()];
    Object.assign(prefs,{mode:game.settings.mode,team:game.settings.team,opponent:game.settings.opponent,level:game.settings.level,minutes:game.settings.minutes,clockRate:game.settings.clockRate});
    title=false;accumulator=0;clearControls();audio.unlock();renderPreferences();tab('stats');updateUI();$('screen-window').focus({preventScroll:true});
  }
  function togglePause(){
    audio.unlock();
    if(title){start();return;}
    if(game.s.phase==='final'){requestStart();return;}
    if(['period','halftime'].includes(game.s.phase)){game.nextPeriod();updateUI();return;}
    game.togglePause();clearControls();accumulator=0;if(game.s.paused)saveCurrent();updateUI();
  }
  function goHome(){
    if(!title)saveCurrent();
    clearControls();game=new BasketballGame({...prefs,mode:'demo',seed:198709});title=true;titleTime=0;accumulator=0;
    saved=store.loadGame();renderPreferences();tab('setup');updateUI();
  }
  function openDialog(id){
    const dialog=$(id);if(dialog.open)return;
    const wasPlaying=!title&&!game.s.paused&&game.s.phase!=='final';dialogs.set(dialog,{game,wasPlaying});
    if(wasPlaying){game.s.paused=true;saveCurrent();}
    clearControls();input.suspended=true;dialog.showModal();updateUI();
  }
  function closeDialog(dialog){if(dialog.open)dialog.close();}
  async function fullscreen(){
    try{if(document.fullscreenElement)await document.exitFullscreen();else if($('stage-shell').requestFullscreen)await $('stage-shell').requestFullscreen();else toast('Fullscreen is not available in this browser.');}
    catch{toast('The browser could not enter fullscreen.');}
  }
  function sound(){prefs.sound=!prefs.sound;audio.setEnabled(prefs.sound);savePrefs();renderPreferences();}
  function action(code){
    if(code==='Enter')togglePause();
    else if(code==='Escape'||code==='KeyP'){if(!title)togglePause();}
    else if(code==='KeyF')fullscreen();
    else if(code==='KeyH')openDialog('help-dialog');
    else if(code==='KeyV')sound();
  }

  input=new GameInput({onAction:action,onInteract:()=>audio.unlock(),stick:$('touch-stick'),knob:$('stick-knob'),buttons:[...document.querySelectorAll('[data-pad]')]});
  for(const id of ['help-dialog','about-dialog','reset-dialog']){
    const dialog=$(id);
    dialog.addEventListener('close',()=>{
      const previous=dialogs.get(dialog);dialogs.delete(dialog);
      if(previous?.wasPlaying&&previous.game===game&&!title&&game.s.phase!=='final')game.s.paused=false;
      input.suspended=[...document.querySelectorAll('dialog')].some(d=>d.open);clearControls();accumulator=0;updateUI();
      if(!input.suspended)$('screen-window').focus({preventScroll:true});
    });
    dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)closeDialog(dialog);}});
  }
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>closeDialog($(button.dataset.close))));
  $('help-button').addEventListener('click',()=>openDialog('help-dialog'));
  $('about-button').addEventListener('click',()=>openDialog('about-dialog'));
  $('fullscreen-button').addEventListener('click',fullscreen);
  $('sound-button').addEventListener('click',sound);
  $('pause-button').addEventListener('click',togglePause);
  $('stats-pause-button').addEventListener('click',togglePause);
  $('touch-pause').addEventListener('click',togglePause);
  $('start-button').addEventListener('click',requestStart);
  $('resume-button').addEventListener('click',resumeSaved);
  $('confirm-reset').addEventListener('click',()=>{closeDialog($('reset-dialog'));start();});
  $('new-match-button').addEventListener('click',()=>tab('setup'));
  $('brand-home').addEventListener('click',e=>{e.preventDefault();goHome();});
  $('setup-tab').addEventListener('click',()=>tab('setup'));
  $('stats-tab').addEventListener('click',()=>tab('stats'));
  for(const [selector,attribute,key] of [['mode-options','mode','mode'],['team-options','team','team'],['level-options','level','level'],['time-options','minutes','minutes']]){
    $(selector).addEventListener('click',e=>{
      const button=e.target.closest(`button[data-${attribute}]`);if(!button||button.disabled)return;
      prefs[key]=key==='mode'?button.dataset[attribute]:Number(button.dataset[attribute]);
      sanitizeTeams();renderPreferences();savePrefs();audio.unlock();audio.tone(520,0.045,'triangle',0.13);
    });
  }
  $('opponent-select').addEventListener('change',e=>{prefs.opponent=Number(e.target.value);sanitizeTeams();renderPreferences();savePrefs();});
  $('quick-clock').addEventListener('change',e=>{prefs.clockRate=e.target.checked?3:1;savePrefs();});
  $('crt-toggle').addEventListener('click',()=>{prefs.crt=!prefs.crt;renderPreferences();savePrefs();});
  $('guides-toggle').addEventListener('click',()=>{prefs.guides=!prefs.guides;renderPreferences();savePrefs();});
  $('volume').addEventListener('input',e=>{prefs.volume=Number(e.target.value)/100;audio.setVolume(prefs.volume);savePrefs();});
  $('touch-toggle').addEventListener('click',()=>{prefs.touch=!(prefs.touch??matchMedia('(max-width: 860px)').matches);renderPreferences();savePrefs();clearControls();});
  $('screen-window').addEventListener('pointerdown',()=>audio.unlock());
  window.addEventListener('blur',()=>{frameInputs.clear();if(!title&&!game.s.paused&&game.s.phase!=='final'){game.s.paused=true;saveCurrent();updateUI();}});
  document.addEventListener('visibilitychange',()=>{
    audio.setHidden(document.hidden);lastTime=0;accumulator=0;
    if(document.hidden){clearControls();if(!title&&game.s.phase!=='final'){game.s.paused=true;saveCurrent();}}
  });
  window.addEventListener('pagehide',saveCurrent);

  const atlas=makeAtlas();
  renderer=new PixelRenderer($('gpu-canvas'),$('fallback-canvas'),atlas,(mode,reason)=>{
    $('renderer-name').textContent=mode.toUpperCase();$('engine-pill').classList.toggle('fallback',mode==='Canvas 2D');$('engine-pill').title=reason;
  });
  scene=new GameScene(renderer);scene.showGuides=prefs.guides;
  renderPreferences();
  const query=new URLSearchParams(location.search);
  const init=renderer.init(query.get('renderer')==='canvas');
  let timeout;
  await Promise.race([init,new Promise(resolve=>timeout=setTimeout(()=>{renderer.useFallback('GPU initialization timed out; continuing in Canvas 2D');resolve();},5000))]);
  clearTimeout(timeout);$('boot-message').hidden=true;

  function updateUI(){
    const s=game.s;
    const phases={tip:'TIP-OFF',live:'LIVE GAME',inbound:'INBOUND',dunk:'SLAM CAM',freeThrow:'FREE THROWS',period:'INTERMISSION',halftime:'HALF TIME',final:'FINAL SCORE'};
    $('play-state').textContent=title?'ATTRACT MODE':s.paused?'PAUSED':game.settings.mode==='practice'?'PRACTICE':phases[s.phase]||'LIVE';
    $('stage-detail').textContent=title?'5 ON 5 · 8-BIT BASKETBALL':`${game.team(0).short} ${s.score[0]} — ${s.score[1]} ${game.team(1).short}`;
    $('pause-button').textContent=s.paused?'▶':'Ⅱ';$('pause-button').setAttribute('aria-label',s.paused?'Resume game':'Pause game');
    let context='PICK YOUR TEAM. TAKE THE COURT.';
    if(!title){
      if(s.paused)context=store.available?'PAUSED · MATCH SAVED ON THIS DEVICE':'PAUSED · STORAGE UNAVAILABLE';
      else if(s.phase==='tip')context='PRESS Z / B TO WIN THE TIP';
      else if(s.phase==='inbound')context=`${game.team(s.inbound.team).short} BALL · X / A TO INBOUND`;
      else if(s.phase==='dunk')context='HOLD. RISE. RELEASE.';
      else if(s.phase==='final')context='FINAL BUZZER · ENTER TO PLAY AGAIN';
      else if(game.owner && game.human(game.owner.team))context=`PLAYER ${game.owner.team+1} BALL · ATTACK ${game.direction(game.owner.team)>0?'→':'←'}`;
      else if(game.owner)context='ON DEFENSE · X STEALS / Z SWITCHES';
      else context='LOOSE BALL · GO GET IT';
    }
    $('game-context').textContent=context;
    const p=game.owner;
    let tip='Hold Z to jump. Release at the top to shoot. Get close to the hoop for a slam.';
    if(!title){
      if(s.phase==='tip')tip='Time your Z press as the ball rises. Win the tip and attack the basket.';
      else if(s.phase==='inbound')tip='Aim toward a teammate, then press X to put the ball back in play. You have five seconds.';
      else if(s.phase==='dunk')tip='Release Z when the player reaches the top of the close-up jump. Timing matters on dunks, too.';
      else if(s.phase==='freeThrow')tip='Free throw: hold Z and release near the middle of the timing guide.';
      else if(s.phase==='final')tip=s.winner===0?'Well played. Press Enter for your next match. Championship wins unlock the next difficulty.':'A new game is one Enter press away. Use passing to create space before you shoot.';
      else if(p&&p.team===1&&game.settings.mode!=='versus')tip='Press Z to switch to the nearest defender. Get in front of the ball carrier, then press X to steal.';
      else if(s.ball.kind==='loose'||s.ball.kind==='shot')tip='Follow the ball’s shadow. Press Z to switch to a nearby player and jump for the rebound.';
      else if(s.feedbackTime>0)tip=s.shotFeedback==='PERFECT RELEASE'?'Perfect release. Open shots and smart positioning improve your chance of scoring.':s.shotFeedback==='EARLY RELEASE'?'A little early. Hold Z a moment longer, then release at the top of the jump.':'A little late. Release Z sooner, near the top of the jump.';
      else if(p&&game.direction(p.team)<0)tip='You are attacking the left basket. Aim toward an open teammate and press X to pass.';
    }
    if($('coach-tip').textContent!==tip)$('coach-tip').textContent=tip;
    $('stats-home').textContent=$('stats-th-home').textContent=game.team(0).short;
    $('stats-away').textContent=$('stats-th-away').textContent=game.team(1).short;
    $('stats-score-home').textContent=String(s.score[0]).padStart(2,'0');$('stats-score-away').textContent=String(s.score[1]).padStart(2,'0');
    $('stats-period').textContent=(title?'DEMO · ':s.paused?'PAUSED · ':'')+(s.overtime?'OVERTIME '+s.overtime:'PERIOD '+s.period)+' · '+(game.settings.mode==='practice'?'PRACTICE':clockText(s.clock));
    const st=s.teamStats;
    const rows=[['Field goals',`${st[0].fgm}/${st[0].fga}`,`${st[1].fgm}/${st[1].fga}`],['Three-pointers',`${st[0].threes}/${st[0].threeAttempts}`,`${st[1].threes}/${st[1].threeAttempts}`],['Free throws',`${st[0].ftm}/${st[0].fta}`,`${st[1].ftm}/${st[1].fta}`],...['rebounds','assists','steals','blocks','fouls','turnovers'].map(k=>[k[0].toUpperCase()+k.slice(1),st[0][k],st[1][k]])];
    const html=rows.map(row=>`<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td></tr>`).join('');
    if($('stats-body').innerHTML!==html)$('stats-body').innerHTML=html;
    $('possession-text').textContent=s.phase==='final'?`${game.team(s.winner).city} WINS`:game.owner?`${game.team(game.owner.team).short} POSSESSION · ${Math.ceil(s.shotClock)} SEC`:'BALL IN PLAY';
    $('stats-pause-label').textContent=s.phase==='final'?'PLAY AGAIN':s.paused?'RESUME GAME':'PAUSE GAME';
    if(title&&s.phase==='final'){game=new BasketballGame({...prefs,mode:'demo',seed:game.random.state});}
  }

  function handleEvents(events){
    for(const event of events){
      if(!title)audio.play(event);
      if(event.type==='score'||event.type==='dunk'){
        if(!title)$('announcer').textContent=`${game.team(event.team).city} scores ${event.value||2}. ${game.s.score[0]} to ${game.s.score[1]}.`;
      }
      if(event.type==='final'&&!title){
        career.played=(Number(career.played)||0)+1;
        if(event.winner===0){
          career.wins=(Number(career.wins)||0)+1;
          if(game.settings.mode==='championship'&&!career.levels.includes(game.settings.level))career.levels.push(game.settings.level);
        }
        store.write('career',career);store.remove('match');saved=null;renderPreferences();
        $('announcer').textContent=`Final score ${game.s.score[0]} to ${game.s.score[1]}. ${game.team(event.winner).city} wins.`;
      }
    }
  }
  updateUI();
  const frame=timestamp=>{
    const wallDelta=lastTime?Math.min((timestamp-lastTime)/1000,0.25):1/60;lastTime=timestamp;
    if(!document.hidden){
      titleTime+=wallDelta;
      frameInputs.push(input.sample());
      accumulator+=Math.min(wallDelta,0.1);
      let n=0;
      while(accumulator>=1/60 && n<6){
        const consumed=frameInputs.take();
        const actions=title?[blankInput(),blankInput()]:consumed;
        game.step(1/60,actions);handleEvents(game.events);
        accumulator-=1/60;n++;
      }
      // Do not keep input edges alive through an unbounded simulation catch-up.
      if(n===6)accumulator=Math.min(accumulator,1/60);
      audio.menu(wallDelta,title);
      const renderStart=performance.now();scene.draw(game,{title,titleTime});renderCPU=performance.now()-renderStart;
      frameCount++;fpsTime+=wallDelta;
      if(fpsTime>=0.5){currentFPS=Math.round(frameCount/fpsTime);$('fps').textContent=String(currentFPS);fpsTime=0;frameCount=0;}
      if(timestamp-lastUI>150){lastUI=timestamp;updateUI();}
      saveElapsed+=wallDelta;if(saveElapsed>5){saveElapsed=0;if(!title&&!game.s.paused&&game.s.phase!=='final')saveCurrent();}
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Explicit opt-in diagnostics, used by the included browser test suite.
  if(query.get('test')==='1'){
    window.__DD_DEBUG__={get game(){return game;},get renderer(){return renderer;},get scene(){return scene;},get input(){return input;},get title(){return title;},get prefs(){return {...prefs};},get metrics(){return {fps:currentFPS,renderCpuMs:renderCPU,quads:renderer.count,backend:renderer.mode};},start,resumeSaved,goHome,togglePause,save:saveCurrent,updateUI,
      draw(){scene.draw(game,{title:false});},step(count=1,actions=[blankInput(),blankInput()]){for(let i=0;i<count;i++){game.step(1/60,actions);handleEvents(game.events);}updateUI();scene.draw(game,{title:false});}};
  }
  if(!store.available)toast(store.warning);
}

bootstrap().catch(error=>{
  console.error('Basketball initialization failed:',error);
  const boot=document.getElementById('boot-message');if(boot){boot.hidden=false;boot.innerHTML='<strong>COULD NOT START THE GAME</strong><span>Try the standalone HTML or a local HTTP server.</span>';}
  const label=document.getElementById('renderer-name');if(label)label.textContent='STARTUP ERROR';
});
