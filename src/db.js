'use strict';
/**
 * Capa de datos de LabTrack (SQLite embebido de Node.js).
 * Todas las consultas usan sentencias preparadas (parametrizadas).
 */
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const path = require('node:path');

const ESTADO_EQUIPO = Object.freeze({ DISPONIBLE: 'Disponible', PRESTADO: 'Prestado' });
const ESTADO_RESERVA = Object.freeze({
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  DEVUELTA: 'Devuelta',
});
const ESTADO_USUARIO = Object.freeze({ ACTIVO: 'Activo', PENALIZADO: 'Penalizado' });
const CATEGORIA = Object.freeze({ COMPUTO: 'Cómputo', ELECTRONICA: 'Electrónica', REDES: 'Redes' });
const CATEGORIAS = Object.freeze(Object.values(CATEGORIA));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ROL (
  id_rol SMALLINT PRIMARY KEY NOT NULL CHECK(id_rol BETWEEN 1 AND 32767),
  nombre VARCHAR(50) UNIQUE NOT NULL,
  estaActivo BOOLEAN NOT NULL DEFAULT 1 CHECK(estaActivo IN (0,1))
);
CREATE TABLE IF NOT EXISTS OPCION_MENU (
  id_opcion_menu SMALLINT PRIMARY KEY NOT NULL CHECK(id_opcion_menu BETWEEN 1 AND 32767),
  orden SMALLINT NOT NULL CHECK(orden BETWEEN 0 AND 32767),
  nombre VARCHAR(80) UNIQUE NOT NULL,
  url_frontend VARCHAR(255) UNIQUE NOT NULL,
  estaActiva BOOLEAN NOT NULL DEFAULT 1 CHECK(estaActiva IN (0,1))
);
CREATE TABLE IF NOT EXISTS ROL_OPCION_MENU (
  id_rol SMALLINT NOT NULL REFERENCES ROL(id_rol),
  id_opcion_menu SMALLINT NOT NULL REFERENCES OPCION_MENU(id_opcion_menu),
  PRIMARY KEY(id_rol,id_opcion_menu)
);
CREATE TABLE IF NOT EXISTS ESTADO_USUARIO (
  id_estado_usuario SMALLINT PRIMARY KEY NOT NULL CHECK(id_estado_usuario BETWEEN 1 AND 32767),
  nombre VARCHAR(50) UNIQUE NOT NULL,
  estaActivo BOOLEAN NOT NULL DEFAULT 1 CHECK(estaActivo IN (0,1))
);
CREATE TABLE IF NOT EXISTS USUARIO (
  id_usuario INTEGER PRIMARY KEY,
  nombres VARCHAR(100) NOT NULL,
  apellidos VARCHAR(100) NOT NULL,
  codigo_estudiante VARCHAR(20) UNIQUE NOT NULL,
  contrasenia_hash VARCHAR(60) NOT NULL CHECK(length(contrasenia_hash)=60),
  id_rol SMALLINT NOT NULL REFERENCES ROL(id_rol),
  intentos_fallidos SMALLINT NOT NULL DEFAULT 0 CHECK(intentos_fallidos BETWEEN 0 AND 32767),
  tiempo_bloqueo BIGINT CHECK(tiempo_bloqueo IS NULL OR tiempo_bloqueo>=0),
  id_estado_usuario SMALLINT NOT NULL DEFAULT 1 REFERENCES ESTADO_USUARIO(id_estado_usuario),
  estaActivo BOOLEAN NOT NULL DEFAULT 1 CHECK(estaActivo IN (0,1))
);
CREATE TABLE IF NOT EXISTS PERMISO (
  id_permiso INTEGER PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL,
  id_rol SMALLINT NOT NULL REFERENCES ROL(id_rol),
  estaActivo BOOLEAN NOT NULL DEFAULT 1 CHECK(estaActivo IN (0,1)),
  UNIQUE(id_rol,nombre)
);
CREATE TABLE IF NOT EXISTS CATEGORIA (
  id_categoria SMALLINT PRIMARY KEY NOT NULL CHECK(id_categoria BETWEEN 1 AND 32767),
  nombre VARCHAR(50) UNIQUE NOT NULL,
  estaActiva BOOLEAN NOT NULL DEFAULT 1 CHECK(estaActiva IN (0,1))
);
CREATE TABLE IF NOT EXISTS ESTADO_EQUIPO (
  id_estado_equipo SMALLINT PRIMARY KEY NOT NULL CHECK(id_estado_equipo BETWEEN 1 AND 32767),
  nombre VARCHAR(50) UNIQUE NOT NULL,
  estaActivo BOOLEAN NOT NULL DEFAULT 1 CHECK(estaActivo IN (0,1))
);
CREATE TABLE IF NOT EXISTS EQUIPO (
  id_equipo INTEGER PRIMARY KEY,
  nombre_equipo VARCHAR(150) NOT NULL,
  codigo_inventario VARCHAR(30) UNIQUE NOT NULL,
  id_categoria SMALLINT NOT NULL REFERENCES CATEGORIA(id_categoria),
  id_estado_equipo SMALLINT NOT NULL DEFAULT 1 REFERENCES ESTADO_EQUIPO(id_estado_equipo),
  estaActiva BOOLEAN NOT NULL DEFAULT 1 CHECK(estaActiva IN (0,1))
);
CREATE TABLE IF NOT EXISTS ESTADO_RESERVA (
  id_estado_reserva SMALLINT PRIMARY KEY NOT NULL CHECK(id_estado_reserva BETWEEN 1 AND 32767),
  nombre VARCHAR(50) UNIQUE NOT NULL,
  estaActivo BOOLEAN NOT NULL DEFAULT 1 CHECK(estaActivo IN (0,1))
);
CREATE TABLE IF NOT EXISTS RESERVA (
  id_reserva INTEGER PRIMARY KEY,
  id_usuario INTEGER NOT NULL REFERENCES USUARIO(id_usuario),
  id_equipo INTEGER NOT NULL REFERENCES EQUIPO(id_equipo),
  fecha DATE NOT NULL CHECK(length(fecha)=10 AND date(fecha) IS NOT NULL AND date(fecha)=fecha),
  hora_inicio TIME NOT NULL CHECK(length(hora_inicio)=5 AND time(hora_inicio) IS NOT NULL),
  hora_fin TIME NOT NULL CHECK(length(hora_fin)=5 AND time(hora_fin) IS NOT NULL AND hora_fin>hora_inicio),
  fecha_hora_devolucion DATETIME CHECK(fecha_hora_devolucion IS NULL OR datetime(fecha_hora_devolucion) IS NOT NULL),
  id_estado_reserva SMALLINT NOT NULL DEFAULT 1 REFERENCES ESTADO_RESERVA(id_estado_reserva),
  motivo_rechazo VARCHAR(200) CHECK(motivo_rechazo IS NULL OR length(trim(motivo_rechazo)) BETWEEN 1 AND 200),
  estaActiva BOOLEAN NOT NULL DEFAULT 1 CHECK(estaActiva IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_equipo_categoria ON EQUIPO(id_categoria);
CREATE INDEX IF NOT EXISTS idx_reserva_equipo ON RESERVA(id_equipo,fecha,id_estado_reserva);
CREATE INDEX IF NOT EXISTS idx_reserva_usuario ON RESERVA(id_usuario,id_estado_reserva);
CREATE INDEX IF NOT EXISTS idx_reserva_estado ON RESERVA(id_estado_reserva,fecha,hora_inicio);

CREATE VIEW IF NOT EXISTS vista_usuarios AS
SELECT u.id_usuario AS id, u.codigo_estudiante AS codigo,
       trim(u.nombres || ' ' || u.apellidos) AS nombre,
       u.contrasenia_hash AS password_hash, r.nombre AS rol, e.nombre AS estado,
       u.intentos_fallidos, u.tiempo_bloqueo AS bloqueado_hasta
FROM USUARIO u JOIN ROL r USING(id_rol) JOIN ESTADO_USUARIO e USING(id_estado_usuario)
WHERE u.estaActivo=1 AND r.estaActivo=1 AND e.estaActivo=1;
CREATE VIEW IF NOT EXISTS vista_equipos AS
SELECT e.id_equipo AS id, e.nombre_equipo AS nombre, e.codigo_inventario,
       c.nombre AS categoria, s.nombre AS estado
FROM EQUIPO e JOIN CATEGORIA c USING(id_categoria) JOIN ESTADO_EQUIPO s USING(id_estado_equipo)
WHERE e.estaActiva=1 AND c.estaActiva=1 AND s.estaActivo=1;
CREATE VIEW IF NOT EXISTS vista_reservas AS
SELECT r.id_reserva AS id, r.id_usuario AS usuario_id, r.id_equipo AS equipo_id,
       r.fecha,r.hora_inicio,r.hora_fin,r.fecha_hora_devolucion,r.motivo_rechazo,s.nombre AS estado
FROM RESERVA r JOIN ESTADO_RESERVA s USING(id_estado_reserva)
WHERE r.estaActiva=1 AND s.estaActivo=1;
`;

const SEED_EQUIPOS = [
  ['Laptop Dell Latitude 5440', 'COM-LAP-001', CATEGORIA.COMPUTO, ESTADO_EQUIPO.DISPONIBLE],
  ['Laptop Lenovo ThinkPad E14', 'COM-LAP-002', CATEGORIA.COMPUTO, ESTADO_EQUIPO.DISPONIBLE],
  ['Raspberry Pi 5 Kit', 'COM-RAS-003', CATEGORIA.COMPUTO, ESTADO_EQUIPO.DISPONIBLE],
  ['Osciloscopio Rigol DS1054Z', 'ELE-OSC-004', CATEGORIA.ELECTRONICA, ESTADO_EQUIPO.DISPONIBLE],
  ['Multímetro Fluke 117', 'ELE-MUL-005', CATEGORIA.ELECTRONICA, ESTADO_EQUIPO.DISPONIBLE],
  ['Kit Arduino Mega 2560', 'ELE-KIT-006', CATEGORIA.ELECTRONICA, ESTADO_EQUIPO.DISPONIBLE],
  ['Router Cisco ISR 4321', 'RED-ROU-007', CATEGORIA.REDES, ESTADO_EQUIPO.PRESTADO],
  ['Switch Cisco Catalyst 2960', 'RED-SWI-008', CATEGORIA.REDES, ESTADO_EQUIPO.PRESTADO],
];

const SEED_USUARIOS = [
  ['N00471826', 'Ana', 'Torres', 1, '//1estudiante__'], // -> //1estudiante__
  ['N00832614', 'Luis', 'Ramírez', 1, '//2estudiante__'], // -> //2estudiante__
  ['N00520973', 'Carla', 'Mendoza', 1, '//3estudiante__'], // -> //3estudiante__
  ['N00186425', 'Valeria', 'Rojas', 1, '//4estudiante__'], // -> //4estudiante__
  ['N00975138', 'Diego', 'Salazar', 1, '//5estudiante__'], // -> //5estudiante__
  ['ADM00640927', 'Elena', 'Paredes', 2, '//1encargadolab**'], // -> //1encargadolab**
  ['ADM00853146', 'Marco', 'Vargas', 2, '//2encargadolab**'], // -> //2encargadolab**
  ['ADM00197438', 'Lucía', 'Castillo', 2, '//3encargadolab**'], // -> //3encargadolab**
  ['ADM00268051', 'Jorge', 'Medina', 2, '//4encargadolab**'], // -> //4encargadolab**
  ['ADM00745219', 'Rosa', 'Campos', 2, '//5encargadolab**'], // -> //5encargadolab**
];

// Credenciales públicas de demostración; no reutilizar en producción.
const TEST_PASSWORDS = Object.freeze({ estudiante: '//1estudiante__', encargado: '//1encargadolab**' });

function transaction(db, operation) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function createDb(file = process.env.LABTRACK_DB || (process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, '..', 'data', 'labtrack.sqlite'))) {
  if (file !== ':memory:') {
    // La ruta proviene de LABTRACK_DB (configuración del operador), nunca de una petición HTTP.
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- ruta de configuración validada
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  const db = new DatabaseSync(file);
  try {
    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND lower(name) IN ('usuarios','equipos','reservas')").get()) {
      throw new Error('Base con esquema anterior: utilice un archivo nuevo o prepare una migración. No se han eliminado datos.');
    }
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    transaction(db, () => db.exec(SCHEMA));
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function insertSeed(db) {
  db.exec(`
    INSERT INTO ROL(id_rol,nombre) VALUES(1,'estudiante'),(2,'encargado') ON CONFLICT DO NOTHING;
    INSERT INTO ESTADO_USUARIO(id_estado_usuario,nombre) VALUES(1,'Activo'),(2,'Penalizado') ON CONFLICT DO NOTHING;
    INSERT INTO CATEGORIA(id_categoria,nombre) VALUES(1,'Cómputo'),(2,'Electrónica'),(3,'Redes') ON CONFLICT DO NOTHING;
    INSERT INTO ESTADO_EQUIPO(id_estado_equipo,nombre) VALUES(1,'Disponible'),(2,'Prestado') ON CONFLICT DO NOTHING;
    INSERT INTO ESTADO_RESERVA(id_estado_reserva,nombre) VALUES(1,'Pendiente'),(2,'Aprobada'),(3,'Rechazada'),(4,'Devuelta') ON CONFLICT DO NOTHING;
    INSERT INTO OPCION_MENU(id_opcion_menu,orden,nombre,url_frontend) VALUES
      (1,1,'Mi panel','/panel'),(2,2,'Catálogo','/catalogo'),(3,3,'Reservar','/reservas/nueva'),
      (4,1,'Solicitudes','/admin/solicitudes'),(5,2,'Devoluciones','/admin/devoluciones') ON CONFLICT DO NOTHING;
    INSERT INTO ROL_OPCION_MENU VALUES(1,1),(1,2),(1,3),(2,4),(2,5) ON CONFLICT DO NOTHING;
    INSERT INTO PERMISO(id_permiso,nombre,id_rol) VALUES
      (1,'Consultar catálogo',1),(2,'Solicitar reserva',1),(3,'Gestionar solicitudes',2),(4,'Registrar devolución',2) ON CONFLICT DO NOTHING;
  `);
  const insEquipo = db.prepare(
    `INSERT INTO EQUIPO (nombre_equipo,codigo_inventario,id_categoria,id_estado_equipo)
     VALUES (?, ?, (SELECT id_categoria FROM CATEGORIA WHERE nombre=?),
       (SELECT id_estado_equipo FROM ESTADO_EQUIPO WHERE nombre=?)) ON CONFLICT(codigo_inventario) DO NOTHING`
  );
  SEED_EQUIPOS.forEach((e) => insEquipo.run(...e));

  const insUsuario = db.prepare(
    `INSERT INTO USUARIO(codigo_estudiante,nombres,apellidos,contrasenia_hash,id_rol)
     VALUES(?,?,?,?,?) ON CONFLICT(codigo_estudiante) DO NOTHING`
  );
  const existe = db.prepare('SELECT 1 FROM USUARIO WHERE codigo_estudiante=?');
  for (const [codigo, nombres, apellidos, rol, plain] of SEED_USUARIOS) {
    if (!existe.get(codigo)) {
      insUsuario.run(codigo, nombres, apellidos, bcrypt.hashSync(plain, 10), rol);
    }
  }
}

function seed(db) {
  transaction(db, () => {
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version === 0) {
      db.exec('DELETE FROM RESERVA; DELETE FROM EQUIPO; DELETE FROM USUARIO; PRAGMA user_version=1;');
    }
    insertSeed(db);
  });
}

function resetTestData(db) {
  if (process.env.NODE_ENV !== 'test') throw new Error('El reinicio solo está permitido en NODE_ENV=test');
  transaction(db, () => {
    db.exec('DELETE FROM RESERVA; DELETE FROM EQUIPO; DELETE FROM USUARIO; DELETE FROM PERMISO; DELETE FROM ROL_OPCION_MENU; DELETE FROM OPCION_MENU; DELETE FROM ROL; DELETE FROM ESTADO_USUARIO; DELETE FROM CATEGORIA; DELETE FROM ESTADO_EQUIPO; DELETE FROM ESTADO_RESERVA;');
    insertSeed(db);
  });
}

module.exports = {
  createDb,
  seed,
  resetTestData,
  transaction,
  TEST_PASSWORDS,
  ESTADO_EQUIPO,
  ESTADO_RESERVA,
  ESTADO_USUARIO,
  CATEGORIAS,
};
