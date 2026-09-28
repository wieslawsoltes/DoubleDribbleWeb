import { blankInput } from '../core/math.js';

/** Retains button edges until a fixed simulation tick consumes them.
 * Rendering may run at 30, 60, 120 or 144 Hz; game simulation remains 60 Hz.
 */
export class FrameInputs {
  constructor(){this.clear();}
  clear(){this.pending=[blankInput(),blankInput()];}
  push(samples){
    for(let t=0;t<2;t++){
      const previous=this.pending[t],current={...blankInput(),...samples[t]};
      this.pending[t]={...current,
        aPressed:previous.aPressed||current.aPressed,
        bPressed:previous.bPressed||current.bPressed,
        bReleased:previous.bReleased||current.bReleased};
    }
  }
  take(){
    const result=this.pending.map(value=>({...value}));
    for(const value of this.pending)value.aPressed=value.bPressed=value.bReleased=false;
    return result;
  }
}
