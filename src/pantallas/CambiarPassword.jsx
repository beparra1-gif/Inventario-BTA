import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';

export function CambiarPassword({ admin, onListo }) {
  const mostrarToast = useToast();
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [cargando, setCargando] = useState(false);

  async function guardar() {
    if (!passwordActual || passwordNueva.length < 8) return;
    setCargando(true);
    try {
      onListo(await api.cambiarPassword(admin.id, passwordActual, passwordNueva));
      mostrarToast('Contraseña actualizada', 'ok');
    } catch {
      mostrarToast('Contraseña actual incorrecta', 'error');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="pantalla">
      <div className="contenedor">
        <div className="tarjeta">
          <h1 className="titulo-pantalla">Cambia tu contraseña</h1>
          <p className="subtitulo">Es la primera vez que entras con esta cuenta.</p>

          <label className="etiqueta">Contraseña actual</label>
          <input className="campo" type="password" value={passwordActual} onChange={(e) => setPasswordActual(e.target.value)} autoFocus />
          <label className="etiqueta">Contraseña nueva (mínimo 8 caracteres)</label>
          <input
            className="campo"
            type="password"
            value={passwordNueva}
            onChange={(e) => setPasswordNueva(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && guardar()}
          />

          <button className="btn btn-primario" disabled={!passwordActual || passwordNueva.length < 8 || cargando} onClick={guardar}>
            {cargando ? 'Guardando...' : 'Guardar y continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
