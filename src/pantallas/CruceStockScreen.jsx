import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { formatearFecha } from '../utilidades/fecha.js';

// Agrupa las filas código+talla en un solo renglón por código (un
// "artículo" = un producto, sin importar cuántas tallas distintas tenga)
// — así "4 líneas capturadas" significa 4 productos distintos, no 4
// código+talla, aunque cada uno se haya capturado en 10 tallas.
function agruparPorCodigo(items) {
  const mapa = new Map();
  for (const item of items) {
    if (!mapa.has(item.codigo)) {
      mapa.set(item.codigo, {
        codigo: item.codigo,
        descripcion: item.descripcion,
        fotoUrl: item.fotoUrl,
        cantidadCapturada: 0,
        cantidadStock: 0,
        diferencia: 0,
        tallas: [],
      });
    }
    const grupo = mapa.get(item.codigo);
    grupo.cantidadCapturada += item.cantidadCapturada;
    grupo.cantidadStock += item.cantidadStock;
    grupo.diferencia += item.diferencia;
    grupo.tallas.push(item);
  }
  return [...mapa.values()].sort(
    (a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia) || a.codigo.localeCompare(b.codigo)
  );
}

function participantesDe(grupo) {
  const mapa = new Map();
  for (const talla of grupo.tallas) {
    for (const t of talla.tax) {
      if (!mapa.has(t.participanteId)) mapa.set(t.participanteId, t.nombre || t.alias);
    }
  }
  return [...mapa.values()];
}

// Pantalla propia del reporte de diferencias: resumen de verificación
// primero (stock teórico, capturado, diferencias, pendientes), el detalle
// por artículo siempre visible debajo (no escondido detrás de un clic), y
// aparte la vista de cargar/actualizar el stock teórico.
export function CruceStockScreen({ inventario, adminId, vistaInicial = 'resumen', onVolver }) {
  const mostrarToast = useToast();
  const [vista, setVista] = useState(vistaInicial); // 'resumen' | 'cargar'
  const [resumen, setResumen] = useState(null);
  const [diferencias, setDiferencias] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoArchivo, setCargandoArchivo] = useState(false);
  const [filtroParticipante, setFiltroParticipante] = useState(null); // { id, alias, nombre } | null
  const [soloDiferencias, setSoloDiferencias] = useState(true);
  const [expandidos, setExpandidos] = useState(new Set());
  const inputRef = useRef(null);
  const detalleRef = useRef(null);

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
      mostrarToast('No se pudo cargar el reporte de diferencias', 'error');
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

  function alternarExpandido(codigo) {
    setExpandidos((actuales) => {
      const nuevo = new Set(actuales);
      if (nuevo.has(codigo)) nuevo.delete(codigo);
      else nuevo.add(codigo);
      return nuevo;
    });
  }

  function verDiferenciasDe(participante) {
    setFiltroParticipante(participante);
    setExpandidos(new Set());
    detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const grupos = useMemo(() => (diferencias ? agruparPorCodigo(diferencias.items) : []), [diferencias]);

  // Cantidad capturada = total de unidades (ya lo trae el resumen). Líneas
  // capturadas / stock teórico = productos DISTINTOS (por código, sin
  // desglosar por talla) — no cuenta "sin SKU", cuenta código de 7 dígitos.
  const lineasCapturadas = useMemo(
    () => new Set((diferencias?.items ?? []).filter((i) => i.cantidadCapturada > 0).map((i) => i.codigo)).size,
    [diferencias]
  );
  const totalStockTeorico = useMemo(
    () => (diferencias?.items ?? []).reduce((acc, i) => acc + i.cantidadStock, 0),
    [diferencias]
  );
  const lineasStockTeorico = useMemo(
    () => new Set((diferencias?.items ?? []).filter((i) => i.cantidadStock > 0).map((i) => i.codigo)).size,
    [diferencias]
  );
  const articulosConDiferencia = useMemo(
    () => new Set((diferencias?.items ?? []).filter((i) => i.diferencia !== 0).map((i) => i.codigo)).size,
    [diferencias]
  );
  const pendientes = diferencias ? diferencias.items.filter((i) => i.diferencia !== 0 && !i.revisadoEn).length : 0;

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

  const gruposFiltrados = grupos.filter((g) => {
    if (soloDiferencias && g.diferencia === 0 && !g.tallas.some((t) => t.diferencia !== 0)) return false;
    if (filtroParticipante && !g.tallas.some((t) => t.tax.some((tx) => tx.participanteId === filtroParticipante.id))) {
      return false;
    }
    return true;
  });

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
          <h3 style={{ margin: 0 }}>Actualizar stock teórico de tienda</h3>
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="tarjeta">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Reporte de diferencias</h3>
          <button className="btn-texto" style={{ padding: 0 }} onClick={onVolver}>‹ Volver</button>
        </div>
        <p style={{ fontSize: 13, margin: '0 0 16px', color: 'var(--texto-tenue)' }}>
          {inventario.numero_inventario}
          {diferencias?.stockCargadoEn
            ? ` · stock teórico cargado ${formatearFecha(diferencias.stockCargadoEn)}`
            : ' · todavía no se ha cargado el stock teórico de la tienda'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <div style={{ background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--texto-tenue)', fontWeight: 700 }}>Stock teórico</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{totalStockTeorico}</div>
            <div style={{ fontSize: 11, color: 'var(--texto-tenue)' }}>{lineasStockTeorico} línea{lineasStockTeorico === 1 ? '' : 's'}</div>
          </div>
          <div style={{ background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--texto-tenue)', fontWeight: 700 }}>Cantidad capturada</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{resumen.totalUnidades}</div>
            <div style={{ fontSize: 11, color: 'var(--texto-tenue)' }}>{lineasCapturadas} línea{lineasCapturadas === 1 ? '' : 's'}</div>
          </div>
          <div style={{ background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--texto-tenue)', fontWeight: 700 }}>Artículos con diferencia</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: articulosConDiferencia > 0 ? '#B91C1C' : 'var(--exito)' }}>{articulosConDiferencia}</div>
          </div>
          <div style={{ background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--texto-tenue)', fontWeight: 700 }}>Pendientes de validar</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: pendientes > 0 ? '#B91C1C' : 'var(--exito)' }}>{pendientes}</div>
          </div>
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
                      <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => verDiferenciasDe(u)}>
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

      <div className="tarjeta" ref={detalleRef}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Detalle de diferencias por artículo</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={soloDiferencias} onChange={(e) => setSoloDiferencias(e.target.checked)} />
            Mostrar solo con diferencia
          </label>
        </div>
        {filtroParticipante && (
          <div className="chip" style={{ margin: '8px 0', cursor: 'pointer' }} onClick={() => setFiltroParticipante(null)}>
            Solo {filtroParticipante.nombre || filtroParticipante.alias} ✕
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {gruposFiltrados.map((grupo) => {
            const expandido = expandidos.has(grupo.codigo);
            const participantes = participantesDe(grupo);
            const tallasConDiferencia = grupo.tallas.filter((t) => t.diferencia !== 0);
            const pendientesGrupo = tallasConDiferencia.filter((t) => !t.revisadoEn).length;
            return (
              <div key={grupo.codigo} style={{ border: '1px solid var(--borde)', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  onClick={() => alternarExpandido(grupo.codigo)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 10,
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit',
                  }}
                >
                  <img
                    src={grupo.fotoUrl}
                    alt=""
                    style={{
                      width: 48, height: 48, objectFit: 'contain', borderRadius: 8, flexShrink: 0,
                      background: 'var(--fondo-sutil)', border: '1px solid var(--borde)',
                    }}
                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{grupo.codigo} <span style={{ fontWeight: 400, color: 'var(--texto-tenue)' }}>{grupo.descripcion || ''}</span></div>
                    <div style={{ fontSize: 12, color: 'var(--texto-tenue)' }}>
                      Capturado {grupo.cantidadCapturada} · Stock {grupo.cantidadStock}
                      {participantes.length > 0 && ` · capturado por ${participantes.join(', ')}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, color: grupo.diferencia === 0 && tallasConDiferencia.length === 0 ? 'var(--exito)' : '#B91C1C' }}>
                      {grupo.diferencia > 0 ? `+${grupo.diferencia}` : grupo.diferencia}
                    </div>
                    {pendientesGrupo > 0 ? (
                      <div style={{ fontSize: 11, color: '#B91C1C' }}>{pendientesGrupo} sin validar</div>
                    ) : tallasConDiferencia.length > 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--exito)' }}>✓ validado</div>
                    ) : null}
                  </div>
                  <span style={{ flexShrink: 0 }}>{expandido ? '▲' : '▼'}</span>
                </button>

                {expandido && (
                  <div style={{ borderTop: '1px solid var(--borde)', padding: '8px 10px 10px' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="tabla-resumen">
                        <thead>
                          <tr><th>Talla</th><th>Capturado</th><th>Stock</th><th>Diferencia</th><th>Quién lo capturó</th><th></th></tr>
                        </thead>
                        <tbody>
                          {grupo.tallas.map((t) => (
                            <tr key={`${t.codigo}-${t.talla}`}>
                              <td>{t.tallaReal || t.talla}</td>
                              <td>{t.cantidadCapturada}</td>
                              <td>{t.cantidadStock}</td>
                              <td style={{ fontWeight: 700, color: t.diferencia === 0 ? 'var(--exito)' : '#B91C1C' }}>
                                {t.diferencia > 0 ? `+${t.diferencia}` : t.diferencia}
                              </td>
                              <td style={{ fontSize: 12 }}>
                                {t.tax.length === 0
                                  ? '—'
                                  : t.tax.map((tx) => (
                                      <div key={tx.taxId}>
                                        Tax {tx.numeroTax}{tx.taxNombre ? ` · ${tx.taxNombre}` : ''} — {tx.nombre || tx.alias} ({tx.cantidad})
                                      </div>
                                    ))}
                              </td>
                              <td>
                                {t.diferencia === 0 ? (
                                  '—'
                                ) : t.revisadoEn ? (
                                  <span style={{ color: 'var(--exito)', fontSize: 12, fontWeight: 700 }}>✓ revisado</span>
                                ) : (
                                  <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => marcarRevisado(t)}>
                                    Marcar revisado
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {gruposFiltrados.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--texto-tenue)', fontSize: 13 }}>Sin resultados.</p>
          )}
        </div>
      </div>
    </div>
  );
}
