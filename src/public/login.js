'use strict';
/**
 * Mejoras del formulario de acceso: visibilidad de la contraseña y
 * normalización del código. No sustituye la validación del servidor.
 */
(() => {
  const campoCodigo = document.getElementById('codigo');
  const campoPassword = document.getElementById('password');
  const boton = document.getElementById('ver-password');

  if (campoCodigo) {
    // Los códigos institucionales se escriben en mayúsculas y sin espacios sobrantes.
    campoCodigo.addEventListener('blur', () => {
      campoCodigo.value = campoCodigo.value.trim().toUpperCase();
    });
  }

  if (!boton || !campoPassword) return;
  const iconoMostrar = boton.querySelector('[data-icon="eye"]');
  const iconoOcultar = boton.querySelector('[data-icon="eye-off"]');

  boton.addEventListener('click', () => {
    const oculta = campoPassword.type === 'password';
    campoPassword.type = oculta ? 'text' : 'password';
    boton.setAttribute('aria-pressed', String(oculta));
    boton.setAttribute('aria-label', oculta ? 'Ocultar contraseña' : 'Mostrar contraseña');
    iconoMostrar.hidden = oculta;
    iconoOcultar.hidden = !oculta;
    // Mantiene el cursor al final para no perder lo escrito.
    campoPassword.focus({ preventScroll: true });
    const fin = campoPassword.value.length;
    campoPassword.setSelectionRange(fin, fin);
  });
})();
