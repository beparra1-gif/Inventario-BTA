import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { IconoTienda } from '../componentes/Iconos.jsx';
import { formatearFecha } from '../utilidades/fecha.js';

// Rol de solo consulta + validación: el auditor ve inventarios/tax pero no
// puede crear, cerrar, borrar ni administrar nada de eso (el backend igual
// lo bloquea aparte, esto es solo para no ofrecerle botones que fallarían).
export function AuditorDashboard({ admin, onSalir }) {
  const mostrarToast = useToast();
  const [vista, setVista] = useState('inventarios'); // 'inventarios' | 'taxes' | 'detalle'
  const [busqueda, setBusqueda] = useState('');
  const [inventarios, setInventarios] = useState([]);
  const [inventarioSel, setInventarioSel] = useState(null);
  const [taxes, setTaxes] = useState([]);
  const [taxSel, setTaxSel] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cantidadInput, setCantidadInput] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(cargarInventarios, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  async function cargarInventarios() {
    try {
      setInventarios(await api.buscarInventarios(busqueda, admin.id));
    } catch {
      /* búsqueda incremental: un fallo de red acá no amerita interrumpir */
    }
  }

  async function abrirInventario(inv) {
    setInventarioSel(inv);
    setVista('taxes');
    setCargando(true);
    try {
      setTaxes(await api.auditoriaTaxesDeInventario(inv.id, admin.id));
    } catch {
      mostrarToast('No se pudo cargar el inventario', 'error');
    } finally {
      setCargando(false);
    }
  }

  async function abrirTax(t) {
    setTaxSel(t);
    setVista('detalle');
    setCargando(true);
    try {
      const d = await api.auditoriaDetalleTax(t.id, admin.id);
      setDetalle(d);
      setCantidadInput(String(d.cantidadCapturada));
    } catch {
      mostrarToast('No se pudo cargar el detalle del tax', 'error');
    } finally {
      setCargando(false);
    }
  }

  async function confirmarValidacion() {
    const cantidad = Number(cantidadInput);
    if (!Number.isInteger(cantidad) || cantidad < 0) return;
    try {
      const r = await api.auditoriaValidarTax(taxSel.id, admin.id, cantidad);
      mostrarToast(
        r.inconsistente
          ? `Inconsistencia: se capturaron ${r.cantidadCapturada}, validaste ${cantidad} — se avisó al admin`
          : 'Validado, todo calza',
        r.inconsistente ? 'error' : 'ok'
      );
      abrirInventario(inventarioSel);
    } catch {
      mostrarToast('No se pudo validar el tax', 'error');
    }
  }

  return (
    <div className="pantalla" style={{ alignItems: 'stretch' }}>
      <div className="contenedor-ancho">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: '1.4em' }}>Panel de auditoría</h1>
          <button className="btn-texto" onClick={onSalir}>Salir</button>
        </div>

        {vista === 'inventarios' && (
          <div className="tarjeta" style={{ maxWidth: 560 }}>
            <h3 style={{ marginTop: 0 }}>Inventarios</h3>
            <input
              className="campo"
              placeholder="Buscar por número, tienda o EDP..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoFocus
            />
            {inventarios.map((inv) => (
              <button
                key={inv.id}
                className="btn btn-secundario"
                style={{ justifyContent: 'space-between', marginBottom: 8, textAlign: 'left' }}
                onClick={() => abrirInventario(inv)}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IconoTienda tamano={14} /> {inv.numero_inventario} · {inv.edp} {inv.tienda_glosa}
                </span>
                <span style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700, color: 'var(--texto-tenue)' }}>
                  {inv.estado} · {formatearFecha(inv.creado_en)}
                </span>
              </button>
            ))}
            {inventarios.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--texto-tenue)', fontSize: 13 }}>Sin resultados.</p>
            )}
          </div>
        )}

        {vista === 'taxes' && inventarioSel && (
          <div className="tarjeta" style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h3 style={{ margin: 0 }}>{inventarioSel.edp} · {inventarioSel.tienda_glosa}</h3>
              <button className="btn-texto" style={{ padding: 0 }} onClick={() => setVista('inventarios')}>‹ Volver</button>
            </div>
            <p style={{ fontSize: 13, margin: '0 0 16px' }}>
              Inventario <strong>{inventarioSel.numero_inventario}</strong>
            </p>

            {cargando ? (
              <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Cargando...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {taxes.map((t) => {
                  const cerrado = t.estado === 'cerrado';
                  const inconsistente = t.validado_en && t.cantidad_validada !== t.cantidad_capturada;
                  return (
                    <button
                      key={t.id}
                      className="btn btn-secundario"
                      style={{ justifyContent: 'space-between', textAlign: 'left', opacity: cerrado ? 1 : 0.6 }}
                      onClick={() => cerrado && abrirTax(t)}
                      disabled={!cerrado}
                    >
                      <span>
                        Tax {t.numero_tax}{t.nombre ? ` · ${t.nombre}` : ''}
                        <span style={{ color: 'var(--texto-tenue)', fontWeight: 400 }}> — {t.participante_nombre || t.alias}</span>
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: !cerrado ? 'var(--texto-suave)' : inconsistente ? '#B91C1C' : t.validado_en ? 'var(--exito)' : 'var(--texto-tenue)',
                        }}
                      >
                        {!cerrado ? 'abierto' : t.validado_en ? (inconsistente ? '⚠ inconsistente' : '✓ validado') : `${t.cantidad_capturada} u. · sin validar`}
                      </span>
                    </button>
                  );
                })}
                {taxes.length === 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--texto-tenue)', fontSize: 13 }}>Este inventario todavía no tiene tax.</p>
                )}
              </div>
            )}
          </div>
        )}

        {vista === 'detalle' && detalle && (
          <div className="tarjeta" style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h3 style={{ margin: 0 }}>Tax {detalle.numero_tax}{detalle.nombre ? ` · ${detalle.nombre}` : ''}</h3>
              <button className="btn-texto" style={{ padding: 0 }} onClick={() => setVista('taxes')}>‹ Volver</button>
            </div>
            <p style={{ fontSize: 13, margin: '0 0 16px', color: 'var(--texto-tenue)' }}>
              Capturado por {detalle.participante_nombre || detalle.alias}
            </p>

            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table className="tabla-resumen">
                <thead><tr><th>Código</th><th>Talla</th><th>Descripción</th><th>Cantidad</th></tr></thead>
                <tbody>
                  {detalle.consolidado.map((item) => (
                    <tr key={`${item.codigo}-${item.talla}`}>
                      <td>{item.codigo}</td>
                      <td>{item.tallaReal || item.talla}</td>
                      <td>{item.descripcion || '—'}</td>
                      <td>{item.cantidad}</td>
                    </tr>
                  ))}
                  {detalle.consolidado.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Sin artículos.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <p style={{ fontSize: 14, margin: '0 0 8px' }}>
              Total capturado en el sistema: <strong>{detalle.cantidadCapturada}</strong>
            </p>
            <label className="etiqueta">Cantidad que contaste</label>
            <input
              className="campo"
              type="number"
              inputMode="numeric"
              value={cantidadInput}
              onChange={(e) => setCantidadInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmarValidacion()}
            />
            <button className="btn btn-primario" onClick={confirmarValidacion} disabled={cantidadInput === ''}>
              Confirmar validación
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
