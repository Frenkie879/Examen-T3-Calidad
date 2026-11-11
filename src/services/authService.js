'use strict';
/** HU-01: Autenticación segura con bloqueo tras 3 intentos fallidos consecutivos. */
const bcrypt = require('bcryptjs');

const MAX_INTENTOS = 3;
const MINUTOS_BLOQUEO = 15;

const MENSAJES = Object.freeze({
  INVALIDAS: 'Credenciales inválidas',
  BLOQUEADA:
    'Alerta de seguridad: su cuenta ha sido bloqueada temporalmente por 3 intentos fallidos consecutivos.',
});

function createAuthService(db, clock = () => Date.now()) {
  const findByCodigo = db.prepare('SELECT * FROM vista_usuarios WHERE codigo = ?');
  const registrarFallo = db.prepare(
    'UPDATE USUARIO SET intentos_fallidos = ?, tiempo_bloqueo = ? WHERE id_usuario = ?'
  );
  const reiniciar = db.prepare(
    'UPDATE USUARIO SET intentos_fallidos = 0, tiempo_bloqueo = NULL WHERE id_usuario = ?'
  );

  function estaBloqueado(usuario) {
    return usuario.bloqueado_hasta !== null && usuario.bloqueado_hasta > clock();
  }

  /**
   * @returns {{ok: true, usuario: object} | {ok: false, error: string, bloqueado: boolean}}
   */
  function autenticar(codigo, password) {
    const usuario = findByCodigo.get(String(codigo || '').trim());
    if (!usuario) {
      return { ok: false, error: MENSAJES.INVALIDAS, bloqueado: false };
    }
    if (estaBloqueado(usuario)) {
      return { ok: false, error: MENSAJES.BLOQUEADA, bloqueado: true };
    }
    if (bcrypt.compareSync(String(password || ''), usuario.password_hash)) {
      reiniciar.run(usuario.id);
      return { ok: true, usuario };
    }
    const intentos = usuario.intentos_fallidos + 1;
    if (intentos >= MAX_INTENTOS) {
      registrarFallo.run(0, clock() + MINUTOS_BLOQUEO * 60_000, usuario.id);
      return { ok: false, error: MENSAJES.BLOQUEADA, bloqueado: true };
    }
    registrarFallo.run(intentos, null, usuario.id);
    return { ok: false, error: MENSAJES.INVALIDAS, bloqueado: false };
  }

  return { autenticar };
}

module.exports = { createAuthService, MENSAJES, MAX_INTENTOS };
