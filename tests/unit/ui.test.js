'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');

test('login muestra identidad institucional y conserva los campos y CSRF', async () => {
  const html = await ejs.renderFile(path.join(__dirname, '../../src/views/login.ejs'), {
    usuario: null, flash: null, csrf: 'test-token', error: null, bloqueado: false, codigo: '',
  });
  assert.match(html, /\/static\/images\/upn-logo\.png/);
  assert.match(html, /rel="icon"/);
  assert.match(html, /name="_csrf" value="test-token"/);
  assert.match(html, /name="codigo"/);
  assert.match(html, /name="password"/);
});

test('login guía cada campo con ayuda, icono y botón para ver la contraseña', async () => {
  const html = await ejs.renderFile(path.join(__dirname, '../../src/views/login.ejs'), {
    usuario: null, flash: null, csrf: 'test-token', error: null, bloqueado: false, codigo: '',
  });
  assert.match(html, /id="codigo"[^>]*aria-describedby="codigo-ayuda"/);
  assert.match(html, /id="password"[^>]*aria-describedby="password-ayuda"/);
  assert.match(html, /id="codigo-ayuda"[\s\S]*?N00/);
  assert.match(html, /id="password-ayuda"[\s\S]*?mayúsculas/);
  assert.match(html, /class="input-icon"[^>]*aria-hidden="true"/);
  assert.match(html, /type="button"[^>]*id="ver-password"[^>]*aria-label="Mostrar contraseña"/);
  assert.match(html, /id="ver-password"[\s\S]*?data-icon="eye"[\s\S]*?data-icon="eye-off"/);
  assert.match(html, /src="\/static\/login\.js" defer/);
});

test('el encabezado muestra nombre completo y rol del usuario autenticado', async () => {
  const html = await ejs.renderFile(path.join(__dirname, '../../src/views/panel.ejs'), {
    usuario: { nombre: 'Ana Torres', rol: 'estudiante' }, flash: null, csrf: 'test-token',
    estado: 'Activo', misReservas: [],
  });
  assert.match(html, /class="header-user-name"[^>]*>Ana Torres</);
  assert.match(html, /class="header-user-role"[^>]*>Estudiante</);
});

test('el encabezado muestra nombre completo y rol del encargado', async () => {
  const html = await ejs.renderFile(path.join(__dirname, '../../src/views/admin_solicitudes.ejs'), {
    usuario: { nombre: 'Elena Paredes', rol: 'encargado' }, flash: null, csrf: 'test-token', pendientes: [],
  });
  assert.match(html, /class="header-user-name"[^>]*>Elena Paredes</);
  assert.match(html, /class="header-user-role"[^>]*>Encargado de laboratorio</);
});
