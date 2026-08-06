import { useCallback, useEffect, useRef, useState } from 'react';

const CLAVE = 'inv-bta:cola-offline';

function leerCola() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? '[]');
  } catch {
    return [];
  }
}

function guardarCola(cola) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(cola));
  } catch {
    // localStorage lleno/modo privado: la cola solo vive en memoria esta sesión
  }
}

// Capturas que no se pudieron mandar por falta de conexión (no un rechazo
// del servidor) quedan acá en vez de perderse — se reintentan solas al
// volver la señal, sin que el capturador tenga que hacer nada. Es una cola
// del lado del cliente (mientras la pestaña sigue abierta), no background
// sync real de service worker: si cierran el navegador estando sin señal,
// lo pendiente se retoma la próxima vez que abran la app con conexión.
export function useColaOffline(enviar) {
  const [cola, setCola] = useState(leerCola);
  const [sincronizando, setSincronizando] = useState(false);
  const enviarRef = useRef(enviar);
  enviarRef.current = enviar;

  useEffect(() => {
    guardarCola(cola);
  }, [cola]);

  const encolar = useCallback((item) => {
    setCola((actual) => [...actual, { ...item, idLocal: `${Date.now()}-${Math.random().toString(36).slice(2)}` }]);
  }, []);

  const sincronizar = useCallback(async () => {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      while (true) {
        const [primero, ...resto] = leerCola();
        if (!primero) break;
        try {
          await enviarRef.current(primero);
          setCola(resto);
          guardarCola(resto);
        } catch {
          break; // sigue sin conexión (u otro error) — se reintenta más tarde, sin perder el resto
        }
      }
    } finally {
      setSincronizando(false);
    }
  }, [sincronizando]);

  useEffect(() => {
    sincronizar();
    window.addEventListener('online', sincronizar);
    const intervalo = setInterval(sincronizar, 20000);
    return () => {
      window.removeEventListener('online', sincronizar);
      clearInterval(intervalo);
    };
  }, []);

  return { cola, encolar, sincronizando };
}
