// Finish Generator v1 — shared module (Tracer, Studio, My Wally gear mint). Browser ES module on three.js.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export const FINISH_VERSION = 'finish-v1';   // NEVER change tables under this tag after first mint.

// ---------- keccak256 (BigInt, tiny, deterministic) ----------
const RC=[0x1n,0x8082n,0x800000000000808an,0x8000000080008000n,0x808bn,0x80000001n,0x8000000080008081n,0x8000000000008009n,0x8an,0x88n,0x80008009n,0x8000000an,0x8000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,0x8000000000008002n,0x8000000000000080n,0x800an,0x800000008000000an,0x8000000080008081n,0x8000000000008080n,0x80000001n,0x8000000080008008n];
const ROT=[0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14];
const M=(1n<<64n)-1n, rl=(x,n)=>n?((x<<BigInt(n))|(x>>BigInt(64-n)))&M:x;
function f(A){for(let r=0;r<24;r++){const C=[0,1,2,3,4].map(x=>A[x]^A[x+5]^A[x+10]^A[x+15]^A[x+20]);
 for(let x=0;x<5;x++){const D=C[(x+4)%5]^rl(C[(x+1)%5],1);for(let y=0;y<25;y+=5)A[y+x]^=D;}
 const B=new Array(25);for(let x=0;x<5;x++)for(let y=0;y<5;y++)B[y+5*((2*x+3*y)%5)]=rl(A[x+5*y],ROT[x+5*y]);
 for(let x=0;x<5;x++)for(let y=0;y<5;y++)A[x+5*y]=B[x+5*y]^((~B[(x+1)%5+5*y])&M&B[(x+2)%5+5*y]);A[0]^=RC[r];}}
export function keccak256(bytes){const rate=136,p=new Uint8Array(Math.ceil((bytes.length+1)/rate)*rate);p.set(bytes);p[bytes.length]^=1;p[p.length-1]^=0x80;
 const A=new Array(25).fill(0n);for(let o=0;o<p.length;o+=rate){for(let i=0;i<17;i++){let v=0n;for(let b=7;b>=0;b--)v=(v<<8n)|BigInt(p[o+i*8+b]);A[i]^=v;}f(A);}
 const out=new Uint8Array(32);for(let i=0;i<4;i++)for(let b=0;b<8;b++)out[i*8+b]=Number((A[i]>>BigInt(8*b))&0xffn);return out;}
const utf8=s=>new TextEncoder().encode(s), cat=(a,b)=>{const c=new Uint8Array(a.length+b.length);c.set(a);c.set(b,a.length);return c;};
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
export function normAddress(a){a=String(a).trim().toLowerCase();if(!/^0x[0-9a-f]{40}$/.test(a))throw new Error('need 0x + 40 hex address');return a;}
export function addrBytes(a){const h=normAddress(a).slice(2);return Uint8Array.from(h.match(/../g),x=>parseInt(x,16));}

// ---------- tables (weights; Prophet-only entries marked) ----------
export const TIERS=[['Rust',4000],['Iron',2500],['Brass',1700],['Steel',1000],['Gold',530],['Relic',200],['Prophet',70]]; // same as gear-v2 bytes 0-1
export const FAMILIES={
 'Rusted Iron':{color:'#8a4a26',metal:[.55,.8],rough:[.7,.95]},
 'Iron':{color:'#6b6f76',metal:[.85,1],rough:[.45,.7]},
 'Gunmetal':{color:'#3c4048',metal:[.9,1],rough:[.3,.5]},
 'Steel':{color:'#b4bcc8',metal:[.95,1],rough:[.15,.35]},
 'Brass':{color:'#c9a227',metal:[.95,1],rough:[.2,.4]},
 'Bronze':{color:'#9c6a32',metal:[.9,1],rough:[.3,.5]},
 'Copper':{color:'#c46a3c',metal:[.95,1],rough:[.2,.4]},
 'Gold':{color:'#ffcc44',metal:[1,1],rough:[.08,.25]},
 'Bone & Stone':{color:'#d8ccb0',metal:[0,.05],rough:[.6,.9]},
 'Prophet Voidglass':{color:'#2a0a55',metal:[.3,.6],rough:[.05,.2]},   // Prophet only
};
export const FAMILY_BY_TIER={
 Rust:[['Rusted Iron',60],['Iron',20],['Copper',12],['Bronze',8]],
 Iron:[['Iron',45],['Gunmetal',30],['Rusted Iron',15],['Steel',10]],
 Brass:[['Brass',55],['Bronze',25],['Copper',20]],
 Steel:[['Steel',50],['Gunmetal',30],['Brass',10],['Copper',10]],
 Gold:[['Gold',70],['Brass',15],['Copper',15]],
 Relic:[['Bone & Stone',45],['Bronze',30],['Gold',25]],
 Prophet:[['Prophet Voidglass',100]],
};
// 7 palettes per family: [hue shift deg, saturation mul, lightness mul]
export const PALETTES=[['Native',0,1,1,30],['Ember',-12,1.2,1,15],['Frost',6,.55,1.12,15],['Smoke',0,.4,.8,12],['Bloom',-25,1.3,1.05,12],['Verdigris',60,.9,.95,9],['Seventh',180,1.2,1,7]];
export const PATTERNS={ // [pattern, weight]
 base:[['Brushed',22],['Hammered',16],['Pitted Rust',14],['Patina',12],['Heat Tint',12],['Swirl',10],['Damascus',8],['Circuit',6]],
 Prophet:[['Seven Rings',50],['Swirl',20],['Damascus',15],['Circuit',15]], // Seven Rings = Prophet only
};
export const SHEEN_BY_TIER={
 Rust:[['None',70],['Clearcoat',20],['Sheen',10]],
 Iron:[['None',55],['Clearcoat',30],['Sheen',10],['Oil Slick',5]],
 Brass:[['None',40],['Clearcoat',35],['Oil Slick',15],['Sheen',10]],
 Steel:[['None',30],['Clearcoat',30],['Oil Slick',30],['Sheen',10]],
 Gold:[['Clearcoat',40],['Oil Slick',40],['Emissive Glow',20]],
 Relic:[['Oil Slick',40],['Emissive Glow',35],['Sheen',25]],
 Prophet:[['Seventh Halo',100]], // oil slick + glow, Prophet only
};
export const WEAR=[['Mint',30],['Light',35],['Worn',25],['Ancient',10]];
const WEAR_AMT={Mint:0,Light:.25,Worn:.55,Ancient:.85};
const IRIDESCENCE={ior:[1.3,1.8],thick:[100,800]}; // nm, set ranges
const SHEENS=Object.fromEntries(Object.entries(SHEEN_BY_TIER).flatMap(([,v])=>v.map(x=>[x[0],1])));

function pick(u,t){let tot=t.reduce((s,x)=>s+x[1],0),x=u*tot;for(const [v,w] of t){if(x<w)return v;x-=w;}return t[t.length-1][0];}
const lerp=(r,u)=>+(r[0]+(r[1]-r[0])*u).toFixed(4);
export function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// ---------- seeds ----------
export function seedFor(address){
 const H1=keccak256(addrBytes(address));
 const F=keccak256(cat(H1,utf8(FINISH_VERSION)));   // finish bytes, independent of gear-v2's H2
 return {H1,F};
}
export function tierFromAddress(address){const {H1}=seedFor(address);return pick(((H1[0]<<8)|H1[1])/65536,TIERS);}

/** createFinish({seed:address | random:true, tier?, overrides?}) -> plain JSON finish */
export function createFinish({seed,random=false,tier,overrides={}}={}){
 let F,source;
 if(random||!seed){F=crypto.getRandomValues(new Uint8Array(32));source='dice';}
 else if(/^0x[0-9a-fA-F]{40}$/.test(String(seed).trim())){const s=seedFor(seed);F=s.F;tier=tier||pick(((s.H1[0]<<8)|s.H1[1])/65536,TIERS);source='address';}
 else {F=keccak256(cat(utf8(String(seed)),utf8(FINISH_VERSION)));source='text';}
 const u=i=>((F[i]<<8)|F[i+1])/65536;
 if(!tier)tier=pick(u(30),TIERS);
 const P=tier==='Prophet';
 const family=pick(u(0),FAMILY_BY_TIER[tier]);
 let palette=pick(u(2),PALETTES.map(p=>[p[0],p[4]]));
 if(palette==='Seventh'&&!P&&tier!=='Relic')palette='Native';
 if(P)palette=F[26]%7===0?'Seventh':'Native'; // Seventh palette: Relic/Prophet only
 const pattern=pick(u(4),P?PATTERNS.Prophet:PATTERNS.base);
 const sheen=pick(u(6),SHEEN_BY_TIER[tier]);
 const wear=P?'Mint':pick(u(8),WEAR);
 const fam=FAMILIES[family];
 const fin={version:FINISH_VERSION,source,tier,family,palette,pattern,sheen,wear,
  roughness:lerp(fam.rough,u(10)),metalness:lerp(fam.metal,u(12)),
  iridescenceIOR:(sheen==='Oil Slick'||sheen==='Seventh Halo')?lerp(IRIDESCENCE.ior,u(14)):null,
  iridescenceThickness:(sheen==='Oil Slick'||sheen==='Seventh Halo')?Math.round(lerp(IRIDESCENCE.thick,u(16))):null,
  textureSeed:((F[18]<<24)|(F[19]<<16)|(F[20]<<8)|F[21])>>>0,
  patternScale:+(0.6+u(22)*0.9).toFixed(3), patternAngle:Math.round(u(24)*360),
  textureSize:512};
 fin.baseColor=paletteColor(fam.color,palette);
 fin.glowColor=P?'#b06cff':(sheen==='Emissive Glow'?shift('#ffb040',PALETTES.find(p=>p[0]===palette)[1]):null);
 Object.assign(fin,overrides);
 fin.id=hex(keccak256(utf8(JSON.stringify(canonical(fin))))).slice(0,16); // finish fingerprint
 return fin;
}
function canonical(f){const o={};for(const k of Object.keys(f).sort())if(k!=='id'&&k!=='source')o[k]=f[k];return o;}
function shift(c,dh){const col=new THREE.Color(c),h={};col.getHSL(h);col.setHSL((h.h+dh/360+1)%1,h.s,h.l);return '#'+col.getHexString();}
function paletteColor(c,name){const p=PALETTES.find(x=>x[0]===name);const col=new THREE.Color(c),h={};col.getHSL(h);
 col.setHSL((h.h+p[1]/360+1)%1,Math.min(.75,h.s*p[2]),Math.min(.95,h.l*p[3]));return '#'+col.getHexString();}

// ---------- procedural canvas textures ----------
function vnoise(rand,n=64){const g=new Float32Array(n*n).map(()=>rand());return(x,y)=>{x=((x%n)+n)%n;y=((y%n)+n)%n;const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,
 s=t=>t*t*(3-2*t),a=g[yi*n+xi],b=g[yi*n+(xi+1)%n],c=g[((yi+1)%n)*n+xi],d=g[((yi+1)%n)*n+(xi+1)%n];return a+(b-a)*s(fx)+(c-a)*s(fy)+(a-b-c+d)*s(fx)*s(fy);};}
function fbm(N,x,y,o=4){let v=0,a=.5,f=1;for(let i=0;i<o;i++){v+=a*N(x*f,y*f);f*=2;a*=.5;}return v;}
export function makeTextures(fin){
 const S=fin.textureSize,rand=mulberry32(fin.textureSeed),N=vnoise(rand),N2=vnoise(rand);
 const base=new THREE.Color(fin.baseColor),glow=fin.glowColor?new THREE.Color(fin.glowColor):null;
 const cv=document.createElement('canvas');cv.width=cv.height=S;const cx=cv.getContext('2d'),img=cx.createImageData(S,S);
 const rv=document.createElement('canvas');rv.width=rv.height=S;const rx=rv.getContext('2d'),rimg=rx.createImageData(S,S);
 const ev=glow?document.createElement('canvas'):null;let eimg,ex;if(ev){ev.width=ev.height=S;ex=ev.getContext('2d');eimg=ex.createImageData(S,S);}
 const ang=fin.patternAngle*Math.PI/180,ca=Math.cos(ang),sa=Math.sin(ang),sc=fin.patternScale,W=WEAR_AMT[fin.wear]||0;
 const rust=new THREE.Color('#5a2a12'),pat=new THREE.Color('#3fa58c'),tmp=new THREE.Color();
 for(let y=0;y<S;y++)for(let x=0;x<S;x++){
  const u=x/S,v=y/S,ru=(u*ca-v*sa)*sc,rv2=(u*sa+v*ca)*sc;let k=1,r=0,e=0;tmp.copy(base);
  const n=fbm(N,u*16,v*16);
  switch(fin.pattern){
   case 'Brushed':k=.85+.3*N(ru*400,rv2*4);r=-.1;break;
   case 'Hammered':{const d=fbm(N2,ru*28,rv2*28,2);k=.8+.4*Math.abs(Math.sin(d*12));break;}
   case 'Pitted Rust':{const m=fbm(N2,u*24,v*24);tmp.lerp(rust,Math.min(1,Math.max(0,(m-.4)*2.5)));k=.8+.35*n;r=.25*m;break;}
   case 'Patina':{const m=fbm(N2,u*10,v*10);tmp.lerp(pat,Math.max(0,(m-.45)*2));r=.3*m;break;}
   case 'Heat Tint':{const t=(Math.sin((ru+rv2)*9+n*3)+1)/2;tmp.offsetHSL(t*.16-.08,.1,(t-.5)*.1);break;}
   case 'Swirl':{const a=Math.atan2(v-.5,u-.5),d=Math.hypot(u-.5,v-.5);tmp.offsetHSL(Math.sin(a*3+d*30*sc+n*4)*.05,.05,Math.sin(a*3+d*30*sc+n*4)*.06);k=.9+.2*n;break;}
   case 'Damascus':{const t=Math.sin(rv2*60+fbm(N2,ru*6,rv2*6)*14);k=.7+.3*(t*.5+.5);break;}
   case 'Circuit':{const g=40*sc,gx=(ru*g)%1,gy=(rv2*g)%1,cell=N2(Math.floor(ru*g),Math.floor(rv2*g));
     const line=(cell>.5?Math.abs(gx-.5)<.06:Math.abs(gy-.5)<.06)&&cell>.25;if(line){k=1.35;e=1;r=-.2;}else k=.85;break;}
   case 'Seven Rings':{const d=Math.hypot(u-.5,v-.5)*14*sc,a=Math.atan2(v-.5,u-.5);const ring=Math.abs((d%1)-.5)<.07;
     const glyph=Math.abs(Math.sin(a*7*Math.ceil(d)))>.8;if(ring||(glyph&&(d%1)<.3)){e=1;k=1.4;}tmp.offsetHSL(Math.sin(a*7)*.06,0,0);break;}
  }
  // wear: grime in noise cavities + bright scuffs
  const g=fbm(N2,u*40,v*40,3);k*=1-W*.35*Math.max(0,g-.45)*2;if(W&&N(u*90,v*90)>1-W*.15)k*=1.3;r+=W*.2*g;
  if(fin.tier==='Prophet')e=Math.max(e,.18*fbm(N2,u*6,v*6));
  const i=(y*S+x)*4;img.data[i]=Math.min(255,tmp.r*k*255);img.data[i+1]=Math.min(255,tmp.g*k*255);img.data[i+2]=Math.min(255,tmp.b*k*255);img.data[i+3]=255;
  rimg.data[i]=0;rimg.data[i+1]=Math.max(0,Math.min(255,(fin.roughness+r+.08*(n-.5))*255));rimg.data[i+2]=fin.metalness*255;rimg.data[i+3]=255;
  if(ev){const gl=fin.sheen==='Emissive Glow'?Math.max(e,.15*n):(fin.tier==='Prophet'||fin.pattern==='Circuit'?e:0);eimg.data[i]=glow.r*gl*255;eimg.data[i+1]=glow.g*gl*255;eimg.data[i+2]=glow.b*gl*255;eimg.data[i+3]=255;}
 }
 cx.putImageData(img,0,0);rx.putImageData(rimg,0,0);if(ev)ex.putImageData(eimg,0,0);
 const mk=(c,srgb)=>{const t=new THREE.CanvasTexture(c);t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.flipY=false;t.userData.mimeType='image/jpeg';return t;};
 return {map:mk(cv,true),roughnessMap:mk(rv,false),emissiveMap:ev?mk(ev,true):null};
}

export function makeMaterial(fin){
 const t=makeTextures(fin);
 const m=new THREE.MeshPhysicalMaterial({color:0xffffff,map:t.map,metalness:1,roughness:1,roughnessMap:t.roughnessMap,metalnessMap:t.roughnessMap});
 if(t.emissiveMap){m.emissive=new THREE.Color(0xffffff);m.emissiveMap=t.emissiveMap;m.emissiveIntensity=fin.tier==='Prophet'?2:1.2;}
 if(fin.iridescenceIOR){m.iridescence=1;m.iridescenceIOR=fin.iridescenceIOR;m.iridescenceThicknessRange=[fin.iridescenceThickness*.4,fin.iridescenceThickness];}
 if(fin.sheen==='Clearcoat'){m.clearcoat=1;m.clearcoatRoughness=.08;}
 if(fin.sheen==='Sheen'){m.sheen=1;m.sheenRoughness=.4;m.sheenColor=new THREE.Color(fin.baseColor).offsetHSL(0,0,.2);}
 m.name=`${fin.family} / ${fin.pattern} / ${fin.sheen} [${fin.id}]`;m.userData.finish=fin;return m;
}

// ---------- UV projection for generated meshes ----------
export function projectUVs(geom,mode='box',scale=1){
 let g=geom.index?geom.toNonIndexed():geom;g.computeBoundingBox();const bb=g.boundingBox,sz=new THREE.Vector3();bb.getSize(sz);const L=Math.max(sz.x,sz.y,sz.z)/scale||1;
 const p=g.attributes.position,uv=new Float32Array(p.count*2),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),nn=new THREE.Vector3();
 for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);nn.subVectors(c,b).cross(a.clone().sub(b)).normalize();
  const ax=Math.abs(nn.x),ay=Math.abs(nn.y),az=Math.abs(nn.z);
  for(let j=0;j<3;j++){const v=[a,b,c][j];let U,V;
   if(mode==='cylindrical'&&az<.7){U=(Math.atan2(v.y,v.x)/(2*Math.PI)+.5)*4;V=(v.z-bb.min.z)/L;}
   else if(mode==='planar'||az>=ax&&az>=ay){U=(v.x-bb.min.x)/L;V=(v.y-bb.min.y)/L;}
   else if(ax>=ay){U=(v.y-bb.min.y)/L;V=(v.z-bb.min.z)/L;} else {U=(v.x-bb.min.x)/L;V=(v.z-bb.min.z)/L;}
   uv[(i+j)*2]=U;uv[(i+j)*2+1]=V;}}
 g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.computeVertexNormals();return g;
}

/** applyFinish(object3D, finish, {uv:'box'|'cylindrical'|'planar'|'keep'}) */
export function applyFinish(obj,fin,{uv='box'}={}){
 const mat=makeMaterial(fin);
 obj.traverse(o=>{if(!o.isMesh)return;if(uv!=='keep'||!o.geometry.attributes.uv)o.geometry=projectUVs(o.geometry,uv==='keep'?'box':uv);o.material=mat;});
 obj.userData.finish=fin;return obj;
}

/** exportGLB(object3D) -> Promise<ArrayBuffer>. Finish JSON goes into asset extras. */
export async function exportGLB(obj){
 const ex=new GLTFExporter();
 return await ex.parseAsync(obj,{binary:true,maxTextureSize:1024});
}

// ---------- simple JS gear (stand-in for the gear-v2 port) ----------
export function gearForAddress(address){
 const {H1}=seedFor(address),u=i=>((H1[i]<<8)|H1[i+1])/65536;const tier=pick(u(0),TIERS);
 const common=[...Array(27)].map((_,i)=>14+i).filter(n=>n!==21&&n!==35);
 const z=tier==='Prophet'?[21,28,35][H1[4]%3]:common[Math.floor(u(4)*common.length)];
 let arms=tier==='Prophet'?7:3+H1[8]%6;if(arms===7&&tier!=='Prophet')arms=H1[9]&1?6:8;return buildGear({teeth:z,arms,tier});
}
export function buildGear({teeth=26,arms=5,tier='Rust'}={}){
 const m=teeth<=22?2.5:teeth<=28?2:1.5,R=m*teeth/2,Ra=R+m,Rf=R-1.25*m,sh=new THREE.Shape();
 for(let i=0;i<teeth;i++){const a=i/teeth*Math.PI*2,w=Math.PI/teeth;
  const pts=[[Rf,a-w*.55],[Ra,a-w*.3],[Ra,a+w*.3],[Rf,a+w*.55]];pts.forEach(([r,t],k)=>{const x=r*Math.cos(t),y=r*Math.sin(t);i===0&&k===0?sh.moveTo(x,y):sh.lineTo(x,y);});}
 const rimIn=Rf-3,hub=Math.max(6,R*.28);
 for(let k=0;k<arms;k++){const a0=k/arms*Math.PI*2,a1=(k+1)/arms*Math.PI*2,gap=(a1-a0)*.16;const h=new THREE.Path();
  h.absarc(0,0,rimIn,a1-gap,a0+gap,true);h.absarc(0,0,hub+2,a0+gap*1.6,a1-gap*1.6,false);h.closePath();sh.holes.push(h);}
 const bore=new THREE.Path(),bs=tier==='Prophet'?14:4;const br=hub*.5;
 for(let i=0;i<bs;i++){const t=i/bs*Math.PI*2,r=tier==='Prophet'?(i%2?br*.55:br):br;i?bore.lineTo(r*Math.cos(t),r*Math.sin(t)):bore.moveTo(r*Math.cos(t),r*Math.sin(t));}
 bore.closePath();sh.holes.push(bore);
 const g=new THREE.ExtrudeGeometry(sh,{depth:8,bevelEnabled:true,bevelThickness:.6,bevelSize:.5,bevelSegments:2,curveSegments:24});
 g.translate(0,0,-4);g.rotateX(-Math.PI/2);g.scale(.001,.001,.001); // metres, flat on XZ
 const mesh=new THREE.Mesh(g);mesh.name=`gear-${tier}-${teeth}`;return mesh;
}
