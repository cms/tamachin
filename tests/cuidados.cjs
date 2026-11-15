// Necesidades, refri, bayas y los encargos de la ciudad, caminando con la palanca como un jugador; y que todo se guarde.
const { openGame, sleep } = require('./lib.cjs');

const EXPOSE = 'player, needs, quests, npcs, creatures, berryBushes, house, joy, interacts, toggleDiary, talkTo, get clock() { return clock; }, set clock(v) { clock = v; }';

module.exports = {
  titulo: 'necesidades, refri, bayas y encargos; se guardan',
  async run(T) {
    const { ctx, page, errors, E } = await openGame(T, { expose: EXPOSE });
    const go = (x, z) => E(([x, z]) => window.__tamachin.go(x, z), [x, z]);
    const npc = (name) => E((n) => { const q = window.__dbg.npcs.find((v) => v.name === n); return [q.pos.x, q.pos.z]; }, name);
    const talk = (name) => E((n) => window.__dbg.talkTo(window.__dbg.npcs.find((v) => v.name === n)), name);
    // si un encargo de acompañar falla, cómo quedó todo
    const why = (who) => E((who) => { const D = window.__dbg, P = D.player, f = who === 'conejo' ? D.creatures.find((c) => c.kind === 'conejo') : D.npcs.find((n) => n.name === who);
      return JSON.stringify({ q: D.quests, at: [P.pos.x, P.pos.y, P.pos.z].map((v) => +v.toFixed(1)), state: P.state, mood: P.T.mood, toast: document.querySelector('#toast').textContent,
        [who]: [f.pos.x, f.pos.z].map((v) => +v.toFixed(1)), dist: +Math.hypot(f.pos.x - P.pos.x, f.pos.z - P.pos.z).toFixed(1), follow: !!f.follow }); }, who);
    await E(() => {
      const D = window.__dbg;
      // sin tráfico: estos caminos van por en medio de la calle, y un atropello lo dejaba mareado y el conejo o Lulú se perdían
      // (así fallaban a veces estos encargos). Los autos quedan quietos donde estaban y ya no chocan con nadie.
      window.__tamachin.cars.length = 0;
      // camina con la palanca por una lista de puntos (con colisiones, como un jugador)
      window.__walk = (pts) => new Promise((res) => { let i = 0; const t0 = performance.now();
        const id = setInterval(() => { const p = D.player.pos, w = pts[i], dx = w[0] - p.x, dz = w[1] - p.z, d = Math.hypot(dx, dz);
          if (d < 1.2) { if (++i >= pts.length) { D.joy.x = D.joy.y = 0; clearInterval(id); res(true); return; } }
          else { D.joy.x = dx / d * 0.85; D.joy.y = dz / d * 0.85; }
          if (performance.now() - t0 > 60000) { D.joy.x = D.joy.y = 0; clearInterval(id); res(false); }
        }, 30); });
      // lo que haría la tecla E: la interacción más cercana
      window.__act = () => { const P = D.player; let best = null, bd = 1e9; for (const it of D.interacts) { const d = Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z); if (d < it.range && d < bd && (!it.ok || it.ok())) { bd = d; best = it; } } if (best) best.act(); return best ? (typeof best.label === 'function' ? best.label() : best.label) : null; };
    });

    // refri
    await go(4.4, -10.4); await sleep(900); await E(() => { window.__dbg.needs.panza = 0.5; });
    T.check('junto al refri dice "Abrir el refri"', (await page.textContent('#promptText')) === 'Abrir el refri');
    await E(() => window.__act()); await sleep(1450); await page.screenshot({ path: T.out('refri.jpg'), type: 'jpeg', quality: 70 });
    T.check('abrir el refri es una secuencia (no se mueve)', await E(() => window.__dbg.player.state === 'busy'));
    await sleep(2400);
    T.check('al terminar, panza sube y la puerta cierra', await E(() => window.__dbg.player.state === 'normal' && window.__dbg.needs.panza > 0.6 && window.__dbg.house.fridge.open < 0.05));

    // bayas
    const bush = await E(() => { const b = window.__dbg.berryBushes[0]; return [b.x, b.z]; });
    await go(bush[0], bush[1] + 2); await sleep(700); await E(() => { window.__dbg.needs.panza = 0.5; });
    const label = await E(() => window.__act()); await sleep(2200);
    const left = await E(() => window.__dbg.berryBushes[0].berries.filter((q) => q.k >= 0.999).length);
    T.check('come bayas del arbusto', /^Comer/.test(label || '') && left < 8 && await E(() => window.__dbg.needs.panza > 0.5), label + ', quedan ' + left);
    await E(() => { window.__dbg.clock += 80; }); await sleep(1200);
    T.check('las bayas vuelven a crecer', await E(() => window.__dbg.berryBushes[0].berries.every((q) => q.k >= 0.999)));

    // necesidad baja → ánimo
    await go(0, 3.5); await sleep(500); await E(() => { window.__dbg.needs.panza = 0.1; }); await sleep(700);
    T.check('con hambre se enoja y avisa', await E(() => window.__dbg.player.T.mood === 'enojado') && /hambre/.test(await page.textContent('#toast')));
    await E(() => { window.__dbg.needs.panza = 0.9; }); await sleep(600);
    T.check('comido vuelve a estar contento', await E(() => window.__dbg.player.T.mood === 'contento'));

    // Tofu y el conejo
    const tofu = await npc('Tofu'); await go(tofu[0], tofu[1] + 2.2); await sleep(400); await talk('Tofu');
    T.check('Tofu da el encargo del conejo', await E(() => window.__dbg.quests.conejo === 1));
    await go(14, -127); await sleep(900); await E(() => window.__dbg.creatures.find((c) => c.kind === 'conejo').interact());
    const w1 = await E(() => window.__walk([[2, -110], [0.5, -72], [0.5, -66]]));
    const rab = await E(() => { const r = window.__dbg.creatures.find((c) => c.kind === 'conejo'), p = window.__dbg.player.pos; return Math.hypot(r.pos.x - p.x, r.pos.z - p.z); });
    T.check('el conejo lo sigue hasta el portón del parque', w1 && rab < 6, rab.toFixed(1) + ' m');
    await E(() => window.__walk([[0.5, -58], [-6.5, -52], [-6.8, -45], [-6.5, -38.5], [-1.2, -31], [0.5, -26], [8, -26], [24, -26], [24, 0], [24, 24], [10, 25.5], [3, 27.5]]));
    if (await E(() => window.__dbg.quests.conejo) !== 2) { const tp = await npc('Tofu'); await E((w) => window.__walk([w]), [tp[0], tp[1] + 3]); await sleep(1500); }
    let done = await E(() => window.__dbg.quests.conejo === 2 && !!window.__dbg.creatures.find((c) => c.kind === 'conejo').buddy);
    T.check('al llegar con Tofu, encargo cumplido', done, done ? undefined : await why('conejo'));

    // Lulú a la fuente
    await E(() => { const n = window.__dbg.npcs.find((q) => q.name === 'Lulú'); n.t = 0.5; n.pos.set(30.5, 0, 30); n.pause = 0; });
    await go(28.6, 31.2); await sleep(400); await talk('Lulú');
    await E(() => window.__walk([[28.6, 25.5], [25, 25.5], [25, -25.5], [1.2, -25.5], [1.2, -31], [-6.5, -38.5], [-6.8, -42]])); await sleep(2500);
    done = await E(() => window.__dbg.quests.fuente === 2);
    T.check('Lulú llega a la fuente', done, done ? undefined : await why('Lulú'));

    // Nube y la gelatina
    let nb = await npc('Nube'); await go(nb[0] - 2, nb[1]); await sleep(300); await talk('Nube');
    await go(4.4, -10.4); await sleep(700); await E(() => window.__act()); await sleep(3400);
    T.check('saca gelatina del refri', await E(() => !!(window.__dbg.player.carry && window.__dbg.player.carry.kind === 'gelatina')));
    nb = await npc('Nube'); await go(nb[0] - 2, nb[1]); await sleep(300); await talk('Nube');
    T.check('se la da a Nube', await E(() => window.__dbg.quests.gelatina === 2));

    // los peces
    await go(2.5, 13.8); await sleep(400); await E(() => window.__act());
    T.check('el buzón da el encargo de los peces', await E(() => window.__dbg.quests.peces === 1));
    await E(() => { const x = -30, z = -205 + 6 * Math.sin(x / 16) + 2.5 * Math.sin(x / 7 + 1) + 5.6; window.__tamachin.go(x, z); });
    await page.waitForFunction(() => window.__dbg.quests.peces === 2, null, { timeout: 30000 }).catch(() => {});
    T.check('en la orilla del río salta un pez', await E(() => window.__dbg.quests.peces === 2));

    // se guarda
    await go(0, 3.5); await sleep(300); await E(() => window.dispatchEvent(new Event('pagehide')));
    await page.reload(); await page.waitForFunction(() => !!window.__dbg); await sleep(1000);
    const q = await E(() => window.__dbg.quests);
    T.check('al recargar, los encargos siguen hechos', q.conejo === 2 && q.fuente === 2 && q.gelatina === 2 && q.peces === 2, JSON.stringify(q));
    T.check('y el conejo sigue con Tofu, Lulú en la fuente', await E(() => !!window.__dbg.creatures.find((c) => c.kind === 'conejo').buddy && window.__dbg.npcs.find((n) => n.name === 'Lulú').loop === null));
    T.check('sin errores', !errors.length, errors.join(' | ') || undefined);
    await ctx.close();

    // una partida guardada antes de las necesidades (solo forma, color y ánimo) abre bien
    const old = await openGame(T, { expose: EXPOSE, init: () => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('tamachin.v1', JSON.stringify({ shape: 'gota', color: '#ff6b9d', mood: 'triste' })); } } });
    const o = await old.E(() => ({ shape: window.__dbg.player.T.shape, mood: window.__dbg.player.baseMood, panza: window.__dbg.needs.panza, q: window.__dbg.quests.conejo }));
    T.check('una partida vieja conserva forma y ánimo, con necesidades llenas', o.shape === 'gota' && o.mood === 'triste' && o.panza > 0.7 && o.q === 0, JSON.stringify(o));
    T.check('sin errores con la partida vieja', !old.errors.length, old.errors.join(' | ') || undefined);
    await old.ctx.close();
  },
};
