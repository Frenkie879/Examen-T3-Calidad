# LabTrack – Sistema de Gestión de Laboratorios (v2.0)

Caso de estudio T3 · Calidad y Pruebas de Software · UPN

## Arquitectura

LabTrack es una aplicación web monolítica con renderizado en el servidor. El navegador envía solicitudes a Express, las rutas coordinan los servicios y estos consultan o modifican una base de datos SQLite. Las respuestas HTML se generan con plantillas EJS.

- `src/server.js`: inicia la aplicación, carga los datos iniciales y abre el puerto HTTP.
- `src/app.js`: configura Express, las rutas, las sesiones y la protección CSRF.
- `src/services/`: implementa las reglas de autenticación y reservas.
- `src/db.js`: define el esquema, las conexiones y los datos iniciales de SQLite mediante `node:sqlite`.
- `src/views/` y `src/public/`: contienen las plantillas EJS y los archivos estáticos.

## Requisitos

- Node.js 22.9 o superior, disponible en el PATH. Se recomienda una versión LTS compatible.
- pnpm instalado y disponible globalmente en el PATH.
- Google Chrome para las pruebas Selenium. Selenium Manager puede gestionar ChromeDriver automáticamente.
- Opcionales: Apache JMeter 5.6 y SonarQube/SonarCloud con `sonar-scanner`.

## Configuración inicial

Desde PowerShell, situado en la carpeta raíz del proyecto, comprueba las herramientas e instala las dependencias:

```powershell
node --version
pnpm --version
pnpm install
```

No es necesario crear un archivo `.env`: el proyecto no incluye `.env.example` ni carga archivos `.env` automáticamente. La configuración opcional se establece mediante variables de entorno antes de iniciar:

| Variable | Uso | Valor predeterminado |
| --- | --- | --- |
| `PORT` | Puerto HTTP. | `3000` |
| `LABTRACK_DB` | Ruta de la base SQLite o `:memory:`. | `data/labtrack.sqlite`; en pruebas, `:memory:`. |
| `SESSION_SECRET` | Secreto para firmar las sesiones. | Temporal en desarrollo; obligatorio en producción. |
| `NODE_ENV` | Entorno de ejecución. | Si no se define, se usa la configuración de desarrollo. |

Por ejemplo, para usar otro puerto en la sesión actual de PowerShell:

```powershell
$env:PORT = "3001"
pnpm run start
```

En producción, define `NODE_ENV=production` y un `SESSION_SECRET` robusto mediante variables de entorno externas. No publiques secretos ni uses las cuentas de ejemplo en producción.

## Ejecutar la aplicación

En la raíz del proyecto:

```powershell
pnpm run start
```

Con el servidor en ejecución, visita [http://localhost:3000](http://localhost:3000). Para abrirlo desde PowerShell, usa otra terminal:

```powershell
Start-Process "http://localhost:3000"
```

Si configuraste otro puerto, cambia la dirección. Para detener el servidor, presiona `Ctrl+C` en la terminal donde se ejecuta.

Las diez cuentas ficticias de prueba y sus contraseñas están en `src/db.js`. La contraseña se almacena con bcrypt y salt; las contraseñas en el código son públicas y solo para pruebas. Ejemplos: estudiante `N00471826` / `//1estudiante__`; encargado `ADM00640927` / `//1encargadolab**`. No utilizar estas cuentas en producción.

## Base de datos normalizada

- El modelo de `src/db.js` contiene `ROL`, `OPCION_MENU`, `ROL_OPCION_MENU`, `ESTADO_USUARIO`, `USUARIO`, `PERMISO`, `CATEGORIA`, `ESTADO_EQUIPO`, `EQUIPO`, `ESTADO_RESERVA` y `RESERVA`.
- Los tipos conceptuales del Mermaid se traducen a `SMALLINT`, `INTEGER`, `BIGINT`, `VARCHAR(n)`, `BOOLEAN`, `DATE`, `TIME` y `DATETIME`. SQLite aplica afinidades, no los límites de SQL Server: `VARCHAR(n)` no limita automáticamente la longitud y los tipos temporales no tienen almacenamiento nativo. Las restricciones explícitas validan booleanos, IDs de catálogo, fechas, horarios y otros campos.
- Los IDs autogenerados usan `INTEGER PRIMARY KEY`, un entero con signo de 64 bits en SQLite. Es la alternativa a `BIGINT PRIMARY KEY` que conserva la generación automática. `PERMISO` también usa este mecanismo en lugar de un tipo entero de tamaño medio específico de otro motor.
- Las fechas usan `YYYY-MM-DD`, los horarios `HH:MM` y la devolución una cadena ISO 8601 en UTC. `tiempo_bloqueo` usa `BIGINT` con milisegundos desde epoch porque representa el instante de fin del bloqueo, no una hora del día.
- Las vistas `vista_usuarios`, `vista_equipos` y `vista_reservas` adaptan las lecturas a los nombres esperados por la aplicación. Las escrituras se realizan en las tablas normalizadas. Las tablas de menús y permisos se cargan como datos, pero no reemplazan el control de roles ni la navegación existentes.
- Fuera del modo test, la base predeterminada es `data/labtrack.sqlite`. `LABTRACK_DB` permite elegir otro archivo (su carpeta se crea si falta) o `:memory:`. No apuntar a bases con datos reales.
- **Migración destructiva única:** al iniciar por primera vez esta versión sobre una base anterior, se eliminan las reservas, usuarios y equipos existentes y se cargan los nuevos datos. Se marca la base para no repetir el borrado en arranques posteriores. No ejecutar sobre datos que deban conservarse.
- Una base con las tablas antiguas `usuarios`, `equipos` o `reservas` se rechaza sin borrar datos. Utilizar un archivo nuevo o preparar una migración; `CREATE TABLE IF NOT EXISTS` no migra esquemas.
- En `NODE_ENV=test`, el valor predeterminado es `:memory:`. El endpoint `/__test__/reset` sí borra y recarga los datos: usar exclusivamente una base aislada y descartable para las pruebas.
- En desarrollo se genera un secreto de sesión temporal; las sesiones se pierden al reiniciar. En producción es obligatorio establecer `SESSION_SECRET` por una variable de entorno externa, sin usar un archivo `.env`.

Pruebas de integridad, persistencia y servicios, sin navegador ni servidor separado:

```powershell
pnpm run test:db
```

## Pruebas automatizadas (Selenium)
```powershell
pnpm run start:test         # terminal 1: servidor en modo prueba
pnpm run test:selenium      # terminal 2: resultados en reports/selenium/
```
Salidas: `junit-selenium.xml` (importable en Testomat.io / TestLink), `html/reporte-selenium.html` y capturas en `capturas/`.
Para ver el navegador abriéndose: `pnpm run test:selenium:visible`. Las pruebas reinician los datos compartidos: usa una base aislada y no ejecutes varias suites simultáneamente contra el mismo servidor.

Comparación con la línea base: `pnpm run start:v1` (terminal 1) y `pnpm run test:selenium:v1` (terminal 2).

## Prueba de carga
JMeter (recomendado para las capturas oficiales), desde `tests/jmeter/`:
```bash
jmeter -n -t LabTrack_Carga_Catalogo.jmx -l resultados.jtl -e -o reporte_html -Jusuarios=100 -Jrampup=30 -Jduracion=120
```
Ejecutor equivalente en Node (genera `.jtl` compatible con JMeter y usa las credenciales ficticias de v2; para v1 en el puerto 3001 conserva la variable de contraseña):
```bash
pnpm run test:load 100 30 120 100u
```

## Análisis estático
```bash
pnpm exec eslint legacy    # línea base v1, con defectos intencionales
pnpm exec eslint src       # aplicación v2
sonar-scanner              # usa sonar-project.properties
```

## Estructura
- `src/` aplicación v2.0 (rutas, servicios, datos, vistas)
- `legacy/app_v1.js` línea base v1.0 con defectos (solo evidencia, no desplegar)
- `tests/` Selenium, JMeter, ejecutor de carga
- `tests/unit/` pruebas de base de datos y servicios; `tests/k6/` prueba de carga con k6
- `reports/` resultados reales: selenium, carga, sonar, gráficas
- `docs/` informe técnico y su generador
