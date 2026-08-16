import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { IconoTienda } from '../componentes/Iconos.jsx';
import { formatearFecha } from '../utilidades/fecha.js';

// Cruza todos los inventarios de una tienda que ya tuvieron un stock
// teórico cargado, para pillar qué código+talla se repite con diferencia
// inventario tras inventario — un patrón que revisando uno por uno no se ve.
export function HistoricoTiendaScreen({ adminId, onVolver }) {
  const mostrarToast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [tiendas, setTiendas] = useState([]);
  const [tiendaSel, setTiendaSel] = useState(null);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (busqueda.trim().length < 2) { setTiendas([]); return undefined; }
    const timeout = setTimeout(async () => {
      try { setTiendas(await api.buscarTiendas(busqueda.trim())); } catch { /* búsqueda incremental */ }
    }, 250);
    return () => clearTimeout(timeout);
  }, [busqueda]);

  async function elegirTienda(t) {
    setTiendaSel(t);
    setBusqueda('');
    setTiendas([]);
    setCargando(true);
    try {
      setDatos(await api.historicoDiferencias(t.edp, adminId));
    } catch {
      mostrarToast('No se pudo cargar el histórico', 'error');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="tarjeta" style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>Histórico de diferencias por tienda</h3>
        <button className="btn-texto" style={{ padding: 0 }} onClick={onVolver}>‹ Volver</button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--texto-tenue)', margin: '-4px 0 16px' }}>
        Cruza todos los inventarios de una tienda que ya tuvieron un stock teórico cargado, para ver qué artículos se
        repiten con diferencia de un inventario a otro.
      </p>

      {tiendaSel && (
        <div className="chip" style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => { setTiendaSel(null); setDatos(null); }}>
          {tiendaSel.edp} · {tiendaSel.glosa} ✕
        </div>
      )}

      {!tiendaSel && (
        <>
          <input className="campo" placeholder="Buscar tienda por nombre o EDP..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} autoFocus />
          {tiendas.map((t) => (
            <button key={t.edp} className="btn btn-secundario btn-chico" style={{ justifyContent: 'flex-start', width: '100%', marginBottom: 6 }} onClick={() => elegirTienda(t)}>
              <IconoTienda tamano={14} /> {t.edp} · {t.glosa}
            </button>
          ))}
        </>
      )}

      {cargando && <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Cargando...</p>}

      {datos && (
        <>
          <p style={{ fontSize: 13, margin: '4px 0 12px' }}>
            {datos.inventariosAnalizados} inventario{datos.inventariosAnalizados === 1 ? '' : 's'} con stock teórico cargado analizado{datos.inventariosAnalizados === 1 ? '' : 's'}.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla-resumen">
              <thead>
                <tr><th></th><th>Código</th><th>Talla</th><th>Descripción</th><th>Veces con diferencia</th><th>Suma diferencia</th><th>Detalle</th></tr>
              </thead>
              <tbody>
                {datos.articulos.map((a) => (
                  <tr key={`${a.codigo}-${a.talla}`}>
                    <td>
                      <img
                        src={a.fotoUrl}
                        alt=""
                        style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4, background: 'var(--fondo-sutil)' }}
                        onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                      />
                    </td>
                    <td>{a.codigo}</td>
                    <td>{a.tallaReal || a.talla}</td>
                    <td>{a.descripcion || '—'}</td>
                    <td style={{ fontWeight: 700, color: a.apariciones > 1 ? '#B91C1C' : 'inherit' }}>{a.apariciones}</td>
                    <td style={{ fontWeight: 700 }}>{a.sumaDiferencia > 0 ? `+${a.sumaDiferencia}` : a.sumaDiferencia}</td>
                    <td style={{ fontSize: 12 }}>
                      {a.inventarios.map((inv) => (
                        <div key={inv.inventarioId}>
                          {inv.numeroInventario} ({formatearFecha(inv.fecha)}): {inv.diferencia > 0 ? `+${inv.diferencia}` : inv.diferencia}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
                {datos.articulos.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Sin diferencias registradas para esta tienda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
