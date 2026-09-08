import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.querySelector('#scene');
const stage = document.querySelector('.stage');
const status = document.querySelector('#load-status');
const motionButton = document.querySelector('#motion');
const unfoldButton = document.querySelector('#unfold');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const state = { playing: !reducedMotion.matches, unfolded: false, light: 'day', ready: false, failed: false };
const metrics = { modelLoadMs: null, frames: 0, frameIntervals: [], triangles: 0, drawCalls: 0, pixelRatio: 1 };
// A read-only snapshot supports repeatable performance checks without adding technical UI.
Object.defineProperty(window, '__orbitDiagnostics', { get() {
  const frames = metrics.frameIntervals.slice().sort((a,b) => a-b);
  const average = frames.reduce((a,b) => a+b,0) / (frames.length || 1);
  return { ...state, modelLoadMs: metrics.modelLoadMs, sampledFrames: frames.length,
    averageFps: average ? +(1000/average).toFixed(1) : null,
    p95FrameMs: frames.length ? +frames[Math.floor((frames.length-1)*.95)].toFixed(2) : null,
    triangles: metrics.triangles, drawCalls: metrics.drawCalls, pixelRatio: metrics.pixelRatio,
    viewport: { width: canvas.clientWidth, height: canvas.clientHeight }, renderer: 'WebGL2' };
}});

function updateMotionButton() {
  motionButton.setAttribute('aria-pressed',String(state.playing));
  motionButton.querySelector('.motion-icon').textContent=state.playing?'Ⅱ':'▷';
  motionButton.querySelector('.motion-label').textContent=state.playing?'暂停':'播放';
}
function fallback(message) {
  state.failed=true; state.ready=false;
  stage.classList.remove('ready');
  status.textContent=message;
  status.style.top='auto';status.style.bottom='44px';
  canvas.style.display='none';
  document.querySelector('#gesture-hint').textContent='作品静态预览';
  for (const b of document.querySelectorAll('.control-bar button, #reset-view')) b.disabled=true;
}
updateMotionButton();

try {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setClearColor(0,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.1;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(34,1,.1,60);
  const initialCamera=new THREE.Vector3(5.1,3.75,7.4);
  camera.position.copy(initialCamera);
  const controls=new OrbitControls(camera,canvas);
  controls.target.set(0,1.65,0);
  controls.enableDamping=true;
  controls.dampingFactor=.065;
  controls.enablePan=false;
  controls.minDistance=5.6;
  controls.maxDistance=13;
  controls.minPolarAngle=.22;
  controls.maxPolarAngle=Math.PI*.49;
  controls.update();
  controls.saveState();
  const generator=new THREE.PMREMGenerator(renderer);
  const room=new RoomEnvironment();
  const environment=generator.fromScene(room,.04);
  scene.environment=environment.texture;
  room.dispose();generator.dispose();
  const hemi=new THREE.HemisphereLight(0xffffff,0x6c7361,2.0);scene.add(hemi);
  const key=new THREE.DirectionalLight(0xfff3de,4.1);key.position.set(3,7,5);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-4;key.shadow.camera.right=4;
  key.shadow.camera.top=5;key.shadow.camera.bottom=-3;key.shadow.normalBias=.025;
  key.shadow.bias=-.0001;scene.add(key);
  const rim=new THREE.DirectionalLight(0xd1efff,3);rim.position.set(-4,3,-3);scene.add(rim);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(18,18),new THREE.ShadowMaterial({color:0x3a4437,opacity:.16}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.007;floor.receiveShadow=true;scene.add(floor);

  let sculpt, rings=[], phase=0, previous=0, expansion=0;
  const localAxis=new THREE.Vector3(1,0,0), spin=new THREE.Quaternion();
  const loadStart=performance.now();
  const loadingTimeout=setTimeout(()=>{if(!state.ready)status.textContent='作品仍在加载，稍等片刻…';},12000);
  new GLTFLoader().load('./assets/orbit.glb',gltf=>{
    clearTimeout(loadingTimeout);
    sculpt=gltf.scene;
    sculpt.traverse(obj=>{
      if(obj.isMesh){obj.castShadow=true;obj.receiveShadow=true;obj.material.envMapIntensity=1.5;}
    });
    rings=['Orbit_outer','Orbit_middle','Orbit_inner'].map(name=>sculpt.getObjectByName(name)).filter(Boolean).map(obj=>({obj,position:obj.position.clone(),quaternion:obj.quaternion.clone()}));
    scene.add(sculpt);
    metrics.modelLoadMs=Math.round(performance.now()-loadStart);
    renderer.render(scene,camera);
    state.ready=true;stage.classList.add('ready');status.textContent='作品已就绪';
    metrics.frameIntervals=[];previous=0;
  },undefined,error=>{clearTimeout(loadingTimeout);console.error('Orbit asset loading failed',error);fallback('互动模型未能加载，正在显示静态作品。');renderer.setAnimationLoop(null);});

  const palettes={
    day:{key:0xfff3de,rim:0xd1efff,sky:0xffffff,ground:0x6c7361,exposure:1.1,environment:1.5},
    dusk:{key:0xffbf82,rim:0xff7452,sky:0xffd1a8,ground:0x62413b,exposure:1.05,environment:1.2},
    night:{key:0x9acaff,rim:0x75ffda,sky:0x678998,ground:0x142933,exposure:.9,environment:.8}
  };
  document.querySelectorAll('[data-light]').forEach(button=>button.addEventListener('click',()=>{
    state.light=button.dataset.light;document.body.dataset.light=state.light;
    document.querySelectorAll('[data-light]').forEach(b=>{const active=b===button;b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active));});
    const palette=palettes[state.light];key.color.setHex(palette.key);rim.color.setHex(palette.rim);
    hemi.color.setHex(palette.sky);hemi.groundColor.setHex(palette.ground);renderer.toneMappingExposure=palette.exposure;
    sculpt?.traverse(obj=>{if(obj.isMesh)obj.material.envMapIntensity=palette.environment;});
  }));
  motionButton.addEventListener('click',()=>{state.playing=!state.playing;updateMotionButton();});
  unfoldButton.addEventListener('click',()=>{
    state.unfolded=!state.unfolded;unfoldButton.setAttribute('aria-pressed',String(state.unfolded));
    unfoldButton.innerHTML=state.unfolded?'合拢轨道 <span>↙</span>':'展开轨道 <span>↗</span>';
  });
  document.querySelector('#reset-view').addEventListener('click',()=>controls.reset());
  reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches){state.playing=false;updateMotionButton();}});
  canvas.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(event.key))return;
    event.preventDefault();
    const delta=camera.position.clone().sub(controls.target);
    const spherical=new THREE.Spherical().setFromVector3(delta);
    if(event.key==='ArrowLeft')spherical.theta-=.12;
    if(event.key==='ArrowRight')spherical.theta+=.12;
    if(event.key==='ArrowUp')spherical.phi-=.1;
    if(event.key==='ArrowDown')spherical.phi+=.1;
    if(event.key==='+'||event.key==='=')spherical.radius*=.9;
    if(event.key==='-')spherical.radius*=1.1;
    spherical.phi=THREE.MathUtils.clamp(spherical.phi,controls.minPolarAngle,controls.maxPolarAngle);
    spherical.radius=THREE.MathUtils.clamp(spherical.radius,controls.minDistance,controls.maxDistance);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();
  });

  const resize=()=>{
    const {width,height}=stage.getBoundingClientRect();
    metrics.pixelRatio=Math.min(devicePixelRatio,width<600?1.5:1.75);
    renderer.setPixelRatio(metrics.pixelRatio);
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
    metrics.frameIntervals=[];previous=0;
  };
  new ResizeObserver(resize).observe(stage);resize();
  function frame(time){
    const elapsed=previous?time-previous:16.7;previous=time;
    const dt=Math.min(elapsed/1000,.05);
    if(state.ready&&elapsed>0&&elapsed<250){metrics.frameIntervals.push(elapsed);if(metrics.frameIntervals.length>240)metrics.frameIntervals.shift();}
    if(state.playing)phase+=dt;
    expansion=reducedMotion.matches?Number(state.unfolded):THREE.MathUtils.damp(expansion,Number(state.unfolded),4,dt);
    rings.forEach(({obj,position,quaternion},i)=>{
      spin.setFromAxisAngle(localAxis,Math.sin(phase*.25+i)*.19+phase*(i%2?-.11:.09));
      obj.quaternion.copy(quaternion).multiply(spin);
      obj.position.copy(position);
      obj.position.x+=(i-1)*.34*expansion;obj.position.y+=(i+1)*.12*expansion;
      obj.scale.setScalar(1+expansion*.07);
    });
    controls.update();renderer.render(scene,camera);
    metrics.triangles=renderer.info.render.triangles;metrics.drawCalls=renderer.info.render.calls;metrics.frames++;
    if(metrics.frames%60===0)canvas.dataset.renderStats=JSON.stringify(window.__orbitDiagnostics);
  }
  document.addEventListener('visibilitychange',()=>{
    previous=0;metrics.frameIntervals=[];renderer.setAnimationLoop(document.hidden||state.failed?null:frame);
  });
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();renderer.setAnimationLoop(null);fallback('图形渲染已暂停，刷新页面可以重试。');});
  renderer.setAnimationLoop(frame);
} catch(error) {
  console.error('Orbit renderer could not start',error);
  fallback('当前浏览器无法启动 3D，正在显示静态作品。');
}
