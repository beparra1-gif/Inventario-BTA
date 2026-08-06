import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';

export function CambiarPassword({ admin, onListo }) {
  const mostrarToast = useToast();
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordNuevaRepetir, setPasswordNuevaRepetir] = useState('');
  const [mostrarClaves, setMostrarClaves] = useState(false);
  const [cargando, setCargando] = useState(false);

  const noCoinciden = passwordNueva && passwordNuevaRepetir && passwordNueva !== passwordNuevaRepetir;

  async function guardar() {
    if (!passwordActual || passwordNueva.length < 8) return;
    if (passwordNueva !== passwordNuevaRepetir) {
      mostrarToast('La contraseña nueva no coincide en los dos campos', 'error');
      return;
    }
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className="titulo-pantalla" style={{ margin: 0 }}>Cambia tu contraseña</h1>
              <p className="subtitulo">Es la primera vez que entras con esta cuenta.</p>
            </div>
            <button className="btn-texto" style={{ padding: 0, fontSize: 12, flexShrink: 0 }} onClick={() => setMostrarClaves((v) => !v)}>
              {mostrarClaves ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          <label className="etiqueta">Contraseña actual</label>
          <input
            className="campo"
            type={mostrarClaves ? 'text' : 'password'}
            value={passwordActual}
            onChange={(e) => setPasswordActual(e.target.value)}
            autoFocus
          />
          <label className="etiqueta">Contraseña nueva (mínimo 8 caracteres)</label>
          <input
            className="campo"
            type={mostrarClaves ? 'text' : 'password'}
            value={passwordNueva}
            onChange={(e) => setPasswordNueva(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && guardar()}
          />
          <label className="etiqueta">Repite la contraseña nueva</label>
          <input
            className="campo"
            type={mostrarClaves ? 'text' : 'password'}
            value={passwordNuevaRepetir}
            onChange={(e) => setPasswordNuevaRepetir(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && guardar()}
          />
          {noCoinciden && <p style={{ margin: '-8px 0 12px', fontSize: 12, color: '#B91C1C' }}>Las contraseñas no coinciden.</p>}

          <button
            className="btn btn-primario"
            disabled={!passwordActual || passwordNueva.length < 8 || passwordNueva !== passwordNuevaRepetir || cargando}
            onClick={guardar}
          >
            {cargando ? 'Guardando...' : 'Guardar y continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
