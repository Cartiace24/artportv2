import * as THREE from 'three';
import { artworks, portfolio, replacePortfolio } from './artworks.js';

const canvas = document.querySelector('#world');
const labelLayer = document.querySelector('#art-labels');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f6f3ed');
const camera = new THREE.PerspectiveCamera(38, 1, .1, 80);
camera.position.set(0, 0, 9);
let currentTarget = new THREE.Vector3(0, 0, -2);
let destination = { position: camera.position.clone(), target: currentTarget.clone() };
let savedView = null;
let pointerStart = null;
let dragDelta = 0;
let focused = false;
let travel = 0;
let travelTarget = 0;
const cameraPan = new THREE.Vector2();
let raf = 0;
let renderer;
let disposed = false;
let loadedArtworkCount = 0;
let loadTargetCount = 0;
let sceneRevision = 0;
let hoveredGroup = null;
let curatorMode = false;
let curatorSelection = null;
let curatorDrag = false;
let curatorHasMoved = false;
let curatorTool = 'move';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clickable = [];
const interactiveGroups = [];
const labels = new Map();
const textures = [];
const materials = [];
const geometries = [];
const root = new THREE.Group();
scene.add(root);

function finishArtworkLoad() {
  loadedArtworkCount += 1;
  const progress = Math.round(loadedArtworkCount / Math.max(loadTargetCount, 1) * 100);
  document.querySelector('#loading-progress').style.width = `${progress}%`;
  document.querySelector('.loading-line').setAttribute('aria-valuenow', String(progress));
  if (loadedArtworkCount === artworks.length) setTimeout(() => document.querySelector('#loading-screen').classList.add('done'), 180);
}

function makeLabel(art, index) {
  const label = document.createElement('button');
  label.type = 'button';
  label.className = 'art-label';
  label.dataset.artId = art.id;
  label.tabIndex = -1;
  label.setAttribute('aria-label', `Explore ${art.title}`);
  const number = document.createElement('span');
  number.textContent = String(index + 1).padStart(2, '0');
  const title = document.createElement('span');
  title.textContent = art.title;
  label.append(number, title);
  label.addEventListener('click', () => window.dispatchEvent(new CustomEvent('artwork-select', { detail: art })));
  labelLayer.append(label);
  labels.set(art.id, label);
}

function addArtwork(art, index) {
  const revision = sceneRevision;
  const [x, y, z] = art.position;
  const [w, h] = art.size;
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.z = art.rotation || 0;
  group.userData.restZ = z;
  group.userData.hoverAmount = 0;
  group.userData.art = art;
  group.userData.artId = art.id;
  root.add(group);
  interactiveGroups.push(group);

  const plateGeo = new THREE.BoxGeometry(w + .045, h + .045, .035);
  geometries.push(plateGeo);
  const plateMat = new THREE.MeshBasicMaterial({ color: '#fffefa' });
  materials.push(plateMat);
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.z = -.025;
  group.add(plate);

  const pictureGeo = new THREE.PlaneGeometry(w, h);
  geometries.push(pictureGeo);
  const pictureMat = new THREE.MeshBasicMaterial({ color: '#e8e2d6', transparent: true, opacity: 1, toneMapped: false });
  materials.push(pictureMat);
  const picture = new THREE.Mesh(pictureGeo, pictureMat);
  picture.position.z = .002;
  picture.userData.art = art;
  group.add(picture);
  clickable.push(picture);

  const image = new Image();
  image.onload = () => {
    if (disposed || revision !== sceneRevision) return;
    const imageCanvas = document.createElement('canvas');
    const scale = Math.min(1, 1536 / Math.max(image.naturalWidth, image.naturalHeight));
    imageCanvas.width = Math.round(image.naturalWidth * scale);
    imageCanvas.height = Math.round(image.naturalHeight * scale);
    imageCanvas.getContext('2d').drawImage(image, 0, 0, imageCanvas.width, imageCanvas.height);
    const texture = new THREE.CanvasTexture(imageCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    textures.push(texture);
    pictureMat.map = texture;
    pictureMat.needsUpdate = true;
    invalidate();
    finishArtworkLoad();
  };
  image.onerror = () => { if (revision === sceneRevision) finishArtworkLoad(); };
  image.src = art.image;
  makeLabel(art, index);
}

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.25 : 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  const ambient = new THREE.HemisphereLight('#fffdf8', '#d9d4ca', 2.1);
  scene.add(ambient);
  const softLight = new THREE.DirectionalLight('#fffaf0', 1.15);
  softLight.position.set(-4, 7, 9);
  scene.add(softLight);
  const publicWorks=artworks.filter(art=>art.published!==false&&art.visible!==false&&!art.archived);
  loadTargetCount=publicWorks.length;
  publicWorks.forEach(addArtwork);
  if (!loadTargetCount) document.querySelector('#loading-screen').classList.add('done');
} catch (error) {
  console.error('Unable to create the gallery scene:', error);
  document.querySelector('#error-note').hidden = false;
  document.querySelector('#loading-screen').classList.add('done');
}

function updateLabels() {
  const projected = new THREE.Vector3();
  const width = innerWidth;
  const height = innerHeight;
  for (const art of artworks.filter(item => curatorMode || (item.published !== false && item.visible !== false && !item.archived))) {
    const label = labels.get(art.id);
    const group = interactiveGroups.find(item => item.userData.art.id === art.id);
    if (!group || !label) continue;
    projected.set(group.position.x, group.position.y + art.size[1] / 2 + .12, group.position.z).project(camera);
    const x = (projected.x * .5 + .5) * width;
    const y = (-projected.y * .5 + .5) * height;
    const visible = projected.z > -1 && projected.z < 1 && x > -100 && x < width + 20 && y > 25 && y < height - 20;
    label.style.transform = `translate(${x}px, ${y}px)`;
    const visibleToPointer = visible && !focused && innerWidth >= 760 && !curatorMode;
    label.style.opacity = visibleToPointer ? '1' : '0';
    label.style.pointerEvents = visibleToPointer ? 'auto' : 'none';
    label.tabIndex = visible && !focused ? 0 : -1;
  }
}

function invalidate() {
  if (renderer && !disposed && !raf) raf = requestAnimationFrame(renderFrame);
}
function renderFrame() {
  raf = 0;
  if (disposed || !renderer) return;
  let hoverMoving = false;
  for (const group of interactiveGroups) {
    const target = group === hoveredGroup && !focused ? 1 : 0;
    group.userData.hoverAmount += (target - group.userData.hoverAmount) * (reduceMotion ? 1 : .15);
    const amount = group.userData.hoverAmount;
    group.scale.setScalar(1 + amount * .018);
    group.position.z = group.userData.restZ + amount * .06;
    if (Math.abs(target - amount) > .01) hoverMoving = true;
  }
  if (!focused && Math.abs(travelTarget - travel) > .001) {
    travel += (travelTarget - travel) * (reduceMotion ? 1 : .08);
    setGalleryDestination();
  }
  const moving = camera.position.distanceTo(destination.position) > .003 || currentTarget.distanceTo(destination.target) > .003 || hoverMoving || (!focused && Math.abs(travelTarget - travel) > .001);
  camera.position.lerp(destination.position, reduceMotion ? 1 : .06);
  currentTarget.lerp(destination.target, reduceMotion ? 1 : .06);
  camera.lookAt(currentTarget);
  updateLabels();
  renderer.render(scene, camera);
  if (moving) raf = requestAnimationFrame(renderFrame);
}
function moveTo(position, target) {
  destination = { position: position.clone(), target: target.clone() };
  invalidate();
}
function setGalleryDestination() {
  destination = {
    position: new THREE.Vector3(cameraPan.x, cameraPan.y, 9 - travel),
    target: new THREE.Vector3(cameraPan.x, cameraPan.y, -2 - travel),
  };
}
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < 760 ? 48 : 38;
  camera.updateProjectionMatrix();
  const horizontalScale = innerWidth < 760 ? .38 : 1;
  for (const group of interactiveGroups) {
    const { art } = group.userData;
    group.position.x = art.position[0] * horizontalScale;
    const mobileVerticalAdjustment = art.id === 'work-02' ? .45 : ['work-03', 'work-05'].includes(art.id) ? -.75 : 0;
    group.position.y = art.position[1] + (innerWidth < 760 && !curatorMode ? mobileVerticalAdjustment : 0);
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.25 : 1.6));
  renderer.setSize(innerWidth, innerHeight, false);
  invalidate();
}
window.addEventListener('resize', resize);
resize();
invalidate();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function pick(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height * 2 - 1));
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(clickable, false)[0]?.object.userData.art ?? null;
}
function updateHover(event) {
  if (focused || pointerStart) return;
  const rect = canvas.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height * 2 - 1));
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(clickable, false)[0]?.object;
  const next = hit?.parent ?? null;
  if (next !== hoveredGroup) {
    hoveredGroup = next;
    canvas.style.cursor = next ? 'pointer' : innerWidth >= 760 ? 'grab' : 'default';
    invalidate();
  }
}
window.addEventListener('curator-select', event => {
  curatorSelection = event.detail.id;
  for (const group of interactiveGroups) {
    const previous = group.userData.selectionHelper;
    if (previous) { group.remove(previous); previous.geometry.dispose(); previous.material.dispose(); group.userData.selectionHelper = null; }
    if (group.userData.art.id === curatorSelection) {
      const [w,h]=group.userData.art.size;
      const helper=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w+.12,h+.12,.055)),new THREE.LineBasicMaterial({color:'#985f45'}));
      helper.position.z=.04; group.add(helper); group.userData.selectionHelper=helper;
    }
  }
  invalidate();
});
window.addEventListener('curator-deselect', () => {
  curatorSelection = null;
  for (const group of interactiveGroups) { const helper=group.userData.selectionHelper; if(helper){group.remove(helper);helper.geometry.dispose();helper.material.dispose();group.userData.selectionHelper=null;} }
  invalidate();
});
canvas.addEventListener('pointerdown', event => {
  if (curatorMode) {
    const selectedArt = pick(event);
    if (selectedArt) {
      curatorSelection = selectedArt.id;
      curatorDrag = true;
      curatorHasMoved = false;
      pointerStart = { x: event.clientX, y: event.clientY };
      dragDelta = 0;
      canvas.setPointerCapture(event.pointerId);
      window.dispatchEvent(new CustomEvent('curator-select', { detail: selectedArt }));
      canvas.style.cursor = 'grabbing';
      invalidate();
      return;
    }
    window.dispatchEvent(new CustomEvent('curator-deselect'));
  }
  pointerStart = { x: event.clientX, y: event.clientY };
  dragDelta = 0;
  canvas.style.cursor = 'grabbing';
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (curatorMode && curatorDrag && pointerStart) {
    const group = interactiveGroups.find(item => item.userData.art.id === curatorSelection);
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    if (!curatorHasMoved && Math.max(Math.abs(dx),Math.abs(dy)) > 1) {
      curatorHasMoved = true;
      window.dispatchEvent(new CustomEvent('curator-move-start', { detail:group?.userData.art }));
    }
    if (group) {
      if (curatorTool === 'move') {
        group.position.x = THREE.MathUtils.clamp(group.position.x + dx * .012, -5.3, 5.3);
        group.position.y = THREE.MathUtils.clamp(group.position.y - dy * .012, -3.1, 3.1);
      } else if (curatorTool === 'rotate') group.rotation.z = THREE.MathUtils.clamp(group.rotation.z + dx * .01, -Math.PI, Math.PI);
      else {
        const art=group.userData.art;
        const ratio=THREE.MathUtils.clamp(1 + dx * .006, .55, 1.5);
        art.size=[THREE.MathUtils.clamp(art.size[0]*ratio,.4,4),THREE.MathUtils.clamp(art.size[1]*ratio,.4,4)];
        for(const child of group.children){if(child.geometry?.type==='PlaneGeometry'||child.geometry?.type==='BoxGeometry')child.scale.set(art.size[0]/child.geometry.parameters.width,art.size[1]/child.geometry.parameters.height,1);}
      }
      group.userData.art.position = [group.position.x, group.position.y, group.position.z];
      group.userData.art.rotation = group.rotation.z;
      group.userData.art.placement.rotation = group.rotation.z;
      group.userData.art.placement.size = [...group.userData.art.size];
      group.userData.art.placement.position = [...group.userData.art.position];
      window.dispatchEvent(new CustomEvent('curator-move', { detail: group.userData.art }));
      invalidate();
    }
    pointerStart = { x: event.clientX, y: event.clientY };
    return;
  }
  if (pointerStart && !focused) {
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    dragDelta = Math.max(dragDelta, Math.abs(dx), Math.abs(dy));
    if (innerWidth >= 760 && dragDelta > 5) {
      cameraPan.x = THREE.MathUtils.clamp(cameraPan.x - dx * .009, -4.8, 4.8);
      cameraPan.y = THREE.MathUtils.clamp(cameraPan.y + dy * .008, -2.8, 2.8);
      setGalleryDestination();
      invalidate();
    } else if (innerWidth < 760 && dragDelta > 8) {
      setTravel(travelTarget - dy * .012);
    }
    pointerStart = { x: event.clientX, y: event.clientY };
  } else updateHover(event);
});
canvas.addEventListener('pointerup', event => {
  if (!pointerStart) return;
  const wasDrag = dragDelta > (innerWidth >= 760 ? 5 : 8);
  pointerStart = null;
  curatorDrag = false;
  curatorHasMoved = false;
  if (curatorMode) { canvas.style.cursor = 'grab'; return; }
  if (!wasDrag) { const art = pick(event); if (art) window.dispatchEvent(new CustomEvent('artwork-select', { detail: art })); }
  canvas.style.cursor = innerWidth >= 760 ? 'grab' : 'default';
});
canvas.addEventListener('pointercancel', () => { pointerStart = null; curatorDrag = false; curatorHasMoved = false; hoveredGroup = null; canvas.style.cursor = innerWidth >= 760 ? 'grab' : 'default'; invalidate(); });
canvas.addEventListener('pointerleave', () => { if (!pointerStart) { hoveredGroup = null; invalidate(); } });
canvas.style.cursor = innerWidth >= 760 ? 'grab' : 'default';

function setTravel(value) {
  travelTarget = THREE.MathUtils.clamp(value, 0, 6.8);
  updatePositionIndicator();
  invalidate();
}
function updatePositionIndicator() {
  const total = artworks.filter(art => curatorMode || (art.published !== false && art.visible !== false && !art.archived)).length;
  const count = Math.max(total, 1);
  const positionIndex = Math.min(count, Math.floor(travelTarget / (6.8 / Math.max(count - 1, 1))) + 1);
  const label = `${String(positionIndex).padStart(2, '0')} / ${String(count).padStart(2, '0')}`;
  document.querySelector('#mobile-position').textContent = label;
  document.querySelector('#gallery-position').textContent = label;
  const progress = document.querySelector('#gallery-progress-bar');
  progress.setAttribute('aria-valuemax', String(count));
  progress.style.setProperty('--progress', `${positionIndex / count * 100}%`);
  progress.setAttribute('aria-valuenow', String(positionIndex));
  document.querySelector('#mobile-previous').disabled = travelTarget <= .01;
  document.querySelector('#mobile-next').disabled = count <= 1 || travelTarget >= 6.79;
}
updatePositionIndicator();
function travelStep() { return 6.8 / Math.max(artworks.filter(art => curatorMode || (art.published !== false && art.visible !== false && !art.archived)).length - 1, 1); }
document.querySelector('#mobile-previous').addEventListener('click', () => setTravel(travelTarget - travelStep()));
document.querySelector('#mobile-next').addEventListener('click', () => setTravel(travelTarget + travelStep()));
window.addEventListener('keydown', event => {
  if (focused || document.querySelector('.editorial-view.open')) return;
  if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select')) return;
  if (event.key === 'ArrowDown' || event.key === 'PageDown') {
    event.preventDefault();
    setTravel(travelTarget + travelStep());
  } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
    event.preventDefault();
    setTravel(travelTarget - travelStep());
  }
});
window.addEventListener('wheel', event => {
  if (focused || document.querySelector('.editorial-view.open')) return;
  event.preventDefault();
  setTravel(travelTarget + event.deltaY * .006);
}, { passive: false });

export function focusArt(art) {
  if (!art || !renderer) return;
  if (!focused) savedView = { position: camera.position.clone(), target: currentTarget.clone(), travel, travelTarget, pan: cameraPan.clone() };
  focused = true;
  hoveredGroup = null;
  const selected = interactiveGroups.find(group => group.userData.art.id === art.id);
  const point = selected.position.clone();
  const mobile = innerWidth < 760;
  const offset = new THREE.Vector3(mobile ? 0 : 1.1, mobile ? .7 : .12, mobile ? 5.1 : 4.7);
  moveTo(point.clone().add(offset), point.clone().add(new THREE.Vector3(mobile ? 0 : 1.1, mobile ? -.35 : 0, 0)));
  for (const group of interactiveGroups) {
    const picture = group.children.find(child => child.userData.art);
    picture.material.opacity = group === selected ? 1 : .16;
    group.children.find(child => child.geometry.type === 'BoxGeometry').material.opacity = group === selected ? 1 : .42;
    group.children.find(child => child.geometry.type === 'BoxGeometry').material.transparent = true;
  }
  invalidate();
}
export function returnToRoom() {
  focused = false;
  for (const group of interactiveGroups) {
    const picture = group.children.find(child => child.userData.art);
    picture.material.opacity = 1;
    const plate = group.children.find(child => child.geometry.type === 'BoxGeometry');
    plate.material.opacity = 1;
  }
  if (savedView) {
    ({ travel, travelTarget } = savedView);
    cameraPan.copy(savedView.pan);
    updatePositionIndicator();
    moveTo(savedView.position, savedView.target);
    savedView = null;
  } else goToRoom();
  invalidate();
}
export function goToRoom(category = 'all') {
  focused = false;
  savedView = null;
  for (const group of interactiveGroups) {
    const picture = group.children.find(child => child.userData.art);
    picture.material.opacity = 1;
    const plate = group.children.find(child => child.geometry.type === 'BoxGeometry');
    plate.material.opacity = 1;
  }
  const matching = category === 'all' ? artworks : artworks.filter(art => art.category === category);
  cameraPan.set(0, 0);
  const featured = category === 'all' ? matching.find(art => art.featured) : null;
  if (featured) cameraPan.set(featured.position[0] * .6, featured.position[1] * .6);
  const midpoint = matching.length ? matching.reduce((sum, art) => sum + art.position[2], 0) / matching.length : -2;
  travel = featured
    ? THREE.MathUtils.clamp((-2 - featured.position[2]) * .25, 0, 2)
    : category === 'all' ? 0 : THREE.MathUtils.clamp(-2 - midpoint, 0, 6.8);
  travelTarget = travel;
  updatePositionIndicator();
  setGalleryDestination();
  invalidate();
}

export function setCuratorMode(enabled) {
  curatorMode = Boolean(enabled);
  focused = false;
  canvas.style.cursor = curatorMode ? 'grab' : innerWidth >= 760 ? 'grab' : 'default';
  refreshGallery(portfolio);
}
export function setCuratorTool(tool) { curatorTool = ['move','rotate','scale'].includes(tool) ? tool : 'move'; }

export function refreshGallery(nextPortfolio) {
  sceneRevision += 1;
  replacePortfolio(nextPortfolio);
  for (const label of labels.values()) label.remove();
  labels.clear();
  for (const group of interactiveGroups) {
    root.remove(group);
    group.traverse(node => {
      node.geometry?.dispose();
      if (node.material) {
        if (node.material.map) node.material.map.dispose();
        node.material.dispose();
      }
    });
  }
  interactiveGroups.length = 0;
  clickable.length = 0;
  textures.length = 0;
  materials.length = 0;
  geometries.length = 0;
  loadedArtworkCount = 0;
  const visibleWorks = artworks.filter(art => curatorMode || (art.published !== false && art.visible !== false && !art.archived));
  loadTargetCount=visibleWorks.length;
  updatePositionIndicator();
  visibleWorks.forEach(addArtwork);
  if (!loadTargetCount) document.querySelector('#loading-screen').classList.add('done');
  invalidate();
}

window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  disposed = true;
  if (raf) cancelAnimationFrame(raf);
  window.removeEventListener('resize', resize);
  textures.forEach(texture => texture.dispose());
  materials.forEach(value => value.dispose());
  geometries.forEach(value => value.dispose());
  renderer.dispose();
});
