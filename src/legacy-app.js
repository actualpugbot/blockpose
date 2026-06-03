import * as skinview3d from 'skinview3d';
import * as THREE from 'three';

/* ===================================================================
   BLOCKPOSE — Minecraft Skin Studio
   Engine: skinview3d (three.js) + a 2D compositor for filters/bg/export
   =================================================================== */
(function(){
"use strict";
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const D2R = Math.PI/180, R2D = 180/Math.PI;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ---- procedural grain texture (used in CSS + export) ---- */
const grainURL = (()=>{
  const c=document.createElement('canvas'); c.width=c.height=128;
  const x=c.getContext('2d'), img=x.createImageData(128,128), d=img.data;
  for(let i=0;i<d.length;i+=4){const v=Math.random()*255|0; d[i]=d[i+1]=d[i+2]=v; d[i+3]=22;}
  x.putImageData(img,0,0); return c.toDataURL();
})();
document.documentElement.style.setProperty('--grain-url', `url("${grainURL}")`);
const grainImg = new Image(); grainImg.src = grainURL;

/* ---- safe storage (degrades gracefully in sandboxes) ---- */
const store = (()=>{ try{const k='__bp_test';localStorage.setItem(k,'1');localStorage.removeItem(k);return localStorage;}catch(e){return null;} })();

/* ===================== STATE ===================== */
const PARTS = [
  {key:'head',  name:'Head',      ic:'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z'},
  {key:'body',  name:'Torso',     ic:'M8 4h8v9H8z'},
  {key:'rightArm', name:'Right arm', ic:'M9 4h4v14H9z'},
  {key:'leftArm',  name:'Left arm',  ic:'M11 4h4v14h-4z'},
  {key:'rightLeg', name:'Right leg', ic:'M9 4h4v14H9z'},
  {key:'leftLeg',  name:'Left leg',  ic:'M11 4h4v14h-4z'},
];
const ZERO = ()=>PARTS.reduce((o,p)=>(o[p.key]={x:0,y:0,z:0},o),{});
const JOINTS = [
  {key:'rightElbow', name:'Right elbow', part:'rightArm'},
  {key:'leftElbow',  name:'Left elbow',  part:'leftArm'},
  {key:'rightKnee',  name:'Right knee',  part:'rightLeg'},
  {key:'leftKnee',   name:'Left knee',   part:'leftLeg'},
];
const ZERO_JOINTS = ()=>JOINTS.reduce((o,j)=>(o[j.key]={x:0,y:0,z:0},o),{});
const LIGHTING = {
  ambientScale: 1.9,
  keyScale: 1.2,
  exposureDefault: 0.92,
  layerEmissive: 0.14,
};

const state = {
  viewer:null, model:'auto-detect', detected:'default', skinURL:null, hasSkin:false,
  curSrc:'name', anim:null, animSpeed:1,
  rig: ZERO(), joints: ZERO_JOINTS(), bodyYaw:0, bodyPitch:0,
  filters:{brightness:100,contrast:100,saturate:100,hue:0,sepia:0,grayscale:0,blur:0,vignette:0,grain:0},
  tint:{color:'#ff9d3c',amt:0},
  bg:{mode:'transparent', solid:'#1c1810', g1:'#f6a623', g2:'#1c1810', gAngle:180, chroma:'#00b140', img:null, fit:'cover'},
  amb:160, key:90, exposure:Math.round(LIGHTING.exposureDefault*100), cape:false, capeURL:null, elytra:false,
  render:{layerStyle:'3d', layerDepth:0.55},
  thumb:{on:false,title:'',sub:'',font:84,col:'#ffffff',out:'#16130d',outW:10,align:'left',mx:72,ms:100},
  exp:{fmt:'png-trans', aspect:'portrait', res:'2k'},
  poseLib: loadLib()
};

const SECOND_LAYER_PARTS = [
  {key:'head', width:8, height:8, depth:8, uv:()=>({u:32,v:0,w:8,h:8,d:8})},
  {key:'body', width:8, height:12, depth:4, uv:()=>({u:16,v:32,w:8,h:12,d:4})},
  {key:'rightArm', width:()=>isSlimModel()?3:4, height:12, depth:4, uv:()=>({u:40,v:32,w:isSlimModel()?3:4,h:12,d:4})},
  {key:'leftArm', width:()=>isSlimModel()?3:4, height:12, depth:4, uv:()=>({u:48,v:48,w:isSlimModel()?3:4,h:12,d:4})},
  {key:'rightLeg', width:4, height:12, depth:4, uv:()=>({u:0,v:32,w:4,h:12,d:4})},
  {key:'leftLeg', width:4, height:12, depth:4, uv:()=>({u:0,v:48,w:4,h:12,d:4})},
];
const SECOND_LAYER_FACES = [
  {name:'top', axis:'y', sign:1, rect:p=>({x:p.u+p.d,y:p.v,w:p.w,h:p.d})},
  {name:'bottom', axis:'y', sign:-1, rect:p=>({x:p.u+p.w+p.d,y:p.v,w:p.w,h:p.d})},
  {name:'left', axis:'x', sign:-1, rect:p=>({x:p.u,y:p.v+p.d,w:p.d,h:p.h})},
  {name:'front', axis:'z', sign:1, rect:p=>({x:p.u+p.d,y:p.v+p.d,w:p.w,h:p.h})},
  {name:'right', axis:'x', sign:1, rect:p=>({x:p.u+p.w+p.d,y:p.v+p.d,w:p.d,h:p.h})},
  {name:'back', axis:'z', sign:-1, rect:p=>({x:p.u+p.w+p.d*2,y:p.v+p.d,w:p.w,h:p.h})},
];
let secondLayerModel = null;
let segmentedRig = null;

/* ===================== ANIMATIONS ===================== */
const ANIMS = [
  {id:'idle', name:'Idle',  ic:'🧍', make:()=>new skinview3d.IdleAnimation()},
  {id:'walk', name:'Walk',  ic:'🚶', make:()=>new skinview3d.WalkingAnimation()},
  {id:'run',  name:'Run',   ic:'🏃', make:()=>new skinview3d.RunningAnimation()},
  {id:'fly',  name:'Fly',   ic:'🦸', make:()=>new skinview3d.FlyingAnimation()},
  {id:'wave', name:'Wave',  ic:'👋', make:()=>new skinview3d.WaveAnimation()},
  {id:'spin', name:'Turn',  ic:'Turn', make:()=>new skinview3d.FunctionAnimation((player, progress)=>{ player.rotation.y = progress; })},
];

/* ===================== STATIC POSES (radians) ===================== */
// convention: arms/legs hang down at 0; +z swings limb outward to its side;
// +x swings limb backward, -x swings forward; head.y looks, head.x nods.
const POSES = {
  rest:    {label:'Standing', svg:poseSVG('rest'), rig:ZERO(), yaw:0,pitch:0},
  tpose:   {label:'T-Pose',  svg:poseSVG('tpose'), rig:withRig({leftArm:{z:90},rightArm:{z:-90}})},
  walk:    {label:'Walking', svg:poseSVG('walk'), rig:withRig({leftLeg:{x:-26},rightLeg:{x:26},leftArm:{x:24},rightArm:{x:-24}}), joints:withJoints({leftKnee:{x:18},rightElbow:{x:-12},leftElbow:{x:12}})},
  run:     {label:'Running', svg:poseSVG('run'), rig:withRig({leftLeg:{x:-50},rightLeg:{x:50},leftArm:{x:55},rightArm:{x:-55},body:{x:14}}), joints:withJoints({leftKnee:{x:34},rightKnee:{x:18},leftElbow:{x:28},rightElbow:{x:-34}}), pitch:0},
  wave:    {label:'Waving',  svg:poseSVG('wave'), rig:withRig({rightArm:{z:-142,x:6},head:{y:-8}}), joints:withJoints({rightElbow:{x:-44}})},
  point:   {label:'Pointing',svg:poseSVG('point'),rig:withRig({rightArm:{x:-92},head:{y:-14}}), joints:withJoints({rightElbow:{x:-8}})},
  cross:   {label:'Arms x',  svg:poseSVG('cross'),rig:withRig({rightArm:{z:-78,x:-16},leftArm:{z:78,x:-16}}), joints:withJoints({rightElbow:{y:58},leftElbow:{y:-58}})},
  cheer:   {label:'Cheer',   svg:poseSVG('cheer'),rig:withRig({leftArm:{z:152},rightArm:{z:-152},head:{x:-8}}), joints:withJoints({leftElbow:{x:-18},rightElbow:{x:-18}})},
  sit:     {label:'Sitting', svg:poseSVG('sit'),  rig:withRig({leftLeg:{x:-90},rightLeg:{x:-90},leftArm:{x:-16},rightArm:{x:-16}}), joints:withJoints({leftKnee:{x:82},rightKnee:{x:82},leftElbow:{x:-10},rightElbow:{x:-10}})},
  sneak:   {label:'Sneak',   svg:poseSVG('sneak'),rig:withRig({body:{x:24},head:{x:-22},leftArm:{x:18},rightArm:{x:18}})},
  hero:    {label:'Landing', svg:poseSVG('hero'), rig:withRig({rightLeg:{x:-64},leftLeg:{x:30},body:{x:18},rightArm:{x:-78},leftArm:{z:60,x:30},head:{x:18}}), joints:withJoints({rightKnee:{x:74},leftKnee:{x:28},rightElbow:{x:-22},leftElbow:{x:24}})},
  fight:   {label:'Fighter', svg:poseSVG('fight'),rig:withRig({leftLeg:{z:14,x:-14},rightLeg:{z:-14,x:14},leftArm:{x:-46,z:18},rightArm:{x:-58,z:-12},body:{y:-12}}), joints:withJoints({leftKnee:{x:18},rightKnee:{x:32},leftElbow:{x:54},rightElbow:{x:46}})},
};
function withRig(parts){ const r=ZERO(); for(const k in parts){ Object.assign(r[k], parts[k]); } return r; }
function withJoints(joints){ const r=ZERO_JOINTS(); for(const k in joints){ Object.assign(r[k], joints[k]); } return r; }

/* ===================== FILTER PRESETS ===================== */
const FILTER_PRESETS = {
  none:     {label:'Original', f:{brightness:100,contrast:100,saturate:100,hue:0,sepia:0,grayscale:0,blur:0,vignette:0,grain:0}, tint:{amt:0}},
  vivid:    {label:'Vivid',    f:{brightness:104,contrast:118,saturate:148,hue:0,sepia:0,grayscale:0,blur:0,vignette:8,grain:0}},
  clarendon:{label:'Clarendon',f:{brightness:108,contrast:120,saturate:135,hue:-4,sepia:0,grayscale:0,blur:0,vignette:6,grain:0}},
  warm:     {label:'Golden',   f:{brightness:104,contrast:104,saturate:118,hue:-6,sepia:24,grayscale:0,blur:0,vignette:10,grain:0}, tint:{color:'#ff9d3c',amt:18}},
  cool:     {label:'Frost',    f:{brightness:102,contrast:106,saturate:92,hue:8,sepia:0,grayscale:0,blur:0,vignette:6,grain:0}, tint:{color:'#5aa6ff',amt:16}},
  fade:     {label:'Faded',    f:{brightness:108,contrast:84,saturate:80,hue:0,sepia:12,grayscale:0,blur:0,vignette:0,grain:6}},
  noir:     {label:'Noir',     f:{brightness:104,contrast:132,saturate:0,hue:0,sepia:0,grayscale:100,blur:0,vignette:22,grain:8}},
  sepia:    {label:'Vintage',  f:{brightness:104,contrast:96,saturate:70,hue:0,sepia:60,grayscale:0,blur:0,vignette:16,grain:10}},
  dream:    {label:'Dreamy',   f:{brightness:110,contrast:92,saturate:120,hue:-3,sepia:0,grayscale:0,blur:0.6,vignette:4,grain:0}, tint:{color:'#ff8fd0',amt:12}},
  cyber:    {label:'Neon',     f:{brightness:102,contrast:124,saturate:160,hue:280,sepia:0,grayscale:0,blur:0,vignette:18,grain:6}},
  matte:    {label:'Matte',    f:{brightness:104,contrast:90,saturate:96,hue:0,sepia:6,grayscale:0,blur:0,vignette:0,grain:5}},
  punch:    {label:'Punchy',   f:{brightness:100,contrast:140,saturate:140,hue:0,sepia:0,grayscale:0,blur:0,vignette:14,grain:0}},
};
const FILTER_SLIDERS = [
  {k:'brightness',name:'Brightness',min:40,max:180,unit:'%'},
  {k:'contrast',  name:'Contrast',  min:40,max:200,unit:'%'},
  {k:'saturate',  name:'Saturation',min:0, max:220,unit:'%'},
  {k:'hue',       name:'Hue shift', min:-180,max:180,unit:'°'},
  {k:'sepia',     name:'Sepia',     min:0, max:100,unit:'%'},
  {k:'grayscale', name:'Black & white',min:0,max:100,unit:'%'},
  {k:'blur',      name:'Soft focus',min:0, max:8, step:0.1, unit:'px'},
  {k:'vignette',  name:'Vignette',  min:0, max:60, unit:'%'},
  {k:'grain',     name:'Film grain', min:0, max:60, unit:'%'},
];

/* ===================== BACKGROUND MODES ===================== */
const BG_MODES=[
  {id:'transparent',name:'None', sw:'repeating-conic-gradient(#5a5040 0% 25%, #3a3328 0% 50%) 50%/12px 12px'},
  {id:'solid',  name:'Solid',  sw:'#1c1810'},
  {id:'gradient',name:'Gradient',sw:'linear-gradient(180deg,#f6a623,#1c1810)'},
  {id:'chroma', name:'Chroma', sw:'#00b140'},
  {id:'image',  name:'Image',  sw:'linear-gradient(135deg,#3ddc97,#5aa6ff)'},
];
const CHROMA=[{c:'#00b140',n:'Green'},{c:'#0047bb',n:'Blue'},{c:'#ff00ff',n:'Magenta'},{c:'#ffffff',n:'White'},{c:'#000000',n:'Black'}];

/* ===================== EXPORT SIZES ===================== */
const ASPECTS = {
  portrait: {label:'Portrait', d:'3 : 4', r:3/4},
  square:   {label:'Square',   d:'1 : 1', r:1},
  wide:     {label:'Wide',     d:'16 : 9',r:16/9},
  tall:     {label:'Story',    d:'9 : 16',r:9/16},
};
const RES = { '1k':1024, '2k':2048, '4k':4096 };

/* ===================== BOOT ===================== */
function boot(){
  buildUI();
  initViewer();
  wire();
  applyAll();
  // default skin so the studio never looks empty
  loadByName('actualPUG', true);
}

function initViewer(){
  const cv = $('#viewer');
  state.viewer = new skinview3d.SkinViewer({
    canvas: cv, width:1320, height:1680,
    zoom:0.82, fov:42, background:null,
    preserveDrawingBuffer:true, enableControls:true
  });
  const v=state.viewer;
  v.controls.enableZoom=true; v.controls.enablePan=false;
  v.autoRotateSpeed=2.2;
  applyRendererExposure(v);
  applyLights();
  // keep manual rig applied every frame after animation clears
  const tick=()=>{ if(!state.anim && state.hasSkin) applyRig(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

/* ===================== SKIN LOADING ===================== */
const SKIN_SOURCES = [
  n=>`https://mc-heads.net/skin/${encodeURIComponent(n)}`,
  n=>`https://crafatar.com/skins/${encodeURIComponent(n)}?default=MHF_Steve`,
];
async function loadByName(name, silent){
  name=(name||'').trim(); if(!name) return toast('Enter a username or UUID', true);
  showLoad('Fetching skin for '+name+'…');
  let blobURL=null, lastErr;
  for(const src of SKIN_SOURCES){
    try{
      const res = await fetch(src(name), {mode:'cors'});
      if(!res.ok) throw new Error('http '+res.status);
      const blob = await res.blob();
      if(blob.size<200) throw new Error('empty');
      blobURL = URL.createObjectURL(blob); break;
    }catch(e){ lastErr=e; }
  }
  if(!blobURL){ hideLoad(); return toast('Could not fetch "'+name+'". Check the name.', true); }
  await applySkin(blobURL, name);
  if(!silent) toast('Loaded '+name);
}
async function applySkin(url, label){
  state.skinURL=url; state.hasSkin=true;
  const v=state.viewer;
  try{
    await v.loadSkin(url, {model: state.model});
  }catch(e){ /* loadSkin returns void for canvas src; ignore */ }
  state.detected = detectSlim() ? 'slim':'default';
  rebuildSegmentedRig();
  rebuildSecondLayerModel();
  hideLoad();
  setStatus(label||'Custom skin');
  applyRig();
}
function detectSlim(){
  try{ return state.viewer?.playerObject?.skin?.modelType === 'slim'; }catch(e){}
  // skinview3d sets the player slim flag internally; infer from arm box width if exposed
  try{ const a=state.viewer.playerObject.skin.rightArm; return a && a.userData && a.userData.slim; }catch(e){}
  return state.detected==='slim';
}
function isSlimModel(){
  try{ return state.viewer?.playerObject?.skin?.modelType === 'slim'; }catch(e){}
  return state.detected === 'slim';
}
async function fetchCape(name){
  try{
    const res=await fetch(`https://crafatar.com/capes/${encodeURIComponent(name)}`,{mode:'cors'});
    if(res.ok){ const b=await res.blob(); if(b.size>200){ state.capeURL=URL.createObjectURL(b); } else state.capeURL=null; }
    else state.capeURL=null;
  }catch(e){ state.capeURL=null; }
  if(state.cape) applyCape();
}
function fileToURL(file){ return URL.createObjectURL(file); }

/* ===================== POSE / RIG ===================== */
const SEGMENTED_LIMBS = {
  rightArm:{joint:'rightElbow', arm:true, inner:{u:40,v:16}, outer:{u:40,v:32}, pivotX:()=>isSlimModel()?-0.5:-1, pivotY:-4, upperY:-1, lowerY:-3, width:()=>isSlimModel()?3:4, outerWidth:()=>isSlimModel()?3.5:4.5},
  leftArm: {joint:'leftElbow',  arm:true, inner:{u:32,v:48}, outer:{u:48,v:48}, pivotX:()=>isSlimModel()?0.5:1,  pivotY:-4, upperY:-1, lowerY:-3, width:()=>isSlimModel()?3:4, outerWidth:()=>isSlimModel()?3.5:4.5},
  rightLeg:{joint:'rightKnee',  arm:false,inner:{u:0, v:16}, outer:{u:0, v:32}, pivotX:()=>0, pivotY:-6, upperY:-3, lowerY:-3, width:4, outerWidth:4.5},
  leftLeg: {joint:'leftKnee',   arm:false,inner:{u:16,v:48}, outer:{u:0, v:48}, pivotX:()=>0, pivotY:-6, upperY:-3, lowerY:-3, width:4, outerWidth:4.5},
};

function disposeSegmentedRig(){
  if(!segmentedRig) return;
  Object.values(segmentedRig.parts).forEach(entry=>entry.part.remove(entry.root));
  segmentedRig.geometries.forEach(g=>g.dispose());
  segmentedRig.materials.forEach(m=>m.dispose());
  segmentedRig = null;
}
function rebuildSegmentedRig(){
  disposeSegmentedRig();
  const skin=state.viewer?.playerObject?.skin;
  if(!skin) return;
  const geometries=[], materials=[], parts={};
  for(const [partKey,cfg] of Object.entries(SEGMENTED_LIMBS)){
    const part=skin[partKey];
    if(!part?.innerLayer) continue;
    const root=new THREE.Group();
    root.name=`${partKey}BendRig`;
    const upper=new THREE.Group();
    const lowerJoint=new THREE.Group();
    lowerJoint.name=`${cfg.joint}Pivot`;
    const lower=new THREE.Group();
    upper.add(makeSegmentMesh(partKey, cfg, false, false, geometries, materials), makeSegmentMesh(partKey, cfg, false, true, geometries, materials));
    lower.add(makeSegmentMesh(partKey, cfg, true, false, geometries, materials), makeSegmentMesh(partKey, cfg, true, true, geometries, materials));
    root.add(upper, lowerJoint);
    lowerJoint.add(lower);
    part.add(root);
    parts[partKey]={part, root, upper, lowerJoint};
  }
  segmentedRig={parts, geometries, materials};
  syncSegmentedRig();
}
function makeSegmentMesh(partKey, cfg, lower, outer, geometries, materials){
  const width=valueOf(outer?cfg.outerWidth:cfg.width);
  const height=outer?6.25:6;
  const depth=outer?4.5:4;
  const yOffset=lower?6:0;
  const geometry=new THREE.BoxGeometry(width, height, depth);
  setSegmentUVs(geometry, outer?cfg.outer.u:cfg.inner.u, outer?cfg.outer.v:cfg.inner.v, valueOf(cfg.width), yOffset, 6, 4);
  const source=state.viewer.playerObject.skin[partKey][outer?'outerLayer':'innerLayer'].material;
  const material=source.clone();
  material.map=source.map;
  material.needsUpdate=true;
  const mesh=new THREE.Mesh(geometry, material);
  mesh.name=outer?'outer':'inner';
  const x=valueOf(cfg.pivotX);
  mesh.position.set(lower?0:x, lower?cfg.lowerY:cfg.upperY, 0);
  geometries.push(geometry); materials.push(material);
  return mesh;
}
function setSegmentUVs(box,u,v,width,yOffset,height,depth){
  const toFaceVertices=(x1,y1,x2,y2)=>[
    new THREE.Vector2(x1/64,1-y2/64), new THREE.Vector2(x2/64,1-y2/64),
    new THREE.Vector2(x2/64,1-y1/64), new THREE.Vector2(x1/64,1-y1/64),
  ];
  const top=toFaceVertices(u+depth, v, u+width+depth, v+depth);
  const bottom=toFaceVertices(u+width+depth, v, u+width*2+depth, v+depth);
  const left=toFaceVertices(u, v+depth+yOffset, u+depth, v+depth+yOffset+height);
  const front=toFaceVertices(u+depth, v+depth+yOffset, u+width+depth, v+depth+yOffset+height);
  const right=toFaceVertices(u+width+depth, v+depth+yOffset, u+width+depth*2, v+depth+yOffset+height);
  const back=toFaceVertices(u+width+depth*2, v+depth+yOffset, u+width*2+depth*2, v+depth+yOffset+height);
  const uvRight=[right[3],right[2],right[0],right[1]];
  const uvLeft=[left[3],left[2],left[0],left[1]];
  const uvTop=[top[3],top[2],top[0],top[1]];
  const uvBottom=[bottom[0],bottom[1],bottom[3],bottom[2]];
  const uvFront=[front[3],front[2],front[0],front[1]];
  const uvBack=[back[3],back[2],back[0],back[1]];
  const data=[];
  for(const face of [uvRight,uvLeft,uvTop,uvBottom,uvFront,uvBack]) for(const uv of face) data.push(uv.x,uv.y);
  box.attributes.uv.set(new Float32Array(data));
  box.attributes.uv.needsUpdate=true;
}
function jointIsBent(joint){
  const r=state.joints[joint];
  return !!r && (Math.abs(r.x)>0.01 || Math.abs(r.y)>0.01 || Math.abs(r.z)>0.01);
}
function syncSegmentedRig(){
  const skin=state.viewer?.playerObject?.skin;
  if(!skin || !segmentedRig) return;
  for(const [partKey,cfg] of Object.entries(SEGMENTED_LIMBS)){
    const entry=segmentedRig.parts[partKey], part=skin[partKey];
    if(!entry || !part) continue;
    const active=!state.anim && jointIsBent(cfg.joint);
    entry.root.visible=active;
    entry.root.traverse(obj=>{ if(obj.isMesh && obj.name==='outer') obj.visible = state.render.layerStyle !== 'off'; });
    entry.lowerJoint.position.set(valueOf(cfg.pivotX), cfg.pivotY, 0);
    const r=state.joints[cfg.joint];
    entry.lowerJoint.rotation.set((r?.x||0)*D2R, (r?.y||0)*D2R, (r?.z||0)*D2R);
    part.innerLayer.visible=!active;
    part.outerLayer.visible=!active && state.render.layerStyle === 'flat';
  }
}
function applyRig(){
  const v=state.viewer; if(!v||!v.playerObject) return;
  const s=v.playerObject.skin;
  for(const p of PARTS){
    const part=s[p.key], r=state.rig[p.key]; if(!part) continue;
    part.rotation.set(r.x*D2R, r.y*D2R, r.z*D2R);
  }
  syncSegmentedRig();
  v.playerWrapper.rotation.y = state.bodyYaw*D2R;
  v.playerWrapper.rotation.x = state.bodyPitch*D2R;
}
function setPose(key){
  const p=POSES[key]; if(!p) return;
  clearAnim();
  state.rig = JSON.parse(JSON.stringify(p.rig));
  state.joints = JSON.parse(JSON.stringify(p.joints||ZERO_JOINTS()));
  state.bodyYaw = p.yaw||0; state.bodyPitch = p.pitch||0;
  syncRigUI(); applyRig();
  $$('#poseGrid .pose-btn').forEach(b=>b.classList.toggle('on', b.dataset.pose===key));
}
function clearAnim(){
  if(state.anim){ state.viewer.animation=null; state.anim=null; }
  $$('#animChips .chip').forEach(c=>c.classList.remove('on'));
  syncSegmentedRig();
}
function setAnim(id){
  const a=ANIMS.find(x=>x.id===id); if(!a) return;
  if(state.anim===id){ clearAnim(); applyRig(); return; }
  $$('#poseGrid .pose-btn').forEach(b=>b.classList.remove('on'));
  state.anim=id;
  syncSegmentedRig();
  const inst=a.make(); inst.speed=state.animSpeed;
  state.viewer.animation=inst;
  $$('#animChips .chip').forEach(c=>c.classList.toggle('on', c.dataset.anim===id));
}
function resetPose(){
  clearAnim();
  state.rig=ZERO(); state.joints=ZERO_JOINTS(); state.bodyYaw=0; state.bodyPitch=0;
  syncRigUI(); applyRig();
  $$('#poseGrid .pose-btn').forEach(b=>b.classList.remove('on'));
}
function syncRigUI(){
  for(const p of PARTS) for(const ax of ['x','y','z']){
    const inp=$(`#rig_${p.key}_${ax}`); if(inp){ inp.value=state.rig[p.key][ax]; inp.nextElementSibling.textContent=Math.round(state.rig[p.key][ax])+'°'; }
  }
  for(const j of JOINTS) for(const ax of ['x','y','z']){
    const inp=$(`#joint_${j.key}_${ax}`); if(inp){ inp.value=state.joints[j.key][ax]; inp.nextElementSibling.textContent=Math.round(state.joints[j.key][ax])+'°'; }
  }
  $('#bodyYaw').value=state.bodyYaw; $('#bodyYawV').textContent=Math.round(state.bodyYaw)+'°';
  $('#bodyPitch').value=state.bodyPitch; $('#bodyPitchV').textContent=Math.round(state.bodyPitch)+'°';
}

/* ===================== FILTERS (live preview) ===================== */
function filterCSS(f){
  f=f||state.filters;
  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) `+
         `hue-rotate(${f.hue}deg) sepia(${f.sepia}%) grayscale(${f.grayscale}%) blur(${f.blur}px)`;
}
function applyFilters(){
  const f=state.filters;
  $('#viewer').style.filter = filterCSS(f);
  const vg=$('#vignetteLayer');
  vg.style.opacity = f.vignette/60;
  vg.style.background = `radial-gradient(70% 70% at 50% 45%, transparent 40%, rgba(0,0,0,.9) 120%)`;
  $('#grainLayer').style.opacity = f.grain/60*0.9;
  // tint preview
  let tl=$('#tintLayer');
  if(!tl){ tl=document.createElement('div'); tl.id='tintLayer'; tl.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:2;border-radius:6px;mix-blend-mode:color'; $('#viewer').after(tl); }
  tl.style.background=state.tint.color; tl.style.opacity=state.tint.amt/100*0.85;
}

/* ===================== BACKGROUND (preview) ===================== */
function applyBg(){
  const b=state.bg, el=$('#bgLayer');
  el.style.background='transparent'; el.innerHTML='';
  if(b.mode==='transparent'){
    el.style.background='repeating-conic-gradient(rgba(255,255,255,.04) 0% 25%, transparent 0% 50%) 50%/18px 18px';
  } else if(b.mode==='solid'){ el.style.background=b.solid; }
  else if(b.mode==='gradient'){ el.style.background=`linear-gradient(${b.gAngle}deg, ${b.g1}, ${b.g2})`; }
  else if(b.mode==='chroma'){ el.style.background=b.chroma; }
  else if(b.mode==='image' && b.img){
    el.style.backgroundImage=`url(${b.img.src})`;
    el.style.backgroundSize = b.fit==='stretch'?'100% 100%':(b.fit==='contain'?'contain':'cover');
    el.style.backgroundPosition='center'; el.style.backgroundRepeat='no-repeat';
  } else if(b.mode==='image'){ el.style.background='var(--bg2)'; }
}
function applyLights(){
  const v=state.viewer; if(!v) return;
  v.globalLight.intensity = state.amb/100*LIGHTING.ambientScale;
  v.cameraLight.intensity = state.key/100*LIGHTING.keyScale;
  applyRendererExposure(v);
}
function applyRendererExposure(v){
  if(v?.renderer && 'toneMappingExposure' in v.renderer){
    v.renderer.toneMappingExposure = state.exposure/100;
  }
}
function syncSecondLayerVisibility(){
  const skin=state.viewer?.playerObject?.skin;
  if(!skin) return;
  const flat = state.render.layerStyle === 'flat';
  const voxels = state.render.layerStyle === '3d';
  try{ skin.setOuterLayerVisible(flat); }catch(e){
    SECOND_LAYER_PARTS.forEach(p=>{ if(skin[p.key]?.outerLayer) skin[p.key].outerLayer.visible = flat; });
  }
  if(secondLayerModel) secondLayerModel.visible = voxels;
  if(secondLayerModel){
    secondLayerModel.groups.forEach(g=>{
      const partKey=g.name.replace('3dOuterLayer','');
      const cfg=SEGMENTED_LIMBS[partKey];
      g.visible = voxels && !(cfg && !state.anim && jointIsBent(cfg.joint));
    });
  }
  syncSegmentedRig();
}
function disposeSecondLayerModel(){
  if(!secondLayerModel) return;
  secondLayerModel.groups.forEach(g=>g.parent?.remove(g));
  secondLayerModel.geometries.forEach(g=>g.dispose());
  secondLayerModel.materials.forEach(m=>m.dispose());
  secondLayerModel = null;
}
function rebuildSecondLayerModel(){
  disposeSecondLayerModel();
  const v=state.viewer;
  const skin=v?.playerObject?.skin;
  if(!v?.skinCanvas || !skin || !state.hasSkin){
    syncSecondLayerVisibility();
    return;
  }

  const canvas=v.skinCanvas;
  const ctx=canvas.getContext('2d', {willReadFrequently:true});
  const scale=canvas.width/64;
  const layerDepth=state.render.layerDepth;
  const materials=new Map();
  const geometries=[];
  const groups=[];

  const materialFor=color=>{
    if(!materials.has(color.key)){
      materials.set(color.key, new THREE.MeshStandardMaterial({
        color: color.hex,
        emissive: color.hex,
        emissiveIntensity: LIGHTING.layerEmissive,
        roughness: 0.62,
        metalness: 0,
        transparent: color.alpha < 1,
        opacity: color.alpha,
        alphaTest: 0.05,
      }));
    }
    return materials.get(color.key);
  };

  for(const cfg of SECOND_LAYER_PARTS){
    const part=skin[cfg.key];
    if(!part?.outerLayer?.parent) continue;
    const width=valueOf(cfg.width), height=valueOf(cfg.height), depth=valueOf(cfg.depth);
    const center=part.outerLayer.position;
    const group=new THREE.Group();
    group.name=`${cfg.key}3dOuterLayer`;
    group.position.copy(center);
    group.visible = state.render.layerStyle === '3d';

    const uv=cfg.uv();
    for(const face of SECOND_LAYER_FACES){
      const rect=face.rect(uv);
      for(let py=0; py<rect.h; py++){
        for(let px=0; px<rect.w; px++){
          const color=sampleSkinPixel(ctx, scale, rect.x+px, rect.y+py);
          if(!color) continue;
          const voxel=makeLayerVoxel(face, px, py, rect, width, height, depth, layerDepth, cfg.key);
          const geometry=new THREE.BoxGeometry(voxel.sx, voxel.sy, voxel.sz);
          const mesh=new THREE.Mesh(geometry, materialFor(color));
          mesh.position.set(voxel.x, voxel.y, voxel.z);
          group.add(mesh);
          geometries.push(geometry);
        }
      }
    }

    part.outerLayer.parent.add(group);
    groups.push(group);
  }

  secondLayerModel = {
    groups,
    geometries,
    materials: Array.from(materials.values()),
  };
  syncSecondLayerVisibility();
}
function valueOf(v){ return typeof v === 'function' ? v() : v; }
function sampleSkinPixel(ctx, scale, x, y){
  const sx=Math.floor(x*scale), sy=Math.floor(y*scale);
  const sw=Math.max(1, Math.ceil(scale)), sh=Math.max(1, Math.ceil(scale));
  const data=ctx.getImageData(sx, sy, sw, sh).data;
  let r=0,g=0,b=0,a=0,count=0;
  for(let i=0;i<data.length;i+=4){
    const alpha=data[i+3]/255;
    if(alpha<=0.02) continue;
    r+=data[i]*alpha; g+=data[i+1]*alpha; b+=data[i+2]*alpha; a+=alpha; count++;
  }
  if(!count || a/count < 0.05) return null;
  const alpha=clamp(a/count, 0, 1);
  r=Math.round(r/a); g=Math.round(g/a); b=Math.round(b/a);
  const hex=(r<<16)|(g<<8)|b;
  return {hex, alpha, key:`${hex}:${Math.round(alpha*255)}`};
}
function makeLayerVoxel(face, px, py, rect, width, height, depth, t, partKey){
  const sx=face.axis==='x'?t:1;
  const sy=face.axis==='y'?t:1;
  const sz=face.axis==='z'?t:1;
  let x=0,y=0,z=0;
  if(face.name==='front'){
    x=-width/2+px+0.5; y=height/2-py-0.5; z=depth/2+t/2;
  }else if(face.name==='back'){
    x=width/2-px-0.5; y=height/2-py-0.5; z=-depth/2-t/2;
  }else if(face.name==='left'){
    x=-width/2-t/2;
    if(partKey==='head'){
      y=height/2-py-0.5; z=-depth/2+px+0.5;
    }else{
      y=height/2-py-0.5; z=depth/2-px-0.5;
    }
  }else if(face.name==='right'){
    x=width/2+t/2;
    if(partKey==='head'){
      y=height/2-py-0.5; z=depth/2-px-0.5;
    }else{
      y=height/2-py-0.5; z=-depth/2+px+0.5;
    }
  }else if(face.name==='top'){
    x=-width/2+px+0.5; y=height/2+t/2; z=-depth/2+py+0.5;
  }else if(face.name==='bottom'){
    x=-width/2+px+0.5; y=-height/2-t/2; z=-depth/2+py+0.5;
  }
  return {x,y,z,sx,sy,sz};
}
function applyCape(){
  const v=state.viewer; if(!v) return;
  const url = state.capeURL || 'https://crafatar.com/capes/MHF_Steve';
  if(state.cape || state.elytra){
    try{ v.loadCape(url, {backEquipment: state.elytra?'elytra':'cape'}); }catch(e){}
  } else { v.loadCape(null); }
}
function applyAll(){ applyFilters(); applyBg(); applyLights(); syncSecondLayerVisibility(); }

/* ===================== EXPORT PIPELINE ===================== */
function captureModel(W,H){
  const v=state.viewer;
  const oW=v.width, oH=v.height, oPR=v.pixelRatio, oAuto=v.autoRotate;
  v.autoRotate=false; v.pixelRatio=1; v.setSize(W,H); v.render();
  const out=document.createElement('canvas'); out.width=W; out.height=H;
  out.getContext('2d').drawImage(v.canvas,0,0,W,H);
  v.pixelRatio=oPR; v.setSize(oW,oH); v.autoRotate=oAuto; v.render();
  return out;
}
function drawBackground(ctx,W,H){
  const b=state.bg;
  if(b.mode==='transparent') return false;
  if(b.mode==='solid'){ ctx.fillStyle=b.solid; ctx.fillRect(0,0,W,H); }
  else if(b.mode==='chroma'){ ctx.fillStyle=b.chroma; ctx.fillRect(0,0,W,H); }
  else if(b.mode==='gradient'){
    const a=(b.gAngle-90)*D2R, cx=W/2, cy=H/2, len=Math.max(W,H);
    const dx=Math.cos(a)*len/2, dy=Math.sin(a)*len/2;
    const g=ctx.createLinearGradient(cx-dx,cy-dy,cx+dx,cy+dy);
    g.addColorStop(0,b.g1); g.addColorStop(1,b.g2); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  } else if(b.mode==='image' && b.img){
    const im=b.img, ir=im.width/im.height, cr=W/H; let dw,dh,dx,dy;
    if(b.fit==='stretch'){ dw=W;dh=H;dx=0;dy=0; }
    else if(b.fit==='contain'){ if(ir>cr){dw=W;dh=W/ir;}else{dh=H;dw=H*ir;} dx=(W-dw)/2;dy=(H-dh)/2; ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);}
    else { if(ir>cr){dh=H;dw=H*ir;}else{dw=W;dh=W/ir;} dx=(W-dw)/2;dy=(H-dh)/2; }
    ctx.drawImage(im,dx,dy,dw,dh);
  } else { return false; }
  return true;
}
function drawOverlays(ctx,W,H){
  const f=state.filters;
  if(f.vignette>0){
    const g=ctx.createRadialGradient(W/2,H*0.45,Math.min(W,H)*0.28, W/2,H*0.45, Math.max(W,H)*0.62);
    g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,`rgba(0,0,0,${f.vignette/60*0.9})`);
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }
  if(f.grain>0 && grainImg.complete){
    ctx.save(); ctx.globalAlpha=f.grain/60*0.85; ctx.globalCompositeOperation='overlay';
    const ts=Math.max(128, Math.round(W/6));
    for(let y=0;y<H;y+=ts) for(let x=0;x<W;x+=ts) ctx.drawImage(grainImg,x,y,ts,ts);
    ctx.restore();
  }
}
function fitContain(sw,sh,W,H){ const sr=sw/sh, cr=W/H; let w,h; if(sr>cr){w=W;h=W/sr;}else{h=H;w=H*sr;} return {w,h,x:(W-w)/2,y:(H-h)/2}; }

function renderComposite(W,H,opts){
  opts=opts||{};
  const out=document.createElement('canvas'); out.width=W; out.height=H;
  const ctx=out.getContext('2d');
  const transparentBg = (state.exp.fmt==='png-trans' && !opts.forceBg);
  if(!transparentBg) drawBackground(ctx,W,H);
  else if(state.exp.fmt==='jpg'){ ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H); }

  // model layer (capture at native target so framing matches viewport)
  const model = captureModel(opts.capW||W, opts.capH||H);
  const tcol = state.tint, tintOn = tcol.amt>0;
  // draw filtered model into a temp so tint composites only over the model
  const tmp=document.createElement('canvas'); tmp.width=W; tmp.height=H;
  const tx=tmp.getContext('2d');
  tx.filter=filterCSS();
  if(opts.place){ const pl=opts.place; tx.drawImage(model, pl.x, pl.y, pl.w, pl.h); }
  else tx.drawImage(model,0,0,W,H);
  tx.filter='none';
  if(tintOn){ tx.save(); tx.globalCompositeOperation='color'; tx.globalAlpha=tcol.amt/100*0.85;
    tx.fillStyle=tcol.color; tx.fillRect(0,0,W,H); tx.restore();
    // re-mask tint to model alpha
    tx.globalCompositeOperation='destination-in'; tx.drawImage(model, opts.place?opts.place.x:0, opts.place?opts.place.y:0, opts.place?opts.place.w:W, opts.place?opts.place.h:H); tx.globalCompositeOperation='source-over';
  }
  ctx.drawImage(tmp,0,0);
  drawOverlays(ctx,W,H);
  return out;
}

function renderThumbnail(W,H){
  const out=document.createElement('canvas'); out.width=W; out.height=H;
  const ctx=out.getContext('2d');
  if(state.exp.fmt!=='png-trans' || true) drawBackground(ctx,W,H);
  const t=state.thumb;
  // model placement
  const boxH=H*0.96*(t.ms/100), boxW=boxH*0.62;
  const cx=W*(t.mx/100), cy=H*0.52;
  const cap=captureModel(Math.round(boxW), Math.round(boxH));
  const tmp=document.createElement('canvas'); tmp.width=W; tmp.height=H; const tx=tmp.getContext('2d');
  tx.filter=filterCSS();
  const px=cx-boxW/2, py=cy-boxH/2;
  tx.drawImage(cap, px, py, boxW, boxH);
  tx.filter='none';
  if(state.tint.amt>0){ tx.save();tx.globalCompositeOperation='color';tx.globalAlpha=state.tint.amt/100*0.85;tx.fillStyle=state.tint.color;tx.fillRect(0,0,W,H);tx.restore();
    tx.globalCompositeOperation='destination-in';tx.drawImage(cap,px,py,boxW,boxH);tx.globalCompositeOperation='source-over'; }
  ctx.drawImage(tmp,0,0);
  drawOverlays(ctx,W,H);
  // text
  drawThumbText(ctx,W,H);
  return out;
}
function drawThumbText(ctx,W,H){
  const t=state.thumb; if(!t.title && !t.sub) return;
  const scale=W/1280;
  const fs=t.font*scale, ow=t.outW*scale;
  ctx.textBaseline='middle';
  let tx, align;
  if(t.align==='left'){ align='left'; tx=W*0.05; }
  else if(t.align==='right'){ align='right'; tx=W*0.95; }
  else { align='center'; tx=W*0.5; }
  ctx.textAlign=align;
  const lines=wrapText(ctx,t.title.toUpperCase(),fs,W*0.62,scale);
  const subFs=fs*0.5;
  const totalH=lines.length*fs*1.08 + (t.sub?subFs*1.4:0);
  let y=H*0.5 - totalH/2 + fs*0.5;
  ctx.font=`800 ${fs}px 'Inter', system-ui, sans-serif`;
  ctx.lineJoin='round';
  for(const ln of lines){
    if(ow>0){ ctx.strokeStyle=t.out; ctx.lineWidth=ow; ctx.strokeText(ln,tx,y); }
    ctx.fillStyle=t.col; ctx.fillText(ln,tx,y);
    y+=fs*1.08;
  }
  if(t.sub){
    ctx.font=`700 ${subFs}px 'Inter', system-ui, sans-serif`;
    y+=subFs*0.2;
    if(ow>0){ ctx.strokeStyle=t.out; ctx.lineWidth=ow*0.7; ctx.strokeText(t.sub,tx,y); }
    ctx.fillStyle=t.col; ctx.fillText(t.sub,tx,y);
  }
}
function wrapText(ctx,text,fs,maxW,scale){
  ctx.font=`800 ${fs}px 'Inter', system-ui, sans-serif`;
  const words=text.split(/\s+/); const lines=[]; let cur='';
  for(const w of words){ const test=cur?cur+' '+w:w; if(ctx.measureText(test).width>maxW && cur){ lines.push(cur); cur=w; } else cur=test; }
  if(cur) lines.push(cur); return lines.length?lines:[''];
}

async function doExport(toClipboard){
  if(!state.hasSkin) return toast('Load a skin first', true);
  showLoad(toClipboard?'Rendering for clipboard…':'Rendering image…');
  await new Promise(r=>setTimeout(r,40));
  try{
    let canvas;
    if(state.thumb.on){
      const base=RES[state.exp.res]; // 1k->1024 etc; map to 16:9 widths
      const W = state.exp.res==='4k'?3840 : state.exp.res==='2k'?1920 : 1280;
      canvas = renderThumbnail(W, Math.round(W*9/16));
    } else {
      const ar=ASPECTS[state.exp.aspect].r, long=RES[state.exp.res];
      let W,H; if(ar>=1){ W=long; H=Math.round(long/ar); } else { H=long; W=Math.round(long*ar); }
      canvas = renderComposite(W,H,{});
    }
    const isJpg=state.exp.fmt==='jpg';
    const mime=isJpg?'image/jpeg':'image/png';
    if(toClipboard){
      canvas.toBlob(async b=>{
        try{ await navigator.clipboard.write([new ClipboardItem({[mime]:b})]); toast('Copied to clipboard'); }
        catch(e){ toast('Clipboard blocked — downloading instead', true); download(canvas,mime,isJpg);}
        hideLoad();
      }, mime, isJpg?0.95:undefined);
    } else {
      download(canvas,mime,isJpg); hideLoad();
      toast('Saved '+canvas.width+'×'+canvas.height+(isJpg?' JPG':' PNG'));
    }
  }catch(e){ hideLoad(); console.error(e); toast('Export failed: '+e.message, true); }
}
function download(canvas,mime,isJpg){
  canvas.toBlob(b=>{
    const url=URL.createObjectURL(b), a=document.createElement('a');
    a.href=url; a.download='blockpose-'+Date.now()+(isJpg?'.jpg':'.png'); a.click();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }, mime, isJpg?0.95:undefined);
}

/* ===================== POSE LIBRARY (save/export) ===================== */
function loadLib(){ try{ return JSON.parse(store?.getItem('bp_poses')||'[]'); }catch(e){ return []; } }
function saveLib(){ try{ store?.setItem('bp_poses', JSON.stringify(state.poseLib)); }catch(e){} renderLib(); }
function currentPoseData(){ return {v:2, name:'', rig:state.rig, joints:state.joints, bodyYaw:state.bodyYaw, bodyPitch:state.bodyPitch, ts:Date.now()}; }
function savePose(){
  clearAnim();
  const name=prompt('Name this pose:', 'Pose '+(state.poseLib.length+1)); if(name===null) return;
  const d=currentPoseData(); d.name=name||('Pose '+(state.poseLib.length+1));
  state.poseLib.unshift(d); saveLib();
  // also offer JSON download
  const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=name.replace(/\s+/g,'-').toLowerCase()+'.pose.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),2000);
  toast('Pose saved + exported');
}
function applyPoseData(d){
  clearAnim();
  state.rig = Object.assign(ZERO(), JSON.parse(JSON.stringify(d.rig||{})));
  for(const p of PARTS){ if(!state.rig[p.key]) state.rig[p.key]={x:0,y:0,z:0}; }
  state.joints = Object.assign(ZERO_JOINTS(), JSON.parse(JSON.stringify(d.joints||{})));
  for(const j of JOINTS){ if(!state.joints[j.key]) state.joints[j.key]={x:0,y:0,z:0}; }
  state.bodyYaw=d.bodyYaw||0; state.bodyPitch=d.bodyPitch||0;
  syncRigUI(); applyRig();
  $$('#poseGrid .pose-btn').forEach(b=>b.classList.remove('on'));
}
function renderLib(){
  const el=$('#poseLib');
  if(!state.poseLib.length){ el.innerHTML='<span class="empty">No saved poses yet.</span>'; return; }
  el.innerHTML='';
  state.poseLib.forEach((d,i)=>{
    const s=document.createElement('div'); s.className='slot';
    s.innerHTML=`<span>${escapeHtml(d.name)}</span><span class="x" title="Delete"><svg viewBox="0 0 24 24" width="11" height="11" fill="none"><path d="M5 5l14 14M19 5 5 19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></span>`;
    s.querySelector('span:first-child').onclick=()=>{ applyPoseData(d); toast('Applied "'+d.name+'"'); };
    s.querySelector('.x').onclick=(e)=>{ e.stopPropagation(); state.poseLib.splice(i,1); saveLib(); };
    el.appendChild(s);
  });
}

/* ===================== UI BUILDERS ===================== */
function jointControlsForPart(partKey){
  const joint=JOINTS.find(j=>j.part===partKey);
  if(!joint) return '';
  return `<div class="joint-block">
    <div class="joint-title">${joint.name}</div>
    <div class="mini-grid">
      ${['x','y','z'].map(ax=>`<div class="mini"><label>${ax.toUpperCase()} ${ax==='x'?'bend':ax==='y'?'twist':'side'}</label><input type="range" id="joint_${joint.key}_${ax}" min="-180" max="180" value="0"><span class="val" style="text-align:left">0°</span></div>`).join('')}
    </div>
  </div>`;
}
function buildUI(){
  // animations
  $('#animChips').innerHTML = ANIMS.map(a=>`<button class="chip" data-anim="${a.id}"><span class="ic">${a.ic}</span>${a.name}</button>`).join('');
  // poses
  $('#poseGrid').innerHTML = Object.entries(POSES).map(([k,p])=>`<button class="pose-btn" data-pose="${k}">${p.svg}<span>${p.label}</span></button>`).join('');
  // rig
  $('#rig').innerHTML = PARTS.map((p,i)=>`
    <div class="rig-part${i===0?' open':''}" data-part="${p.key}">
      <div class="rig-head"><svg class="pj" viewBox="0 0 24 24" fill="none"><rect x="6" y="3" width="12" height="18" rx="2" stroke="currentColor" stroke-width="1.6"/></svg><span class="nm">${p.name}</span><svg class="cx" viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <div class="rig-body"><div class="mini-grid">
        ${['x','y','z'].map(ax=>`<div class="mini"><label>${ax.toUpperCase()} ${ax==='x'?'pitch':ax==='y'?'yaw':'roll'}</label><input type="range" id="rig_${p.key}_${ax}" min="-180" max="180" value="0"><span class="val" style="text-align:left">0°</span></div>`).join('')}
      </div>${jointControlsForPart(p.key)}</div>
    </div>`).join('');
  // filter presets
  $('#filterPresets').innerHTML = Object.entries(FILTER_PRESETS).map(([k,p])=>`<button class="chip${k==='none'?' on':''}" data-fp="${k}">${p.label}</button>`).join('');
  // filter sliders
  $('#filterSliders').innerHTML = FILTER_SLIDERS.map(s=>`
    <div class="row"><div class="rl">${s.name}</div><div class="slider">
      <input type="range" id="f_${s.k}" min="${s.min}" max="${s.max}" step="${s.step||1}" value="${state.filters[s.k]}">
      <span class="val" id="f_${s.k}_v">${state.filters[s.k]}${s.unit}</span></div></div>`).join('');
  // bg modes
  $('#bgModes').innerHTML = BG_MODES.map(b=>`<button class="bg-mode${b.id==='transparent'?' on':''}" data-bg="${b.id}"><span class="sw" style="background:${b.sw}"></span><span>${b.name}</span></button>`).join('');
  // chroma chips
  $('#chromaChips').innerHTML = CHROMA.map((c,i)=>`<button class="chip${i===0?' on':''}" data-chroma="${c.c}"><span class="sw" style="display:inline-block;width:13px;height:13px;border-radius:3px;background:${c.c};border:1px solid rgba(255,255,255,.2)"></span>${c.n}</button>`).join('');
  // aspects
  $('#aspectGrid').innerHTML = Object.entries(ASPECTS).map(([k,a])=>`<button class="size-btn${k==='portrait'?' on':''}" data-aspect="${k}"><span class="t">${a.label}</span><span class="d">${a.d}</span></button>`).join('');
  // res
  $('#resSeg').innerHTML = Object.keys(RES).map((k,i)=>`<button class="${k==='2k'?'on':''}" data-res="${k}">${k.toUpperCase()} · ${RES[k]}px</button>`).join('');
  renderLib(); updateOutDims();
}

/* ===================== WIRING ===================== */
function wire(){
  // source toggle
  $('#srcSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    $$('#srcSeg button').forEach(x=>x.classList.toggle('on',x===b)); state.curSrc=b.dataset.src;
    $('#nameField').style.display=state.curSrc==='name'?'flex':'none';
    $('#uploadField').style.display=state.curSrc==='upload'?'flex':'none';
  });
  $('#loadBtn').onclick=()=>loadByName($('#nameInput').value);
  $('#nameInput').addEventListener('keydown',e=>{if(e.key==='Enter')loadByName($('#nameInput').value);});
  $('#browseBtn').onclick=()=>$('#fileSkin').click();
  $('#uploadField').onclick=e=>{ if(e.target.id!=='browseBtn')$('#fileSkin').click(); };
  $('#fileSkin').onchange=e=>{const f=e.target.files[0];if(!f)return; $('#uploadName').value=f.name; const u=fileToURL(f); applySkin(u, f.name.replace(/\.[^.]+$/,'')); toast('Skin loaded');};

  // model
  $('#modelSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    $$('#modelSeg button').forEach(x=>x.classList.toggle('on',x===b)); state.model=b.dataset.model;
    if(state.skinURL){
      Promise.resolve(state.viewer.loadSkin(state.skinURL,{model:state.model}))
        .finally(()=>{state.detected=detectSlim()?'slim':'default';rebuildSegmentedRig();rebuildSecondLayerModel();applyRig();setStatus();});
    }
    setStatus();
  });

  // tabs
  $('#tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    $$('#tabs button').forEach(x=>x.classList.toggle('on',x===b));
    $$('.pane').forEach(p=>p.classList.toggle('on',p.dataset.pane===b.dataset.tab));
    // thumbnail live preview frame
    updateThumbFrame();
  });

  // toolbar
  $$('#toolbar [data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $('#spinTool').onclick=()=>{ state.viewer.autoRotate=!state.viewer.autoRotate; $('#spinTool').classList.toggle('on',state.viewer.autoRotate); };
  $('#resetView').onclick=()=>{ state.viewer.controls.reset(); state.viewer.zoom=0.82; };
  $('#resetPoseTool').onclick=resetPose;

  // animations
  $('#animChips').addEventListener('click',e=>{const b=e.target.closest('.chip');if(b)setAnim(b.dataset.anim);});
  bindRange('#animSpeed','#animSpeedV',v=>{state.animSpeed=+v; if(state.anim&&state.viewer.animation)state.viewer.animation.speed=+v;}, v=>(+v).toFixed(1)+'×');

  // poses
  $('#poseGrid').addEventListener('click',e=>{const b=e.target.closest('.pose-btn');if(b)setPose(b.dataset.pose);});

  // rig accordions + sliders
  $('#rig').addEventListener('click',e=>{const h=e.target.closest('.rig-head');if(h)h.parentElement.classList.toggle('open');});
  PARTS.forEach(p=>['x','y','z'].forEach(ax=>{
    const inp=$(`#rig_${p.key}_${ax}`); if(!inp)return;
    inp.addEventListener('input',()=>{ clearAnim(); state.rig[p.key][ax]=+inp.value; inp.nextElementSibling.textContent=Math.round(+inp.value)+'°'; applyRig(); $$('#poseGrid .pose-btn').forEach(b=>b.classList.remove('on')); });
  }));
  JOINTS.forEach(j=>['x','y','z'].forEach(ax=>{
    const inp=$(`#joint_${j.key}_${ax}`); if(!inp)return;
    inp.addEventListener('input',()=>{ clearAnim(); state.joints[j.key][ax]=+inp.value; inp.nextElementSibling.textContent=Math.round(+inp.value)+'°'; applyRig(); syncSecondLayerVisibility(); $$('#poseGrid .pose-btn').forEach(b=>b.classList.remove('on')); });
  }));
  bindRange('#bodyYaw','#bodyYawV',v=>{clearAnim();state.bodyYaw=+v;applyRig();},v=>Math.round(v)+'°');
  bindRange('#bodyPitch','#bodyPitchV',v=>{clearAnim();state.bodyPitch=+v;applyRig();},v=>Math.round(v)+'°');

  // pose library
  $('#savePose').onclick=savePose;
  $('#importPose').onclick=()=>$('#filePose').click();
  $('#filePose').onchange=e=>{const f=e.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{const d=JSON.parse(rd.result);applyPoseData(d); if(d.name){state.poseLib.unshift(d);saveLib();} toast('Imported pose');}catch(err){toast('Invalid pose file',true);}};rd.readAsText(f);};

  // filter presets + sliders
  $('#filterPresets').addEventListener('click',e=>{const b=e.target.closest('.chip');if(b)applyFilterPreset(b.dataset.fp);});
  FILTER_SLIDERS.forEach(s=>{const inp=$(`#f_${s.k}`);inp.addEventListener('input',()=>{
    state.filters[s.k]=+inp.value; $(`#f_${s.k}_v`).textContent=(s.step?(+inp.value).toFixed(1):Math.round(+inp.value))+s.unit;
    applyFilters(); markCustomFilter();
  });});
  bindColor('#tintColor','#tintHex',v=>{state.tint.color=v;applyFilters();});
  bindRange('#tintAmt','#tintAmtV',v=>{state.tint.amt=+v;applyFilters();markCustomFilter();},v=>Math.round(v)+'%');
  $('#resetFilters').onclick=()=>applyFilterPreset('none');

  // background
  $('#bgModes').addEventListener('click',e=>{const b=e.target.closest('.bg-mode');if(!b)return;
    $$('#bgModes .bg-mode').forEach(x=>x.classList.toggle('on',x===b)); state.bg.mode=b.dataset.bg;
    ['Solid','Gradient','Chroma','Image'].forEach(m=>{const el=$('#bg'+m);if(el)el.style.display='none';});
    const map={solid:'Solid',gradient:'Gradient',chroma:'Chroma',image:'Image'};
    if(map[state.bg.mode]) $('#bg'+map[state.bg.mode]).style.display='block';
    applyBg();
  });
  bindColor('#bgSolidColor','#bgSolidHex',v=>{state.bg.solid=v;applyBg();});
  bindColor('#bgG1','#bgG1Hex',v=>{state.bg.g1=v;applyBg();});
  bindColor('#bgG2','#bgG2Hex',v=>{state.bg.g2=v;applyBg();});
  bindRange('#bgGAngle','#bgGAngleV',v=>{state.bg.gAngle=+v;applyBg();},v=>Math.round(v)+'°');
  $('#chromaChips').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;
    $$('#chromaChips .chip').forEach(x=>x.classList.toggle('on',x===b)); state.bg.chroma=b.dataset.chroma; applyBg();});
  $('#bgUpload').onclick=()=>$('#fileBg').click();
  $('#fileBg').onchange=e=>{const f=e.target.files[0];if(!f)return;const im=new Image();im.onload=()=>{state.bg.img=im;applyBg();};im.src=fileToURL(f);};
  $('#bgFit').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$('#bgFit button').forEach(x=>x.classList.toggle('on',x===b));state.bg.fit=b.dataset.fit;applyBg();});

  // lights
  bindRange('#ambLight','#ambLightV',v=>{state.amb=+v;applyLights();},v=>Math.round(v)+'%');
  bindRange('#keyLight','#keyLightV',v=>{state.key=+v;applyLights();},v=>Math.round(v)+'%');
  bindRange('#modelExposure','#modelExposureV',v=>{state.exposure=+v;applyLights();},v=>Math.round(v)+'%');
  $('#skinLayerMode').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    $$('#skinLayerMode button').forEach(x=>x.classList.toggle('on',x===b));
    state.render.layerStyle=b.dataset.layer;
    syncSecondLayerVisibility();
  });
  bindRange('#skinLayerDepth','#skinLayerDepthV',v=>{
    state.render.layerDepth=+v;
    rebuildSecondLayerModel();
  },v=>(+v).toFixed(2));
  $('#capeToggle').onclick=()=>{state.cape=!state.cape;if(state.cape)state.elytra=false;$('#capeToggle').classList.toggle('on',state.cape);$('#elytraToggle').classList.remove('on');applyCape();};
  $('#elytraToggle').onclick=()=>{state.elytra=!state.elytra;if(state.elytra)state.cape=false;$('#elytraToggle').classList.toggle('on',state.elytra);$('#capeToggle').classList.remove('on');applyCape();};

  // thumbnail
  $('#thumbToggle').onclick=()=>{state.thumb.on=!state.thumb.on;
    $('#thumbControls').style.display=state.thumb.on?'block':'none';
    $('#thumbToggleLbl').textContent=state.thumb.on?'Disable thumbnail composer':'Enable thumbnail composer';
    $('#thumbToggle').classList.toggle('on',state.thumb.on);
    updateThumbFrame(); updateOutDims();
  };
  $('#thumbTitle').oninput=e=>{state.thumb.title=e.target.value;};
  $('#thumbSub').oninput=e=>{state.thumb.sub=e.target.value;};
  bindRange('#thumbFont','#thumbFontV',v=>state.thumb.font=+v,v=>Math.round(v));
  bindColor('#thumbCol','#thumbColHex',v=>state.thumb.col=v);
  bindColor('#thumbOut','#thumbOutHex',v=>state.thumb.out=v);
  bindRange('#thumbOutW','#thumbOutWV',v=>state.thumb.outW=+v,v=>Math.round(v));
  $('#thumbAlign').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$('#thumbAlign button').forEach(x=>x.classList.toggle('on',x===b));state.thumb.align=b.dataset.al;});
  bindRange('#thumbModelX','#thumbModelXV',v=>state.thumb.mx=+v,v=>Math.round(v)+'%');
  bindRange('#thumbModelS','#thumbModelSV',v=>state.thumb.ms=+v,v=>Math.round(v)+'%');

  // export
  $('#fmtSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$('#fmtSeg button').forEach(x=>x.classList.toggle('on',x===b));state.exp.fmt=b.dataset.fmt;});
  $('#aspectGrid').addEventListener('click',e=>{const b=e.target.closest('.size-btn');if(!b)return;$$('#aspectGrid .size-btn').forEach(x=>x.classList.toggle('on',x===b));state.exp.aspect=b.dataset.aspect;updateOutDims();});
  $('#resSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$('#resSeg button').forEach(x=>x.classList.toggle('on',x===b));state.exp.res=b.dataset.res;updateOutDims();});
  $('#renderBtn').onclick=()=>doExport(false);
  $('#copyBtn').onclick=()=>doExport(true);
  $('#quickExport').onclick=()=>{ $$('#tabs button').forEach(x=>x.classList.toggle('on',x.dataset.tab==='export')); $$('.pane').forEach(p=>p.classList.toggle('on',p.dataset.pane==='export')); doExport(false); };

  // drag & drop skin onto stage
  const stage=$('#stage');
  ['dragenter','dragover'].forEach(ev=>stage.addEventListener(ev,e=>{e.preventDefault();$('#dropMsg').classList.add('show');}));
  ['dragleave','drop'].forEach(ev=>stage.addEventListener(ev,e=>{e.preventDefault();if(ev==='drop'||!stage.contains(e.relatedTarget))$('#dropMsg').classList.remove('show');}));
  stage.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f&&/image/.test(f.type)){applySkin(fileToURL(f),f.name.replace(/\.[^.]+$/,''));toast('Skin loaded');}});

  window.addEventListener('resize',()=>updateThumbFrame());
}

function applyFilterPreset(key){
  const p=FILTER_PRESETS[key]; if(!p) return;
  Object.assign(state.filters, p.f);
  state.tint.amt = p.tint?p.tint.amt:0;
  if(p.tint&&p.tint.color){ state.tint.color=p.tint.color; $('#tintColor').value=p.tint.color; $('#tintHex').textContent=p.tint.color; }
  // sync sliders
  FILTER_SLIDERS.forEach(s=>{const inp=$(`#f_${s.k}`);inp.value=state.filters[s.k];$(`#f_${s.k}_v`).textContent=(s.step?(+state.filters[s.k]).toFixed(1):Math.round(state.filters[s.k]))+s.unit;});
  $('#tintAmt').value=state.tint.amt; $('#tintAmtV').textContent=Math.round(state.tint.amt)+'%';
  $$('#filterPresets .chip').forEach(c=>c.classList.toggle('on',c.dataset.fp===key));
  applyFilters();
}
function markCustomFilter(){ $$('#filterPresets .chip').forEach(c=>c.classList.remove('on')); }

function setView(v){
  const vw=state.viewer;
  const yaw={front:0,three:-30,side:-90,back:180}[v]??0;
  state.bodyYaw=yaw; $('#bodyYaw').value=yaw; $('#bodyYawV').textContent=yaw+'°';
  applyRig(); vw.controls.reset(); vw.zoom=0.82;
}
function updateThumbFrame(){
  const show = state.thumb.on && $('.pane[data-pane="thumb"]').classList.contains('on');
  const tf=$('#thumbFrame'); if(!show){ tf.classList.remove('show'); return; }
  const stage=$('#stage').getBoundingClientRect();
  const w=Math.min(stage.width*0.82, stage.height*0.82*16/9);
  const h=w*9/16;
  tf.style.width=w+'px'; tf.style.height=h+'px';
  tf.style.left=(stage.width-w)/2+'px'; tf.style.top=(stage.height-h)/2+'px';
  tf.classList.add('show');
}
function updateOutDims(){
  let W,H;
  if(state.thumb.on){ W=state.exp.res==='4k'?3840:state.exp.res==='2k'?1920:1280; H=Math.round(W*9/16); }
  else { const ar=ASPECTS[state.exp.aspect].r, long=RES[state.exp.res]; if(ar>=1){W=long;H=Math.round(long/ar);}else{H=long;W=Math.round(long*ar);} }
  $('#outDims').textContent=W+' × '+H+' px';
}

/* ===================== HELPERS ===================== */
function bindRange(sel,valSel,fn,fmt){const inp=$(sel),v=$(valSel);inp.addEventListener('input',()=>{fn(inp.value);if(v)v.textContent=fmt?fmt(inp.value):inp.value;});}
function bindColor(sel,hexSel,fn){const inp=$(sel),h=$(hexSel);inp.addEventListener('input',()=>{if(h)h.textContent=inp.value;fn(inp.value);});}
function setStatus(label){
  const c=$('#statusChip'); c.classList.toggle('live',state.hasSkin);
  const m=state.model==='auto-detect'?('auto · '+state.detected):state.model==='slim'?'slim':'classic';
  $('#statusText').innerHTML = state.hasSkin ? `<b>${escapeHtml(label||lastLabel)}</b> · <span class="mono">${m}</span>` : 'No skin loaded';
  if(label) lastLabel=label;
}
let lastLabel='';
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
let toastT;
function toast(msg,err){const t=$('#toast');$('#toastMsg').textContent=msg;t.classList.toggle('err',!!err);t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2600);}
function showLoad(msg){$('#loadMsg').textContent=msg||'Working…';$('#loadOverlay').classList.add('show');}
function hideLoad(){$('#loadOverlay').classList.remove('show');}

/* ---- tiny pose preview icons ---- */
function poseSVG(kind){
  const base=(arms,legs,extra='')=>`<svg class="pi" viewBox="0 0 40 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="20" cy="9" r="5" fill="currentColor" stroke="none"/><line x1="20" y1="14" x2="20" y2="30"/>${arms}${legs}${extra}</svg>`;
  const A={
    down:'<line x1="20" y1="17" x2="12" y2="29"/><line x1="20" y1="17" x2="28" y2="29"/>',
    out:'<line x1="20" y1="18" x2="7" y2="18"/><line x1="20" y1="18" x2="33" y2="18"/>',
    up:'<line x1="20" y1="17" x2="10" y2="6"/><line x1="20" y1="17" x2="30" y2="6"/>',
    wave:'<line x1="20" y1="17" x2="12" y2="29"/><line x1="20" y1="17" x2="31" y2="5"/>',
    point:'<line x1="20" y1="18" x2="12" y2="29"/><line x1="20" y1="18" x2="34" y2="20"/>',
    cross:'<line x1="20" y1="20" x2="12" y2="24"/><line x1="20" y1="20" x2="28" y2="24"/>',
    fwd:'<line x1="20" y1="18" x2="30" y2="24"/><line x1="20" y1="18" x2="30" y2="14"/>',
  };
  const L={
    stand:'<line x1="20" y1="30" x2="14" y2="44"/><line x1="20" y1="30" x2="26" y2="44"/>',
    walk:'<line x1="20" y1="30" x2="13" y2="43"/><line x1="20" y1="30" x2="27" y2="42"/>',
    sit:'<line x1="20" y1="30" x2="32" y2="32"/><line x1="20" y1="30" x2="32" y2="38"/>',
    kneel:'<line x1="20" y1="30" x2="12" y2="40"/><line x1="20" y1="30" x2="28" y2="44"/>',
  };
  switch(kind){
    case 'rest': return base(A.down,L.stand);
    case 'tpose':return base(A.out,L.stand);
    case 'walk':return base(A.point,L.walk);
    case 'run': return base(A.fwd,L.walk);
    case 'wave':return base(A.wave,L.stand);
    case 'point':return base(A.point,L.stand);
    case 'cross':return base(A.cross,L.stand);
    case 'cheer':return base(A.up,L.stand);
    case 'sit': return base(A.fwd,L.sit);
    case 'sneak':return base(A.down,L.walk,'<line x1="20" y1="14" x2="20" y2="30" transform="rotate(8 20 22)"/>');
    case 'hero':return base(A.fwd,L.kneel);
    case 'fight':return base(A.cross,L.walk);
    default: return base(A.down,L.stand);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
})();
