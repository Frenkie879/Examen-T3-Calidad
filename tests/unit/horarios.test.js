'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDb, seed } = require('../../src/db');
const { createReservaService } = require('../../src/services/reservaService');

test('un estudiante puede reservar equipos en horarios no simultáneos', () => {
  const db = createDb(':memory:');
  try {
    seed(db);
    const reservas = createReservaService(db, () => new Date('2030-01-01T08:00:00'));
    assert.equal(reservas.solicitar(1, { equipoId: 1, fecha: '2030-01-02', horaInicio: '09:00', horaFin: '10:00' }).ok, true);
    assert.equal(reservas.solicitar(1, { equipoId: 2, fecha: '2030-01-02', horaInicio: '10:00', horaFin: '11:00' }).ok, true);
    assert.equal(reservas.solicitar(1, { equipoId: 3, fecha: '2030-01-02', horaInicio: '09:30', horaFin: '10:30' }).ok, false);
  } finally { db.close(); }
});

test('una reserva futura aprobada no bloquea otro horario del mismo equipo', () => {
  const db = createDb(':memory:');
  try {
    seed(db);
    let ahora = new Date('2030-01-01T08:00:00');
    const reservas = createReservaService(db, () => ahora);
    assert.equal(reservas.solicitar(1, { equipoId: 1, fecha: '2030-01-02', horaInicio: '09:00', horaFin: '10:00' }).ok, true);
    assert.equal(reservas.aprobar(reservas.pendientes()[0].id).ok, true);
    assert.equal(reservas.equiposEnPrestamo().has(1), false);
    assert.equal(reservas.solicitar(2, { equipoId: 1, fecha: '2030-01-02', horaInicio: '10:00', horaFin: '11:00' }).ok, true);
    assert.equal(reservas.solicitar(3, { equipoId: 1, fecha: '2030-01-02', horaInicio: '09:30', horaFin: '10:30' }).ok, false);
    ahora = new Date('2030-01-02T09:30:00');
    assert.equal(reservas.equiposEnPrestamo().has(1), true);
    ahora = new Date('2030-01-02T10:00:00');
    assert.equal(reservas.equiposEnPrestamo().has(1), false);
  } finally { db.close(); }
});
