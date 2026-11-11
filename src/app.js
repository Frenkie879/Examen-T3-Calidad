'use strict';
/**
 * LabTrack – Sistema de Gestión de Laboratorios (versión 2.0, refactorizada).
 */
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');

const { createDb, resetTestData, CATEGORIAS, ESTADO_EQUIPO } = require('./db');
const { createAuthService } = require('./services/authService');
const { createReservaService } = require('./services/reservaService');

const MSG_SIN_EQUIPOS = 'No hay equipos disponibles en esta categoría';
const RUTA = Object.freeze({
  LOGIN: '/login',
  PANEL: '/panel',
  SOLICITUDES: '/admin/solicitudes',
  DEVOLUCIONES: '/admin/devoluciones',
});

function createApp({ db = createDb(), sessionSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? undefined : crypto.randomBytes(32).toString('hex')) } = {}) {
  if (!sessionSecret) throw new Error('Falta la variable de entorno SESSION_SECRET');

  // Reloj de la aplicación; en el entorno de pruebas puede desplazarse para simular el paso del tiempo.
  let desfaseMs = 0;
  const ahora = () => new Date(Date.now() + desfaseMs);
  const auth = createAuthService(db, () => ahora().getTime());
  const reservas = createReservaService(db, ahora);
  const app = express();

  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  // Endpoint de soporte solo para el entorno de pruebas automatizadas (no existe en producción).
  if (process.env.NODE_ENV === 'test') {
    app.post('/__test__/reset', (req, res) => {
      resetTestData(db);
      desfaseMs = 0;
      res.sendStatus(204);
    });
    app.post('/__test__/reloj', (req, res) => {
      desfaseMs = Number(req.query.horas || 0) * 3_600_000;
      res.sendStatus(204);
    });
  }
  app.use('/static', express.static(path.join(__dirname, 'public'), { dotfiles: 'deny' }));
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });
  app.use(
    session({
      name: 'labtrack.sid',
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 60_000,
      },
    })
  );

  // Protección CSRF basada en token de sesión (patrón synchronizer token).
  app.use((req, res, next) => {
    req.session.csrf ??= crypto.randomBytes(24).toString('hex');
    res.locals.csrf = req.session.csrf;
    res.locals.usuario = req.session.usuario || null;
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    if (req.method === 'POST' && req.body._csrf !== req.session.csrf) {
      return res.status(403).send('Token CSRF inválido');
    }
    return next();
  });

  const flash = (req, tipo, texto) => {
    req.session.flash = { tipo, texto };
  };
  const requiereRol = (rol) => (req, res, next) =>
    req.session.usuario?.rol === rol ? next() : res.redirect(RUTA.LOGIN);

  // ---------- HU-01 Autenticación ----------
  app.get('/', (req, res) => res.redirect(req.session.usuario ? RUTA.PANEL : RUTA.LOGIN));
  app.get(RUTA.LOGIN, (req, res) => res.render('login', { error: null, bloqueado: false, codigo: '' }));
  app.post(RUTA.LOGIN, (req, res, next) => {
    const { codigo, password } = req.body;
    const resultado = auth.autenticar(codigo, password);
    if (!resultado.ok) {
      return res.status(401).render('login', { error: resultado.error, bloqueado: resultado.bloqueado, codigo });
    }
    const { id, nombre, rol } = resultado.usuario;
    return req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.usuario = { id, nombre, rol, codigo: resultado.usuario.codigo };
      return res.redirect(RUTA.PANEL);
    });
  });
  app.post('/logout', (req, res) => req.session.destroy(() => res.redirect(RUTA.LOGIN)));

  app.get(RUTA.PANEL, (req, res) => {
    const u = req.session.usuario;
    if (!u) return res.redirect(RUTA.LOGIN);
    if (u.rol === 'encargado') return res.redirect(RUTA.SOLICITUDES);
    const estado = db.prepare('SELECT estado FROM vista_usuarios WHERE id = ?').get(u.id).estado;
    return res.render('panel', { misReservas: reservas.delUsuario(u.id), estado });
  });

  // ---------- HU-02 Catálogo ----------
  const listarEquipos = db.prepare('SELECT * FROM vista_equipos ORDER BY categoria, nombre');
  const listarPorCategoria = db.prepare('SELECT * FROM vista_equipos WHERE categoria = ? ORDER BY nombre');
  app.get('/catalogo', requiereRol('estudiante'), (req, res) => {
    const categoria = CATEGORIAS.includes(req.query.categoria) ? req.query.categoria : '';
    const enPrestamo = reservas.equiposEnPrestamo();
    const equipos = (categoria ? listarPorCategoria.all(categoria) : listarEquipos.all()).map((equipo) => ({
      ...equipo,
      estado: enPrestamo.has(equipo.id) ? ESTADO_EQUIPO.PRESTADO : equipo.estado,
    }));
    const disponibles = equipos.filter((e) => e.estado === ESTADO_EQUIPO.DISPONIBLE);
    const mensaje = categoria && disponibles.length === 0 ? MSG_SIN_EQUIPOS : null;
    res.render('catalogo', { equipos, categorias: CATEGORIAS, categoria, mensaje });
  });

  // ---------- HU-03 Reservas ----------
  app.get('/reservas/nueva', requiereRol('estudiante'), (req, res) => {
    res.render('reserva', { equipos: listarEquipos.all(), seleccionado: Number(req.query.equipo) || null, error: null, datos: {} });
  });
  app.post('/reservas', requiereRol('estudiante'), (req, res) => {
    const datos = {
      equipoId: Number(req.body.equipo_id),
      fecha: req.body.fecha,
      horaInicio: req.body.hora_inicio,
      horaFin: req.body.hora_fin,
    };
    const r = reservas.solicitar(req.session.usuario.id, datos);
    if (!r.ok) {
      return res.status(422).render('reserva', { equipos: listarEquipos.all(), seleccionado: datos.equipoId, error: r.error, datos });
    }
    flash(req, 'ok', 'Solicitud de reserva registrada. Estado: Pendiente de aprobación.');
    return res.redirect(RUTA.PANEL);
  });

  // ---------- HU-04 Gestión de solicitudes ----------
  app.get(RUTA.SOLICITUDES, requiereRol('encargado'), (req, res) =>
    res.render('admin_solicitudes', { pendientes: reservas.pendientes() })
  );
  app.post('/admin/solicitudes/:id/aprobar', requiereRol('encargado'), (req, res) => {
    const r = reservas.aprobar(Number(req.params.id));
    flash(req, r.ok ? 'ok' : 'error', r.ok ? 'Reserva aprobada para el horario solicitado.' : r.error);
    res.redirect(RUTA.SOLICITUDES);
  });
  app.post('/admin/solicitudes/:id/rechazar', requiereRol('encargado'), (req, res) => {
    const r = reservas.rechazar(Number(req.params.id), req.body.motivo);
    flash(req, r.ok ? 'ok' : 'error', r.ok ? 'Reserva rechazada.' : r.error);
    res.redirect(RUTA.SOLICITUDES);
  });

  // ---------- HU-05 Devoluciones ----------
  app.get(RUTA.DEVOLUCIONES, requiereRol('encargado'), (req, res) => {
    const filtro = String(req.query.q || '').trim().toLowerCase();
    const activas = reservas
      .activas()
      .filter((r) => !filtro || `${r.estudiante} ${r.codigo_estudiante} ${r.equipo}`.toLowerCase().includes(filtro));
    res.render('admin_devoluciones', { activas, q: filtro });
  });
  app.post('/admin/devoluciones/:id', requiereRol('encargado'), (req, res) => {
    const r = reservas.marcarDevolucion(Number(req.params.id));
    let texto = r.error;
    if (r.ok) {
      texto = r.penalizado
        ? 'Devolución registrada fuera de plazo: el estudiante ha sido Penalizado.'
        : 'Devolución registrada. Equipo Disponible.';
    }
    flash(req, r.ok ? 'ok' : 'error', texto);
    res.redirect(RUTA.DEVOLUCIONES);
  });

  app.use((req, res) => res.status(404).send('Página no encontrada'));
  return { app, db };
}

module.exports = { createApp, MSG_SIN_EQUIPOS };
