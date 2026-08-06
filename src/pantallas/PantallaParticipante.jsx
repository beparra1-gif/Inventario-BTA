import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { IconoUsuario } from '../componentes/Iconos.jsx';

export function PantallaParticipante({ acceso, onListo, onVolver }) {
  const mostrarToast = useToast();
  const [perfiles, setPerfiles] = useState([]);
  const [alias, setAlias] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api.participantesDeInventario(acceso.inventario.id).then(setPerfiles).catch(() => {});
  }, [acceso.inventario.id]);

  async function unirse(aliasElegido) {
    const valor = aliasElegido ?? alias.trim();
    if (!valor) return;
    setCargando(true);
    try {
      const participante = await api.unirseComoParticipante(acceso.inventario.id, acceso.clave, valor);
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

          {perfiles.length > 0 && (
            <>
              <label className="etiqueta">Ya son parte de este inventario — toca el tuyo para continuar donde quedaste</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {perfiles.map((p) => (
                  <button
                    key={p.id}
                    className="btn btn-secundario btn-chico"
                    disabled={cargando}
                    onClick={() => unirse(p.alias)}
                  >
                    {p.alias}
                  </button>
                ))}
              </div>
              <label className="etiqueta">¿No estás en la lista? Escribe tu inicial + apellido</label>
            </>
          )}

          <div className="campo" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
            <IconoUsuario tamano={18} />
            <input
              placeholder="Ej. J.PEREZ"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && unirse()}
              style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, padding: '15px 0' }}
              autoFocus={perfiles.length === 0}
            />
          </div>

          <button className="btn btn-primario" disabled={!alias.trim() || cargando} onClick={() => unirse()}>
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
