'use strict';
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const { TEST_PASSWORDS } = require('../../src/db');
const baseline = new URL(BASE_URL).port === '3001';
const PASS_ESTUDIANTE = baseline ? process.env.LABTRACK_PASS_ESTUDIANTE : TEST_PASSWORDS.estudiante;
const PASS_ENCARGADO = baseline ? process.env.LABTRACK_PASS_ENCARGADO : TEST_PASSWORDS.encargado;
const SHOTS_DIR = process.env.SELENIUM_SHOTS_DIR || path.join(__dirname, '..', '..', 'reports', 'selenium', 'capturas');

const USUARIOS = Object.freeze({
  ana: { codigo: baseline ? 'N00123456' : 'N00471826', nombre: 'Ana Torres' },
  luis: { codigo: baseline ? 'N00654321' : 'N00832614', nombre: 'Luis Ramírez' },
  carla: { codigo: baseline ? 'N00999888' : 'N00520973', nombre: 'Carla Mendoza' },
  admin: { codigo: baseline ? 'ADM001' : 'ADM00640927', nombre: baseline ? 'Encargado Lab' : 'Elena Paredes' },
});

async function crearDriver() {
  const options = new chrome.Options().addArguments('--window-size=1366,900', '--lang=es-PE');
  if (process.env.HEADLESS !== 'false') options.addArguments('--headless=new', '--no-sandbox');
  if (process.env.CHROME_BIN) options.setChromeBinaryPath(process.env.CHROME_BIN);
  const builder = new Builder().forBrowser('chrome').setChromeOptions(options);
  // En equipos locales Selenium Manager resuelve el driver automáticamente.
  if (process.env.CHROMEDRIVER_PATH) {
    const service = new chrome.ServiceBuilder(process.env.CHROMEDRIVER_PATH);
    if (process.env.CHROMEDRIVER_SKIP_VERSION_CHECK) service.addArguments('--disable-build-check');
    builder.setChromeService(service);
  }
  return builder.build();
}

async function resetDatos() {
  const r = await fetch(`${BASE_URL}/__test__/reset`, { method: 'POST' });
  if (r.status !== 204) throw new Error(`No se pudo reiniciar datos de prueba: ${r.status}`);
}

async function moverReloj(horas) {
  await fetch(`${BASE_URL}/__test__/reloj?horas=${horas}`, { method: 'POST' });
}

/** Hace clic y espera a que el navegador cargue la página siguiente (espera explícita). */
async function clicYEsperar(driver, elementoOLocator, timeout = 6000) {
  const el = typeof elementoOLocator.click === 'function' ? elementoOLocator : await driver.findElement(elementoOLocator);
  // Se marca la página actual; la nueva página cargada no tendrá la marca.
  await driver.executeScript('window.__paginaAnterior = true;');
  await el.click();
  await driver.wait(async () => {
    try {
      return await driver.executeScript(
        "return window.__paginaAnterior !== true && document.readyState === 'complete';"
      );
    } catch {
      return false; // navegación en curso
    }
  }, timeout);
}

async function login(driver, codigo, password) {
  if (!baseline && password === PASS_ESTUDIANTE) {
    if (codigo === USUARIOS.luis.codigo) password = '//2estudiante__';
    if (codigo === USUARIOS.carla.codigo) password = '//3estudiante__';
  }
  await driver.get(`${BASE_URL}/login`);
  await driver.findElement(By.id('codigo')).clear();
  await driver.findElement(By.id('codigo')).sendKeys(codigo);
  await driver.findElement(By.id('password')).sendKeys(password);
  await clicYEsperar(driver, By.id('btn-login'));
}

async function logout(driver) {
  const btn = await driver.findElements(By.id('btn-logout'));
  if (btn.length) await clicYEsperar(driver, btn[0]);
  await driver.manage().deleteAllCookies();
}

async function texto(driver, locator, timeout = 4000) {
  const el = await driver.wait(until.elementLocated(locator), timeout);
  return el.getText();
}

/** Asigna valores a inputs date/time de forma independiente al idioma del navegador. */
async function setValor(driver, id, valor) {
  const el = await driver.findElement(By.id(id));
  await driver.executeScript('arguments[0].value = arguments[1];', el, valor);
}

async function solicitarReserva(driver, { equipo, fecha, inicio, fin }) {
  await driver.get(`${BASE_URL}/reservas/nueva`);
  const select = await driver.findElement(By.id('equipo_id'));
  await select.findElement(By.xpath(`.//option[contains(., '${equipo}')]`)).click();
  await setValor(driver, 'fecha', fecha);
  await setValor(driver, 'hora_inicio', inicio);
  await setValor(driver, 'hora_fin', fin);
  await clicYEsperar(driver, By.id('btn-reservar'));
}

async function captura(driver, nombre) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const png = await driver.takeScreenshot();
  fs.writeFileSync(path.join(SHOTS_DIR, `${nombre}.png`), png, 'base64');
}

function fechaRelativa(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

module.exports = {
  BASE_URL,
  PASS_ESTUDIANTE,
  PASS_ENCARGADO,
  USUARIOS,
  By,
  until,
  crearDriver,
  resetDatos,
  moverReloj,
  clicYEsperar,
  login,
  logout,
  texto,
  setValor,
  solicitarReserva,
  captura,
  fechaRelativa,
};
