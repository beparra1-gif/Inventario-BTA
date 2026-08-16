import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { formatearFecha } from '../utilidades/fecha.js';

// Hoja modal para corregir, desde el reporte de diferencias, exactamente lo
// que un tax capturó de un código+talla puntual — sin esto, la única
// herramienta del admin era "Modificar" (reabrir y esperar a que el
// capturador entre a arreglarlo él mismo) o "Rehacer" (borrar todo el tax
// y empezar de cero). Reabre el tax solo si hace falta, reusa las mismas
// rutas de capturas.js que ya usa el propio capturador.
export function EditorCorreccionTax({ contexto, adminId, onCerrar, onCambio }) {
  const mostrarToast = useToast();
  const [preparando, setPreparando] = useState(true);
  const [filas, setFilas] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [cantidadEditando, setCantidadEditando] = useState('');
  const [cantidadNueva, setCantidadNueva] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (contexto.estado === 'cerrado') {
          await api.reabrirTax(contexto.taxId, { adminId });
          mostrarToast(`Tax ${contexto.numeroTax} reabierto para corregir`, 'ok');
          onCambio();
        }
        await cargarFilas();
      } catch {
        mostrarToast('No se pudo preparar la corrección', 'error');
      } finally {
        setPreparando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarFilas() {
    const todas = await api.capturasDeTax(contexto.taxId);
    setFilas(todas.filter((f) => f.codigo === contexto.codigo && f.talla === contexto.talla));
  }

  async function guardarCantidad(fila) {
    const cantidad = Number(cantidadEditando);
    if (!Number.isInteger(cantidad) || cantidad <= 0) return;
    setGuardando(true);
    try {
      await api.editarCaptura(fila.id, cantidad);
      setEditandoId(null);
      await cargarFilas();
      onCambio();
    } catch {
      mostrarToast('No se pudo actualizar la cantidad', 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function borrarFila(fila) {
    if (!window.confirm('¿Borrar esta captura puntual?')) return;
    setGuardando(true);
    try {
      await api.eliminarCaptura(fila.id);
      await cargarFilas();
      onCambio();
    } catch {
      mostrarToast('No se pudo borrar la captura', 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function agregarCorreccion() {
    const cantidad = Number(cantidadNueva);
    if (!Number.isInteger(cantidad) || cantidad <= 0) return;
    setGuardando(true);
    try {
      await api.crearCaptura({ taxId: contexto.taxId, codigo: contexto.codigo, talla: contexto.talla, cantidad, origen: 'manual' });
      setCantidadNueva('');
      await cargarFilas();
      onCambio();
      mostrarToast('Corrección agregada', 'ok');
    } catch {
      mostrarToast('No se pudo agregar la corrección', 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function cerrarTaxDeNuevo() {
    try {
      await api.cerrarTax(contexto.taxId);
      mostrarToast(`Tax ${contexto.numeroTax} cerrado de nuevo`, 'ok');
      onCambio();
      onCerrar();
    } catch {
      mostrarToast('No se pudo cerrar el tax', 'error');
    }
  }

  const totalActual = filas.reduce((acc, f) => acc + f.cantidad, 0);

  return (
    <div className="fondo-hoja" onClick={onCerrar}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Tax {contexto.numeroTax}{contexto.taxNombre ? ` · ${contexto.taxNombre}` : ''}</h3>
          <button className="btn-texto" style={{ padding: 0 }} onClick={onCerrar}>Cerrar</button>
        </div>
        <p style={{ fontSize: 13, margin: '0 0 16px', color: 'var(--texto-tenue)' }}>
          {contexto.nombre || contexto.alias} · código {contexto.codigo} · talla {contexto.tallaReal || contexto.talla}
        </p>

        {preparando ? (
          <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Preparando…</p>
        ) : (
          <>
            <p style={{ fontSize: 13, margin: '0 0 12px' }}>
              Este tax lleva capturado <strong>{totalActual}</strong> de este código+talla, en {filas.length} línea{filas.length === 1 ? '' : 's'}.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {filas.map((f) => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--borde)', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--texto-tenue)' }}>
                    {f.origen === 'manual' ? 'Manual' : 'Escaneo'} · {formatearFecha(f.creado_en)}
                  </div>
                  {editandoId === f.id ? (
                    <>
                      <input
                        className="campo"
                        style={{ marginBottom: 0, width: 70, padding: '6px 8px' }}
                        type="number"
                        inputMode="numeric"
                        value={cantidadEditando}
                        onChange={(e) => setCantidadEditando(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && guardarCantidad(f)}
                        autoFocus
                      />
                      <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} disabled={guardando} onClick={() => guardarCantidad(f)}>OK</button>
                      <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => setEditandoId(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      <strong>{f.cantidad}</strong>
                      <button
                        className="btn-texto"
                        style={{ padding: 0, fontSize: 12 }}
                        onClick={() => { setEditandoId(f.id); setCantidadEditando(String(f.cantidad)); }}
                      >
                        Editar
                      </button>
                      <button className="btn-texto" style={{ padding: 0, fontSize: 12, color: '#B91C1C' }} disabled={guardando} onClick={() => borrarFila(f)}>
                        Borrar
                      </button>
                    </>
                  )}
                </div>
              ))}
              {filas.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--texto-tenue)', textAlign: 'center' }}>
                  Este tax no tiene capturas de este código+talla (la cantidad que veías venía de otro tax).
                </p>
              )}
            </div>

            <label className="etiqueta">Agregar corrección</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                className="campo"
                style={{ marginBottom: 0 }}
                type="number"
                inputMode="numeric"
                placeholder="Cantidad"
                value={cantidadNueva}
                onChange={(e) => setCantidadNueva(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && agregarCorreccion()}
              />
              <button className="btn btn-secundario btn-chico" disabled={guardando || !cantidadNueva} onClick={agregarCorreccion}>
                Agregar
              </button>
            </div>

            <button className="btn btn-primario" onClick={cerrarTaxDeNuevo}>
              Guardar y volver a cerrar este tax
            </button>
          </>
        )}
      </div>
    </div>
  );
}
