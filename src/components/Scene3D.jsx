import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { app, poseNow, simSensors, simTrack, isSim, goTo } from '../lib/controller.js';
import { vmaxOf } from '../lib/kinematics.js';
import { ikGeometry } from '../lib/ik.js';

// 3D view. The robot's frame is mm with z up; three.js is y-up, so world = (x, z, -y) / 100 (1 unit = 100 mm).
const S = 0.01;
const toW = (x, y, z = 0) => new THREE.Vector3(x * S, z * S, -y * S);

const SCENE = {
  light: { bg: 0xe9edf2, ground: 0xdfe4ea, grid1: 0x9aa6b4, grid2: 0xc6ced8, body: 0x4a515c, plate: 0xf26b1d, wheel: 0x1b2430, sens: 0x3a4250, track: 0xf26b1d, trail: 0x2f7cf6, arc: 0x2f7cf6, hemi: 0xffffff, sun: 1.7 },
  dark: { bg: 0x12161c, ground: 0x181d24, grid1: 0x3a4452, grid2: 0x222932, body: 0x59626f, plate: 0xff7d33, wheel: 0x0b0e12, sens: 0x2a313b, track: 0xff7d33, trail: 0x5b9cff, arc: 0x5b9cff, hemi: 0x9fb4d0, sun: 1.2 },
};

function buildCar() {
  const car = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.6), mat(SCENE.light.body));
  body.position.set(0, 0.75, 0); car.add(body); car.userData.body = body;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.4), mat(SCENE.light.plate));
  plate.position.set(0, 1.25, 0); car.add(plate); car.userData.plate = plate;
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.8), new THREE.MeshStandardMaterial({ color: 0x1f7a3a, roughness: 0.6 }));
  board.position.set(-0.2, 1.32, 0); car.add(board);
  const caster = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mat(0x9aa3ae));
  caster.position.set(-0.95, 0.16, 0); car.add(caster);
  car.userData.plate = plate; car.userData.board = board;
  car.userData.wheels = [];
  for (const side of [1, -1]) {
    const hub = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.28, 28), new THREE.MeshStandardMaterial({ color: SCENE.light.wheel, roughness: 0.9 }));
    tyre.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 16), mat(0xdfe4ea));
    rim.rotation.x = Math.PI / 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.06), mat(0x9aa3ae));
    hub.add(tyre, rim, spoke);
    hub.position.set(0.15, 0.33, side * 0.92);
    car.add(hub);
    car.userData.wheels.push({ hub, side });
  }
  car.userData.sensors = [0, 1].map(i => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshStandardMaterial({ color: SCENE.light.sens, emissive: 0x000000 }));
    s.position.set(1.22, 0.42, i === 0 ? 0.4 : -0.4);
    car.add(s); return s;
  });
  car.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return car;
}

// The Quarky board from the STEP file (see public/models/quarky.bin, made by the converter in tools/quarky/).
// Board coordinates are mm: x across the board (0..50), y along it (0..80), z up (-8.6..3.8). It is placed on the
// chassis with the 80 mm side along the car's length and centred, the board's bottom 130 mm above the ground.
async function loadQuarkyBoard(car, material) {
  const buf = await (await fetch(new URL('models/quarky.bin', document.baseURI))).arrayBuffer();
  const dv = new DataView(buf);
  const hlen = dv.getUint32(0, true), plen = dv.getUint32(4, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hlen)));
  const pos = new Float32Array(buf.slice(8 + hlen, 8 + hlen + plen));
  const idx = new Uint32Array(buf.slice(8 + hlen + plen));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const S = 0.01;
  const m = new THREE.Matrix4().set(
    0, S, 0, -40 * S,
    0, 0, S, 8.6 * S + 1.3,
    -S, 0, 0, 25 * S,
    0, 0, 0, 1);
  g.applyMatrix4(m);
  const mats = new Map(), mesh = new THREE.Group();
  const ms = head.groups.map(gr => {
    const key = gr.color.join(',');
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(gr.color[0], gr.color[1], gr.color[2]), roughness: 0.55, metalness: 0.1 }));
    return mats.get(key);
  });
  const uniq = [...mats.values()];
  head.groups.forEach((gr, i) => g.addGroup(gr.iStart, gr.iCount, uniq.indexOf(ms[i])));
  g.computeVertexNormals();
  const board = new THREE.Mesh(g, uniq);
  board.castShadow = true; board.receiveShadow = true;
  car.add(board);
  car.userData.plate.visible = false; car.userData.board.visible = false;
  return board;
}

function trackMesh(points, color) {
  const pts = points.map(([x, y]) => new THREE.Vector3(x * S, 0.02, -y * S));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, 900, 0.1, 8, true);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  m.castShadow = true; m.receiveShadow = true; return m;
}

export default function Scene3D({ theme }) {
  const host = useRef(null);
  const live = useRef({});                 // the three.js objects, for the theme effect

  useEffect(() => {
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    camera.position.set(8, 9, 11);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.target.set(2, 0, -1); controls.maxPolarAngle = Math.PI * 0.49;
    const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.2); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 12, 5); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
    sun.shadow.bias = -0.0008; scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.22 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.001; ground.receiveShadow = true; scene.add(ground);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; floor.receiveShadow = true; scene.add(floor);
    const car = buildCar(); scene.add(car);
    loadQuarkyBoard(car).catch(e => console.warn('Quarky board model not loaded:', e.message));
    const ghost = buildCar(); ghost.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.3; o.castShadow = false; } }); ghost.visible = false; scene.add(ghost);
    const track = trackMesh(simTrack(), SCENE.light.track); scene.add(track);
    const trailGeo = new THREE.BufferGeometry();
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: SCENE.light.trail })); scene.add(trail);
    const arcGeo = new THREE.BufferGeometry();
    const arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: SCENE.light.arc, linewidth: 2 })); scene.add(arc);
    // inverse kinematics on the car: one arrow per wheel (length = speed), the turning centre and the spoke to it
    const wheelArrows = [0, 1].map(() => { const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1.8, 0), 0.5, 0xf26b1d, 0.3, 0.2); a.renderOrder = 10; a.traverse(o => { if (o.material) { o.material.depthTest = false; o.material.transparent = true; } }); car.add(a); return a; });
    const icc = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: 0x35e070, depthTest: false })); icc.renderOrder = 10; icc.visible = false; scene.add(icc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x35e070, transparent: true, opacity: 0.9, depthTest: false }));
    ring.renderOrder = 10; ring.visible = false; scene.add(ring);
    const spokeGeo = new THREE.BufferGeometry();
    const spoke = new THREE.Line(spokeGeo, new THREE.LineBasicMaterial({ color: 0x8b96a5, depthTest: false })); spoke.renderOrder = 10; spoke.visible = false; scene.add(spoke);
    Object.assign(live.current, { renderer, scene, camera, controls, hemi, sun, ground, floor, car, ghost, track, trail, trailGeo, arc, arcGeo, wheelArrows, icc, spoke, spokeGeo, ring });
    applyTheme(theme);

    const resize = () => {
      const r = el.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    let raf = 0, last = performance.now(), wheelAngle = 0, lastTrail = 0;
    const frame = now => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const p = poseNow(), c = app.cfg, sim = isSim();
      // car pose: heading th maps to rotation about the up axis
      car.position.copy(toW(p.x, p.y, 0)); car.rotation.set(0, p.th, 0);
      // wheels turn with the motor speed
      const vel = (app.board.l ?? 0) / 100 * vmaxOf(c);               // mm/s, left (approximately)
      wheelAngle += dt * vel / (c.wheelD / 2);
      car.userData.wheels.forEach(w => { w.hub.rotation.z = -wheelAngle; });
      // sensors: glow when over the line
      const s = sim ? simSensors() : (app.board.s || [0, 0]);
      car.userData.sensors.forEach((m, i) => { m.material.emissive.setHex(s[i] ? 0x35e070 : 0x000000); m.material.color.setHex(s[i] ? 0x35e070 : SCENE.light.sens); });
      // ghost: the estimate, shown while the real pose differs (simulator)
      ghost.visible = sim && (app.go || Math.hypot(app.est.x - p.x, app.est.y - p.y) > 4);
      if (ghost.visible) { ghost.position.copy(toW(app.est.x, app.est.y, 0)); ghost.rotation.set(0, app.est.th, 0); }
      // trail of the estimate
      if (app.trail.length > 1 && app.trail.length !== lastTrail) {
        lastTrail = app.trail.length;
        trailGeo.setFromPoints(app.trail.map(([x, y]) => toW(x, y, 0.03)));
      }
      // inverse kinematics: the path, the wheel arrows and the turning centre, all from the shared geometry
      const g = ikGeometry(app.v, app.w, c.track);
      arcGeo.setFromPoints(g.path.length > 1 ? g.path.map(([lx, ly]) => { const [x, y] = carPt(p, lx, ly); return toW(x, y, 0.05); }) : []);
      wheelArrows.forEach((arrow, i) => {
        const w = g.wheels[i], len = Math.abs(w.speed) / 100 * 1.8;
        arrow.position.set(0.15, 1.8, -w.y * S * 1.8);
        arrow.setDirection(new THREE.Vector3(w.speed >= 0 ? 1 : -1, 0, 0));
        arrow.setLength(Math.max(0.001, len), 0.3, 0.2);
        arrow.visible = Math.abs(w.speed) >= 1;
        arrow.setColor(new THREE.Color(w.speed >= 0 ? 0xf26b1d : 0x5b9cff));
      });
      ring.visible = !!app.go;
      if (app.go) ring.position.copy(toW(app.go.x, app.go.y, 0.06));
      const hasIcc = g.icc && Math.abs(g.icc[1]) < 3000 && g.kind !== 'stop';
      icc.visible = spoke.visible = !!hasIcc;
      if (hasIcc) {
        const [ix, iy] = carPt(p, g.icc[0], g.icc[1]), [ox, oy] = carPt(p, 0, 0);
        icc.position.copy(toW(ix, iy, 0.12));
        spokeGeo.setFromPoints([toW(ox, oy, 1.8), toW(ix, iy, 0.12)]);
      }
      controls.update();
      renderer.render(scene, camera);
    };
    // click the floor (not a drag) to send the car there when Click to go is on
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
    let down = null;
    const onDown = e => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = e => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
      if (moved > 5 || !app.goEnable || app.cfg.mode !== 'manual') return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(floorPlane, hit)) return;
      goTo(hit.x / S, -hit.z / S);                       // world -> robot mm
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    raf = requestAnimationFrame(frame);
    return () => {
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      scene.traverse(o => { o.geometry?.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(x => x.dispose()); });
      renderer.dispose(); renderer.domElement.remove(); live.current = {};
    };
  }, []);

  useEffect(() => { applyTheme(theme); }, [theme]);

  function applyTheme(t) {
    const L = live.current; if (!L.scene) return;
    const C = SCENE[t] || SCENE.light;
    L.scene.background = new THREE.Color(C.bg);
    L.scene.fog = new THREE.Fog(C.bg, 30, 70);
    L.hemi.intensity = t === 'dark' ? 0.9 : 1.2; L.sun.intensity = C.sun;
    L.floor.material.color.setHex(C.ground);
    L.car.userData.body.material.color.setHex(C.body);
    L.car.userData.plate.material.color.setHex(C.plate);
    L.track.material.color.setHex(C.track);
    L.trail.material.color.setHex(C.trail);
    L.arc.material.color.setHex(C.arc);
    if (L.grid) { L.scene.remove(L.grid); L.grid.geometry.dispose(); L.grid.material.dispose(); }
    L.grid = new THREE.GridHelper(120, 120, C.grid1, C.grid2); L.grid.position.y = 0.001; L.scene.add(L.grid);
  }

  return <div className="scene3d" ref={host} aria-label="3D view of the car on the track" />;
}

function carPt(p, lx, ly) { const cs = Math.cos(p.th), sn = Math.sin(p.th); return [p.x + lx * cs - ly * sn, p.y + lx * sn + ly * cs]; }
