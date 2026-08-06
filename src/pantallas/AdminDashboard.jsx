import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { obtenerSocket, unirseAInventario, unirseAdmin } from '../socket.js';
import { IconoDescargar, IconoTienda, IconoEliminar } from '../componentes/Iconos.jsx';
import { derivarAlias, aliasDisponible } from '../utilidades/alias.js';

export function AdminDashboard({ admin, onSalir }) {
  const mostrarToast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [tienda, setTienda] = useState(null);
  const [numeroInventario, setNumeroInventario] = useState('');
  const [claveManual, setClaveManual] = useState('');
  const [inventario, setInventario] = useState(null);
  const [claveGenerada, setClaveGenerada] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [perfiles, setPerfiles] = useState([]);
  const [nombreNuevoPerfil, setNombreNuevoPerfil] = useState('');

  const [emailNuevoAdmin, setEmailNuevoAdmin] = useState('');
  const [nombreNuevoAdmin, setNombreNuevoAdmin] = useState('');
  const [rolNuevoAdmin, setRolNuevoAdmin] = useState('admin');
  const [adminInvitado, setAdminInvitado] = useState(null);

  const [subiendoTiendas, setSubiendoTiendas] = useState(false);
  const [subiendoProductos, setSubiendoProductos] = useState(false);
  const [progresoProductos, setProgresoProductos] = useState(null);
  const inputTiendasRef = useRef(null);
  const inputProductosRef = useRef(null);

  useEffect(() => {
    if (busqueda.trim().length < 2) { setResultados([]); return undefined; }
    const timeout = setTimeout(async () => {
      try { setResultados(await api.buscarTiendas(busqueda.trim())); } catch { /* búsqueda incremental, se ignora un fallo puntual */ }
    }, 250);
    return () => clearTimeout(timeout);
  }, [busqueda]);

  useEffect(() => {
    unirseAdmin();
    const socket = obtenerSocket();
    const alProgreso = ({ procesadas }) => setProgresoProductos(procesadas);
    const alCompletar = (resumenImport) => {
      setSubiendoProductos(false);
      setProgresoProductos(null);
      mostrarToast(`Productos: ${resumenImport.procesadas} filas importadas, ${resumenImport.omitidas} omitidas`, 'ok');
    };
    const alError = () => {
      setSubiendoProductos(false);
      setProgresoProductos(null);
      mostrarToast('Error importando el maestro de productos', 'error');
    };
    socket.on('maestros:productos:progreso', alProgreso);
    socket.on('maestros:productos:completado', alCompletar);
    socket.on('maestros:productos:error', alError);
    return () => {
      socket.off('maestros:productos:progreso', alProgreso);
      socket.off('maestros:productos:completado', alCompletar);
      socket.off('maestros:productos:error', alError);
    };
  }, []);

  async function subirMaestroTiendas(evento) {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    setSubiendoTiendas(true);
    try {
      const r = await api.subirMaestroTiendas(admin.id, archivo);
      mostrarToast(`Tiendas: ${r.insertadas} nuevas, ${r.actualizadas} actualizadas, ${r.omitidas} omitidas`, 'ok');
    } catch {
      mostrarToast('No se pudo importar el maestro de tiendas', 'error');
    } finally {
      setSubiendoTiendas(false);
      if (inputTiendasRef.current) inputTiendasRef.current.value = '';
    }
  }

  async function subirMaestroProductos(evento) {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    setSubiendoProductos(true);
    setProgresoProductos(0);
    try {
      await api.subirMaestroProductos(admin.id, archivo);
    } catch {
      setSubiendoProductos(false);
      setProgresoProductos(null);
      mostrarToast('No se pudo iniciar la importación de productos', 'error');
    } finally {
      if (inputProductosRef.current) inputProductosRef.current.value = '';
    }
  }

  useEffect(() => {
    if (!inventario) return undefined;
    cargarResumen(inventario.id);
    cargarPerfiles(inventario.id);
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

  async function cargarPerfiles(id) {
    try { setPerfiles(await api.participantesDeInventario(id)); } catch { /* se reintenta con el próximo refresco */ }
  }

  async function agregarPerfil() {
    const nombre = nombreNuevoPerfil.trim();
    if (!nombre) return;
    const base = derivarAlias(nombre);
    if (!base) return mostrarToast('Escribe un nombre válido', 'error');
    const alias = aliasDisponible(base, perfiles.map((p) => p.alias));
    try {
      await api.crearPerfilComoAdmin(inventario.id, admin.id, alias, nombre);
      setNombreNuevoPerfil('');
      cargarPerfiles(inventario.id);
      mostrarToast(`${nombre} agregado — entra con "${alias}" + la clave`, 'ok');
    } catch {
      mostrarToast('No se pudo agregar el perfil', 'error');
    }
  }

  async function quitarPerfil(perfil) {
    const unidades = (resumen?.participantes ?? [])
      .filter((p) => p.id === perfil.id)
      .reduce((acc, p) => acc + p.unidades, 0);
    if (unidades > 0 && !window.confirm(`${perfil.nombre || perfil.alias} ya capturó ${unidades} unidades. Si lo quitas, se borra todo lo que capturó. ¿Seguro?`)) {
      return;
    }
    try {
      await api.eliminarParticipante(perfil.id, admin.id);
      cargarPerfiles(inventario.id);
      cargarResumen(inventario.id);
      mostrarToast('Perfil quitado', 'ok');
    } catch {
      mostrarToast('No se pudo quitar el perfil', 'error');
    }
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
    if (!tienda || !numeroInventario) return;
    try {
      const nuevo = await api.crearInventario({
        numeroInventario,
        edp: tienda.edp,
        clave: claveManual || undefined,
        creadoPorAdminId: admin.id,
      });
      setInventario(nuevo);
      setClaveGenerada(nuevo.clave);
      setClaveManual('');
      mostrarToast('Inventario creado', 'ok');
    } catch (error) {
      mostrarToast(error.info?.error === 'numero_inventario_ya_existe' ? 'Ese número de inventario ya existe' : 'No se pudo crear el inventario', 'error');
    }
  }

  async function invitarAdmin() {
    if (!emailNuevoAdmin) return;
    try {
      const resultado = await api.invitarAdmin(admin.id, emailNuevoAdmin, nombreNuevoAdmin, rolNuevoAdmin);
      setAdminInvitado(resultado);
      setEmailNuevoAdmin('');
      setNombreNuevoAdmin('');
      mostrarToast('Admin agregado', 'ok');
    } catch (error) {
      mostrarToast(error.info?.error === 'email_ya_existe' ? 'Ya existe un admin con ese correo' : 'No se pudo agregar el admin', 'error');
    }
  }

  async function cerrarInventario() {
    try {
      setInventario(await api.cerrarInventario(inventario.id));
      mostrarToast('Inventario cerrado — nadie puede seguir capturando hasta que lo reabras', 'ok');
    } catch {
      mostrarToast('No se pudo cerrar el inventario', 'error');
    }
  }

  async function reabrirInventario() {
    try {
      setInventario(await api.reabrirInventario(inventario.id, admin.id));
      mostrarToast('Inventario reabierto', 'ok');
    } catch {
      mostrarToast('No se pudo reabrir el inventario', 'error');
    }
  }

  async function reabrirTax(taxId) {
    try {
      await api.reabrirTax(taxId, admin.id);
      cargarResumen(inventario.id);
      mostrarToast('Tax reabierto', 'ok');
    } catch {
      mostrarToast('No se pudo reabrir el tax', 'error');
    }
  }

  async function borrarTax(taxId) {
    try {
      await api.eliminarTax(taxId, admin.id);
      cargarResumen(inventario.id);
      mostrarToast('Tax borrado — el participante puede volver a capturarlo', 'ok');
    } catch {
      mostrarToast('No se pudo borrar el tax', 'error');
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="tarjeta">
            <label className="etiqueta">Buscar tienda</label>
            <input className="campo" placeholder="Nombre o EDP" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            {resultados.map((t) => (
              <button
                key={t.edp}
                className="btn btn-secundario btn-chico"
                style={{ justifyContent: 'flex-start', width: '100%', marginBottom: 6 }}
                onClick={() => { setTienda(t); setBusqueda(''); setResultados([]); setInventario(null); setResumen(null); setClaveGenerada(null); }}
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
                    <label className="etiqueta">Clave personalizada (opcional)</label>
                    <input
                      className="campo"
                      type="text"
                      placeholder="Vacío = se genera un PIN de 6 dígitos"
                      value={claveManual}
                      onChange={(e) => setClaveManual(e.target.value)}
                    />
                    <button className="btn btn-primario" onClick={crearInventario} disabled={!numeroInventario}>
                      Crear inventario
                    </button>
                  </>
                )}
              </>
            )}

            {claveGenerada && (
              <div className="info-box" style={{ marginTop: 12, background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--texto-tenue)', fontWeight: 700, marginBottom: 4 }}>
                  Clave para compartir con el equipo
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2 }}>{claveGenerada}</div>
                <p style={{ fontSize: 12, color: 'var(--texto-tenue)', margin: '6px 0 0' }}>
                  Solo se muestra una vez — anótala antes de salir de esta pantalla.
                </p>
              </div>
            )}

            {inventario && (
              <div style={{ marginTop: 16, borderTop: '1px solid var(--borde)', paddingTop: 16 }}>
                <p style={{ fontSize: 13, margin: '0 0 12px' }}>
                  Inventario <strong>{inventario.numero_inventario}</strong> · estado <strong>{inventario.estado}</strong> · tienda <strong>{tienda.edp}</strong>
                </p>
                <a
                  className="btn btn-secundario btn-chico"
                  style={{ width: '100%', marginBottom: 8, textDecoration: 'none' }}
                  href={api.urlExportarInventario(inventario.id)}
                >
                  <IconoDescargar tamano={16} /> Exportar .txt
                </a>
                {inventario.estado === 'abierto' ? (
                  <button className="btn btn-secundario btn-chico" style={{ width: '100%' }} onClick={cerrarInventario}>
                    Cerrar inventario
                  </button>
                ) : (
                  <button className="btn btn-secundario btn-chico" style={{ width: '100%' }} onClick={reabrirInventario}>
                    Reabrir para corregir algo
                  </button>
                )}

                <div style={{ marginTop: 16, borderTop: '1px solid var(--borde)', paddingTop: 16 }}>
                  <label className="etiqueta">Personal de captura</label>
                  <p style={{ fontSize: 12, color: 'var(--texto-tenue)', margin: '-4px 0 10px' }}>
                    Agrégalos por nombre — cada uno entra con su inicial+apellido (ej. "Javier Mena" → <strong>jmena</strong>) más la clave de arriba. Se pueden agregar o quitar cuando haga falta.
                  </p>
                  {perfiles.map((p) => (
                    <div key={p.id} className="chip" style={{ margin: '0 6px 6px 0', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
                      {p.nombre ? `${p.nombre} (${p.alias})` : p.alias} · tax {p.tax_min}-{p.tax_max}
                      {inventario.estado === 'abierto' && (
                        <button
                          onClick={() => quitarPerfil(p)}
                          title="Quitar"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: 0 }}
                        >
                          <IconoEliminar tamano={13} />
                        </button>
                      )}
                    </div>
                  ))}
                  {inventario.estado === 'abierto' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input
                        className="campo"
                        style={{ marginBottom: 0 }}
                        placeholder="Nombre completo, ej. Javier Mena"
                        value={nombreNuevoPerfil}
                        onChange={(e) => setNombreNuevoPerfil(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && agregarPerfil()}
                      />
                      <button className="btn btn-secundario btn-chico" onClick={agregarPerfil} disabled={!nombreNuevoPerfil.trim()}>
                        Agregar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="tarjeta">
            <h3 style={{ marginTop: 0 }}>Maestros</h3>

            <label className="etiqueta">Tiendas (.xlsx)</label>
            <input
              ref={inputTiendasRef}
              className="campo"
              type="file"
              accept=".xlsx"
              disabled={subiendoTiendas}
              onChange={subirMaestroTiendas}
            />
            {subiendoTiendas && <p style={{ fontSize: 13, color: 'var(--texto-tenue)', marginTop: -8 }}>Importando…</p>}

            <label className="etiqueta">Productos + reglas de talla (.csv)</label>
            <input
              ref={inputProductosRef}
              className="campo"
              type="file"
              accept=".csv"
              disabled={subiendoProductos}
              onChange={subirMaestroProductos}
            />
            {subiendoProductos && (
              <p style={{ fontSize: 13, color: 'var(--texto-tenue)', marginTop: -8 }}>
                Importando… {progresoProductos ? `${progresoProductos.toLocaleString('es-CL')} filas procesadas` : 'empezando'}
                {' '}(puede tardar unos minutos, son ~600 mil filas — puedes seguir usando el panel mientras corre).
              </p>
            )}
          </div>

          {admin.rol === 'superadmin' && (
            <div className="tarjeta">
              <h3 style={{ marginTop: 0 }}>Agregar administrador</h3>

              <label className="etiqueta">Correo</label>
              <input className="campo" type="email" value={emailNuevoAdmin} onChange={(e) => setEmailNuevoAdmin(e.target.value)} />
              <label className="etiqueta">Nombre</label>
              <input className="campo" value={nombreNuevoAdmin} onChange={(e) => setNombreNuevoAdmin(e.target.value)} />
              <label className="etiqueta">Rol</label>
              <select className="campo" value={rolNuevoAdmin} onChange={(e) => setRolNuevoAdmin(e.target.value)}>
                <option value="admin">Admin</option>
                <option value="superadmin">Superadmin</option>
              </select>
              <button className="btn btn-secundario btn-chico" style={{ width: '100%' }} onClick={invitarAdmin} disabled={!emailNuevoAdmin}>
                Agregar
              </button>

              {adminInvitado && (
                <div style={{ marginTop: 12, background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12, fontSize: 13 }}>
                  <strong>{adminInvitado.email}</strong> agregado. Contraseña temporal (se le pide cambiarla al entrar):
                  <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: 1, marginTop: 4 }}>{adminInvitado.passwordTemporal}</div>
                </div>
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
                      <tr><th>Alias</th><th>Tax</th><th>Estado</th><th>Unidades</th><th>Acciones</th></tr>
                    </thead>
                    <tbody>
                      {resumen.participantes.map((p) => (
                        <tr key={`${p.id}-${p.tax_id ?? 'sin-tax'}`}>
                          <td>{p.alias}</td>
                          <td>{p.numero_tax ?? '—'}</td>
                          <td>{p.tax_estado ?? '—'}</td>
                          <td>{p.unidades}</td>
                          <td>
                            {p.tax_id && (
                              <div style={{ display: 'flex', gap: 6 }}>
                                {p.tax_estado === 'cerrado' && (
                                  <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => reabrirTax(p.tax_id)}>
                                    Reabrir
                                  </button>
                                )}
                                <button className="btn-texto" style={{ padding: 0, fontSize: 12, color: '#B91C1C' }} onClick={() => borrarTax(p.tax_id)}>
                                  Borrar
                                </button>
                              </div>
                            )}
                          </td>
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
                          <td>{item.tallaReal || (item.talla === '01' ? 'Única' : `${item.talla} (sin traducir)`)}</td>
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
