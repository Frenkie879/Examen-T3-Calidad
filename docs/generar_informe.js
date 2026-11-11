'use strict';
/* Genera docs/Informe_Tecnico_LabTrack.docx con los resultados reales de /reports. */
const fs = require('node:fs');
const path = require('node:path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, ImageRun, PageBreak, TableOfContents, Header, Footer,
  PageNumber, LevelFormat, PageOrientation, SectionType,
} = require('docx');
const { MATRIZ, FALLAN_V1, IA } = require('./datos_informe');

const R = path.join(__dirname, '..', 'reports');
const json = (p) => JSON.parse(fs.readFileSync(path.join(R, p), 'utf8'));
const carga = [50, 100, 200, 400].map((u) => json(`carga/resumen_${u}u.json`));
const c100 = carga[1];
const backlog = json('sonar/backlog_refactorizacion.json').items;
const cov = json('../coverage/coverage-summary.json').total;

const FONT = 'Arial';
const AZUL = '13294B';
const GRIS = 'F1F3F6';
const A4 = { width: 11906, height: 16838 };
const MARGEN = 1134;
const ANCHO = A4.width - 2 * MARGEN; // 9638
const ANCHO_H = A4.height - 2 * MARGEN; // 14570

// ---------- helpers ----------
const t = (text, o = {}) => new TextRun({ text, font: FONT, ...o });
const P = (content, o = {}) =>
  new Paragraph({
    children: Array.isArray(content) ? content : [t(content)],
    spacing: { after: 120, line: 300 },
    alignment: o.align || AlignmentType.JUSTIFIED,
    ...o.p,
  });
const H1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t(text)] });
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t(text)] });
const B = (content) =>
  new Paragraph({ numbering: { reference: 'vinetas', level: 0 }, spacing: { after: 60, line: 280 }, children: Array.isArray(content) ? content : [t(content)] });
const salto = () => new Paragraph({ children: [new PageBreak()] });
const borde = { style: BorderStyle.SINGLE, size: 4, color: 'C9CED6' };
const bordes = { top: borde, bottom: borde, left: borde, right: borde };

function celda(texto, ancho, o = {}) {
  const runs = (Array.isArray(texto) ? texto : [String(texto)]).map((x) =>
    typeof x === 'string' ? t(x, { size: o.size || 17, bold: o.bold, color: o.color }) : x
  );
  return new TableCell({
    width: { size: ancho, type: WidthType.DXA },
    borders: bordes,
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
    children: [new Paragraph({ children: runs, alignment: o.align || AlignmentType.LEFT })],
  });
}
function tabla(cabeceras, filas, anchos, o = {}) {
  const total = anchos.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: anchos,
    rows: [
      new TableRow({ tableHeader: true, children: cabeceras.map((c, i) => celda(c, anchos[i], { bold: true, color: 'FFFFFF', fill: AZUL, size: o.size })) }),
      ...filas.map((f, r) =>
        new TableRow({
          cantSplit: true,
          children: f.map((c, i) => {
            const estilo = o.estilo ? o.estilo(c, i, r) : {};
            return celda(c, anchos[i], { size: o.size, fill: r % 2 ? GRIS : undefined, ...estilo });
          }),
        })
      ),
    ],
  });
}
function imagen(rel, anchoPx, pie) {
  const file = path.join(R, rel);
  const buf = fs.readFileSync(file);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 60 },
      children: [new ImageRun({ type: 'png', data: buf, transformation: { width: anchoPx, height: Math.round((anchoPx * h) / w) } })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [t(pie, { italics: true, size: 18, color: '52514E' })] }),
  ];
}
const nota = (texto) =>
  new Table({
    width: { size: ANCHO, type: WidthType.DXA },
    columnWidths: [ANCHO],
    rows: [new TableRow({ cantSplit: true, children: [new TableCell({
      width: { size: ANCHO, type: WidthType.DXA },
      borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.SINGLE, size: 24, color: 'F2A900' } },
      shading: { fill: 'FFF8E6', type: ShadingType.CLEAR, color: 'auto' },
      margins: { top: 100, bottom: 100, left: 160, right: 160 },
      children: (Array.isArray(texto) ? texto : [texto]).map((x) => new Paragraph({ spacing: { after: 60 }, children: typeof x === 'string' ? [t(x, { size: 19 })] : x })),
    })] })],
  });
const codigo = (lineas, color = 'F6F7FB') =>
  new Table({
    width: { size: ANCHO, type: WidthType.DXA },
    columnWidths: [ANCHO],
    rows: [new TableRow({ cantSplit: true, children: [new TableCell({
      width: { size: ANCHO, type: WidthType.DXA }, borders: bordes,
      shading: { fill: color, type: ShadingType.CLEAR, color: 'auto' },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: lineas.map((l) => new Paragraph({ children: [new TextRun({ text: l, font: 'Consolas', size: 16 })] })),
    })] })],
  });
const espacio = () => new Paragraph({ spacing: { after: 80 }, children: [] });

// ---------- Portada ----------
const portada = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 80 }, children: [t('UNIVERSIDAD PRIVADA DEL NORTE', { bold: true, size: 32, color: AZUL })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [t('Facultad de Ingeniería', { size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 900 }, children: [t('Carrera de Ingeniería de Sistemas Computacionales', { size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [t('INFORME TÉCNICO DE CALIDAD Y PRUEBAS', { bold: true, size: 36, color: AZUL })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [t('Sistema de Gestión de Laboratorios “LabTrack”', { bold: true, size: 30 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 900 }, children: [t('T3 – Desarrollo de Caso: certificación para pase a producción', { size: 24, italics: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [t('Curso: ', { bold: true, size: 22 }), t('Calidad y Pruebas de Software', { size: 22 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [t('Docente: ', { bold: true, size: 22 }), t('Mark Anthony Arribasplata Palomino', { size: 22 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [t('Integrantes:', { bold: true, size: 22 })] }),
  ...[1, 2, 3, 4].map((i) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [t(`[Apellidos y nombres – Integrante ${i}]   [Código N00…]`, { size: 22, color: '7A7A7A' })] })),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 900 }, children: [t('Lima – Perú, noviembre de 2026', { size: 22 })] }),
  salto(),
];

// ---------- Índice ----------
const indice = [
  new Paragraph({ spacing: { after: 200 }, children: [t('Índice', { bold: true, size: 32, color: AZUL })] }),
  new TableOfContents('Índice', { hyperlink: true, headingStyleRange: '1-2' }),
  salto(),
];

// ---------- 1. Introducción ----------
const intro = [
  H1('1. Introducción y alcance'),
  P('El presente informe documenta, con evidencias técnicas reproducibles, el proceso de aseguramiento de calidad aplicado al sistema LabTrack, plataforma web para la reserva y préstamo de equipos de laboratorio. El objetivo es demostrar ante el Directorio que el sistema es estable, seguro y eficiente, y que cumple los criterios de aceptación de las cinco historias de usuario (HU-01 a HU-05).'),
  P('Se compararon dos versiones del código: la línea base v1.0 (“antes”), que contenía defectos funcionales, vulnerabilidades y deuda técnica, y la versión v2.0 (“después”), resultado de ejecutar el backlog de refactorización. Ambas versiones se sometieron a la misma suite de pruebas automatizadas y al mismo análisis estático.'),
  H2('1.1 Historias de usuario evaluadas'),
  tabla(['HU', 'Funcionalidad', 'Prioridad', 'Técnica de prueba principal'], [
    ['HU-01', 'Autenticación segura (bloqueo tras 3 intentos)', 'Crítica', 'Selenium + análisis de seguridad'],
    ['HU-02', 'Catálogo y filtrado de equipos', 'Media', 'Selenium + prueba de carga (k6)'],
    ['HU-03', 'Reserva de equipos (reglas de cruce y límite)', 'Alta – flujo crítico', 'Selenium'],
    ['HU-04', 'Gestión de solicitudes (aprobar / rechazar)', 'Alta', 'Selenium'],
    ['HU-05', 'Devolución y penalización automática', 'Alta', 'Selenium (reloj simulado)'],
  ], [1000, 3900, 1700, 3038]),
  espacio(),
  H2('1.2 Entorno y herramientas'),
  tabla(['Componente', 'Versión / detalle'], [
    ['Aplicación', 'Node.js 22.23, Express 5.3, plantillas EJS, SQLite embebido (node:sqlite), bcryptjs'],
    ['Automatización funcional', 'Selenium WebDriver 4.52 + Mocha 10.8; Google Chrome 153 (headless); reportes JUnit XML y HTML (Mochawesome)'],
    ['Pruebas de carga', 'Grafana k6 2.3.0 (tests/k6/catalogo.js), ejecutado el 11/11/2026. Se conserva además el plan Apache JMeter 5.6 (tests/jmeter/LabTrack_Carga_Catalogo.jmx) con resultados del 09/11/2026, no re-ejecutado sobre esta versión'],
    ['Análisis estático', 'Motor de reglas SonarJS (eslint-plugin-sonarjs 4.2, mismo analizador de SonarQube para JavaScript) + eslint-plugin-security + jscpd (duplicación) + revisión manual'],
    ['Cobertura de código', 'c8 (V8 coverage) durante la ejecución de la suite Selenium'],
  ], [2600, 7038]),
  salto(),
];

// ---------- 2. Matriz de casos ----------
const anchosM = [780, 760, 2700, 1250, 2900, 3260, 1100, 900, 920];
const filasM = MATRIZ.map(([id, hu, esc, tipo, datos, esp, origen]) => [id, hu, esc, tipo, datos, esp, origen, FALLAN_V1.has(id) ? 'Falla' : 'Pasa', 'Pasa']);
const matriz = [
  H1('2. Matriz de casos de prueba'),
  P(`Se diseñaron ${MATRIZ.length} casos de prueba trazados a los criterios de aceptación. ${MATRIZ.filter((m) => m[6] === 'IA validada').length} de ellos provienen de sugerencias generadas con inteligencia artificial y fueron validados por el equipo (sección 2.1). Las columnas “v1” y “v2” muestran el resultado real de la ejecución automatizada en cada versión.`),
  tabla(['ID', 'HU', 'Escenario', 'Tipo', 'Datos / precondición', 'Resultado esperado', 'Origen', 'v1 antes', 'v2 después'], filasM, anchosM, {
    size: 16,
    estilo: (c, i) => (i >= 7 ? { bold: true, color: c === 'Pasa' ? '0F7B4F' : 'B42318', align: AlignmentType.CENTER } : {}),
  }),
  espacio(),
  H2('2.1 Casos sugeridos por IA y validación humana'),
  P('Se solicitó a un asistente de IA generativa que propusiera casos adicionales a partir del texto de las historias de usuario (prompt: “Actúa como QA senior y propone casos de prueba negativos, de límite y de seguridad para estas historias de usuario”). Cada sugerencia fue revisada por el equipo frente a los criterios de aceptación antes de automatizarla. La validación humana fue determinante: 2 sugerencias se rechazaron por estar fuera de alcance o no ser alcanzables, 1 se difirió y 1 se reformuló.'),
  P([t('Resultado: ', { bold: true }), t('7 sugerencias aceptadas (5 directas y 2 con ajuste) se convirtieron en casos automatizados; 4 de ellas (CP-05, CP-06, CP-16 y CP-21) detectaron defectos reales de la v1, lo que demuestra el valor de combinar IA con criterio humano.')]),
  tabla(['ID', 'Sugerencia de la IA', 'Decisión del equipo', 'Justificación de la validación humana', 'Resultado'], IA, [700, 3300, 1500, 6870, 2200], {
    size: 16,
    estilo: (c, i) => (i === 2 ? { bold: true, color: c.startsWith('Aceptado') ? '0F7B4F' : c === 'Rechazado' ? 'B42318' : '93370D' } : {}),
  }),
  espacio(),
];

// ---------- 3. Automatización ----------
const automat = [
  H1('3. Evidencias de automatización (Selenium)'),
  P('La suite automatizada (tests/selenium) usa Selenium WebDriver con el patrón de esperas explícitas, datos de prueba reiniciados antes de cada caso y capturas de pantalla automáticas como evidencia. Cubre los dos flujos críticos exigidos —Login (HU-01) y Reservas (HU-03)— y, adicionalmente, HU-02, HU-04 y HU-05.'),
  H2('3.1 Resultados de ejecución'),
  tabla(['Versión', 'Casos', 'Aprobados', 'Fallidos', '% éxito', 'Duración', 'Reporte'], [
    ['v1.0 (antes)', '23', '15', '8', '65,2 %', '41,8 s', 'junit-selenium-v1-antes.xml'],
    ['v2.0 (después)', '25', '25', '0', '100 %', '1 min 11 s', 'junit-selenium.xml / reporte-selenium.html'],
  ], [1500, 900, 1150, 1000, 1000, 1100, 2988], { estilo: (c, i, r) => (r === 1 ? { bold: true } : {}) }),
  espacio(),
  P([t('La fila de la v1.0 corresponde a la suite de 23 casos ejecutada sobre la línea base. Los casos CP-24 y CP-25 (filtros Cómputo y Redes) se añadieron en esta revisión y solo existen en la versión actual. ', { size: 18, italics: true, color: '52514E' })]),
  P([t('Flujos críticos: ', { bold: true }), t('Login 8/8 y Reservas 6/6 aprobados en la v2.0, sin defectos abiertos. La ejecución de la suite completa terminó con 25 casos aprobados y 0 fallidos en 71 s. La cobertura instrumentada con c8 durante las pruebas de base de datos alcanza '), t(`${cov.lines.pct.toFixed(1)} % de líneas`, { bold: true }), t(` y ${cov.branches.pct.toFixed(1)} % de ramas, pero corresponde solo a los módulos que esas pruebas cargan y no incluye la ejecución de Selenium: no es la cobertura de toda la aplicación.`)]),
  ...imagen('graficas/selenium_antes_despues.png', 560, 'Figura 1. Casos aprobados por historia de usuario: v1.0 vs v2.0 (resultados reales de JUnit).'),
  ...imagen('evidencias/selenium_reporte_resumen.png', 600, 'Figura 2. Reporte HTML de la ejecución: 25 casos, 25 aprobados, 0 fallidos.'),
  H2('3.2 Capturas de los flujos críticos'),
  ...imagen('selenium/capturas/CP-04_cuenta_bloqueada.png', 430, 'Figura 3. CP-04: bloqueo de cuenta tras 3 intentos fallidos con alerta de seguridad.'),
  ...imagen('selenium/capturas/CP-13_cruce_horario_bloqueado.png', 430, 'Figura 4. CP-13: el sistema bloquea una reserva que se cruza con otra ya aprobada.'),
  ...imagen('selenium/capturas/CP-14_limite_una_reserva.png', 430, 'Figura 5. CP-14: un estudiante no puede reservar más de un equipo simultáneamente.'),
  ...imagen('selenium/capturas/CP-23_devolucion_tardia_penalizacion.png', 430, 'Figura 6. CP-23: devolución tardía con penalización automática del estudiante.'),
  H2('3.3 Gestión en Testomat.io'),
  nota([
    [t('Importación del reporte. ', { bold: true, size: 19 }), t('El archivo reports/selenium/junit-selenium.xml es compatible con la importación de reportes JUnit de Testomat.io (Import → JUnit XML) y de TestLink. Al importarlo, cada caso CP-xx aparece como prueba automatizada con su estado.', { size: 19 })],
    '[Insertar aquí la captura del run importado en Testomat.io del equipo.]',
  ]),
  salto(),
];

// ---------- 4. Carga ----------
const fmt = (n) => String(n).replace('.', ',');
const carg = [
  H1('4. Pruebas de carga'),
  P('La nota técnica de HU-02 exige que la vista de catálogo soporte múltiples usuarios concurrentes. La carga se ejecutó con Grafana k6 2.3.0 (tests/k6/catalogo.js) sobre un servidor local aislado con la base de datos en memoria. Cada usuario virtual inicia sesión una vez, conserva su cookie de sesión y navega el catálogo (todas, Cómputo, Electrónica, Redes) con una pausa aleatoria de 0,5 a 1,5 s, igual que el plan JMeter del proyecto.'),
  H2('4.1 Criterio de aceptación aplicado'),
  P([t('Se adoptó como criterio de esta evaluación que una etapa es aceptable solo si el catálogo presenta ', {}), t('1 % o menos de peticiones fallidas', { bold: true }), t(' y un ', {}), t('p95 igual o inferior a 1000 ms', { bold: true }), t(' en su ventana estable. Son umbrales definidos para este trabajo, no valores exigidos por las historias de usuario, y no demuestran por sí solos que el servidor “haya caído”.')]),
  H2('4.2 Resultados por escenario'),
  tabla(['Escenario', 'Ramp-up / estable', 'Peticiones', 'req/s', 'Fallos del catálogo', 'Mediana (ms)', 'p95 (ms)', 'Máx. (ms)', 'Veredicto'], [
    ['100 usuarios', '30 s / 60 s', '8 169', '81,1', '0,00 %', '4', '21', '90', 'Cumple'],
    ['200 usuarios', '30 s / 60 s', '12 790', '126,4', '0,00 %', '32', '156', '5 196', 'Cumple'],
    ['400 usuarios', '30 s / 60 s', '9 675', '95,8', '24,37 %', '1 030', '8 549', '10 039', 'No cumple'],
    ['400 usuarios (logins repartidos)', '120 s / 40 s', '16 893', '96,9', '0,00 %', '1 649', '3 485', '4 513', 'No cumple'],
  ], [1900, 1350, 950, 700, 1350, 900, 750, 800, 938], {
    size: 16,
    estilo: (c, i, r) => (i === 8 ? { bold: true, color: c === 'Cumple' ? '0F7B4F' : 'B42318', align: AlignmentType.CENTER } : {}),
  }),
  espacio(),
  ...imagen('graficas/k6_escenarios.png', 620, 'Figura 7. p95 del catálogo (escala logarítmica) y porcentaje de fallos por escenario, frente a los umbrales acordados.'),
  H2('4.3 Análisis'),
  B([t('Carga esperada: ', { bold: true }), t('con 100 usuarios el catálogo responde con un p95 de 21 ms y un p99 inferior a 90 ms, unas 47 veces por debajo del umbral de 1000 ms, y sin un solo fallo. Con 200 usuarios sigue cumpliendo (p95 de 156 ms).')]),
  B([t('Límite observado: ', { bold: true }), t('el primer escenario que incumple es el de 400 usuarios, tanto por errores (24,37 % en la rampa de 30 s) como por latencia (p95 de 8,55 s). El throughput además se invierte: 400 usuarios generan 95,8 req/s frente a los 126,4 req/s de 200 usuarios, señal clásica de saturación.')]),
  B([t('Causa identificada: ', { bold: true }), t('el inicio de sesión usa bcrypt.compareSync, que bloquea el único hilo de Node. La medición directa da 92 ms por verificación; 400 inicios de sesión acumulan unos 37 s de hilo bloqueado. Durante ese bloqueo el servidor rechazó conexiones nuevas (WSAECONNREFUSED) y las peticiones del catálogo vencieron por timeout.')]),
  B([t('Verificación de la causa: ', { bold: true }), t('al repartir los mismos 400 inicios de sesión en 120 s, los fallos desaparecen (0 %), pero el p95 sigue en 3,49 s y ninguna petición baja de 632 ms. Es decir: la tormenta de logins explica los errores, y la saturación del proceso explica la latencia. Ambos efectos están registrados en el backlog como RF-21, RF-22 y RF-23.')]),
  B([t('Alcance del resultado: ', { bold: true }), t('el generador de carga y la aplicación se ejecutaron en la misma computadora (Windows 11, 8 procesadores lógicos, 8,2 GB de RAM, SQLite en memoria), de modo que el límite descrito aplica a este escenario y entorno, no a la capacidad universal del sistema. Repetir la prueba con el generador en otra máquina y sobre la base de datos definitiva es parte de las recomendaciones.')]),
  nota([
    [t('Instrumento utilizado. ', { bold: true, size: 19 }), t('Las cifras anteriores provienen de Grafana k6, no de JMeter. La guía del caso pide JMeter: el repositorio conserva el plan tests/jmeter/LabTrack_Carga_Catalogo.jmx y resultados del 09/11/2026 (reports/carga/resultados_*.jtl), pero no se re-ejecutó sobre la versión actual. La sustitución se declara de forma explícita para no atribuir a JMeter datos que no produjo.', { size: 19 })],
  ]),
  H2('4.4 Reproducibilidad'),
  codigo([
    '# servidor aislado',
    'set NODE_ENV=test && set LABTRACK_DB=:memory: && set PORT=31847 && node src/server.js',
    '',
    '# escenario de 100 usuarios (repetir con USUARIOS=200 y 400)',
    'set BASE_URL=http://127.0.0.1:31847 && set USUARIOS=100',
    'k6 run --summary-export=resumen.json tests/k6/catalogo.js',
    '',
    '# variante que reparte los logins en 120 s',
    'set USUARIOS=400 && set RAMPUP=120s && set DURACION=40s',
    'set ESTABLE_DESDE_MS=120000 && set ESTABLE_HASTA_MS=160000',
  ]),
  salto(),
];

// ---------- 5. Sonar ----------
const sonar = [
  H1('5. Análisis estático: antes y después'),
  P('El análisis se realizó con el motor de reglas de SonarSource para JavaScript (SonarJS, reglas Sxxxx) ejecutado mediante ESLint, complementado con eslint-plugin-security y una revisión manual orientada a OWASP Top 10. La revisión manual permitió identificar vulnerabilidades que el análisis sin flujo de datos (taint analysis) no detecta automáticamente, como la inyección SQL sobre el driver node:sqlite. Los conteos de la tabla provienen de esa ejecución local (reports/sonar/eslint-v1-antes.json y eslint-v2-despues.json), no de un servidor SonarQube.'),
  H2('5.1 Estado del despliegue en SonarQube Cloud'),
  P([t('El proyecto está preparado para SonarQube Cloud: existe sonar-project.properties, el reporte de ESLint que ese archivo referencia ya se genera con “npm run lint:report” y el escáner (SonarScanner CLI 7.1.0.4889) está descargado. El análisis no se pudo enviar porque requiere un token de usuario y una organización de SonarQube Cloud que este entorno no tiene. ', {}), t('Por ese motivo no se declara un Quality Gate oficial', { bold: true }), t(': sería un dato inventado. El comando exacto para completarlo está en la sección 5.4.')]),
  H2('5.2 Métricas comparativas'),
  tabla(['Métrica', 'v1.0 (antes)', 'v2.0 (después)', 'Variación'], [
    ['Vulnerabilidades', '5 (3 Blocker, 2 Critical)', '0', '−100 %'],
    ['Bugs (fiabilidad)', '8 (3 Critical, 4 Major, 1 Minor)', '0', '−100 %'],
    ['Security Hotspots', '8 sin revisar', '0 (100 % revisados)', '−100 %'],
    ['Code Smells', '61', '0', '−100 %'],
    ['Total incidencias reportadas por la herramienta', '68', '0', '−100 %'],
    ['Complejidad cognitiva máxima por función', '37 (umbral 15)', '7', '−81 %'],
    ['Código duplicado', '1,47 %', '0 %', '—'],
    ['Cobertura de pruebas (líneas)', 'No medida', `${cov.lines.pct.toFixed(1)} %`, '—'],
    ['Calificación de Seguridad', 'E', 'A', '▲'],
    ['Calificación de Fiabilidad', 'D', 'A', '▲'],
    ['Calificación de Mantenibilidad (deuda estimada)', 'B (≈ 5,5 h; 6,1 %)', 'A (0 h)', '▲'],
    ['Quality Gate (Sonar way) en servidor', 'No evaluado', 'Pendiente de token de SonarQube Cloud', '—'],
  ], [3900, 2500, 1900, 1338], { estilo: (c, i, r) => (i === 2 && r < 11 ? { bold: true, color: '0F7B4F' } : r === 11 ? { bold: true, color: '93370D' } : {}) }),
  P([t('Las calificaciones A–E se calcularon con las reglas de SonarQube: Seguridad y Fiabilidad según la incidencia más grave abierta; Mantenibilidad según la razón deuda/costo de desarrollo (líneas × 30 min). Son una estimación obtenida con las mismas reglas que aplica SonarQube, no una lectura del panel de SonarQube.', { size: 18, italics: true, color: '52514E' })]),
  ...imagen('graficas/sonar_antes_despues.png', 560, 'Figura 9. Incidencias por tipo antes y después de la refactorización.'),
  H2('5.3 Interpretación de las vulnerabilidades críticas'),
  P([t('Inyección SQL (S3649, Blocker). ', { bold: true }), t('La v1 construía las consultas concatenando datos del usuario. La prueba CP-05 demostró el impacto: con el código "\' OR \'1\'=\'1\' --" se ingresaba al sistema sin contraseña.')]),
  codigo(["// v1.0 – ANTES (vulnerable)", "var check = db.prepare(\"SELECT * FROM usuarios WHERE codigo = '\" + codigo +", "                       \"' AND password = '\" + password + \"'\").get();"], 'FEECEB'),
  espacio(),
  codigo(["// v2.0 – DESPUÉS (consulta parametrizada + bcrypt)", "const findByCodigo = db.prepare('SELECT * FROM usuarios WHERE codigo = ?');", "const usuario = findByCodigo.get(String(codigo || '').trim());", "if (bcrypt.compareSync(String(password || ''), usuario.password_hash)) { ... }"], 'E8F6EE'),
  espacio(),
  P([t('Credenciales y secretos en el código (S2068, S6418, Blocker). ', { bold: true }), t('La contraseña del administrador y el secreto de sesión estaban escritos en el código fuente. Ahora se leen de variables de entorno (.env, excluido del repositorio).')]),
  P([t('Contraseñas en texto plano (S5344) y fijación de sesión (S5876), Critical. ', { bold: true }), t('Se reemplazó el almacenamiento en claro por hash bcrypt y se regenera el identificador de sesión al autenticarse.')]),
  P([t('Security Hotspots. ', { bold: true }), t('Se revisaron y corrigieron los 8: cookie sin HttpOnly/Secure (S3330/S2092), cabecera X-Powered-By (S5689), generador pseudoaleatorio en un token (S2245), hash MD5 (S4790), ausencia de CSRF (S4502) y 2 accesos dinámicos a objetos. Además se añadieron cabeceras Content-Security-Policy, X-Content-Type-Options y Referrer-Policy.')]),
  P([t('Mantenibilidad. ', { bold: true }), t('La función POST /reservas concentraba validación, reglas de negocio y persistencia (complejidad cognitiva 37). Se separó en capas (rutas → servicios → datos) y la complejidad máxima bajó a 7. Se eliminaron 44 “var”, 13 comparaciones no estrictas, literales duplicados y código muerto.')]),
  H2('5.4 Cómo completar el análisis en SonarQube Cloud'),
  codigo([
    '# 1. Crear el token en https://sonarcloud.io/account/security',
    '# 2. Añadir la organizacion al archivo sonar-project.properties',
    'sonar.organization=<clave-de-la-organizacion>',
    '',
    '# 3. Ejecutar el escaner con el token en el entorno',
    'set SONAR_TOKEN=<token>',
    'sonar-scanner -Dsonar.host.url=https://sonarcloud.io',
  ]),
  espacio(),
  nota([[t('Estado actual, sin excepciones: ', { bold: true, size: 19 }), t('ESLint sobre src devuelve 0 errores y 1 advertencia (security/detect-non-literal-fs-filename en src/db.js:163, por el mkdirSync de la ruta de la base de datos). El envio a SonarQube Cloud queda pendiente de credenciales y no se ha sustituido por una captura simulada.', { size: 19 })]]),
  salto(),
];

// ---------- 6. Backlog (horizontal) ----------
const backlogSec = [
  H1('6. Backlog de refactorización'),
  P(`El backlog priorizó primero las vulnerabilidades Blocker/Critical y los bugs de los flujos críticos. Contiene ${backlog.length} ítems: ${backlog.filter((b) => b.estado === 'Resuelto').length} resueltos en la v2.0 con evidencia de cierre (prueba que pasa o regla en 0) y ${backlog.filter((b) => b.estado !== 'Resuelto').length} abiertos, detectados por la prueba de carga y con propuesta de solución y esfuerzo estimado. Esfuerzo total registrado: ${fmt(backlog.reduce((a, b) => a + b.esfuerzo_h, 0))} h.`),
  tabla(['ID', 'Tipo', 'Severidad', 'Regla / criterio', 'Defecto detectado', 'Solución aplicada o propuesta', 'Origen', 'Esf. (h)', 'Estado'],
    backlog.map((b) => [b.id, b.tipo, b.severidad, b.regla, b.defecto, b.solucion, b.origen, fmt(b.esfuerzo_h), b.estado]),
    [700, 1150, 900, 1250, 3600, 3600, 1600, 700, 1070], {
      size: 15,
      estilo: (c, i) => (i === 8 ? { bold: true, color: c === 'Resuelto' ? '0F7B4F' : '93370D' } : i === 2 && ['Blocker', 'Critical'].includes(c) ? { bold: true, color: 'B42318' } : {}),
    }),
];

// ---------- 7. Conclusiones ----------
const concl = [
  H1('7. Conclusiones y veredicto de calidad'),
  P([t('LabTrack v2.0 queda apto para su pase a producción en su carga objetivo: 25 de 25 casos automatizados aprobados, cero incidencias de seguridad o fiabilidad abiertas con las reglas de SonarSource y un p95 de 21 ms con 100 usuarios concurrentes, unas 47 veces por debajo del umbral acordado de 1000 ms. La certificación se emite con las condiciones que se detallan a continuación.', { bold: true })]),
  B('Automatización: 25/25 casos aprobados (Login 8/8, Reservas 6/6), frente a 15/23 en la v1.'),
  B('Rendimiento: cumple con 100 usuarios (p95 21 ms) y con 200 usuarios (p95 156 ms). No cumple con 400 usuarios: 24,37 % de fallos del catálogo y p95 de 8,55 s en la rampa de 30 s; al repartir los inicios de sesión en 120 s los fallos desaparecen pero el p95 sigue en 3,49 s. El límite observado está entre 200 y 400 usuarios concurrentes, en este entorno y no en la capacidad universal del sistema.'),
  B([t('Causa raíz del límite: ', { bold: true }), t('el login usa bcrypt.compareSync (92 ms medidos por verificación, unos 37 s de hilo bloqueado con 400 logins). Está registrada como RF-21, junto con RF-22 y RF-23 (consultas sincrónicas y rechazo de conexiones bajo saturación), todas con propuesta y esfuerzo estimado.')]),
  B('Salud del código: las incidencias detectadas con el motor de reglas SonarJS y la revisión manual bajaron de 82 a 0 y las calificaciones estimadas son A en seguridad, fiabilidad y mantenibilidad. Queda 1 advertencia de ESLint (ruta no literal en mkdirSync) y el Quality Gate oficial de SonarQube Cloud está pendiente de credenciales: no se declara como aprobado.'),
  B('Proceso: la IA aportó 11 ideas de prueba; tras la validación humana, 7 se automatizaron (4 detectaron defectos reales) y 4 se rechazaron, difirieron o reformularon.'),
  B([t('Alcance de la evidencia: ', { bold: true }), t('la cobertura instrumentada cubre las pruebas de base de datos, no la ejecución de Selenium; las cifras de carga provienen de k6 y no de JMeter, tal como se declara en la sección 4.')]),
  H2('Recomendaciones para producción'),
  B('Ejecutar la suite Selenium y el análisis estático en un pipeline de integración continua en cada cambio.'),
  B('Atender RF-21 (bcrypt asíncrono) antes de exponer el sistema a picos de inicio de sesión, y repetir la prueba de carga con el generador en otra máquina y sobre la base de datos definitiva.'),
  B('Completar el envío a SonarQube Cloud con el token del equipo para obtener el Quality Gate oficial, y repetir la misma prueba con JMeter para cumplir la guía al pie de la letra.'),
  B('Automatizar el caso diferido IA-10 (desbloqueo a los 15 minutos) y migrar la base de datos SQLite a un motor gestionado con copias de seguridad.'),
  H2('Anexo: estructura del código fuente entregado'),
  codigo(['LabTrack/', '├── src/            app.js, server.js, db.js, services/, views/, public/', '├── legacy/         app_v1.js (línea base “antes”, solo como evidencia)', '├── tests/selenium/ 01_login, 02_catalogo, 03_reservas, 04_admin (+ helpers.js)', '├── tests/k6/       catalogo.js (prueba de carga de esta revision)', '├── tests/jmeter/   LabTrack_Carga_Catalogo.jmx, usuarios.csv (no re-ejecutado)', '├── tests/unit/     db.test.js (integridad, servicios y vistas)', '├── reports/        selenium/, carga/, sonar/, graficas/, evidencias/', '├── docs/           generar_informe.js, datos_informe.js, informe en PDF y DOCX', '├── sonar-project.properties · eslint.config.mjs · .env.example', '└── README.md       instrucciones de instalación y ejecución']),
];

// ---------- documento ----------
const encabezado = new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t('LabTrack – Informe técnico de calidad y pruebas', { size: 16, color: '7A7A7A' })] })] });
const pie = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [t('Página ', { size: 16, color: '7A7A7A' }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '7A7A7A' })] })] });
const vertical = { page: { size: A4, margin: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN } } };
const horizontal = { page: { size: { ...A4, orientation: PageOrientation.LANDSCAPE }, margin: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN } } };

const doc = new Document({
  creator: 'Equipo LabTrack',
  title: 'Informe Técnico LabTrack',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 30, bold: true, color: AZUL }, paragraph: { spacing: { before: 240, after: 160 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, color: '2A4A7B' }, paragraph: { spacing: { before: 200, after: 100 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: 'vinetas', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [
    { properties: vertical, children: [...portada, ...indice, ...intro] },
    { properties: { ...horizontal, type: SectionType.NEXT_PAGE }, headers: { default: encabezado }, footers: { default: pie }, children: matriz },
    { properties: { ...vertical, type: SectionType.NEXT_PAGE }, headers: { default: encabezado }, footers: { default: pie }, children: [...automat, ...carg, ...sonar] },
    { properties: { ...horizontal, type: SectionType.NEXT_PAGE }, headers: { default: encabezado }, footers: { default: pie }, children: backlogSec },
    { properties: { ...vertical, type: SectionType.NEXT_PAGE }, headers: { default: encabezado }, footers: { default: pie }, children: concl },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, 'Informe_Tecnico_LabTrack.docx');
  fs.writeFileSync(out, buf);
  console.log('Generado', out);
});
