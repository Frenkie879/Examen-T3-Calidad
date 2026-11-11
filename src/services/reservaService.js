'use strict';
/** HU-03, HU-04 y HU-05: reservas, aprobación/rechazo y devolución con penalización. */
const { ESTADO_EQUIPO, ESTADO_RESERVA, ESTADO_USUARIO, transaction } = require('../db');

const ERRORES = Object.freeze({
  CAMPOS: 'Debe completar equipo, fecha, hora de inicio y hora de fin.',
  RANGO: 'La hora de fin debe ser posterior a la hora de inicio.',
  NO_DISPONIBLE: 'El equipo seleccionado no está Disponible.',
  CRUCE: 'El equipo ya tiene una reserva aprobada que se cruza con ese horario.',
  LIMITE: 'Ya tiene un equipo reservado. No puede reservar más de un equipo de forma simultánea.',
  PENALIZADO: 'Su cuenta está Penalizada y no puede realizar reservas.',
  PASADO: 'No se puede reservar en una fecha u hora que ya pasó.',
  MOTIVO: 'Debe ingresar un motivo para rechazar la solicitud.',
  NO_ENCONTRADA: 'La reserva no existe o no está en un estado válido para esta acción.',
});

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Dos intervalos [a1,a2) y [b1,b2) se cruzan si a1 < b2 y b1 < a2. */
function seCruzan(inicioA, finA, inicioB, finB) {
  return inicioA < finB && inicioB < finA;
}

function createReservaService(db, clock = () => new Date()) {
  const q = {
    equipo: db.prepare('SELECT * FROM vista_equipos WHERE id = ?'),
    usuario: db.prepare('SELECT * FROM vista_usuarios WHERE id = ?'),
    aprobadasDelEquipo: db.prepare(
      'SELECT hora_inicio, hora_fin FROM vista_reservas WHERE equipo_id = ? AND fecha = ? AND estado = ?'
    ),
    activasDelUsuario: db.prepare(
      'SELECT hora_inicio, hora_fin FROM vista_reservas WHERE usuario_id = ? AND fecha = ? AND estado IN (?, ?)'
    ),
    aprobadasActuales: db.prepare(
      'SELECT equipo_id FROM vista_reservas WHERE fecha = ? AND estado = ? AND hora_inicio <= ? AND hora_fin > ?'
    ),
    insertar: db.prepare(
      'INSERT INTO RESERVA (id_usuario, id_equipo, fecha, hora_inicio, hora_fin) VALUES (?, ?, ?, ?, ?)'
    ),
    reserva: db.prepare('SELECT * FROM vista_reservas WHERE id = ?'),
    estadoReserva: db.prepare('UPDATE RESERVA SET id_estado_reserva = (SELECT id_estado_reserva FROM ESTADO_RESERVA WHERE nombre=?), motivo_rechazo = ? WHERE id_reserva = ?'),
    estadoUsuario: db.prepare('UPDATE USUARIO SET id_estado_usuario = (SELECT id_estado_usuario FROM ESTADO_USUARIO WHERE nombre=?) WHERE id_usuario = ?'),
    devolucion: db.prepare('UPDATE RESERVA SET fecha_hora_devolucion=? WHERE id_reserva=?'),
    listarPorEstado: db.prepare(`
      SELECT r.*, u.nombre AS estudiante, u.codigo AS codigo_estudiante,
             e.nombre AS equipo, e.codigo_inventario
      FROM vista_reservas r
      JOIN vista_usuarios u ON u.id = r.usuario_id
      JOIN vista_equipos e ON e.id = r.equipo_id
      WHERE r.estado = ? ORDER BY r.fecha, r.hora_inicio`),
    delUsuario: db.prepare(`
      SELECT r.*, e.nombre AS equipo FROM vista_reservas r JOIN vista_equipos e ON e.id = r.equipo_id
      WHERE r.usuario_id = ? ORDER BY r.id DESC`),
  };

  function existeCruce(equipoId, fecha, horaInicio, horaFin) {
    return q.aprobadasDelEquipo
      .all(equipoId, fecha, ESTADO_RESERVA.APROBADA)
      .some((r) => seCruzan(horaInicio, horaFin, r.hora_inicio, r.hora_fin));
  }

  function validarSolicitud(usuarioId, { equipoId, fecha, horaInicio, horaFin }) {
    if (!equipoId || !FECHA_RE.test(fecha || '') || !HORA_RE.test(horaInicio || '') || !HORA_RE.test(horaFin || '')) {
      return ERRORES.CAMPOS;
    }
    if (horaFin <= horaInicio) return ERRORES.RANGO;
    if (new Date(`${fecha}T${horaInicio}:00`) <= clock()) return ERRORES.PASADO;

    const usuario = q.usuario.get(usuarioId);
    if (usuario?.estado === ESTADO_USUARIO.PENALIZADO) return ERRORES.PENALIZADO;

    // La regla de cruce se evalúa primero para informar el motivo específico (HU-03, criterio 9).
    if (existeCruce(equipoId, fecha, horaInicio, horaFin)) return ERRORES.CRUCE;

    const equipo = q.equipo.get(equipoId);
    if (equipo?.estado !== ESTADO_EQUIPO.DISPONIBLE) return ERRORES.NO_DISPONIBLE;

    const ocupadas = q.activasDelUsuario.all(usuarioId, fecha, ESTADO_RESERVA.PENDIENTE, ESTADO_RESERVA.APROBADA);
    if (ocupadas.some((r) => seCruzan(horaInicio, horaFin, r.hora_inicio, r.hora_fin))) return ERRORES.LIMITE;

    return null;
  }

  function solicitar(usuarioId, datos) {
    return transaction(db, () => solicitarDentroTransaccion(usuarioId, datos));
  }

  function solicitarDentroTransaccion(usuarioId, datos) {
    const error = validarSolicitud(usuarioId, datos);
    if (error) return { ok: false, error };
    q.insertar.run(usuarioId, Number(datos.equipoId), datos.fecha, datos.horaInicio, datos.horaFin);
    return { ok: true };
  }

  function aprobar(reservaId) {
    return transaction(db, () => aprobarDentroTransaccion(reservaId));
  }

  function aprobarDentroTransaccion(reservaId) {
    const r = q.reserva.get(reservaId);
    if (r?.estado !== ESTADO_RESERVA.PENDIENTE) return { ok: false, error: ERRORES.NO_ENCONTRADA };
    if (existeCruce(r.equipo_id, r.fecha, r.hora_inicio, r.hora_fin)) return { ok: false, error: ERRORES.CRUCE };
    q.estadoReserva.run(ESTADO_RESERVA.APROBADA, null, r.id);
    return { ok: true };
  }

  function rechazar(reservaId, motivo) {
    const texto = String(motivo || '').trim();
    if (texto.length === 0) return { ok: false, error: ERRORES.MOTIVO };
    const r = q.reserva.get(reservaId);
    if (r?.estado !== ESTADO_RESERVA.PENDIENTE) return { ok: false, error: ERRORES.NO_ENCONTRADA };
    q.estadoReserva.run(ESTADO_RESERVA.RECHAZADA, texto.slice(0, 200), r.id);
    return { ok: true };
  }

  function marcarDevolucion(reservaId) {
    return transaction(db, () => devolverDentroTransaccion(reservaId));
  }

  function devolverDentroTransaccion(reservaId) {
    const r = q.reserva.get(reservaId);
    if (r?.estado !== ESTADO_RESERVA.APROBADA) return { ok: false, error: ERRORES.NO_ENCONTRADA };
    q.estadoReserva.run(ESTADO_RESERVA.DEVUELTA, null, r.id);
    const devueltaEn = clock();
    q.devolucion.run(devueltaEn.toISOString(), r.id);
    const finAcordado = new Date(`${r.fecha}T${r.hora_fin}:00`);
    const penalizado = devueltaEn > finAcordado;
    if (penalizado) q.estadoUsuario.run(ESTADO_USUARIO.PENALIZADO, r.usuario_id);
    return { ok: true, penalizado };
  }

  return {
    solicitar,
    aprobar,
    rechazar,
    marcarDevolucion,
    pendientes: () => q.listarPorEstado.all(ESTADO_RESERVA.PENDIENTE),
    activas: () => q.listarPorEstado.all(ESTADO_RESERVA.APROBADA),
    delUsuario: (id) => q.delUsuario.all(id),
    equiposEnPrestamo: () => {
      const fechaActual = clock();
      const pad = (valor) => String(valor).padStart(2, '0');
      const fecha = `${fechaActual.getFullYear()}-${pad(fechaActual.getMonth() + 1)}-${pad(fechaActual.getDate())}`;
      const hora = `${pad(fechaActual.getHours())}:${pad(fechaActual.getMinutes())}`;
      return new Set(q.aprobadasActuales.all(fecha, ESTADO_RESERVA.APROBADA, hora, hora).map((r) => r.equipo_id));
    },
  };
}

module.exports = { createReservaService, ERRORES, seCruzan };
