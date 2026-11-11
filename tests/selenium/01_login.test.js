'use strict';
/** HU-01 Autenticación segura – Flujo crítico. */
const assert = require('node:assert/strict');
const h = require('./helpers');

describe('HU-01 Autenticación segura (Login)', function () {
  this.timeout(30000);
  let driver;

  before(async () => {
    driver = await h.crearDriver();
  });
  after(async () => driver && driver.quit());
  beforeEach(async () => {
    await h.resetDatos();
    await driver.manage().deleteAllCookies();
  });

  it('CP-01 Login exitoso con código y contraseña válidos muestra el panel personal', async () => {
    await h.login(driver, h.USUARIOS.ana.codigo, h.PASS_ESTUDIANTE);
    assert.match(await driver.getCurrentUrl(), /\/panel$/);
    assert.equal(await h.texto(driver, h.By.id('usuario-actual')), h.USUARIOS.ana.nombre);
    await h.captura(driver, 'CP-01_login_exitoso');
  });

  it('CP-02 Contraseña incorrecta muestra "Credenciales inválidas"', async () => {
    await h.login(driver, h.USUARIOS.ana.codigo, 'ClaveErronea1');
    assert.equal(await h.texto(driver, h.By.id('error-login')), 'Credenciales inválidas');
    await h.captura(driver, 'CP-02_credenciales_invalidas');
  });

  it('CP-03 Código de estudiante inexistente muestra "Credenciales inválidas"', async () => {
    await h.login(driver, 'N00000000', h.PASS_ESTUDIANTE);
    assert.equal(await h.texto(driver, h.By.id('error-login')), 'Credenciales inválidas');
  });

  it('CP-04 Tres intentos fallidos consecutivos bloquean la cuenta y muestran alerta de seguridad', async () => {
    await h.login(driver, h.USUARIOS.luis.codigo, 'x1');
    await h.login(driver, h.USUARIOS.luis.codigo, 'x2');
    await h.login(driver, h.USUARIOS.luis.codigo, 'x3');
    assert.match(await h.texto(driver, h.By.id('alerta-seguridad')), /bloqueada temporalmente/);
    await h.captura(driver, 'CP-04_cuenta_bloqueada');
    // Aun con la contraseña correcta, la cuenta permanece bloqueada.
    await h.login(driver, h.USUARIOS.luis.codigo, h.PASS_ESTUDIANTE);
    assert.match(await h.texto(driver, h.By.id('alerta-seguridad')), /bloqueada temporalmente/);
  });

  it('CP-05 [IA] Intento de inyección SQL en el login es rechazado', async () => {
    await h.login(driver, "' OR '1'='1' --", "' OR '1'='1");
    assert.equal(await h.texto(driver, h.By.id('error-login')), 'Credenciales inválidas');
    assert.match(await driver.getCurrentUrl(), /\/login$/);
  });

  it('CP-06 [IA] Un login exitoso reinicia el contador de intentos fallidos', async () => {
    await h.login(driver, h.USUARIOS.carla.codigo, 'x1');
    await h.login(driver, h.USUARIOS.carla.codigo, 'x2');
    await h.login(driver, h.USUARIOS.carla.codigo, h.PASS_ESTUDIANTE);
    assert.match(await driver.getCurrentUrl(), /\/panel$/);
    await h.logout(driver);
    await h.login(driver, h.USUARIOS.carla.codigo, 'x3');
    assert.equal(await h.texto(driver, h.By.id('error-login')), 'Credenciales inválidas');
  });

  it('CP-07 [IA] Acceder al panel sin sesión redirige al login', async () => {
    await driver.get(`${h.BASE_URL}/panel`);
    assert.match(await driver.getCurrentUrl(), /\/login$/);
  });

  it('CP-08 Login del encargado redirige al panel de administrador', async () => {
    await h.login(driver, h.USUARIOS.admin.codigo, h.PASS_ENCARGADO);
    assert.match(await driver.getCurrentUrl(), /\/admin\/solicitudes$/);
  });
});
