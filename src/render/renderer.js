const VERTEX_FRAGMENT = /* wgsl */`
struct Quad { @location(0) rect: vec4f, @location(1) uv: vec4f, @location(2) tint: vec4f };
struct VertexOut { @builtin(position) position: vec4f, @location(0) uv: vec2f, @location(1) tint: vec4f };
@group(0) @binding(0) var spriteTexture: texture_2d<f32>;
@group(0) @binding(1) var spriteSampler: sampler;
@vertex fn vs(in: Quad, @builtin(vertex_index) index: u32) -> VertexOut {
  let corners = array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
  let corner = corners[index];
  let p = in.rect.xy + corner * in.rect.zw;
  var out: VertexOut;
  out.position = vec4f(p.x / 128.0 - 1.0, 1.0 - p.y / 120.0, 0.0, 1.0);
  out.uv = mix(in.uv.xy, in.uv.zw, corner);
  out.tint = in.tint;
  return out;
}
@fragment fn fs(in: VertexOut) -> @location(0) vec4f {
  return textureSample(spriteTexture,spriteSampler,in.uv) * in.tint;
}`;

const colorCache = new Map();
export function rgba(color){
  if(Array.isArray(color))return color;
  let cached=colorCache.get(color);if(cached)return cached;
  let h=(color||'#ffffff').replace('#','');if(h.length===3)h=h.split('').map(x=>x+x).join('');
  cached=[parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255,h.length===8?parseInt(h.slice(6,8),16)/255:1];
  colorCache.set(color,cached);return cached;
}

/** A real instanced WebGPU sprite batch, with a separate Canvas 2D fallback. */
export class PixelRenderer {
  constructor(gpuCanvas,fallbackCanvas,atlas,onStatus=()=>{}){
    this.gpuCanvas=gpuCanvas;this.fallbackCanvas=fallbackCanvas;this.atlas=atlas;this.onStatus=onStatus;
    this.maxQuads=8192;this.data=new Float32Array(this.maxQuads*12);this.commands=[];this.count=0;
    this.mode='initializing';this.device=null;this.ctx2d=null;this.failed=false;this.lastReason='';this.gpuErrors=[];
    gpuCanvas.width=fallbackCanvas.width=256;gpuCanvas.height=fallbackCanvas.height=240;
  }
  async init(forceCanvas=false){
    if(forceCanvas || !navigator.gpu){this.useFallback(forceCanvas?'Canvas renderer selected':'WebGPU is unavailable in this browser');return;}
    try{
      const adapter=await navigator.gpu.requestAdapter({powerPreference:'low-power'});
      if(!adapter)throw new Error('No WebGPU adapter available');
      this.device=await adapter.requestDevice();
      const d=this.device;
      d.addEventListener('uncapturederror',e=>{this.gpuErrors.push(e.error.message);this.useFallback('WebGPU validation failed; continuing in Canvas 2D');});
      d.lost.then(info=>{if(info.reason!=='destroyed')this.useFallback('GPU device lost; continuing in Canvas 2D');});
      const context=this.gpuCanvas.getContext('webgpu');if(!context)throw new Error('WebGPU canvas context unavailable');
      const format=navigator.gpu.getPreferredCanvasFormat();context.configure({device:d,format,alphaMode:'opaque'});this.gpuContext=context;
      d.pushErrorScope('validation');
      const module=d.createShaderModule({label:'Pixel sprite shader',code:VERTEX_FRAGMENT});
      const shaderInfo=await module.getCompilationInfo();
      const errors=shaderInfo.messages.filter(m=>m.type==='error');if(errors.length)throw new Error(errors.map(e=>e.message).join('\n'));
      this.pipeline=await d.createRenderPipelineAsync({
        label:'Instanced pixel sprite pipeline',layout:'auto',
        vertex:{module,entryPoint:'vs',buffers:[{arrayStride:48,stepMode:'instance',attributes:[
          {shaderLocation:0,offset:0,format:'float32x4'},{shaderLocation:1,offset:16,format:'float32x4'},{shaderLocation:2,offset:32,format:'float32x4'}]}]},
        fragment:{module,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},
        primitive:{topology:'triangle-list'}
      });
      this.texture=d.createTexture({label:'Original pixel-art atlas',size:[this.atlas.size,this.atlas.size],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
      d.queue.copyExternalImageToTexture({source:this.atlas.canvas},{texture:this.texture},[this.atlas.size,this.atlas.size]);
      this.bindGroup=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[
        {binding:0,resource:this.texture.createView()},
        {binding:1,resource:d.createSampler({magFilter:'nearest',minFilter:'nearest',mipmapFilter:'nearest',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'})}
      ]});
      this.buffer=d.createBuffer({label:'Reused sprite instance buffer',size:this.data.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
      const validation=await d.popErrorScope();if(validation)throw new Error(validation.message);
      this.mode='WebGPU';this.gpuCanvas.hidden=false;this.fallbackCanvas.hidden=true;this.onStatus(this.mode,'Instanced GPU sprites · nearest-neighbor sampling');
    }catch(error){this.useFallback(error.message);}
  }
  useFallback(reason=''){
    if(this.mode==='Canvas 2D')return;
    this.lastReason=reason;this.mode='Canvas 2D';
    this.ctx2d=this.fallbackCanvas.getContext('2d',{alpha:false});this.ctx2d.imageSmoothingEnabled=false;
    this.gpuCanvas.hidden=true;this.fallbackCanvas.hidden=false;this.onStatus(this.mode,reason);
  }
  begin(){this.count=0;this.commands.length=0;}
  quad(name,x,y,w=null,h=null,color='#ffffff',flip=false){
    const a=this.atlas.entries.get(name);if(!a)return;
    w=w??a.w;h=h??a.h;x=Math.round(x);y=Math.round(y);
    if(x+w<0||x>256||y+h<0||y>240||w<=0||h<=0)return;
    if(this.count>=this.maxQuads)throw new Error('Sprite batch capacity exceeded.');
    const c=rgba(color),k=this.count*12,s=this.atlas.size;
    this.data[k]=x;this.data[k+1]=y;this.data[k+2]=w;this.data[k+3]=h;
    this.data[k+4]=(a.x+(flip?a.w:0))/s;this.data[k+5]=a.y/s;
    this.data[k+6]=(a.x+(flip?0:a.w))/s;this.data[k+7]=(a.y+a.h)/s;
    this.data[k+8]=c[0];this.data[k+9]=c[1];this.data[k+10]=c[2];this.data[k+11]=c[3];
    if(this.mode==='Canvas 2D')this.commands.push({a,x,y,w,h,c,flip,solid:name==='white'});
    this.count++;
  }
  rect(x,y,w,h,color){this.quad('white',x,y,w,h,color);}
  border(x,y,w,h,color,thickness=1){this.rect(x,y,w,thickness,color);this.rect(x,y+h-thickness,w,thickness,color);this.rect(x,y,thickness,h,color);this.rect(x+w-thickness,y,thickness,h,color);}
  text(text,x,y,color='#fff1d2',scale=1,align='left'){
    text=String(text).toUpperCase();const width=text.length*6*scale-scale;
    if(align==='center')x-=width/2;else if(align==='right')x-=width;
    for(const ch of text){if(ch!==' ')this.quad('font-'+(this.atlas.entries.has('font-'+ch)?ch:'?'),x,y,5*scale,7*scale,color);x+=6*scale;}
  }
  flush(){
    if(this.mode==='WebGPU'){
      const d=this.device;
      d.queue.writeBuffer(this.buffer,0,this.data.buffer,0,this.count*48);
      const encoder=d.createCommandEncoder({label:'Pixel frame'});
      const pass=encoder.beginRenderPass({colorAttachments:[{view:this.gpuContext.getCurrentTexture().createView(),clearValue:{r:0.02,g:0.03,b:0.08,a:1},loadOp:'clear',storeOp:'store'}]});
      pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bindGroup);pass.setVertexBuffer(0,this.buffer);pass.draw(6,this.count);pass.end();
      d.queue.submit([encoder.finish()]);
    }else if(this.mode==='Canvas 2D'){
      const c=this.ctx2d;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.fillStyle='#060919';c.fillRect(0,0,256,240);
      for(const q of this.commands){
        c.globalAlpha=q.c[3];
        if(q.solid){c.fillStyle=`rgb(${Math.round(q.c[0]*255)},${Math.round(q.c[1]*255)},${Math.round(q.c[2]*255)})`;c.fillRect(q.x,q.y,q.w,q.h);continue;}
        // Glyphs are tinted via a lazily generated, cached atlas-sized scratch tile.
        if(q.c[0]!==1||q.c[1]!==1||q.c[2]!==1){
          const key=`${q.a.x},${q.a.y}:${q.c.slice(0,3).join(',')}`;
          this.tinted??=new Map();let image=this.tinted.get(key);
          if(!image){image=document.createElement('canvas');image.width=q.a.w;image.height=q.a.h;
            const t=image.getContext('2d');t.drawImage(this.atlas.canvas,q.a.x,q.a.y,q.a.w,q.a.h,0,0,q.a.w,q.a.h);
            t.globalCompositeOperation='source-in';t.fillStyle=`rgb(${Math.round(q.c[0]*255)},${Math.round(q.c[1]*255)},${Math.round(q.c[2]*255)})`;t.fillRect(0,0,q.a.w,q.a.h);this.tinted.set(key,image);
          }
          c.drawImage(image,q.x,q.y,q.w,q.h);
        }else if(q.flip){c.save();c.translate(q.x+q.w,q.y);c.scale(-1,1);c.drawImage(this.atlas.canvas,q.a.x,q.a.y,q.a.w,q.a.h,0,0,q.w,q.h);c.restore();}
        else c.drawImage(this.atlas.canvas,q.a.x,q.a.y,q.a.w,q.a.h,q.x,q.y,q.w,q.h);
      }
      c.globalAlpha=1;
    }
  }
  get canvas(){return this.mode==='WebGPU'?this.gpuCanvas:this.fallbackCanvas;}
  destroy(){this.buffer?.destroy();this.texture?.destroy();this.device?.destroy();this.tinted?.clear();}
}
