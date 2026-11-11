'use strict';
/** HU-03 Reserva de equipos – Flujo crítico (prioridad alta). */
const assert = require('node:assert/strict');
const h = require('./helpers');

const MANANA = h.fechaRelativa(1);
const LAPTOP = 'Laptop Dell Latitude 5440';
const OSCILOSCOPIO = 'Osciloscopio Rigol DS1054Z';

describe('HU-03 Reserva de equipos (flujo crítico)', function () {
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

  /** Aprueba como encargado la primera solicitud pendiente. */
  async function aprobarPrimeraPendiente() {
    await h.logout(driver);
    await h.login(driver, h.USUARIOS.admin.codigo, h.PASS_ENCARGADO);
    await h.clicYEsperar(driver, h.By.css('#tabla-solicitudes .btn-aprobar'));
    await h.logout(driver);
  }

  it('CP-12 Reserva válida de un equipo Disponible queda en estado Pendiente', async () => {
    await h.login(driver, h.USUARIOS.ana.codigo, h.PASS_ESTUDIANTE);
    await h.solicitarReserva(driver, { equipo: LAPTOP, fecha: MANANA, inicio: '10:00', fin: '12:00' });
    assert.match(await h.texto(driver, h.By.id('flash')), /Pendiente/);
    assert.equal(await h.texto(driver, h.By.css('#tabla-mis-reservas .estado-reserva')), 'Pendiente');
    await h.captura(driver, 'CP-12_reserva_pendiente');
  });

  it('CP-13 Se bloquea la reserva que se cruza con una reserva aprobada del mismo equipo', async () => {
    await h.login(driver, h.USUARIOS.ana.codigo, h.PASS_ESTUDIANTE);
    await h.solicitarReserva(driver, { equipo: OSCILOSCOPIO, fecha: MANANA, inicio: '10:00', fin: '12:00' });
    await aprobarPrimeraPendiente();
    await h.login(driver, h.USUARIOS.luis.codigo, h.PASS_ESTUDIANTE);
    await h.solicitarReserva(driver, { equipo: OSCILOSCOPIO, fecha: MANANA, inicio: '11:00', fin: '13:00' });
    assert.equal(
      await h.texto(driver, h.By.id('error-reserva')),
      'El equipo ya tiene una reserva aprobada que se cruza con ese horario.'
    );
    await h.captura(driver, 'CP-13_cruce_horario_bloqueado');
  });

  it('CP-14 Un estudiante no puede tener más de un equipo reservado simultáneamente', async () => {
    await h.login(driver, h.USUARIOS.ana.codigo, h.PASS_ESTUDIANTE);
    await h.solicitarReserva(driver, { equipo: LAPTOP, fecha: MANANA, inicio: '08:00', fin: '10:00' });
    await h.solicitarReserva(driver, { equipo: OSCILOSCOPIO, fecha: MANANA, inicio: '09:00', fin: '11:00' });
    assert.match(await h.texto(driver, h.By.id('error-reserva')), /más de un equipo/);
    await h.captura(driver, 'CP-14_limite_una_reserva');
  });

  it('CP-15 [IA] Hora de fin anterior o igual a la de inicio es rechazada', async () => {
    await h.login(driver, h.USUARIOS.ana.codigo, h.PASS_ESTUDIANTE);
    await h.solicitarReserva(driver, { equipo: LAPTOP, fecha: MANANA, inicio: '14:00', fin: '13:00' });
    assert.match(await h.texto(driver, h.By.id('error-reserva')), /posterior a la hora de inicio/);
  });

  it('CP-16 [IA] Reserva en fecha pasada es rechazada', async () => {
    await h.login(driver, h.USUARIOS.ana.codigo, h.PASS_ESTUDIANTE);
    await h.solicitarReserva(driver, { equipo: LAPTOP, fecha: h.fechaRelativa(-1), inicio: '10:00', fin: '11:00' });
    assert.match(await h.texto(driver, h.By.id('error-reserva')), /ya pasó/);
  });

  it('CP-17 [IA] Un estudiante Penalizado no puede reservar', async () => {
    await h.login(driver, h.USUARIOS.ana.codigo, h.PASS_ESTUDIANTE);
    await h.solicitarReserva(driver, { equipo: LAPTOP, fecha: MANANA, inicio: '08:00', fin: '09:00' });
    await aprobarPrimeraPendiente();
    await h.moverReloj(48);
    await h.login(driver, h.USUARIOS.admin.codigo, h.PASS_ENCARGADO);
    await driver.get(`${h.BASE_URL}/admin/devoluciones`);
    await h.clicYEsperar(driver, h.By.css('.btn-devolucion'));
    await h.logout(driver);
    await h.moverReloj(0);
    await h.login(driver, h.USUARIOS.ana.codigo, h.PASS_ESTUDIANTE);
    await h.solicitarReserva(driver, { equipo: OSCILOSCOPIO, fecha: MANANA, inicio: '15:00', fin: '16:00' });
    assert.match(await h.texto(driver, h.By.id('error-reserva')), /Penalizada/);
  });
});
