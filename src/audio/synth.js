/** Original synthesized audio. No music samples or original-game recordings. */
export class CourtAudio {
  constructor({enabled=true,volume=0.38}={}){this.enabled=enabled;this.volume=volume;this.context=null;this.master=null;this.lastBounce=0;this.menuTime=0;this.tuneStep=0;this.mutedForVisibility=false;}
  async unlock(){
    if(!this.enabled)return;
    try{
      if(!this.context){
        const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
        this.context=new Audio();this.master=this.context.createGain();this.master.gain.value=this.volume*0.4;this.master.connect(this.context.destination);
        this.noiseBuffer=this.context.createBuffer(1,this.context.sampleRate,this.context.sampleRate);
        const noise=this.noiseBuffer.getChannelData(0);let seed=710;
        for(let i=0;i<noise.length;i++){seed=(seed*16807)%2147483647;noise[i]=(seed/2147483647)*2-1;}
      }
      if(this.context.state==='suspended')await this.context.resume();
    }catch{ /* Audio is optional; a blocked audio device must not stop the game. */ }
  }
  setEnabled(value){this.enabled=value;if(value)this.unlock();this.applyVolume();}
  setVolume(value){this.volume=Math.max(0,Math.min(1,value));this.applyVolume();}
  setHidden(hidden){this.mutedForVisibility=hidden;this.applyVolume();}
  applyVolume(){if(this.master&&this.context)this.master.gain.setTargetAtTime(this.enabled&&!this.mutedForVisibility?this.volume*0.4:0,this.context.currentTime,0.025);}
  tone(frequency,duration=0.08,type='square',gain=0.22,slide=0,delay=0){
    if(!this.context||!this.master||!this.enabled)return;
    const c=this.context,start=c.currentTime+delay,osc=c.createOscillator(),env=c.createGain();
    osc.type=type;osc.frequency.setValueAtTime(frequency,start);if(slide)osc.frequency.exponentialRampToValueAtTime(Math.max(20,slide),start+duration);
    env.gain.setValueAtTime(0,start);env.gain.linearRampToValueAtTime(gain,start+0.004);env.gain.exponentialRampToValueAtTime(0.0001,start+duration);
    osc.connect(env);env.connect(this.master);osc.start(start);osc.stop(start+duration+0.015);
    osc.onended=()=>{osc.disconnect();env.disconnect();};
  }
  noise(duration=0.13,gain=0.25,highpass=500){
    if(!this.context||!this.master||!this.enabled)return;
    const c=this.context,start=c.currentTime,src=c.createBufferSource(),filter=c.createBiquadFilter(),env=c.createGain();
    src.buffer=this.noiseBuffer;filter.type='highpass';filter.frequency.value=highpass;
    env.gain.setValueAtTime(gain,start);env.gain.exponentialRampToValueAtTime(0.0001,start+duration);
    src.connect(filter);filter.connect(env);env.connect(this.master);src.start();src.stop(start+duration);
    src.onended=()=>{src.disconnect();filter.disconnect();env.disconnect();};
  }
  play(event){
    if(!this.enabled || !this.context)return;
    switch(event.type){
      case 'bounce': if(this.context.currentTime-this.lastBounce>0.16){this.tone(130,0.06,'triangle',0.3,48);this.lastBounce=this.context.currentTime;} break;
      case 'pass': this.noise(0.065,0.09,1700);break;
      case 'jump': this.tone(170,0.08,'triangle',0.16,420);break;
      case 'shot': this.tone(event.quality>0.84?1050:650,0.055,'triangle',0.13);break;
      case 'reach': this.noise(0.05,0.09,1200);break;
      case 'steal': this.tone(560,0.07,'square',0.18);this.tone(840,0.10,'square',0.15,0,0.07);break;
      case 'block': this.noise(0.12,0.34,500);this.tone(120,0.1,'square',0.2,45);break;
      case 'rim': this.tone(850,0.08,'triangle',0.30,320);break;
      case 'rebound': this.tone(190,0.035,'triangle',0.15);break;
      case 'whistle': this.tone(1900,0.24,'sine',0.22,2150);break;
      case 'buzzer': this.tone(115,0.8,'sawtooth',0.28);break;
      case 'dunkStart': this.tone(160,0.2,'triangle',0.3,500);break;
      case 'dunk': this.noise(0.35,0.6,240);this.tone(85,0.3,'triangle',0.65,35);this.fanfare();break;
      case 'score': this.noise(0.16,0.14,1400);if(event.value===3)this.fanfare();else{this.tone(784,0.09,'square',0.13);this.tone(1047,0.12,'square',0.13,0,0.09);}break;
      case 'final': this.fanfare();break;
    }
  }
  fanfare(){[523,659,784,1047].forEach((n,i)=>this.tone(n,0.16,'square',0.14,0,i*0.09));}
  menu(dt,active){
    if(!active||!this.context||!this.enabled)return;
    this.menuTime-=dt;if(this.menuTime>0)return;this.menuTime=0.19;
    // A newly composed, short arpeggio; not the original title music or anthem.
    const melody=[330,0,392,440,0,392,330,262,294,0,330,392,0,294,262,0];
    const note=melody[this.tuneStep%melody.length];if(note)this.tone(note,0.105,'triangle',0.105);
    if(this.tuneStep%4===0)this.tone([131,147,165,147][Math.floor(this.tuneStep/4)%4],0.13,'triangle',0.13);
    this.tuneStep++;
  }
  destroy(){this.context?.close();}
}
