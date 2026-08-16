import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { formatearFecha } from '../utilidades/fecha.js';

// Editor de un tax completo: reabre si hace falta, muestra TODO lo
// capturado agrupado por código (cada línea con su propio "Guardar"
// inmediato, sin paso intermedio que se pueda saltar sin querer), deja
// agregar cualquier código+talla nuevo a mano (mismo flujo de código →
// tallas del maestro → cantidad que usa el capturador), y cerrar el tax de
// nuevo al terminar. Sirve tanto para "Modificar" en Progreso por
// participante (contexto general, sin nada destacado) como para
// "Corregir" desde el reporte de diferencias (contexto.codigoDestacado
// hace scroll y resalta esa línea puntual al abrir).
export function EditorTax({ contexto, adminId, onCerrar, onCambio }) {
  const mostrarToast = useToast();
  const [preparando, setPreparando] = useState(true);
  const [capturas, setCapturas] = useState([]);
  const [valores, setValores] = useState({}); // { [filaId]: string }
  const [guardandoId, setGuardandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const [codigoNuevo, setCodigoNuevo] = useState('');
  const [tallasNuevo, setTallasNuevo] = useState(null); // null = sin consultar, [] = no está en el maestro
  const [tallaNueva, setTallaNueva] = useState('');
  const [cantidadNueva, setCantidadNueva] = useState('1');

  const destacadaRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        if (contexto.estado === 'cerrado') {
          await api.reabrirTax(contexto.taxId, { adminId });
          mostrarToast(`Tax ${contexto.numeroTax} reabierto para corregir`, 'ok');
          onCambio();
        }
        await cargarCapturas();
      } catch {
        mostrarToast('No se pudo preparar la corrección', 'error');
      } finally {
        setPreparando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!preparando && destacadaRef.current) {
      destacadaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [preparando]);

  // Igual que en la captura del participante: apenas el código queda
  // completo se consultan las tallas del maestro para elegir de una lista.
  useEffect(() => {
    setTallaNueva('');
    if (!/^\d{7}$/.test(codigoNuevo)) {
      setTallasNuevo(null);
      return undefined;
    }
    let cancelado = false;
    api.tallasDeArticulo(codigoNuevo)
      .then((r) => { if (!cancelado) setTallasNuevo(r.tallas); })
      .catch(() => { if (!cancelado) setTallasNuevo([]); });
    return () => { cancelado = true; };
  }, [codigoNuevo]);

  async function cargarCapturas() {
    const todas = await api.capturasDeTax(contexto.taxId);
    setCapturas(todas);
    setValores(Object.fromEntries(todas.map((f) => [f.id, String(f.cantidad)])));
  }

  const agrupadas = useMemo(() => {
    const mapa = new Map();
    for (const c of capturas) {
      if (!mapa.has(c.codigo)) mapa.set(c.codigo, { codigo: c.codigo, filas: [] });
      mapa.get(c.codigo).filas.push(c);
    }
    return [...mapa.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [capturas]);

  const totalTax = capturas.reduce((acc, c) => acc + c.cantidad, 0);

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
      await cargarCapturas();
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
      await cargarCapturas();
      onCambio();
    } catch {
      mostrarToast('No se pudo borrar la captura', 'error');
    } finally {
      setGuardandoId(null);
    }
  }

  async function agregarArticulo() {
    const cantidad = Number(cantidadNueva);
    if (!/^\d{7}$/.test(codigoNuevo) || !tallaNueva || !Number.isInteger(cantidad) || cantidad <= 0) return;
    setGuardando(true);
    try {
      await api.crearCaptura({ taxId: contexto.taxId, codigo: codigoNuevo, talla: tallaNueva, cantidad, origen: 'manual' });
      mostrarToast('Artículo agregado', 'ok');
      setCodigoNuevo('');
      setTallaNueva('');
      setTallasNuevo(null);
      setCantidadNueva('1');
      await cargarCapturas();
      onCambio();
    } catch (error) {
      mostrarToast(error.info?.error === 'tax_cerrado' ? 'El tax se cerró, reabrilo de nuevo' : 'No se pudo agregar el artículo', 'error');
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

  return (
    <div className="fondo-modal" onClick={onCerrar}>
      <div className="modal-centrado" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Tax {contexto.numeroTax}{contexto.taxNombre ? ` · ${contexto.taxNombre}` : ''}</h3>
          <button className="btn-texto" style={{ padding: 0 }} onClick={onCerrar}>Cerrar</button>
        </div>
        <p style={{ fontSize: 13, margin: '0 0 16px', color: 'var(--texto-tenue)' }}>
          {contexto.nombre || contexto.alias}
        </p>

        {preparando ? (
          <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Preparando…</p>
        ) : (
          <>
            <div style={{ background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <label className="etiqueta">Agregar artículo</label>
              <input
                className="campo"
                inputMode="numeric"
                maxLength={7}
                placeholder="Código de producto (7 dígitos)"
                value={codigoNuevo}
                onChange={(e) => setCodigoNuevo(e.target.value.replace(/\D/g, ''))}
              />
              {tallasNuevo && tallasNuevo.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {tallasNuevo.map((t) => {
                    const etiqueta = t.tallaReal || (t.tallaUnica ? 'única' : `${t.tallaCruda}*`);
                    const activa = tallaNueva === t.tallaCruda;
                    return (
                      <button
                        key={t.tallaCruda}
                        onClick={() => setTallaNueva(t.tallaCruda)}
                        className="btn-chico"
                        style={{
                          borderRadius: 8, border: '1px solid var(--borde)',
                          background: activa ? 'var(--primario)' : 'var(--fondo-tarjeta)',
                          color: activa ? 'white' : 'var(--texto)', fontWeight: 700,
                        }}
                      >
                        {etiqueta}
                      </button>
                    );
                  })}
                </div>
              ) : tallasNuevo && /^\d{7}$/.test(codigoNuevo) ? (
                <p style={{ fontSize: 12, color: 'var(--texto-tenue)', margin: '0 0 12px' }}>Ese código no está en el maestro.</p>
              ) : null}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="campo"
                  style={{ marginBottom: 0, width: 80 }}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="Cant."
                  value={cantidadNueva}
                  onChange={(e) => setCantidadNueva(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && agregarArticulo()}
                />
                <button
                  className="btn btn-primario btn-chico"
                  style={{ flex: 1 }}
                  disabled={guardando || !tallaNueva || !(Number(cantidadNueva) > 0)}
                  onClick={agregarArticulo}
                >
                  Agregar
                </button>
              </div>
            </div>

            <p style={{ fontSize: 13, margin: '0 0 12px' }}>
              Este tax lleva capturado en total <strong>{totalTax}</strong> unidad{totalTax === 1 ? '' : 'es'}.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {agrupadas.map((grupo) => (
                <div key={grupo.codigo}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                    {grupo.codigo} <span style={{ fontWeight: 400, color: 'var(--texto-tenue)' }}>{grupo.filas[0]?.descripcion || ''}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {grupo.filas.map((f) => {
                      const valorActual = valores[f.id] ?? '';
                      const cambiado = Number(valorActual) !== f.cantidad;
                      const ocupado = guardandoId === f.id;
                      const destacada = contexto.codigoDestacado === f.codigo && (!contexto.tallaDestacada || contexto.tallaDestacada === f.talla);
                      return (
                        <div
                          key={f.id}
                          ref={destacada ? destacadaRef : null}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                            border: `1px solid ${destacada ? 'var(--primario)' : 'var(--borde)'}`,
                            background: destacada ? 'color-mix(in srgb, var(--primario) 6%, transparent)' : 'none',
                            borderRadius: 10, padding: '8px 10px',
                          }}
                        >
                          <div style={{ flex: 1, fontSize: 12, color: 'var(--texto-tenue)', minWidth: 90 }}>
                            talla {f.tallaReal || f.talla} · {f.origen === 'manual' ? 'Manual' : 'Escaneo'} · {formatearFecha(f.creado_en)}
                          </div>
                          <input
                            className="campo"
                            style={{ marginBottom: 0, width: 64, padding: '6px 8px' }}
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
                  </div>
                </div>
              ))}
              {agrupadas.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--texto-tenue)', textAlign: 'center' }}>Este tax todavía no tiene artículos capturados.</p>
              )}
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
