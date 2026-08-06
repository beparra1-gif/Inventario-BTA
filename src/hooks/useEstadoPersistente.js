import { useEffect, useState } from 'react';

const VENCIMIENTO_MS = 24 * 60 * 60 * 1000;

// Como useState, pero sobrevive a un F5: sin esto, actualizar la página
// borraba la sesión completa (acceso/participante/tax, o el login del
// admin) y obligaba a volver a entrar todo de nuevo. Se guarda en
// localStorage (no sessionStorage) para que también sobreviva a cerrar y
// reabrir el navegador — la sesión dura hasta que el usuario toque "Salir"
// explícitamente, o hasta 24 horas desde que se guardó (por si queda un
// celular compartido o perdido con la sesión abierta).
export function useEstadoPersistente(clave, valorInicial) {
  const [valor, setValor] = useState(() => {
    try {
      const guardado = localStorage.getItem(clave);
      if (!guardado) return valorInicial;
      const { valor: valorGuardado, guardadoEn } = JSON.parse(guardado);
      if (Date.now() - guardadoEn > VENCIMIENTO_MS) {
        localStorage.removeItem(clave);
        return valorInicial;
      }
      return valorGuardado;
    } catch {
      return valorInicial;
    }
  });

  useEffect(() => {
    try {
      if (valor === null || valor === undefined) localStorage.removeItem(clave);
      else localStorage.setItem(clave, JSON.stringify({ valor, guardadoEn: Date.now() }));
    } catch {
      // localStorage puede fallar en modo privado/cupo lleno — no es crítico, la sesión simplemente no persiste
    }
  }, [clave, valor]);

  return [valor, setValor];
}
