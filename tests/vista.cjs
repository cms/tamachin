// Que nada tape a Tamachin: junto a cada cara de los edificios, dentro y alrededor de la casa y en el bosque, con la cámara en
// varios ángulos y alturas; pegado a una pared caminando; detrás del kiosco; que lo que estorba se corte al ras y no se vuelva transparente;
// y en la toma del refri con la cámara girada. No espera en tiempo real: adelanta el juego (`advance`) lo que tardaría en acomodarse.
const { openGame, BLOCKER } = require('./lib.cjs');

// [giro, altura de la cámara] en grados: los seis giros a la altura de siempre (34°), y algunos con la cámara baja y alta
const VIEWS = [0, 45, 90, 135, 180, 270].map((d) => [d, 34.2]).concat([[0, 15], [135, 15], [270, 15], [45, 60]]);

module.exports = {
  titulo: 'edificios, casa y árboles se apartan desde cualquier ángulo',
  async run(T) {
    const { ctx, page, errors, E } = await openGame(T, { expose: 'scene, camera, player, occluders, house, creatures, trees, renderer, FX' });
    await E(BLOCKER);
    const adv = (sec) => E((sec) => window.__tamachin.advance(sec), sec);   // corre el juego `sec` segundos de golpe, sin esperar
    const setView = (deg, p) => E(([y, p]) => { const V = window.__tamachin.view; V.yaw = V.yawT = y; V.pitch = V.pitchT = p; }, [deg * Math.PI / 180, p * Math.PI / 180]);
    const setYaw = (deg) => setView(deg, 34.2);
    const spots = await E(() => {
      const out = [], city = window.__dbg.occluders.filter((o) => o.z1 < 62 && o.z0 > -62).slice(0, 14);
      for (const o of city) { const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2; out.push([cx, o.z0 - 1.2], [cx, o.z1 + 1.2], [o.x0 - 1.2, cz], [o.x1 + 1.2, cz]); }
      out.push([-4, -11], [4, -11], [-4, -6], [4, -6], [0, -8.5], [0, -14.5], [-7.5, -8.5], [7.5, -8.5], [0, -2.5]);   // la casa
      out.push([3, -175], [-6, -190], [12, -232], [-20, -250], [30, -170], [-35, -186]);                            // el bosque
      return out;
    });
    for (const [deg, p] of VIEWS) {
      await setView(deg, p); const hits = [], name = deg + '°' + (p !== 34.2 ? ' (cámara a ' + p + '°)' : '');
      for (const [x, z] of spots) {
        const b = await E(([x, z]) => { window.__tamachin.go(x, z); window.__tamachin.advance(0.6); return window.__blocker(); }, [x, z]);
        if (b) hits.push('(' + x.toFixed(1) + ',' + z.toFixed(1) + ') ' + b);
      }
      const hard = hits.filter((h) => /edificio|casa/.test(h));
      T.check(name + ': ningún edificio ni la casa tapa a Tamachin (' + spots.length + ' lugares)', !hard.length, hard.join('; ') || undefined);
      T.check(name + ': postes, muebles o árboles pegados lo tapan a lo más en 4 lugares', hits.length <= 4, hits.join('; ') || undefined);
    }

    // caminando hacia la cámara pegado a la pared de un edificio (los toldos tapaban)
    await setYaw(0); await E(() => window.__tamachin.go(-31, -58)); await adv(0.7);
    await page.keyboard.down('KeyS'); const seen = [];
    for (let i = 0; i < 66; i++) { const b = await E(() => { window.__tamachin.advance(0.15); return window.__blocker(); }); if (b) seen.push(b); }
    await page.keyboard.up('KeyS');
    T.check('pegado a una pared, caminando 10 s: nunca tapado', !seen.length, seen.slice(0, 4).join('; ') || undefined);

    // el kiosco de Valle Alegre
    await E(() => window.__tamachin.go(0, -1360)); await adv(1.5);
    T.check('detrás del kiosco, su techo se quita', await E(() => window.__dbg.occluders.find((o) => Math.abs(o.z0 - (-1358.2)) < 0.1).k < 0.05));
    const front = [];
    for (const [x, dz] of [[0, 6.0], [5.2, 5.2], [-5.2, 5.2]]) { await E(([x, z]) => window.__tamachin.go(x, z), [x, -1352 + dz]); await adv(1.5); front.push(+(await E(() => window.__dbg.occluders.find((o) => o.roof).k)).toFixed(2)); }
    T.check('pegado al kiosco por el frente (entre él y la cámara), su techo sigue entero', front.every((k) => k > 0.95), JSON.stringify(front));
    // alrededor del kiosco, a tres alturas de cámara: el techo se corta si tapa algún punto de Tamachin (una rejilla de rayos contra
    // el techo entero) y casi nunca si no tapa (antes, por estar cerca de su planta cuadrada, se quitaba en uno de cada cuatro lugares)
    const ring = await E(() => {
      const D = window.__dbg, G = window.__tamachin, V = G.view, o = D.occluders.find((q) => q.roof), KZ = o.roof.z, rc = new THREE.Raycaster(), pts = [];
      let roof = null; D.scene.traverse((m) => { if (m.material === o.mats[0]) roof = m; });
      for (let u = -0.75; u <= 0.751; u += 0.25) for (let h = 0.05; h <= 1.51; h += 0.18) if (Math.hypot(u, h - 0.75) <= 0.78) pts.push([u, h]);
      const blocks = () => {
        const P = D.player, sc = P.T.scale, cam = D.camera.position, c = Math.cos(V.yaw), s = Math.sin(V.yaw), clip = roof.material.clippingPlanes;
        roof.material.clippingPlanes = null;
        const hit = pts.some(([u, h]) => { const t = new THREE.Vector3(P.pos.x + u * sc * c, P.pos.y + h * sc, P.pos.z - u * sc * s), d = t.clone().sub(cam), L = d.length();
          rc.set(cam, d.normalize()); rc.far = L; return rc.intersectObject(roof, false).length > 0; });
        roof.material.clippingPlanes = clip; return hit;
      };
      const out = { n: 0, extra: 0, missed: [] };
      for (const [yaw, pitch] of [[0, 15], [0, 34.2], [135, 34.2], [270, 60]]) {
        V.yaw = V.yawT = yaw * Math.PI / 180; V.pitch = V.pitchT = pitch * Math.PI / 180;
        for (let a = 0; a < 360; a += 30) for (const r of [6.0, 7.5, 10, 14]) {
          const x = Math.cos(a * Math.PI / 180) * r, z = KZ + Math.sin(a * Math.PI / 180) * r;
          G.go(x, z); o.k = 1; G.advance(1.2); if (Math.hypot(D.player.pos.x - x, D.player.pos.z - z) > 0.6) continue;
          const need = blocks(), cut = o.k < 0.5; out.n++;
          if (cut && !need) out.extra++; if (need && !cut) out.missed.push(yaw + '°/' + pitch + '° (' + x.toFixed(1) + ',' + (z - KZ).toFixed(1) + ')');
        }
      }
      return out;
    });
    T.check('alrededor del kiosco, su techo nunca tapa a Tamachin', !ring.missed.length, ring.missed.join('; ') || undefined);
    T.check('… y casi nunca se quita sin tapar (a lo más 1 de cada 10 lugares)', ring.extra <= ring.n / 10, ring.extra + ' de ' + ring.n);

    // lo que estorba se corta al ras (sin transparencias: eran ventanas fantasma) y vuelve entero al alejarse
    const cutState = (i) => E((i) => { const o = window.__dbg.occluders.filter((q) => q.z1 < 62 && q.z0 > -62)[i];
      return { k: o.k, y: o.plane ? o.plane.constant : null, clip: o.mats.every((m) => !!m.clippingPlanes), seeThrough: o.mats.some((m) => m.transparent), inner: o.walls.side === THREE.DoubleSide }; }, i);
    await setYaw(0); await E(() => { const o = window.__dbg.occluders.filter((q) => q.z1 < 62 && q.z0 > -62)[1]; window.__tamachin.go((o.x0 + o.x1) / 2, o.z0 - 1.2); }); await adv(1.5);
    let c = await cutState(1);
    T.check('un edificio entre la cámara y Tamachin se corta a 0.75 m, sin transparencia', c.k < 0.01 && c.clip && Math.abs(c.y - 0.75) < 0.05 && !c.seeThrough && c.inner, JSON.stringify(c));
    await E(() => window.__tamachin.go(0, 3.5)); await adv(1.5); c = await cutState(1);
    T.check('al alejarse vuelve entero (sin plano de corte)', c.k === 1 && !c.clip && !c.inner, JSON.stringify(c));
    await E(() => window.__tamachin.go(0, -14.5)); await adv(1.5);
    const h = await E(() => { const H = window.__dbg.house; return { walls: H.oWalls, clip: H.cutMats.every((m) => !!m.clippingPlanes), seeThrough: [H.mWalls, H.mShelf, H.mFront, H.mRoof].some((m) => m.transparent) }; });
    T.check('detrás de la casa: se corta (techo fuera, paredes al ras) sin transparencia', h.walls < 0.01 && h.clip && !h.seeThrough, JSON.stringify(h));

    // el refri con la cámara girada: la toma es fija y las paredes no se transparentan
    for (const deg of [135, 180]) {
      await setYaw(deg); await E(() => window.__tamachin.go(3.95, -10.4)); await adv(1.2);
      await page.keyboard.press('KeyE'); await adv(1.5);
      const s = await E(() => [window.__dbg.player.state, window.__dbg.house.oWalls]);
      await page.screenshot({ path: T.out('refri-' + deg + '.jpg'), type: 'jpeg', quality: 70 });
      T.check('refri con la cámara a ' + deg + '°: toma fija y paredes enteras', s[0] === 'busy' && s[1] > 0.9, JSON.stringify(s));
      await adv(2.5);
    }
    // Los árboles no se agachan: se abren en un círculo alrededor de Tamachin, solo lo que queda delante de él (FX.see, en el shader).
    // Se mira en los píxeles (el raycast no ve el shader): se dibuja el mismo cuadro con el círculo y sin él. Detrás de un roble del bosque,
    // sin círculo el árbol lo tapa y con círculo se le ve (amarillo); delante del mismo roble no cambia nada (lo de atrás no se abre).
    // tree: el roble (índice en D.trees); dz: Tamachin al norte (−) o al sur (+) de él, con la cámara al sur (giro 0)
    const LOOK = ([ti, dz]) => {
      const D = window.__dbg, T = window.__tamachin, t = D.trees[ti];
      const V = T.view; V.yaw = V.yawT = 0; V.pitch = V.pitchT = 34.2 * Math.PI / 180; T.go(t.x, t.z + dz); T.advance(1.2);
      const P = D.player, cam = D.camera.position, tg = new THREE.Vector3(P.pos.x, P.pos.y + 0.75 * P.T.scale, P.pos.z), R = D.renderer, gl = R.getContext(), S = D.FX.see.value;
      const rc = new THREE.Raycaster(cam.clone(), tg.clone().sub(cam).normalize(), 0, cam.distanceTo(tg) - 0.9); rc.camera = D.camera;
      const front = rc.intersectObjects(D.scene.children, true).some((h) => h.object.material && h.object.material.userData && h.object.material.userData.see);   // ¿una planta delante?
      const v = tg.clone().project(D.camera), cx = Math.round((v.x * 0.5 + 0.5) * gl.drawingBufferWidth), cy = Math.round((v.y * 0.5 + 0.5) * gl.drawingBufferHeight), n = Math.round(S.z * 0.9);
      const grab = () => { R.render(D.scene, D.camera); const px = new Uint8Array(4 * n * n); gl.readPixels(cx - (n >> 1), cy - (n >> 1), n, n, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
      const yellow = (px, k) => { let y = 0, c = 0; for (let i = 0; i < px.length; i += 4) { const x = (i / 4) % n - n / 2, yy = Math.floor(i / 4 / n) - n / 2; if (Math.hypot(x, yy) > k) continue; c++; const r = px[i], g = px[i + 1], b = px[i + 2]; if (r > 140 && b < r * 0.6 && r >= g * 0.85) y++; } return y / c; };
      const on = grab(), z0 = S.z; S.z = 0; const off = grab(); S.z = z0;
      let diff = 0; for (let i = 0; i < on.length; i += 4) if (Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]) > 24) diff++;
      const r = S.z / 2.3 * 0.6;                                     // el centro de su cuerpo
      return { front, seeOn: D.FX.seeOn, con: +yellow(on, r).toFixed(2), sin: +yellow(off, r).toFixed(2), cambia: +(diff / (n * n)).toFixed(3) };
    };
    // un roble con el que, a 3 m al sur de él, no hay ninguna planta entre la cámara y Tamachin (el roble queda atrás)
    const oaks = await E(() => window.__dbg.trees.map((t, i) => [t, i]).filter(([t]) => t.type === 1 && t.s > 0.9 && t.z < -170 && t.z > -240).map(([, i]) => i));
    let hid = null, ahead = null;
    for (const ti of oaks) { const a = await E(LOOK, [ti, 3.0]); if (!a.front) { ahead = a; hid = await E(LOOK, [ti, -3.4]); break; } }
    T.check('detrás de un roble: sin el círculo el árbol lo tapa, con él se le ve', !!hid && hid.front && hid.seeOn && hid.sin < 0.3 && hid.con > 0.7, JSON.stringify(hid));
    // y solo se prende cuando algo lo tapa (con `discard` en el shader, el iPhone dibuja los árboles sin una optimización)
    const open = await E(() => { const T = window.__tamachin, V = T.view; V.yaw = V.yawT = -0.5; T.go(6, 6); T.advance(1.2); const a = window.__dbg.FX.seeOn; V.yaw = V.yawT = 0; T.go(24, 10); T.advance(1.2); return [a, window.__dbg.FX.seeOn]; });
    T.check('en el jardín abierto y en la calle la ventana está apagada; detrás del roble, prendida', open.every((v) => v === false), JSON.stringify(open));
    T.check('delante del mismo roble (atrás de él) no se abre nada', !!ahead && ahead.cambia < 0.05 && ahead.con > 0.7, JSON.stringify(ahead));
    T.check('sin errores', !errors.length, errors.join(' | ') || undefined);
    await ctx.close();
  },
};
