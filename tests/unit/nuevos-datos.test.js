'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createDb, seed } = require('../../src/db');

test('la carga inicial crea diez cuentas de prueba y códigos de equipos correlativos', () => {
  const db = createDb(':memory:');
  try {
    seed(db);
    const usuarios = db.prepare('SELECT codigo_estudiante, contrasenia_hash, id_rol FROM USUARIO ORDER BY id_usuario').all();
    assert.equal(usuarios.length, 10);
    for (const [index, usuario] of usuarios.entries()) {
      const estudiante = index < 5;
      const numero = estudiante ? index + 1 : index - 4;
      assert.equal(usuario.id_rol, estudiante ? 1 : 2);
      assert.match(usuario.codigo_estudiante, estudiante ? /^N00\d{6}$/ : /^ADM00\d{6}$/);
      assert.ok(bcrypt.compareSync(`//${numero}${estudiante ? 'estudiante__' : 'encargadolab**'}`, usuario.contrasenia_hash));
    }
    const equipos = db.prepare('SELECT codigo_inventario FROM EQUIPO ORDER BY id_equipo').all();
    equipos.forEach((equipo, index) => {
      assert.match(equipo.codigo_inventario, /^[A-Z]{3}-[A-Z]{3}-\d{3,}$/);
      assert.equal(Number(equipo.codigo_inventario.split('-')[2]), index + 1);
    });
  } finally {
    db.close();
  }
});
