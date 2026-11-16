
// ───────────────────────── Tamachin: formas ─────────────────────────
function profCircle(R, sy, n) { const p = []; n = n || 18; for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + Math.PI * i / n; p.push([R * Math.cos(a), (R + R * Math.sin(a)) * (sy || 1)]); } return p; }
const PROF_EGG = (() => { const p = []; for (let i = 0; i <= 20; i++) { const a = -Math.PI / 2 + Math.PI * i / 20; p.push([0.58 * Math.cos(a) * (1 - 0.17 * Math.sin(a)), 0.73 + 0.73 * Math.sin(a)]); } return p; })();
const PROF_DROP = (() => { const p = [], R = 0.6; for (let i = 0; i <= 9; i++) { const a = -Math.PI / 2 + (Math.PI / 2) * i / 9; p.push([R * Math.cos(a), R + R * Math.sin(a)]); } for (let i = 1; i <= 12; i++) { const u = i / 12; p.push([R * Math.pow(1 - u, 1.3) * (1 + 1.3 * u), R + 0.95 * u]); } return p; })();
const PROF_GHOST = (() => { const p = [[0, 0.22], [0.42, 0.2], [0.63, 0.04], [0.6, 0.3], [0.575, 0.55], [0.56, 0.74]]; for (let i = 1; i <= 10; i++) { const a = (Math.PI / 2) * i / 10; p.push([0.56 * Math.cos(a), 0.74 + 0.56 * Math.sin(a)]); } return p; })();
const PROF_STEM = [[0, 0], [0.4, 0], [0.48, 0.1], [0.47, 0.35], [0.43, 0.6], [0.4, 0.8], [0, 0.82]];
const PROF_CAP = [[0, 0.7], [0.55, 0.68], [0.85, 0.72], [0.88, 0.84], [0.76, 1.06], [0.52, 1.25], [0.25, 1.34], [0, 1.37]];

const SHAPES = {
  bola:     { label: 'Bola',     prof: profCircle(0.62),        H: 1.24, eyeY: 0.74, eyeX: 0.25, eyeR: 0.235, mouthY: 0.43, handY: 0.5,  footX: 0.24 },
  huevo:    { label: 'Huevo',    prof: PROF_EGG,                H: 1.46, eyeY: 0.84, eyeX: 0.235, eyeR: 0.225, mouthY: 0.52, handY: 0.55, footX: 0.24 },
  gota:     { label: 'Gota',     prof: PROF_DROP,               H: 1.55, eyeY: 0.68, eyeX: 0.245, eyeR: 0.23, mouthY: 0.38, handY: 0.45, footX: 0.24 },
  cubito:   { label: 'Cubito',   flatZ: 0.49,                   H: 1.14, eyeY: 0.7,  eyeX: 0.255, eyeR: 0.225, mouthY: 0.38, handY: 0.5,  footX: 0.26, handX: 0.6 },
  gatito:   { label: 'Gatito',   prof: profCircle(0.62, 0.95),  H: 1.5,  eyeY: 0.7,  eyeX: 0.25, eyeR: 0.23, mouthY: 0.4,  handY: 0.46, footX: 0.24, nose: true },
  fantasma: { label: 'Fantasma', prof: PROF_GHOST,              H: 1.3,  eyeY: 0.86, eyeX: 0.235, eyeR: 0.22, mouthY: 0.56, handY: 0.55, footX: 0.24, feet: false, float: 0.2 },
  hongo:    { label: 'Hongo',    prof: PROF_STEM,               H: 1.37, eyeY: 0.43, eyeX: 0.215, eyeR: 0.195, mouthY: 0.19, handY: 0.3,  footX: 0.24, face: 'cream', mouthS: 0.8 },
  estrella: { label: 'Estrella', flatZ: 0.285,                  H: 1.36, eyeY: 0.72, eyeX: 0.2,  eyeR: 0.195, mouthY: 0.47, handY: 0.6,  footX: 0.4, handX: 0.6, hands: false, mouthS: 0.9 },
};
function rAt(d, y) {
  const p = d.prof; if (!p) return 0.55;
  for (let i = p.length - 2; i >= 0; i--) {
    const a = p[i], b = p[i + 1];
    if (y >= a[1] && y <= b[1] && b[1] > a[1]) return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1]));
  }
  return 0.3;
}
function faceZ(d, x, y) { if (d.flatZ !== undefined) return d.flatZ; const r = rAt(d, y); return Math.sqrt(Math.max(r * r - x * x, 0.004)); }

function starGeo() {
  const sh = new THREE.Shape(), V = [];
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 0.92; V.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m0 = mid(V[9], V[0]); sh.moveTo(m0[0], m0[1]);
  for (let i = 0; i < 10; i++) { const m = mid(V[i], V[(i + 1) % 10]); sh.quadraticCurveTo(V[i][0], V[i][1], m[0], m[1]); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.12, bevelSegments: 5, curveSegments: 8, steps: 1 });
  g.translate(0, 0, -0.15); g.scale(0.82, 0.82, 0.92); return smoothNormals(g);
}
function ghostGeo() {
  const g = lathe(PROF_GHOST, 36), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    if (y < 0.32 && Math.hypot(x, z) > 0.5) { const k = (0.32 - y) / 0.32; P.setY(i, y + 0.13 * k * (0.5 + 0.5 * Math.sin(6 * Math.atan2(x, z)))); }
  }
  return g;
}
const PARTS = {};
function shapeParts(name) {
  if (PARTS[name]) return PARTS[name];
  const d = SHAPES[name]; let parts;
  switch (name) {
    case 'cubito': parts = [{ g: roundedBox(1.12, 1.12, 0.98, 0.3, 12), m: 'body', p: [0, 0.58, 0] }]; break;
    case 'estrella': parts = [{ g: starGeo(), m: 'body', p: [0, 0.62, 0] }]; break;
    case 'fantasma': parts = [{ g: ghostGeo(), m: 'body' }]; break;
    case 'gatito': {
      const ear = new THREE.ConeGeometry(0.21, 0.42, 14), inn = new THREE.ConeGeometry(0.12, 0.26, 10), ball = gSph(12);
      parts = [{ g: lathe(d.prof, 32), m: 'body' },
        { g: ear, m: 'body', p: [-0.36, 1.13, 0], r: [0, 0, 0.4] }, { g: ear, m: 'body', p: [0.36, 1.13, 0], r: [0, 0, -0.4] },
        { g: inn, m: 'pink', p: [-0.355, 1.1, 0.08], r: [0, 0, 0.4] }, { g: inn, m: 'pink', p: [0.355, 1.1, 0.08], r: [0, 0, -0.4] },
        { g: ball, m: 'alt', p: [0, 0.3, -0.62], s: [0.14, 0.14, 0.14] }, { g: ball, m: 'alt', p: [0.1, 0.5, -0.72], s: [0.12, 0.12, 0.12] }, { g: ball, m: 'alt', p: [0.05, 0.7, -0.68], s: [0.1, 0.1, 0.1] }];
      break;
    }
    case 'hongo': {
      const ball = gSph(12);
      parts = [{ g: lathe(PROF_STEM, 28), m: 'cream' }, { g: lathe(PROF_CAP, 32), m: 'body' }];
      [[0.5, 1.12, 0.55], [-0.58, 1.08, 0.4], [0.05, 1.3, 0.2], [-0.2, 1.17, -0.6], [0.6, 1.05, -0.4], [0.1, 0.98, 0.84]].forEach((q, i) => {
        const s = 0.1 + (i % 3) * 0.025; parts.push({ g: ball, m: 'white', p: [q[0] * 0.92, q[1] - 0.02, q[2] * 0.92], s: [s, s * 0.7, s] });
      });
      break;
    }
    default: parts = [{ g: lathe(d.prof, 32), m: 'body' }];
  }
  return (PARTS[name] = parts);
}

// ───────────────────────── Tamachin: cara ─────────────────────────
const MOODS = {
  contento:  { label: 'Contento',  lid: -1.5,  mouth: 'open',  blush: true, bounce: 1.25, speed: 1 },
  triste:    { label: 'Triste',    lid: -0.6,  lidZ: 0.4,  mouth: 'frown', look: [0, -0.55], droop: 0.14, bounce: 0.5, speed: 0.68 },
  asombrado: { label: 'Asombrado', lid: -1.57, eyeS: 1.22, pupilS: 0.55, mouth: 'o', speed: 1 },
  enojado:   { label: 'Enojado',   lid: -0.62, lidZ: -0.45, pupilS: 0.85, mouth: 'frown', speed: 1.12, bounce: 0.8 },
  dormido:   { label: 'Dormido',   lid: 1.12,  mouth: 'tiny',  droop: 0.08, bounce: 0.4, speed: 0.55 },
  enamorado: { label: 'Enamorado', lid: -1.5,  special: 'heart', mouth: 'smile', blush: true, speed: 0.95 },
  mareado:   { label: 'Mareado',   lid: -1.5,  special: 'spiral', mouth: 'wavy', speed: 0.8, hidden: true },
};
const TEX_SPIRAL = canvasTex(128, 128, (g) => {
  g.translate(64, 64); g.strokeStyle = '#231d3b'; g.lineWidth = 11; g.lineCap = 'round'; g.beginPath();
  for (let a = 0; a < TAU * 2.6; a += 0.1) { const r = 4 + a * 3.2; g[a ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.stroke();
});
const TEX_HEART = canvasTex(128, 128, (g) => { heartPath(g, 64, 62, 44); g.fillStyle = '#ff3f7f'; g.fill(); g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(44, 44, 9, 6, -0.6, 0, TAU); g.fill(); });
const G_EYE = new THREE.SphereGeometry(1, 28, 18), G_PUPIL = new THREE.SphereGeometry(0.5, 20, 14), G_GLINT = new THREE.SphereGeometry(0.13, 10, 8),
  G_LID = new THREE.SphereGeometry(1.1, 28, 12, 0, TAU, 0, Math.PI / 2), G_RIM = new THREE.TorusGeometry(1.1, 0.05, 6, 28, Math.PI),
  G_SPECIAL = new THREE.CircleGeometry(0.7, 24), G_BALL = new THREE.SphereGeometry(1, 14, 10);
const M_WHITE = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22 }), M_PUPIL = new THREE.MeshStandardMaterial({ color: 0x1c1730, roughness: 0.2 }),
  M_GLINT = new THREE.MeshBasicMaterial({ color: 0xffffff }), M_LINE = new THREE.MeshBasicMaterial({ color: 0x2b2145 }),
  M_MOUTH = new THREE.MeshBasicMaterial({ color: 0x3a1830 }), M_TONGUE = new THREE.MeshBasicMaterial({ color: 0xff7c9c }),
  M_PINK = new THREE.MeshStandardMaterial({ color: 0xff9db8, roughness: 0.7 }), M_CREAM = new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.5 }),
  M_SPOT = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
const CREAM = new THREE.Color(0xfff1d6);
const G_MOUTH = {
  open: new THREE.CircleGeometry(0.145, 22, Math.PI, Math.PI), tongue: new THREE.CircleGeometry(0.06, 14),
  arc: new THREE.TorusGeometry(0.1, 0.021, 8, 18, Math.PI), o: new THREE.CircleGeometry(0.068, 20), tiny: new THREE.CircleGeometry(0.036, 14),
  wavy: new THREE.TubeGeometry(new THREE.CatmullRomCurve3([-3, -2, -1, 0, 1, 2, 3].map((i) => new THREE.Vector3(i * 0.05, (i % 2 ? 0.03 : -0.03), 0))), 24, 0.019, 6),
};
function makeEye(lidMat, specMat) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(G_EYE, M_WHITE));
  const pupilG = new THREE.Group(), pupil = new THREE.Mesh(G_PUPIL, M_PUPIL), glint = new THREE.Mesh(G_GLINT, M_GLINT);
  pupil.scale.z = 0.35; glint.position.set(0.17, 0.2, 0.12); glint.scale.z = 0.5; pupilG.add(pupil, glint); g.add(pupilG);
  const special = new THREE.Mesh(G_SPECIAL, specMat); special.position.z = 1.06; special.visible = false; g.add(special);
  const lidG = new THREE.Group(); lidG.rotation.order = 'ZXY';
  const rim = new THREE.Mesh(G_RIM, M_LINE); rim.rotation.x = Math.PI / 2;
  lidG.add(new THREE.Mesh(G_LID, lidMat), rim); g.add(lidG);
  return { g, pupilG, special, lidG };
}
const TRICK_DUR = { hop: 0.7, spin: 0.85, flip: 0.8, dance: 1.7, wave: 1.3, giggle: 0.9, wink: 0.9, shake: 0.8 };
const _tv = new THREE.Vector3();

function makeTamachin(o) {
  const T = { shape: null, def: null, mood: 'contento', scale: o.scale || 1, time: Math.random() * 10, walk: 0, sq: 0, sqV: 0, lid: [-1.5, -1.5],
    lx: 0, ly: 0, es: 1, blinkT: 1 + Math.random() * 3, blink: 0, trick: null, trickT: 0, flat: false, flatK: 0, lie: 0, lieK: 0, dz: 0, emitT: Math.random() };
  const root = new THREE.Group(), sway = new THREE.Group(), flipG = new THREE.Group(), core = new THREE.Group(), squash = new THREE.Group(),
    bodyG = new THREE.Group(), faceG = new THREE.Group();
  root.add(sway); sway.add(flipG); flipG.add(core); core.add(squash); squash.add(bodyG, faceG);
  root.scale.setScalar(T.scale); T.group = root; T.pos = root.position;
  const mats = { body: new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.02 }), alt: new THREE.MeshStandardMaterial({ roughness: 0.5 }), cream: M_CREAM, white: M_SPOT, pink: M_PINK };
  const lidMat = new THREE.MeshStandardMaterial({ roughness: 0.42 });
  const specMat = new THREE.MeshBasicMaterial({ map: TEX_SPIRAL, transparent: true, depthWrite: false });
  const eyes = [makeEye(lidMat, specMat), makeEye(lidMat, specMat)]; eyes.forEach((e) => faceG.add(e.g));
  const mouthG = new THREE.Group(); faceG.add(mouthG);
  const mouths = {};
  { const open = new THREE.Group(), tg = new THREE.Mesh(G_MOUTH.tongue, M_TONGUE); tg.position.set(0, -0.095, 0.004); tg.scale.set(1.25, 0.7, 1);
    open.add(new THREE.Mesh(G_MOUTH.open, M_MOUTH), tg); open.position.y = 0.05; mouths.open = open;
    const smile = new THREE.Mesh(G_MOUTH.arc, M_MOUTH); smile.rotation.z = Math.PI; smile.position.y = 0.04; mouths.smile = smile;
    const frown = new THREE.Mesh(G_MOUTH.arc, M_MOUTH); frown.position.y = -0.06; mouths.frown = frown;
    const mo = new THREE.Mesh(G_MOUTH.o, M_MOUTH); mo.scale.y = 1.25; mouths.o = mo;
    mouths.tiny = new THREE.Mesh(G_MOUTH.tiny, M_MOUTH); mouths.wavy = new THREE.Mesh(G_MOUTH.wavy, M_MOUTH);
    for (const k in mouths) { mouths[k].visible = false; mouthG.add(mouths[k]); } }
  const nose = new THREE.Mesh(G_BALL, M_PINK); nose.scale.set(0.05, 0.036, 0.03); faceG.add(nose);
  const cheeks = [new THREE.Mesh(G_BALL, M_PINK), new THREE.Mesh(G_BALL, M_PINK)]; cheeks.forEach((c) => { c.scale.set(0.085, 0.06, 0.028); faceG.add(c); });
  const feet = [new THREE.Mesh(G_BALL, mats.alt), new THREE.Mesh(G_BALL, mats.alt)]; feet.forEach((f) => { f.scale.set(0.17, 0.11, 0.24); f.castShadow = true; core.add(f); });
  const hands = [new THREE.Mesh(G_BALL, mats.alt), new THREE.Mesh(G_BALL, mats.alt)]; hands.forEach((h) => { h.scale.setScalar(0.105); core.add(h); });
  const halo = new THREE.Group(); core.add(halo);
  for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(PMAT.star); s.scale.setScalar(0.3); const a = i * TAU / 3; s.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); halo.add(s); }
  halo.visible = false;

  T.setShape = (name) => {
    if (!SHAPES[name]) name = 'bola';
    T.shape = name; const d = T.def = SHAPES[name];
    while (bodyG.children.length) bodyG.remove(bodyG.children[0]);
    for (const p of shapeParts(name)) {
      const m = new THREE.Mesh(p.g, mats[p.m]);
      if (p.p) m.position.set(p.p[0], p.p[1], p.p[2]); if (p.r) m.rotation.set(p.r[0], p.r[1], p.r[2]); if (p.s) m.scale.set(p.s[0], p.s[1], p.s[2]);
      m.castShadow = true; bodyG.add(m);
    }
    eyes.forEach((e, i) => {
      const sg = i ? 1 : -1, x = sg * d.eyeX, fz = faceZ(d, x, d.eyeY);
      e.g.position.set(x, d.eyeY, fz - d.eyeR * 0.62 * 0.32);
      e.g.rotation.y = d.flatZ !== undefined ? 0 : sg * 0.55 * Math.asin(clamp(d.eyeX / rAt(d, d.eyeY), -0.9, 0.9));
    });
    const my = d.mouthY, slope = (faceZ(d, 0, my + 0.04) - faceZ(d, 0, my - 0.04)) / 0.08;
    mouthG.position.set(0, my, faceZ(d, 0, my) + 0.03); mouthG.rotation.x = Math.atan(slope) * 0.9; mouthG.scale.setScalar(d.mouthS || 1);
    nose.visible = !!d.nose; nose.position.set(0, my + 0.13, faceZ(d, 0, my + 0.13) + 0.01);
    const cx = d.eyeX + d.eyeR * 0.85, cy = d.eyeY - d.eyeR * 1.0;
    cheeks.forEach((c, i) => { const sg = i ? 1 : -1; c.position.set(sg * cx, cy, faceZ(d, cx, cy) - 0.005); c.rotation.y = d.flatZ !== undefined ? 0 : sg * Math.asin(clamp(cx / rAt(d, cy), -0.95, 0.95)) * 0.9; });
    if (d.handX === undefined && d.prof) d.handX = rAt(d, d.handY) + 0.05;
    hands.forEach((h) => { h.visible = d.hands !== false; });
    core.position.y = -d.H / 2; halo.position.y = d.H + 0.22;
    lidMat.color.copy(d.face === 'cream' ? CREAM : mats.body.color);
  };
  // brillo propio (emissive) en su color: de noche la luz es azul y un cuerpo amarillo se vería verde oscuro (06-main.js)
  T.glowK = 0;
  T.glow = (k) => { T.glowK = k; for (const m of [mats.body, mats.alt, lidMat]) m.emissive.copy(m.color).multiplyScalar(k); };
  T.setColor = (hex) => {
    T.color = hex; mats.body.color.set(hex); mats.alt.color.set(hex).offsetHSL(0.01, 0.02, -0.13);
    if (T.def) lidMat.color.copy(T.def.face === 'cream' ? CREAM : mats.body.color);
    if (T.glowK) T.glow(T.glowK);
  };
  T.setMood = (name) => {
    if (!MOODS[name]) name = 'contento';
    T.mood = name; const m = MOODS[name];
    for (const k in mouths) mouths[k].visible = k === m.mouth;
    cheeks.forEach((c) => { c.visible = !!m.blush; });
    eyes.forEach((e) => { e.special.visible = !!m.special; e.pupilG.visible = !m.special; e.special.rotation.z = 0; e.special.scale.set(1, 1, 1); });
    if (m.special) { specMat.map = m.special === 'heart' ? TEX_HEART : TEX_SPIRAL; specMat.needsUpdate = true; }
    halo.visible = name === 'mareado';
  };
  T.poke = (v) => { T.sqV += v; };
  T.doTrick = (type) => { T.trick = type; T.trickT = 0; };
  T.headPos = (v) => v.set(0, T.def.H + 0.1, 0).applyMatrix4(root.matrixWorld);
  T.bubblePos = (v) => v.set(root.position.x, root.position.y + (T.def.H + 0.25) * T.scale * (1 - 0.7 * T.flatK) * (1 - 0.6 * T.lieK), root.position.z);

  T.update = (dt, st) => {
    T.time += dt; const t = T.time, d = T.def, m = MOODS[T.mood];
    const sp = Math.min(st.speed || 0, 1.7), amp = Math.min(sp, 1.25);
    if (sp > 0.05) T.walk += dt * (7 + sp * 5.5);
    const ph = T.walk;
    let hop = 0, yaw = 0, flipX = 0, swayZ = 0, swayX = 0, wave = 0, sqAdd = 0, wink = 0;
    if (T.trick) {
      T.trickT += dt; const p = T.trickT / TRICK_DUR[T.trick];
      if (p >= 1) T.trick = null;
      else switch (T.trick) {
        case 'hop': hop = Math.abs(Math.sin(p * TAU)) * 0.5; break;
        case 'spin': yaw = ease(p) * TAU * 2; hop = Math.sin(p * Math.PI) * 0.25; break;
        case 'flip': flipX = ease(p) * TAU; hop = Math.sin(p * Math.PI) * 1.0; break;
        case 'dance': swayZ = Math.sin(p * TAU * 3) * 0.32; hop = Math.abs(Math.sin(p * TAU * 3)) * 0.16; yaw = Math.sin(p * TAU * 1.5) * 0.5; wave = 1; break;
        case 'wave': wave = 1; swayZ = Math.sin(p * TAU * 2) * 0.08; break;
        case 'giggle': sqAdd = Math.sin(p * TAU * 6) * 0.09; break;
        case 'wink': wink = 1; swayZ = 0.14 * Math.sin(p * Math.PI); break;
        case 'shake': yaw = Math.sin(p * TAU * 3.5) * 0.5 * (1 - p); break;
      }
    }
    T.dz = damp(T.dz, T.mood === 'mareado' ? 1 : (st.wobble || 0) * 0.45, 4, dt);
    T.lieK = damp(T.lieK, T.lie, 6, dt);
    sway.rotation.z = swayZ + Math.sin(t * 4.3) * 0.26 * T.dz;
    sway.rotation.x = swayX + amp * 0.09 + (m.droop || 0) * (1 - T.lieK) + Math.cos(t * 3.4) * 0.2 * T.dz - T.lieK * 1.32;
    flipG.rotation.set(flipX, yaw + (st.spinY || 0), 0);
    flipG.position.y = d.H / 2 + hop;
    T.sqV += (-170 * T.sq - 13 * T.sqV) * dt; T.sq = clamp(T.sq + T.sqV * dt, -0.5, 0.6);
    const s = T.sq + Math.sin(t * 2.3) * 0.013 + sqAdd;
    T.flatK = damp(T.flatK, T.flat ? 1 : 0, T.flat ? 20 : 9, dt);
    const fy = lerp(1, 0.14, T.flatK), fx = lerp(1, 1.5, T.flatK);
    squash.scale.set((1 - s * 0.5) * fx, (1 + s) * fy, (1 - s * 0.5) * fx);
    const bob = st.air ? 0 : Math.abs(Math.sin(ph)) * 0.075 * amp * (m.bounce || 1);
    squash.position.y = bob + (d.float ? d.float + Math.sin(t * 2.1) * 0.05 : 0);
    for (let i = 0; i < 2; i++) {
      const sg = i ? 1 : -1, a = ph + (i ? Math.PI : 0), f = feet[i], h = hands[i];
      f.visible = d.feet !== false && T.flatK < 0.5;
      f.position.set(sg * d.footX, 0.09 + Math.max(0, Math.cos(a)) * 0.14 * amp + (st.air ? 0.07 : 0), 0.05 + Math.sin(a) * 0.2 * amp);
      const up = wave && i ? 1 : 0;
      h.position.set(sg * (d.handX + up * 0.12 + (up ? Math.sin(t * 16) * 0.07 : 0)), (d.handY + up * 0.34 + bob + (d.float || 0)) * fy, 0.1 - Math.sin(a) * 0.13 * amp);
    }
    if (T.mood !== 'dormido') { T.blinkT -= dt; if (T.blinkT < 0) { T.blink = 0.13; T.blinkT = 1.8 + Math.random() * 3.5; } }
    T.blink = Math.max(0, T.blink - dt);
    T.es = damp(T.es, m.eyeS || 1, 10, dt);
    let lx = st.lookX, ly = st.lookY;
    if (lx === undefined) { lx = (m.look ? m.look[0] : 0) + Math.sin(t * 0.7) * 0.25; ly = m.look ? m.look[1] : 0; }
    if (st.wobble) { lx += Math.cos(t * 13) * 0.7 * st.wobble; ly += Math.sin(t * 13) * 0.7 * st.wobble; }
    T.lx = damp(T.lx, clamp(lx, -1, 1), 12, dt); T.ly = damp(T.ly, clamp(ly, -1, 1), 12, dt);
    for (let i = 0; i < 2; i++) {
      const e = eyes[i], sg = i ? 1 : -1;
      const target = (T.blink > 0 || (wink && i === 0)) ? 1.25 : m.lid;
      T.lid[i] = damp(T.lid[i], target, T.blink > 0 ? 45 : 14, dt);
      e.lidG.rotation.set(T.lid[i], 0, -sg * (m.lidZ || 0));
      const R = d.eyeR * T.es; e.g.scale.set(R, R * 1.1, R * 0.62);
      e.pupilG.scale.setScalar(m.pupilS || 1);
      e.pupilG.position.set(T.lx * 0.4, T.ly * 0.4, 0.9 - 0.085 * (T.lx * T.lx + T.ly * T.ly));
      if (m.special === 'spiral') e.special.rotation.z -= dt * 9 * sg;
      else if (m.special) { const k = 1 + Math.sin(t * 6) * 0.1; e.special.scale.set(k, k, 1); }
    }
    if (halo.visible) halo.rotation.y += dt * 4.5;
    T.emitT -= dt;
    if (T.emitT <= 0) {
      T.emitT = 1;
      if (st.near !== false && !T.flat) {
        const hp = T.headPos(_tv);
        switch (T.mood) {
          case 'enamorado': emit('heart', hp.x + rand(-0.4, 0.4), hp.y, hp.z); T.emitT = 0.55; break;
          case 'dormido': emit('zzz', hp.x + 0.35, hp.y, hp.z); T.emitT = 0.95; break;
          case 'triste': emit('tear', hp.x + rand(-0.3, 0.3), hp.y - 0.55 * T.scale, hp.z + 0.5 * T.scale); T.emitT = 1.1; break;
          case 'enojado': emit('puff', hp.x + rand(-0.4, 0.4), hp.y, hp.z); T.emitT = 0.55; break;
          case 'asombrado': emit('excl', hp.x, hp.y + 0.2, hp.z); T.emitT = 2.8; break;
          case 'contento': if (sp < 0.05 && Math.random() < 0.35) emit('note', hp.x + rand(-0.4, 0.4), hp.y, hp.z); T.emitT = 2.2; break;
        }
      }
    }
  };
  T.setColor(o.color || '#ffc93c'); T.setShape(o.shape || 'bola'); T.setMood(o.mood || 'contento');
  scene.add(root);
  return T;
}
