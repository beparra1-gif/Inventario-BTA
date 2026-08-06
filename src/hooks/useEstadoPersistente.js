import { useEffect, useState } from 'react';

// Como useState, pero sobrevive a un F5: sin esto, actualizar la página
// borraba la sesión completa (acceso/participante/tax, o el login del
// admin) y obligaba a volver a entrar todo de nuevo. Se guarda en
// localStorage (no sessionStorage) para que también sobreviva a cerrar y
// reabrir el navegador — la sesión dura hasta que el usuario toque "Salir"
// explícitamente, que es lo que limpia la clave.
export function useEstadoPersistente(clave, valorInicial) {
  const [valor, setValor] = useState(() => {
    try {
      const guardado = localStorage.getItem(clave);
      return guardado ? JSON.parse(guardado) : valorInicial;
    } catch {
      return valorInicial;
    }
  });

  useEffect(() => {
    try {
      if (valor === null || valor === undefined) localStorage.removeItem(clave);
      else localStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      // localStorage puede fallar en modo privado/cupo lleno — no es crítico, la sesión simplemente no persiste
    }
  }, [clave, valor]);

  return [valor, setValor];
}
