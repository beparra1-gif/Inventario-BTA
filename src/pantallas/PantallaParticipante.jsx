import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { EncabezadoInventario } from '../componentes/EncabezadoInventario.jsx';
import { IconoCandado } from '../componentes/Iconos.jsx';

// Cada capturador tiene su propia sigla + clave numérica personal (no una
// clave de inventario compartida) — evita que se mezclen o que alguien
// entre sin querer al perfil de otra persona.
export function PantallaParticipante({ acceso, onListo, onVolver }) {
  const mostrarToast = useToast();
  const [perfiles, setPerfiles] = useState(null);
  const [alias, setAlias] = useState('');
  const [clave, setClave] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api.participantesDeInventario(acceso.inventario.id).then(setPerfiles).catch(() => setPerfiles([]));
  }, [acceso.inventario.id]);

  async function entrar() {
    if (!alias || !clave) return;
    setCargando(true);
    try {
      const participante = await api.loginParticipante(acceso.inventario.id, alias, clave);
      onListo(participante);
    } catch (error) {
      mostrarToast(error.status === 401 ? 'Sigla o clave incorrecta' : 'No se pudo entrar, intenta de nuevo', 'error');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="pantalla">
      <EncabezadoInventario tienda={acceso.tienda} inventario={acceso.inventario} />
      <div className="contenedor">
        <div className="tarjeta">
          <h1 className="titulo-pantalla">¿Quién eres?</h1>

          {perfiles === null ? (
            <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Cargando...</p>
          ) : perfiles.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>
              Todavía no hay personal de captura asignado a este inventario — pídele al administrador que te agregue desde el panel.
            </p>
          ) : (
            <>
              <label className="etiqueta">Tu sigla</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {perfiles.map((p) => (
                  <button
                    key={p.id}
                    className="chip"
                    style={{ background: alias === p.alias ? 'var(--primario)' : undefined, color: alias === p.alias ? 'white' : undefined, borderColor: alias === p.alias ? 'var(--primario)' : undefined }}
                    onClick={() => setAlias(p.alias)}
                  >
                    {p.nombre ? `${p.nombre} (${p.alias})` : p.alias}
                  </button>
                ))}
              </div>

              <label className="etiqueta">Tu clave personal</label>
              <div className="campo" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
                <IconoCandado tamano={18} />
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder="Clave numérica"
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && entrar()}
                  style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, padding: '15px 0' }}
                />
              </div>

              <button className="btn btn-primario" disabled={!alias || !clave || cargando} onClick={entrar}>
                {cargando ? 'Entrando...' : 'Entrar'}
              </button>
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
