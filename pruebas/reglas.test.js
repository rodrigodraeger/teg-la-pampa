// Pruebas de las reglas. Se corren con: node pruebas/reglas.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Reglas = require('../reglas.js');

const ventana = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8'), { window: ventana });
const D = ventana.DATOS, NL = D.locs.length;

// azar con semilla, para que una prueba que falla se pueda repetir igual
function azarCon(semilla) {
  let s = semilla | 0;
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const nueva = semilla => { const azar = azarCon(semilla); return { ...Reglas.crear(D, azar), azar }; };
const entero = (azar, n) => Math.floor(azar() * n);

// mesa sin repartir: todo autónomo con 1 ejército y objetivos de regiones que nadie cumple
function vacia(semilla) {
  const J = nueva(semilla);
  J.E.dueno.fill(-1); J.E.tropas.fill(1);
  J.E.objetivos = J.TODAS.map(() => ({ tipo: 'regiones', regs: [D.regiones[0], D.regiones[1]] }));
  J.E.ronda = 3;
  return J;
}
const dar = (J, a, locs, tropas = 2) => locs.forEach(i => { J.E.dueno[i] = a; J.E.tropas[i] = tropas; });
const deRegion = nombre => D.locs.flatMap((l, i) => l.r === nombre ? [i] : []);
const vecinas = D.locs.map(() => []);
for (const [a, b] of D.ady) { vecinas[a].push(b); vecinas[b].push(a); }

function comodinesYRepetidas(J) {
  const todas = [...J.E.mazoPais, ...J.E.mano.flat()];
  const locs = todas.filter(c => c.loc >= 0).map(c => c.loc);
  return { comodines: todas.length - locs.length, repetidas: locs.length - new Set(locs).size };
}

// termina el turno de quien juega sin poner ni atacar, y devuelve lo que trajo el cambio de turno
function pasarTurno(J) { J.pasarFase(); J.pasarFase(); return J.pasarFase(); }

const pruebas = [];
const prueba = (nombre, fn) => pruebas.push([nombre, fn]);

prueba('valorCanje: 4, 7 y 10, y después de a 5', () => {
  const J = nueva(1);
  assert.deepEqual([0, 1, 2].map(J.valorCanje), [4, 7, 10]);
  for (let n = 3; n < 40; n++) assert.equal(J.valorCanje(n) - J.valorCanje(n - 1), 5, `canje ${n}`);
});

prueba('trio: tres iguales o tres distintas, y el comodín vale por cualquiera', () => {
  const J = nueva(2), simbolos = ['caldén', 'molino', 'tranquera', 'comodín'];
  const vale = tres => {
    const sin = tres.filter(s => s !== 'comodín');
    return sin.length < 3 || new Set(sin).size !== 2;
  };
  for (const x of simbolos) for (const y of simbolos) for (const z of simbolos) {
    const mano = [x, y, z].map(simbolo => ({ loc: 0, simbolo }));
    assert.equal(J.trio(mano) !== null, vale([x, y, z]), `${x}, ${y}, ${z}`);
  }
  // manos de cualquier largo: hay trío si alguna terna vale, y el que devuelve es una terna que vale
  for (let n = 0; n < 2000; n++) {
    const mano = Array.from({ length: entero(J.azar, 7) }, () => ({ loc: 0, simbolo: simbolos[entero(J.azar, 4)] }));
    let hay = false;
    for (let x = 0; x < mano.length; x++) for (let y = x + 1; y < mano.length; y++) for (let z = y + 1; z < mano.length; z++)
      hay ||= vale([mano[x], mano[y], mano[z]].map(c => c.simbolo));
    const t = J.trio(mano);
    assert.equal(t !== null, hay, JSON.stringify(mano.map(c => c.simbolo)));
    if (t) {
      assert.equal(new Set(t).size, 3);
      assert.ok(vale(t.map(k => mano[k].simbolo)));
    }
  }
});

prueba('tarjeta: los tres símbolos se reparten parejo entre las localidades', () => {
  const J = nueva(3), veces = {};
  for (let i = 0; i < NL; i++) { const c = J.tarjeta(i); assert.equal(c.loc, i); veces[c.simbolo] = (veces[c.simbolo] || 0) + 1; }
  assert.equal(Object.keys(veces).length, 3);
  assert.ok(Math.max(...Object.values(veces)) - Math.min(...Object.values(veces)) <= 1);
  assert.equal(J.tarjeta(-1).simbolo, 'comodín');
});

prueba('canjear: saca tres tarjetas, suma lo que vale el canje y encarece el próximo', () => {
  const J = nueva(4), E = J.E;
  J.repartir();
  for (let n = 0; n < 12; n++) {
    while (!J.trio(E.mano[1])) J.robar(1);
    const antes = E.mano[1].length, porColocar = E.porColocar, vale = J.valorCanje(E.canjes[1]);
    assert.equal(J.canjear(1), vale);
    assert.equal(E.mano[1].length, antes - 3);
    assert.equal(E.porColocar, porColocar + vale);
    assert.equal(E.canjes[1], n + 1);
  }
  E.mano[2] = [0, 1].map(J.tarjeta);
  assert.equal(J.canjear(2), 0);
  assert.equal(E.mano[2].length, 2);
});

prueba('robar: nunca más de dos comodines ni localidades repetidas entre mazo y manos', () => {
  for (let semilla = 0; semilla < 20; semilla++) {
    const J = nueva(100 + semilla), E = J.E;
    J.repartir();
    let rebarajadas = 0;
    for (let n = 0; n < 1500; n++) {
      const a = entero(J.azar, 4);
      if (!E.mazoPais.length) rebarajadas++;
      const tropas = E.tropas.slice(), { c, suya } = J.robar(a);
      assert.equal(suya, c.loc >= 0 && E.dueno[c.loc] === a);
      assert.deepEqual(E.tropas, tropas.map((t, i) => t + (suya && i === c.loc ? 2 : 0)));
      if (J.azar() < 0.6) J.canjear(a);
      const { comodines, repetidas } = comodinesYRepetidas(J);
      assert.ok(comodines <= 2, `semilla ${semilla}, robo ${n}: ${comodines} comodines`);
      assert.equal(repetidas, 0, `semilla ${semilla}, robo ${n}`);
    }
    assert.ok(rebarajadas > 3, 'la prueba tiene que pasar por varias rebarajadas');
  }
  // recién barajado y sin manos, el mazo tiene todas las localidades y los dos comodines
  const J = nueva(5);
  J.repartir(); J.robar(0);
  assert.equal(J.E.mazoPais.length + 1, NL + 2);
  assert.equal(comodinesYRepetidas(J).comodines, 2);
});

prueba('pactos: tres vueltas completas desde el turno de quien propone, en cualquier asiento y con cualquier E.primero', () => {
  const [x, y] = D.ady[0];
  const resto = D.locs.map((_, i) => i).filter(i => i !== x && i !== y);
  for (const primero of [0, 1, 2, 3]) for (const a of [0, 1, 2, 3]) for (const b of [0, 1, 2, 3]) {
    if (a === b) continue;
    const caso = `primero ${primero}, propone ${a} a ${b}`;
    const J = vacia(200), E = J.E;
    J.TODAS.forEach(c => dar(J, c, resto.slice(c * 5, c * 5 + 5)));
    dar(J, a, [x], 3); dar(J, b, [y], 3);
    E.humano = a; E.primero = primero; E.actual = a;
    J.empezarTurno();
    const ronda0 = E.ronda;
    const ataca = (o, t) => { E.carta = 'calma'; return J.puedeAtacar(o, t); };

    assert.ok(J.puedeProponer(b), caso);
    assert.ok(ataca(x, y), caso);
    assert.equal(J.proponerPacto(b), true, caso);
    assert.ok(!J.puedeProponer(b), caso);
    assert.ok(!ataca(x, y), caso);

    // turnos que empiezan con el pacto en pie, por Alianza
    const conPacto = J.TODAS.map(() => 0);
    for (;;) {
      pasarTurno(J);
      if (!J.enPacto(a, b)) break;
      conPacto[E.actual]++;
      if (E.actual === a) assert.ok(!ataca(x, y), caso);
      if (E.actual === b) assert.ok(!ataca(y, x), caso);
      assert.ok(conPacto[E.actual] <= J.RONDAS_PACTO, caso);
    }
    assert.equal(E.actual, a, `${caso}: vence al empezar el turno de quien propuso`);
    assert.equal(E.ronda, ronda0 + J.RONDAS_PACTO, caso);
    assert.deepEqual(conPacto, J.TODAS.map(c => c === a ? J.RONDAS_PACTO - 1 : J.RONDAS_PACTO), caso);
    assert.deepEqual(E.pactos, {}, caso);
    assert.ok(ataca(x, y), caso);

    // la espera: recién se puede volver a proponer ESPERA_PACTO rondas después de vencido
    const vencio = E.ronda;
    for (;;) {
      assert.equal(E.actual, a);
      if (J.puedeProponer(b)) break;
      for (let k = 0; k < J.TODAS.length; k++) pasarTurno(J);
    }
    assert.equal(E.ronda, vencio + J.ESPERA_PACTO, caso);
  }
});

prueba('pactos: no acepta quien tiene que destruir a quien propone, ni a quien va muy adelante', () => {
  const J = vacia(201), E = J.E, locs = D.locs.map((_, i) => i);
  dar(J, 0, locs.slice(0, 10)); dar(J, 1, locs.slice(10, 20)); dar(J, 2, locs.slice(20, 25));
  E.humano = 0; E.actual = 0;
  E.objetivos[1] = { tipo: 'destruir', blanco: 0 };
  assert.equal(J.proponerPacto(1), false);
  assert.ok(!J.enPacto(0, 1));
  assert.ok(!J.puedeProponer(1), 'una sola propuesta por turno');
  assert.equal(J.cuenta(0), J.cuenta(2) + 5);
  assert.equal(J.proponerPacto(2), false, 'cinco localidades de ventaja ya es demasiado');
  dar(J, 2, locs.slice(25, 26));
  assert.equal(J.proponerPacto(2), true, 'con cuatro de ventaja acepta');
  E.objetivos[1] = { tipo: 'destruir', blanco: 2 };
  dar(J, 0, locs.slice(30, 30 + J.META - 8 - J.cuenta(0))); dar(J, 1, locs.slice(60, 80));
  assert.equal(J.proponerPacto(1), false, 'no acepta a quien está a 8 de la meta');
});

prueba('refuerzos: la mitad de las localidades con piso de 3, más el bono de cada región completa', () => {
  const bono = nombre => Math.ceil(deRegion(nombre).filter(i => vecinas[i].some(v => D.locs[v].r !== nombre)).length / 2);
  const esperado = (E, a) => {
    const n = E.dueno.filter(d => d === a).length;
    return Math.max(3, Math.floor(n / 2)) + D.regiones.filter(r => deRegion(r).every(i => E.dueno[i] === a)).reduce((s, r) => s + bono(r), 0);
  };
  // sin región completa: de cada región, como mucho todas menos una
  const sinCompleta = D.regiones.flatMap(r => deRegion(r).slice(1));
  for (let n = 0; n <= sinCompleta.length; n++) {
    const J = vacia(300);
    dar(J, 2, sinCompleta.slice(0, n));
    assert.equal(J.refuerzos(2), Math.max(3, Math.floor(n / 2)), `${n} localidades`);
  }
  for (const r of D.regiones) {
    const J = vacia(301);
    dar(J, 1, deRegion(r));
    assert.ok(bono(r) > 0);
    assert.equal(J.REG.find(R => R.nombre === r).bonus, bono(r), r);
    assert.equal(J.refuerzos(1), Math.max(3, Math.floor(deRegion(r).length / 2)) + bono(r), r);
    J.E.dueno[deRegion(r)[0]] = 3;
    assert.equal(J.refuerzos(1), Math.max(3, Math.floor((deRegion(r).length - 1) / 2)), `${r} sin una localidad`);
  }
  for (let semilla = 0; semilla < 300; semilla++) {
    const J = vacia(310 + semilla), E = J.E;
    for (let i = 0; i < NL; i++) E.dueno[i] = entero(J.azar, 5) - 1;
    for (const r of D.regiones) if (J.azar() < 0.3) dar(J, entero(J.azar, 4), deRegion(r));
    for (const a of J.TODAS) assert.equal(J.refuerzos(a), esperado(E, a), `semilla ${semilla}, Alianza ${a}`);
  }
});

prueba('atacar: nadie queda en cero o en negativo y quien ataca conserva ejércitos', () => {
  const cartas = ['calma', 'viento', 'cenizas', 'rutas', 'neblina'];
  let ataques = 0, anexiones = 0;
  for (let semilla = 0; semilla < 400; semilla++) {
    const J = nueva(400 + semilla), E = J.E, azar = J.azar;
    J.repartir();
    for (let i = 0; i < NL; i++) E.tropas[i] = 1 + entero(azar, entero(azar, 2) ? 3 : 12);
    E.carta = cartas[semilla % cartas.length];
    E.actual = entero(azar, 4); E.humano = entero(azar, 4);
    for (let n = 0; n < 40 && !E.terminado; n++) {
      const posibles = [];
      for (let o = 0; o < NL; o++) for (const t of vecinas[o]) if (J.puedeAtacar(o, t)) posibles.push([o, t]);
      if (!posibles.length) break;
      const [o, t] = posibles[entero(azar, posibles.length)];
      const antes = { o: E.tropas[o], t: E.tropas[t], dueno: E.dueno[t], total: E.tropas.reduce((s, v) => s + v, 0) };
      const { base, da, dd } = J.dadosDeAtaque(o, t);
      assert.equal(base, Math.min(3, antes.o - 1));
      assert.equal(da, base + (E.carta === 'viento'));
      assert.equal(dd, Math.min(3, antes.t) + (E.carta === 'cenizas'));
      // una de cada cuatro tiradas va con los dados más parejos o más desparejos que pueden salir
      const forzada = entero(azar, 8);
      const A = forzada === 0 ? new Array(da).fill(6) : forzada === 1 ? new Array(da).fill(1) : J.tirar(da);
      const B = forzada === 0 ? new Array(dd).fill(1) : forzada === 1 ? new Array(dd).fill(6) : J.tirar(dd);
      const paso = J.resolverDados(o, t, A, B);
      const u = E.ultimaTirada, enJuego = Math.min(da, dd);
      assert.equal(u.pd, A.slice(0, enJuego).filter((v, k) => v > B[k]).length, 'el empate es de quien defiende');
      assert.equal(u.pa, Math.min(enJuego - u.pd, base));
      assert.equal(E.tropas[o], antes.o - u.pa);
      if (paso) {
        assert.ok(antes.t - u.pd <= 0);
        assert.equal(paso.tope, Math.min(3, E.tropas[o] - 1));
        assert.ok(paso.mueve >= 1 && paso.mueve <= paso.tope);
        const mueve = entero(azar, 2) ? paso.mueve : 1 + entero(azar, paso.tope);
        J.anexar(o, t, mueve);
        anexiones++;
        assert.equal(E.dueno[t], E.actual);
        assert.equal(E.tropas[t], mueve);
        assert.equal(E.tropas[o], antes.o - u.pa - mueve);
        assert.ok(u.conquista && E.anexoEnTurno);
      } else {
        assert.equal(E.dueno[t], antes.dueno);
        assert.equal(E.tropas[t], Math.max(1, antes.t - u.pd));
      }
      ataques++;
      assert.ok(E.tropas[o] >= 1, `semilla ${semilla}: quien ataca quedó con ${E.tropas[o]}`);
      assert.ok(E.tropas.every(v => v >= 1), `semilla ${semilla}: quedó una localidad con ${Math.min(...E.tropas)}`);
      assert.ok(E.tropas.reduce((s, v) => s + v, 0) <= antes.total);
    }
  }
  assert.ok(ataques > 5000 && anexiones > 500, `pocos casos: ${ataques} ataques, ${anexiones} anexiones`);
});

prueba('puedeAtacar: vecina ajena, con 2 o más, y lo que mandan la neblina y las rutas cortadas', () => {
  const J = vacia(500), E = J.E;
  const [o, t] = D.ady.find(([a, b]) => D.locs[a].r !== D.locs[b].r);
  const lejos = D.locs.findIndex((_, i) => i !== o && !vecinas[o].includes(i));
  dar(J, 0, [o], 2); dar(J, 1, [t]); dar(J, 1, [lejos]);
  E.actual = 0; E.carta = 'calma';
  assert.ok(J.puedeAtacar(o, t));
  assert.ok(!J.puedeAtacar(t, o), 'no es su turno');
  assert.ok(!J.puedeAtacar(o, lejos), 'no es vecina');
  E.tropas[o] = 1; assert.ok(!J.puedeAtacar(o, t), 'con un solo ejército no se ataca');
  E.tropas[o] = 2;
  E.carta = 'rutas'; assert.ok(!J.puedeAtacar(o, t), 'rutas cortadas: otra región');
  E.carta = 'neblina'; assert.ok(!J.puedeAtacar(o, t), 'neblina: solo autónomas');
  E.dueno[t] = -1; assert.ok(J.puedeAtacar(o, t));
  E.dueno[t] = 0; E.carta = 'calma'; assert.ok(!J.puedeAtacar(o, t), 'no se ataca a una propia');
});

prueba('cumplio: la meta de localidades', () => {
  const J = vacia(600), E = J.E, locs = D.locs.map((_, i) => i);
  E.objetivos[0] = { tipo: 'destruir', blanco: 1 };
  dar(J, 1, locs.slice(NL - 3));
  dar(J, 0, locs.slice(0, J.META - 1));
  assert.equal(J.cumplio(0), null);
  dar(J, 0, [J.META - 1]);
  assert.equal(J.cumplio(0), 'meta');
});

prueba('cumplio: las dos regiones completas y el mínimo de localidades', () => {
  const [r1, r2, r3] = D.regiones;
  const dos = [...deRegion(r1), ...deRegion(r2)], faltan = J => J.MINIMO_REGIONES - dos.length;
  const J = vacia(601), E = J.E;
  assert.ok(faltan(J) > 0 && J.MINIMO_REGIONES < J.META);
  E.objetivos[2] = { tipo: 'regiones', regs: [r1, r2] };
  dar(J, 2, dos); dar(J, 2, deRegion(r3).slice(0, faltan(J) - 1));
  assert.equal(J.cumplio(2), null, 'las dos regiones pero una localidad menos que el mínimo');
  dar(J, 2, [deRegion(r3)[faltan(J) - 1]]);
  assert.equal(J.cumplio(2), 'regiones');
  E.dueno[dos[0]] = 1; dar(J, 2, [deRegion(r3)[faltan(J)]]);
  assert.equal(J.cuenta(2), J.MINIMO_REGIONES);
  assert.equal(J.cumplio(2), null, 'el mínimo pero una región incompleta');
  assert.equal(J.cumplio(3), null);
});

prueba('cumplio y reasignarBlancos: destruir, y qué pasa si otra Alianza destruye a tu blanco', () => {
  const [o, t] = D.ady[0];
  const resto = D.locs.map((_, i) => i).filter(i => i !== o && i !== t);
  const armar = (atacante, objetivos) => {
    const J = vacia(602), E = J.E;
    dar(J, atacante, [o], 6); dar(J, 1, [t], 1);
    J.TODAS.forEach(c => { if (c !== 1) dar(J, c, resto.slice(c * 4, c * 4 + 4)); });
    Object.entries(objetivos).forEach(([c, blanco]) => { E.objetivos[c] = { tipo: 'destruir', blanco }; });
    E.actual = atacante; E.carta = 'calma';
    E.mano[1] = [5, 6, 7].map(J.tarjeta);
    return J;
  };
  const anexarLaUltima = J => {
    const { da, dd } = J.dadosDeAtaque(o, t);
    const paso = J.resolverDados(o, t, new Array(da).fill(6), new Array(dd).fill(1));
    return J.anexar(o, t, paso.mueve);
  };

  // la 0 destruye a su blanco: gana, y a la 2, que tenía el mismo blanco, le pasa a tocar la 0
  let J = armar(0, { 0: 1, 2: 1, 3: 2 }), r = anexarLaUltima(J);
  assert.equal(J.cuenta(1), 0);
  assert.equal(r.eliminada, true);
  assert.deepEqual(r.cambiadas, [2]);
  assert.deepEqual(J.E.objetivos.map(ob => ob.blanco), [1, undefined, 0, 2]);
  assert.equal(J.E.eliminadoPor[1], 0);
  assert.equal(r.logro, 'destruir');
  assert.equal(J.cumplio(2), null);
  assert.equal(J.E.terminado, true);
  assert.deepEqual([J.E.mano[0].length, J.E.mano[1].length], [3, 0], 'las tarjetas de la destruida pasan a quien la destruyó');

  // la 3 destruye al blanco de la 0: nadie gana todavía, y el blanco de la 0 pasa a ser la 3
  J = armar(3, { 0: 1 }); r = anexarLaUltima(J);
  assert.deepEqual(r.cambiadas, [0]);
  assert.equal(J.E.objetivos[0].blanco, 3);
  assert.equal(r.logro, null);
  assert.equal(r.unica, false);
  assert.equal(J.E.terminado, false);
  assert.equal(J.cumplio(0), null);
  J.E.eliminadoPor[3] = 0;
  assert.equal(J.cumplio(0), 'destruir');

  // quien destruye no se queda de blanco de sí misma
  J = vacia(603);
  J.E.objetivos = [1, 0, 1, 1].map(blanco => ({ tipo: 'destruir', blanco }));
  assert.deepEqual(J.reasignarBlancos(1, 2), [0, 3]);
  assert.deepEqual(J.E.objetivos.map(ob => ob.blanco), [2, 0, 1, 2]);

  // sin objetivo cumplido, gana quien queda como única Alianza
  J = vacia(604);
  dar(J, 2, [o], 6); dar(J, 1, [t], 1);
  J.E.actual = 2; J.E.carta = 'calma';
  r = anexarLaUltima(J);
  assert.deepEqual([r.logro, r.unica, J.E.terminado], [null, true, true]);
});

prueba('repartir: 15 localidades con 2 ejércitos por Alianza y objetivos que se pueden cumplir', () => {
  for (let semilla = 0; semilla < 200; semilla++) {
    const J = nueva(700 + semilla), E = J.E;
    J.repartir();
    for (const a of J.TODAS) {
      assert.equal(J.cuenta(a), 15);
      assert.equal(J.ejercitos(a), 30);
      const ob = E.objetivos[a];
      if (ob.tipo === 'destruir') assert.ok(ob.blanco !== a && J.TODAS.includes(ob.blanco), `semilla ${semilla}`);
      else assert.ok(ob.regs.length === 2 && ob.regs[0] !== ob.regs[1] && ob.regs.every(r => D.regiones.includes(r)), `semilla ${semilla}`);
      assert.equal(J.cumplio(a), null);
    }
    E.dueno.forEach((d, i) => { if (d < 0) assert.equal(E.tropas[i], D.locs[i].ej); });
    const pares = E.objetivos.filter(ob => ob.tipo === 'regiones').map(ob => [...ob.regs].sort().join());
    assert.equal(new Set(pares).size, pares.length, 'dos Alianzas no comparten el mismo par de regiones');
  }
});

prueba('sorteo del primer turno: abre cualquiera de las cuatro y la vuelta sigue el orden de la mesa', () => {
  const abrieron = new Set();
  for (let semilla = 0; semilla < 200; semilla++) {
    const J = nueva(800 + semilla), E = J.E;
    J.repartir(); J.sortearPrimero();
    assert.equal(E.actual, E.primero);
    abrieron.add(E.primero);
    J.nuevaRonda(); J.empezarTurno();
    assert.deepEqual([E.ronda, E.turnos, E.carta], [1, 1, 'neblina']);
    for (let k = 1; k <= 8; k++) {
      pasarTurno(J);
      assert.equal(E.actual, (E.primero + k) % J.TODAS.length);
      assert.equal(E.ronda, 1 + Math.floor(k / J.TODAS.length));
      assert.equal(E.turnos, 1 + k);
    }
  }
  assert.deepEqual([...abrieron].sort(), [0, 1, 2, 3]);
});

prueba('siguienteTurno: saltea a quien no tiene localidades y suma la ronda al volver a quien abre', () => {
  const locs = D.locs.map((_, i) => i);
  for (const primero of [0, 1, 2, 3]) for (const actual of [0, 1, 2, 3]) for (let vivas = 1; vivas < 16; vivas++) {
    if (!(vivas >> actual & 1)) continue;
    const J = vacia(900), E = J.E, n = J.TODAS.length;
    J.TODAS.forEach(c => { if (vivas >> c & 1) dar(J, c, locs.slice(c * 6, c * 6 + 6 + c)); });
    E.primero = primero; E.actual = actual;
    const pasos = [1, 2, 3, 4].find(k => vivas >> (actual + k) % n & 1);
    const pasaPorQuienAbre = [1, 2, 3, 4].slice(0, pasos).some(k => (actual + k) % n === primero);
    const ronda = E.ronda, turnos = E.turnos, r = J.siguienteTurno();
    const caso = `primero ${primero}, actual ${actual}, vivas ${vivas.toString(2)}`;
    assert.equal(E.actual, (actual + pasos) % n, caso);
    assert.equal(E.ronda, ronda + pasaPorQuienAbre, caso);
    assert.equal(r.ronda !== undefined, pasaPorQuienAbre, caso);
    assert.equal(E.turnos, turnos + 1, caso);
    assert.equal(E.fase, 'refuerzos', caso);
    assert.equal(r.turno.refuerzos, J.refuerzos(E.actual), caso);
    assert.equal(E.porColocar, r.turno.refuerzos + r.turno.canje, caso);
  }
});

prueba('pasarFase: refuerzos, ataque y reagrupar; la tarjeta solo si hubo anexión', () => {
  const J = nueva(1000), E = J.E;
  J.repartir(); J.sortearPrimero(); J.nuevaRonda(); J.empezarTurno();
  const a = E.actual;
  assert.deepEqual(J.pasarFase(), {});
  assert.equal(E.fase, 'ataque');
  assert.equal(J.pasarFase().robo, undefined);
  assert.equal(E.fase, 'reagrupar');
  assert.equal(E.mano[a].length, 0);
  assert.deepEqual(E.disp, E.tropas.map((t, i) => E.dueno[i] === a ? t - 1 : 0));
  J.pasarFase();
  for (let k = 1; k < J.TODAS.length; k++) pasarTurno(J);
  assert.deepEqual([E.actual, E.fase], [a, 'refuerzos']);
  J.pasarFase(); E.anexoEnTurno = true;
  const { robo } = J.pasarFase();
  assert.deepEqual(E.mano[a], [robo.c]);
  assert.deepEqual(E.disp, E.tropas.map((t, i) => E.dueno[i] === a ? t - 1 : 0), 'los 2 de una tarjeta propia ya se pueden mover');
});

prueba('ciclón y sismo: el turno 30 saca un tercio y la partida no pasa de la ronda del sismo', () => {
  let J = nueva(1100), E = J.E;
  J.repartir(); J.sortearPrimero(); J.nuevaRonda();
  E.tropas = E.tropas.map((_, i) => 1 + i % 9);
  E.turnos = J.TURNO_CICLON - 2;
  const antes = E.tropas.slice();
  assert.equal(J.empezarTurno().ciclon, false);
  assert.deepEqual(E.tropas, antes);
  assert.equal(J.empezarTurno().ciclon, true);
  assert.deepEqual(E.tropas, antes.map(t => t > 2 ? t - Math.floor(t / 3) : t));

  for (let semilla = 0; semilla < 100; semilla++) {
    J = nueva(1101 + semilla); E = J.E;
    J.repartir();
    dar(J, 2, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    let r;
    do { r = J.nuevaRonda(); assert.ok(E.ronda <= J.RONDA_SISMO_MAX); } while (!E.terminado);
    assert.ok(E.ronda >= J.RONDA_SISMO_DESDE, `semilla ${semilla}: sismo en la ronda ${E.ronda}`);
    assert.equal(r.sismo, 2, 'gana quien tiene más localidades');
    assert.deepEqual(J.siguienteTurno(), {});
  }
});

function revisarMesa(J, donde) {
  const E = J.E;
  assert.ok(E.tropas.every(v => Number.isInteger(v) && v >= 1), `${donde}: una localidad con ${Math.min(...E.tropas)} ejércitos`);
  assert.ok(E.dueno.every(d => d >= -1 && d < J.TODAS.length), donde);
  const { comodines, repetidas } = comodinesYRepetidas(J);
  assert.ok(comodines <= 2 && repetidas === 0, `${donde}: ${comodines} comodines, ${repetidas} tarjetas repetidas`);
}

// una partida entera con las cuatro Alianzas en manos de la IA; devuelve quién ganó y por qué
function jugarPartida(semilla, claveNivel) {
  const J = nueva(semilla), E = J.E, N = J.NIVELES[claveNivel], donde = `partida ${semilla} (${claveNivel})`;
  J.repartir();
  E.humano = semilla % J.TODAS.length;
  J.sortearPrimero(); J.nuevaRonda(); J.empezarTurno();
  const tope = J.RONDA_SISMO_MAX * J.TODAS.length;
  let ganador, motivo;
  while (!E.terminado) {
    assert.ok(E.turnos <= tope, `${donde}: van ${E.turnos} turnos y no termina`);
    const a = E.actual;
    assert.ok(J.cuenta(a) > 0, `${donde}: juega una Alianza sin localidades`);
    J.iaColocar(a, N);
    assert.equal(E.porColocar, 0, donde);
    J.pasarFase();
    let anexadas = 0, mejor;
    for (let n = 0; !E.terminado && (mejor = J.iaElegirAtaque(a, N, n, anexadas)); n++) {
      assert.ok(J.puedeAtacar(...mejor), donde);
      const { da, dd } = J.dadosDeAtaque(...mejor);
      const paso = J.resolverDados(...mejor, J.tirar(da), J.tirar(dd));
      if (paso) {
        const r = J.anexar(...mejor, paso.mueve);
        anexadas++;
        if (r.logro || r.unica) { ganador = a; motivo = r.logro || 'única'; }
      }
      revisarMesa(J, donde);
    }
    if (E.terminado) break;
    J.pasarFase();
    J.iaReagrupar(a);
    revisarMesa(J, donde);
    const p = J.pasarFase();
    if (E.terminado) { ganador = p.ronda.sismo; motivo = 'sismo'; }
  }
  assert.ok(J.TODAS.includes(ganador), `${donde}: terminó sin ganador`);
  assert.ok(J.cuenta(ganador) > 0, donde);
  if (motivo === 'sismo') assert.equal(J.cuenta(ganador), Math.max(...J.TODAS.map(J.cuenta)), donde);
  else assert.equal(motivo === 'única' ? J.TODAS.filter(b => J.cuenta(b) > 0).length === 1 : J.cumplio(ganador) === motivo, true, donde);
  return { ganador, motivo, ronda: E.ronda, lugar: (ganador - E.primero + J.TODAS.length) % J.TODAS.length };
}

prueba('300 partidas IA contra IA: ninguna se cuelga y todas terminan con un ganador', () => {
  const niveles = Object.keys(nueva(0).NIVELES), motivos = {}, lugares = [0, 0, 0, 0];
  let rondas = 0;
  for (let n = 0; n < 300; n++) {
    const r = jugarPartida(5000 + n, niveles[n % niveles.length]);
    motivos[r.motivo] = (motivos[r.motivo] || 0) + 1;
    lugares[r.lugar]++;
    rondas += r.ronda;
  }
  return `ganó por ${Object.entries(motivos).map(([m, v]) => `${m} ${v}`).join(', ')}; ronda final promedio ${(rondas / 300).toFixed(1)}; ganadas según el lugar en la vuelta: ${lugares.join(', ')}`;
});

let fallas = 0;
for (const [nombre, fn] of pruebas) {
  const desde = Date.now();
  try {
    const nota = fn();
    console.log(`bien  ${nombre} (${Date.now() - desde} ms)${nota ? '\n      ' + nota : ''}`);
  } catch (error) {
    fallas++;
    console.log(`MAL   ${nombre}\n${error.stack}`);
  }
}
console.log(`\n${pruebas.length - fallas} de ${pruebas.length} pruebas bien.`);
process.exitCode = fallas ? 1 : 0;
