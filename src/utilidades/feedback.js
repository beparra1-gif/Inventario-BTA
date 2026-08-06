// Beep sintetizado con Web Audio (sin archivos de audio que cargar) +
// vibración corta — para que el capturador sepa si el escaneo salió bien
// sin tener que mirar la pantalla cada vez. La vibración no existe en
// iOS/Safari (no implementa navigator.vibrate); ahí solo suena el beep.
let contextoAudio = null;

function obtenerContexto() {
  if (!contextoAudio) {
    const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextImpl) return null;
    contextoAudio = new AudioContextImpl();
  }
  return contextoAudio;
}

function pitido(frecuencia, duracionMs, { volumen = 0.15, retrasoMs = 0 } = {}) {
  const ctx = obtenerContexto();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const inicio = ctx.currentTime + retrasoMs / 1000;
  const oscilador = ctx.createOscillator();
  const ganancia = ctx.createGain();
  oscilador.type = 'sine';
  oscilador.frequency.value = frecuencia;
  ganancia.gain.value = volumen;
  oscilador.connect(ganancia);
  ganancia.connect(ctx.destination);
  oscilador.start(inicio);
  oscilador.stop(inicio + duracionMs / 1000);
}

export function sonarExito() {
  pitido(880, 90);
  navigator.vibrate?.(30);
}

export function sonarError() {
  pitido(220, 160);
  navigator.vibrate?.([40, 60, 40]);
}

export function sonarEncolado() {
  pitido(440, 70);
  pitido(440, 70, { volumen: 0.12, retrasoMs: 110 });
  navigator.vibrate?.(15);
}
