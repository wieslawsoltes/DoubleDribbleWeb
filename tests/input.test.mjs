import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameInputs } from '../src/input/frame-inputs.js';
import { blankInput } from '../src/core/math.js';

test('120/144 Hz sampling retains a press until the next 60 Hz tick',()=>{
  const input=new FrameInputs();
  input.push([{...blankInput(),a:true,aPressed:true},blankInput()]);
  input.push([blankInput(),blankInput()]);
  const tick=input.take();assert.equal(tick[0].a,false);assert.equal(tick[0].aPressed,true);
  assert.equal(input.take()[0].aPressed,false);
});
test('short press and release retain both edges in the same tick',()=>{
  const input=new FrameInputs();
  input.push([{...blankInput(),b:true,bPressed:true},blankInput()]);
  input.push([{...blankInput(),bReleased:true},blankInput()]);
  const [tick]=input.take();assert.equal(tick.bPressed,true);assert.equal(tick.bReleased,true);assert.equal(tick.b,false);
});
test('catch-up ticks retain directions and held buttons but never repeat edges',()=>{
  const input=new FrameInputs();
  input.push([blankInput(),{...blankInput(),x:-1,y:1,b:true,bPressed:true}]);
  assert.equal(input.take()[1].bPressed,true);
  for(let n=0;n<6;n++){const tick=input.take()[1];assert.equal(tick.x,-1);assert.equal(tick.y,1);assert.equal(tick.b,true);assert.equal(tick.bPressed,false);}
});
test('clearing inputs discards held directions and pending press/release edges',()=>{
  const input=new FrameInputs();input.push([{...blankInput(),x:1,b:true,bPressed:true},blankInput()]);
  input.clear();assert.deepEqual(input.take(),[blankInput(),blankInput()]);
});
