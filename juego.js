async function iniciar(THREE, OrbitControls, CANNON) {
  const D = window.DATOS, T = D.terreno, L = D.locs, NL = L.length;

  // ñandú en silueta negra sobre transparente, como los otros tres íconos
  function iconoNandu() {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = g.strokeStyle = '#000'; g.lineCap = 'round';
    g.beginPath(); g.ellipse(46, 50, 25, 17, -0.12, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(22, 46); g.quadraticCurveTo(12, 52, 16, 62); g.quadraticCurveTo(26, 60, 32, 54); g.fill();
    g.lineWidth = 7; g.beginPath(); g.moveTo(62, 42); g.quadraticCurveTo(70, 30, 66, 14); g.stroke();
    g.beginPath(); g.ellipse(68, 13, 6, 5, 0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(72, 10); g.lineTo(82, 15); g.lineTo(72, 17); g.fill();
    g.lineWidth = 4; g.beginPath(); g.moveTo(40, 64); g.lineTo(36, 78); g.lineTo(38, 90); g.moveTo(52, 64); g.lineTo(58, 78); g.lineTo(54, 90); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(32, 90); g.lineTo(42, 90); g.moveTo(50, 90); g.lineTo(60, 90); g.stroke();
    return c.toDataURL();
  }

  const ALIANZAS = [
    { nombre: 'Guardianes del Salitral', corto: 'Salitral', color: '#ECE9E1', tinta: '#3B3026',
      forma: 'pirámide de sal', trama: 'puntos', icono: D.iconos['Salitral'] },
    { nombre: 'Guardianes del Mate', corto: 'Mate', color: '#5E8A2E', tinta: '#121C06',
      forma: 'mate con bombilla', trama: 'rayas', icono: D.iconos['Mate'] },
    { nombre: 'Guardianes del Caldén', corto: 'Caldén', color: '#A4462F', tinta: '#250C05',
      forma: 'caldén', trama: 'damero', icono: D.iconos['Caldén'] },
    { nombre: 'Guardianes del Ñandú', corto: 'Ñandú', color: '#3E5C7A', tinta: '#0C1622',
      forma: 'huevo de ñandú', trama: 'cruces', icono: iconoNandu() },
  ];
  const TODAS = ALIANZAS.map((_, a) => a);
  const AUTONOMA = { nombre: 'Autónoma', color: '#9A8F80', forma: 'mojón' };
  const CARTAS = {
    neblina: { nombre: 'Neblina', texto: 'Solo se puede atacar a localidades autónomas.' },
    viento: { nombre: 'Viento patagónico', texto: 'Quien ataca tira un dado más.' },
    cenizas: { nombre: 'Cenizas del volcán', texto: 'Quien defiende tira un dado más.' },
    rutas: { nombre: 'Rutas cortadas', texto: 'Solo se ataca dentro de la misma región.' },
    calma: { nombre: 'Cielo despejado', texto: 'La ronda no trae nada especial.' },
  };
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

  const $ = s => document.querySelector(s);
  const mezclar = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const miles = n => n.toLocaleString('es-AR');
  const sonidos = Object.fromEntries(['dados', 'carta', 'aceptar', 'aplausos', 'mezclar', 'viento'].map(n => [n, new Audio('sonidos/' + n + '.mp3')]));
  const musica = new Audio('sonidos/musica/fusion4.mp3'); musica.loop = true; musica.volume = 0.35;
  const opt = id => $('#o-' + id).checked;
  const GUARDADA = 'teg-la-pampa-partida';
  let ultimoDado = 0;
  const sonar = n => {
    if (n === 'dados') { if (performance.now() - ultimoDado < 700) return; ultimoDado = performance.now(); }
    const s = sonidos[n]; s.currentTime = 0; s.play().catch(() => {});
  };
  // golpe seco de ficha sobre la madera al anexar, sintetizado para no sumar otro archivo
  let audio = null;
  function golpe() {
    audio ??= new AudioContext();
    const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.25);
  }
  // toque de madera al poner ejércitos: uno por ejército, con la altura apenas corrida para que no suene a máquina
  function toc(n = 1) {
    audio ??= new AudioContext();
    for (let k = 0; k < Math.min(n, 5); k++) {
      const t = audio.currentTime + k * 0.07, o = audio.createOscillator(), g = audio.createGain(), f = 640 + Math.random() * 120;
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.06);
      g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.1);
    }
  }

  // ---------- estado ----------
  const E = {
    dueno: new Array(NL).fill(-1), tropas: new Array(NL).fill(0), ronda: 0, actual: 0, humano: 0,
    fase: 'refuerzos', porColocar: 0, sel: -1, disp: null, carta: 'calma', mazo: [], objetivos: [],
    eliminadoPor: TODAS.map(() => -1), turnos: 0, aviso: '', terminado: false, iaJugando: false, registro: [], ultimaTirada: null, nombres: TODAS.map(() => ''), golpes: 0, puestos: [], mesa: [],
    mano: TODAS.map(() => []), mazoPais: [], canjes: TODAS.map(() => 0), anexoEnTurno: false, pactos: {}, propuesto: new Set(),
  };

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
  function robar(a) {
    if (!E.mazoPais.length) {
      const enMano = new Set(E.mano.flat().map(c => c.loc));
      E.mazoPais = mezclar([-1, -2, ...L.map((_, i) => i)].filter(i => !enMano.has(i)).map(i => tarjeta(i < 0 ? -1 : i)));
    }
    const c = E.mazoPais.pop();
    E.mano[a].push(c);
    let extra = '';
    if (c.loc >= 0 && E.dueno[c.loc] === a) { E.tropas[c.loc] += 2; extra = `, que es suya: suma 2 ejércitos ahí`; }
    anotar(`${ALIANZAS[a].corto} sacó tarjeta: ${c.loc < 0 ? 'comodín' : L[c.loc].n + ' (' + c.simbolo + ')'}${extra}.`, a);
    if (a === E.humano) {
      sonar('carta');
      avisar(`<b>+1</b> tarjeta de país: ${c.loc < 0 ? 'comodín' : L[c.loc].n + ', ' + c.simbolo}`);
      if (extra) avisar(`<b>+2</b> ejércitos en ${L[c.loc].n}: la tarjeta es tuya`);
    }
  }
  function canjear(a) {
    const t = trio(E.mano[a]);
    if (!t) return;
    const suma = valorCanje(E.canjes[a]);
    E.mano[a] = E.mano[a].filter((_, k) => !t.includes(k));
    E.canjes[a]++; E.porColocar += suma;
    anotar(`${ALIANZAS[a].corto} canjeó tres tarjetas: ${suma} ejércitos.`, a);
    if (a === E.humano) avisar(`<b>+${suma}</b> ejércitos por el canje de tarjetas`);
    sonar('mezclar');
  }

  // ---------- pactos de no agresión ----------
  const RONDAS_PACTO = 3;
  const clavePacto = (a, b) => Math.min(a, b) + '-' + Math.max(a, b);
  const enPacto = (a, b) => a >= 0 && b >= 0 && a !== b && E.pactos[clavePacto(a, b)] >= E.ronda;
  function proponerPacto(b) {
    const a = E.humano;
    E.propuesto.add(b);
    const o = E.objetivos[b];
    const acepta = !(o.tipo === 'destruir' && o.blanco === a) && cuenta(a) <= cuenta(b) + 4 && cuenta(a) < META - 8;
    if (acepta) {
      E.pactos[clavePacto(a, b)] = E.ronda + RONDAS_PACTO - 1;
      anotar(`Pacto con ${ALIANZAS[b].corto} hasta la ronda ${E.ronda + RONDAS_PACTO - 1}: no se atacan.`, b);
      anunciar('Pacto', `${ALIANZAS[b].corto} acepta`, `No se atacan hasta la ronda ${E.ronda + RONDAS_PACTO - 1}.`);
      sonar('aceptar');
    } else {
      anotar(`${ALIANZAS[b].corto} rechazó el pacto.`, b);
      anunciar('Pacto', `${ALIANZAS[b].corto} no acepta`, cuenta(a) > cuenta(b) + 4 ? 'Tenés demasiadas localidades más que ellos.' : 'No les conviene en esta partida.');
    }
    actualizar();
  }
  const cuenta = a => E.dueno.reduce((s, d) => s + (d === a), 0);
  const ejercitos = a => E.tropas.reduce((s, t, i) => s + (E.dueno[i] === a ? t : 0), 0);
  const propias = a => E.dueno.flatMap((d, i) => d === a ? [i] : []);
  const nombreDe = d => d < 0 ? 'autónoma' : ALIANZAS[d].corto;
  const anotar = (t, a = -1) => { E.registro.unshift({ t, a }); E.registro.length = Math.min(E.registro.length, 40); };
  function avisar(texto) {
    const cont = $('#avisos'), el = document.createElement('p');
    el.className = 'aviso'; el.innerHTML = texto;
    cont.append(el);
    while (cont.children.length > 4) cont.firstChild.remove();
    setTimeout(() => el.remove(), 5000);
  }

  // como en el TEG: las localidades se sortean, cada Alianza arranca desparramada por la provincia
  function repartir() {
    const mazo = mezclar(L.map((_, i) => i));
    ALIANZAS.forEach((_, a) => mazo.slice(a * 15, a * 15 + 15).forEach(i => { E.dueno[i] = a; }));
    for (let i = 0; i < NL; i++) E.tropas[i] = E.dueno[i] === -1 ? L[i].ej : 2;
    const pares = mezclar(PARES);
    E.objetivos = ALIANZAS.map((_, a) => Math.random() < 1 / 3
      ? { tipo: 'destruir', blanco: (a + 1 + Math.floor(Math.random() * (TODAS.length - 1))) % TODAS.length }
      : { tipo: 'regiones', regs: pares[a] });
  }

  // como en el TEG: si otra Alianza destruye a tu blanco, tu objetivo pasa a ser destruir a esa Alianza
  function reasignarBlancos(eliminada, autora) {
    E.objetivos.forEach((o, c) => {
      if (o.tipo !== 'destruir' || o.blanco !== eliminada || c === autora) return;
      o.blanco = autora;
      if (c === E.humano) anunciar('Tu objetivo cambió', `Destruir a los ${ALIANZAS[autora].corto}`, `Los ${ALIANZAS[autora].nombre} destruyeron a tu blanco: ahora el blanco son ellos.`);
    });
  }

  function textoObjetivo(a) {
    const o = E.objetivos[a];
    if (o.tipo === 'destruir') return `Destruir a los ${ALIANZAS[o.blanco].nombre}: dejarlos sin ninguna localidad. Si otra Alianza los destruye antes, tu blanco pasa a ser esa Alianza.`;
    return `Tener completas las regiones ${o.regs[0]} y ${o.regs[1]}, y ${MINIMO_REGIONES} localidades en total.`;
  }

  function cumplio(a) {
    if (cuenta(a) >= META) return `llegaron a ${META} localidades`;
    const o = E.objetivos[a];
    if (o.tipo === 'destruir' && E.eliminadoPor[o.blanco] === a) return `destruyeron a los ${ALIANZAS[o.blanco].nombre}`;
    if (o.tipo === 'regiones' && cuenta(a) >= MINIMO_REGIONES && o.regs.every(r => REG.find(R => R.nombre === r).locs.every(i => E.dueno[i] === a)))
      return `completaron las regiones ${o.regs[0]} y ${o.regs[1]} con ${cuenta(a)} localidades`;
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

  const tirar = n => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6)).sort((x, y) => y - x);

  async function atacar(o, t) {
    const a = E.actual, previo = E.dueno[t];
    const base = Math.min(3, E.tropas[o] - 1);
    const da = base + (E.carta === 'viento' ? 1 : 0);
    const dd = Math.min(3, E.tropas[t]) + (E.carta === 'cenizas' ? 1 : 0);
    let A, B;
    mesa.tocar(a, fichas[t].g.position);
    const ataco = a === E.humano && !E.iaJugando, defiendo = a !== E.humano && previo === E.humano && opt('defensa');
    if (opt('dados') && (ataco || defiendo)) {
      E.lanzando = true; actualizar();
      $('#tip').style.display = 'none';
      if (defiendo) anunciar('Te atacan', `${ALIANZAS[a].corto} ataca ${L[t].n}`, `Desde ${L[o].n}, con ${da} dados contra tus ${dd}.`);
      ({ A, B } = await mesa.tirarDados(da, dd, { manual: defiendo || !E.rafaga, quien: E.humano, defiende: defiendo }));
      E.lanzando = false;
    } else {
      A = tirar(da); B = tirar(dd);
      sonar('dados');
    }
    let pa = 0, pd = 0;
    for (let k = 0; k < Math.min(da, dd); k++) { if (A[k] > B[k]) pd++; else pa++; }
    pa = Math.min(pa, base);
    E.tropas[o] -= pa; E.tropas[t] -= pd;
    if (previo === E.humano && a !== E.humano) E.golpes += pd;
    E.ultimaTirada = { o, t, A, B, pa, pd, a, previo, conquista: false };
    if (E.tropas[t] <= 0) {
      if (E.tropas[o] >= 2) {
        const tope = Math.min(3, E.tropas[o] - 1);
        const mueve = a === E.humano && !E.iaJugando && tope > 1 ? await elegirCuantos(t, tope) : Math.max(1, Math.min(base, tope));
        E.dueno[t] = a; E.tropas[t] = mueve; E.tropas[o] -= mueve;
        E.ultimaTirada.conquista = true; E.anexoEnTurno = true;
        golpe();
        anotar(`${ALIANZAS[a].corto} anexó ${L[t].n} (era ${nombreDe(previo)}) y pasó ${mueve}.`, a);
        if (previo === E.humano && a !== E.humano) avisar(`${E.nombres[a]}, de ${ALIANZAS[a].corto}, te anexó ${L[t].n}`);
        const R = regionDe(t);
        if (a === E.humano && R.locs.every(i => E.dueno[i] === a)) avisar(`Completaste ${R.nombre}: <b>+${R.bonus}</b> ejércitos por turno mientras la tengas`);
        if (previo >= 0 && cuenta(previo) === 0) {
          E.eliminadoPor[previo] = a;
          reasignarBlancos(previo, a);
          E.mano[a].push(...E.mano[previo]); E.mano[previo] = [];
          anotar(`Los ${ALIANZAS[previo].nombre} quedaron sin localidades; sus tarjetas pasan a ${ALIANZAS[a].corto}.`, a);
        }
        const logro = cumplio(a);
        if (logro) terminar(a, `Los ${ALIANZAS[a].nombre} ${logro}.`);
        else if (ALIANZAS.filter((_, b) => cuenta(b) > 0).length === 1) terminar(a, `Los ${ALIANZAS[a].nombre} quedaron como única Alianza.`);
      } else {
        E.tropas[t] = 1;
      }
    }
    if (E.actual === E.humano || +$('#ritmo').value > 0) { mostrarTirada(E.ultimaTirada); efectoAtaque(E.ultimaTirada); }
    pintar();
  }

  function elegirCuantos(t, tope) {
    E.lanzando = true; actualizar();
    const el = $('#pasar');
    el.innerHTML = `<p>Anexaste <b>${L[t].n}</b>. ¿Cuántos ejércitos pasan?</p><div class="botones">${Array.from({ length: tope }, (_, k) => `<button${k === tope - 1 ? ' class="principal"' : ''} data-n="${k + 1}">${k + 1}</button>`).join('')}</div>`;
    el.classList.remove('oculto');
    return new Promise(listo => el.querySelectorAll('button').forEach(b => {
      b.onclick = () => { el.classList.add('oculto'); E.lanzando = false; sonar('aceptar'); listo(+b.dataset.n); };
    }));
  }

  function colocar(i, n) {
    E.tropas[i] += n; E.porColocar -= n; pintar();
    if (E.actual === E.humano && !E.iaJugando) { toc(n); E.puestos.push([i, n]); }
    mesa.tocar(E.actual, fichas[i].g.position);
  }

  function mover(o, t, n) {
    E.tropas[o] -= n; E.tropas[t] += n; E.disp[o] -= n; pintar();
    mesa.tocar(E.actual, fichas[t].g.position);
  }

  // ---------- rondas y turnos ----------
  function nuevaRonda() {
    E.ronda++;
    if (E.ronda >= RONDA_SISMO_DESDE && (E.ronda >= RONDA_SISMO_MAX || Math.random() < 1 / 6)) {
      const orden = [...TODAS].sort((x, y) => cuenta(y) - cuenta(x) || ejercitos(y) - ejercitos(x));
      anotar(`Sismo al empezar la ronda ${E.ronda}.`);
      mesa.efecto('sismo'); sonar('viento');
      terminar(orden[0], `El sismo cortó la partida al empezar la ronda ${E.ronda}. Los ${ALIANZAS[orden[0]].nombre} tenían más localidades: ${cuenta(orden[0])}.`);
      return;
    }
    let mezclado = false;
    if (E.ronda <= 2) E.carta = 'neblina';
    else {
      if (!E.mazo.length) { E.mazo = mezclar(MAZO); mezclado = true; }
      E.carta = E.mazo.pop();
    }
    anotar(`Ronda ${E.ronda}: ${CARTAS[E.carta].nombre}.`);
    for (const [k, fin] of Object.entries(E.pactos)) if (fin < E.ronda) {
      delete E.pactos[k];
      const par = k.split('-').map(Number);
      anotar(`Terminó el pacto entre ${par.map(b => ALIANZAS[b].corto).join(' y ')}.`);
      if (par.includes(E.humano)) avisar(`Terminó tu pacto con ${ALIANZAS[par.find(b => b !== E.humano)].corto}: ya se pueden atacar`);
    }
    sonar(E.carta === 'viento' ? 'viento' : mezclado ? 'mezclar' : 'carta');
    anunciar(`Ronda ${E.ronda}`, CARTAS[E.carta].nombre, CARTAS[E.carta].texto);
    mesa.soltarCarta(CARTAS[E.carta].nombre, CARTAS[E.carta].texto, 0);
    mesa.efecto(E.carta);
  }

  function empezarTurno() {
    E.fase = 'refuerzos'; E.sel = -1;
    E.turnos++;
    if (E.turnos === TURNO_CICLON) {
      for (let i = 0; i < NL; i++) if (E.tropas[i] > 2) E.tropas[i] -= Math.floor(E.tropas[i] / 3);
      E.aviso = `Turno ${TURNO_CICLON}: pasó el ciclón. Cada localidad con más de 2 ejércitos perdió un tercio.`;
      anotar(E.aviso);
      sonar('viento');
      anunciar('Ciclón', 'Pasó el ciclón', 'Cada localidad con más de 2 ejércitos perdió un tercio.');
      mesa.efecto('ciclon');
    }
    E.porColocar = refuerzos(E.actual);
    E.anexoEnTurno = false; E.propuesto.clear(); E.golpes = 0; E.puestos = [];
    anotar(`Turno de ${ALIANZAS[E.actual].corto}: ${E.porColocar} ejércitos de refuerzo.`, E.actual);
    if (E.actual === E.humano) {
      const bono = E.porColocar - Math.max(3, Math.floor(cuenta(E.humano) / 2));
      avisar(`<b>+${E.porColocar}</b> ejércitos de refuerzo${bono ? `, ${bono} por regiones completas` : ''}`);
    }
    if (E.actual !== E.humano || E.mano[E.actual].length >= 5) canjear(E.actual);
    localStorage.setItem(GUARDADA, JSON.stringify({ ...E, propuesto: [] }));
    actualizar();
    if (E.actual !== E.humano) jugarIA();
  }

  function siguienteTurno() {
    if (E.terminado) return;
    let a = E.actual;
    do {
      a++;
      if (a >= TODAS.length) { a = 0; nuevaRonda(); if (E.terminado) return; }
    } while (cuenta(a) === 0);
    E.actual = a;
    empezarTurno();
  }

  function pasarFase() {
    if (E.fase === 'refuerzos') { E.fase = 'ataque'; }
    else if (E.fase === 'ataque') {
      if (E.anexoEnTurno) robar(E.actual);
      E.fase = 'reagrupar';
      E.disp = E.tropas.map((t, i) => E.dueno[i] === E.actual ? t - 1 : 0);
    } else { siguienteTurno(); return; }
    E.sel = -1;
    actualizar();
  }

  function terminar(ganador, motivo) {
    E.terminado = true; E.sel = -1;
    localStorage.removeItem(GUARDADA);
    if (ganador === E.humano) sonar('aplausos');
    $('#anuncio').classList.add('oculto');
    const el = $('#final');
    const filas = TODAS.map(a => `<tr><td><span class="alianza"><img src="${ALIANZAS[a].icono}" alt="">${ALIANZAS[a].nombre}${a === E.humano ? ' <span class="vos">(vos)</span>' : ''}</span></td><td class="n">${cuenta(a)} localidades</td></tr>`).join('');
    el.innerHTML = `<h1>${ganador === E.humano ? 'Ganaste' : 'Ganaron los ' + ALIANZAS[ganador].nombre}</h1>
      <p>${motivo}</p><p>Ronda ${E.ronda}.</p><table>${filas}</table>
      <div class="botones"><button class="principal" id="otra">Jugar otra partida</button></div>`;
    el.classList.remove('oculto');
    $('#otra').onclick = () => location.reload();
    actualizar();
  }

  // ---------- IA ----------
  const pausa = async () => {
    await new Promise(r => setTimeout(r, +$('#ritmo').value));
    while (!$('#menu').classList.contains('oculto') || document.hidden) await new Promise(r => setTimeout(r, 200));
  };
  const IA_ANEXIONES = 8;

  function interes(a, t) {
    let v = 1;
    const o = E.objetivos[a], R = regionDe(t);
    if (o.tipo === 'regiones' && o.regs.includes(L[t].r)) v += 2;
    if (o.tipo === 'destruir' && E.dueno[t] === o.blanco) v += 3;
    v += 2 * R.locs.filter(i => E.dueno[i] === a).length / R.locs.length;
    return v;
  }

  function mejorOrigen(a) {
    let mejor = -1, puntaje = -Infinity;
    for (const o of propias(a)) for (const t of vec[o]) {
      if (E.dueno[t] === a || enPacto(a, E.dueno[t])) continue;
      if (E.carta === 'neblina' && E.dueno[t] !== -1) continue;
      if (E.carta === 'rutas' && L[o].r !== L[t].r) continue;
      const p = interes(a, t) * 2 + E.tropas[o] - E.tropas[t];
      if (p > puntaje) { puntaje = p; mejor = o; }
    }
    if (mejor < 0) mejor = propias(a).find(o => vec[o].some(v => E.dueno[v] !== a)) ?? propias(a)[0];
    return mejor;
  }

  function iaColocar(a) {
    const o = mejorOrigen(a);
    colocar(o, Math.ceil(E.porColocar * 0.65));
    while (E.porColocar > 0) {
      let elegido = o, peor = -Infinity;
      for (const i of propias(a)) {
        const amenaza = vec[i].reduce((s, v) => s + (E.dueno[v] >= 0 && E.dueno[v] !== a ? E.tropas[v] : 0), 0);
        if (amenaza && amenaza - E.tropas[i] > peor) { peor = amenaza - E.tropas[i]; elegido = i; }
      }
      colocar(elegido, 1);
    }
  }

  function iaReagrupar(a) {
    const frente = new Set(propias(a).filter(i => vec[i].some(v => E.dueno[v] !== a)));
    const dist = new Array(NL).fill(Infinity), cola = [...frente];
    for (const i of frente) dist[i] = 0;
    while (cola.length) {
      const i = cola.shift();
      for (const v of vec[i]) if (E.dueno[v] === a && dist[v] === Infinity) { dist[v] = dist[i] + 1; cola.push(v); }
    }
    for (const i of propias(a)) {
      if (frente.has(i) || E.disp[i] <= 0 || dist[i] === Infinity) continue;
      const destino = vec[i].filter(v => E.dueno[v] === a).sort((x, y) => dist[x] - dist[y])[0];
      if (destino !== undefined && dist[destino] < dist[i]) mover(i, destino, E.disp[i]);
    }
  }

  async function jugarIA() {
    const a = E.actual;
    E.iaJugando = true; actualizar();
    await pausa();
    if (E.fase === 'refuerzos') { iaColocar(a); actualizar(); await pausa(); pasarFase(); }
    if (E.fase === 'ataque') {
      // la IA ataca con cualquier ventaja y elige primero lo que la acerca a su objetivo
      let anexadas = 0;
      for (let n = 0; n < 120 && !E.terminado && anexadas < IA_ANEXIONES; n++) {
        let mejor = null, puntaje = -Infinity;
        for (const o of propias(a)) for (const t of vec[o]) {
          if (!puedeAtacar(o, t)) continue;
          const ventaja = E.tropas[o] - 1 - E.tropas[t];
          if (ventaja < 1) continue;
          const p = ventaja + interes(a, t) * 1.5;
          if (p > puntaje) { puntaje = p; mejor = [o, t]; }
        }
        if (!mejor) break;
        await atacar(...mejor); actualizar();
        if (E.ultimaTirada.conquista) anexadas++;
        await pausa();
      }
      if (E.terminado) { E.iaJugando = false; actualizar(); return; }
      pasarFase();
    }
    iaReagrupar(a);
    if (E.golpes) avisar(`${E.nombres[a]}, de ${ALIANZAS[a].corto}, te sacó ${E.golpes} ${E.golpes === 1 ? 'ejército' : 'ejércitos'} en este turno`);
    E.iaJugando = false;
    actualizar(); await pausa();
    pasarFase();
  }

  // ---------- tablero 3D ----------
  const lienzo = $('#lienzo');
  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true });
  // en pantallas muy densas (teléfonos) más de 1,5 píxeles por punto no se nota y cuesta el doble
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const escena = new THREE.Scene();
  escena.background = new THREE.Color('#3E3226');
  const camara = new THREE.PerspectiveCamera(38, 1, 5, 4000);
  camara.position.set(-40, 505, 450);
  const controles = new OrbitControls(camara, lienzo);
  controles.target.set(0, 0, 15);
  controles.enableDamping = true;
  controles.maxPolarAngle = 1.3;
  controles.minDistance = 60;
  controles.maxDistance = 1100;
  escena.add(new THREE.HemisphereLight('#F3EAD8', '#3E3226', 1.1));
  const sol = new THREE.DirectionalLight('#FFF3DD', 2.2);
  sol.position.set(-260, 240, -320);
  escena.add(sol);

  const lonAx = lon => (lon - T.lon0) * T.mx / 1000;
  const latAz = lat => -(lat - T.lat0) * 110.574;
  const axLon = x => T.lon0 + x * 1000 / T.mx;
  const azLat = z => T.lat0 - z / 110.574;

  const altura = new Uint16Array(Uint8Array.from(atob(T.alt), c => c.charCodeAt(0)).buffer);
  const nx = T.nx, ny = T.ny;
  const pos = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2);
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
    const k = r * nx + c;
    pos.set([T.x[c], altura[k] / 1000, T.z[r]], k * 3);
    uv.set([T.u[c], T.v[r]], k * 2);
  }
  const indices = [];
  for (let r = 0; r < ny - 1; r++) for (let c = 0; c < nx - 1; c++) {
    const a = r * nx + c, b = a + 1, d = a + nx, e = d + 1;
    indices.push(a, d, b, b, d, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  function alturaEn(x, z) {
    const c = Math.round((x - T.x[0]) / (T.x[nx - 1] - T.x[0]) * (nx - 1));
    let r = 0;
    while (r < ny - 1 && T.z[r + 1] < z) r++;
    let h = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = Math.min(ny - 1, Math.max(0, r + dr)), cc = Math.min(nx - 1, Math.max(0, c + dc));
      h = Math.max(h, altura[rr * nx + cc] / 1000);
    }
    return h;
  }

  // textura: satélite apagado, provincia recortada sobre la madera, ejidos con trama y color del dueño
  await document.fonts.load('600 16px "Vollkorn SC"');
  await document.fonts.load('700 60px "Vollkorn SC"');
  const sat = new Image();
  await new Promise((ok, mal) => { sat.onload = ok; sat.onerror = () => mal(new Error('No se pudo leer la imagen satelital de data.js')); sat.src = window.SATELITE; });
  const CW = sat.width, CH = sat.height;
  const ym = lat => { const s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  const aPix = ([lon, lat]) => [(lon - T.W) / (T.E - T.W) * CW, (ym(lat) - ym(T.N)) / (ym(T.S) - ym(T.N)) * CH];
  const caminos = L.map(l => {
    const p = new Path2D();
    for (const an of l.a) { an.forEach((pt, k) => { const [x, y] = aPix(pt); k ? p.lineTo(x, y) : p.moveTo(x, y); }); p.closePath(); }
    return p;
  });
  const nuevoLienzo = () => { const c = document.createElement('canvas'); c.width = CW; c.height = CH; return c; };

  const base = nuevoLienzo(), bx = base.getContext('2d');
  bx.filter = 'saturate(0.55) brightness(0.8) contrast(1.08)';
  bx.drawImage(sat, 0, 0);
  bx.filter = 'none';
  const fuera = nuevoLienzo(), fx = fuera.getContext('2d');
  fx.fillStyle = '#2B2219'; fx.fillRect(0, 0, CW, CH);
  fx.globalCompositeOperation = 'destination-out';
  caminos.forEach(p => fx.fill(p));
  bx.drawImage(fuera, 0, 0);

  // bordes de región: anillo exterior de cada región, armado corriendo su silueta 3 px en ocho direcciones
  const encima = nuevoLienzo(), ex = encima.getContext('2d');
  const sil = nuevoLienzo(), sx = sil.getContext('2d');
  const anillo = nuevoLienzo(), ax = anillo.getContext('2d');
  for (const R of REG) {
    sx.clearRect(0, 0, CW, CH); sx.fillStyle = '#1A140E';
    R.locs.forEach(i => sx.fill(caminos[i]));
    ax.clearRect(0, 0, CW, CH); ax.globalCompositeOperation = 'source-over';
    for (let k = 0; k < 8; k++) ax.drawImage(sil, Math.round(3 * Math.cos(k * Math.PI / 4)), Math.round(3 * Math.sin(k * Math.PI / 4)));
    ax.globalCompositeOperation = 'destination-out'; ax.drawImage(sil, 0, 0);
    ex.drawImage(anillo, 0, 0);
  }
  ex.font = '600 17px "Vollkorn SC"'; ex.textAlign = 'center'; ex.lineJoin = 'round';
  L.forEach(l => {
    const [x, y] = aPix(l.p);
    ex.lineWidth = 4; ex.strokeStyle = '#1A140E'; ex.strokeText(l.n, x, y + 22);
    ex.fillStyle = '#F2ECDF'; ex.fillText(l.n, x, y + 22);
  });

  // las tramas tienen que leerse con el tablero entero a la vista y sin depender del color:
  // puntos, rayas, damero y cruces, gruesos y con la tinta oscura de cada Alianza
  function trama(a) {
    const c = document.createElement('canvas'); c.width = c.height = 40;
    const g = c.getContext('2d');
    g.fillStyle = ALIANZAS[a].color; g.fillRect(0, 0, 40, 40);
    g.fillStyle = g.strokeStyle = ALIANZAS[a].tinta; g.lineWidth = 6; g.lineCap = 'square';
    if (a === 0) { g.beginPath(); g.arc(10, 10, 5.5, 0, 7); g.arc(30, 30, 5.5, 0, 7); g.fill(); }
    if (a === 1) { g.beginPath(); for (const k of [-40, 0, 40]) { g.moveTo(k, 40); g.lineTo(k + 40, 0); } g.stroke(); }
    if (a === 2) { g.fillRect(0, 0, 20, 20); g.fillRect(20, 20, 20, 20); }
    if (a === 3) { g.beginPath(); for (const [x, y] of [[10, 10], [30, 30]]) { g.moveTo(x - 6, y - 6); g.lineTo(x + 6, y + 6); g.moveTo(x + 6, y - 6); g.lineTo(x - 6, y + 6); } g.stroke(); }
    return c;
  }
  const tex = nuevoLienzo(), tx = tex.getContext('2d');
  const tramas = ALIANZAS.map((_, a) => tx.createPattern(trama(a), 'repeat'));
  const textura = new THREE.CanvasTexture(tex);
  textura.flipY = false;
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = renderer.capabilities.getMaxAnisotropy();

  function dibujarTextura() {
    tx.globalAlpha = 1;
    tx.drawImage(base, 0, 0);
    for (let i = 0; i < NL; i++) {
      const d = E.dueno[i];
      if (d < 0) { tx.globalAlpha = 0.18; tx.fillStyle = '#9A8F80'; tx.fill(caminos[i]); continue; }
      tx.globalAlpha = 0.62; tx.fillStyle = tramas[d]; tx.fill(caminos[i]);
    }
    tx.globalAlpha = 0.9; tx.strokeStyle = '#1A140E'; tx.lineWidth = 1.5;
    caminos.forEach(p => tx.stroke(p));
    tx.globalAlpha = 1;
    tx.drawImage(encima, 0, 0);
    if (E.sel >= 0) {
      tx.strokeStyle = '#A9C46C'; tx.lineWidth = 7; tx.setLineDash([]);
      tx.stroke(caminos[E.sel]);
      tx.lineWidth = 5; tx.setLineDash([14, 9]);
      blancos().forEach(t => tx.stroke(caminos[t]));
      tx.setLineDash([]);
    }
    textura.needsUpdate = true;
  }

  const terreno = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: textura, roughness: 1, metalness: 0 }));
  escena.add(terreno);
  const ancho = T.x[nx - 1] - T.x[0], largo = T.z[ny - 1] - T.z[0];
  const losa = new THREE.Mesh(new THREE.BoxGeometry(ancho, 4, largo), new THREE.MeshStandardMaterial({ color: '#2B2219', roughness: 0.9 }));
  losa.position.set(0, -2.01, (T.z[0] + T.z[ny - 1]) / 2);
  escena.add(losa);
  const vetas = new THREE.TextureLoader().load(window.MADERA);
  vetas.wrapS = vetas.wrapT = THREE.RepeatWrapping; vetas.repeat.set(5, 5); vetas.colorSpace = THREE.SRGBColorSpace;
  const tabla = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ map: vetas, color: '#5A4634', roughness: 0.85 }));
  tabla.rotation.x = -Math.PI / 2; tabla.position.y = -4.05;
  escena.add(tabla);

  // fichas
  function formaFicha(d) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: d < 0 ? AUTONOMA.color : ALIANZAS[d].color, roughness: 0.6 });
    const oscuro = new THREE.MeshStandardMaterial({ color: '#2B2219', roughness: 0.8 });
    const pieza = (geom, m, y) => { const p = new THREE.Mesh(geom, m); p.position.y = y; g.add(p); return p; };
    if (d === -1) pieza(new THREE.BoxGeometry(4.4, 4.4, 4.4), mat, 2.2);
    if (d === 0) pieza(new THREE.ConeGeometry(5, 9.5, 3), mat, 4.75);
    if (d === 1) {
      pieza(new THREE.LatheGeometry([[0, 0], [3, 0.3], [4.4, 2], [4.6, 4], [3.8, 6.2], [2.6, 7.4], [2.9, 8.2], [0, 8.2]].map(([x, y]) => new THREE.Vector2(x, y)), 20), mat, 0);
      const b = pieza(new THREE.CylinderGeometry(0.4, 0.4, 6, 8), new THREE.MeshStandardMaterial({ color: '#C9C4BA', metalness: 0.6, roughness: 0.35 }), 9.6);
      b.position.x = 1.1; b.rotation.z = -0.25;
    }
    if (d === 2) {
      pieza(new THREE.CylinderGeometry(1, 1.5, 5.5, 8), oscuro, 2.75);
      const copa = pieza(new THREE.SphereGeometry(5, 14, 10), mat, 7.2);
      copa.scale.y = 0.5;
    }
    if (d === 3) { const huevo = pieza(new THREE.SphereGeometry(4, 16, 12), mat, 5.2); huevo.scale.y = 1.3; }
    return g;
  }
  const cacheNumeros = new Map();
  function numero(d, n) {
    const clave = d + ':' + n;
    if (!cacheNumeros.has(clave)) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 96;
      const g = c.getContext('2d');
      g.fillStyle = d < 0 ? AUTONOMA.color : ALIANZAS[d].color; g.beginPath(); g.roundRect(0, 0, 128, 96, 10); g.fill();
      g.fillStyle = '#1A140E'; g.beginPath(); g.roundRect(9, 9, 110, 78, 6); g.fill();
      g.fillStyle = '#F2ECDF'; g.font = '700 60px "Vollkorn SC"'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n), 64, 52);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      cacheNumeros.set(clave, new THREE.SpriteMaterial({ map: t, depthTest: false }));
    }
    return cacheNumeros.get(clave);
  }
  const fichas = L.map(l => {
    const x = lonAx(l.p[0]), z = latAz(l.p[1]);
    const g = new THREE.Group(); g.position.set(x, alturaEn(x, z), z); g.scale.setScalar(1.5);
    const cartel = new THREE.Sprite(numero(-1, 0)); cartel.scale.set(8, 6, 1); cartel.position.y = 14; cartel.renderOrder = 2;
    g.add(cartel); escena.add(g);
    return { g, cartel, forma: null, clave: null, x0: x };
  });

  // modo rol: muñequitos en vez de fichas, uno o dos por localidad (el número dice cuántos ejércitos hay). Lo que llevan en la cabeza dice la Alianza (gorra, boina, sombrero, gorro de lana, vincha);
  // cada muñequito tiene sus rasgos (piel, pelo, cara, pañuelo o poncho, lo que lleva en la mano), fijos por localidad y lugar
  const BOLA = new THREE.SphereGeometry(1, 12, 9), TUBO = new THREE.CylinderGeometry(1, 1, 1, 10);
  const TRONCO = new THREE.CylinderGeometry(0.8, 1, 1, 10), CONO = new THREE.ConeGeometry(1, 1, 10);
  const ARO = new THREE.TorusGeometry(1, 0.22, 6, 16);
  const MANTA = new THREE.CylinderGeometry(0.75, 1, 1, 4), CASQUETE = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const MAT = { oscuro: new THREE.MeshStandardMaterial({ color: '#2B2219', roughness: 0.8 }) };
  const matMuneco = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const RASGOS = {
    piel: ['#E8C4A0', '#C99B76', '#9C6B48', '#5E3B26'],
    pelo: ['#1E1610', '#4A3020', '#8A6A45', '#BDB6AA'],
    bombacha: ['#3A332B', '#6B5B45', '#2F3A40', '#8C8272'],
    panuelo: ['#7A1F1F', '#E6DFCF', '#2F4A6B', '#4B5B3A'],
    poncho: ['#6E2A2A', '#4A3A2A', '#2F3A40', '#D8CFB8'],
    pollera: ['#6E2A2A', '#2F3A40', '#4B5B3A', '#5A4632'],
    cuello: ['nada', 'panuelo', 'panuelo', 'poncho'],
    mano: ['nada', 'nada', 'mate', 'mate', 'tacuara', 'boleadoras', 'guitarra'],
  };
  function rasgos(semilla) {
    let s = semilla * 7919 + 17;
    const azar = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const r = {};
    const elegir = lista => lista[Math.floor(azar() * lista.length)];
    for (const k in RASGOS) r[k] = elegir(RASGOS[k]);
    r.mujer = azar() < 0.5;
    r.peinado = r.mujer ? elegir(['melena', 'melena', 'trenza', 'rodete', 'corto']) : elegir(['corto', 'corto', 'pelado', 'rodete']);
    r.cara = r.mujer ? 'nada' : elegir(['nada', 'nada', 'bigote', 'barba']);
    r.falda = r.mujer && azar() < 0.5;
    r.aros = r.mujer && azar() < 0.6;
    r.alto = 0.92 + azar() * 0.16; r.ancho = 0.94 + azar() * 0.12;
    return r;
  }
  // todas las piezas de un muñequito en una sola malla con el color en cada vértice: cientos en la mesa sin trabar el cuadro
  function fundir(partes) {
    const geos = partes.map(([geo, color, m]) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m); return [g, new THREE.Color(color)]; });
    const n = geos.reduce((t, [g]) => t + g.attributes.position.count, 0);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    geos.forEach(([g, c]) => {
      const k = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      for (let v = o; v < o + k; v++) { col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; }
      o += k; g.dispose();
    });
    const r = new THREE.BufferGeometry();
    r.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    r.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    r.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return r;
  }
  const moldes = new Map();
  function muneco(d, semilla) {
    const r = rasgos(semilla), clave = [d, r.piel, r.pelo, r.bombacha, r.panuelo, r.poncho, r.peinado, r.cara, r.cuello, r.mano, r.mujer, r.falda && r.pollera, r.aros].join('|');
    if (!moldes.has(clave)) {
      const P = [];
      const p = (geo, color, pos, esc, rot = [0, 0, 0]) => P.push([geo, color, new THREE.Matrix4().compose(
        new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...esc))]);
      const ligar = (a, b, radio, color) => {
        const va = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(va), largo = d.length();
        P.push([TUBO, color, new THREE.Matrix4().compose(va.addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(radio, largo, radio))]);
      };
      const camisa = d < 0 ? AUTONOMA.color : ALIANZAS[d].color, tinta = d < 0 ? '#3B3026' : ALIANZAS[d].tinta;
      const piel = r.piel, nariz = new THREE.Color(piel).multiplyScalar(0.88);
      [-0.5, 0.5].forEach(x => {
        p(BOLA, '#2B2219', [x, 0.3, 0.25], [0.5, 0.32, 0.75]);
        p(TUBO, '#2B2219', [x, 0.75, 0], [0.42, 1.0, 0.42]);
        if (r.falda) p(TUBO, '#3A332B', [x, 1.7, 0], [0.34, 1.4, 0.34]);
        else p(BOLA, r.bombacha, [x, 2.0, 0], [0.62, 1.05, 0.62]);
      });
      if (r.falda) p(TRONCO, r.pollera, [0, 2.35, 0], [1.3, 1.6, 1.2]);
      p(TUBO, tinta, [0, 3.05, 0], [1.28, 0.45, 1.18]);
      [-0.5, 0, 0.5].forEach(x => p(BOLA, '#B9B4A8', [x, 3.05, 1.17], x ? [0.17, 0.17, 0.08] : [0.24, 0.24, 0.1]));
      p(TRONCO, camisa, [0, 4.35, 0], r.mujer ? [1.1, 2.7, 0.95] : [1.2, 2.7, 1.0]);
      [-1, 1].forEach(s => {
        p(BOLA, camisa, [s * (r.mujer ? 0.92 : 1.0), 5.45, 0], [0.5, 0.48, 0.5]);
        if (r.aros) p(BOLA, '#C9C3B6', [s * 0.95, 6.55, 0.05], [0.12, 0.12, 0.12]);
        if (r.mujer) p(BOLA, '#1A140E', [s * 0.33, 7.14, 0.84], [0.17, 0.035, 0.06]);
        p(TUBO, camisa, [s * 1.38, 4.45, 0], [0.3, 2.2, 0.3], [0, 0, s * 0.18]);
        p(BOLA, piel, [s * 1.6, 3.25, 0.05], [0.33, 0.36, 0.33]);
        p(BOLA, piel, [s * 0.93, 6.85, 0], [0.18, 0.26, 0.14]);
        p(BOLA, '#1A140E', [s * 0.33, 7.0, 0.86], [0.11, 0.13, 0.08]);
      });
      p(TUBO, piel, [0, 5.9, 0], [0.38, 0.5, 0.38]);
      p(BOLA, piel, [0, 6.85, 0], [0.95, 1.02, 0.95]);
      p(BOLA, nariz, [0, 6.75, 0.95], [0.18, 0.2, 0.2]);
      if (r.mujer) p(BOLA, '#8A3A36', [0, 6.42, 0.9], [0.22, 0.07, 0.07]);

      if (r.peinado !== 'pelado') p(CASQUETE, r.pelo, [0, 6.9, -0.05], [1.0, 1.05, 1.0], [-0.35, 0, 0]);
      if (r.peinado === 'trenza') for (let k = 0; k < 4; k++) p(BOLA, r.pelo, [0, 6.45 - k * 0.45, -0.98 - k * 0.04], [0.28 - k * 0.02, 0.3, 0.26]);
      if (r.peinado === 'rodete') p(BOLA, r.pelo, [0, 7.35, -0.9], [0.45, 0.45, 0.42]);
      if (r.peinado === 'melena') { p(BOLA, r.pelo, [0, 6.25, -0.5], [1.0, 1.05, 0.62]); [-1, 1].forEach(s => p(BOLA, r.pelo, [s * 0.82, 6.4, -0.1], [0.3, 0.75, 0.45])); }
      if (r.cara === 'bigote' || r.cara === 'barba') p(BOLA, r.pelo, [0, 6.55, 0.9], [0.42, 0.11, 0.12]);
      if (r.cara === 'barba') p(BOLA, r.pelo, [0, 6.35, 0.55], [0.78, 0.6, 0.55]);

      if (r.cuello === 'panuelo') {
        p(ARO, r.panuelo, [0, 5.75, 0], [0.55, 0.55, 1.2], [Math.PI / 2, 0, 0]);
        p(CONO, r.panuelo, [0, 5.35, 0.78], [0.38, 0.6, 0.15], [Math.PI, 0, 0]);
      }
      if (r.cuello === 'poncho') {
        const claroPoncho = r.poncho === '#D8CFB8';
        p(MANTA, r.poncho, [0, 4.7, 0], [1.75, 2.1, 1.55], [0, Math.PI / 4, 0]);
        p(MANTA, claroPoncho ? '#4A3A2A' : '#E6DFCF', [0, 3.92, 0], [1.8, 0.24, 1.6], [0, Math.PI / 4, 0]);
      }

      if (r.mano === 'mate') {
        p(BOLA, '#7A5A30', [1.62, 3.55, 0.35], [0.38, 0.45, 0.38]);
        p(TUBO, '#4A3020', [1.62, 3.95, 0.35], [0.26, 0.1, 0.26]);
        p(TUBO, '#C9C3B6', [1.7, 4.25, 0.35], [0.05, 0.75, 0.05], [0, 0, -0.25]);
      }
      if (r.mano === 'tacuara') {
        p(TUBO, '#8A6A45', [1.65, 4.6, 0.2], [0.09, 7.5, 0.09]);
        p(CONO, '#B9B4A8', [1.65, 8.75, 0.2], [0.2, 0.8, 0.2]);
      }
      if (r.mano === 'boleadoras') {
        [[1.3, 2.35, 0.35], [1.95, 2.2, 0.1], [1.7, 2.6, -0.3]].forEach(b => {
          ligar([1.6, 3.15, 0.05], b, 0.04, '#6B4A2E');
          p(BOLA, '#5A4632', b, [0.26, 0.26, 0.26]);
        });
      }
      if (r.mano === 'guitarra') {
        p(BOLA, '#8A5A2B', [0.35, 3.7, 1.15], [0.85, 1.0, 0.32]);
        p(BOLA, '#8A5A2B', [-0.15, 4.45, 1.15], [0.65, 0.72, 0.3]);
        p(BOLA, '#1A140E', [0.1, 4.05, 1.43], [0.22, 0.22, 0.05]);
        ligar([-0.3, 4.75, 1.2], [-1.55, 6.05, 1.1], 0.14, '#4A3020');
        p(BOLA, '#4A3020', [-1.65, 6.15, 1.1], [0.22, 0.35, 0.15], [0, 0, 0.75]);
      }

      if (d === 0) {
        p(CASQUETE, tinta, [0, 7.05, 0], [1.04, 0.95, 1.04]);
        p(TUBO, tinta, [0, 7.12, 1.05], [0.88, 0.1, 0.8], [0.18, 0, 0]);
        p(BOLA, ALIANZAS[0].color, [0, 8.0, 0], [0.18, 0.12, 0.18]);
      }
      if (d === 1) {
        p(TRONCO, tinta, [0.15, 7.65, 0], [1.3, 0.55, 1.3], [Math.PI, 0, -0.2]);
        p(BOLA, tinta, [0.08, 7.98, 0], [0.15, 0.15, 0.15]);
      }
      if (d === 2) {
        p(TUBO, tinta, [0, 7.45, 0], [2.0, 0.18, 2.0]);
        p(TRONCO, tinta, [0, 8.0, 0], [1.0, 1.1, 1.0]);
        p(TUBO, '#B9A27A', [0, 7.75, 0], [0.99, 0.22, 0.99]);
      }
      if (d === 3) {
        p(CASQUETE, tinta, [0, 7.0, 0], [1.06, 1.35, 1.06]);
        p(TUBO, ALIANZAS[3].color, [0, 7.05, 0], [1.1, 0.32, 1.1]);
        p(BOLA, ALIANZAS[3].color, [0, 8.5, 0], [0.38, 0.38, 0.38]);
      }
      if (d < 0) p(ARO, '#5A5148', [0, 7.25, 0], [0.98, 0.98, 0.9], [Math.PI / 2, 0, 0]);
      moldes.set(clave, fundir(P));
    }
    const m = new THREE.Mesh(moldes.get(clave), matMuneco);
    m.scale.set(r.ancho, r.alto, r.ancho);
    return m;
  }
  const LUGARES = [[-1.8, 0.6], [1.8, -0.6]];
  function tropa(d, n, i) {
    const g = new THREE.Group();
    for (let k = 0; k < n; k++) { const m = muneco(d, i * 10 + k); m.position.set(n > 1 ? LUGARES[k][0] : 0, 0, n > 1 ? LUGARES[k][1] : 0); m.rotation.y = (k * 1.7) % 1 - 0.5; g.add(m); }
    g.scale.setScalar(1.4);
    return g;
  }
  // dónde podés jugar: un aro que late con un haz de luz donde podés poner o desde donde salir; una flecha que baja sobre cada blanco
  const luz = op => new THREE.MeshBasicMaterial({ color: '#F2F5D8', transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
  const matAro = luz(0.75), matHaz = luz(0.16), matFlecha = new THREE.MeshStandardMaterial({ color: '#F2F5D8', emissive: '#6E7350', roughness: 0.5 });
  const geoAro = new THREE.RingGeometry(5.2, 6.8, 36).rotateX(-Math.PI / 2), geoHaz = new THREE.CylinderGeometry(5.6, 5.6, 22, 28, 1, true).translate(0, 11, 0);
  const geoFlecha = new THREE.ConeGeometry(2.6, 5.5, 4).rotateX(Math.PI);
  const marcas = fichas.map(f => {
    const aro = new THREE.Group(), flecha = new THREE.Mesh(geoFlecha, matFlecha);
    aro.add(new THREE.Mesh(geoAro, matAro), new THREE.Mesh(geoHaz, matHaz));
    aro.position.y = 0.6; aro.visible = flecha.visible = false;
    f.g.add(aro, flecha);
    return { aro, flecha };
  });
  function marcar(ahora) {
    const libre = !E.terminado && E.actual === E.humano && !E.iaJugando && !E.rafaga && !E.lanzando && !E.enTutorial && E.turnos > 0;
    const mio = i => E.dueno[i] === E.humano;
    let salen = () => false, blanco = () => false;
    if (libre && E.fase === 'refuerzos' && E.porColocar > 0) salen = mio;
    if (libre && E.fase === 'ataque') {
      if (E.sel < 0) salen = i => mio(i) && E.tropas[i] >= 2 && vec[i].some(t => puedeAtacar(i, t));
      else { const bl = blancos(); salen = i => i === E.sel; blanco = i => bl.includes(i); }
    }
    if (libre && E.fase === 'reagrupar') {
      if (E.sel < 0) salen = i => mio(i) && E.disp[i] > 0 && vec[i].some(t => E.dueno[t] === E.humano);
      else { const bl = blancos(); salen = i => i === E.sel; blanco = i => bl.includes(i); }
    }
    const late = 1 + 0.14 * Math.sin(ahora / 260);
    marcas.forEach((m, i) => {
      m.aro.visible = salen(i); m.flecha.visible = blanco(i);
      if (m.aro.visible) m.aro.scale.set(late, 1, late);
      if (m.flecha.visible) { m.flecha.position.y = (opt('rol') ? 22 : 17) + Math.sin(ahora / 200 + i) * 1.6; m.flecha.rotation.y = ahora / 600; }
    });
  }
  const congeladas = new Map();
  const congelar = (i, s) => congeladas.set(i, (congeladas.get(i) || 0) + s);
  function actualizarFichas() {
    const rol = opt('rol');
    fichas.forEach((f, i) => {
      f.cartel.material = numero(E.dueno[i], E.tropas[i]);
      f.cartel.position.y = rol ? 19 : 14;
      if (congeladas.get(i) > 0) return;
      const n = Math.min(2, Math.max(1, E.tropas[i]));
      const clave = rol ? `r${E.dueno[i]}:${n}` : `f${E.dueno[i]}`;
      if (f.clave !== clave) {
        if (f.forma) f.g.remove(f.forma);
        f.forma = rol ? tropa(E.dueno[i], n, i) : formaFicha(E.dueno[i]);
        f.g.add(f.forma); f.clave = clave;
      }
      f.forma.position.y = E.sel === i ? 2.5 : 0;
    });
  }

  const mesa = window.crearMesa(THREE, CANNON, { escena, camara, controles, lienzo,
    borde: { x0: T.x[0], x1: T.x[nx - 1], z0: T.z[0], z1: T.z[ny - 1] } });
  mesa.sonido = () => sonar('dados');

  // efectos sobre el tablero: arco del ataque, sacudón de quien defiende, salto de la ficha que anexa
  const efectos = [];
  function efectoAtaque(u) {
    const p0 = fichas[u.o].g.position, p1 = fichas[u.t].g.position;
    const medio = p0.clone().lerp(p1, 0.5); medio.y += 14 + p0.distanceTo(p1) * 0.4;
    const curva = new THREE.QuadraticBezierCurve3(p0.clone().setY(p0.y + 10), medio, p1.clone().setY(p1.y + 10));
    const arco = new THREE.Mesh(new THREE.TubeGeometry(curva, 32, 0.7, 6),
      new THREE.MeshBasicMaterial({ color: '#EFE7D6', transparent: true, depthTest: false }));
    arco.renderOrder = 3; escena.add(arco);
    const f = fichas[u.t];
    if (opt('rol')) return batalla(u, curva, arco);
    efectos.push({ desde: performance.now(), dura: 750,
      paso: k => {
        arco.material.opacity = 1 - k;
        f.g.position.x = f.x0 + Math.sin(k * 45) * 1.6 * (1 - k);
        f.g.scale.setScalar(1.5 * (u.conquista ? 1 + 0.6 * Math.sin(Math.PI * Math.min(1, k * 1.6)) : 1));
      },
      fin: () => { escena.remove(arco); arco.geometry.dispose(); arco.material.dispose(); f.g.position.x = f.x0; f.g.scale.setScalar(1.5); } });
  }

  // en modo rol: un muñequito salta al ataque, se levanta polvareda, caen los que pierden y quien anexa clava la bandera
  const polvo = new THREE.MeshStandardMaterial({ color: '#B8A88E', transparent: true, roughness: 1 });
  function batalla(u, curva, arco) {
    const fo = fichas[u.o], ft = fichas[u.t];
    congelar(u.o, 1); congelar(u.t, 1);
    const guerrero = muneco(u.a, u.o * 10); guerrero.scale.setScalar(1.5); escena.add(guerrero);
    const nubes = Array.from({ length: 7 }, (_, k) => {
      const s = new THREE.Mesh(BOLA, polvo.clone()); s.visible = false;
      s.position.copy(ft.g.position).add(new THREE.Vector3(Math.cos(k) * 4, 3, Math.sin(k) * 4)); escena.add(s); return s;
    });
    let bandera = null;
    if (u.conquista) {
      bandera = new THREE.Group();
      const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 16, 6), MAT.oscuro); palo.position.y = 8; bandera.add(palo);
      const tex = new THREE.CanvasTexture(trama(u.a)); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1.5, 1); tex.colorSpace = THREE.SRGBColorSpace;
      const pano = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
      pano.position.set(4, 13.5, 0); bandera.add(pano);
      bandera.position.copy(ft.g.position); bandera.visible = false; escena.add(bandera);
    }
    const caen = (f, n) => f.clave && f.clave[0] === 'r' ? f.forma.children.slice(0, n) : [];
    const caidosT = caen(ft, u.pd), caidosO = caen(fo, u.pa);
    efectos.push({ desde: performance.now(), dura: 1300,
      paso: k => {
        arco.material.opacity = Math.max(0, 1 - k * 2);
        const v = Math.min(1, k / 0.35);
        guerrero.position.copy(curva.getPoint(v)).setY(curva.getPoint(v).y - 10 + Math.sin(Math.PI * v) * 6);
        guerrero.visible = k < 0.75;
        const p = Math.max(0, (k - 0.3) / 0.4);
        nubes.forEach((s, j) => { s.visible = k > 0.3 && k < 0.95; s.scale.setScalar(1 + p * (2 + j % 3)); s.material.opacity = Math.max(0, 0.8 - p * 0.8); s.position.y = ft.g.position.y + 3 + p * 5; });
        const caida = Math.min(1, Math.max(0, (k - 0.4) / 0.25));
        [...caidosT, ...caidosO].forEach(m => { m.rotation.x = -1.5 * caida; m.position.y = -0.3 * caida; });
        ft.g.position.x = ft.x0 + Math.sin(k * 50) * 1.2 * Math.max(0, 0.6 - k);
        if (bandera) { bandera.visible = k > 0.6; bandera.scale.setScalar(1.5 * Math.min(1, (k - 0.6) * 6)); }
      },
      fin: () => {
        [arco, guerrero, ...nubes, ...(bandera ? [bandera] : [])].forEach(o => escena.remove(o));
        arco.geometry.dispose(); arco.material.dispose();
        ft.g.position.x = ft.x0;
        congelar(u.o, -1); congelar(u.t, -1);
        pintar();
      } });
  }

  let giroDados = null, ocultarTirada = null;
  function mostrarTirada(u) {
    const el = $('#tirada'), n = Math.min(u.A.length, u.B.length);
    const fila = (rotulo, vs, pierde) => `<div class="dados"><span class="rotulo">${rotulo}</span>${vs.map((v, k) => `<span class="dado" data-v="${v}"${pierde(v, k) ? ' data-pierde="1"' : ''}></span>`).join('')}</div>`;
    el.innerHTML = `<p><b>${L[u.o].n}</b> ataca a <b>${L[u.t].n}</b></p>`
      + fila('Ataque', u.A, (v, k) => k < n && v <= u.B[k]) + fila('Defensa', u.B, (v, k) => k < n && v < u.A[k]) + '<p class="res"></p>';
    el.classList.remove('oculto');
    clearInterval(giroDados); clearTimeout(ocultarTirada);
    let k = 0;
    const dados = el.querySelectorAll('.dado');
    dados.forEach(d => { d.textContent = 1 + Math.floor(Math.random() * 6); });
    giroDados = setInterval(() => {
      k++;
      if (k < 7) { dados.forEach(d => { d.textContent = 1 + Math.floor(Math.random() * 6); }); return; }
      clearInterval(giroDados);
      dados.forEach(d => { d.textContent = d.dataset.v; if (d.dataset.pierde) d.classList.add('pierde'); });
      el.querySelector('.res').textContent = u.conquista ? `${L[u.t].n} pasa a los ${ALIANZAS[u.a].corto}.`
        : `El ataque pierde ${u.pa}, la defensa pierde ${u.pd}.`;
      ocultarTirada = setTimeout(() => el.classList.add('oculto'), 1800);
    }, 55);
  }

  let ocultarAnuncio = null;
  function anunciar(antetitulo, titulo, texto) {
    const el = $('#anuncio');
    el.innerHTML = `<p class="sub">${antetitulo}</p><h1>${titulo}</h1><p>${texto}</p>`;
    el.classList.remove('oculto');
    clearTimeout(ocultarAnuncio);
    ocultarAnuncio = setTimeout(() => el.classList.add('oculto'), 2600);
  }

  let sucio = true;
  function pintar() { sucio = true; }
  function redimensionar() {
    const r = lienzo.parentElement.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camara.aspect = r.width / r.height; camara.updateProjectionMatrix();
  }
  addEventListener('resize', () => { redimensionar(); actualizar(); });
  redimensionar();
  function cuadro() {
    requestAnimationFrame(cuadro);
    if (sucio) { dibujarTextura(); actualizarFichas(); sucio = false; }
    const ahora = performance.now();
    for (let n = efectos.length - 1; n >= 0; n--) {
      const ef = efectos[n], k = (ahora - ef.desde) / ef.dura;
      if (k >= 1) { ef.fin(); efectos.splice(n, 1); } else ef.paso(k);
    }
    const sopla = mesa.viento;
    fichas.forEach((f, i) => { f.g.rotation.z = sopla ? Math.sin(ahora / 90 + i) * 0.14 * sopla : 0; });
    marcar(ahora);
    controles.update();
    mesa.paso();
    renderer.render(escena, camara);
  }

  // ---------- selección con el puntero ----------
  const rayo = new THREE.Raycaster(), puntero = new THREE.Vector2();
  function locEn(ev) {
    const r = lienzo.getBoundingClientRect();
    puntero.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
    rayo.setFromCamera(puntero, camara);
    const hit = rayo.intersectObject(terreno)[0];
    if (!hit) return -1;
    const [px, py] = aPix([axLon(hit.point.x), azLat(hit.point.z)]);
    return caminos.findIndex(p => tx.isPointInPath(p, px, py));
  }
  let abajo = null;
  lienzo.addEventListener('pointerdown', ev => { abajo = [ev.clientX, ev.clientY]; });
  lienzo.addEventListener('pointerup', ev => {
    if (!abajo || Math.hypot(ev.clientX - abajo[0], ev.clientY - abajo[1]) > 5 || ev.button !== 0) return;
    const i = locEn(ev);
    if (i >= 0) tocar(i, ev.shiftKey);
  });
  let ultimoHover = 0;
  const tip = $('#tip');
  lienzo.addEventListener('pointermove', ev => {
    if (performance.now() - ultimoHover < 70) return;
    ultimoHover = performance.now();
    const i = (abajo && ev.buttons) || E.lanzando ? -1 : locEn(ev);
    if (i < 0) { tip.style.display = 'none'; return; }
    const d = E.dueno[i], r = lienzo.getBoundingClientRect();
    tip.innerHTML = `<b>${L[i].n}</b><br>Región ${L[i].r}<br>Población (OSM): ${miles(L[i].pob)}<br>${d < 0 ? 'Autónoma' : ALIANZAS[d].nombre}: ${E.tropas[i]} ejércitos<br>Limita con ${vec[i].length} localidades`;
    tip.style.display = 'block';
    tip.style.left = Math.min(ev.clientX - r.left + 16, r.width - 270) + 'px';
    tip.style.top = (ev.clientY - r.top + 16) + 'px';
  });
  lienzo.addEventListener('pointerleave', () => { tip.style.display = 'none'; });

  function blancos() {
    if (E.sel < 0) return [];
    if (E.fase === 'ataque') return vec[E.sel].filter(t => puedeAtacar(E.sel, t));
    if (E.fase === 'reagrupar' && E.disp[E.sel] > 0) return vec[E.sel].filter(t => E.dueno[t] === E.actual);
    return [];
  }

  function tocar(i, mucho) {
    if (E.terminado || E.actual !== E.humano || E.iaJugando || E.rafaga || E.lanzando || E.enTutorial) return;
    const a = E.humano;
    if (E.fase === 'refuerzos') {
      if (E.dueno[i] === a && E.porColocar > 0) colocar(i, mucho ? Math.min(5, E.porColocar) : 1);
    } else if (E.fase === 'ataque') {
      if (E.dueno[i] === a) { E.sel = E.sel === i || E.tropas[i] < 2 ? -1 : i; toc(); if (E.sel >= 0) enfocar(E.sel); }
      else if (E.sel >= 0 && puedeAtacar(E.sel, i)) {
        atacar(E.sel, i).then(() => { if (E.sel >= 0 && E.tropas[E.sel] < 2) E.sel = -1; actualizar(); });
      }
    } else if (E.fase === 'reagrupar') {
      if (E.dueno[i] !== a) return;
      if (E.sel >= 0 && E.sel !== i && vec[E.sel].includes(i) && E.disp[E.sel] > 0) mover(E.sel, i, mucho ? E.disp[E.sel] : 1);
      else { E.sel = E.sel === i ? -1 : i; if (E.sel >= 0) enfocar(E.sel); }
    }
    pintar(); actualizar();
  }

  async function atacarHasta(o, t) {
    E.rafaga = true; actualizar();
    while (!E.terminado && puedeAtacar(o, t)) {
      await atacar(o, t); actualizar();
      await new Promise(r => setTimeout(r, opt('dados') ? 250 : 700));
    }
    E.rafaga = false;
    if (E.tropas[o] < 2) E.sel = -1;
    actualizar();
  }

  // ---------- cámara ----------
  const VISTA = { pos: camara.position.clone(), mira: controles.target.clone() };
  const ARRIBA = new THREE.Vector3(0, 1, 0);
  function acercar(f) {
    const d = camara.position.clone().sub(controles.target);
    const largo = Math.max(controles.minDistance, Math.min(controles.maxDistance, d.length() * f));
    mesa.moverCamara(controles.target.clone().add(d.setLength(largo)), controles.target.clone(), 350);
  }
  // al elegir de dónde salir, la cámara encuadra esa localidad y sus blancos
  function enfocar(i) {
    const lugares = [i, ...blancos()].map(t => fichas[t].g.position);
    const centro = lugares.reduce((c, p) => c.add(p), new THREE.Vector3()).divideScalar(lugares.length);
    const radio = Math.max(...lugares.map(p => p.distanceTo(centro)));
    const dir = camara.position.clone().sub(controles.target).normalize();
    mesa.moverCamara(centro.clone().addScaledVector(dir, Math.max(330, radio * 3.2)), centro, 600);
  }
  $('#c-acercar').onclick = () => acercar(0.7);
  $('#c-alejar').onclick = () => acercar(1.4);
  $('#c-general').onclick = () => mesa.moverCamara(VISTA.pos.clone(), VISTA.mira.clone(), 600);
  addEventListener('keydown', ev => {
    if (document.activeElement.matches('input, select, textarea') || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key.toLowerCase();
    const adelante = controles.target.clone().sub(camara.position).setY(0).normalize();
    const derecha = new THREE.Vector3().crossVectors(adelante, ARRIBA);
    const correr = (v, n) => { v.multiplyScalar(n); camara.position.add(v); controles.target.add(v); };
    if (k === 'arrowup' || k === 'w') correr(adelante, 30);
    else if (k === 'arrowdown' || k === 's') correr(adelante, -30);
    else if (k === 'arrowright' || k === 'd') correr(derecha, 30);
    else if (k === 'arrowleft' || k === 'a') correr(derecha, -30);
    else if (k === 'q' || k === 'e') camara.position.sub(controles.target).applyAxisAngle(ARRIBA, k === 'q' ? 0.12 : -0.12).add(controles.target);
    else if (k === '+' || k === '=') acercar(0.8);
    else if (k === '-') acercar(1.25);
    else if (k === 'r') $('#c-general').onclick();
    else return;
    ev.preventDefault();
  });

  // ---------- pantalla ----------
  const DIBUJO = {
    'caldén': '<path d="M20 37V21" stroke-width="3"/><path d="M5 21c2-9 8-13 15-13s13 4 15 13c-5 2-10 3-15 3s-10-1-15-3z" fill="currentColor" stroke="none"/>',
    molino: '<path d="M14 38L20 15L26 38M16 30h8"/><circle cx="20" cy="13" r="2" fill="currentColor"/><path d="M20 13V2M20 13H31M20 13L28 5M20 13L12 5M20 13H9"/>',
    tranquera: '<path d="M5 12v24M35 12v24M5 16h30M5 24h30M5 32h30M5 32L35 16"/>',
    'comodín': '<circle cx="20" cy="20" r="13"/><path d="M20 7v26M7 20h26"/>',
  };
  const simbolo = s => `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${DIBUJO[s]}</svg>`;
  function objetivoCorto(a) {
    const o = E.objetivos[a];
    return o.tipo === 'destruir' ? `Destruir a los ${ALIANZAS[o.blanco].corto}` : `Completar ${o.regs[0]} y ${o.regs[1]}, con ${MINIMO_REGIONES} localidades`;
  }

  function actualizar() {
    pintar();
    const a = E.actual, mio = a === E.humano && !E.terminado, empezada = E.ronda > 0;
    const fases = { refuerzos: 'Refuerzos', ataque: 'Ataque', reagrupar: 'Reagrupar' };
    ['#lado', '#abajo'].forEach(s => $(s).classList.toggle('oculto', !empezada));
    $('#ronda').textContent = empezada ? `Ronda ${E.ronda}${E.ronda >= RONDA_SISMO_DESDE ? ', puede llegar el sismo' : ''}` : 'Partida sin empezar';
    $('#turno-quien').textContent = empezada ? `Turno ${Math.max(1, E.turnos)}: ${ALIANZAS[a].corto}${a === E.humano ? ' (vos)' : ''}` : 'Turno';
    $('#turno-fase').textContent = E.terminado ? 'Partida terminada' : !empezada ? '' : fases[E.fase] + (E.fase === 'refuerzos' ? `, ${E.porColocar} por ubicar` : '');
    $('#marcador').innerHTML = TODAS.map(b => `<div class="ficha-hud${b === a && empezada && !E.terminado ? ' turno' : ''}${cuenta(b) ? '' : ' fuera'}">
        <img src="${ALIANZAS[b].icono}" alt=""><span>${ALIANZAS[b].corto}${b === E.humano && empezada ? ' <span class="vos">(vos)</span>' : E.nombres[b] ? `<span class="quien">, ${E.nombres[b]}</span>` : ''}${b === a && empezada && !E.terminado ? ', juega' : ''}</span>
        <small>${cuenta(b)} loc., ${ejercitos(b)} ej., ${E.mano[b].length} tarj.</small></div>`).join('')
      + `<div class="ficha-hud sin-icono"><span>Autónomas</span><small>${cuenta(-1)} loc., ${ejercitos(-1)} ej.</small></div>`;

    let acc = '';
    const piensa = { refuerzos: 'reparte sus refuerzos', ataque: 'mira por dónde atacar', reagrupar: 'acomoda sus ejércitos' };
    if (!mio) acc = E.terminado ? '<p>La partida terminó.</p>'
      : `<p>Juegan los ${ALIANZAS[a].nombre}.</p><p class="sub">Un momento: ${E.nombres[a]} ${piensa[E.fase]}.</p>`;
    else if (E.enTutorial) acc = '<p>Seguí el tutorial; tu turno arranca al terminarlo.</p>';
    else if (E.iaJugando) acc = '<p>La IA está jugando tu turno.</p>';
    else if (E.lanzando && !E.rafaga) acc = '<p>Arrastrá sobre la bandeja y soltá para tirar los dados. Con la barra espaciadora se tiran solos.</p>';
    else if (E.rafaga) acc = `<p>Atacando ${L[E.ultimaTirada.t].n} hasta anexarla o quedarte con un ejército.</p>`;
    else if (E.fase === 'refuerzos') {
      acc = `<p>Tenés <b>${E.porColocar}</b> ejércitos para ubicar. Tocá una localidad tuya (las marca un aro de luz) para sumarle uno; con Mayús sumás cinco.</p>
        <div class="botones"><button class="principal" id="b-fase" ${E.porColocar ? 'disabled' : ''}>Pasar al ataque</button><button id="b-deshacer" ${E.puestos.length ? '' : 'disabled'}>Deshacer el último</button><button id="b-ia">Que la IA juegue mi turno</button></div>`;
    } else if (E.fase === 'ataque') {
      const bl = blancos();
      acc = E.sel < 0
        ? '<p>Tocá una localidad tuya marcada con un aro de luz y después la que querés atacar, marcada con una flecha.</p>'
        : `<p>Desde <b>${L[E.sel].n}</b> (${E.tropas[E.sel]}) podés atacar a:</p><div class="blancos">${bl.map(t => `<button data-t="${t}">${L[t].n} (${E.tropas[t]}, ${nombreDe(E.dueno[t])})</button>`).join('') || '<p>ninguna, por la carta, un pacto o porque no hay vecinas ajenas.</p>'}</div>`;
      const u = E.ultimaTirada;
      if (E.sel >= 0 && u && u.o === E.sel && puedeAtacar(u.o, u.t))
        acc += `<div class="botones"><button id="b-hasta">Seguir atacando ${L[u.t].n} hasta anexarla</button></div>`;
      acc += `<div class="botones"><button class="principal" id="b-fase">Pasar a reagrupar</button><button id="b-ia">Que la IA juegue mi turno</button></div>`;
    } else {
      acc = E.sel < 0
        ? '<p>Tocá una localidad tuya y después una vecina tuya para pasarle un ejército. Con Mayús pasás todos los que se pueden mover.</p>'
        : `<p>Desde <b>${L[E.sel].n}</b> podés mover ${E.disp[E.sel]} a:</p><div class="blancos">${blancos().map(t => `<button data-t="${t}">${L[t].n} (${E.tropas[t]})</button>`).join('') || '<p>ninguna.</p>'}</div>`;
      acc += `<div class="botones"><button class="principal" id="b-fase">Terminar el turno</button></div>`;
    }
    $('#acciones').innerHTML = '<h2>Qué hacer</h2>' + acc;
    const bf = $('#b-fase'); if (bf) bf.onclick = () => { sonar('aceptar'); pasarFase(); };
    const bd = $('#b-deshacer'); if (bd) bd.onclick = () => { const [i, n] = E.puestos.pop(); E.tropas[i] -= n; E.porColocar += n; toc(1); actualizar(); };
    const bi = $('#b-ia'); if (bi) bi.onclick = () => { sonar('aceptar'); E.sel = -1; jugarIA(); };
    const bh = $('#b-hasta'); if (bh) bh.onclick = () => atacarHasta(E.ultimaTirada.o, E.ultimaTirada.t);
    document.querySelectorAll('#acciones [data-t]').forEach(b => { b.onclick = ev => tocar(+b.dataset.t, ev.shiftKey); });

    $('#carta').innerHTML = `<div class="naipe ancha"><span class="tipo">Ronda ${E.ronda}</span><b>${CARTAS[E.carta].nombre}</b><small>${CARTAS[E.carta].texto}</small>${E.aviso ? `<small class="marca">${E.aviso}</small>` : ''}</div>`;

    const libre = mio && !E.iaJugando && !E.lanzando && !E.rafaga && !E.enTutorial;
    const mano = E.mano[E.humano];
    const valor = valorCanje(E.canjes[E.humano]);
    const puedeCanjear = libre && E.fase === 'refuerzos' && trio(mano);
    $('#mano').innerHTML = (empezada ? `<div class="naipe ancha objetivo" title="${textoObjetivo(E.humano)}"><span class="tipo">Objetivo secreto</span><b>${objetivoCorto(E.humano)}</b><small>O llegar a ${META} localidades.</small><span class="marca">Lo ves solo vos</span></div>` : '')
      + (mano.length ? mano.map(c => `<div class="naipe"><span class="tipo">Tarjeta de país</span>${simbolo(c.simbolo)}<b>${c.loc < 0 ? 'Comodín' : L[c.loc].n}</b><small>${c.simbolo}</small>${c.loc >= 0 && E.dueno[c.loc] === E.humano ? '<span class="marca">Tuya</span>' : ''}</div>`).join('')
        : '<div class="naipe vacia"><small>Sin tarjetas. Anexá una localidad en tu turno para sacar una.</small></div>')
      + `<div class="grupo tabla-oscura" style="width:150px; padding:7px 8px"><small>${mano.length} de 5. Tres iguales o tres distintas valen ${valor} ejércitos.</small>${puedeCanjear ? `<button class="principal" id="b-canje">Canjear por ${valor}</button>` : ''}</div>`;
    const bc = $('#b-canje'); if (bc) bc.onclick = () => { canjear(E.humano); actualizar(); };

    const otras = TODAS.filter(b => b !== E.humano && cuenta(b) > 0);
    $('#pactos').innerHTML = `<h2>Pactos</h2>
      ${otras.map(b => `<p>${ALIANZAS[b].corto}: ${enPacto(E.humano, b) ? `pacto hasta la ronda ${E.pactos[clavePacto(E.humano, b)]}` : 'sin pacto'}</p>`).join('')}
      <div class="botones">${libre ? otras.filter(b => !enPacto(E.humano, b) && !E.propuesto.has(b)).map(b => `<button data-pacto="${b}">Proponer a ${ALIANZAS[b].corto}</button>`).join('') : ''}</div>
      <p class="sub" style="font-size:13px">No atacarse durante ${RONDAS_PACTO} rondas.</p>`;
    document.querySelectorAll('[data-pacto]').forEach(b => { b.onclick = () => proponerPacto(+b.dataset.pacto); });
    // la barra y la mesa de abajo cambian de alto según la pantalla y lo que haya en juego: los cuadros se apoyan en ellas
    $('#app').style.setProperty('--techo', $('#hud').offsetHeight + 8 + 'px');
    $('#app').style.setProperty('--piso', $('#abajo').offsetHeight + 8 + 'px');

    $('#regiones').innerHTML = '<table>' + REG.map(R => {
      const ds = [...new Set(R.locs.map(i => E.dueno[i]))];
      const estado = ds.length === 1 && ds[0] >= 0 ? `completa: ${ALIANZAS[ds[0]].corto}` : TODAS.map(b => `${ALIANZAS[b].corto} ${R.locs.filter(i => E.dueno[i] === b).length}`).join(', ');
      return `<tr class="region"><td><img src="${D.iconos[R.nombre]}" alt="">${R.nombre}</td><td class="sub">${estado}</td><td class="n">+${R.bonus}</td></tr>`;
    }).join('') + '</table><p class="sub">El bono es la mitad de las localidades de la región que limitan con otra región, redondeado para arriba.</p>';
    $('#registro').innerHTML = E.registro.map(({ t, a }) => `<li>${a >= 0 ? `<img src="${ALIANZAS[a].icono}" alt="${ALIANZAS[a].corto}">` : '<span></span>'}<span>${t}</span></li>`).join('');
  }

  $('#b-menu').onclick = () => { $('#menu').classList.toggle('oculto'); actualizar(); };
  $('#b-seguir').onclick = () => $('#menu').classList.add('oculto');
  $('#b-tutorial').onclick = () => { $('#menu').classList.add('oculto'); tutorial(() => {}); };

  // ---------- tutorial: recorre la pantalla marcando cada parte ----------
  const PASOS = [
    ['#mano .objetivo', 'Tu objetivo', `Esta carta es tu objetivo secreto. Ganás si lo cumplís o si llegás a ${META} localidades. Desde la ronda ${RONDA_SISMO_DESDE} puede llegar el sismo: corta la partida y gana quien tenga más localidades.`],
    ['#hud', 'La barra de arriba', 'La ronda, de quién es el turno y en qué fase está. Al lado, cada Alianza con sus localidades, sus ejércitos y sus tarjetas. El borde verde y la palabra "juega" marcan a quien tiene el turno.'],
    ['#acciones', 'Refuerzos', 'Al empezar tu turno recibís ejércitos: la mitad de tus localidades, como mínimo 3, más el bono de cada región que tengas completa. Tocá tus localidades en el mapa para ubicarlos; con Mayús van de a cinco. Este cuadro siempre dice qué hacer.'],
    ['#acciones', 'Atacar', 'Tocá una localidad tuya con 2 ejércitos o más y después una vecina. La cámara va a la bandeja: arrastrá y soltá los dados. Se comparan de mayor a menor y el empate lo gana quien defiende. Si la dejás sin ejércitos la anexás y elegís cuántos pasan.'],
    ['#cronica', 'La crónica', 'Lo que va pasando en la partida, lo último arriba. Cada línea lleva el ícono de la Alianza que jugó; las de la ronda van sin ícono. Lo que ganás y lo que te sacan aparece además en un cartel abajo a la izquierda.'],
    ['#carta', 'La carta de la ronda', 'Cada ronda cae una carta de situación que cambia las reglas de esa ronda. Las dos primeras rondas son de neblina: solo se ataca a localidades autónomas.'],
    ['#mano', 'Tarjetas de país', 'Si anexaste en tu turno, al terminar el ataque sacás una tarjeta. Si la localidad es tuya, suma 2 ejércitos ahí. Tres del mismo dibujo o tres distintos se canjean por ejércitos durante los refuerzos; con cinco es obligatorio.'],
    ['#pactos', 'Pactos', `Podés proponerle a otra Alianza no atacarse durante ${RONDAS_PACTO} rondas. La IA acepta o no según cómo viene la partida.`],
    ['#acciones', 'Reagrupar', 'Después del ataque pasás ejércitos entre localidades tuyas que sean vecinas y terminás el turno. Si te atacan, tirás vos los dados de defensa en la bandeja.'],
    ['#b-menu', 'El menú', 'Acá están las opciones de la mesa, la música, el ritmo de la IA, las regiones con sus bonos y este tutorial otra vez.'],
  ];
  function tutorial(alTerminar) {
    const el = $('#tutorial');
    let k = 0;
    E.enTutorial = true;
    const cerrar = () => {
      document.querySelectorAll('.foco').forEach(f => f.classList.remove('foco'));
      el.classList.add('oculto'); E.enTutorial = false; actualizar(); alTerminar();
    };
    const mostrar = () => {
      actualizar();
      document.querySelectorAll('.foco').forEach(f => f.classList.remove('foco'));
      const [sel, titulo, texto] = PASOS[k], f = $(sel);
      f.classList.add('foco');
      el.innerHTML = `<p class="paso">Paso ${k + 1} de ${PASOS.length}</p><h2>${titulo}</h2><p>${texto}</p>
        <div class="botones"><button class="principal" id="t-sig">${k === PASOS.length - 1 ? 'Empezar a jugar' : 'Siguiente'}</button>${k ? '<button id="t-ant">Anterior</button>' : ''}<button id="t-saltar">Saltar el tutorial</button></div>`;
      el.classList.remove('oculto');
      const r = f.getBoundingClientRect(), caja = el.getBoundingClientRect();
      const arriba = r.top > innerHeight / 2;
      el.style.transform = 'none';
      el.style.left = Math.max(16, Math.min(innerWidth - caja.width - 16, r.left)) + 'px';
      el.style.top = Math.max(70, arriba ? r.top - caja.height - 14 : r.bottom + 14) + 'px';
      $('#t-sig').onclick = () => { sonar('aceptar'); if (++k < PASOS.length) mostrar(); else cerrar(); };
      if (k) $('#t-ant').onclick = () => { k--; mostrar(); };
      $('#t-saltar').onclick = cerrar;
    };
    mostrar();
  }

  $('#musica').onclick = () => { if (musica.paused) musica.play(); else musica.pause(); };
  $('#tema').onchange = () => { const sonaba = !musica.paused; musica.src = 'sonidos/musica/' + $('#tema').value; if (sonaba) musica.play(); };
  $('#o-rol').onchange = () => pintar();
  $('#o-brazo').onchange = () => mesa.mostrarBrazos(opt('brazo'));

  // las opciones quedan como las dejaste; en el teléfono los brazos arrancan apagados porque pesan
  const OPCIONES = 'teg-la-pampa-opciones', CAMPOS = ['#o-rol', '#o-dados', '#o-defensa', '#o-brazo', '#ritmo', '#tema'];
  const valorDe = el => el.type === 'checkbox' ? el.checked : el.value;
  const previas = JSON.parse(localStorage.getItem(OPCIONES));
  if (previas) CAMPOS.forEach(c => { if (c in previas) $(c)[$(c).type === 'checkbox' ? 'checked' : 'value'] = previas[c]; });
  else if (matchMedia('(max-width: 820px)').matches) $('#o-brazo').checked = false;
  musica.src = 'sonidos/musica/' + $('#tema').value;
  CAMPOS.forEach(c => $(c).addEventListener('change', () => localStorage.setItem(OPCIONES, JSON.stringify(Object.fromEntries(CAMPOS.map(k => [k, valorDe($(k))]))))));

  // ---------- tu mano: elección y vista previa ----------
  const estiloElegido = a => ({ piel: $('#b-piel').value, manga: $('#b-manga').value === 'alianza' ? ALIANZAS[a].color : $('#b-manga').value, puno: $('#b-puno').value, accesorio: $('#b-acc').value });
  const previa = new THREE.WebGLRenderer({ canvas: $('#vista-brazo'), antialias: true, alpha: true });
  const escenaPrevia = new THREE.Scene(), camPrevia = new THREE.PerspectiveCamera(30, 300 / 196, 1, 600);
  camPrevia.position.set(22, 40, 62); camPrevia.lookAt(0, 4, 0);
  escenaPrevia.add(new THREE.HemisphereLight('#F3EAD8', '#3E3226', 1.4));
  const solPrevia = new THREE.DirectionalLight('#FFF3DD', 2); solPrevia.position.set(40, 80, 60); escenaPrevia.add(solPrevia);
  let brazoPrevio = null;
  function armarPrevia() {
    if (brazoPrevio) escenaPrevia.remove(brazoPrevio.grupo);
    brazoPrevio = mesa.crearBrazo(estiloElegido(0)); escenaPrevia.add(brazoPrevio.grupo);
  }
  ['#b-piel', '#b-manga', '#b-puno', '#b-acc'].forEach(s => { $(s).onchange = armarPrevia; });
  armarPrevia();
  (function girarPrevia() {
    if ($('#inicio').classList.contains('oculto')) return;
    requestAnimationFrame(girarPrevia);
    const t = performance.now() / 1000;
    brazoPrevio.poner(new THREE.Vector3(-60, 14, 30), new THREE.Vector3(8 + Math.sin(t) * 3, 0, Math.cos(t * 0.8) * 3), Math.sin(t * 1.6) > 0.3);
    previa.render(escenaPrevia, camPrevia);
  })();

  // ---------- arranque ----------
  $('#eleccion').innerHTML = ALIANZAS.map((al, a) => `<button data-a="${a}"><img src="${al.icono}" alt=""><span>${al.nombre}<small>Ficha: ${al.forma}. Trama: ${al.trama}.</small></span></button>`).join('');
  document.querySelectorAll('#eleccion button').forEach(b => {
    b.onclick = () => {
      sonar('aceptar');
      E.humano = +b.dataset.a;
      $('#inicio').classList.add('oculto');
      // a la mesa se sientan siempre mujeres y varones, en lugares al azar
      const MUJERES = [
        { nombre: 'Nélida', mujer: true, aros: true, piel: '#E8C4A0', pelo: '#8A6A45', peinado: 'trenza', cuello: 'poncho', poncho: '#4A3A2A', utileria: 'cuaderno', puno: 'arremangada', accesorio: 'pulsera' },
        { nombre: 'Celeste', mujer: true, aros: true, piel: '#5E3B26', pelo: '#1E1610', peinado: 'melena', cuello: 'panuelo', panuelo: '#2F4A6B', utileria: 'mate', puno: 'guarda', accesorio: 'reloj' }];
      const VARONES = [
        { nombre: 'Ramón', piel: '#9C6B48', pelo: '#1E1610', cara: 'bigote', cuello: 'panuelo', panuelo: '#7A1F1F', utileria: 'mate', puno: 'liso', accesorio: 'anillo' },
        { nombre: 'Hugo', piel: '#C99B76', pelo: '#BDB6AA', cara: 'barba', cuello: 'poncho', poncho: '#6E2A2A', utileria: 'cuaderno', puno: 'liso', accesorio: 'reloj' }];
      const [m, v] = [mezclar(MUJERES), mezclar(VARONES)];
      const rivales = mezclar([m[0], v[0], mezclar([m[1], v[1]])[0]]).map((r, k) => ({ ...r, asiento: ['oeste', 'norte', 'este'][k] }));
      E.mesa = ALIANZAS.map((al, a) => {
        if (a === E.humano) return { a, estilo: estiloElegido(a), asiento: 'sur' };
        const r = rivales.shift(); E.nombres[a] = r.nombre;
        return { a, estilo: { ...r, manga: al.color, tinta: al.tinta, sombrero: ['gorra', 'boina', 'sombrero', 'gorro'][a] }, asiento: r.asiento };
      });
      sentar();
      nuevaRonda(); E.actual = 0;
      tutorial(empezarTurno);
    };
  });
  function sentar() {
    E.mesa.forEach(({ a, estilo, asiento }) => mesa.sumarBrazo(a, estilo, asiento));
    mesa.mostrarBrazos(opt('brazo'));
  }

  // partida guardada: se retoma al principio del turno en que quedó
  const guardada = JSON.parse(localStorage.getItem(GUARDADA));
  if (guardada) {
    const el = $('#guardada');
    el.innerHTML = `<p>Tenés una partida guardada: ronda ${guardada.ronda}, jugás con los ${ALIANZAS[guardada.humano].nombre}, ${guardada.dueno.filter(d => d === guardada.humano).length} localidades.</p>
      <div class="botones"><button class="principal" id="b-retomar">Seguir esa partida</button></div>
      <p class="sub">Si elegís una Alianza abajo, empieza una partida nueva y la guardada se pierde.</p>`;
    el.classList.remove('oculto');
    $('#b-retomar').onclick = () => {
      sonar('aceptar');
      Object.assign(E, guardada, { propuesto: new Set(), sel: -1, iaJugando: false, lanzando: false, rafaga: false, enTutorial: false });
      $('#inicio').classList.add('oculto');
      sentar();
      mesa.soltarCarta(CARTAS[E.carta].nombre, CARTAS[E.carta].texto, 0);
      mesa.efecto(E.carta);
      actualizar();
      if (E.actual !== E.humano) jugarIA();
    };
  }
  repartir();
  actualizar();
  requestAnimationFrame(cuadro);
}
