import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { obtenerSocket, unirseAInventario } from '../socket.js';
import { IconoDescargar, IconoTienda } from '../componentes/Iconos.jsx';

export function AdminDashboard({ admin, onSalir }) {
  const mostrarToast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [tienda, setTienda] = useState(null);
  const [numeroInventario, setNumeroInventario] = useState('');
  const [clave, setClave] = useState('');
  const [inventario, setInventario] = useState(null);
  const [resumen, setResumen] = useState(null);

  useEffect(() => {
    if (busqueda.trim().length < 2) { setResultados([]); return undefined; }
    const timeout = setTimeout(async () => {
      try { setResultados(await api.buscarTiendas(busqueda.trim())); } catch { /* búsqueda incremental, se ignora un fallo puntual */ }
    }, 250);
    return () => clearTimeout(timeout);
  }, [busqueda]);

  useEffect(() => {
    if (!inventario) return undefined;
    cargarResumen(inventario.id);
    unirseAInventario(inventario.id);
    const socket = obtenerSocket();
    const refrescar = () => cargarResumen(inventario.id);
    ['captura:nueva', 'captura:actualizada', 'captura:eliminada', 'tax:abierto', 'tax:cerrado'].forEach((evento) =>
      socket.on(evento, refrescar)
    );
    return () => {
      ['captura:nueva', 'captura:actualizada', 'captura:eliminada', 'tax:abierto', 'tax:cerrado'].forEach((evento) =>
        socket.off(evento, refrescar)
      );
    };
  }, [inventario]);

  async function cargarResumen(id) {
    try { setResumen(await api.resumenInventario(id)); } catch { mostrarToast('No se pudo cargar el resumen', 'error'); }
  }

  async function verInventarioAbierto(t) {
    try {
      setInventario(await api.inventarioAbiertoPorEdp(t.edp));
      setTienda(t);
    } catch {
      mostrarToast(`${t.glosa} no tiene un inventario abierto todavía`, 'error');
    }
  }

  async function crearInventario() {
    if (!tienda || !numeroInventario || !clave) return;
    try {
      const nuevo = await api.crearInventario({ numeroInventario, edp: tienda.edp, clave, creadoPorAdminId: admin.id });
      setInventario(nuevo);
      mostrarToast('Inventario creado', 'ok');
    } catch (error) {
      mostrarToast(error.info?.error === 'numero_inventario_ya_existe' ? 'Ese número de inventario ya existe' : 'No se pudo crear el inventario', 'error');
    }
  }

  async function cerrarInventario() {
    try {
      setInventario(await api.cerrarInventario(inventario.id));
      mostrarToast('Inventario cerrado', 'ok');
    } catch {
      mostrarToast('No se pudo cerrar el inventario', 'error');
    }
  }

  return (
    <div className="pantalla" style={{ alignItems: 'stretch' }}>
      <div className="contenedor-ancho">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: '1.4em' }}>Panel de administración</h1>
          <button className="btn-texto" onClick={onSalir}>Salir</button>
        </div>

        <div className="grilla-admin">
          <div className="tarjeta">
            <label className="etiqueta">Buscar tienda</label>
            <input className="campo" placeholder="Nombre o EDP" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            {resultados.map((t) => (
              <button
                key={t.edp}
                className="btn btn-secundario btn-chico"
                style={{ justifyContent: 'flex-start', width: '100%', marginBottom: 6 }}
                onClick={() => { setTienda(t); setBusqueda(''); setResultados([]); setInventario(null); setResumen(null); }}
              >
                <IconoTienda tamano={14} /> {t.edp} · {t.glosa}
              </button>
            ))}

            {tienda && (
              <>
                <div className="chip" style={{ marginBottom: 16 }}>{tienda.edp} · {tienda.glosa}</div>

                <button className="btn btn-secundario btn-chico" style={{ width: '100%', marginBottom: 16 }} onClick={() => verInventarioAbierto(tienda)}>
                  Ver inventario abierto
                </button>

                {!inventario && (
                  <>
                    <label className="etiqueta">Número de inventario</label>
                    <input className="campo" value={numeroInventario} onChange={(e) => setNumeroInventario(e.target.value)} />
                    <label className="etiqueta">Clave de acceso para participantes</label>
                    <input className="campo" type="password" value={clave} onChange={(e) => setClave(e.target.value)} />
                    <button className="btn btn-primario" onClick={crearInventario} disabled={!numeroInventario || !clave}>
                      Crear inventario
                    </button>
                  </>
                )}
              </>
            )}

            {inventario && (
              <div style={{ marginTop: 16, borderTop: '1px solid var(--borde)', paddingTop: 16 }}>
                <p style={{ fontSize: 13, margin: '0 0 12px' }}>
                  Inventario <strong>{inventario.numero_inventario}</strong> · estado <strong>{inventario.estado}</strong>
                </p>
                <a
                  className="btn btn-secundario btn-chico"
                  style={{ width: '100%', marginBottom: 8, textDecoration: 'none' }}
                  href={api.urlExportarInventario(inventario.id)}
                >
                  <IconoDescargar tamano={16} /> Exportar .txt
                </a>
                {inventario.estado === 'abierto' && (
                  <button className="btn btn-secundario btn-chico" style={{ width: '100%' }} onClick={cerrarInventario}>
                    Cerrar inventario
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="tarjeta">
            {!resumen ? (
              <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Selecciona o crea un inventario para ver el progreso en vivo.</p>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>Progreso por participante</h3>
                <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                  <table className="tabla-resumen">
                    <thead>
                      <tr><th>Alias</th><th>Tax</th><th>Estado</th><th>Unidades</th></tr>
                    </thead>
                    <tbody>
                      {resumen.participantes.map((p) => (
                        <tr key={`${p.id}-${p.tax_id ?? 'sin-tax'}`}>
                          <td>{p.alias}</td>
                          <td>{p.numero_tax ?? '—'}</td>
                          <td>{p.tax_estado ?? '—'}</td>
                          <td>{p.unidades}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h3>Consolidado ({resumen.totalUnidades} unidades)</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="tabla-resumen">
                    <thead>
                      <tr><th>Código</th><th>Talla</th><th>Descripción</th><th>Reconocido</th><th>Cantidad</th></tr>
                    </thead>
                    <tbody>
                      {resumen.consolidado.map((item) => (
                        <tr key={`${item.codigo}-${item.talla}`}>
                          <td>{item.codigo}</td>
                          <td>{item.talla === '01' ? 'Única' : item.talla}</td>
                          <td>{item.descripcion || '—'}</td>
                          <td>{item.reconocido ? 'Sí' : 'No'}</td>
                          <td>{item.cantidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
