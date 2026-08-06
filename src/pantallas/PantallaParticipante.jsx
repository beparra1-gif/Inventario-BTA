import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { IconoUsuario } from '../componentes/Iconos.jsx';

export function PantallaParticipante({ acceso, onListo, onVolver }) {
  const mostrarToast = useToast();
  const [alias, setAlias] = useState('');
  const [cargando, setCargando] = useState(false);

  async function unirse() {
    if (!alias.trim()) return;
    setCargando(true);
    try {
      const participante = await api.unirseComoParticipante(acceso.inventario.id, acceso.clave, alias.trim());
      onListo(participante);
    } catch {
      mostrarToast('No se pudo unir al inventario, intenta de nuevo', 'error');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="pantalla">
      <div className="contenedor">
        <div className="tarjeta">
          <h1 className="titulo-pantalla">¿Quién eres?</h1>
          <p className="subtitulo">{acceso.tienda.edp} · {acceso.tienda.glosa}</p>

          <div className="campo" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
            <IconoUsuario tamano={18} />
            <input
              placeholder="Tu nombre o alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && unirse()}
              style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, padding: '15px 0' }}
              autoFocus
            />
          </div>

          <button className="btn btn-primario" disabled={!alias.trim() || cargando} onClick={unirse}>
            {cargando ? 'Ingresando...' : 'Continuar'}
          </button>

          <button className="btn-texto" style={{ display: 'block', margin: '16px auto 0' }} onClick={onVolver}>
            Cambiar de tienda
          </button>
        </div>
      </div>
    </div>
  );
}
