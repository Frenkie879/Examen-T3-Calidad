// LabTrack v1.0 (línea base ANTES de la refactorización).
// Se conserva SOLO como evidencia para el análisis estático (antes/después).
// NO DESPLEGAR: contiene defectos y vulnerabilidades intencionales documentados en el backlog.
var express = require('express');
var session = require('express-session');
var path = require('path');
var crypto = require('crypto');
var { DatabaseSync } = require('node:sqlite');

var app = express();
var db = new DatabaseSync(':memory:');
var ADMIN_PASSWORD = 'Admin2026*';
var desfase = 0;

db.exec("CREATE TABLE usuarios (id INTEGER PRIMARY KEY, codigo TEXT, nombre TEXT, password TEXT, rol TEXT, estado TEXT DEFAULT 'Activo', intentos INTEGER DEFAULT 0, bloqueado_hasta INTEGER)");
db.exec("CREATE TABLE equipos (id INTEGER PRIMARY KEY, nombre TEXT, codigo_inventario TEXT, categoria TEXT, estado TEXT)");
db.exec("CREATE TABLE reservas (id INTEGER PRIMARY KEY, usuario_id INTEGER, equipo_id INTEGER, fecha TEXT, hora_inicio TEXT, hora_fin TEXT, estado TEXT, motivo_rechazo TEXT)");

function seed() {
  db.exec('DELETE FROM reservas; DELETE FROM equipos; DELETE FROM usuarios;');
  db.exec("INSERT INTO equipos (nombre,codigo_inventario,categoria,estado) VALUES ('Laptop Dell Latitude 5440','INV-CMP-001','Cómputo','Disponible'),('Laptop Lenovo ThinkPad E14','INV-CMP-002','Cómputo','Disponible'),('Raspberry Pi 5 Kit','INV-CMP-003','Cómputo','Disponible'),('Osciloscopio Rigol DS1054Z','INV-ELE-001','Electrónica','Disponible'),('Multímetro Fluke 117','INV-ELE-002','Electrónica','Disponible'),('Kit Arduino Mega 2560','INV-ELE-003','Electrónica','Disponible'),('Router Cisco ISR 4321','INV-RED-001','Redes','Prestado'),('Switch Cisco Catalyst 2960','INV-RED-002','Redes','Prestado')");
  db.exec("INSERT INTO usuarios (codigo,nombre,password,rol) VALUES ('N00123456','Ana Torres','Upn2026*','estudiante'),('N00654321','Luis Ramírez','Upn2026*','estudiante'),('N00999888','Carla Mendoza','Upn2026*','estudiante'),('ADM001','Encargado Lab','" + ADMIN_PASSWORD + "','encargado')");
}
seed();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'src', 'views'));
app.use(express.urlencoded({ extended: true }));
app.use('/static', express.static(path.join(__dirname, '..', 'src', 'public'), { dotfiles: 'allow' }));
app.use(session({ secret: 'labtrack-secret-2024', resave: true, saveUninitialized: true, cookie: { httpOnly: false, secure: false } }));
app.use(function (req, res, next) {
  res.locals.csrf = '';
  res.locals.usuario = req.session.usuario || null;
  res.locals.flash = req.session.flash || null;
  req.session.flash = null;
  next();
});

app.post('/__test__/reset', function (req, res) { seed(); desfase = 0; res.sendStatus(204); });
app.post('/__test__/reloj', function (req, res) { desfase = Number(req.query.horas) * 3600000; res.sendStatus(204); });

app.get('/', function (req, res) { res.redirect('/login'); });
app.get('/login', function (req, res) { res.render('login', { error: null, bloqueado: false, codigo: '' }); });

app.post('/login', function (req, res) {
  var codigo = req.body.codigo;
  var password = req.body.password;
  var u = db.prepare("SELECT * FROM usuarios WHERE codigo = '" + codigo + "'").get();
  if (u == undefined) {
    return res.render('login', { error: 'Credenciales inválidas', bloqueado: false, codigo: codigo });
  }
  if (u.bloqueado_hasta && u.bloqueado_hasta > Date.now() + desfase) {
    return res.render('login', { error: 'Alerta de seguridad: su cuenta ha sido bloqueada temporalmente por 3 intentos fallidos consecutivos.', bloqueado: true, codigo: codigo });
  }
  var check = db.prepare("SELECT * FROM usuarios WHERE codigo = '" + codigo + "' AND password = '" + password + "'").get();
  if (check) {
    var token = Math.random().toString(36).substring(2);
    req.session.token = token;
    req.session.usuario = { id: check.id, nombre: check.nombre, rol: check.rol, codigo: check.codigo };
    return res.redirect('/panel');
  } else {
    var intentos = u.intentos + 1;
    if (intentos >= 3) {
      db.prepare('UPDATE usuarios SET intentos = 0, bloqueado_hasta = ' + (Date.now() + 900000) + ' WHERE id = ' + u.id).run();
      return res.render('login', { error: 'Alerta de seguridad: su cuenta ha sido bloqueada temporalmente por 3 intentos fallidos consecutivos.', bloqueado: true, codigo: codigo });
    }
    db.prepare('UPDATE usuarios SET intentos = ' + intentos + ' WHERE id = ' + u.id).run();
    return res.render('login', { error: 'Credenciales inválidas', bloqueado: false, codigo: codigo });
  }
});

app.post('/logout', function (req, res) { req.session.destroy(function () { res.redirect('/login'); }); });

app.get('/panel', function (req, res) {
  if (!req.session.usuario) return res.redirect('/login');
  if (req.session.usuario.rol == 'encargado') return res.redirect('/admin/solicitudes');
  var u = db.prepare('SELECT * FROM usuarios WHERE id = ' + req.session.usuario.id).get();
  var mis = db.prepare('SELECT r.*, e.nombre AS equipo FROM reservas r JOIN equipos e ON e.id = r.equipo_id WHERE r.usuario_id = ' + u.id + ' ORDER BY r.id DESC').all();
  res.render('panel', { misReservas: mis, estado: u.estado });
});

app.get('/catalogo', function (req, res) {
  if (!req.session.usuario) return res.redirect('/login');
  var categoria = req.query.categoria || '';
  var sql = 'SELECT * FROM equipos';
  if (categoria != '') sql = sql + " WHERE categoria = '" + categoria + "'";
  var equipos = db.prepare(sql + ' ORDER BY categoria, nombre').all();
  var mensaje = null;
  if (categoria != '') {
    var hay = false;
    for (var i = 0; i < equipos.length; i++) { if (equipos[i].estado == 'Disponible') { hay = true; } }
    if (!hay) { mensaje = 'No hay equipos disponibles en esta categoría'; }
  }
  res.render('catalogo', { equipos: equipos, categorias: ['Cómputo', 'Electrónica', 'Redes'], categoria: categoria, mensaje: mensaje });
});

app.get('/reservas/nueva', function (req, res) {
  if (!req.session.usuario) return res.redirect('/login');
  var equipos = db.prepare('SELECT * FROM equipos ORDER BY categoria, nombre').all();
  res.render('reserva', { equipos: equipos, seleccionado: Number(req.query.equipo) || null, error: null, datos: {} });
});

// Función monolítica: valida, aplica reglas de negocio y persiste (alta complejidad cognitiva).
app.post('/reservas', function (req, res) {
  if (!req.session.usuario) return res.redirect('/login');
  var equipos = db.prepare('SELECT * FROM equipos ORDER BY categoria, nombre').all();
  var b = req.body;
  var datos = { equipoId: b.equipo_id, fecha: b.fecha, horaInicio: b.hora_inicio, horaFin: b.hora_fin };
  var error = null;
  try {
    if (!b.equipo_id || !b.fecha || !b.hora_inicio || !b.hora_fin) {
      error = 'Debe completar equipo, fecha, hora de inicio y hora de fin.';
    } else {
      if (b.hora_fin <= b.hora_inicio) {
        error = 'La hora de fin debe ser posterior a la hora de inicio.';
      } else {
        var u = db.prepare('SELECT * FROM usuarios WHERE id = ' + req.session.usuario.id).get();
        if (u.estado == 'Penalizado') {
          error = 'Su cuenta está Penalizada y no puede realizar reservas.';
        } else {
          var aprobadas = db.prepare("SELECT * FROM reservas WHERE equipo_id = " + b.equipo_id + " AND fecha = '" + b.fecha + "' AND estado = 'Aprobada'").all();
          for (var i = 0; i < aprobadas.length; i++) {
            if (aprobadas[i].hora_inicio == b.hora_inicio) {
              error = 'El equipo ya tiene una reserva aprobada que se cruza con ese horario.';
            }
          }
          if (!error) {
            var e = db.prepare('SELECT * FROM equipos WHERE id = ' + b.equipo_id).get();
            if (e.estado != 'Disponible') {
              error = 'El equipo seleccionado no está Disponible.';
            } else {
              var activas = db.prepare("SELECT COUNT(*) AS n FROM reservas WHERE usuario_id = " + u.id + " AND estado = 'Aprobada'").get();
              if (activas.n > 0) {
                error = 'Ya tiene un equipo reservado. No puede reservar más de un equipo de forma simultánea.';
              }
            }
          }
        }
      }
    }
  } catch (err) {
  }
  if (error) {
    return res.render('reserva', { equipos: equipos, seleccionado: Number(b.equipo_id), error: error, datos: datos });
  }
  db.prepare("INSERT INTO reservas (usuario_id, equipo_id, fecha, hora_inicio, hora_fin, estado) VALUES (" + req.session.usuario.id + ", " + b.equipo_id + ", '" + b.fecha + "', '" + b.hora_inicio + "', '" + b.hora_fin + "', 'Pendiente')").run();
  req.session.flash = { tipo: 'ok', texto: 'Solicitud de reserva registrada. Estado: Pendiente de aprobación.' };
  res.redirect('/panel');
});

app.get('/admin/solicitudes', function (req, res) {
  if (!req.session.usuario || req.session.usuario.rol != 'encargado') return res.redirect('/login');
  var p = db.prepare("SELECT r.*, u.nombre AS estudiante, u.codigo AS codigo_estudiante, e.nombre AS equipo FROM reservas r JOIN usuarios u ON u.id = r.usuario_id JOIN equipos e ON e.id = r.equipo_id WHERE r.estado = 'Pendiente'").all();
  res.render('admin_solicitudes', { pendientes: p });
});

app.post('/admin/solicitudes/:id/aprobar', function (req, res) {
  if (!req.session.usuario || req.session.usuario.rol != 'encargado') return res.redirect('/login');
  var r = db.prepare('SELECT * FROM reservas WHERE id = ' + req.params.id).get();
  db.prepare("UPDATE reservas SET estado = 'Aprobada' WHERE id = " + r.id).run();
  db.prepare("UPDATE equipos SET estado = 'Prestado' WHERE id = " + r.equipo_id).run();
  req.session.flash = { tipo: 'ok', texto: 'Reserva aprobada. Equipo marcado como Prestado.' };
  res.redirect('/admin/solicitudes');
});

app.post('/admin/solicitudes/:id/rechazar', function (req, res) {
  if (!req.session.usuario || req.session.usuario.rol != 'encargado') return res.redirect('/login');
  var motivo = req.body.motivo;
  db.prepare("UPDATE reservas SET estado = 'Rechazada', motivo_rechazo = '" + motivo + "' WHERE id = " + req.params.id).run();
  req.session.flash = { tipo: 'ok', texto: 'Reserva rechazada.' };
  res.redirect('/admin/solicitudes');
});

app.get('/admin/devoluciones', function (req, res) {
  if (!req.session.usuario || req.session.usuario.rol != 'encargado') return res.redirect('/login');
  var q = req.query.q || '';
  var a = db.prepare("SELECT r.*, u.nombre AS estudiante, u.codigo AS codigo_estudiante, e.nombre AS equipo FROM reservas r JOIN usuarios u ON u.id = r.usuario_id JOIN equipos e ON e.id = r.equipo_id WHERE r.estado = 'Aprobada' AND (u.nombre LIKE '%" + q + "%' OR u.codigo LIKE '%" + q + "%' OR e.nombre LIKE '%" + q + "%')").all();
  res.render('admin_devoluciones', { activas: a, q: q });
});

app.post('/admin/devoluciones/:id', function (req, res) {
  if (!req.session.usuario || req.session.usuario.rol != 'encargado') return res.redirect('/login');
  var r = db.prepare('SELECT * FROM reservas WHERE id = ' + req.params.id).get();
  db.prepare("UPDATE reservas SET estado = 'Devuelta' WHERE id = " + r.id).run();
  db.prepare("UPDATE equipos SET estado = 'Disponible' WHERE id = " + r.equipo_id).run();
  var ahora = new Date(Date.now() + desfase);
  var horaActual = String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');
  var penalizado = false;
  if (horaActual > r.hora_fin) {
    db.prepare("UPDATE usuarios SET estado = 'Penalizado' WHERE id = " + r.usuario_id).run();
    penalizado = true;
  }
  var texto = 'Devolución registrada. Equipo Disponible.';
  if (penalizado) texto = 'Devolución registrada fuera de plazo: el estudiante ha sido Penalizado.';
  req.session.flash = { tipo: 'ok', texto: texto };
  res.redirect('/admin/devoluciones');
});

function hashLegacy(p) {
  return crypto.createHash('md5').update(p).digest('hex');
}

var port = process.env.PORT || 3001;
app.listen(port, function () { console.log('LabTrack v1 (legacy) en puerto ' + port); });
