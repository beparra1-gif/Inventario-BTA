// Solo vibración (sin sonido — apagado a pedido, el beep en cada escaneo
// resultaba molesto capturando en tienda). La vibración no existe en
// iOS/Safari (no implementa navigator.vibrate), así que ahí simplemente no
// hay feedback táctil/sonoro, solo el cambio visual en la lista.
export function sonarEscaneado() {
  navigator.vibrate?.(10);
}

export function sonarExito() {
  navigator.vibrate?.(30);
}

export function sonarError() {
  navigator.vibrate?.([40, 60, 40]);
}

export function sonarEncolado() {
  navigator.vibrate?.(15);
}
