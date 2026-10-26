// Wallet Gear v3 — three.js mesh + finish. Builds in mm; buildGear() returns a Group scaled to metres for GLB.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './traits3.js';
import * as FG from './finish.js';
const TAU=Math.PI*2;
function polyPath(pts,P){pts.forEach((p,i)=>i?P.lineTo(p[0],p[1]):P.moveTo(p[0],p[1]));P.closePath();return P;}
function circlePts(r,n=40,cx=0,cy=0){return [...Array(n)].map((_,i)=>[cx+r*Math.cos(i/n*TAU),cy+r*Math.sin(i/n*TAU)]);}
function borePts(kind,r){
 if(kind==='Hex')return [...Array(6)].map((_,i)=>[r*Math.cos(i/6*TAU),r*Math.sin(i/6*TAU)]);
 if(kind==='Square'){const s=r*.85;return [[s,s],[-s,s],[-s,-s],[s,-s]];}
 if(kind==='Seven Star')return [...Array(14)].map((_,i)=>{const rr=i%2?r*.6:r*1.1,a=i/14*TAU+Math.PI/2;return [rr*Math.cos(a),rr*Math.sin(a)];});
 const c=circlePts(r,36);
 if(kind==='D-Shaft')return c.map(([x,y])=>[Math.min(x,r*.7),y]);
 if(kind==='Keyed'){const k=r*.3,a0=Math.asin(k/r),o=[];for(let i=0;i<=34;i++){const a=a0+(TAU-2*a0)*i/34;o.push([r*Math.cos(a),r*Math.sin(a)]);}o.push([r+1.2,-k],[r+1.2,k]);return o;}
 return c;}
const BORE_R=4;                       // 8 mm shaft
function hubR(z){return z===11?8:z===18?11:13;}
// window holes for metal webs
function webHoles(t,z,rimIn,hr){
 const H=[],n=t.arms,ph=t.phase*Math.PI/180;if(t.web==='Solid'||rimIn-hr<6)return H;
 const win=(a0,a1,r0,r1,tw=0)=>{const P=new THREE.Path(),s=10;const pts=[];for(let i=0;i<=s;i++){const a=a0+(a1-a0)*i/s;pts.push([r1*Math.cos(a+tw),r1*Math.sin(a+tw)]);}
  for(let i=s;i>=0;i--){const a=a0+(a1-a0)*i/s;pts.push([r0*Math.cos(a),r0*Math.sin(a)]);}return polyPath(pts,P);};
 const span=TAU/n;
 if(t.web==='Holes'){const rc=(rimIn+hr)/2,rr=Math.min((rimIn-hr)/2-1.6,rc*Math.sin(Math.PI/n)-1.6);for(let k=0;k<n;k++){const a=ph+k*span;H.push(polyPath(circlePts(rr,32,rc*Math.cos(a),rc*Math.sin(a)).reverse(),new THREE.Path()));}return H;}
 const arm={Spokes:.22,'Curved Spokes':.22,Kidney:.38,'Sun Rays':.3,Lattice:.25}[t.web]||.25;
 const parts=t.web==='Sun Rays'?n*2:n,sp=TAU/parts,g=sp*arm/2;
 for(let k=0;k<parts;k++){const a=ph+k*sp;
  if(t.web==='Lattice'&&rimIn-hr>=10){const mid=(rimIn+hr)/2;H.push(win(a+g,a+sp-g,hr+1.6,mid-.8));H.push(win(a+g+sp/2,a+sp-g+sp/2,mid+.8,rimIn));}
  else H.push(win(a+g,a+sp-g,hr+1.6,rimIn,t.web==='Curved Spokes'?t.twist*1.6:0));}
 return H;}
// tooth-coloured vertex colours: teeth get their colour by angle, everything else body colour
function paint(g,t,z,body){const p=g.attributes.position,c=new Float32Array(p.count*3),col=new THREE.Color(body);
 if(t.master&&g.userData.tooth!=null)col.set(z===t.teeth?t.toothColors[g.userData.tooth]:t.masterHex[(g.userData.tooth+3)%11]);
 for(let i=0;i<p.count;i++){c[i*3]=col.r;c[i*3+1]=col.g;c[i*3+2]=col.b;}g.setAttribute('color',new THREE.BufferAttribute(c,3));return g;}
function prep(g){g=g.index?g.toNonIndexed():g;for(const k of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(k))g.deleteAttribute(k);return g;}

/** gear body (one tooth count) as BufferGeometry in mm, z from z0 to z0+th */
export function gearBody(t,z,th,z0,{withWeb=true,spokes3D=true}={}){
 const {pts,rf}=T.toothOutline(z),sh=polyPath(pts,new THREE.Shape()),hr=hubR(z),rimIn=rf-4.2,BS=t.family==='Bone'||t.family==='Stone';
 sh.holes.push(polyPath(borePts(t.bore,BORE_R).reverse(),new THREE.Path()));
 const extra=[];
 if(withWeb&&BS&&z>11){ // open annulus, 3D bone / stone spokes
  const P=new THREE.Path();polyPath(circlePts(rimIn,72).reverse(),P);
  const sA=polyPath(pts,new THREE.Shape());sA.holes.push(P);const geoA=new THREE.ExtrudeGeometry(sA,{depth:th,bevelEnabled:false,curveSegments:24});
  const hs=new THREE.Shape();polyPath(circlePts(hr+1,48),hs);hs.holes.push(polyPath(borePts(t.bore,BORE_R).reverse(),new THREE.Path()));
  const geoH=new THREE.ExtrudeGeometry(hs,{depth:th,bevelEnabled:false});
  geoA.translate(0,0,z0);geoH.translate(0,0,z0);extra.push(geoA,geoH);
  extra.push(...spokeSet(t,hr,rimIn,th,z0));
  return extra;}
 for(const h of withWeb?webHoles(t,z,rimIn,hr):[])sh.holes.push(h);
 if(t.master&&!t._print){ // per-tooth solids (hard colour edges) + inner body disk
  const rr=rf-1.5,inner=polyPath(circlePts(rr,z*6),new THREE.Shape());inner.holes=sh.holes;
  const g2=new THREE.ExtrudeGeometry(inner,{depth:th,bevelEnabled:false,curveSegments:24});g2.translate(0,0,z0);g2.userData.body=true;
  const out=[g2];for(const tp of perTooth(z,rr)){const g=new THREE.ExtrudeGeometry(polyPath(tp.pts,new THREE.Shape()),{depth:th,bevelEnabled:false});g.translate(0,0,z0);g.userData.tooth=tp.k;out.push(g);}
  return out;}
 const g=new THREE.ExtrudeGeometry(sh,{depth:th,bevelEnabled:false,curveSegments:24});g.translate(0,0,z0);return [g];}
function perTooth(z,rr){const {pts,rf}=T.toothOutline(z),per=pts.length/z,flank=per-4,res=[];
 for(let k=0;k<z;k++){const c=TAU*k/z,b0=c-Math.PI/z,b1=c+Math.PI/z,prev=((k-1+z)%z)*per,P=[];
  P.push([rf*Math.cos(b0),rf*Math.sin(b0)]);for(const j of [2,3])P.push(pts[prev+flank+j].slice(0,2));
  for(let i=0;i<flank;i++)P.push(pts[k*per+i].slice(0,2));for(const j of [0,1])P.push(pts[k*per+flank+j].slice(0,2));
  P.push([rf*Math.cos(b1),rf*Math.sin(b1)]);for(let i=6;i>=0;i--){const a=b0+(b1-b0)*i/6;P.push([rr*Math.cos(a),rr*Math.sin(a)]);}
  res.push({k,pts:P});}
 return res;}
function spokeSet(t,hr,rimIn,th,z0){
 const out=[],n=t.arms,ph=t.phase*Math.PI/180,rand=FG.mulberry32(t.textureSeed),L=rimIn-hr+2,cz=z0+th/2;
 for(let k=0;k<n;k++){const a=ph+k*TAU/n,parts=[];
  if(t.family==='Bone'){const rad=Math.min(th*.32,2.6),shaft=new THREE.CylinderGeometry(rad*.8,rad*.8,L-rad*3,16,6);
   // pinch the middle of the shaft a little like a femur
   const p=shaft.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i)/(L/2),s=.85+.25*y*y;p.setX(i,p.getX(i)*s);p.setZ(i,p.getZ(i)*s);}
   parts.push(shaft);for(const e of [-1,1])for(const s of [-1,1]){const kb=new THREE.SphereGeometry(rad*1.05,16,12);kb.translate(s*rad*.75,e*(L/2-rad*1.2),0);parts.push(kb);}
   for(const g of parts){g.rotateZ(-Math.PI/2);g.translate((hr+rimIn)/2,0,0);g.rotateZ(a);g.translate(0,0,cz);out.push(g);}}
  else{const ns=Math.max(3,Math.round(L/ (th*.95)));for(let i=0;i<ns;i++){const rr=th*(.48+.12*rand()),s=new THREE.IcosahedronGeometry(rr,1),p=s.attributes.position;
    const sd=rand()*100;for(let j=0;j<p.count;j++){const h=Math.sin(Math.round(p.getX(j)*1e3)*12.9898+Math.round(p.getY(j)*1e3)*78.233+Math.round(p.getZ(j)*1e3)*37.719+sd)*43758.5453,f=.82+.3*(h-Math.floor(h));p.setXYZ(j,p.getX(j)*f*1.15,p.getY(j)*f,p.getZ(j)*f*.8);}   // chipped, flattened pebble
    s.rotateZ(rand()*TAU);const rpos=hr+1+(L-2)*(i+.5)/ns;s.translate(rpos*Math.cos(a),rpos*Math.sin(a),cz);out.push(s);}}}
 return out;}
function engraving(t,z,th,z0){const out=[],{rf}=T.toothOutline(z),r=Math.max(hubR(z)+2.5,rf-2.4),h=.5,ZZ=z0+th;
 const ring=(rr,w)=>{const s=new THREE.Shape();polyPath(circlePts(rr+w/2,96),s);s.holes.push(polyPath(circlePts(rr-w/2,96).reverse(),new THREE.Path()));const g=new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:false});g.translate(0,0,ZZ);return g;};
 const dot=(a,rr,d)=>{const g=new THREE.CylinderGeometry(d/2,d/2,h,16);g.rotateX(Math.PI/2);g.translate(rr*Math.cos(a),rr*Math.sin(a),ZZ+h/2);return g;};
 switch(t.engraving){case 'Groove':out.push(ring(r,1.2));break;case 'Twin Grooves':out.push(ring(r,1.2),ring(r-2.6,1.2));break;
  case 'Dot Ring':for(let k=0;k<z;k++)out.push(dot((k+.5)/z*TAU,r,1.4));break;
  case 'Ticks':for(let k=0;k<z;k++){const g=new THREE.BoxGeometry(2.4,1.2,h);g.translate(r,0,ZZ+h/2);g.rotateZ(k/z*TAU);out.push(g);}break;
  case 'Seven Seals':for(let k=0;k<7;k++)out.push(dot(k/7*TAU,r-.4,2.6));break;}
 return out;}
function hubGeo(t,z,th){if(t.hub==='Flush')return [];const r=hubR(z)+(t.hub==='Flanged'?2:0),h=t.hub==='Flanged'?2:4,s=new THREE.Shape();
 polyPath(t.hub==='Hex Boss'?[...Array(6)].map((_,i)=>[r*Math.cos(i/6*TAU),r*Math.sin(i/6*TAU)]):circlePts(r,48),s);s.holes.push(polyPath(borePts(t.bore,BORE_R).reverse(),new THREE.Path()));
 const g=new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:false});g.translate(0,0,-h);return [g];}

export function bodyColor(t){const fam=T.FAMILIES[t.family],c=new THREE.Color(fam.color);
 if(t.master)return '#'+c.lerp(new THREE.Color(T.MASTER_PINK),.35).getHexString();
 return '#'+c.lerp(new THREE.Color(t.colorHex),fam.tint).getHexString();}

/** raw solids in mm, Z-up (z=0 is the base gear's underside; hub boss hangs below). Each entry {g, z, part}. print:true = no per-tooth split */
export function gearParts(t,{print=false}={}){const th=t.thickness,top=t.stack==='Single'?null:+t.stack.split('+')[1],out=[],tt={...t,_print:print};
 const add=(gs,z,part)=>gs.forEach(g=>{const ud=g.userData;g=prep(g);g.userData=ud;out.push({g,z,part});});
 add(gearBody(tt,t.teeth,th,0),t.teeth,'base');add(hubGeo(t,t.teeth,th),t.teeth,'hub');
 const eng=engraving(t,t.teeth,th,0),er=Math.max(hubR(t.teeth)+2.5,T.toothOutline(t.teeth).rf-2.4);
 if(!top||er>T.od(top)/2+1)add(eng,t.teeth,'engraving');           // skip engraving buried under the stacked gear
 if(top)add(gearBody({...tt,web:'Solid',family:'_'},top,th,th,{withWeb:false}),top,'top');
 return out;}
/** render geometry (Y up, metres applied by caller) with vertex colours + uvs */
export function gearGeometry(t){const body=bodyColor(t);
 const parts=gearParts(t).map(({g,z})=>{const ud=g.userData;g=FG.projectUVs(g,'box');g.userData=ud;return paint(g,t,z,body);});
 const g=mergeGeometries(parts);g.rotateX(-Math.PI/2);g.computeVertexNormals();return g;}

export function material(t){
 const fin={...t,tier:t.tier,family:t.family,baseColor:t.master?'#ffffff':bodyColor(t),textureSize:512,
  glowColor:t.tier==='Prophet'?'#b06cff':(t.sheen==='Emissive Glow'?t.colorHex:null),id:t.serial};
 if(['Porous Ivory','Cracked Ivory','Granite','Slate'].includes(t.pattern)){fin.pattern='Hammered';}
 const m=FG.makeMaterial(fin);m.vertexColors=!!t.master;
 if(t.family==='Bone'||t.family==='Stone'){m.map=nonMetalTex(t,t.master?'#ffffff':bodyColor(t));m.metalnessMap=null;m.metalness=0;m.roughnessMap=null;m.roughness=t.roughness;}
 m.name=`gear-v3 ${t.family}/${t.pattern}/${t.sheen}`;return m;}
function nonMetalTex(t,base){const S=512,cv=document.createElement('canvas');cv.width=cv.height=S;const cx=cv.getContext('2d'),im=cx.createImageData(S,S),rand=FG.mulberry32(t.textureSeed);
 const g=new Float32Array(64*64).map(()=>rand()),N=(x,y)=>{x=((x%64)+64)%64;y=((y%64)+64)%64;const xi=x|0,yi=y|0,fx=x-xi,fy=y-yi,a=g[yi*64+xi],b=g[yi*64+(xi+1)%64],c=g[((yi+1)%64)*64+xi],d=g[((yi+1)%64)*64+(xi+1)%64];return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;};
 const fb=(x,y,o=4)=>{let v=0,A=.5,F=1;for(let i=0;i<o;i++){v+=A*N(x*F,y*F);F*=2;A*=.5;}return v;};const bc=new THREE.Color(base);
 for(let y=0;y<S;y++)for(let x=0;x<S;x++){const u=x/S*8,v=y/S*8;let k=1,cc=bc.clone();const n=fb(u*4,v*4);
  switch(t.pattern){case 'Porous Ivory':k=.85+.25*n;if(N(u*40,v*40)>.86)k*=.55;break;
   case 'Cracked Ivory':{k=.88+.2*n;const cr=Math.abs(fb(u*3,v*3,3)-.5);if(cr<.012)k*=.35;cc.offsetHSL(0,0,(fb(u,v)-.5)*.1);break;}
   case 'Granite':{const s=N(u*60,v*60);k=s>.8?1.35:s<.2?.45:.8+.3*n;break;}
   case 'Slate':{k=.75+.35*Math.abs(Math.sin(v*12+fb(u,v*.5)*6));cc.offsetHSL(.02,-.1,-.08);break;}}
  const i=(y*S+x)*4;im.data[i]=Math.min(255,cc.r*k*255);im.data[i+1]=Math.min(255,cc.g*k*255);im.data[i+2]=Math.min(255,cc.b*k*255);im.data[i+3]=255;}
 cx.putImageData(im,0,0);const tx=new THREE.CanvasTexture(cv);tx.colorSpace=THREE.SRGBColorSpace;tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.flipY=false;return tx;}

export function buildGearMM(t){const m=new THREE.Mesh(gearGeometry(t),material(t));m.name=t.name;m.userData.traits=t;return m;}
export function buildGear(t){const g=new THREE.Group(),m=buildGearMM(t);m.scale.setScalar(.001);g.add(m);g.name=t.name;g.userData.traits={...t,toothColors:undefined};return g;}
