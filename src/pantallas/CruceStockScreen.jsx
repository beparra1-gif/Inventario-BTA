import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { formatearFecha } from '../utilidades/fecha.js';

// Pantalla propia del cruce de stock (no una tarjeta más adentro de
// "gestionar"): resumen de verificación primero, y desde ahí se navega al
// detalle por artículo o a cargar/actualizar el stock teórico — cada paso
// es su propia vista para no amontonar todo junto.
export function CruceStockScreen({ inventario, adminId, vistaInicial = 'resumen', onVolver }) {
  const mostrarToast = useToast();
  const [vista, setVista] = useState(vistaInicial); // 'resumen' | 'cargar' | 'detalle'
  const [resumen, setResumen] = useState(null);
  const [diferencias, setDiferencias] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoArchivo, setCargandoArchivo] = useState(false);
  const [filtroParticipante, setFiltroParticipante] = useState(null); // { id, alias, nombre } | null
  const [soloDiferencias, setSoloDiferencias] = useState(true);
  const inputRef = useRef(null);

  useEffect(() => {
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventario.id]);

  async function cargarTodo() {
    setCargando(true);
    try {
      const [r, d] = await Promise.all([
        api.resumenInventario(inventario.id),
        api.diferenciasStock(inventario.id, adminId),
      ]);
      setResumen(r);
      setDiferencias(d);
    } catch {
      mostrarToast('No se pudo cargar el cruce de stock', 'error');
    } finally {
      setCargando(false);
    }
  }

  async function subirArchivo(evento) {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    setCargandoArchivo(true);
    try {
      const r = await api.cargarStock(inventario.id, adminId, archivo);
      mostrarToast(`Stock teórico cargado: ${r.filasCargadas} código+talla`, 'ok');
      await cargarTodo();
      setVista('resumen');
    } catch {
      mostrarToast('No se pudo cargar el archivo', 'error');
    } finally {
      setCargandoArchivo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function marcarRevisado(item) {
    try {
      await api.marcarRevisadoStock(inventario.id, adminId, item.codigo, item.talla);
      cargarTodo();
    } catch {
      mostrarToast('No se pudo marcar como revisado', 'error');
    }
  }

  const sinSku = useMemo(() => (resumen ? resumen.consolidado.filter((i) => !i.reconocido) : []), [resumen]);
  const unidadesSinSku = sinSku.reduce((acc, i) => acc + i.cantidad, 0);

  // "Diferencia atribuida" a un capturador es aproximada a propósito: un
  // mismo código+talla puede haberlo tocado más de una persona, así que acá
  // se cuenta en cuántos artículos con diferencia participó cada uno (no se
  // le adjudica el total de la diferencia, sería engañoso).
  const porUsuario = useMemo(() => {
    if (!resumen || !diferencias) return [];
    const mapa = new Map();
    for (const p of resumen.participantes) {
      if (!mapa.has(p.id)) mapa.set(p.id, { id: p.id, alias: p.alias, nombre: p.nombre, cantidad: 0, skus: new Set() });
      mapa.get(p.id).cantidad += p.unidades;
    }
    for (const item of diferencias.items) {
      if (item.diferencia === 0) continue;
      for (const t of item.tax) {
        const entry = mapa.get(t.participanteId);
        if (!entry) continue;
        entry.skus.add(`${item.codigo}-${item.talla}`);
      }
    }
    return [...mapa.values()]
      .map((e) => ({ ...e, skusConDiferencia: e.skus.size }))
      .sort((a, b) => b.skusConDiferencia - a.skusConDiferencia);
  }, [resumen, diferencias]);

  const pendientes = diferencias ? diferencias.items.filter((i) => i.diferencia !== 0 && !i.revisadoEn).length : 0;
  const conDiferencia = diferencias ? diferencias.items.filter((i) => i.diferencia !== 0).length : 0;

  function verDetalleDe(participante) {
    setFiltroParticipante(participante);
    setVista('detalle');
  }

  if (cargando) {
    return (
      <div className="tarjeta">
        <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Cargando...</p>
      </div>
    );
  }

  if (vista === 'cargar') {
    return (
      <div className="tarjeta" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Cargar stock teórico de tienda</h3>
          <button className="btn-texto" style={{ padding: 0 }} onClick={() => setVista('resumen')}>‹ Volver</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--texto-tenue)', margin: '-4px 0 10px' }}>
          Sube el .txt con el stock teórico de la tienda (formato código;talla;cantidad, ej. 0015032;05;1) para comparar
          contra lo capturado. Cada carga reemplaza a la anterior.
        </p>
        {diferencias?.stockCargadoEn && (
          <p style={{ fontSize: 12, margin: '0 0 10px' }}>Última carga: {formatearFecha(diferencias.stockCargadoEn)}.</p>
        )}
        <input ref={inputRef} className="campo" type="file" accept=".txt" disabled={cargandoArchivo} onChange={subirArchivo} />
        {cargandoArchivo && <p style={{ fontSize: 13, color: 'var(--texto-tenue)', marginTop: -8 }}>Cargando…</p>}
      </div>
    );
  }

  if (vista === 'detalle') {
    const items = diferencias.items.filter((item) => {
      if (soloDiferencias && item.diferencia === 0) return false;
      if (filtroParticipante && !item.tax.some((t) => t.participanteId === filtroParticipante.id)) return false;
      return true;
    });
    return (
      <div className="tarjeta">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Detalle por artículo</h3>
          <button className="btn-texto" style={{ padding: 0 }} onClick={() => setVista('resumen')}>‹ Volver</button>
        </div>
        {filtroParticipante && (
          <div className="chip" style={{ marginBottom: 10, cursor: 'pointer' }} onClick={() => setFiltroParticipante(null)}>
            Solo {filtroParticipante.nombre || filtroParticipante.alias} ✕
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, margin: '0 0 12px' }}>
          <input type="checkbox" checked={soloDiferencias} onChange={(e) => setSoloDiferencias(e.target.checked)} />
          Mostrar solo diferencias
        </label>
        <div style={{ overflowX: 'auto' }}>
          <table className="tabla-resumen">
            <thead>
              <tr>
                <th></th><th>Código</th><th>Talla</th><th>Descripción</th>
                <th>Capturado</th><th>Stock</th><th>Diferencia</th><th>Dónde se capturó</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.codigo}-${item.talla}`}>
                  <td>
                    <img
                      src={item.fotoUrl}
                      alt=""
                      style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }}
                      onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                    />
                  </td>
                  <td>{item.codigo}</td>
                  <td>{item.tallaReal || item.talla}</td>
                  <td>{item.descripcion || '—'}</td>
                  <td>{item.cantidadCapturada}</td>
                  <td>{item.cantidadStock}</td>
                  <td style={{ fontWeight: 700, color: item.diferencia === 0 ? 'var(--exito)' : '#B91C1C' }}>
                    {item.diferencia > 0 ? `+${item.diferencia}` : item.diferencia}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {item.tax.length === 0
                      ? '—'
                      : item.tax.map((t) => (
                          <div key={t.taxId}>
                            Tax {t.numeroTax}{t.taxNombre ? ` · ${t.taxNombre}` : ''} — {t.nombre || t.alias} ({t.cantidad})
                          </div>
                        ))}
                  </td>
                  <td>
                    {item.diferencia === 0 ? (
                      '—'
                    ) : item.revisadoEn ? (
                      <span style={{ color: 'var(--exito)', fontSize: 12, fontWeight: 700 }}>✓ revisado</span>
                    ) : (
                      <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => marcarRevisado(item)}>
                        Marcar revisado
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Sin resultados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="tarjeta">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Cruce de stock</h3>
          <button className="btn-texto" style={{ padding: 0 }} onClick={onVolver}>‹ Volver</button>
        </div>
        <p style={{ fontSize: 13, margin: '0 0 16px', color: 'var(--texto-tenue)' }}>
          {inventario.numero_inventario}
          {diferencias?.stockCargadoEn
            ? ` · stock teórico cargado ${formatearFecha(diferencias.stockCargadoEn)}`
            : ' · todavía no se ha cargado el stock teórico de la tienda'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div style={{ background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--texto-tenue)', fontWeight: 700 }}>Cantidad capturada</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{resumen.totalUnidades}</div>
          </div>
          <div style={{ background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--texto-tenue)', fontWeight: 700 }}>Líneas sin SKU</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{sinSku.length}</div>
            <div style={{ fontSize: 11, color: 'var(--texto-tenue)' }}>{unidadesSinSku} unidad{unidadesSinSku === 1 ? '' : 'es'}</div>
          </div>
          <div style={{ background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--texto-tenue)', fontWeight: 700 }}>Artículos con diferencia</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: conDiferencia > 0 ? '#B91C1C' : 'var(--exito)' }}>{conDiferencia}</div>
          </div>
          <div style={{ background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--texto-tenue)', fontWeight: 700 }}>Pendientes de validar</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: pendientes > 0 ? '#B91C1C' : 'var(--exito)' }}>{pendientes}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secundario btn-chico" onClick={() => setVista('cargar')}>
            {diferencias?.stockCargadoEn ? 'Actualizar stock teórico' : 'Cargar stock teórico'}
          </button>
          <button className="btn btn-secundario btn-chico" onClick={() => verDetalleDe(null)}>
            Ver detalle por artículo
          </button>
        </div>
        {pendientes > 0 && (
          <p style={{ fontSize: 12, color: '#B91C1C', margin: '12px 0 0' }}>
            Mientras haya diferencias sin validar, el inventario no se puede cerrar.
          </p>
        )}
      </div>

      <div className="tarjeta">
        <h3 style={{ marginTop: 0 }}>Detalle por capturador</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="tabla-resumen">
            <thead><tr><th>Nombre</th><th>Cantidad capturada</th><th>Artículos con diferencia</th><th></th></tr></thead>
            <tbody>
              {porUsuario.map((u) => (
                <tr key={u.id}>
                  <td>{u.nombre || u.alias}</td>
                  <td>{u.cantidad}</td>
                  <td style={{ color: u.skusConDiferencia > 0 ? '#B91C1C' : 'var(--exito)', fontWeight: 700 }}>
                    {u.skusConDiferencia > 0 ? `⚠ ${u.skusConDiferencia}` : '✓ 0'}
                  </td>
                  <td>
                    {u.skusConDiferencia > 0 && (
                      <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => verDetalleDe(u)}>
                        Ver diferencias
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {porUsuario.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Sin capturadores todavía.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
