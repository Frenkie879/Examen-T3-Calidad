'use strict';
/** HU-02 Catálogo y filtrado de equipos. */
const assert = require('node:assert/strict');
const h = require('./helpers');

describe('HU-02 Catálogo y filtrado de equipos', function () {
  this.timeout(30000);
  let driver;

  before(async () => {
    driver = await h.crearDriver();
    await h.resetDatos();
    await h.login(driver, h.USUARIOS.ana.codigo, h.PASS_ESTUDIANTE);
  });
  after(async () => driver && driver.quit());

  async function filtrar(categoria) {
    await driver.get(`${h.BASE_URL}/catalogo`);
    const select = await driver.findElement(h.By.id('filtro-categoria'));
    await select.findElement(h.By.css(`option[value="${categoria}"]`)).click();
    await h.clicYEsperar(driver, h.By.id('btn-filtrar'));
  }

  it('CP-09 El catálogo muestra nombre, código de inventario, categoría y estado', async () => {
    await driver.get(`${h.BASE_URL}/catalogo`);
    const headers = await driver.findElements(h.By.css('#tabla-catalogo thead th'));
    const textos = await Promise.all(headers.map((th) => th.getText()));
    for (const col of ['Nombre', 'Código inventario', 'Categoría', 'Estado']) {
      assert.ok(textos.includes(col), `Falta la columna ${col}`);
    }
    const filas = await driver.findElements(h.By.css('#tabla-catalogo tbody tr'));
    assert.equal(filas.length, 8);
    await h.captura(driver, 'CP-09_catalogo');
  });

  it('CP-10 El filtro "Electrónica" muestra solo equipos de esa categoría', async () => {
    await filtrar('Electrónica');
    const cats = await driver.findElements(h.By.css('#tabla-catalogo tbody td.categoria'));
    assert.ok(cats.length > 0);
    for (const c of cats) assert.equal(await c.getText(), 'Electrónica');
  });

  it('CP-11 Filtro sin equipos disponibles muestra el mensaje requerido', async () => {
    await filtrar('Redes');
    assert.equal(
      await h.texto(driver, h.By.id('mensaje-vacio')),
      'No hay equipos disponibles en esta categoría'
    );
    await h.captura(driver, 'CP-11_filtro_sin_equipos');
  });

  it('CP-24 El filtro Cómputo muestra exclusivamente equipos de esa categoría', async () => {
    await filtrar('Cómputo');
    const cats = await driver.findElements(h.By.css('#tabla-catalogo tbody td.categoria'));
    assert.ok(cats.length > 0);
    for (const c of cats) assert.equal(await c.getText(), 'Cómputo');
  });

  it('CP-25 El filtro Redes muestra exclusivamente equipos de esa categoría', async () => {
    await filtrar('Redes');
    const cats = await driver.findElements(h.By.css('#tabla-catalogo tbody td.categoria'));
    assert.ok(cats.length > 0);
    for (const c of cats) assert.equal(await c.getText(), 'Redes');
  });
});
