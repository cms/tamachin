
// ───────────────────────── autos ─────────────────────────
function carGeo(type, paint) {
  const b = new Batch(), GL = '#2d3b55', TY = '#22222b';
  if (type === 'bus') {
    b.rbox(paint, 0, 1.6, 0, 2.3, 2.4, 8, 0.34).box(GL, 0, 2.12, 0, 2.34, 0.82, 6.8).box(GL, 0, 2.02, 0, 1.9, 0.98, 8.04).box('#ffffff', 0, 1.22, 0, 2.33, 0.18, 7.9);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(TY, sx * 1.1, 0.46, sz * 2.7, 0.46, 0.46, 0.32, 14, 0, Math.PI / 2).cyl('#c9ced6', sx * 1.1, 0.46, sz * 2.7, 0.2, 0.2, 0.34, 10, 0, Math.PI / 2);
    for (const sx of [-1, 1]) b.sph('#fff6c4', sx * 0.8, 0.85, 4.0, 0.18, 0.14, 0.07).sph('#ff4d4d', sx * 0.8, 0.9, -4.0, 0.16, 0.12, 0.07);
    b.box('#ffd23f', 0, 2.62, 3.96, 1.4, 0.3, 0.12);
  } else {
    b.rbox(paint, 0, 0.62, 0, 1.9, 0.7, 4.2, 0.24).rbox(paint, 0, 1.2, -0.25, 1.7, 0.66, 2.2, 0.26).box(GL, 0, 1.24, -0.25, 1.74, 0.36, 1.5).box(GL, 0, 1.24, -0.25, 1.3, 0.36, 2.24);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(TY, sx * 0.93, 0.36, sz * 1.3, 0.36, 0.36, 0.3, 14, 0, Math.PI / 2).cyl('#c9ced6', sx * 0.93, 0.36, sz * 1.3, 0.17, 0.17, 0.32, 10, 0, Math.PI / 2);
    for (const sx of [-1, 1]) b.sph('#fff6c4', sx * 0.6, 0.68, 2.08, 0.17, 0.13, 0.07).sph('#ff4d4d', sx * 0.62, 0.7, -2.08, 0.16, 0.11, 0.07);
    b.box('#d7dbe0', 0, 0.36, 2.04, 1.7, 0.16, 0.16).box('#d7dbe0', 0, 0.36, -2.04, 1.7, 0.16, 0.16);
    if (type === 'taxi') b.box('#231d3b', 0, 1.62, -0.25, 0.7, 0.2, 0.3).box('#231d3b', 0, 0.74, 0, 1.92, 0.1, 2.4);
  }
  return b.geometry();
}
// Cada carril es una ruta. `c.s` es la coordenada de su eje dentro de la ciudad, como siempre; `L.at(s, o)` pone en `o` dónde queda
// (x, z), hacia dónde mira (fx, fz: unitario) y a qué altura (y). Los autos dan la vuelta al pasar `hi` (o `lo`, los que van hacia
// atrás), dentro de un túnel, donde no se ven.
const lanes = [];
for (const r of ROADS) lanes.push({ axis: 'z', dir: 1, fixed: r - 2, road: r }, { axis: 'z', dir: -1, fixed: r + 2, road: r }, { axis: 'x', dir: 1, fixed: r + 2, road: r }, { axis: 'x', dir: -1, fixed: r - 2, road: r });
// Los dos carriles de la calle del oeste (x = −24) siguen por la carretera a Valle Alegre (`L.ext`): más allá de z −62, `c.s` va bajando
// un metro por cada metro de carretera. Los que van al norte entran a la boca del túnel de las montañas y se pierden adentro (salen otra
// vez por el túnel sur de su calle); los que van al sur salen de la boca.
const _ra = { x: 0, z: 0, tx: 0, tz: -1, nx: 1, nz: 0 };
function laneAt(s, o) {
  const L = this;
  if (L.ext && s < -62) {
    const d = -62 - s; roadAt(ROAD, d, _ra); const side = (L.fixed - L.road) / 2;   // +1 a la derecha de quien va al norte
    o.x = _ra.x + _ra.nx * 2 * side; o.z = _ra.z + _ra.nz * 2 * side; o.fx = -L.dir * _ra.tx; o.fz = -L.dir * _ra.tz;
    o.y = d > ROAD.len - 10 ? 0 : Math.max(0, groundY(o.x, o.z)); return o;   // dentro de la boca, a nivel (el cerro queda encima)
  }
  if (L.axis === 'x') { o.x = s; o.z = L.fixed; o.fx = L.dir; o.fz = 0; } else { o.x = L.fixed; o.z = s; o.fx = 0; o.fz = L.dir; }
  o.y = 0; return o;
}
for (const L of lanes) {
  L.lightAxis = L.axis === 'z' ? 'NS' : 'EW'; L.stops = ROADS.map((c) => ({ pos: c - L.dir * 7.7, I: L.axis === 'z' ? interAt(L.road, c) : interAt(c, L.road) }));
  L.lo = -74; L.hi = 74; L.at = laneAt;
  if (L.axis === 'z' && L.road < 0) { L.ext = true; L.lo = -62 - ROAD.len; }
}
const cars = [], _la = { x: 0, z: 0, fx: 0, fz: 1, y: 0 };
function placeCar(c) { _la.hidden = false; _la.leg = 0; c.L.at(c.s, _la); c.x = _la.x; c.z = _la.z; c.fx = _la.fx; c.fz = _la.fz; c.y = _la.y; c.hidden = _la.hidden; c.leg = _la.leg; }
const PAINTS = ['#ff6b6b', '#5aa9ff', '#4fc3a1', '#ffffff', '#c58bff', '#ff9f6b', '#2f3a56', '#f78fb3'];
function addCar(L, s, type, paint) {
  const mesh = new THREE.Mesh(carGeo(type, paint), MAT_CAR); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  mesh.rotation.y = L.axis === 'z' ? (L.dir > 0 ? 0 : Math.PI) : (L.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const bus = type === 'bus';
  const c = { L, s, v: 0, vmax: rr(7.5, 10.5) * (bus ? 0.8 : 1), half: bus ? 4.05 : 2.15, hw: bus ? 1.2 : 1.0, h: bus ? 2.8 : 1.55, mesh, pause: 0, honkT: 0, stuck: 0, x: 0, z: 0, y: 0, fx: 0, fz: 1 };
  c.bubblePos = (v) => v.set(c.x, c.y + c.h + 0.5, c.z); cars.push(c);
}
lanes.forEach((L, i) => {
  const n = i % 3 === 0 ? 1 : 2;
  for (let k = 0; k < n; k++) addCar(L, -62 + k * 58 + rr(0, 26), (i === 2 || i === 5) && k === 0 ? 'bus' : (i === 0 || i === 7) ? 'taxi' : 'auto', (i === 0 || i === 7) ? '#ffcf33' : (i === 2 || i === 5) && k === 0 ? pick(['#ff8a5c', '#4fc3a1']) : pick(PAINTS));
});
// ───────────────────────── el autobús a Valle Alegre ─────────────────────────
// Un auto más (está en `cars`: los demás lo ven y él los ve, frena por Tamachin y prende sus luces), pero su carril es una línea cerrada
// (`BUS_LINE`): la terminal de la ciudad, la carretera al norte, el túnel (un tramo escondido), la terminal de Valle Alegre y de regreso.
// En el túnel no se ve (`c.hidden`): si Tamachin va arriba, 06-main.js lo lleva por el tubo de verdad. Espera `BUS.dwell` s en cada
// parada (`BUS_STOPS`); en las terminales va más despacio. No usa `rnd` (addCar sí): todo lo demás queda igual.
const BUS = { dwell: 14, road: 9.5, slow: 4.5, hidden: 380 };
const BUS_LINE = (() => {
  const legs = [], add = (o) => { if (o.len == null) o.len = Math.abs(o.d1 - o.d0); o.s0 = legs.length ? legs[legs.length - 1].s0 + legs[legs.length - 1].len : 0; legs.push(o); };
  add({ path: BUS_C, d0: 0, d1: BUS_C.len, side: 0, limit: BUS.slow, north: true });                       // 0: la terminal de la ciudad
  add({ path: ROAD, d0: 14, d1: ROAD.len, side: 1, limit: BUS.road, north: true });                      // 1: la carretera, al norte
  add({ hidden: 'norte', len: BUS.hidden, limit: BUS.road, north: true });                                // 2: el túnel
  add({ path: ROAD_N, d0: 0, d1: ROAD_N.len, side: 1, limit: BUS.slow, north: true });                   // 3: de la boca norte
  add({ path: BUS_V, d0: 0, d1: BUS_V.len, side: 0, limit: BUS.slow });                                  // 4: la terminal de Valle Alegre
  add({ path: ROAD_N, d0: ROAD_N.len, d1: 0, side: -1, limit: BUS.slow });                               // 5: a la boca norte
  add({ hidden: 'sur', len: BUS.hidden, limit: BUS.road });                                               // 6: el túnel, de regreso
  add({ path: ROAD, d0: ROAD.len, d1: 30, side: -1, limit: BUS.road });                                  // 7: la carretera, al sur
  const L = { legs, dir: 1, lo: 0, hi: legs[7].s0 + legs[7].len, stops: [], lightAxis: 'NS', bus: true, _o: {} };
  L.leg = (s) => { s = ((s % L.hi) + L.hi) % L.hi; let i = legs.length - 1; while (i > 0 && legs[i].s0 > s) i--; return legs[i]; };
  L.at = function (s, o) {
    s = ((s % L.hi) + L.hi) % L.hi; const g = L.leg(s), u = s - g.s0; o.leg = legs.indexOf(g); o.hidden = !!g.hidden;
    if (g.hidden) { const R = g.hidden === 'norte' ? ROAD : ROAD_N, d = g.hidden === 'norte' ? ROAD.len : 0; roadAt(R, d, this._o); o.x = this._o.x; o.z = this._o.z; o.fx = 0; o.fz = g.north ? -1 : 1; o.y = 0; return o; }
    const back = g.d1 < g.d0, d = back ? g.d0 - u : g.d0 + u, q = roadAt(g.path, d, this._o), k = back ? -1 : 1;
    o.x = q.x + q.nx * 2 * g.side; o.z = q.z + q.nz * 2 * g.side; o.fx = q.tx * k; o.fz = q.tz * k;
    o.y = (g.path === ROAD && d > ROAD.len - 10) || (g.path === ROAD_N && d < 10) ? 0 : Math.max(0, groundY(o.x, o.z));   // dentro de una boca, a nivel
    return o;
  };
  return L;
})();
// las paradas: donde el autobús se detiene (s), dónde espera Tamachin (at, afuera, a la derecha del autobús) y hacia dónde mira al bajarse
const BUS_STOPS = [['ciudad', BUS_C, 0, BUS_RING.c, '¡Llegamos a la ciudad!'], ['valle', BUS_V, 4, BUS_RING.v, '¡Llegamos a Valle Alegre!']].map(([key, R, leg, ring, line]) => {
  let best = Infinity, bd = 0; for (let i = 0; i < R.n; i++) { const q = Math.hypot(R.x[i] - (ring.x - ring.r), R.z[i] - ring.z); if (q < best) { best = q; bd = i; } }   // en el lado oeste de su glorieta
  const o = roadAt(R, bd, {}), out = BUS_HALF + 1.3;
  return { key, s: BUS_LINE.legs[leg].s0 + bd, x: o.x, z: o.z, at: { x: o.x + o.nx * out, z: o.z + o.nz * out }, heading: Math.atan2(o.nx, o.nz), line };
});
const bus = (() => {
  const mesh = new THREE.Mesh(carGeo('bus', '#4f78d6'), MAT_CAR); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  const c = { L: BUS_LINE, s: BUS_STOPS[0].s - 40, v: 0, vmax: BUS.road, half: 4.05, hw: 1.2, h: 2.8, mesh, pause: 0, honkT: 0, stuck: 0, x: 0, z: 0, y: 0, fx: 0, fz: 1, line: true, halt: null, done: null };
  c.bubblePos = (v) => v.set(c.x, c.y + c.h + 0.5, c.z);
  c.signs = ['Valle Alegre', 'Ciudad'].map((t) => {                 // el letrero de enfrente dice a dónde va
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.28), new THREE.MeshBasicMaterial({ map: canvasTex(256, 52, (g, W, H) => {
      g.fillStyle = '#1d1a14'; g.fillRect(0, 0, W, H); g.fillStyle = '#ffb83d'; g.font = '900 34px Nunito, "Trebuchet MS", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, W / 2, H / 2 + 2); }) }));
    m.position.set(0, 2.62, 4.03); mesh.add(m); return m;
  });
  cars.push(c); return c;
})();
// Luces de los autos: de noche (y con lluvia, como las ventanas: day.lamps) se prenden los faros y las calaveras, y los faros alumbran el
// piso de enfrente. Sin luces de verdad: las mismas bolitas del auto otra vez, un poco más grandes y de luz propia (nightMat), y una mancha
// que suma luz en el piso. Un InstancedMesh para las de los autos, otro para las del autobús y otro para las manchas; siguen a cada auto
// (updateCarLights) solo mientras están prendidas.
const carLights = (() => {
  const geo = (bus) => {
    const b = new Batch(), zf = bus ? 4.02 : 2.1, xf = bus ? 0.8 : 0.6, xr = bus ? 0.8 : 0.62, yf = bus ? 0.85 : 0.68, yr = bus ? 0.9 : 0.7; b.ao = false;
    for (const sx of [-1, 1]) b.sph('#fff4c8', sx * xf, yf, zf, 0.21, 0.16, 0.08).sph('#ff2a1f', sx * xr, yr, -zf, 0.19, 0.14, 0.08);
    return b.geometry();
  };
  const mat = nightMat(0xffffff, 1, { vertexColors: true }), buses = cars.filter((c) => c.half > 3), autos = cars.filter((c) => c.half <= 3);
  const beamTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 8, 2, 32, 22, 44); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const L = { auto: new THREE.InstancedMesh(geo(false), mat, autos.length), bus: new THREE.InstancedMesh(geo(true), mat, buses.length),
    beam: new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), nightMat(0xffe7a8, 0.34, { map: beamTex, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), cars.length) };
  autos.forEach((c, i) => { c.li = i; c.lm = L.auto; }); buses.forEach((c, i) => { c.li = i; c.lm = L.bus; });
  for (const k in L) { L[k].frustumCulled = false; L[k].raycast = () => {}; scene.add(L[k]); }
  return L;
})();
const _clm = new THREE.Matrix4(), _clq = new THREE.Quaternion(), _clv = new THREE.Vector3(), _cls = new THREE.Vector3(), _clUp = new THREE.Vector3(0, 1, 0);
function updateCarLights() {
  if (day.lamps < 0.01) return;                                     // apagadas: nightMat ni las dibuja
  cars.forEach((c, i) => {
    const ry = c.mesh.rotation.y, fx = Math.sin(ry), fz = Math.cos(ry), k = c.hidden ? 0 : 1; _clq.setFromAxisAngle(_clUp, ry);   // en el túnel, apagadas
    c.lm.setMatrixAt(c.li, _clm.compose(c.mesh.position, _clq, _cls.set(k, k, k)));
    carLights.beam.setMatrixAt(i, _clm.compose(_clv.set(c.x + fx * (c.half + 3.2), c.y + 0.08, c.z + fz * (c.half + 3.2)), _clq, _cls.set(c.hw * 2.6 * k, 1, 6.5 * k)));   // 6.5 m enfrente
  });
  for (const k in carLights) carLights[k].instanceMatrix.needsUpdate = true;
}
const carBox = { x0: 0, x1: 0, z0: 0, z1: 0 };
function carRect(c, pad) {                                           // la caja de un auto que va a lo largo de x o de z
  const a = Math.abs(c.fx) > Math.abs(c.fz);
  carBox.x0 = c.x - (a ? c.half : c.hw) - pad; carBox.x1 = c.x + (a ? c.half : c.hw) + pad; carBox.z0 = c.z - (a ? c.hw : c.half) - pad; carBox.z1 = c.z + (a ? c.hw : c.half) + pad; return carBox;
}
// Donde los autos esperan a Tamachin sin pitar ni asustarlo, como con el monito verde: la boca del túnel de la luna (mundos/luna.js).
const CALM = [];
const calmAt = (x, z) => CALM.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
function updateCars(dt, t) {
  for (const c of cars) placeCar(c);
  const P = player, inCity = P.pos.z > -66, pz = inCity ? zebraAt(P.pos.x, P.pos.z, 0.6) : null, polite = (!!pz && pz.state !== 'stop') || calmAt(P.pos.x, P.pos.z);   // cruza con el monito verde
  for (const c of cars) {
    const L = c.L, dir = L.dir, fx = c.fx, fz = c.fz; let gap = 999, cross = false, honk = false;   // al frente: (fx, fz); al lado: (fz, −fx)
    const front = c.s + dir * c.half;
    for (const st of L.stops) {
      const d = (st.pos - front) * dir; if (d < -0.6 || d > 40) continue;
      const s = lightState(st.I, L.lightAxis, t); if (s === 'r' || (s === 'y' && d > 2.5)) gap = Math.min(gap, d);
    }
    for (const o of cars) {
      if (o === c || o.hidden || c.hidden) continue;                 // en el túnel (el autobús) no estorba ni lo estorban
      const dx = o.x - c.x, dz = o.z - c.z, fwd = dx * fx + dz * fz; if (fwd <= 0 || fwd > 30) continue;
      const lat = Math.abs(dx * fz - dz * fx), same = Math.abs(fx * o.fx + fz * o.fz) > 0.7;   // en la misma dirección o en la contraria
      if (lat < c.hw + (same ? o.hw : o.half) + 0.25) {
        if (!same && c.stuck > 5) continue;
        const g = fwd - c.half - (same ? o.half : o.hw) - 1.6; if (g < gap) gap = g; if (!same && g < 1.5) cross = true;
      }
    }
    let pg = 999;                                                    // qué tan lejos va Tamachin delante, en su carril
    if (!c.hidden && P.state !== 'fly' && P.state !== 'ride' && Math.abs(P.pos.x - c.x) < 40 && Math.abs(P.pos.z - c.z) < 40) {   // en la ciudad y en la carretera (arriba del autobús, no)
      const dx = P.pos.x - c.x, dz = P.pos.z - c.z, fwd = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
      if (fwd > 0 && lat < c.hw + 0.8 && P.pos.y < c.y + 1.6) { const g = fwd - c.half - 1.3; if (g < 7) { pg = g; gap = Math.min(gap, g); honk = !polite; } }
    }
    let target = c.vmax; if (c.pause > 0) { c.pause -= dt; target = 0; }
    if (L.bus) {                                                     // el autobús: más despacio en las terminales, sus paradas como un alto
      const g = L.leg(c.s); target = Math.min(target, g.limit);
      for (const h of BUS_STOPS) {
        let d = h.s - c.s; if (d < -1) d += L.hi;
        if (c.done === h) { if (d > 60) c.done = null; continue; }    // ya se paró ahí: hasta la siguiente vuelta
        if (d < 40) gap = Math.min(gap, d);
        if (d < 0.4 && c.v < 0.6) { c.pause = BUS.dwell; c.halt = h; c.done = h; if (c.onHalt) c.onHalt(h); }
      }
      if (c.pause <= 0) c.halt = null;
      if (c.hidden && g.s0 + g.len - c.s < 3) {                        // al salir del túnel cede el paso a quien salga justo ahí
        const e = L.at(g.s0 + g.len + 0.1, {}); if (cars.some((o) => o !== c && !o.hidden && Math.hypot(o.x - e.x, o.z - e.z) < 14)) target = 0;
      }
    }
    if (gap < 999) target = Math.min(target, Math.sqrt(Math.max(0, 18 * gap)));
    c.v = c.v < target ? Math.min(target, c.v + 4.5 * dt) : Math.max(target, c.v - 13 * dt);
    // Tráfico amable: nunca lo atropella. Si Tamachin se le pone enfrente de golpe frena en seco (hasta 40 m/s²) y para antes de tocarlo
    // (con g = 0 el defensa queda a 1.3 m de su centro; lo tocaría en g ≈ −0.9). Si venía rápido pita y Tamachin se asusta, una vez por
    // acercamiento (startle, 06-main.js); si cruza por el paso de cebra con el monito verde, el auto solo espera.
    if (pg < 999) {
      const vMax = Math.sqrt(80 * Math.max(0, pg + 0.9));
      if (!polite && !c.scared && pg < 3 && c.v > 2.5) { c.scared = true; startle(c, c.v - vMax > 2.5); }
      c.v = Math.min(c.v, vMax);
    } else c.scared = false;
    c.stuck = cross && c.v < 0.3 ? c.stuck + dt : Math.max(0, c.stuck - dt * 3);
    c.s += dir * c.v * dt; if (dir > 0 ? c.s > L.hi : c.s < L.lo) c.s -= dir * (L.hi - L.lo);
    placeCar(c);
    c.mesh.position.set(c.x, c.y + Math.sin(t * 9 + c.vmax * 7) * 0.012 * Math.min(1, c.v / 4), c.z); c.mesh.rotation.y = Math.atan2(c.fx, c.fz);
    c.mesh.visible = !c.hidden; if (c.signs) { const n = !!L.legs[c.leg].north; c.signs[0].visible = n; c.signs[1].visible = !n; }
    c.honkT -= dt;
    if (honk && c.v < 3.5 && c.honkT <= 0) { c.honkT = rand(1.8, 2.8); say(c, choose(['¡Piii, piii!', '¡Cuidado, Tamachin!', '¡Bip, bip!', '¡Muévete, porfa!']), 1.4); SFX.honk(); }
  }
  updateCarLights();
}

// ───────────────────────── pasos de cebra y semáforos de peatones ─────────────────────────
// Cuatro pasos de cebra por cruce (las rayas las pinta cityTex, 03-world.js). Cada uno cruza la calle de un eje (`ax`: los autos que pasan
// por él); `along` es hacia dónde camina el que cruza, `c` el centro de esa calle y `w0..w1` el ancho de las rayas. Un poste por paso,
// en una sola punta, del lado de afuera de las rayas (lejos del semáforo de los autos, que está en la esquina), así queda junto a su paso.
// Las puntas van como un rehilete (el del norte en su punta del noreste, el del este en la del sureste, el del sur en la del suroeste, el
// del oeste en la del noroeste): cada esquina tiene uno, y desde la otra punta se mira el del otro lado de la calle, como en la calle de verdad.
const ZEBRAS = [], PED_SIGNS = [];
for (const I of INTERS) for (const [ax, along, s] of [['EW', 'z', -1], ['EW', 'z', 1], ['NS', 'x', -1], ['NS', 'x', 1]]) {
  const o0 = s < 0 ? -6.9 : 4.5, o1 = s < 0 ? -4.5 : 6.9, out = s * 7.3;
  const Z = along === 'z' ? { I, ax, along, c: I.z, w0: I.x + o0, w1: I.x + o1, state: 'stop' } : { I, ax, along, c: I.x, w0: I.z + o0, w1: I.z + o1, state: 'stop' };
  Z.signs = [along === 'z' ? s : -s].map((e) => { const p = along === 'z' ? { x: I.x + out, z: I.z + e * 4.6 } : { x: I.x + e * 4.6, z: I.z + out }; p.i = PED_SIGNS.length; p.Z = Z; PED_SIGNS.push(p); return p; });
  ZEBRAS.push(Z);
}
// El monito sale de lightState (un solo reloj): verde 3.5 s después del rojo de sus autos (medido: el último que pasó en amarillo tarda
// hasta 2.6 s en dejar las rayas, un autobús 3.1), parpadea desde 2 s antes de que les toque verde y se pone rojo 0.5 s antes.
const carsRed = (I, ax, t) => lightState(I, ax, t) === 'r';
function pedState(Z, t) {
  if (!carsRed(Z.I, Z.ax, t) || !carsRed(Z.I, Z.ax, t - 3.5)) return 'stop';
  return carsRed(Z.I, Z.ax, t + 2) ? 'walk' : carsRed(Z.I, Z.ax, t + 0.5) ? 'flash' : 'stop';
}
// u: a lo largo del cruce, desde el centro de la calle; w: a lo ancho de las rayas. zebraAt: el paso donde está (x, z), sobre la calle o
// en la orilla, con `m` de holgura a los lados de las rayas.
const zebraU = (Z, x, z) => Z.along === 'z' ? z - Z.c : x - Z.c, zebraW = (Z, x, z) => Z.along === 'z' ? x : z;
function zebraAt(x, z, m) {
  for (const Z of ZEBRAS) { const w = zebraW(Z, x, z); if (w > Z.w0 - m && w < Z.w1 + m && Math.abs(zebraU(Z, x, z)) < RW + 0.3) return Z; }
  return null;
}
// Postes sólidos y delgados, en su propia malla sin raycast (no cuentan como estorbo de la cámara en las pruebas). Arriba, una caja con el
// monito en sus dos caras, que miran a lo largo de su paso, como los de dos caras de la calle de verdad: de frente, o desde la otra punta,
// se ve el monito; de lado, la caja oscura. Así también se sabe de qué paso es. Las caras tienen luz propia (de noche se ven igual).
const pedB = new Batch();
for (const p of PED_SIGNS) { pedB.cyl('#3b4252', p.x, 1.2, p.z, 0.06, 0.08, 2.4, 8); solidCircle(p.x, p.z, 0.14); }
const pedPosts = pedB.mesh(); pedPosts.raycast = () => {}; scene.add(pedPosts);
function pedIcon(walk) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#231d3b'; g.beginPath(); g.arc(64, 64, 62, 0, TAU); g.fill();
    g.strokeStyle = '#fffdf6'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 57, 0, TAU); g.stroke();
    g.fillStyle = g.strokeStyle = walk ? '#3ef07f' : '#ff4b3e'; g.lineCap = g.lineJoin = 'round'; g.lineWidth = 12;
    const line = (...q) => { g.beginPath(); g.moveTo(q[0], q[1]); for (let i = 2; i < q.length; i += 2) g.lineTo(q[i], q[i + 1]); g.stroke(); };
    if (walk) {                                                     // caminando hacia la derecha
      g.beginPath(); g.arc(70, 29, 11, 0, TAU); g.fill();
      line(66, 47, 59, 75); line(59, 75, 72, 87, 72, 104); line(59, 75, 51, 91, 39, 99); line(64, 53, 77, 64, 87, 61); line(64, 53, 51, 63, 45, 74);
    } else {                                                        // parado, quieto
      g.beginPath(); g.arc(64, 28, 11, 0, TAU); g.fill();
      line(64, 47, 64, 77); line(64, 77, 56, 104); line(64, 77, 72, 104); line(64, 52, 52, 76); line(64, 52, 76, 76);
    }
  });
}
const PED_Y = 2.72, PED_BOX = [0.46, 0.54, 0.24], PED_SIZE = 0.5;   // la caja, arriba del poste (de 2.4 m): ancho, alto y fondo (a lo largo del paso)
// Caja y caras se desvanecen si quedan entre la cámara y Tamachin (signFade): un valor por instancia (`aFade`) que multiplica la opacidad.
function pedFadeMat(mat) {
  mat.transparent = true;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aFade;\nvarying float vFade;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    sh.fragmentShader = 'varying float vFade;\n' + sh.fragmentShader.replace('#include <tonemapping_fragment>', 'gl_FragColor.a *= vFade;\n#include <tonemapping_fragment>');
  };
  mat.customProgramCacheKey = () => 'monito'; return mat;
}
// box: una por poste; walk y stop: dos caras por poste (2·i al frente, 2·i + 1 atrás). fade: los `aFade` de cada una.
const pedHeads = (() => {
  const n = PED_SIGNS.length, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), white = new THREE.Color(1, 1, 1);
  const fade = (geo, count) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aFade', a); return a; };
  const boxGeo = new THREE.BoxGeometry(...PED_BOX), walkGeo = new THREE.PlaneGeometry(0.42, 0.42), stopGeo = walkGeo.clone();
  const F = { box: fade(boxGeo, n), walk: fade(walkGeo, 2 * n), stop: fade(stopGeo, 2 * n) };
  const box = new THREE.InstancedMesh(boxGeo, pedFadeMat(new THREE.MeshLambertMaterial({ color: 0x2a2840 })), n);
  const face = (geo, walk) => new THREE.InstancedMesh(geo, pedFadeMat(new THREE.MeshBasicMaterial({ map: pedIcon(walk), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })), 2 * n);
  const walk = face(walkGeo, true), stop = face(stopGeo, false);
  for (const p of PED_SIGNS) {
    const ry = p.Z.along === 'z' ? 0 : Math.PI / 2, d = PED_BOX[2] / 2 + 0.004;
    box.setMatrixAt(p.i, m4.compose(v.set(p.x, PED_Y, p.z), q.setFromAxisAngle(up, ry), one));
    for (const k of [0, 1]) {
      const a = ry + k * Math.PI; m4.compose(v.set(p.x + Math.sin(a) * d, PED_Y, p.z + Math.cos(a) * d), q.setFromAxisAngle(up, a), one);
      walk.setMatrixAt(2 * p.i + k, m4); stop.setMatrixAt(2 * p.i + k, m4); walk.setColorAt(2 * p.i + k, white);
    }
  }
  box.castShadow = true; box.receiveShadow = true; box.renderOrder = 2.4; walk.renderOrder = stop.renderOrder = 2.5;   // la caja, antes que sus caras
  for (const m of [box, walk, stop]) { m.frustumCulled = false; m.raycast = () => {}; scene.add(m); }
  return { box, walk, stop, fade: F };
})();
// después del halo del farolito y de la fogata (si no, de noche un brillo aditivo pintaba encima del disco), antes que la lluvia (3)
// Una caja que queda entre la cámara y Tamachin lo taparía: se desvanece. d es la distancia de la caja a la línea
// cámara→Tamachin; el cono de su cuerpo mide 0.65·t ahí (t: qué tan cerca de él está la caja, de 0 en la cámara a 1 en él).
function signFade(p, P) {
  const c = camera.position, dx = P.pos.x - c.x, dy = P.pos.y + 0.75 * P.T.scale - c.y, dz = P.pos.z - c.z, sx = p.x - c.x, sy = PED_Y - c.y, sz = p.z - c.z;
  const t = (sx * dx + sy * dy + sz * dz) / (dx * dx + dy * dy + dz * dz); if (t <= 0 || t >= 1) return 1;
  const d = Math.hypot(sx - t * dx, sy - t * dy, sz - t * dz), touch = PED_SIZE / 2 + 0.65 * t;
  return clamp((d - touch + 0.3) / 0.5, 0.15, 1);
}
const _pk = new THREE.Color();
function updatePedSigns(t) {
  const P = player, H = pedHeads, on = P.pos.z > -70, blink = (t * 2.5) % 1 < 0.6; let chirp = false;
  H.box.visible = H.walk.visible = H.stop.visible = on;
  for (const Z of ZEBRAS) {
    const s = pedState(Z, t), mid = (Z.w0 + Z.w1) / 2;
    if (s === 'walk' && Z.state === 'stop' && on && [-1, 1].some((e) => Math.hypot(P.pos.x - (Z.along === 'z' ? mid : Z.c + e * (RW + 0.8)), P.pos.z - (Z.along === 'z' ? Z.c + e * (RW + 0.8) : mid)) < 2.5)) chirp = true;   // esperando en una de sus bocas
    Z.state = s; if (!on) continue;
    const k = s === 'flash' && !blink ? 0.25 : 1;                    // parpadeando: se apaga a ratos
    for (const p of Z.signs) {
      const f = signFade(p, P); H.fade.box.setX(p.i, f);
      for (const j of [2 * p.i, 2 * p.i + 1]) { H.fade.walk.setX(j, s === 'stop' ? 0 : f); H.fade.stop.setX(j, s === 'stop' ? f : 0); H.walk.setColorAt(j, _pk.setRGB(k, k, k)); }
    }
  }
  if (on) { for (const a of [H.fade.box, H.fade.walk, H.fade.stop]) a.needsUpdate = true; H.walk.instanceColor.needsUpdate = true; }
  if (chirp) SFX.walkSign();
}

// ───────────────────────── vecinos (otros tamachines) ─────────────────────────
const LINES = {
  contento: ['¡Hola! ¡Qué lindo día para pasear!', '¿Ya fuiste al bosque? Sal por el portón del parque.', 'Dicen que el búho del bosque lo sabe todo.', '¡Me gustan tus ojotes!', 'Cruza cuando el monito del semáforo esté verde, ¿sí?'],
  triste: ['Se me cayó el helado…', 'Hoy nadie me ha saludado…', 'Extraño a mi amigo el conejo.'],
  enojado: ['¡Un auto casi me aplasta! ¡Grr!', '¡Alguien pisó mis flores!', '¡Hmpf! Ese semáforo tarda una eternidad.'],
  asombrado: ['¡Oh! ¿Viste eso? ¡Cambió el semáforo!', '¡Guau! ¿Vienes desde tu casa?', '¡Increíble! Pasó un autobús enorme.'],
  dormido: ['Zzz… cinco minutitos más…', 'Mmm… ¿ya es de día?', 'Zzz… sueño con gelatina…'],
  enamorado: ['Ay… el parque está tan bonito hoy…', '¿Me acompañas a ver la fuente?', 'Suspiro… qué ojos tan grandes tienes.'],
};
const npcs = [];
// rutas cerradas: una polilínea que se recorre por distancia. Al trazar una, que no pase por sólidos (bancas, arbustos, árboles).
function pathLoop(pts) {
  const segs = []; let L = 0;
  pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ x: a[0], z: a[1], tx: (b[0] - a[0]) / len, tz: (b[1] - a[1]) / len, s: L }); L += len; });
  return { segs, L };
}
function rectLoop(x0, x1, z0, z1) { return pathLoop([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]); }
function ringLoop(cx, cz, r, n) { const p = []; for (let i = 0; i < n; i++) p.push([cx + Math.cos(i * TAU / n) * r, cz + Math.sin(i * TAU / n) * r]); return pathLoop(p); }
function loopAt(R, t, out) {
  t = ((t % R.L) + R.L) % R.L;
  let q = R.segs[0]; for (const s of R.segs) { if (s.s > t) break; q = s; }
  const u = t - q.s; out.x = q.x + q.tx * u; out.z = q.z + q.tz * u; out.tx = q.tx; out.tz = q.tz; return out;
}
const blockLoop = (i, j) => rectLoop(BLOCKS[i][0] + 2, BLOCKS[i][1] - 2, BLOCKS[j][0] + 2, BLOCKS[j][1] - 2);
function addNPC(o) {                                  // o.rng: semilla propia (Valle Alegre); sin ella, la de casa
  const R = o.rng || rnd, RR = (a, b) => a + (b - a) * R();
  const T = makeTamachin({ shape: o.shape, color: o.color, mood: o.mood, scale: o.scale || RR(1.0, 1.22) });
  const n = { T, name: o.name, kind: 'vecino', loop: o.loop || null, t: o.loop ? R() * o.loop.L : R() * 9, dir: R() < 0.5 ? 1 : -1, speed: RR(1.4, 2.1) * (MOODS[o.mood].speed || 1),
    pause: RR(0, 3), heading: R() * TAU, talkT: 0, lines: o.lines || null, li: 0, home: o.home || null, mood0: o.mood, cheer: 0, count: 0, pos: T.pos, bubblePos: T.bubblePos };
  if (o.home) { T.pos.set(o.home.x, 0, o.home.z); n.heading = o.home.ry || 0; }
  else { loopAt(n.loop, n.t, _lp); T.pos.set(_lp.x, 0, _lp.z); }
  npcs.push(n); return n;
}
const _lp = { x: 0, z: 0, tx: 0, tz: 0 };
addNPC({ name: 'Pompón', shape: 'bola', color: '#ff8a5c', mood: 'contento', loop: blockLoop(0, 0) });
addNPC({ name: 'Chispa', shape: 'estrella', color: '#ffd23f', mood: 'asombrado', loop: blockLoop(2, 0) });
addNPC({ name: 'Mota', shape: 'gatito', color: '#c58bff', mood: 'contento', loop: blockLoop(0, 1) });
addNPC({ name: 'Nube', shape: 'fantasma', color: '#f4f1e8', mood: 'dormido', loop: blockLoop(2, 1) });
addNPC({ name: 'Kiwi', shape: 'huevo', color: '#9bd34a', mood: 'enojado', loop: blockLoop(0, 2) });
addNPC({ name: 'Tofu', shape: 'cubito', color: '#7cd4e8', mood: 'triste', loop: blockLoop(1, 2) });
addNPC({ name: 'Lulú', shape: 'gota', color: '#ff6b9d', mood: 'enamorado', loop: blockLoop(2, 2) });
addNPC({ name: 'Bombón', shape: 'hongo', color: '#ff5d5d', mood: 'contento', loop: blockLoop(1, 1) });
addNPC({ name: 'Pistacho', shape: 'bola', color: '#35c9a0', mood: 'contento', loop: ringLoop(0, -45, 4.25, 24) });   // entre la fuente (r 2.9) y las bancas
addNPC({ name: 'Canela', shape: 'gatito', color: '#e8a063', mood: 'asombrado',                                     // esquinas recortadas por los arbustos
  loop: pathLoop([[-14.6, -60], [14.6, -60], [17.6, -57], [17.6, -34], [14.6, -31], [-14.6, -31], [-17.6, -34], [-17.6, -57]]) });
addNPC({ name: 'Musgo', shape: 'hongo', color: '#58b368', mood: 'contento', home: { x: CAMP.x - 3.4, z: CAMP.z - 3, ry: 0.5 },
  lines: ['Bienvenido al claro. La fogata siempre está calientita.', 'El búho de ese tronco responde cualquier pregunta.', 'Si caminas despacio, los conejos no huyen.'] });
addNPC({ name: 'Rocío', shape: 'gota', color: '#7c9cff', mood: 'enamorado', home: { x: BR.x + 3.2, z: BR.z - 12, ry: 0.2 },
  lines: ['El río baja desde las montañas nevadas.', '¿Viste saltar a los peces?', 'Cruza por el puente… o mójate los pies.'] });

function updateNPCs(dt) {
  const P = player.pos;
  for (const n of npcs) {
    const T = n.T, dx = P.x - n.pos.x, dz = P.z - n.pos.z, d = Math.hypot(dx, dz);
    let speed = 0; n.talkT = Math.max(0, n.talkT - dt);
    if (n.cheer > 0) { n.cheer -= dt; if (n.cheer <= 0) T.setMood(n.mood0); }
    T.group.visible = d < 160 || !!n.follow;              // lejos son unos cuantos píxeles y muchas mallas (desde una cima se ve todo el pueblo)
    if (n.goto && n.talkT <= 0) {                     // camina a un lugar fijo (al terminar un encargo) y ahí se queda
      const ex = n.goto.x - n.pos.x, ez = n.goto.z - n.pos.z, ed = Math.hypot(ex, ez);
      if (ed < 0.12) n.goto = null;
      else { const sp = Math.min(1.8, ed * 3); n.pos.x += ex / ed * sp * dt; n.pos.z += ez / ed * sp * dt; n.heading += angDiff(n.heading, Math.atan2(ex, ez)) * Math.min(1, dt * 8); speed = sp / 3.2; }
      T.group.rotation.y = n.heading; T.update(dt, { speed, near: d < 45 }); continue;
    }
    if (n.follow) {                                   // acompaña a Tamachin un poco detrás y a un lado; n.follow decide si llegó o se perdió
      const tx = P.x - Math.sin(player.heading) * 1.9 + Math.cos(player.heading) * 0.9, tz = P.z - Math.cos(player.heading) * 1.9 - Math.sin(player.heading) * 0.9;
      const ex = tx - n.pos.x, ez = tz - n.pos.z, ed = Math.hypot(ex, ez);
      if (ed > 0.5 && d > 1.7) {
        const sp = clamp(ed * 1.8, 1.4, 7.8); n.pos.x += ex / ed * sp * dt; n.pos.z += ez / ed * sp * dt; resolveAgent(n.pos, 0.45 * T.scale);
        n.heading += angDiff(n.heading, Math.atan2(ex, ez)) * Math.min(1, dt * 8); speed = sp / 3.2;
      } else n.heading += angDiff(n.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 6);
      T.group.rotation.y = n.heading; T.update(dt, { speed, near: true });
      n.follow(n, d); continue;
    }
    if (d > 75) continue;
    const facing = n.talkT > 0 || d < 2.4;
    if (facing) n.heading += angDiff(n.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 7);
    else if (n.loop) {
      if (n.pause > 0) n.pause -= dt;
      else {
        n.t += n.dir * n.speed * dt; loopAt(n.loop, n.t, _lp); n.pos.x = _lp.x; n.pos.z = _lp.z;
        n.heading += angDiff(n.heading, Math.atan2(_lp.tx * n.dir, _lp.tz * n.dir)) * Math.min(1, dt * 8); speed = n.speed / 3.2;
        if (Math.random() < dt * 0.11) { n.pause = rand(1.5, 4); if (Math.random() < 0.3) n.dir *= -1; }
      }
    } else if (n.home) n.heading += angDiff(n.heading, (n.home.ry || 0) + Math.sin(clock * 0.4 + n.t) * 0.6) * Math.min(1, dt * 2);
    T.group.rotation.y = n.heading;
    T.update(dt, facing ? { speed: 0, near: d < 45, lookX: 0, lookY: 0.15 } : { speed, near: d < 45 });
  }
}
const RAIN_LINES = ['¡Qué rico huele cuando llueve!', '¿Trajiste paraguas? Yo sí.', 'Después de la lluvia a veces sale un arcoíris.', 'Las plantas están felices con la lluvia.', '¡Cuidado, que salpicas!', 'Los caracoles salen cuando llueve.'];
const NIGHT_LINES = ['¡Qué noche tan bonita!', '¿Ya viste la luna? Está bajita, hacia el norte.', 'Me gusta tu farolito.', 'Shhh… los pájaros ya se durmieron.',
  'Desde la cima se ven muchas estrellas.', 'Ya es tarde… mañana jugamos más.', '¿Oyes los grillos?'];
function talkTo(n) {
  const T = n.T; n.talkT = 3.4; let line = n.onTalk ? n.onTalk(n) : null;    // los encargos hablan primero
  if (line) { /* ya está */ }
  else if ((n.mood0 === 'triste' || n.mood0 === 'enojado') && T.mood === n.mood0 && ++n.count >= 2) {
    n.count = 0; T.setMood('contento'); n.cheer = 25; line = '¡Gracias por escucharme! Ya me siento mejor.';
    burst('heart', n.pos.x, 1.8, n.pos.z, 5); SFX.nice();
  } else if (weather.rain > 0.3 && !quests.charcos) { startQuest('charcos'); line = '¡Está lloviendo! ¿Sabes qué es lo más divertido? Brincar en los charcos. ¡Brinca en diez!'; }
  else if (weather.rain > 0.3 && Math.random() < 0.6) line = choose(RAIN_LINES);   // con lluvia, a veces hablan de la lluvia
  else if (day.light < 0.3 && Math.random() < 0.5) line = choose(NIGHT_LINES);   // de noche, a veces hablan de la noche
  else line = n.lines ? n.lines[n.li++ % n.lines.length] : choose(LINES[T.mood] || LINES.contento);
  say(n, line, 3.4); SFX.talk(); T.doTrick(T.mood === 'dormido' ? 'giggle' : choose(['hop', 'wave', 'giggle'])); gain('diversion', 0.06, 'charla' + n.name, 12);
  player.T.doTrick('wave'); player.heading = Math.atan2(n.pos.x - player.pos.x, n.pos.z - player.pos.z);
}

// ───────────────────────── criaturas del bosque ─────────────────────────
const creatures = [], interacts = [];
function nearPlayer(o) { return Math.hypot(player.pos.x - o.pos.x, player.pos.z - o.pos.z); }
function wetAt(x, z) { return riverDepth(x, z) < -0.1 && !onBridge(x, z); }

// una casa nueva para un conejo cerca de (x, z), fuera de la carretera
function homeNear(x, z) { for (const [dx, dz] of [[0, 0], [9, 0], [-9, 0], [0, 9], [0, -9], [14, 6], [-14, 6]]) if (!nearRoad(x + dx, z + dz, ROAD_HALF + 2)) return { x: x + dx, z: z + dz }; return { x, z }; }
function makeRabbit(x, z, col) {
  const b = new Batch();
  b.sph(col, 0, 0.3, 0, 0.26, 0.24, 0.34).sph(col, 0, 0.5, 0.26, 0.19).sph(col, -0.08, 0.8, 0.2, 0.05, 0.2, 0.04).sph(col, 0.08, 0.8, 0.2, 0.05, 0.2, 0.04)
    .sph('#ffb3c7', -0.08, 0.8, 0.225, 0.028, 0.14, 0.02).sph('#ffb3c7', 0.08, 0.8, 0.225, 0.028, 0.14, 0.02).sph('#ffffff', 0, 0.3, -0.33, 0.1)
    .sph('#201a2a', -0.1, 0.55, 0.41, 0.036).sph('#201a2a', 0.1, 0.55, 0.41, 0.036).sph('#ff8fab', 0, 0.48, 0.45, 0.03)
    .sph(col, -0.13, 0.06, 0.2, 0.07, 0.06, 0.13).sph(col, 0.13, 0.06, 0.2, 0.07, 0.06, 0.13).sph(col, -0.16, 0.08, -0.12, 0.08, 0.08, 0.16).sph(col, 0.16, 0.08, -0.12, 0.08, 0.08, 0.16);
  const mesh = b.mesh(MAT_SOFT); mesh.scale.setScalar(1.25); mesh.position.set(x, 0, z); scene.add(mesh);
  const o = { kind: 'conejo', mesh, pos: mesh.position, home: { x, z }, tx: x, tz: z, hopP: 0, hopSpeed: 0, rest: 0, wait: rand(0, 3), follow: 0, scare: 0, heading: rand(0, TAU), side: rand(-1, 1), range: 5, clickR: 0.6,
    buddy: null, stuckT: 0, onLost: null, onStuck: null };
  o.bubblePos = (v) => v.set(o.pos.x, o.pos.y + 1.25, o.pos.z);
  // De viaje en otro mundo con Tamachin (`o.world`, la luna; lo lleva setWorld, 06-main.js): pisa su suelo, choca con lo suyo, no hay agua,
  // y con poca gravedad cada brinco es más alto y más lento. Allá no se cansa de seguirlo ni se pierde: así vuelve con él.
  o.update = (dt) => {
    const P = player.pos, dxp = P.x - o.pos.x, dzp = P.z - o.pos.z, dp = Math.hypot(dxp, dzp), M = o.world ? WORLDS[o.world] : null;
    const low = !!M && M.rules.grav < RULES.grav * 0.6, HOP = low ? 0.8 : 0.36, HIGH = low ? 1.3 : 0.4;   // cuánto dura un brinco y qué tan alto (con poca gravedad, más)
    if (!M && o.follow > 0) { o.follow = Math.max(0, o.follow - dt); if (!o.follow && Math.hypot(o.home.x - o.pos.x, o.home.z - o.pos.z) > 60) o.home = homeNear(o.pos.x, o.pos.z); }   // lejos de su casa (lo llevó por el túnel): se queda a vivir ahí
    o.scare = Math.max(0, o.scare - dt);
    if (!M && o.follow > 0 && dp > 32) { o.follow = 0; if (o.onLost) o.onLost(o); }          // se quedó muy atrás
    if (o.buddy) { const B = o.buddy; o.tx = B.pos.x - Math.sin(B.heading) * 1.3 + o.side * 0.5; o.tz = B.pos.z - Math.cos(B.heading) * 1.3; }
    else if (o.follow > 0) { o.tx = P.x - Math.sin(player.heading) * 1.7 + o.side + (low ? player.vx * HOP : 0); o.tz = P.z - Math.cos(player.heading) * 1.7 + (low ? player.vz * HOP : 0); }   // allá, a donde va a llegar (el brinco es largo)
    else if (dp < 3.2 && player.speedN > 1.3 && o.scare <= 0) { o.tx = o.pos.x - dxp / dp * 5; o.tz = o.pos.z - dzp / dp * 5; o.scare = 2; o.rest = 0; emit('excl', o.pos.x, 1.1, o.pos.z); }
    else if (o.scare <= 0) { o.wait -= dt; if (o.wait <= 0) { o.wait = rand(2, 6); const a = rand(0, TAU), r = rand(0, o.range); o.tx = o.home.x + Math.cos(a) * r; o.tz = o.home.z + Math.sin(a) * r; if (nearRoad(o.tx, o.tz, ROAD_HALF + 1)) { o.tx = o.home.x; o.tz = o.home.z; } } }   // a la carretera no
    const dx = o.tx - o.pos.x, dz = o.tz - o.pos.z, d = Math.hypot(dx, dz);
    if (o.hopP > 0) {
      o.hopP += dt / HOP; const k = Math.min(1, o.hopP);
      o.pos.x += Math.sin(o.heading) * o.hopSpeed * dt; o.pos.z += Math.cos(o.heading) * o.hopSpeed * dt; o.pos.x = clamp(o.pos.x, -60, 60);
      if (o.follow > 0 || o.buddy) resolveAgent(o.pos, 0.3, M && M.solids);
      if (M) M.collide(o.pos);                                       // la orilla del cráter
      const g = M ? M.ground(o.pos.x, o.pos.z) : Math.max(0, groundY(o.pos.x, o.pos.z));   // en la Tierra también sube a los puentes y a los cerros
      o.pos.y = g + Math.sin(k * Math.PI) * HIGH; mesh.rotation.x = -Math.cos(k * Math.PI) * 0.28;
      if (o.hopP >= 1) { o.hopP = 0; o.pos.y = g; mesh.rotation.x = 0; o.rest = (o.follow > 0 || o.scare > 0 || o.buddy) ? 0.03 : rand(0.1, 0.35); if (low) burst('puff', o.pos.x, g + 0.05, o.pos.z, 2); }   // en la luna, polvito
    } else {
      o.rest -= dt;
      if (d > 0.8) {
        o.heading += angDiff(o.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
        if (o.rest <= 0) {
          const sp = (o.follow > 0 || o.scare > 0 || o.buddy) ? clamp(d / HOP, low ? 1.2 : 3, low ? 11 : 8) : 2.6;
          if (low) o.heading = Math.atan2(dx, dz);                       // un brinco largo, derecho a donde va (si no, va en espiral)
          if (!M && wetAt(o.pos.x + Math.sin(o.heading) * sp * 0.4, o.pos.z + Math.cos(o.heading) * sp * 0.4)) {
            o.rest = 0.6; o.tx = o.pos.x; o.tz = o.pos.z;
            if (o.follow > 0 && (o.stuckT += 0.6) > 2.4 && o.onStuck) { o.onStuck(o); o.stuckT = -20; }   // no nada: hay que cruzar por el puente
          }
          else { o.hopP = 0.001; o.hopSpeed = sp; if (o.stuckT > 0) o.stuckT = 0; }
        }
      } else if (dp < 4.5) o.heading += angDiff(o.heading, Math.atan2(dxp, dzp)) * Math.min(1, dt * 5);
    }
    mesh.rotation.y = o.heading;
  };
  o.interact = () => { if (o.buddy) { say(o, '(no se separa de Tofu)', 2); burst('heart', o.pos.x, 0.9, o.pos.z, 2); return; }
    o.follow = petRabbit(o); o.scare = 0; burst('heart', o.pos.x, 0.9, o.pos.z, 3); say(o, choose(['¡Hop, hop!', '(mueve la naricita)', '¡Te sigo!']), 2.2); SFX.nice(); };
  creatures.push(o); interacts.push({ pos: o.pos, range: 3.2, label: 'Acariciar al conejo', act: o.interact, who: o });
  return o;
}
function makeFrog(x, side) {
  const b = new Batch(), G = '#5ec25a';
  b.sph(G, 0, 0.2, 0, 0.28, 0.2, 0.32).sph('#c9f0a8', 0, 0.14, 0.08, 0.22, 0.14, 0.26).sph(G, -0.13, 0.4, 0.14, 0.1).sph(G, 0.13, 0.4, 0.14, 0.1)
    .sph('#ffffff', -0.13, 0.42, 0.2, 0.075).sph('#ffffff', 0.13, 0.42, 0.2, 0.075).sph('#201a2a', -0.13, 0.43, 0.26, 0.04).sph('#201a2a', 0.13, 0.43, 0.26, 0.04)
    .sph(G, -0.26, 0.08, -0.1, 0.12, 0.08, 0.18).sph(G, 0.26, 0.08, -0.1, 0.12, 0.08, 0.18).sph(G, -0.2, 0.05, 0.24, 0.07, 0.05, 0.1).sph(G, 0.2, 0.05, 0.24, 0.07, 0.05, 0.1);
  const mesh = b.mesh(MAT_SOFT), z = riverZ(x) + side * 5.5; mesh.position.set(x, 0, z); scene.add(mesh);
  const o = { kind: 'rana', mesh, pos: mesh.position, side, jump: null, croakT: rand(1, 5), heading: side > 0 ? Math.PI : 0, cool: 0, clickR: 0.5 };
  o.bubblePos = (v) => v.set(o.pos.x, o.pos.y + 0.95, o.pos.z);
  o.leap = (tx, tz, hgt) => { o.jump = { t: 0, fx: o.pos.x, fz: o.pos.z, tx, tz, h: hgt }; o.heading = Math.atan2(tx - o.pos.x, tz - o.pos.z) || o.heading; };
  o.update = (dt) => {
    o.cool = Math.max(0, o.cool - dt);
    if (o.jump) {
      const j = o.jump; j.t += dt / 0.55; const k = Math.min(1, j.t);
      o.pos.set(lerp(j.fx, j.tx, k), Math.sin(k * Math.PI) * j.h, lerp(j.fz, j.tz, k)); mesh.scale.set(1, 1 + Math.sin(k * Math.PI) * 0.25, 1);
      if (k >= 1) { o.jump = null; o.pos.y = 0; mesh.scale.set(1, 1, 1); }
    } else {
      o.croakT -= dt;
      if (o.croakT < 0.25) { const k = 1 + Math.sin((0.25 - o.croakT) / 0.25 * Math.PI) * 0.18; mesh.scale.set(k, 2 - k, k); }
      if (o.croakT <= 0) { o.croakT = rand(3, 7); mesh.scale.set(1, 1, 1); }
      if (o.cool <= 0 && nearPlayer(o) < 2.0) { const nx = clamp(o.pos.x + rand(3, 6) * (Math.random() < 0.5 ? -1 : 1), -56, 56); o.leap(nx, riverZ(nx) + o.side * rand(5.2, 6.4), 0.9); o.cool = 1.2; }
    }
    mesh.rotation.y = o.heading;
  };
  o.interact = () => { say(o, choose(['¡Croac!', '¡Croac, croac!', '¡Ribbit!']), 1.8); o.leap(o.pos.x, o.pos.z, 1.1); o.cool = 2.5; emit('note', o.pos.x, 1, o.pos.z); tone(180, 120, 0.18, 'square', 0.05); tone(200, 130, 0.18, 'square', 0.05, 0.22); };
  creatures.push(o); interacts.push({ pos: o.pos, range: 3.0, label: 'Saludar a la rana', act: o.interact, who: o });
}
const G_LEG = new THREE.CylinderGeometry(0.065, 0.05, 0.9, 6).translate(0, -0.45, 0);
const M_DEERLEG = new THREE.MeshStandardMaterial({ color: 0xb57a48, roughness: 0.75 });
function makeDeer(home) {
  const g = new THREE.Group(), C = '#c98a55', b = new Batch();
  b.sph(C, 0, 1.08, 0, 0.36, 0.38, 0.8).sph('#e8c39e', 0, 0.98, 0.3, 0.3, 0.3, 0.45).sph('#ffffff', 0, 1.22, -0.78, 0.11);
  for (const q of [[0.14, 1.42, -0.2], [-0.16, 1.4, 0.1], [0.05, 1.44, 0.32], [-0.08, 1.43, -0.45], [0.2, 1.36, 0.2]]) b.sph('#fff3df', q[0], q[1], q[2], 0.055, 0.03, 0.055);
  const body = b.mesh(MAT_SOFT); g.add(body);
  const hb = new Batch();
  hb.cyl(C, 0, 0.3, 0.14, 0.13, 0.19, 0.75, 8, 0.45).sph(C, 0, 0.7, 0.36, 0.2, 0.2, 0.27).sph('#e8c39e', 0, 0.63, 0.58, 0.11, 0.1, 0.14).sph('#3a2a2a', 0, 0.65, 0.71, 0.045)
    .sph('#201a2a', -0.17, 0.75, 0.46, 0.04).sph('#201a2a', 0.17, 0.75, 0.46, 0.04).sph(C, -0.23, 0.86, 0.3, 0.06, 0.11, 0.035).sph(C, 0.23, 0.86, 0.3, 0.06, 0.11, 0.035);
  for (const sx of [-1, 1]) hb.cyl('#f2e3c6', sx * 0.1, 1.08, 0.3, 0.02, 0.03, 0.42, 5, 0, -sx * 0.25).cyl('#f2e3c6', sx * 0.2, 1.2, 0.3, 0.015, 0.02, 0.22, 5, 0, -sx * 0.9).cyl('#f2e3c6', sx * 0.12, 1.3, 0.34, 0.015, 0.02, 0.2, 5, 0.5, 0);
  const headG = new THREE.Group(); headG.position.set(0, 1.25, 0.62); headG.add(hb.mesh(MAT_SOFT)); g.add(headG);
  const legs = [[-0.2, 0.5], [0.2, 0.5], [-0.2, -0.5], [0.2, -0.5]].map((q) => { const m = new THREE.Mesh(G_LEG, M_DEERLEG); m.position.set(q[0], 0.92, q[1]); m.castShadow = true; g.add(m); return m; });
  g.scale.setScalar(1.15); g.position.set(home.x, 0, home.z); scene.add(g);
  const o = { kind: 'venado', mesh: g, pos: g.position, home, tx: home.x, tz: home.z, wait: rand(1, 4), heading: rand(0, TAU), ph: 0, scare: 0, greet: 0, graze: 0, clickR: 1.0 };
  o.bubblePos = (v) => v.set(o.pos.x, 2.6, o.pos.z);
  o.update = (dt) => {
    const P = player.pos, dxp = P.x - o.pos.x, dzp = P.z - o.pos.z, dp = Math.hypot(dxp, dzp);
    o.scare = Math.max(0, o.scare - dt); o.greet = Math.max(0, o.greet - dt);
    if (o.greet <= 0 && o.scare <= 0 && dp < 4.5 && player.speedN > 1.3) { o.scare = 2.5; const a = Math.atan2(o.home.x - o.pos.x - dxp, o.home.z - o.pos.z - dzp); o.tx = clamp(o.pos.x + Math.sin(a) * 8, -57, 57); o.tz = o.pos.z + Math.cos(a) * 8; emit('excl', o.pos.x, 2.6, o.pos.z); }
    else if (o.scare <= 0 && o.greet <= 0) { o.wait -= dt; if (o.wait <= 0) { o.wait = rand(4, 9); const a = rand(0, TAU), r = rand(1, 7); o.tx = o.home.x + Math.cos(a) * r; o.tz = o.home.z + Math.sin(a) * r; if (nearRoad(o.tx, o.tz, ROAD_HALF + 1.5)) { o.tx = o.home.x; o.tz = o.home.z; } o.graze = Math.random() < 0.6 ? 1 : 0; } }
    const dx = o.tx - o.pos.x, dz = o.tz - o.pos.z, d = Math.hypot(dx, dz); let moving = false, headX = 0;
    if (o.greet > 0) { o.heading += angDiff(o.heading, Math.atan2(dxp, dzp)) * Math.min(1, dt * 5); headX = Math.sin(clamp((2.6 - o.greet) / 1.2, 0, 1) * Math.PI) * 0.7; }
    else if (d > 0.5) {
      const sp = o.scare > 0 ? 5 : 1.4; o.heading += angDiff(o.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 4);
      const nx = o.pos.x + Math.sin(o.heading) * sp * dt, nz = o.pos.z + Math.cos(o.heading) * sp * dt;
      if (!wetAt(nx, nz)) { o.pos.x = nx; o.pos.z = nz; moving = true; o.ph += dt * sp * 3.2; } else { o.tx = o.pos.x; o.tz = o.pos.z; }
    } else if (o.graze) headX = 1.05 + Math.sin(clock * 3) * 0.05;
    headG.rotation.x = damp(headG.rotation.x, headX, 5, dt);
    legs.forEach((m, i) => { m.rotation.x = moving ? Math.sin(o.ph + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.55 : damp(m.rotation.x, 0, 8, dt); });
    g.position.y = moving ? Math.abs(Math.sin(o.ph)) * 0.04 : 0; g.rotation.y = o.heading;
  };
  o.interact = () => { o.greet = 2.6; o.scare = 0; o.tx = o.pos.x; o.tz = o.pos.z; burst('heart', o.pos.x, 2.3, o.pos.z, 4); say(o, choose(['El venado te hace una reverencia.', '(te olfatea con cariño)', 'El venado agacha la cabeza para que lo acaricies.']), 2.8); SFX.nice(); };
  creatures.push(o); interacts.push({ pos: o.pos, range: 3.6, label: 'Acariciar al venado', act: o.interact, who: o });
}
const owlAwake = () => day.h >= 19.5 || day.h < 5.5;
function makeOwl() {
  const b = new Batch(), C = '#9a6b45', D = '#7a5232';
  b.sph(C, 0, 0.42, 0, 0.3, 0.4, 0.28).sph('#e8cfa8', 0, 0.36, 0.14, 0.22, 0.3, 0.18).sph('#ffffff', -0.12, 0.6, 0.22, 0.11, 0.11, 0.06).sph('#ffffff', 0.12, 0.6, 0.22, 0.11, 0.11, 0.06)
    .sph('#231d3b', -0.12, 0.6, 0.27, 0.05, 0.05, 0.03).sph('#231d3b', 0.12, 0.6, 0.27, 0.05, 0.05, 0.03).sph('#ffb347', 0, 0.5, 0.29, 0.04, 0.06, 0.05)
    .cone(D, -0.17, 0.84, 0, 0.07, 0.2, 5).cone(D, 0.17, 0.84, 0, 0.07, 0.2, 5).sph(D, -0.29, 0.4, 0, 0.08, 0.28, 0.2).sph(D, 0.29, 0.4, 0, 0.08, 0.28, 0.2)
    .sph('#ffb347', -0.1, 0.04, 0.12, 0.06, 0.04, 0.09).sph('#ffb347', 0.1, 0.04, 0.12, 0.06, 0.04, 0.09);
  const mesh = b.mesh(MAT_SOFT); mesh.scale.setScalar(1.3); mesh.position.set(STUMP.x, 1.12, STUMP.z); scene.add(mesh);
  // de día duerme: párpados sobre los ojos (con una rayita), y no voltea
  const lids = new Batch().sph('#9a6b45', -0.12, 0.6, 0.235, 0.118, 0.118, 0.07).sph('#9a6b45', 0.12, 0.6, 0.235, 0.118, 0.118, 0.07)
    .box('#5a3a22', -0.12, 0.585, 0.3, 0.15, 0.022, 0.02).box('#5a3a22', 0.12, 0.585, 0.3, 0.15, 0.022, 0.02).mesh(MAT_SOFT, false);
  mesh.add(lids);
  const o = { kind: 'búho', mesh, lids, pos: mesh.position, heading: 0, li: 0, hop: 0, clickR: 0.7, zzz: 0 };
  const wisdom = ['Uuh, uuh. Quien espera al monito verde, cruza tranquilo.', 'Uuh. El río nace en las montañas y nunca tiene prisa.', 'Uuh, uuh. Si te mareas, quédate quieto y respira.', 'Uuh. Los conejos confían en quien camina despacio.', 'Uuh, uuh. Tu casa queda al sur, siguiendo el camino.'];
  o.bubblePos = (v) => v.set(o.pos.x, o.pos.y + 1.4, o.pos.z);
  o.update = (dt) => {
    const d = nearPlayer(o), awake = owlAwake(); lids.visible = !awake;
    if (!awake) { if (d < 16 && (o.zzz -= dt) < 0) { o.zzz = 2.2; emit('zzz', o.pos.x + 0.25, o.pos.y + 1.2, o.pos.z); } }
    else if (d < 14) o.heading += angDiff(o.heading, Math.atan2(player.pos.x - o.pos.x, player.pos.z - o.pos.z)) * Math.min(1, dt * 3);
    o.hop = Math.max(0, o.hop - dt * 2.2); mesh.position.y = 1.12 + Math.sin(o.hop * Math.PI) * 0.3; mesh.rotation.y = o.heading; mesh.rotation.z = Math.sin(clock * 1.3) * 0.05;
  };
  // de noche (de 7:30 de la noche a 5:30 de la mañana) habla; la primera vez, del amanecer desde la cima (un encargo, 06-main.js)
  o.interact = () => {
    if (!owlAwake()) { say(o, choose(['Zzz… uuh… vuelve de noche…', 'Zzz… (el búho duerme de día)', 'Zzz… los búhos platicamos de noche…']), 3); emit('zzz', o.pos.x + 0.25, o.pos.y + 1.2, o.pos.z); return; }
    if (!quests.amanecer) { say(o, 'Uuh, uuh. ¿Has visto salir el sol desde una cima? Sube antes de las 5 y espéralo allá arriba.', 5); startQuest('amanecer'); }
    else say(o, wisdom[o.li++ % wisdom.length], 4.2);
    o.hop = 1; tone(330, 260, 0.3, 'sine', 0.06); tone(300, 240, 0.35, 'sine', 0.06, 0.35);
  };
  creatures.push(o); interacts.push({ pos: o.pos, range: 3.6, label: () => (owlAwake() ? 'Escuchar al búho' : 'Búho dormido'), act: o.interact, who: o });
}
const butterflies = [];
const G_WING_R = new THREE.CircleGeometry(0.17, 8).rotateX(-Math.PI / 2).translate(0.17, 0, 0), G_WING_L = new THREE.CircleGeometry(0.17, 8).rotateX(-Math.PI / 2).translate(-0.17, 0, 0);
function makeButterfly(x, z, col) {
  const g = new THREE.Group(), mat = dimmable(new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
  const wr = new THREE.Mesh(G_WING_R, mat), wl = new THREE.Mesh(G_WING_L, mat), body = new THREE.Mesh(G_BOX, M_LINE); body.scale.set(0.035, 0.035, 0.26);
  g.add(wr, wl, body); scene.add(g);
  butterflies.push({ g, wr, wl, home: { x, z }, cx: x, cz: z, a: rand(0, TAU), r: rand(0.6, 2.2), y: rand(0.8, 1.9), sp: rand(0.9, 1.8) * (Math.random() < 0.5 ? -1 : 1), ph: rand(0, 9) });
}
function updateButterflies(dt) {
  const P = player, calm = P.idleT > 2.2 && P.state === 'normal';
  let attracted = 0;
  const awake = day.light > 0.35 && weather.rain < 0.4;            // de noche y con lluvia las mariposas se esconden
  for (const b of butterflies) {
    b.g.visible = awake; if (!awake) continue;
    const dh = Math.hypot(P.pos.x - b.home.x, P.pos.z - b.home.z);
    if (dh > 60) continue;
    const att = calm && dh < 9 && attracted < 5; if (att) attracted++;
    b.cx = damp(b.cx, att ? P.pos.x : b.home.x, 1.3, dt); b.cz = damp(b.cz, att ? P.pos.z : b.home.z, 1.3, dt);
    const r = att ? 0.9 : b.r, y = att ? 2.3 : b.y;
    b.a += dt * b.sp; b.ph += dt * 18;
    b.g.position.set(b.cx + Math.cos(b.a) * r, y + Math.sin(b.a * 2.3 + b.ph * 0.05) * 0.3, b.cz + Math.sin(b.a) * r);
    b.g.rotation.y = -b.a + (b.sp > 0 ? 0 : Math.PI);
    const f = 0.25 + Math.abs(Math.sin(b.ph)) * 1.0; b.wr.rotation.z = f; b.wl.rotation.z = -f;
  }
}
const fishes = [];
for (let i = 0; i < 3; i++) {
  const b = new Batch(), C = ['#ff8a3c', '#ffd23f', '#ff6b9d'][i];
  b.sph(C, 0, 0, 0, 0.11, 0.15, 0.36).add(gCone(6), C, 0, 0, -0.42, 0.15, 0.22, 0.03, Math.PI / 2, 0, 0).sph('#201a2a', -0.08, 0.04, 0.24, 0.03).sph('#201a2a', 0.08, 0.04, 0.24, 0.03);
  const m = b.mesh(MAT_SOFT); m.visible = false; scene.add(m); fishes.push({ m, t: -rand(0.5, 4), x: 0, z0: 0, dir: 1 });
}
function updateFish(dt) {
  if (player.pos.z > -150 || player.pos.z < NORTH_Z) return;
  for (const f of fishes) {
    f.t += dt;
    if (f.t < 0) continue;
    if (!f.m.visible) {
      const bx = fishBias();                       // con el encargo de los peces, saltan cerca de quien espera en la orilla
      f.x = clamp(bx != null ? bx + rand(-4, 4) : player.pos.x + rand(-22, 22), -58, 58); if (Math.abs(f.x - BR.x) < 3) f.x += 6;
      f.dir = Math.random() < 0.5 ? 1 : -1; f.z0 = riverZ(f.x) - f.dir * 1.6; f.m.visible = true; burst('splash', f.x, 0.2, f.z0, 4); fishJumped(f);
    }
    const k = f.t / 0.9;
    if (k >= 1) { f.m.visible = false; burst('splash', f.x, 0.2, f.z0 + f.dir * 3.2, 4); if (Math.hypot(player.pos.x - f.x, player.pos.z - f.z0) < 25) SFX.splash(); f.t = -rand(1.5, 5); continue; }
    f.m.position.set(f.x, Math.sin(k * Math.PI) * 1.3, f.z0 + f.dir * 3.2 * k);
    f.m.rotation.set(-Math.cos(k * Math.PI) * 1.0 * f.dir, f.dir > 0 ? 0 : Math.PI, 0); f.m.rotation.order = 'YXZ';
  }
}
[[14, -130, '#ffffff'], [-20, -102, '#d9b38c'], [-14, -172, '#ffffff'], [24, -181, '#b9b3ad'], [-13, -232, '#d9b38c'], [12, -250, '#ffffff']].forEach((q) => makeRabbit(q[0], q[1], q[2]));
[[-34, 1], [-13, -1], [15, 1], [36, -1], [50, 1]].forEach((q) => makeFrog(q[0], q[1]));
makeDeer({ x: CLEAR[1].x, z: CLEAR[1].z }); makeDeer({ x: CLEAR[2].x, z: CLEAR[2].z });
makeOwl();
for (let i = 0; i < 16; i++) { const z = i < 8 ? rr(-155, -70) : rr(-255, -165), x = rr(-45, 45); makeButterfly(x, z, pick(['#ff8fb1', '#ffd23f', '#8fd6ff', '#c58bff', '#ffffff', '#ff9f6b'])); }
for (let i = 0; i < 4; i++) makeButterfly(rr(-14, 14), rr(-58, -32), pick(['#ff8fb1', '#ffd23f', '#8fd6ff']));
makeButterfly(-4, 8, '#ffd23f'); makeButterfly(8, 11, '#ff8fb1');
