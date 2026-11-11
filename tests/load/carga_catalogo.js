'use strict';
/**
 * Ejecutor de carga equivalente al plan tests/jmeter/LabTrack_Carga_Catalogo.jmx.
 * Se usó porque el entorno de ejecución no permitía descargar Apache JMeter.
 * Reproduce el mismo escenario (login único con CSRF + navegación aleatoria del
 * catálogo con pausas de 0,5–1,5 s) y guarda cada muestra en formato CSV de JMeter (JTL),
 * de modo que puede abrirse con los listeners de JMeter o con: jmeter -g archivo.jtl -o reporte
 *
 * Uso: node tests/load/carga_catalogo.js [usuarios=100] [rampup_s=30] [duracion_s=120] [etiqueta]
 */
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const { TEST_PASSWORDS } = require('../../src/db');
const baseline = new URL(BASE).port === '3001';
const CUENTAS = baseline
  ? ['N00123456', 'N00654321', 'N00999888'].map((codigo) => [codigo, process.env.LABTRACK_PASS_ESTUDIANTE || 'Upn2026*'])
  : [['N00471826', TEST_PASSWORDS.estudiante], ['N00832614', '//2estudiante__'], ['N00520973', '//3estudiante__']];
const RUTAS = [
  ['03 GET /catalogo (todas)', '/catalogo'],
  ['04 GET /catalogo?categoria=Cómputo', '/catalogo?categoria=C%C3%B3mputo'],
  ['05 GET /catalogo?categoria=Electrónica', '/catalogo?categoria=Electr%C3%B3nica'],
  ['06 GET /catalogo?categoria=Redes', '/catalogo?categoria=Redes'],
];
const SLA_MS = 1000;

const [usuarios = 100, rampup = 30, duracion = 120] = process.argv.slice(2, 5).map(Number);
const etiqueta = process.argv[5] || `${usuarios}u`;
const outDir = path.join(__dirname, '..', '..', 'reports', 'carga');
fs.mkdirSync(outDir, { recursive: true });

const muestras = [];
let activos = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ahora = () => Date.now();

async function muestra(label, url, opciones, validar) {
  const t0 = ahora();
  let code = 0;
  let ok = false;
  let msg = '';
  let body = '';
  let res;
  try {
    res = await fetch(BASE + url, { redirect: 'manual', ...opciones, signal: AbortSignal.timeout(10_000) });
    code = res.status;
    body = await res.text();
    const elapsed = ahora() - t0;
    ok = validar(res, body);
    if (!ok) msg = 'Aserción de contenido/código fallida';
    else if (elapsed > SLA_MS) {
      ok = false;
      msg = `SLA excedido (${elapsed} ms)`;
    }
  } catch (e) {
    msg = e.name;
  }
  const elapsed = ahora() - t0;
  muestras.push({ ts: t0, elapsed, label, code, ok, msg, bytes: Buffer.byteLength(body), hilos: activos });
  return { res, body };
}

async function usuarioVirtual(n, fin) {
  activos++;
  const [codigo, password] = CUENTAS[n % CUENTAS.length];
  let cookie = '';
  const guardarCookie = (res) => {
    const sc = res?.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
  };
  // Inicio de sesión (una vez por usuario)
  const r1 = await muestra('01 GET /login', '/login', {}, (r) => r.status === 200);
  guardarCookie(r1.res);
  const csrf = /name="_csrf" value="([a-f0-9]+)"/.exec(r1.body)?.[1] || '';
  const form = new URLSearchParams({ _csrf: csrf, codigo, password });
  const r2 = await muestra(
    '02 POST /login',
    '/login',
    { method: 'POST', body: form, headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' } },
    (r) => r.status === 302 && r.headers.get('location') === '/panel'
  );
  guardarCookie(r2.res);
  // Navegación del catálogo
  while (ahora() < fin) {
    const [label, url] = RUTAS[Math.floor(Math.random() * RUTAS.length)];
    await muestra(label, url, { headers: { cookie } }, (r, b) => r.status === 200 && b.includes('tabla-catalogo'));
    await sleep(500 + Math.random() * 1000);
  }
  activos--;
}

function percentil(ordenados, p) {
  if (ordenados.length === 0) return 0;
  return ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)];
}

function resumen(lista) {
  const t = lista.map((m) => m.elapsed).sort((a, b) => a - b);
  const errores = lista.filter((m) => !m.ok).length;
  const inicio = Math.min(...lista.map((m) => m.ts));
  const finT = Math.max(...lista.map((m) => m.ts + m.elapsed));
  const seg = (finT - inicio) / 1000;
  return {
    muestras: lista.length,
    promedio_ms: +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(1),
    mediana_ms: percentil(t, 50),
    p90_ms: percentil(t, 90),
    p95_ms: percentil(t, 95),
    p99_ms: percentil(t, 99),
    min_ms: t[0],
    max_ms: t.at(-1),
    errores,
    error_pct: +((errores / lista.length) * 100).toFixed(2),
    throughput_rps: +(lista.length / seg).toFixed(2),
    kb_s: +(lista.reduce((a, m) => a + m.bytes, 0) / 1024 / seg).toFixed(1),
  };
}

(async () => {
  const inicio = ahora();
  const fin = inicio + duracion * 1000;
  const intervalo = (rampup * 1000) / usuarios;
  console.log(`Escenario ${etiqueta}: ${usuarios} usuarios, ramp-up ${rampup}s, duración ${duracion}s`);
  const vus = [];
  for (let i = 0; i < usuarios; i++) {
    vus.push(usuarioVirtual(i, fin));
    await sleep(intervalo);
  }
  await Promise.all(vus);

  // JTL (CSV de JMeter)
  const cab = 'timeStamp,elapsed,label,responseCode,responseMessage,threadName,dataType,success,failureMessage,bytes,sentBytes,grpThreads,allThreads,URL,Latency,IdleTime,Connect';
  const filas = muestras.map((m) =>
    [m.ts, m.elapsed, `"${m.label}"`, m.code, m.ok ? 'OK' : 'KO', `"Estudiantes ${etiqueta}"`, 'text', m.ok, `"${m.msg}"`, m.bytes, 0, m.hilos, m.hilos, '', m.elapsed, 0, 0].join(',')
  );
  fs.writeFileSync(path.join(outDir, `resultados_${etiqueta}.jtl`), [cab, ...filas].join('\n'));

  const porEtiqueta = {};
  for (const [label] of [['01 GET /login'], ['02 POST /login'], ...RUTAS]) {
    const l = muestras.filter((m) => m.label === label);
    if (l.length) porEtiqueta[label] = resumen(l);
  }
  // Serie temporal por segundo (para gráficas)
  const serie = {};
  for (const m of muestras) {
    const s = Math.floor((m.ts - inicio) / 1000);
    serie[s] ??= { n: 0, suma: 0, err: 0, hilos: 0 };
    serie[s].n++;
    serie[s].suma += m.elapsed;
    serie[s].err += m.ok ? 0 : 1;
    serie[s].hilos = Math.max(serie[s].hilos, m.hilos);
  }
  const salida = {
    escenario: { etiqueta, usuarios, rampup_s: rampup, duracion_s: duracion, sla_ms: SLA_MS, fecha: new Date().toISOString() },
    total: resumen(muestras),
    porEtiqueta,
    serie: Object.entries(serie).map(([s, v]) => ({ s: +s, rps: v.n, prom_ms: +(v.suma / v.n).toFixed(1), errores: v.err, hilos: v.hilos })),
  };
  fs.writeFileSync(path.join(outDir, `resumen_${etiqueta}.json`), JSON.stringify(salida, null, 2));
  console.table({ TOTAL: salida.total, ...porEtiqueta });
})();
