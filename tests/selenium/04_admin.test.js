'use strict';
/** HU-04 Gestión de solicitudes y HU-05 Devolución con penalización automática. */
const assert = require('node:assert/strict');
const h = require('./helpers');

const MANANA = h.fechaRelativa(1);
const LAPTOP = 'Laptop Dell Latitude 5440';
const ARDUINO = 'Kit Arduino Mega 2560';

describe('HU-04 / HU-05 Panel del encargado', function () {
  this.timeout(45000);
  let driver;

  before(async () => {
    driver = await h.crearDriver();
  });
  after(async () => driver && driver.quit());
  beforeEach(async () => {
    await h.resetDatos();
    await driver.manage().deleteAllCookies();
  });

  async function solicitarComo(usuario, datos) {
    await h.login(driver, usuario.codigo, h.PASS_ESTUDIANTE);
    await h.solicitarReserva(driver, datos);
    await h.logout(driver);
  }
  async function entrarComoAdmin(ruta = '/admin/solicitudes') {
    await h.login(driver, h.USUARIOS.admin.codigo, h.PASS_ENCARGADO);
    await driver.get(`${h.BASE_URL}${ruta}`);
  }
  async function estadoEnCatalogo(equipo) {
    await h.logout(driver);
    await h.login(driver, h.USUARIOS.carla.codigo, h.PASS_ESTUDIANTE);
    await driver.get(`${h.BASE_URL}/catalogo`);
    return h.texto(driver, h.By.xpath(`//tr[td[contains(., '${equipo}')]]//span`));
  }

  it('CP-18 El panel muestra estudiante, equipo, fecha/hora y botones Aprobar/Rechazar', async () => {
    await solicitarComo(h.USUARIOS.ana, { equipo: LAPTOP, fecha: MANANA, inicio: '09:00', fin: '11:00' });
    await entrarComoAdmin();
    const fila = await driver.findElement(h.By.css('#tabla-solicitudes tbody tr'));
    const txt = await fila.getText();
    assert.match(txt, /Ana Torres/);
    assert.match(txt, new RegExp(LAPTOP));
    assert.match(txt, /09:00–11:00/);
    assert.ok(await fila.findElement(h.By.css('.btn-aprobar')).isDisplayed());
    assert.ok(await fila.findElement(h.By.css('.btn-rechazar')).isDisplayed());
    await h.captura(driver, 'CP-18_panel_solicitudes');
  });

  it('CP-19 Aprobar una reserva futura mantiene el equipo disponible fuera del horario', async () => {
    await solicitarComo(h.USUARIOS.ana, { equipo: LAPTOP, fecha: MANANA, inicio: '09:00', fin: '11:00' });
    await entrarComoAdmin();
    await h.clicYEsperar(driver, h.By.css('.btn-aprobar'));
    assert.match(await h.texto(driver, h.By.id('flash')), /aprobada/i);
    assert.equal(await estadoEnCatalogo(LAPTOP), 'Disponible');
  });

  it('CP-20 Rechazar sin motivo es bloqueado; con motivo cambia a Rechazada', async () => {
    await solicitarComo(h.USUARIOS.ana, { equipo: LAPTOP, fecha: MANANA, inicio: '09:00', fin: '11:00' });
    await entrarComoAdmin();
    await h.clicYEsperar(driver, h.By.css('.btn-rechazar'));
    assert.match(await h.texto(driver, h.By.id('flash')), /Debe ingresar un motivo/);
    await driver.findElement(h.By.css('.motivo')).sendKeys('Equipo en mantenimiento');
    await h.clicYEsperar(driver, h.By.css('.btn-rechazar'));
    assert.match(await h.texto(driver, h.By.id('flash')), /rechazada/i);
    await h.logout(driver);
    await h.login(driver, h.USUARIOS.ana.codigo, h.PASS_ESTUDIANTE);
    const fila = await h.texto(driver, h.By.css('#tabla-mis-reservas tbody tr'));
    assert.match(fila, /Rechazada/);
    assert.match(fila, /Equipo en mantenimiento/);
    await h.captura(driver, 'CP-20_rechazo_con_motivo');
  });

  it('CP-21 [IA] No se aprueba una segunda solicitud que se cruza con otra ya aprobada', async () => {
    await solicitarComo(h.USUARIOS.ana, { equipo: ARDUINO, fecha: MANANA, inicio: '10:00', fin: '12:00' });
    await solicitarComo(h.USUARIOS.luis, { equipo: ARDUINO, fecha: MANANA, inicio: '11:00', fin: '13:00' });
    await entrarComoAdmin();
    await h.clicYEsperar(driver, h.By.css('.btn-aprobar'));
    await h.clicYEsperar(driver, h.By.css('.btn-aprobar'));
    assert.match(await h.texto(driver, h.By.id('flash')), /se cruza con ese horario/);
  });

  it('CP-22 Devolución dentro del plazo: equipo Disponible y estudiante Activo', async () => {
    await solicitarComo(h.USUARIOS.ana, { equipo: LAPTOP, fecha: MANANA, inicio: '09:00', fin: '11:00' });
    await entrarComoAdmin();
    await h.clicYEsperar(driver, h.By.css('.btn-aprobar'));
    await driver.get(`${h.BASE_URL}/admin/devoluciones`);
    await driver.findElement(h.By.id('buscar')).sendKeys(h.USUARIOS.ana.codigo);
    await h.clicYEsperar(driver, h.By.id('btn-buscar'));
    await h.clicYEsperar(driver, h.By.css('.btn-devolucion'));
    assert.equal(await h.texto(driver, h.By.id('flash')), 'Devolución registrada. Equipo Disponible.');
    assert.equal(await estadoEnCatalogo(LAPTOP), 'Disponible');
    await h.logout(driver);
    await h.login(driver, h.USUARIOS.ana.codigo, h.PASS_ESTUDIANTE);
    assert.equal(await h.texto(driver, h.By.id('estado-cuenta')), 'Activo');
  });

  it('CP-23 Devolución fuera de plazo penaliza automáticamente al estudiante', async () => {
    await solicitarComo(h.USUARIOS.ana, { equipo: LAPTOP, fecha: MANANA, inicio: '09:00', fin: '11:00' });
    await entrarComoAdmin();
    await h.clicYEsperar(driver, h.By.css('.btn-aprobar'));
    await h.moverReloj(48); // se simula que la devolución ocurre 2 días después
    await driver.get(`${h.BASE_URL}/admin/devoluciones`);
    await h.clicYEsperar(driver, h.By.css('.btn-devolucion'));
    assert.match(await h.texto(driver, h.By.id('flash')), /Penalizado/);
    await h.captura(driver, 'CP-23_devolucion_tardia_penalizacion');
    await h.logout(driver);
    await h.login(driver, h.USUARIOS.ana.codigo, h.PASS_ESTUDIANTE);
    assert.equal(await h.texto(driver, h.By.id('estado-cuenta')), 'Penalizado');
  });
});
