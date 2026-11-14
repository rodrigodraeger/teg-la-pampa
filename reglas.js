// Las reglas del juego, sin pantalla: el estado E y todo lo que lo cambia.
// Lo que hay que contarle a quien juega (crónica, avisos, sonidos) sale en lo que devuelve cada función.
function crearReglas(D, azar) {
  const L = D.locs, NL = L.length;
  const TODAS = [0, 1, 2, 3];
  const MAZO = ['viento', 'viento', 'viento', 'cenizas', 'cenizas', 'cenizas', 'rutas', 'rutas',
    'calma', 'calma', 'calma', 'calma'];
  const PARES = [['Oeste', 'Salinas'], ['Centro', 'Este'], ['Trigo', 'Comercial'],
    ['Ruta 188', 'Caldenal'], ['Centro', 'Caldenal'], ['Salinas', 'Este']];
  const META = 40, MINIMO_REGIONES = 24, TURNO_CICLON = 30, RONDA_SISMO_DESDE = 16, RONDA_SISMO_MAX = 22;

  const vec = L.map(() => []);
  for (const [a, b] of D.ady) { vec[a].push(b); vec[b].push(a); }
  const REG = D.regiones.map(nombre => ({ nombre, locs: L.flatMap((l, i) => l.r === nombre ? [i] : []) }));
  for (const R of REG) {
    const borde = R.locs.filter(i => vec[i].some(v => L[v].r !== R.nombre)).length;
    R.bonus = Math.ceil(borde / 2);
  }
  const regionDe = i => REG.find(R => R.nombre === L[i].r);

  const mezclar = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- estado ----------
  const E = {
    dueno: new Array(NL).fill(-1), tropas: new Array(NL).fill(0), ronda: 0, actual: 0, humano: 0,
    fase: 'refuerzos', porColocar: 0, sel: -1, disp: null, carta: 'calma', mazo: [], objetivos: [],
    eliminadoPor: TODAS.map(() => -1), turnos: 0, aviso: '', terminado: false, iaJugando: false, registro: [], ultimaTirada: null, nombres: TODAS.map(() => ''), golpes: 0, puestos: [], mesa: [],
    mano: TODAS.map(() => []), mazoPais: [], canjes: TODAS.map(() => 0), anexoEnTurno: false, pactos: {}, propuesto: new Set(),
    sinPacto: {}, primero: 0,
  };

  const cuenta = a => E.dueno.reduce((s, d) => s + (d === a), 0);
  const ejercitos = a => E.tropas.reduce((s, t, i) => s + (E.dueno[i] === a ? t : 0), 0);
  const propias = a => E.dueno.flatMap((d, i) => d === a ? [i] : []);

  // ---------- tarjetas de país, como en el TEG: una por turno con anexión, tres se canjean por ejércitos ----------
  const SIMBOLOS = ['caldén', 'molino', 'tranquera'];
  const tarjeta = i => i < 0 ? { loc: -1, simbolo: 'comodín' } : { loc: i, simbolo: SIMBOLOS[i % 3] };
  const valorCanje = n => n < 3 ? [4, 7, 10][n] : 10 + 5 * (n - 2);
  function trio(mano) {
    for (let x = 0; x < mano.length; x++) for (let y = x + 1; y < mano.length; y++) for (let z = y + 1; z < mano.length; z++) {
      const s = [mano[x], mano[y], mano[z]].map(c => c.simbolo).filter(v => v !== 'comodín');
      if (new Set(s).size === 1 || new Set(s).size === s.length) return [x, y, z];
    }
    return null;
  }
  // devuelve la tarjeta y si la localidad es de quien la saca (suma 2 ejércitos ahí)
  function robar(a) {
    if (!E.mazoPais.length) {
      const enMano = new Set(E.mano.flat().map(c => c.loc));
      const comodines = 2 - E.mano.flat().filter(c => c.loc < 0).length;
      E.mazoPais = mezclar([...new Array(comodines).fill(-1), ...L.map((_, i) => i).filter(i => !enMano.has(i))].map(tarjeta));
    }
    const c = E.mazoPais.pop();
    E.mano[a].push(c);
    const suya = c.loc >= 0 && E.dueno[c.loc] === a;
    if (suya) E.tropas[c.loc] += 2;
    return { c, suya };
  }
  // devuelve los ejércitos que dio el canje, o 0 si no había trío
  function canjear(a) {
    const t = trio(E.mano[a]);
    if (!t) return 0;
    const suma = valorCanje(E.canjes[a]);
    E.mano[a] = E.mano[a].filter((_, k) => !t.includes(k));
    E.canjes[a]++; E.porColocar += suma;
    return suma;
  }

  // ---------- pactos de no agresión ----------
  // el pacto dura tres vueltas completas de la mesa, contadas desde el turno de quien lo propone:
  // así vale lo mismo en cualquier asiento. Al vencer hay que esperar para volver a proponerlo.
  const RONDAS_PACTO = 3, ESPERA_PACTO = 2;
  const clavePacto = (a, b) => Math.min(a, b) + '-' + Math.max(a, b);
  const lugar = a => (a - E.primero + TODAS.length) % TODAS.length;
  const vigente = p => !!p && (E.ronda < p.fin || (E.ronda === p.fin && lugar(E.actual) < lugar(p.de)));
  const enPacto = (a, b) => a >= 0 && b >= 0 && a !== b && vigente(E.pactos[clavePacto(a, b)]);
  function vencerPactos() {
    const vencidos = [];
    for (const [k, p] of Object.entries(E.pactos)) if (!vigente(p)) {
      delete E.pactos[k];
      const par = k.split('-').map(Number), otra = par.find(b => b !== E.humano);
      E.sinPacto[otra] = E.ronda + ESPERA_PACTO;
      vencidos.push({ par, otra });
    }
    return vencidos;
  }
  const puedeProponer = b => !enPacto(E.humano, b) && !E.propuesto.has(b) && E.ronda >= (E.sinPacto[b] || 0);
  // quien juega le propone a la Alianza b; devuelve si aceptó
  function proponerPacto(b) {
    const a = E.humano;
    E.propuesto.add(b);
    const o = E.objetivos[b];
    const acepta = !(o.tipo === 'destruir' && o.blanco === a) && cuenta(a) <= cuenta(b) + 4 && cuenta(a) < META - 8;
    if (acepta) E.pactos[clavePacto(a, b)] = { fin: E.ronda + RONDAS_PACTO, de: a };
    return acepta;
  }

  // como en el TEG: las localidades se sortean, cada Alianza arranca desparramada por la provincia
  function repartir() {
    const mazo = mezclar(L.map((_, i) => i));
    TODAS.forEach(a => mazo.slice(a * 15, a * 15 + 15).forEach(i => { E.dueno[i] = a; }));
    for (let i = 0; i < NL; i++) E.tropas[i] = E.dueno[i] === -1 ? L[i].ej : 2;
    const pares = mezclar(PARES);
    E.objetivos = TODAS.map(a => azar() < 1 / 3
      ? { tipo: 'destruir', blanco: (a + 1 + Math.floor(azar() * (TODAS.length - 1))) % TODAS.length }
      : { tipo: 'regiones', regs: pares[a] });
  }

  // como en el TEG: si otra Alianza destruye a tu blanco, tu objetivo pasa a ser destruir a esa Alianza.
  // Devuelve a quiénes les cambió el blanco.
  function reasignarBlancos(eliminada, autora) {
    const cambiadas = [];
    E.objetivos.forEach((o, c) => {
      if (o.tipo !== 'destruir' || o.blanco !== eliminada || c === autora) return;
      o.blanco = autora;
      cambiadas.push(c);
    });
    return cambiadas;
  }

  // por qué ganó: 'meta', 'destruir' o 'regiones'; null si todavía no
  function cumplio(a) {
    if (cuenta(a) >= META) return 'meta';
    const o = E.objetivos[a];
    if (o.tipo === 'destruir' && E.eliminadoPor[o.blanco] === a) return 'destruir';
    if (o.tipo === 'regiones' && cuenta(a) >= MINIMO_REGIONES && o.regs.every(r => REG.find(R => R.nombre === r).locs.every(i => E.dueno[i] === a)))
      return 'regiones';
    return null;
  }

  function refuerzos(a) {
    let r = Math.max(3, Math.floor(cuenta(a) / 2));
    for (const R of REG) if (R.locs.every(i => E.dueno[i] === a)) r += R.bonus;
    return r;
  }

  function puedeAtacar(o, t) {
    return E.dueno[o] === E.actual && E.dueno[t] !== E.actual && E.tropas[o] >= 2 && vec[o].includes(t) && !enPacto(E.actual, E.dueno[t]) &&
      (E.carta !== 'neblina' || E.dueno[t] === -1) && (E.carta !== 'rutas' || L[o].r === L[t].r);
  }

  const tirar = n => Array.from({ length: n }, () => 1 + Math.floor(azar() * 6)).sort((x, y) => y - x);

  // ---------- ataque: cuántos dados, qué se pierde con la tirada y la anexión ----------
  function dadosDeAtaque(o, t) {
    const base = Math.min(3, E.tropas[o] - 1);
    return { base, da: base + (E.carta === 'viento' ? 1 : 0), dd: Math.min(3, E.tropas[t]) + (E.carta === 'cenizas' ? 1 : 0) };
  }
  // A y B son las tiradas de ataque y defensa, de mayor a menor. Si la localidad queda para anexar devuelve
  // el tope de ejércitos que pueden pasar y cuántos pasan si nadie elige; si no, null.
  function resolverDados(o, t, A, B) {
    const a = E.actual, previo = E.dueno[t];
    const { base } = dadosDeAtaque(o, t);
    let pa = 0, pd = 0;
    for (let k = 0; k < Math.min(A.length, B.length); k++) { if (A[k] > B[k]) pd++; else pa++; }
    pa = Math.min(pa, base);
    E.tropas[o] -= pa; E.tropas[t] -= pd;
    if (previo === E.humano && a !== E.humano) E.golpes += pd;
    E.ultimaTirada = { o, t, A, B, pa, pd, a, previo, conquista: false };
    if (E.tropas[t] > 0) return null;
    if (E.tropas[o] < 2) { E.tropas[t] = 1; return null; }
    const tope = Math.min(3, E.tropas[o] - 1);
    return { tope, mueve: Math.max(1, Math.min(base, tope)) };
  }
  function anexar(o, t, mueve) {
    const a = E.actual, previo = E.dueno[t];
    E.dueno[t] = a; E.tropas[t] = mueve; E.tropas[o] -= mueve;
    E.ultimaTirada.conquista = true; E.anexoEnTurno = true;
    const r = { eliminada: false, cambiadas: [] };
    if (previo >= 0 && cuenta(previo) === 0) {
      E.eliminadoPor[previo] = a;
      r.eliminada = true;
      r.cambiadas = reasignarBlancos(previo, a);
      E.mano[a].push(...E.mano[previo]); E.mano[previo] = [];
    }
    r.logro = cumplio(a);
    r.unica = !r.logro && TODAS.filter(b => cuenta(b) > 0).length === 1;
    if (r.logro || r.unica) E.terminado = true;
    return r;
  }

  function colocar(i, n) { E.tropas[i] += n; E.porColocar -= n; }
  function mover(o, t, n) { E.tropas[o] -= n; E.tropas[t] += n; E.disp[o] -= n; }

  // ---------- rondas y turnos ----------
  // devuelve { sismo: quien gana } si el sismo cortó la partida, o { mezclado } si salió carta
  function nuevaRonda() {
    E.ronda++;
    E.aviso = '';
    if (E.ronda >= RONDA_SISMO_DESDE && (E.ronda >= RONDA_SISMO_MAX || azar() < 1 / 6)) {
      const orden = [...TODAS].sort((x, y) => cuenta(y) - cuenta(x) || ejercitos(y) - ejercitos(x));
      E.terminado = true;
      return { sismo: orden[0] };
    }
    let mezclado = false;
    if (E.ronda <= 2) E.carta = 'neblina';
    else {
      if (!E.mazo.length) { E.mazo = mezclar(MAZO); mezclado = true; }
      E.carta = E.mazo.pop();
    }
    return { mezclado };
  }

  // quién abre cada ronda se sortea: el primer turno da ventaja y antes era siempre del Salitral
  function sortearPrimero() { E.primero = E.actual = Math.floor(azar() * TODAS.length); }

  function empezarTurno() {
    E.fase = 'refuerzos'; E.sel = -1;
    E.turnos++;
    const ciclon = E.turnos === TURNO_CICLON;
    if (ciclon) for (let i = 0; i < NL; i++) if (E.tropas[i] > 2) E.tropas[i] -= Math.floor(E.tropas[i] / 3);
    const vencidos = vencerPactos();
    E.porColocar = refuerzos(E.actual);
    const recibidos = E.porColocar;
    E.anexoEnTurno = false; E.propuesto.clear(); E.golpes = 0; E.puestos = [];
    const canje = E.actual !== E.humano || E.mano[E.actual].length >= 5 ? canjear(E.actual) : 0;
    return { ciclon, vencidos, refuerzos: recibidos, canje };
  }

  // devuelve la ronda nueva, si la hubo, y el turno que empezó, si la partida sigue
  function siguienteTurno() {
    if (E.terminado) return {};
    let a = E.actual, ronda;
    do {
      a = (a + 1) % TODAS.length;
      if (a === E.primero) { ronda = nuevaRonda(); if (E.terminado) return { ronda }; }
    } while (cuenta(a) === 0);
    E.actual = a;
    return { ronda, turno: empezarTurno() };
  }

  function pasarFase() {
    if (E.fase !== 'refuerzos' && E.fase !== 'ataque') return siguienteTurno();
    E.sel = -1;
    if (E.fase === 'refuerzos') { E.fase = 'ataque'; return {}; }
    const robo = E.anexoEnTurno ? robar(E.actual) : undefined;
    E.fase = 'reagrupar';
    E.disp = E.tropas.map((t, i) => E.dueno[i] === E.actual ? t - 1 : 0);
    return { robo };
  }

  // ---------- IA ----------
  // ventaja: con cuántos ejércitos de más se anima a atacar; anexiones: tope por turno;
  // lider: desde cuántas localidades va contra quien lleva la delantera (0 = no la mira)
  const NIVELES = {
    facil: { ventaja: 2, anexiones: 4, lider: 0 },
    normal: { ventaja: 1, anexiones: 8, lider: META - 4 },
    dificil: { ventaja: 1, anexiones: 12, lider: META - 8 },
  };

  function interes(a, t, N) {
    let v = 1;
    const o = E.objetivos[a], R = regionDe(t), d = E.dueno[t];
    if (o.tipo === 'regiones' && o.regs.includes(L[t].r)) v += 2;
    if (o.tipo === 'destruir' && d === o.blanco) v += 3;
    if (N.lider && d >= 0 && cuenta(d) >= N.lider && TODAS.every(b => cuenta(b) <= cuenta(d))) v += 3;
    v += 2 * R.locs.filter(i => E.dueno[i] === a).length / R.locs.length;
    return v;
  }

  function mejorOrigen(a, N) {
    let mejor = -1, puntaje = -Infinity;
    for (const o of propias(a)) for (const t of vec[o]) {
      if (E.dueno[t] === a || enPacto(a, E.dueno[t])) continue;
      if (E.carta === 'neblina' && E.dueno[t] !== -1) continue;
      if (E.carta === 'rutas' && L[o].r !== L[t].r) continue;
      const p = interes(a, t, N) * 2 + E.tropas[o] - E.tropas[t];
      if (p > puntaje) { puntaje = p; mejor = o; }
    }
    if (mejor < 0) mejor = propias(a).find(o => vec[o].some(v => E.dueno[v] !== a)) ?? propias(a)[0];
    return mejor;
  }

  // devuelve dónde puso, en orden: [localidad, cuántos]
  function iaColocar(a, N) {
    const o = mejorOrigen(a, N), puestos = [[o, Math.ceil(E.porColocar * 0.65)]];
    colocar(...puestos[0]);
    while (E.porColocar > 0) {
      let elegido = o, peor = -Infinity;
      for (const i of propias(a)) {
        const amenaza = vec[i].reduce((s, v) => s + (E.dueno[v] >= 0 && E.dueno[v] !== a ? E.tropas[v] : 0), 0);
        if (amenaza && amenaza - E.tropas[i] > peor) { peor = amenaza - E.tropas[i]; elegido = i; }
      }
      colocar(elegido, 1);
      puestos.push([elegido, 1]);
    }
    return puestos;
  }

  // la IA ataca con cualquier ventaja y elige primero lo que la acerca a su objetivo.
  // hechos y anexadas son los ataques y las anexiones que ya lleva en el turno; devuelve [origen, blanco] o null si para.
  function iaElegirAtaque(a, N, hechos, anexadas) {
    if (hechos >= 120 || anexadas >= N.anexiones) return null;
    let mejor = null, puntaje = -Infinity;
    for (const o of propias(a)) for (const t of vec[o]) {
      if (!puedeAtacar(o, t)) continue;
      const ventaja = E.tropas[o] - 1 - E.tropas[t];
      if (ventaja < N.ventaja) continue;
      const p = ventaja + interes(a, t, N) * 1.5;
      if (p > puntaje) { puntaje = p; mejor = [o, t]; }
    }
    return mejor;
  }

  // devuelve los pases que hizo, en orden: [origen, destino, cuántos]
  function iaReagrupar(a) {
    const frente = new Set(propias(a).filter(i => vec[i].some(v => E.dueno[v] !== a)));
    const dist = new Array(NL).fill(Infinity), cola = [...frente], pases = [];
    for (const i of frente) dist[i] = 0;
    while (cola.length) {
      const i = cola.shift();
      for (const v of vec[i]) if (E.dueno[v] === a && dist[v] === Infinity) { dist[v] = dist[i] + 1; cola.push(v); }
    }
    for (const i of propias(a)) {
      if (frente.has(i) || E.disp[i] <= 0 || dist[i] === Infinity) continue;
      const destino = vec[i].filter(v => E.dueno[v] === a).sort((x, y) => dist[x] - dist[y])[0];
      if (destino !== undefined && dist[destino] < dist[i]) { pases.push([i, destino, E.disp[i]]); mover(i, destino, E.disp[i]); }
    }
    return pases;
  }

  return {
    E, TODAS, META, MINIMO_REGIONES, TURNO_CICLON, RONDA_SISMO_DESDE, RONDA_SISMO_MAX, RONDAS_PACTO, ESPERA_PACTO, NIVELES,
    vec, REG, regionDe, mezclar, cuenta, ejercitos, propias,
    tarjeta, valorCanje, trio, robar, canjear,
    clavePacto, enPacto, vencerPactos, puedeProponer, proponerPacto,
    repartir, reasignarBlancos, cumplio, refuerzos, puedeAtacar, tirar,
    dadosDeAtaque, resolverDados, anexar, colocar, mover,
    sortearPrimero, nuevaRonda, empezarTurno, siguienteTurno, pasarFase,
    iaColocar, iaElegirAtaque, iaReagrupar,
  };
}

if (typeof module !== 'undefined') module.exports = { crear: crearReglas };
else window.Reglas = { crear: crearReglas };
