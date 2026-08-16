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
//
// Cada fila guarda con su propio botón "Guardar" apenas se cambia el
// número — no hay un paso intermedio de "entrar en modo edición" que se
// pueda saltar sin querer y perder el cambio (eso pasaba antes: si tipeabas
// y apretabas el botón de abajo sin primero confirmar la fila, el número
// nunca se mandaba al servidor y no pasaba nada visible).
export function EditorCorreccionTax({ contexto, adminId, onCerrar, onCambio }) {
  const mostrarToast = useToast();
  const [preparando, setPreparando] = useState(true);
  const [filas, setFilas] = useState([]);
  const [valores, setValores] = useState({}); // { [filaId]: string }
  const [cantidadNueva, setCantidadNueva] = useState('');
  const [guardandoId, setGuardandoId] = useState(null);
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
    const filtradas = todas.filter((f) => f.codigo === contexto.codigo && f.talla === contexto.talla);
    setFilas(filtradas);
    setValores(Object.fromEntries(filtradas.map((f) => [f.id, String(f.cantidad)])));
  }

  async function guardarFila(fila) {
    const cantidad = Number(valores[fila.id]);
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      mostrarToast('La cantidad tiene que ser un número entero mayor a 0', 'error');
      return;
    }
    setGuardandoId(fila.id);
    try {
      await api.editarCaptura(fila.id, cantidad);
      mostrarToast(`Cantidad actualizada a ${cantidad}`, 'ok');
      await cargarFilas();
      onCambio();
    } catch {
      mostrarToast('No se pudo actualizar la cantidad', 'error');
    } finally {
      setGuardandoId(null);
    }
  }

  async function borrarFila(fila) {
    if (!window.confirm('¿Borrar esta captura puntual?')) return;
    setGuardandoId(fila.id);
    try {
      await api.eliminarCaptura(fila.id);
      mostrarToast('Captura borrada', 'ok');
      await cargarFilas();
      onCambio();
    } catch {
      mostrarToast('No se pudo borrar la captura', 'error');
    } finally {
      setGuardandoId(null);
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
    setGuardando(true);
    try {
      await api.cerrarTax(contexto.taxId);
      mostrarToast(`Tax ${contexto.numeroTax} cerrado de nuevo`, 'ok');
      onCambio();
      onCerrar();
    } catch {
      mostrarToast('No se pudo cerrar el tax', 'error');
    } finally {
      setGuardando(false);
    }
  }

  const totalActual = filas.reduce((acc, f) => acc + f.cantidad, 0);

  return (
    <div className="fondo-modal" onClick={onCerrar}>
      <div className="modal-centrado" onClick={(e) => e.stopPropagation()}>
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
              Cambia el número de la línea que necesites y tocá "Guardar" en esa misma línea — se aplica al toque.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {filas.map((f) => {
                const valorActual = valores[f.id] ?? '';
                const cambiado = Number(valorActual) !== f.cantidad;
                const ocupado = guardandoId === f.id;
                return (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--borde)', borderRadius: 10, padding: '8px 10px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--texto-tenue)', minWidth: 90 }}>
                      {f.origen === 'manual' ? 'Manual' : 'Escaneo'} · {formatearFecha(f.creado_en)}
                    </div>
                    <input
                      className="campo"
                      style={{ marginBottom: 0, width: 70, padding: '6px 8px' }}
                      type="number"
                      inputMode="numeric"
                      value={valorActual}
                      onChange={(e) => setValores((v) => ({ ...v, [f.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && guardarFila(f)}
                    />
                    <button
                      className="btn btn-secundario btn-chico"
                      style={{ padding: '6px 12px' }}
                      disabled={ocupado || !cambiado}
                      onClick={() => guardarFila(f)}
                    >
                      {ocupado ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button className="btn-texto" style={{ padding: 0, fontSize: 12, color: '#B91C1C' }} disabled={ocupado} onClick={() => borrarFila(f)}>
                      Borrar
                    </button>
                  </div>
                );
              })}
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

            <button className="btn btn-primario" disabled={guardando} onClick={cerrarTaxDeNuevo}>
              Cerrar este tax de nuevo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
