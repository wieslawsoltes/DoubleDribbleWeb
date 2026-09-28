import { Random, COURT, TEAMS } from '../core/math.js';

export const GLYPHS = {
  'A':['01110','10001','10001','11111','10001','10001','10001'],
  'B':['11110','10001','10001','11110','10001','10001','11110'],
  'C':['01111','10000','10000','10000','10000','10000','01111'],
  'D':['11110','10001','10001','10001','10001','10001','11110'],
  'E':['11111','10000','10000','11110','10000','10000','11111'],
  'F':['11111','10000','10000','11110','10000','10000','10000'],
  'G':['01111','10000','10000','10111','10001','10001','01111'],
  'H':['10001','10001','10001','11111','10001','10001','10001'],
  'I':['11111','00100','00100','00100','00100','00100','11111'],
  'J':['00111','00010','00010','00010','10010','10010','01100'],
  'K':['10001','10010','10100','11000','10100','10010','10001'],
  'L':['10000','10000','10000','10000','10000','10000','11111'],
  'M':['10001','11011','10101','10101','10001','10001','10001'],
  'N':['10001','11001','10101','10011','10001','10001','10001'],
  'O':['01110','10001','10001','10001','10001','10001','01110'],
  'P':['11110','10001','10001','11110','10000','10000','10000'],
  'Q':['01110','10001','10001','10001','10101','10010','01101'],
  'R':['11110','10001','10001','11110','10100','10010','10001'],
  'S':['01111','10000','10000','01110','00001','00001','11110'],
  'T':['11111','00100','00100','00100','00100','00100','00100'],
  'U':['10001','10001','10001','10001','10001','10001','01110'],
  'V':['10001','10001','10001','10001','10001','01010','00100'],
  'W':['10001','10001','10001','10101','10101','10101','01010'],
  'X':['10001','10001','01010','00100','01010','10001','10001'],
  'Y':['10001','10001','01010','00100','00100','00100','00100'],
  'Z':['11111','00001','00010','00100','01000','10000','11111'],
  '0':['01110','10001','10011','10101','11001','10001','01110'],
  '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'],
  '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],
  '5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['01110','10000','10000','11110','10001','10001','01110'],
  '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'],
  '9':['01110','10001','10001','01111','00001','00001','01110'],
  ':':['00000','00100','00100','00000','00100','00100','00000'],
  '-':['00000','00000','00000','11111','00000','00000','00000'],
  '/':['00001','00001','00010','00100','01000','10000','10000'],
  '.':['00000','00000','00000','00000','00000','00110','00110'],
  '!':['00100','00100','00100','00100','00100','00000','00100'],
  '?':['01110','10001','00001','00010','00100','00000','00100'],
  '>':['10000','01000','00100','00010','00100','01000','10000'],
  '<':['00001','00010','00100','01000','00100','00010','00001'],
  '+':['00000','00100','00100','11111','00100','00100','00000'],
  '(':['00010','00100','01000','01000','01000','00100','00010'],
  ')':['01000','00100','00010','00010','00010','00100','01000'],
  '%':['11001','11010','00010','00100','01000','01011','10011'],
  "'":['00100','00100','00000','00000','00000','00000','00000'],
  ' ':['00000','00000','00000','00000','00000','00000','00000']
};

/** Integer rasterizer. All source art is drawn here, not downloaded or ROM-extracted. */
export class PixelPen {
  constructor(context){this.c=context;}
  rect(x,y,w,h,color){this.c.fillStyle=color;this.c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  line(x0,y0,x1,y1,color,width=1){
    x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
    const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;
    let e=dx+dy;
    for(let guard=0;guard<10000;guard++){
      this.rect(x0-Math.floor(width/2),y0-Math.floor(width/2),width,width,color);
      if(x0===x1&&y0===y1)break;
      const e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}
    }
  }
  poly(points,color){
    const ys=points.map(p=>p[1]),min=Math.ceil(Math.min(...ys)),max=Math.floor(Math.max(...ys));
    for(let y=min;y<=max;y++){
      const xs=[];
      for(let i=0,j=points.length-1;i<points.length;j=i++){
        const a=points[j],b=points[i];
        if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      xs.sort((a,b)=>a-b);
      for(let i=0;i+1<xs.length;i+=2)this.rect(Math.ceil(xs[i]),y,Math.floor(xs[i+1])-Math.ceil(xs[i])+1,1,color);
    }
  }
  path(points,color,width=1,closed=false){for(let i=1;i<points.length;i++)this.line(...points[i-1],...points[i],color,width);if(closed)this.line(...points[points.length-1],...points[0],color,width);}
  ellipse(cx,cy,rx,ry,color,fill=true,width=1){
    if(fill){for(let y=-Math.ceil(ry);y<=Math.ceil(ry);y++){const r=rx*Math.sqrt(Math.max(0,1-(y*y)/(ry*ry)));this.rect(Math.ceil(cx-r),Math.round(cy+y),Math.max(1,Math.floor(r*2)),1,color);}}
    else{const points=[];for(let a=0;a<=Math.PI*2+0.01;a+=0.05)points.push([cx+Math.cos(a)*rx,cy+Math.sin(a)*ry]);this.path(points,color,width);}
  }
  text(text,x,y,color,scale=1){
    for(const ch of text.toUpperCase()){
      const rows=GLYPHS[ch]||GLYPHS['?'];
      for(let yy=0;yy<7;yy++)for(let xx=0;xx<5;xx++)if(rows[yy][xx]==='1')this.rect(x+xx*scale,y+yy*scale,scale,scale,color);
      x+=6*scale;
    }
  }
}

export class SpriteAtlas {
  constructor(size=2048){
    this.canvas=document.createElement('canvas');this.canvas.width=this.canvas.height=size;
    this.context=this.canvas.getContext('2d');this.context.imageSmoothingEnabled=false;
    this.size=size;this.entries=new Map();this.x=2;this.y=2;this.rowHeight=0;
  }
  add(name,w,h,paint){
    if(this.x+w+2>this.size){this.x=2;this.y+=this.rowHeight+2;this.rowHeight=0;}
    if(this.y+h+2>this.size)throw new Error('Sprite atlas capacity exceeded.');
    const entry={x:this.x,y:this.y,w,h};this.entries.set(name,entry);
    this.context.save();this.context.translate(this.x,this.y);this.context.beginPath();this.context.rect(0,0,w,h);this.context.clip();
    paint(new PixelPen(this.context));this.context.restore();
    this.x+=w+2;this.rowHeight=Math.max(this.rowHeight,h);return entry;
  }
}

const INK='#151629',SKINS=[['#ffbf83','#c5794a'],['#c1814e','#77482e'],['#f6a666','#af633a']];

function drawAthlete(p,team,skin,pose,frame){
  const t=TEAMS[team],[skinLight,skinDark]=SKINS[skin];
  const stride=[-3,0,3,0][frame%4],bob=pose==='run'&&(frame%2===0)?1:0;
  const headY=2+bob,torsoY=9+bob;
  const limb=(a,b,c,w=3)=>{p.line(...a,...b,INK,w+2);p.line(...a,...b,c,w);};
  let hip1=[9,22+bob],hip2=[14,22+bob];
  let knee1=[9+stride,27],ankle1=[8-stride,31],knee2=[14-stride,27],ankle2=[15+stride,31];
  if(pose==='shoot'||pose==='jump'){knee1=[6,24];ankle1=[8,29];knee2=[17,24];ankle2=[18,28];}
  if(pose==='idle'||pose==='reach'){knee1=[8,27];ankle1=[7,31];knee2=[15,27];ankle2=[16,31];}
  limb(hip1,knee1,skinDark);limb(knee1,ankle1,skinLight,2);
  limb(hip2,knee2,skinLight);limb(knee2,ankle2,skinLight,2);
  p.rect(ankle1[0]-2,ankle1[1]-2,3,2,t.trim);p.rect(ankle1[0]-3,ankle1[1],6,2,INK);p.rect(ankle1[0]-3,ankle1[1],5,1,'#f5f1e3');
  p.rect(ankle2[0]-1,ankle2[1]-2,3,2,t.trim);p.rect(ankle2[0]-2,ankle2[1],6,2,INK);p.rect(ankle2[0]-2,ankle2[1],5,1,'#f5f1e3');
  const body=[[8,torsoY],[15,torsoY],[16,18+bob],[7,18+bob]];
  p.poly(body,t.color);p.path(body,INK,1,true);p.line(8,torsoY+1,8,17+bob,t.trim);p.line(15,torsoY+2,15,17+bob,t.dark);
  p.rect(8,18+bob,8,4,t.color);p.line(7,18+bob,16,18+bob,t.trim);p.line(11,21+bob,11,22+bob,INK);
  p.rect(8,22+bob,3,1,t.trim);p.rect(13,22+bob,3,1,t.trim);
  p.rect(11,12+bob,1,4,t.trim);p.rect(10,12+bob,2,1,t.trim);p.rect(10,15+bob,3,1,t.trim);
  let left=[[7,torsoY+1],[4,14+bob],[7,17+bob]],right=[[16,torsoY+1],[19,14+bob],[20,19+bob]];
  if(pose==='run'){left=[[7,torsoY+1],[4,14+stride],[6,15+stride]];right=[[16,torsoY+1],[18,14-stride],[21,16-stride]];}
  if(pose==='shoot'){left=[[8,10],[6,5],[11,0]];right=[[15,10],[18,5],[15,0]];}
  if(pose==='jump'){left=[[8,10],[4,4],[6,0]];right=[[15,10],[18,4],[17,0]];}
  if(pose==='reach'){left=[[7,10],[5,14],[8,16]];right=[[16,10],[20,11],[23,9]];}
  limb(left[0],left[1],skinDark,2);limb(left[1],left[2],skinLight,2);
  limb(right[0],right[1],skinLight,2);limb(right[1],right[2],skinLight,2);
  p.rect(10,7+bob,4,3,skinDark);
  p.rect(9,headY,7,6,INK);p.rect(10,headY+1,5,5,skinLight);p.rect(15,headY+3,2,2,skinLight);
  p.rect(9,headY,6,2,INK);p.rect(9,headY+1,2,3,INK);p.rect(14,headY+2,1,1,INK);p.rect(14,headY+5,2,1,skinDark);
}

function drawCourt(p){
  const project=(x,y)=>[16+x+(1-y/204)*28,2+y*0.63];
  p.rect(0,0,544,146,'#16399c');
  const floor=[project(0,0),project(480,0),project(480,204),project(0,204)];
  p.poly(floor,'#f6a43b');
  const rng=new Random(88091);
  for(let y=0;y<=204;y+=8){
    p.line(...project(0,y),...project(480,y),'#bb6625');
    if(y%16===0)p.line(...project(0,y+1.7),...project(480,y+1.7),'#ffd174');
    for(let x=28+rng.int(45);x<480;x+=rng.range(66,100)){
      p.line(...project(x,y+2),...project(x,y+6),'#d18732');
      const pt=project(x+4,y+4);p.rect(pt[0],pt[1],2,1,'#f7c365');
    }
  }
  for(const right of [false,true]){
    const mx=x=>right?480-x:x;
    const key=[project(mx(0),66),project(mx(88),66),project(mx(88),138),project(mx(0),138)];
    p.poly(key,'#193c9f');p.path(key,'#fff0c2',2,true);
    const circle=[];for(let a=0;a<Math.PI*2+0.08;a+=0.07)circle.push(project(mx(88+29*Math.cos(a)),102+29*Math.sin(a)));
    p.path(circle,'#fff0c2',1);
    const arc=[];
    const start=Math.asin(86/112);
    for(let a=-start;a<=start+0.01;a+=0.035)arc.push(project(mx(24+112*Math.cos(a)),102+112*Math.sin(a)));
    p.path(arc,'#213b76',2);
    p.line(...project(mx(0),16),...project(mx(24+Math.sqrt(112*112-86*86)),16),'#213b76',2);
    p.line(...project(mx(0),188),...project(mx(24+Math.sqrt(112*112-86*86)),188),'#213b76',2);
    for(let y=68;y<138;y+=14)p.line(...project(mx(0),y),...project(mx(5),y),'#fff0c2',2);
  }
  p.line(...project(240,0),...project(240,204),'#fff0c2',2);
  const center=[];for(let a=0;a<Math.PI*2+0.08;a+=0.05)center.push(project(240+29*Math.cos(a),102+29*Math.sin(a)));
  p.poly(center,'#193c9f');p.path(center,'#fff0c2',1,true);
  const cp=project(240,102);p.text('DD',cp[0]-11,cp[1]-6,'#ffdd9a',2);
  p.path(floor,'#fff2c6',2,true);
  p.rect(249,0,29,2,'#fff2c6');p.rect(244,132,29,2,'#fff2c6');
  p.text('DOUBLE DRIBBLE',241,138,'#c9d6fa',1);
}

function drawCrowd(p,frame){
  const rng=new Random(1937);p.rect(0,0,544,39,'#14225d');
  const shirts=['#d9d9b3','#e76334','#3e65b0','#13362c','#eaa844','#7e506b','#b5bdcc'];
  for(let row=0;row<3;row++){
    const y=row*9+1;
    p.rect(0,y+6,544,1,'#060f36');
    for(let x=-5+(row%2)*4;x<544;x+=9){
      const tone=['#efb278','#c98950','#704333'][rng.int(3)],shirt=shirts[rng.int(shirts.length)];
      p.rect(x+2,y,3,1,'#101023');p.rect(x+2,y+1,3,3,tone);p.rect(x+1,y+4,5,4,shirt);
      p.rect(x+3,y+7,2,2,'#101b49');
      const cheer=(rng.int(4)===0 && frame===1);
      if(cheer){p.line(x,y+4,x-1,y+1,tone);p.line(x+6,y+4,x+7,y+1,tone);}
      else {p.rect(x,y+4,1,3,tone);p.rect(x+6,y+4,1,3,tone);}
    }
  }
  p.rect(0,29,544,10,'#122d85');p.line(0,38,543,38,'#fff0c2');
  p.text('DOUBLE DRIBBLE',43,30,'#fff0cf');p.text('HOME COURT',198,30,'#f8ba66');p.text('BASKETBALL',347,30,'#fff0cf');
}

function drawBasket(p,right=false){
  const pts=arr=>arr.map(([x,y])=>[right?35-x:x,y]);
  p.path(pts([[4,18],[4,54],[10,56]]),'#151936',5);p.path(pts([[4,18],[4,54],[10,56]]),'#d1dbda',3);
  const board=pts([[2,1],[19,7],[19,27],[2,21]]);
  p.poly(board,'#f0eee0');p.path(board,'#131c45',1,true);
  p.path(pts([[7,9],[15,12],[15,22],[7,19],[7,9]]),'#cc4938',1);
  p.line(...pts([[5,20]])[0],...pts([[22,24]])[0],'#eff1e4',2);
  const cx=right?11:24;
  p.ellipse(cx,25,8,3,'#131b40',false,1);
  p.path(pts([[18,27],[21,36],[28,36],[31,27]]),'#f9ebd8',1);
  p.line(...pts([[20,29]])[0],...pts([[29,34]])[0],'#f9ebd8');
  p.line(...pts([[29,29]])[0],...pts([[21,34]])[0],'#f9ebd8');
  p.ellipse(cx,25,7,2,'#ed7847',false,1);
}

function drawHero(p,team,style,frame){
  const t=TEAMS[team],skin='#efae76',shade='#ad6247';
  const limb=(points,color,width)=>{p.path(points,INK,width+3);p.path(points,color,width);};
  const bend=frame===2?5:0;
  limb([[25,61],[13,78],[9+bend,98]],shade,7);
  limb([[38,61],[45,80],[57-bend,86]],skin,8);
  p.poly([[5+bend,95],[14+bend,96],[17+bend,102],[4+bend,103],[1+bend,101]],'#f0e6d6');
  p.path([[5+bend,95],[14+bend,96],[17+bend,102],[4+bend,103],[1+bend,101]],INK,1,true);
  p.rect(7+bend,94,6,3,t.trim);
  p.poly([[54-bend,81],[61-bend,85],[61-bend,91],[51-bend,90]],'#f0e6d6');p.path([[54-bend,81],[61-bend,85],[61-bend,91],[51-bend,90]],INK,1,true);
  p.poly([[22,34],[38,33],[45,60],[20,61]],t.color);p.path([[22,34],[38,33],[45,60],[20,61]],INK,2,true);
  p.poly([[20,55],[43,55],[45,67],[34,69],[31,62],[28,69],[18,67]],t.color);p.path([[20,55],[43,55],[45,67],[34,69],[31,62],[28,69],[18,67]],INK,1,true);
  p.line(21,55,42,55,t.trim,3);p.line(21,38,22,52,t.trim,2);p.line(39,39,41,52,t.dark,3);
  p.text(style===0?'7':style===1?'9':'4',28,42,t.trim,1);
  p.line(20,65,28,66,t.trim,2);p.line(35,66,44,65,t.trim,2);
  let arm1=[[22,36],[15,21],[24,8]],arm2=[[38,36],[40,17],[34,7]];
  if(style===1){arm1=[[22,36],[8,40],[3,27]];arm2=[[38,36],[46,16],[40,4]];}
  if(style===2){arm1=[[22,36],[17,17],[8,9]];arm2=[[38,36],[45,21],[29,8]];}
  if(frame===2){arm1=[[22,36],[23,18],[42,7]];arm2=[[38,36],[48,22],[48,5]];}
  limb(arm1,shade,6);limb(arm2,skin,6);
  p.rect(26,26,9,10,shade);
  p.poly([[25,11],[36,11],[40,20],[38,28],[26,29],[22,23],[22,16]],skin);
  p.path([[25,11],[36,11],[40,20],[38,28],[26,29],[22,23],[22,16]],INK,1,true);
  p.poly([[23,12],[27,9],[37,10],[38,15],[28,15],[25,20],[22,19]],INK);
  p.rect(33,18,2,2,INK);p.rect(38,21,3,2,skin);p.line(33,26,37,26,shade);
  p.rect(27,25,3,2,shade);p.line(23,41,25,49,'#ffffff',1);
}

export function makeAtlas(){
  const a=new SpriteAtlas(2048);
  a.add('white',1,1,p=>p.rect(0,0,1,1,'#ffffff'));
  for(const [ch,rows] of Object.entries(GLYPHS))a.add('font-'+ch,5,7,p=>{for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(rows[y][x]==='1')p.rect(x,y,1,1,'#ffffff');});
  a.add('court',544,146,drawCourt);
  for(let frame=0;frame<2;frame++)a.add('crowd-'+frame,544,39,p=>drawCrowd(p,frame));
  for(let team=0;team<4;team++)for(let skin=0;skin<3;skin++)for(const pose of ['idle','run','shoot','jump','reach'])for(let frame=0;frame<(pose==='run'?4:1);frame++){
    a.add(`player-${team}-${skin}-${pose}-${frame}`,25,35,p=>drawAthlete(p,team,skin,pose,frame));
  }
  for(let team=0;team<4;team++)for(let style=0;style<3;style++)for(let frame=0;frame<3;frame++)a.add(`hero-${team}-${style}-${frame}`,66,108,p=>drawHero(p,team,style,frame));
  for(const right of [false,true])a.add('basket-'+(right?1:0),36,58,p=>drawBasket(p,right));
  a.add('shadow',17,5,p=>p.ellipse(8,2,8,2,'#342d48'));
  a.add('ball-shadow',7,3,p=>p.ellipse(3,1,3,1,'#342d48'));
  a.add('ball',9,9,p=>{p.ellipse(4,4,4,4,INK);p.ellipse(4,4,3,3,'#f47636');p.line(1,4,7,4,'#93422a');p.path([[3,1],[5,3],[5,5],[3,7]],'#93422a');p.rect(2,2,2,1,'#ffc068');});
  a.add('big-ball',22,22,p=>{p.ellipse(11,11,10,10,INK);p.ellipse(11,11,9,9,'#df6b33');p.ellipse(9,8,7,6,'#fa9847');p.line(2,11,20,11,INK);p.path([[7,2],[12,6],[14,11],[12,16],[7,20]],INK);p.path([[14,2],[8,7],[7,12],[10,18]],'#8d3b2b');});
  a.add('selected',20,7,p=>p.ellipse(10,3,9,3,'#f8f4c5',false));
  a.add('marker',7,4,p=>{p.rect(0,0,7,1,'#fff7d3');p.rect(1,1,5,1,'#fff7d3');p.rect(2,2,3,1,'#fff7d3');p.rect(3,3,1,1,'#fff7d3');});
  a.add('referee',22,35,p=>{
    drawAthlete(p,1,1,'idle',0);for(let x=7;x<17;x+=2)p.line(x,11,x,18,INK);p.rect(8,20,9,3,INK);
  });
  for(let rank=0;rank<3;rank++)a.add('trophy-'+rank,48,61,p=>{
    const c=['#bb7847','#b9c7dc','#f8c953'][rank],light=['#e7a766','#f0f6fd','#fff2a0'][rank];
    p.path([[8,7],[3,7],[3,20],[12,26]],c,4);p.path([[39,7],[44,7],[44,20],[35,26]],c,4);
    p.poly([[10,2],[37,2],[36,24],[29,34],[25,37],[22,37],[15,33],[11,23]],c);p.path([[10,2],[37,2],[36,24],[29,34],[25,37],[22,37],[15,33],[11,23]],INK,1,true);
    p.rect(14,4,4,19,light);p.line(11,2,37,2,light,2);p.rect(21,36,6,13,c);p.rect(16,48,16,4,light);p.rect(11,52,26,5,c);p.rect(7,57,34,4,'#ad733b');
    p.text('1',21,13,light,1);
  });
  return a;
}
