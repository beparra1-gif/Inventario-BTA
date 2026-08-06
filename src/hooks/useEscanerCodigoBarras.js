import { useEffect, useRef } from 'react';

const UMBRAL_MS = 40;
const LONGITUD_MINIMA = 6;

// Los lectores de código de barra (USB o Bluetooth) se conectan al sistema
// operativo como un teclado HID: "escriben" el código carácter por carácter
// y terminan con Enter, mucho más rápido de lo que puede teclear una
// persona. No hace falta distinguir USB de Bluetooth ni usar WebUSB/WebHID
// (que además no funcionan en Safari/iOS, rompiendo la app en iPhone): con
// medir el tiempo entre teclas alcanza para reconocer cualquiera de los dos.
//
// Al tipear manualmente en un input (talla, código a mano) el intervalo
// entre teclas es muchísimo mayor a UMBRAL_MS, así que el buffer se reinicia
// solo y esto nunca interfiere con la captura manual.
export function useEscanerCodigoBarras(onEscaneo, { activo = true } = {}) {
  const bufferRef = useRef('');
  const ultimaTeclaRef = useRef(0);
  const onEscaneoRef = useRef(onEscaneo);
  onEscaneoRef.current = onEscaneo;

  useEffect(() => {
    if (!activo) return undefined;

    function manejarKeyDown(evento) {
      const ahora = Date.now();
      const transcurrido = ahora - ultimaTeclaRef.current;
      ultimaTeclaRef.current = ahora;

      if (evento.key === 'Enter') {
        const codigo = bufferRef.current;
        bufferRef.current = '';
        if (codigo.length >= LONGITUD_MINIMA && transcurrido < UMBRAL_MS) {
          evento.preventDefault();
          // El foco pudo haber quedado en un input y ya recibió el texto
          // tecla a tecla del lector; se limpia para no duplicar el valor.
          if (evento.target && 'value' in evento.target && evento.target.value === codigo) {
            evento.target.value = '';
          }
          onEscaneoRef.current?.(codigo);
        }
        return;
      }

      if (evento.key.length !== 1 || !/[0-9A-Za-z]/.test(evento.key)) return;

      bufferRef.current = transcurrido < UMBRAL_MS ? bufferRef.current + evento.key : evento.key;
    }

    window.addEventListener('keydown', manejarKeyDown, true);
    return () => window.removeEventListener('keydown', manejarKeyDown, true);
  }, [activo]);
}
