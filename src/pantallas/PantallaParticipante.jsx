import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';

export function PantallaParticipante({ acceso, onListo, onVolver }) {
  const mostrarToast = useToast();
  const [perfiles, setPerfiles] = useState(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api.participantesDeInventario(acceso.inventario.id).then(setPerfiles).catch(() => setPerfiles([]));
  }, [acceso.inventario.id]);

  async function unirse(alias) {
    setCargando(true);
    try {
      const participante = await api.unirseComoParticipante(acceso.inventario.id, acceso.clave, alias);
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

          {perfiles === null ? (
            <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Cargando...</p>
          ) : perfiles.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>
              Todavía no hay personal de captura asignado a este inventario — pídele al administrador que te agregue desde el panel.
            </p>
          ) : (
            <>
              <label className="etiqueta">Toca tu nombre para entrar (o continuar donde quedaste)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                {perfiles.map((p) => (
                  <button
                    key={p.id}
                    className="btn btn-secundario"
                    disabled={cargando}
                    onClick={() => unirse(p.alias)}
                  >
                    {p.nombre ? `${p.nombre} (${p.alias})` : p.alias}
                  </button>
                ))}
              </div>
            </>
          )}

          <button className="btn-texto" style={{ display: 'block', margin: '16px auto 0' }} onClick={onVolver}>
            Cambiar de tienda
          </button>
        </div>
      </div>
    </div>
  );
}
