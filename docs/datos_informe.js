'use strict';
// Datos de contenido del informe (matriz de casos, IA, etc.).
const MATRIZ = [
  // id, hu, escenario, tipo, datos, esperado, origen
  ['CP-01', 'HU-01', 'Login con credenciales válidas', 'Positivo', 'N00471826 / contraseña válida', 'Ingresa a /panel y muestra el nombre del estudiante', 'Manual'],
  ['CP-02', 'HU-01', 'Contraseña incorrecta', 'Negativo', 'N00471826 / ClaveErronea1', 'Mensaje "Credenciales inválidas"', 'Manual'],
  ['CP-03', 'HU-01', 'Código de estudiante inexistente', 'Negativo', 'N00000000 / contraseña válida', 'Mensaje "Credenciales inválidas"', 'Manual'],
  ['CP-04', 'HU-01', '3 intentos fallidos consecutivos', 'Negativo / Seguridad', 'N00520973 con x1, x2, x3 y luego la clave correcta', 'Cuenta bloqueada y alerta de seguridad; la clave correcta tampoco ingresa', 'Manual'],
  ['CP-05', 'HU-01', 'Inyección SQL en el formulario', 'Seguridad', "' OR '1'='1' --", 'Rechazo con "Credenciales inválidas"', 'IA validada'],
  ['CP-06', 'HU-01', 'Login exitoso reinicia el contador', 'Límite', '2 fallos, 1 éxito, 1 fallo', 'No hay bloqueo (los fallos no fueron consecutivos)', 'IA validada'],
  ['CP-07', 'HU-01', 'Acceso a /panel sin sesión', 'Seguridad', 'Navegador sin cookie de sesión', 'Redirección a /login', 'IA validada'],
  ['CP-08', 'HU-01', 'Login del encargado', 'Positivo', 'ADM00640927 / contraseña válida', 'Redirección al panel de solicitudes', 'Manual'],
  ['CP-09', 'HU-02', 'Columnas del catálogo', 'Positivo', 'Estudiante autenticado', 'Nombre, código de inventario, categoría y estado; 8 equipos', 'Manual'],
  ['CP-10', 'HU-02', 'Filtro exacto "Electrónica"', 'Positivo', 'Filtro = Electrónica', 'Solo filas de categoría Electrónica', 'Manual'],
  ['CP-11', 'HU-02', 'Filtro sin equipos disponibles', 'Negativo', 'Filtro = Redes (todos Prestados)', 'Mensaje "No hay equipos disponibles en esta categoría"', 'Manual'],
  ['CP-24', 'HU-02', 'Filtro "Cómputo"', 'Positivo', 'Filtro = Cómputo', 'Todas las filas visibles son de categoría Cómputo', 'Manual'],
  ['CP-25', 'HU-02', 'Filtro "Redes"', 'Positivo', 'Filtro = Redes', 'Todas las filas visibles son de categoría Redes', 'Manual'],
  ['CP-12', 'HU-03', 'Reserva válida', 'Positivo', 'Laptop Dell, mañana 10:00–12:00', 'Reserva registrada en estado Pendiente', 'Manual'],
  ['CP-13', 'HU-03', 'Cruce con reserva aprobada', 'Negativo', 'Osciloscopio 10:00–12:00 aprobado; otro estudiante pide 11:00–13:00', 'Error "…reserva aprobada que se cruza con ese horario"', 'Manual'],
  ['CP-14', 'HU-03', 'Más de un equipo simultáneo', 'Negativo', 'Laptop 08–10 y Osciloscopio 09–11 del mismo estudiante', 'Error "No puede reservar más de un equipo…"', 'Manual'],
  ['CP-15', 'HU-03', 'Hora fin ≤ hora inicio', 'Límite', '14:00–13:00', 'Error de rango horario', 'IA validada'],
  ['CP-16', 'HU-03', 'Reserva en fecha pasada', 'Límite', 'Fecha = ayer', 'Error "fecha u hora que ya pasó"', 'IA validada'],
  ['CP-17', 'HU-03', 'Estudiante Penalizado intenta reservar', 'Negativo', 'Estudiante penalizado por devolución tardía', 'Error "cuenta Penalizada"', 'IA validada'],
  ['CP-18', 'HU-04', 'Tabla de solicitudes pendientes', 'Positivo', '1 solicitud pendiente', 'Estudiante, equipo, fecha/hora y botones Aprobar/Rechazar', 'Manual'],
  ['CP-19', 'HU-04', 'Aprobar solicitud futura', 'Positivo', 'Clic en Aprobar', 'Reserva Aprobada; el equipo sigue Disponible fuera del horario reservado', 'Manual'],
  ['CP-20', 'HU-04', 'Rechazar sin / con motivo', 'Negativo', 'Motivo vacío; luego "Equipo en mantenimiento"', 'Sin motivo: bloqueado. Con motivo: Rechazada y motivo visible', 'Manual'],
  ['CP-21', 'HU-04', 'Aprobar dos solicitudes cruzadas', 'Negativo', '2 solicitudes del mismo equipo 10–12 y 11–13', 'La segunda aprobación se bloquea por cruce', 'IA validada'],
  ['CP-22', 'HU-05', 'Devolución dentro del plazo', 'Positivo', 'Búsqueda por código y Marcar Devolución', 'Equipo Disponible; estudiante sigue Activo', 'Manual'],
  ['CP-23', 'HU-05', 'Devolución fuera de plazo', 'Negativo', 'Reloj del sistema +48 h', 'Estudiante pasa a Penalizado automáticamente', 'Manual'],
];

// Resultados reales v1 (junit-selenium-v1-antes.xml)
const FALLAN_V1 = new Set(['CP-05', 'CP-06', 'CP-13', 'CP-14', 'CP-16', 'CP-20', 'CP-21', 'CP-22']);

const IA = [
  // id, sugerencia, decisión, justificación, resultado
  ['IA-01', 'Probar inyección SQL en código y contraseña', 'Aceptado', 'Riesgo alto (OWASP A03). Se mantuvo tal cual.', 'CP-05'],
  ['IA-02', 'Verificar que un login exitoso reinicie el contador de intentos', 'Aceptado', 'El criterio dice "consecutivos": es la interpretación correcta.', 'CP-06'],
  ['IA-03', 'Acceso directo a URLs protegidas sin sesión', 'Aceptado', 'Control de acceso básico no cubierto por la HU.', 'CP-07'],
  ['IA-04', 'Hora de fin anterior o igual a la de inicio', 'Aceptado', 'Valor límite de la regla de horario.', 'CP-15'],
  ['IA-05', 'Reserva en fechas pasadas', 'Aceptado con ajuste', 'La HU no lo explicita; el equipo lo validó como regla implícita y se añadió al backlog.', 'CP-16'],
  ['IA-06', 'Un estudiante Penalizado no debería reservar', 'Aceptado con ajuste', 'Consecuencia lógica de HU-05; se documentó como regla derivada.', 'CP-17'],
  ['IA-07', 'Aprobar dos solicitudes que se cruzan', 'Aceptado', 'Condición de carrera real entre solicitudes pendientes.', 'CP-21'],
  ['IA-08', 'Validar contraseña de mínimo 12 caracteres al registrarse', 'Rechazado', 'Fuera de alcance: LabTrack no tiene registro de usuarios (cuentas institucionales).', '—'],
  ['IA-09', 'Reserva contigua (10–12 y 12–14) del mismo equipo', 'Rechazado', 'No alcanzable: al aprobar, el equipo pasa a "Prestado" (HU-04) hasta su devolución.', '—'],
  ['IA-10', 'Desbloqueo automático de la cuenta tras 15 minutos', 'Diferido', 'La HU no define la duración; se fijó en 15 min y queda pendiente su caso automatizado.', 'Backlog QA'],
  ['IA-11', 'Filtrar por una categoría inexistente ("Mecánica")', 'Reformulado', 'La HU define filtros exactos; la UI solo ofrece 3 opciones y el servidor ignora valores no válidos.', 'Revisión de código'],
];

module.exports = { MATRIZ, FALLAN_V1, IA };
