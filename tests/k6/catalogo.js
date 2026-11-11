import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import execution from 'k6/execution';

const base = __ENV.BASE_URL || 'http://127.0.0.1:31847';
const vus = Number(__ENV.USUARIOS || 100);
const fallosCatalogo = new Rate('fallos_catalogo');
const fallosLogin = new Rate('fallos_login');
const rutas = ['/catalogo', '/catalogo?categoria=C%C3%B3mputo', '/catalogo?categoria=Electr%C3%B3nica', '/catalogo?categoria=Redes'];
const cuentas = [
  ['N00471826', '//1estudiante__'], ['N00832614', '//2estudiante__'],
  ['N00520973', '//3estudiante__'], ['N00186425', '//4estudiante__'],
  ['N00975138', '//5estudiante__'],
];
let autenticado = false;

export const options = {
  noCookiesReset: true,
  scenarios: { catalogo: { executor: 'ramping-vus', startVUs: 0, stages: [
    { duration: __ENV.RAMPUP || '30s', target: vus },
    { duration: __ENV.DURACION || '60s', target: vus },
    { duration: '10s', target: 0 },
  ], gracefulRampDown: '10s' } },
  thresholds: { 'fallos_catalogo{fase:estable}': ['rate<=0.01'], 'http_req_duration{operacion:catalogo,fase:estable}': ['p(95)<=1000'] },
};

export default function () {
  if (!autenticado) {
    const inicio = http.get(`${base}/login`, { tags: { operacion: 'login_get' } });
    const token = inicio.html().find('input[name="_csrf"]').attr('value');
    if (!token) { fallosLogin.add(true); sleep(1); return; }
    const [codigo, password] = cuentas[(__VU - 1) % cuentas.length];
    const respuesta = http.post(`${base}/login`, { codigo, password, _csrf: token }, { redirects: 0, tags: { operacion: 'login_post' } });
    autenticado = respuesta.status === 302 && respuesta.headers.Location === '/panel';
    fallosLogin.add(!autenticado);
    check(respuesta, { 'login redirige al panel': () => autenticado });
    if (!autenticado) { sleep(1); return; }
  }
  const ruta = rutas[Math.floor(Math.random() * rutas.length)];
  const transcurrido = execution.instance.currentTestRunDuration;
  const fase = transcurrido >= Number(__ENV.ESTABLE_DESDE_MS || 30000) && transcurrido < Number(__ENV.ESTABLE_HASTA_MS || 90000) ? 'estable' : 'transicion';
  const respuesta = http.get(`${base}${ruta}`, { redirects: 0, tags: { operacion: 'catalogo', fase }, timeout: '10s' });
  const correcto = respuesta.status === 200 && respuesta.body.includes('Catálogo');
  fallosCatalogo.add(!correcto, { fase });
  check(respuesta, { 'catálogo autenticado y válido': () => correcto });
  sleep(0.5 + Math.random());
}

export function handleSummary(data) {
  return { [__ENV.SUMMARY || 'resumen-k6.json']: JSON.stringify(data, null, 2) };
}
