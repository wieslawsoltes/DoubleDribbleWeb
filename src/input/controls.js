const KEY_MAP = [
  {left:['ArrowLeft','KeyA'],right:['ArrowRight','KeyD'],up:['ArrowUp','KeyW'],down:['ArrowDown','KeyS'],a:['KeyX'],b:['KeyZ']},
  {left:['KeyJ'],right:['KeyL'],up:['KeyI'],down:['KeyK'],a:['KeyM'],b:['KeyN']}
];
const GAME_KEYS = new Set(KEY_MAP.flatMap(m=>Object.values(m).flat()));

/** Merges keyboard, two standard gamepads and multi-pointer touch into two NES-like pads. */
export class GameInput {
  constructor({onAction=()=>{},onInteract=()=>{},stick,knob,buttons=[]}={}){
    this.keys=new Set();this.onAction=onAction;this.onInteract=onInteract;this.previous=[{a:false,b:false},{a:false,b:false}];
    this.touch={x:0,y:0,a:false,b:false};this.edges=[{a:false,b:false,br:false},{a:false,b:false,br:false}];
    this.pointers=new Map();this.padStart=[false,false];this.gamepadCount=0;this.suspended=false;
    this.abort=new AbortController();const options={signal:this.abort.signal};
    window.addEventListener('keydown',e=>{
      if(this.isEditable(e.target) || this.suspended)return;
      if(e.target instanceof HTMLButtonElement && (e.code==='Enter'||e.code==='Space'))return;
      if(GAME_KEYS.has(e.code)){
        e.preventDefault();if(!this.keys.has(e.code)){
          for(let t=0;t<2;t++){if(KEY_MAP[t].a.includes(e.code))this.edges[t].a=true;if(KEY_MAP[t].b.includes(e.code))this.edges[t].b=true;}
        }
        this.keys.add(e.code);this.onInteract();
      }
      if(!e.repeat && ['Enter','Escape','KeyP','KeyF','KeyH','KeyV'].includes(e.code)){
        e.preventDefault();this.onInteract();this.onAction(e.code);
      }
    },options);
    window.addEventListener('keyup',e=>{
      for(let t=0;t<2;t++)if(KEY_MAP[t].b.includes(e.code)&&this.keys.has(e.code))this.edges[t].br=true;
      this.keys.delete(e.code);
    },options);
    window.addEventListener('blur',()=>this.clear(),options);
    if(stick){
      const update=e=>{
        const rect=stick.getBoundingClientRect(),dx=e.clientX-rect.left-rect.width/2,dy=e.clientY-rect.top-rect.height/2;
        const range=rect.width*0.32,len=Math.hypot(dx,dy),v=Math.min(1,len/range);
        if(len<range*0.19){this.touch.x=0;this.touch.y=0;}
        else {const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4;this.touch.x=Math.round(Math.cos(angle));this.touch.y=Math.round(Math.sin(angle));}
        if(knob)knob.style.transform=`translate(${len?dx/len*v*range:0}px, ${len?dy/len*v*range:0}px)`;
      };
      stick.addEventListener('pointerdown',e=>{e.preventDefault();if([...this.pointers.values()].some(v=>v==='stick'))return;stick.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,'stick');update(e);this.onInteract();},options);
      stick.addEventListener('pointermove',e=>{if(this.pointers.get(e.pointerId)==='stick')update(e);},options);
      const release=e=>{if(this.pointers.get(e.pointerId)==='stick'){this.pointers.delete(e.pointerId);this.touch.x=this.touch.y=0;if(knob)knob.style.transform='translate(0,0)';}};
      stick.addEventListener('pointerup',release,options);stick.addEventListener('pointercancel',release,options);stick.addEventListener('lostpointercapture',release,options);
    }
    for(const button of buttons){
      const action=button.dataset.pad;
      button.addEventListener('pointerdown',e=>{
        e.preventDefault();button.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,action);this.touch[action]=true;
        this.edges[0][action]=true;button.classList.add('held');this.onInteract();
      },options);
      const release=e=>{
        if(this.pointers.get(e.pointerId)!==action)return;
        this.pointers.delete(e.pointerId);this.touch[action]=[...this.pointers.values()].includes(action);
        if(!this.touch[action]){button.classList.remove('held');if(action==='b')this.edges[0].br=true;}
      };
      button.addEventListener('pointerup',release,options);button.addEventListener('pointercancel',release,options);button.addEventListener('lostpointercapture',release,options);
    }
  }
  isEditable(target){return target instanceof HTMLElement && (['INPUT','SELECT','TEXTAREA'].includes(target.tagName)||target.isContentEditable);}
  sample(){
    const pads=typeof navigator.getGamepads==='function'?[...navigator.getGamepads()].filter(p=>p&&p.connected):[];
    this.gamepadCount=pads.length;
    const result=[];
    for(let t=0;t<2;t++){
      const m=KEY_MAP[t],has=k=>m[k].some(code=>this.keys.has(code));
      let x=Number(has('right'))-Number(has('left')),y=Number(has('down'))-Number(has('up')),a=has('a'),b=has('b');
      if(t===0){x=this.touch.x||x;y=this.touch.y||y;a||=this.touch.a;b||=this.touch.b;}
      const pad=pads[t];
      if(pad){
        const press=n=>!!pad.buttons[n]?.pressed;
        let px=Number(press(15))-Number(press(14)),py=Number(press(13))-Number(press(12));
        if(!px && Math.abs(pad.axes[0]||0)>0.25)px=Math.sign(pad.axes[0]);
        if(!py && Math.abs(pad.axes[1]||0)>0.25)py=Math.sign(pad.axes[1]);
        x=px||x;y=py||y;a||=press(0);b||=press(1)||press(2);
        const start=press(9);if(start&&!this.padStart[t]&&!this.suspended){this.onInteract();this.onAction('Enter');}this.padStart[t]=start;
      }else this.padStart[t]=false;
      const prev=this.previous[t],ed=this.edges[t];
      result.push({x:this.suspended?0:x,y:this.suspended?0:y,a:!this.suspended&&a,b:!this.suspended&&b,aPressed:!this.suspended&&(ed.a||(a&&!prev.a)),bPressed:!this.suspended&&(ed.b||(b&&!prev.b)),bReleased:!this.suspended&&(ed.br||(!b&&prev.b))});
      this.previous[t]={a,b};this.edges[t]={a:false,b:false,br:false};
    }
    return result;
  }
  clear(){this.keys.clear();this.touch={x:0,y:0,a:false,b:false};this.pointers.clear();this.previous=[{a:false,b:false},{a:false,b:false}];this.edges=[{a:false,b:false,br:false},{a:false,b:false,br:false}];document.querySelectorAll('.held').forEach(el=>el.classList.remove('held'));const knob=document.getElementById('stick-knob');if(knob)knob.style.transform='translate(0,0)';}
  destroy(){this.abort.abort();this.clear();}
}
