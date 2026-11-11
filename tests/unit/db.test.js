'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createDb, seed, resetTestData, transaction } = require('../../src/db');
const { createAuthService } = require('../../src/services/authService');
const { createReservaService } = require('../../src/services/reservaService');

test('el modelo impide referencias inexistentes y booleanos inválidos', () => {
  const db = createDb(':memory:');
  try {
    seed(db);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n, 11);
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.throws(() => db.exec("INSERT INTO EQUIPO (nombre_equipo,codigo_inventario,id_categoria,id_estado_equipo) VALUES ('Inválido','TEST',999,1)"));
    assert.throws(() => db.exec('UPDATE ROL SET estaActivo=2 WHERE id_rol=1'));
    assert.throws(() => db.exec("INSERT INTO RESERVA(id_usuario,id_equipo,fecha,hora_inicio,hora_fin) VALUES(1,1,'2030-01-02','09:00','08:00')"));
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});

test('la carga inicial no duplica ni sobrescribe datos al reabrir un archivo', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'labtrack-db-'));
  const file = path.join(folder, 'test.sqlite');
  let db;
  try {
    db = createDb(file);
    seed(db);
    db.exec("UPDATE USUARIO SET nombres='Ana modificada' WHERE codigo_estudiante='N00471826'");
    db.close();
    db = createDb(file);
    seed(db);
    assert.equal(db.prepare('SELECT count(*) AS n FROM USUARIO').get().n, 10);
    assert.equal(db.prepare("SELECT nombres FROM USUARIO WHERE codigo_estudiante='N00471826'").get().nombres, 'Ana modificada');
  } finally {
    if (db?.isOpen) db.close();
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test('autenticación, bloqueo y flujo de reserva usan el esquema normalizado', () => {
  const db = createDb(':memory:');
  try {
    seed(db);
    const auth = createAuthService(db, () => new Date('2030-01-01T08:00:00').getTime());
    assert.equal(auth.autenticar('N00471826', '//1estudiante__').ok, true);
    for (let i = 0; i < 3; i++) auth.autenticar('N00832614', 'incorrecta');
    assert.equal(auth.autenticar('N00832614', '//2estudiante__').bloqueado, true);
    const ana = db.prepare("SELECT id_usuario FROM USUARIO WHERE codigo_estudiante='N00471826'").get().id_usuario;
    const equipo = db.prepare("SELECT id_equipo FROM EQUIPO WHERE codigo_inventario='COM-LAP-001'").get().id_equipo;
    let now = new Date('2030-01-01T08:00:00');
    const reservas = createReservaService(db, () => now);
    assert.equal(reservas.solicitar(ana, { equipoId: equipo, fecha: '2030-01-02', horaInicio: '09:00', horaFin: '10:00' }).ok, true);
    const id = reservas.pendientes()[0].id;
    assert.equal(reservas.aprobar(id).ok, true);
    now = new Date('2030-01-02T11:00:00');
    assert.equal(reservas.marcarDevolucion(id).penalizado, true);
    assert.equal(db.prepare('SELECT fecha_hora_devolucion FROM RESERVA WHERE id_reserva=?').get(id).fecha_hora_devolucion, now.toISOString());
    assert.equal(reservas.delUsuario(ana)[0].estado, 'Devuelta');
    assert.equal(db.prepare('SELECT estado FROM vista_usuarios WHERE id=?').get(ana).estado, 'Penalizado');
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      resetTestData(db);
      assert.equal(reservas.delUsuario(ana).length, 0);
      assert.equal(auth.autenticar('N00832614', '//2estudiante__').ok, true);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  } finally { db.close(); }
});

test('rechaza una base antigua sin borrar sus datos', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'labtrack-old-'));
  const file = path.join(folder, 'old.sqlite');
  try {
    const old = new DatabaseSync(file);
    old.exec("CREATE TABLE usuarios(id INTEGER PRIMARY KEY, nombre TEXT); INSERT INTO usuarios VALUES(1,'Conservar')");
    old.close();
    assert.throws(() => createDb(file), /esquema anterior/i);
    const check = new DatabaseSync(file);
    assert.equal(check.prepare('SELECT nombre FROM usuarios').get().nombre, 'Conservar');
    check.close();
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('una transacción fallida revierte los cambios parciales', () => {
  const db = createDb(':memory:');
  try {
    seed(db);
    assert.throws(() => transaction(db, () => {
      db.exec("UPDATE EQUIPO SET nombre_equipo='No conservar' WHERE id_equipo=1");
      db.exec('UPDATE EQUIPO SET id_categoria=999 WHERE id_equipo=1');
    }));
    assert.equal(db.prepare('SELECT nombre_equipo FROM EQUIPO WHERE id_equipo=1').get().nombre_equipo, 'Laptop Dell Latitude 5440');
  } finally { db.close(); }
});

test('el rechazo exige motivo y conserva equipo disponible', () => {
  const db = createDb(':memory:');
  try {
    seed(db);
    const reservas = createReservaService(db, () => new Date('2030-01-01T08:00:00'));
    assert.equal(reservas.solicitar(1, { equipoId: 1, fecha: '2030-01-02', horaInicio: '09:00', horaFin: '10:00' }).ok, true);
    const id = reservas.pendientes()[0].id;
    assert.equal(reservas.rechazar(id, ' ').ok, false);
    assert.equal(reservas.rechazar(id, 'Equipo en mantenimiento').ok, true);
    assert.equal(reservas.delUsuario(1)[0].estado, 'Rechazada');
    assert.equal(db.prepare('SELECT estado FROM vista_equipos WHERE id=1').get().estado, 'Disponible');
  } finally { db.close(); }
});

test('el reinicio destructivo se rechaza fuera del entorno test', () => {
  const db = createDb(':memory:');
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    seed(db);
    assert.throws(() => resetTestData(db), /solo está permitido/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM USUARIO').get().n, 10);
  } finally {
    db.close();
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
