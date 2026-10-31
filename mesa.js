// Mesa con física: bandeja de dados, cartas de situación que caen, efectos de cada carta y brazos de quienes juegan.
window.crearMesa = function (THREE, CANNON, { escena, camara, controles, lienzo, borde }) {
  const Y = -4.05;
  const centroZ = (borde.z0 + borde.z1) / 2, ancho = borde.x1 - borde.x0, largo = borde.z1 - borde.z0;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  const mundo = new CANNON.World({ gravity: new CANNON.Vec3(0, -700, 0) });
  mundo.allowSleep = true;
  const matMesa = new CANNON.Material(), matPieza = new CANNON.Material();
  mundo.addContactMaterial(new CANNON.ContactMaterial(matMesa, matPieza, { friction: 0.35, restitution: 0.3 }));
  mundo.addContactMaterial(new CANNON.ContactMaterial(matPieza, matPieza, { friction: 0.25, restitution: 0.25 }));
  const estatico = (forma, x, y, z) => { const b = new CANNON.Body({ mass: 0, material: matMesa, shape: forma }); b.position.set(x, y, z); mundo.addBody(b); return b; };
  const piso = estatico(new CANNON.Plane(), 0, Y, 0);
  piso.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  estatico(new CANNON.Box(new CANNON.Vec3(ancho / 2, 2.02, largo / 2)), 0, -2.02, centroZ);

  // ---------- bandeja ----------
  const BAN = { x: borde.x1 + 110, z: borde.z1 - 60, w: 150, l: 110 };
  const bandeja = new THREE.Group(); bandeja.position.set(BAN.x, Y, BAN.z); escena.add(bandeja);
  const pano = new THREE.Mesh(new THREE.BoxGeometry(BAN.w, 1, BAN.l), new THREE.MeshStandardMaterial({ color: '#33402C', roughness: 1 }));
  pano.position.y = 0.5; bandeja.add(pano);
  const maderaB = new THREE.MeshStandardMaterial({ color: '#6B5038', roughness: 0.8 });
  for (const [w, l, x, z] of [[BAN.w + 8, 4, 0, -BAN.l / 2 - 2], [BAN.w + 8, 4, 0, BAN.l / 2 + 2], [4, BAN.l, -BAN.w / 2 - 2, 0], [4, BAN.l, BAN.w / 2 + 2, 0]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, 9, l), maderaB); p.position.set(x, 4.5, z); bandeja.add(p);
    estatico(new CANNON.Box(new CANNON.Vec3(w / 2, 60, l / 2)), BAN.x + x, Y + 60, BAN.z + z);
  }
  estatico(new CANNON.Box(new CANNON.Vec3(BAN.w / 2, 0.5, BAN.l / 2)), BAN.x, Y + 0.5, BAN.z);

  // ---------- dados ----------
  const LADO = 9;
  function caraDado(n, fondo, punto) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = fondo; g.fillRect(0, 0, 128, 128);
    g.fillStyle = punto;
    const P = { 1: [[64, 64]], 2: [[34, 34], [94, 94]], 3: [[30, 30], [64, 64], [98, 98]], 4: [[34, 34], [94, 34], [34, 94], [94, 94]],
      5: [[30, 30], [98, 30], [64, 64], [30, 98], [98, 98]], 6: [[34, 28], [94, 28], [34, 64], [94, 64], [34, 100], [94, 100]] }[n];
    P.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill(); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
  }
  // orden de caras de BoxGeometry: +x, -x, +y, -y, +z, -z; los opuestos suman 7
  const VALORES = [1, 6, 2, 5, 3, 4];
  const EJES = [V(1, 0, 0), V(-1, 0, 0), V(0, 1, 0), V(0, -1, 0), V(0, 0, 1), V(0, 0, -1)];
  const juegoClaro = VALORES.map(v => caraDado(v, '#EFE7D6', '#1A140E'));
  const juegoOscuro = VALORES.map(v => caraDado(v, '#1A140E', '#EFE7D6'));
  const geoDado = new THREE.BoxGeometry(LADO, LADO, LADO);
  let dados = [];

  function limpiarDados() {
    dados.forEach(d => { escena.remove(d.malla); mundo.removeBody(d.cuerpo); });
    dados = [];
  }
  function nuevoDado(ataque) {
    const malla = new THREE.Mesh(geoDado, ataque ? juegoClaro : juegoOscuro);
    escena.add(malla);
    const cuerpo = new CANNON.Body({ mass: 1, material: matPieza, shape: new CANNON.Box(new CANNON.Vec3(LADO / 2, LADO / 2, LADO / 2)),
      sleepSpeedLimit: 3, sleepTimeLimit: 0.25, linearDamping: 0.05, angularDamping: 0.08 });
    const d = { malla, cuerpo, ataque, enMundo: false };
    dados.push(d);
    return d;
  }
  function leer(d) {
    const q = d.malla.quaternion;
    let mejor = 0, alto = -2;
    EJES.forEach((e, k) => { const y = e.clone().applyQuaternion(q).y; if (y > alto) { alto = y; mejor = k; } });
    return { valor: VALORES[mejor], recto: alto > 0.92 };
  }

  // ---------- cámara ----------
  let viaje = null;
  function moverCamara(pos, mira, dura) {
    return new Promise(listo => { viaje = { p0: camara.position.clone(), m0: controles.target.clone(), pos, mira, t0: performance.now(), dura, listo }; });
  }

  // ---------- puntero sobre la bandeja ----------
  const rayo = new THREE.Raycaster(), ptr = new THREE.Vector2();
  function sobrePlano(ev, altura) {
    const r = lienzo.getBoundingClientRect();
    ptr.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
    rayo.setFromCamera(ptr, camara);
    const p = new THREE.Vector3();
    if (!rayo.ray.intersectPlane(new THREE.Plane(V(0, 1, 0), -altura), p)) return null;
    p.x = Math.max(BAN.x - BAN.w / 2 + 12, Math.min(BAN.x + BAN.w / 2 - 12, p.x));
    p.z = Math.max(BAN.z - BAN.l / 2 + 12, Math.min(BAN.z + BAN.l / 2 - 12, p.z));
    return p;
  }

  const aviso = document.getElementById('aviso-dados');
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  let mano = null;

  // tira nA dados de ataque y nB de defensa; con manual, el ataque se suelta arrastrando el puntero
  async function tirarDados(nA, nB, { manual, quien, defiende }) {
    limpiarDados();
    const guardado = { pos: camara.position.clone(), mira: controles.target.clone() };
    controles.enabled = false;
    await moverCamara(V(BAN.x - 10, Y + 165, BAN.z + 120), V(BAN.x, Y, BAN.z), 650);
    const A = Array.from({ length: nA }, () => nuevoDado(true)), B = Array.from({ length: nB }, () => nuevoDado(false));
    const mios = defiende ? B : A, ajenos = defiende ? A : B;
    const altura = Y + 38;
    mano = V(BAN.x - BAN.w / 4, altura, BAN.z + BAN.l / 4);
    const manoB = V(BAN.x + BAN.w / 4, altura, BAN.z - BAN.l / 6);
    const sostener = (lista, centro) => lista.forEach((d, k) => {
      d.malla.position.set(centro.x + (k - (lista.length - 1) / 2) * (LADO + 1.5), centro.y - 4, centro.z);
      d.malla.rotation.set(performance.now() / 400 + k, performance.now() / 530 + k * 2, 0);
    });
    let soltar;
    const muestras = [];
    if (manual) {
      aviso.textContent = defiende ? 'Te atacan. Arrastrá sobre la bandeja y soltá para defenderte. Barra espaciadora: tiro solo.' : 'Arrastrá sobre la bandeja y soltá para tirar. Barra espaciadora: tiro solo.';
      aviso.classList.remove('oculto');
      await new Promise(r => {
        soltar = r;
        const mov = ev => { const p = sobrePlano(ev, altura); if (p) { mano.copy(p); muestras.push([p.clone(), performance.now()]); if (muestras.length > 6) muestras.shift(); } };
        const arriba = () => { lienzo.removeEventListener('pointermove', mov); lienzo.removeEventListener('pointerup', arriba); removeEventListener('keydown', tecla); r(); };
        const tecla = ev => { if (ev.code === 'Space') { ev.preventDefault(); muestras.length = 0; arriba(); } };
        lienzo.addEventListener('pointermove', mov);
        lienzo.addEventListener('pointerup', arriba);
        addEventListener('keydown', tecla);
        const sigue = () => { if (soltar) { sostener(mios, mano); sostener(ajenos, manoB); if (brazoDe(quien)) brazoDe(quien).seguir(mano, true); requestAnimationFrame(sigue); } };
        sigue();
      });
      soltar = null;
      aviso.classList.add('oculto');
    } else {
      sostener(mios, mano); sostener(ajenos, manoB);
      if (brazoDe(quien)) brazoDe(quien).seguir(mano, true);
      await esperar(350);
    }
    let vel = V(220, -40, -160);
    if (muestras.length >= 2) {
      const [p0, t0] = muestras[0], [p1, t1] = muestras[muestras.length - 1];
      const v = p1.clone().sub(p0).divideScalar(Math.max(0.016, (t1 - t0) / 1000));
      if (v.length() > 40) vel = v.clampLength(120, 520).setY(-40);
    }
    const lanzar = (lista, centro, v) => lista.forEach((d, k) => {
      d.malla.position.set(centro.x + (k - (lista.length - 1) / 2) * (LADO + 1.5), centro.y - 4, centro.z);
      d.cuerpo.position.copy(d.malla.position); d.cuerpo.quaternion.copy(d.malla.quaternion);
      d.cuerpo.velocity.set(v.x * (0.9 + Math.random() * 0.2), v.y, v.z * (0.9 + Math.random() * 0.2));
      d.cuerpo.angularVelocity.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
      d.cuerpo.wakeUp(); mundo.addBody(d.cuerpo); d.enMundo = true;
    });
    lanzar(mios, mano, vel);
    lanzar(ajenos, manoB, V(-200 - Math.random() * 60, -40, 140 + Math.random() * 60));
    if (brazoDe(quien)) brazoDe(quien).seguir(mano, false);
    sonidoDados();
    for (let intento = 0; intento < 3; intento++) {
      const t0 = performance.now();
      while (performance.now() - t0 < 4000 && !dados.every(d => d.cuerpo.sleepState === CANNON.Body.SLEEPING)) await esperar(60);
      const torcidos = dados.filter(d => !leer(d).recto);
      if (!torcidos.length) break;
      torcidos.forEach(d => { d.cuerpo.wakeUp(); d.cuerpo.velocity.set(0, 120, 0); d.cuerpo.angularVelocity.set(15, 8, 12); });
    }
    const valores = lista => lista.map(d => leer(d).valor).sort((x, y) => y - x);
    const res = { A: valores(A), B: valores(B) };
    await esperar(900);
    await moverCamara(guardado.pos, guardado.mira, 550);
    controles.enabled = true;
    return res;
  }
  let sonidoDados = () => {};

  // ---------- cartas de situación ----------
  const PILA = V(borde.x0 + ancho * 0.22, Y, borde.z0 - 58);
  const cartas = [];
  function caraCarta(nombre, texto) {
    const c = document.createElement('canvas'); c.width = 360; c.height = 500;
    const g = c.getContext('2d');
    g.fillStyle = '#2B2219'; g.fillRect(0, 0, 360, 500);
    g.strokeStyle = '#A9C46C'; g.lineWidth = 6; g.strokeRect(14, 14, 332, 472);
    g.fillStyle = '#A9C46C'; g.font = '600 26px "Vollkorn SC"'; g.textAlign = 'center';
    g.fillText('Carta de situación', 180, 66);
    g.fillStyle = '#EFE7D6'; g.font = '700 40px "Vollkorn SC"';
    renglones(g, nombre, 300, 2).forEach((r, k) => g.fillText(r, 180, 150 + k * 46));
    g.font = '400 28px "Vollkorn SC"'; g.fillStyle = '#CDBFA6';
    renglones(g, texto, 290, 7).forEach((r, k) => g.fillText(r, 180, 270 + k * 34));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function renglones(g, texto, max, tope) {
    const out = []; let r = '';
    for (const p of texto.split(' ')) { const prueba = r ? r + ' ' + p : p; if (g.measureText(prueba).width > max && r) { out.push(r); r = p; } else r = prueba; }
    if (r) out.push(r);
    return out.slice(0, tope);
  }
  const dorso = (() => {
    const c = document.createElement('canvas'); c.width = 180; c.height = 250;
    const g = c.getContext('2d');
    g.fillStyle = '#5C4A36'; g.fillRect(0, 0, 180, 250);
    g.strokeStyle = '#2B2219'; g.lineWidth = 3;
    for (let k = -250; k < 250; k += 14) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 250, 250); g.stroke(); }
    g.fillStyle = '#EFE7D6'; g.font = '700 24px "Vollkorn SC"'; g.textAlign = 'center'; g.fillText('TEG La Pampa', 90, 132);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  })();
  const canto = new THREE.MeshStandardMaterial({ color: '#2B2219' });
  const CW = 36, CL = 50;
  const geoCarta = new THREE.BoxGeometry(CW, 0.8, CL);

  function soltarCarta(nombre, texto, quien) {
    const malla = new THREE.Mesh(geoCarta, [canto, canto, new THREE.MeshStandardMaterial({ map: caraCarta(nombre, texto), roughness: 0.8 }), dorso, canto, canto]);
    const cuerpo = new CANNON.Body({ mass: 0.4, material: matPieza, shape: new CANNON.Box(new CANNON.Vec3(CW / 2, 0.4, CL / 2)), linearDamping: 0.35, angularDamping: 0.4 });
    const desde = PILA.clone().add(V((Math.random() - 0.5) * 20, 90, (Math.random() - 0.5) * 16));
    cuerpo.position.set(desde.x, desde.y, desde.z);
    cuerpo.quaternion.setFromEuler(0.3 * (Math.random() - 0.5), Math.random() * 6, 0.3 * (Math.random() - 0.5));
    cuerpo.angularVelocity.set(0, (Math.random() - 0.5) * 3, 0);
    escena.add(malla); mundo.addBody(cuerpo);
    cartas.push({ malla, cuerpo });
    if (cartas.length > 7) { const v = cartas.shift(); escena.remove(v.malla); mundo.removeBody(v.cuerpo); v.malla.material[2].map.dispose(); }
    if (brazoDe(quien)) brazoDe(quien).seguir(desde.clone().setY(desde.y + 6), false);
  }

  // ---------- efectos de las cartas ----------
  const N = 1400;
  const posPart = new Float32Array(N * 3);
  const geoPart = new THREE.BufferGeometry(); geoPart.setAttribute('position', new THREE.BufferAttribute(posPart, 3));
  const matPart = new THREE.PointsMaterial({ color: '#BDB4A6', size: 1.8, transparent: true, opacity: 0.85, depthWrite: false });
  const particulas = new THREE.Points(geoPart, matPart); particulas.visible = false; particulas.frustumCulled = false;
  escena.add(particulas);
  let clima = null, temblor = 0, viento = 0;
  const azar = (a, b) => a + Math.random() * (b - a);
  function sembrar(k) { posPart.set([azar(borde.x0 - 60, borde.x1 + 60), azar(5, 160), azar(borde.z0 - 60, borde.z1 + 60)], k * 3); }

  function efecto(id) {
    escena.fog = null; particulas.visible = false; clima = null;
    if (id === 'neblina') escena.fog = new THREE.Fog('#5C4A36', 450, 1300);
    if (id === 'cenizas' || id === 'viento' || id === 'ciclon') {
      clima = id; particulas.visible = true;
      matPart.color.set(id === 'cenizas' ? '#8F887E' : '#C9B79A');
      matPart.size = id === 'cenizas' ? 1.6 : 1.3;
      for (let k = 0; k < N; k++) sembrar(k);
    }
    if (id === 'viento' || id === 'ciclon') {
      viento = 1;
      cartas.forEach(c => { c.cuerpo.wakeUp(); c.cuerpo.applyImpulse(new CANNON.Vec3(id === 'viento' ? 22 : 0, 6, id === 'ciclon' ? 18 : 0), new CANNON.Vec3(4, 0, 6)); });
    }
    if (id === 'sismo') {
      temblor = 1.6;
      [...cartas, ...dados.filter(d => d.enMundo)].forEach(c => { c.cuerpo.wakeUp(); c.cuerpo.velocity.set(azar(-30, 30), azar(80, 150), azar(-30, 30)); c.cuerpo.angularVelocity.set(azar(-6, 6), azar(-6, 6), azar(-6, 6)); });
    }
  }

  // ---------- brazos y personas ----------
  const recto = new THREE.CylinderGeometry(1, 1, 1, 24), bola = new THREE.SphereGeometry(1, 20, 14), cubo = new THREE.BoxGeometry(1, 1, 1);
  // perfiles de brazo y antebrazo (de abajo hacia arriba, entre -0.5 y 0.5): bíceps y músculo del antebrazo, muñeca fina
  const perfil = radios => new THREE.LatheGeometry(radios.map((r, k) => new THREE.Vector2(r, -0.5 + k / (radios.length - 1))), 22);
  const geoSup = perfil([1, 1.04, 1.02, 0.94, 0.86, 0.82]), geoInf = perfil([0.9, 1, 0.97, 0.86, 0.74, 0.66]);
  const R_SUP = 7, R_INF = 5.8;
  const unir = (malla, a, b, radio) => {
    const d = b.clone().sub(a), largo = d.length();
    malla.position.copy(a).addScaledVector(d, 0.5);
    malla.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    malla.scale.set(radio, largo, radio);
  };
  // guarda pampa: rombos escalonados entre dos filetes
  function guarda(fondo, dibujo, vueltas = 3) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = fondo; g.fillRect(0, 0, 128, 32);
    g.fillStyle = dibujo; g.fillRect(0, 2, 128, 3); g.fillRect(0, 27, 128, 3);
    for (let x = 16; x < 128; x += 32) for (let r = 0; r < 7; r++) {
      const w = (3 - Math.abs(r - 3)) * 3 + 3;
      g.fillStyle = dibujo; g.fillRect(x - w, 8 + r * 2.3, 2 * w, 2.4);
      if (w > 5) { g.fillStyle = fondo; g.fillRect(x - w + 4, 8 + r * 2.3, 2 * w - 8, 2.4); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(vueltas, 1); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const claro = hex => { const c = new THREE.Color(hex); return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.45; };
  // piel con manchas y poros dibujados: el color liso es lo que la hacía de maniquí
  const texPiel = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#F2F2F2'; g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 900; k++) {
      const v = 200 + Math.random() * 55 | 0;
      g.fillStyle = `rgba(${v},${v - 12},${v - 14},0.18)`;
      g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 9, 0, Math.PI * 2); g.fill();
    }
    for (let k = 0; k < 5000; k++) { g.fillStyle = 'rgba(120,80,70,0.22)'; g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const pielDe = hex => new THREE.MeshStandardMaterial({ color: hex, map: texPiel, bumpMap: texPiel, bumpScale: 3, roughness: 0.68 });
  const rosado = hex => pielDe(new THREE.Color(hex).lerp(new THREE.Color('#B5544A'), 0.16));
  // dedos de índice a meñique: x y z de la base, abertura, grosor, largo de cada falange y cuánto se doblan quietos
  const DEDOS = [[2.75, 7.6, -0.05, 0.8, [2.5, 1.7, 1.4], [0.22, 0.28, 0.14]], [0.92, 8.0, 0, 0.84, [2.8, 1.9, 1.5], [0.32, 0.38, 0.2]],
    [-0.92, 7.7, 0.04, 0.8, [2.6, 1.8, 1.4], [0.42, 0.48, 0.24]], [-2.6, 7.1, 0.1, 0.68, [2.0, 1.4, 1.15], [0.55, 0.58, 0.3]]];
  function crearBrazo(estilo) {
    const g = new THREE.Group();
    const piel = pielDe(estilo.piel), punta = rosado(estilo.piel);
    const una = new THREE.MeshStandardMaterial({ color: new THREE.Color(estilo.piel).lerp(new THREE.Color('#F4E4D8'), 0.55), roughness: 0.45 });
    const manga = new THREE.MeshStandardMaterial({ color: estilo.manga, roughness: 0.95 });
    const arremangada = estilo.puno === 'arremangada';
    const sup = new THREE.Mesh(geoSup, manga), inf = new THREE.Mesh(geoInf, arremangada ? piel : manga), codo = new THREE.Mesh(bola, manga);
    g.add(sup, inf, codo);
    // pliegues de la tela: anillos apenas más anchos que la manga, cerca del codo
    const pliegues = [[sup, 0.82], [inf, 0.14], [inf, 0.32]].filter(([m]) => m.material === manga).map(([m, t]) => {
      const p = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 6, 22), manga); g.add(p); return { m, t, p };
    });
    const mano = new THREE.Group();
    const parte = (geo, m, p, s, padre = mano) => { const b = new THREE.Mesh(geo, m); b.position.set(...p); b.scale.set(...s); padre.add(b); return b; };
    parte(bola, piel, [0, 0, 0], [2.4, 1.6, 2.6]);
    parte(bola, piel, [0, 0.05, 4.0], [3.9, 1.05, 4.2]);
    parte(bola, piel, [0, 0.3, 7.0], [4.0, 1.0, 1.5]);
    parte(bola, piel, [2.6, -0.3, 2.2], [1.6, 1.2, 2.4]);
    DEDOS.forEach(([x]) => parte(bola, piel, [x * 0.72, 1.12, 3.6], [0.32, 0.24, 2.7]).rotation.y = -x * 0.03);
    const juntas = [];
    const cadena = (padre, r, largos, reposo, cierre) => {
      let p = padre;
      largos.forEach((l, k) => {
        const piv = new THREE.Group(); piv.position.z = k ? largos[k - 1] : 0; p.add(piv);
        const f = new THREE.Mesh(new THREE.CapsuleGeometry(r * (1 - k * 0.09), l, 4, 12), k === largos.length - 1 ? punta : piel);
        f.rotation.x = Math.PI / 2; f.position.z = l / 2; f.scale.z = 0.86; piv.add(f);
        juntas.push({ piv, reposo: reposo[k], cierre: cierre[k] }); p = piv;
      });
      const l = largos[largos.length - 1], rr = r * (1 - (largos.length - 1) * 0.09);
      parte(bola, una, [0, rr * 0.7, l * 0.62], [rr * 0.7, 0.2, rr * 0.85], p);
    };
    const dedos = DEDOS.map(([x, z, abre, r, largos, quieto]) => {
      parte(bola, punta, [x, 0.6, z - 0.4], [r * 1.02, r * 0.85, r * 1.02]);
      const base = new THREE.Group(); base.position.set(x, 0.25, z); base.rotation.y = abre; mano.add(base);
      cadena(base, r, largos, quieto, [1.2, 1.4, 0.9]);
      return base;
    });
    const pulgar = new THREE.Group(); pulgar.position.set(3.3, -0.3, 1.6); pulgar.rotation.set(0, 0.6, -0.85); mano.add(pulgar);
    cadena(pulgar, 1.0, [2.4, 1.9], [0.25, 0.3], [0.6, 0.7]);

    let rollo = null, puno = null, banda = null;
    if (arremangada) { rollo = new THREE.Mesh(new THREE.TorusGeometry(1, 0.42, 10, 24), manga); g.add(rollo); }
    else { puno = new THREE.Mesh(recto, manga); g.add(puno); }
    if (estilo.puno === 'guarda') {
      banda = new THREE.Mesh(recto, new THREE.MeshStandardMaterial({ map: guarda(estilo.manga, claro(estilo.manga) ? '#2B2219' : '#EDE6D6'), roughness: 0.95 }));
      g.add(banda);
    }
    if (estilo.accesorio === 'reloj') {
      parte(new THREE.TorusGeometry(1, 0.17, 8, 28), new THREE.MeshStandardMaterial({ color: '#3A2618', roughness: 0.8 }), [0, 0, 0.5], [2.45, 1.68, 2.4]);
      parte(recto, new THREE.MeshStandardMaterial({ color: '#8C8579', metalness: 0.8, roughness: 0.3 }), [0, 1.7, 0.5], [1.25, 0.6, 1.25]);
      parte(recto, new THREE.MeshStandardMaterial({ color: '#EFE7D6', roughness: 0.4 }), [0, 2.02, 0.5], [1.02, 0.08, 1.02]);
      const aguja = new THREE.MeshStandardMaterial({ color: '#1A140E' });
      parte(cubo, aguja, [0, 2.1, 0.85], [0.12, 0.06, 0.7]);
      parte(cubo, aguja, [0.25, 2.1, 0.5], [0.5, 0.06, 0.12]);
    }
    if (estilo.accesorio === 'pulsera') {
      parte(new THREE.TorusGeometry(1, 0.13, 8, 28), new THREE.MeshStandardMaterial({ color: '#6B4A2E', roughness: 0.9 }), [0, 0, 0.2], [2.5, 1.7, 2.5]);
      parte(new THREE.TorusGeometry(1, 0.11, 8, 28), new THREE.MeshStandardMaterial({ color: '#2B2219', roughness: 0.9 }), [0, 0, 0.75], [2.45, 1.66, 2.5]);
      parte(bola, new THREE.MeshStandardMaterial({ color: '#B9B4A8', metalness: 0.8, roughness: 0.35 }), [0, 1.75, 0.45], [0.45, 0.45, 0.45]);
    }
    if (estilo.accesorio === 'anillo') {
      const r = DEDOS[2][3];
      parte(new THREE.TorusGeometry(r * 1.02, 0.28, 8, 18), new THREE.MeshStandardMaterial({ color: '#B89B5E', metalness: 0.8, roughness: 0.25 }), [0, 0, 1.0], [1, 1, 1], dedos[2]);
    }
    g.add(mano);
    const k = estilo.escala || 1, RS = R_SUP * k, RI = R_INF * k;
    mano.scale.set((estilo.espejo ? -1.6 : 1.6) * k, 1.6 * k, 1.6 * k);
    let cerrada = 0;
    return {
      grupo: g,
      largo: (46 + 40 + 14) * k,
      // el codo se abre hacia codoDir; el brazo no pasa de su largo: si el blanco queda más lejos, la muñeca se queda corta
      poner(hombro, destino, cerrar, codoDir = V(0, 1, 0)) {
        const plano = destino.clone().sub(hombro).setY(0).normalize();
        const muneca = destino.clone().addScaledVector(plano, -16 * k).setY(destino.y + 6 * k);
        const A = 46 * k, B = 40 * k;
        const eje = muneca.clone().sub(hombro); let d = eje.length(); eje.normalize();
        if (d > (A + B) * 0.995) { d = (A + B) * 0.995; muneca.copy(hombro).addScaledVector(eje, d); }
        const lado = codoDir.clone().addScaledVector(eje, -codoDir.dot(eje)).normalize();
        const x = (d * d + A * A - B * B) / (2 * d), h = Math.sqrt(Math.max(0, A * A - x * x));
        const pc = hombro.clone().addScaledVector(eje, x).addScaledVector(lado, h);
        unir(sup, hombro, pc, RS); unir(inf, pc, muneca, RI);
        codo.position.copy(pc); codo.scale.setScalar(arremangada ? RI * 0.95 : RS * 0.93);
        pliegues.forEach(({ m, t, p }) => {
          const a = m === sup ? hombro : pc, b = m === sup ? pc : muneca, dir = b.clone().sub(a).normalize();
          p.position.copy(a).lerp(b, t); p.quaternion.setFromUnitVectors(V(0, 0, 1), dir);
          p.scale.setScalar((m === sup ? RS * 0.88 : RI * 0.98) + 0.25 * k);
        });
        const dir = muneca.clone().sub(pc).normalize();
        if (rollo) { rollo.position.copy(pc).addScaledVector(dir, 4 * k); rollo.quaternion.setFromUnitVectors(V(0, 0, 1), dir); rollo.scale.setScalar(RI + 0.8 * k); }
        if (puno) { puno.position.copy(muneca).addScaledVector(dir, -5.8 * k); puno.quaternion.setFromUnitVectors(V(0, 1, 0), dir); puno.scale.set(4.4 * k, 7 * k, 4.4 * k); }
        if (banda) { banda.position.copy(muneca).addScaledVector(dir, -5.5 * k); banda.quaternion.setFromUnitVectors(V(0, 1, 0), dir); banda.scale.set(4.46 * k, 2.6 * k, 4.46 * k); }
        mano.position.copy(muneca); mano.lookAt(muneca.clone().add(plano)); mano.rotateX(0.22);
        cerrada += ((cerrar ? 1 : 0) - cerrada) * 0.25;
        juntas.forEach(j => { j.piv.rotation.x = j.reposo + cerrada * j.cierre; });
      },
    };
  }

  // quien juega sentado a un costado de la mesa: torso, cara con gestos, lo que lleva en la cabeza dice su Alianza
  function crearPersona(e) {
    const grupo = new THREE.Group(), cadera = new THREE.Group(); grupo.add(cadera);
    const piel = pielDe(e.piel), ropa = new THREE.MeshStandardMaterial({ color: e.manga, roughness: 0.95 });
    const pelo = new THREE.MeshStandardMaterial({ color: e.pelo, roughness: 0.9 }), tinta = new THREE.MeshStandardMaterial({ color: e.tinta, roughness: 0.85 });
    const pieza = (geo, m, p, s, padre = cadera, r = [0, 0, 0]) => { const b = new THREE.Mesh(geo, m); b.position.set(...p); b.scale.set(...s); b.rotation.set(...r); padre.add(b); return b; };
    // torso de abajo hacia arriba: cintura, pecho, hombros que bajan hacia el cuello
    const ancho = e.mujer ? 32 : 36;
    const torso = pieza(perfil([0.86, 0.9, 0.97, 1, 0.98, 0.9, 0.62, 0.22]), ropa, [0, 35, 0], [ancho, 80, 22]);
    [-1, 1].forEach(s => pieza(bola, ropa, [s * (ancho - 5), 64, 0], [11, 9.5, 11]));
    if (e.cuello === 'poncho') {
      const manta = new THREE.MeshStandardMaterial({ color: e.poncho, roughness: 0.95, side: THREE.DoubleSide });
      const caida = new THREE.LatheGeometry([[1.12, -0.5], [1.1, 0], [1.02, 0.25], [0.7, 0.42], [0.3, 0.5]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
      pieza(caida, manta, [0, 58, 0], [40, 40, 25]);
      pieza(new THREE.CylinderGeometry(1, 1, 1, 28, 1, true), new THREE.MeshStandardMaterial({ map: guarda(e.poncho, claro(e.poncho) ? '#2B2219' : '#EDE6D6', 8), roughness: 0.95, side: THREE.DoubleSide }), [0, 41, 0], [45.2, 6, 28.2]);
    } else {
      pieza(new THREE.TorusGeometry(1, 0.3, 8, 20), new THREE.MeshStandardMaterial({ color: e.panuelo, roughness: 0.9 }), [0, 76, 0], [11, 11, 11], cadera, [Math.PI / 2, 0, 0]);
      pieza(new THREE.ConeGeometry(1, 1, 4), new THREE.MeshStandardMaterial({ color: e.panuelo, roughness: 0.9 }), [0, 66, 21], [8, 13, 3], cadera, [Math.PI, 0, 0]);
    }
    pieza(recto, piel, [0, 79, 0], [8, 14, 8]);
    const cabeza = new THREE.Group(); cabeza.position.set(0, 86, 0); cadera.add(cabeza);
    const c = (geo, m, p, s, r) => pieza(geo, m, p, s, cabeza, r);
    c(bola, piel, [0, 14, 0], [15, 18, 16]);
    c(bola, piel, [0, 6.5, 6], e.mujer ? [8.5, 5.5, 7] : [9.5, 6, 7.5]);
    [-1, 1].forEach(s => c(bola, piel, [s * 15, 14, -1], [3, 5, 3]));
    c(bola, rosado(e.piel), [0, 13, 16], [2.6, 4, 3.4]);
    c(cubo, new THREE.MeshStandardMaterial({ color: e.mujer ? '#8A3A36' : '#5A2E26', roughness: 0.6 }), [0, 6.8, 14.4], e.mujer ? [6.5, 1.3, 1] : [7, 0.9, 1]);
    if (e.aros) [-1, 1].forEach(s => c(new THREE.TorusGeometry(1, 0.3, 8, 16), new THREE.MeshStandardMaterial({ color: '#C9C3B6', metalness: 0.8, roughness: 0.3 }), [s * 15.5, 7.5, -1], [1.8, 1.8, 1.8], [0, Math.PI / 2, 0]));
    const ojos = [-1, 1].map(s => {
      const o = new THREE.Group(); o.position.set(s * 5.5, 17, 13.4); cabeza.add(o);
      const blanco = new THREE.Mesh(bola, new THREE.MeshStandardMaterial({ color: '#EEE8DC', roughness: 0.4 })); blanco.scale.set(3.2, 2.4, 1.6); o.add(blanco);
      const iris = new THREE.Mesh(bola, new THREE.MeshStandardMaterial({ color: '#2B1C12', roughness: 0.3 })); iris.position.z = 1.3; iris.scale.set(1.6, 1.6, 0.8); o.add(iris);
      c(cubo, pelo, [s * 5.8, 21.4, 14.2], e.mujer ? [6, 0.9, 1.4] : [6.5, 1.3, 1.6], [0, 0, -s * 0.12]);
      if (e.mujer) c(cubo, new THREE.MeshStandardMaterial({ color: '#1A140E' }), [s * 5.5, 19.2, 14.8], [6.4, 0.6, 0.8], [0, 0, -s * 0.05]);
      return o;
    });
    if (e.cara === 'bigote') c(bola, pelo, [0, 8.8, 15], [6, 1.6, 2]);
    if (e.cara === 'barba') { c(bola, pelo, [0, 8.8, 15], [6, 1.6, 2]); c(bola, pelo, [0, 4, 9], [12, 8.5, 9]); }
    c(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), pelo, [0, 15, -1], [15.8, 16.5, 16.8], [-0.3, 0, 0]);
    c(bola, pelo, [0, 11, -6], [14, 11, 11]);
    if (e.mujer) [-1, 1].forEach(s => c(bola, pelo, [s * 13.8, 9, 2], [3.2, e.peinado === 'melena' ? 14 : 9, 7]));
    if (e.peinado === 'melena') c(bola, pelo, [0, 4, -7], [15.5, 20, 9]);
    if (e.peinado === 'trenza') for (let k = 0; k < 7; k++) c(bola, pelo, [0, 4 - k * 5.2, -14 - k * 0.8], [4.2 - k * 0.25, 3.6, 3.8]);
    if (e.sombrero === 'gorra') {
      c(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), tinta, [0, 19, 0], [16.6, 15, 16.6]);
      c(recto, tinta, [0, 20.5, 16.8], [14, 1.6, 12.8], [0.12, 0, 0]);
      c(bola, new THREE.MeshStandardMaterial({ color: e.manga, roughness: 0.8 }), [0, 32, 0], [2.8, 1.9, 2.8]);
    }
    if (e.sombrero === 'boina') {
      c(new THREE.CylinderGeometry(0.8, 1, 1, 24), tinta, [2.4, 26.8, 0], [20.8, 8.8, 20.8], [Math.PI, 0, -0.2]);
      c(bola, tinta, [1.3, 32, 0], [2.4, 2.4, 2.4]);
    }
    if (e.sombrero === 'sombrero') {
      c(recto, tinta, [0, 23.6, 0], [32, 2.9, 32]);
      c(new THREE.CylinderGeometry(0.8, 1, 1, 24), tinta, [0, 32.4, 0], [16, 17.6, 16]);
      c(recto, new THREE.MeshStandardMaterial({ color: '#B9A27A', roughness: 0.8 }), [0, 28.4, 0], [15.8, 3.5, 15.8]);
    }
    if (e.sombrero === 'gorro') {
      c(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), tinta, [0, 19, 0], [16.8, 20, 16.8]);
      c(new THREE.CylinderGeometry(1, 1, 1, 24), new THREE.MeshStandardMaterial({ color: e.manga, roughness: 0.95 }), [0, 20, 0], [17.4, 5, 17.4]);
      c(bola, new THREE.MeshStandardMaterial({ color: e.manga, roughness: 0.95 }), [0, 40, 0], [5, 5, 5]);
    }
    if (e.utileria === 'mate') {
      const mate = new THREE.MeshStandardMaterial({ color: '#7A5A30', roughness: 0.8 });
      pieza(bola, mate, [58, 6, 30], [5.5, 6.5, 5.5], grupo);
      pieza(recto, new THREE.MeshStandardMaterial({ color: '#3F5233', roughness: 0.9 }), [58, 12, 30], [3.8, 1.2, 3.8], grupo);
      pieza(recto, new THREE.MeshStandardMaterial({ color: '#C9C3B6', metalness: 0.8, roughness: 0.3 }), [59.5, 16, 30], [0.5, 10, 0.5], grupo, [0, 0, -0.2]);
      pieza(recto, new THREE.MeshStandardMaterial({ color: '#8C8579', metalness: 0.7, roughness: 0.35 }), [70, 16, 8], [5.5, 32, 5.5], grupo);
      pieza(recto, new THREE.MeshStandardMaterial({ color: '#2B2219', roughness: 0.6 }), [70, 34, 8], [4.2, 5, 4.2], grupo);
    }
    if (e.utileria === 'cuaderno') {
      pieza(cubo, new THREE.MeshStandardMaterial({ color: '#D9CDB0', roughness: 0.9 }), [55, 0.9, 30], [26, 1.8, 34], grupo, [0, 0.3, 0]);
      pieza(recto, new THREE.MeshStandardMaterial({ color: '#6E2A2A', roughness: 0.6 }), [60, 2.6, 34], [0.9, 20, 0.9], grupo, [Math.PI / 2, 0, 0.9]);
    }
    const marca = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); cadera.add(o); return o; };
    const hombroDer = marca(-35, 64, 2), hombroIzq = marca(35, 64, 2);
    const apoyoDer = new THREE.Object3D(), apoyoIzq = new THREE.Object3D();
    apoyoDer.position.set(-30, 5, 36); apoyoIzq.position.set(32, 5, 32); grupo.add(apoyoDer, apoyoIzq);
    let parpadeo = 0, proximo = 2000;
    return {
      grupo, hombroDer, hombroIzq, apoyoDer, apoyoIzq,
      // se inclina hacia donde estira la mano, la sigue con la cabeza, respira y parpadea
      actualizar(destino, estira, ahora, dt) {
        const t = grupo.worldToLocal(destino.clone());
        const giro = Math.max(-0.7, Math.min(0.7, Math.atan2(t.x, t.z)));
        const lejos = estira ? Math.max(0, Math.min(1, (Math.hypot(t.x, t.z) - 40) / 70)) : 0;
        const s = 1 - Math.exp(-dt * 5);
        cadera.rotation.x += (0.7 * lejos - cadera.rotation.x) * s;
        cadera.position.y += (14 * lejos - cadera.position.y) * s;
        cadera.rotation.y += (giro * 0.45 - cadera.rotation.y) * s;
        cabeza.rotation.y += (giro * 0.55 - cabeza.rotation.y) * s;
        cabeza.rotation.x += (0.12 + 0.2 * lejos - cabeza.rotation.x) * s;
        torso.scale.y = 78 * (1 + 0.012 * Math.sin(ahora / 700));
        if (ahora > proximo) { parpadeo = ahora; proximo = ahora + 2500 + Math.random() * 3500; }
        const k = ahora - parpadeo < 140 ? 0.12 : 1;
        ojos.forEach(o => { o.scale.y = k; });
      },
    };
  }

  const brazos = [];
  let brazosVisibles = true;
  // tamaño de una persona real frente a un tablero de metro y medio
  const ESCALA = 2;
  const madera = new THREE.MeshStandardMaterial({ color: '#8A6A45', roughness: 0.7 });
  // cada asiento es un costado de la mesa: la persona se corre por ese costado hacia donde juega y vuelve a su lugar
  const ASIENTOS = {
    sur: { casa: V(0, Y, borde.z1 + 30 * ESCALA), frente: V(0, 0, -1), eje: V(1, 0, 0), rango: [borde.x0 + 40, borde.x1 + 160] },
    oeste: { casa: V(borde.x0 - 45 * ESCALA, Y, centroZ + 60), frente: V(1, 0, 0), eje: V(0, 0, 1), rango: [borde.z0 + 40, borde.z1 - 60] },
    este: { casa: V(borde.x1 + 45 * ESCALA, Y, centroZ - 40), frente: V(-1, 0, 0), eje: V(0, 0, 1), rango: [borde.z0 + 40, 60] },
    // el norte no pasa del medio hacia el oeste: ahí caen las cartas de la ronda
    norte: { casa: V(borde.x0 + ancho * 0.62, Y, borde.z0 - 45 * ESCALA), frente: V(0, 0, 1), eje: V(1, 0, 0), rango: [borde.x0 + ancho * 0.42, borde.x1 - 40] },
  };
  function sumarBrazo(a, estilo, asiento) {
    const e = { ...estilo, escala: ESCALA }, lugar = ASIENTOS[asiento];
    const B = { a, asiento, lugar, objetivo: null, cerrar: false, ultimo: 0, der: crearBrazo(e) };
    B.persona = crearPersona(asiento === 'sur' ? { ...e, pelo: e.piel, tinta: e.manga, panuelo: e.manga } : e);
    const g = B.persona.grupo;
    g.scale.setScalar(ESCALA); g.position.copy(lugar.casa); g.rotation.y = Math.atan2(lugar.frente.x, lugar.frente.z);
    // lo que no alcanza con la mano lo arrima con una vara, como en las mesas de mapas
    B.vara = new THREE.Group();
    const palo = new THREE.Mesh(recto, madera); palo.scale.x = palo.scale.z = 0.9; B.vara.add(palo);
    const tope = new THREE.Mesh(cubo, madera); tope.scale.set(9, 1.6, 2.2); B.vara.add(tope);
    B.vara.palo = palo; B.vara.tope = tope;
    escena.add(g, B.der.grupo, B.vara);
    if (asiento !== 'sur') { B.izq = crearBrazo({ ...e, espejo: true, accesorio: 'ninguno' }); escena.add(B.izq.grupo); }
    g.updateMatrixWorld(true);
    B.punta = B.persona.apoyoDer.getWorldPosition(V(0, 0, 0)); B.objetivo = B.punta.clone();
    B.seguir = (p, cerrar) => { B.objetivo = p.clone(); B.cerrar = cerrar; B.ultimo = performance.now(); };
    brazos.push(B);
    mostrar(B);
  }
  // tu cuerpo no se dibuja: desde la cámara solo se ve tu brazo
  const mostrar = B => { [B.der, B.izq].forEach(o => { if (o) o.grupo.visible = brazosVisibles; }); B.persona.grupo.visible = brazosVisibles && B.asiento !== 'sur'; };
  const brazoDe = a => brazosVisibles ? brazos.find(B => B.a === a) : null;
  function tocar(a, punto) { const B = brazoDe(a); if (B) B.seguir(punto.clone().setY(punto.y + 8), true); }

  // ---------- paso por cuadro ----------
  let antes = performance.now();
  function paso() {
    const ahora = performance.now(), dt = Math.min(0.05, (ahora - antes) / 1000); antes = ahora;
    mundo.step(1 / 60, dt, 4);
    dados.forEach(d => { if (d.enMundo) { d.malla.position.copy(d.cuerpo.position); d.malla.quaternion.copy(d.cuerpo.quaternion); } });
    cartas.forEach(c => { c.malla.position.copy(c.cuerpo.position); c.malla.quaternion.copy(c.cuerpo.quaternion); });

    if (viaje) {
      const k = Math.min(1, (ahora - viaje.t0) / viaje.dura), s = k * k * (3 - 2 * k);
      camara.position.lerpVectors(viaje.p0, viaje.pos, s);
      controles.target.lerpVectors(viaje.m0, viaje.mira, s);
      camara.lookAt(controles.target);
      if (k >= 1) { const l = viaje.listo; viaje = null; l(); }
    }

    brazos.forEach(B => {
      B.vara.visible = false;
      if (!B.der.grupo.visible) return;
      const P = B.persona, g = P.grupo, { casa, eje, rango } = B.lugar;
      const activo = ahora - B.ultimo <= 1300;
      // se corre por su costado hacia el blanco (o vuelve a su lugar), a paso de persona
      const quiere = Math.max(rango[0], Math.min(rango[1], (activo ? B.objetivo : casa).dot(eje)));
      const hoy = g.position.dot(eje);
      g.position.addScaledVector(eje, Math.max(-300 * dt, Math.min(300 * dt, quiere - hoy)));
      if (!activo) { g.updateMatrixWorld(true); B.objetivo = P.apoyoDer.getWorldPosition(V(0, 0, 0)); B.cerrar = false; }
      B.punta.lerp(B.objetivo, 1 - Math.exp(-dt * 7));
      P.actualizar(activo ? B.punta : V(0, 0, centroZ), activo, ahora, dt);
      g.updateMatrixWorld(true);
      const q = g.quaternion, hombro = P.hombroDer.getWorldPosition(V(0, 0, 0));
      let mano = B.punta;
      const falta = mano.distanceTo(hombro) - B.der.largo;
      if (falta > 0) {
        mano = hombro.clone().lerp(B.punta, B.der.largo / B.punta.distanceTo(hombro));
        mano.y = Math.max(mano.y, B.punta.y + 10);
        const d = B.punta.clone().sub(mano), largo = d.length();
        B.vara.visible = true;
        B.vara.position.copy(mano); B.vara.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
        B.vara.palo.scale.y = largo; B.vara.palo.position.y = largo / 2; B.vara.tope.position.y = largo;
      }
      B.der.poner(hombro, mano, B.cerrar || falta > 0, V(-0.85, 0.5, 0).applyQuaternion(q));
      if (B.izq) B.izq.poner(P.hombroIzq.getWorldPosition(V(0, 0, 0)), P.apoyoIzq.getWorldPosition(V(0, 0, 0)), false, V(0.85, 0.4, 0).applyQuaternion(q));
    });

    viento = Math.max(0, viento - dt * 0.4);
    if (particulas.visible) {
      for (let k = 0; k < N; k++) {
        const i = k * 3;
        if (clima === 'cenizas') { posPart[i + 1] -= dt * 9; posPart[i] += dt * 3; }
        else if (clima === 'viento') { posPart[i] += dt * (60 + 260 * viento); posPart[i + 1] += Math.sin(ahora / 300 + k) * dt * 4; }
        else {
          const dx = posPart[i], dz = posPart[i + 2] - centroZ, r = Math.hypot(dx, dz) + 1, w = dt * (0.4 + viento * 1.4);
          posPart[i] = dx * Math.cos(w) - dz * Math.sin(w) - dx * dt * 0.05;
          posPart[i + 2] = centroZ + dx * Math.sin(w) + dz * Math.cos(w) - dz * dt * 0.05;
          posPart[i + 1] += dt * 12 * (1 - r / 400);
        }
        if (posPart[i + 1] < 0 || posPart[i + 1] > 200 || posPart[i] > borde.x1 + 80 || Math.hypot(posPart[i], posPart[i + 2] - centroZ) < 4) sembrar(k);
      }
      geoPart.attributes.position.needsUpdate = true;
    }

    escena.position.set(0, 0, 0);
    if (temblor > 0) {
      temblor = Math.max(0, temblor - dt);
      escena.position.set(azar(-1, 1) * 3 * temblor, azar(-1, 1) * 1.5 * temblor, azar(-1, 1) * 3 * temblor);
    }
  }

  return {
    paso, tirarDados, soltarCarta, efecto, tocar, crearBrazo, sumarBrazo, moverCamara,
    get viento() { return viento; },
    get ocupada() { return !!viaje; },
    set sonido(f) { sonidoDados = f; },
    mostrarBrazos(si) { brazosVisibles = si; brazos.forEach(mostrar); },
  };
};
