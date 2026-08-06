import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { obtenerSocket, unirseAInventario, unirseAdmin } from '../socket.js';
import { IconoDescargar, IconoTienda, IconoEliminar } from '../componentes/Iconos.jsx';
import { derivarAlias, aliasDisponible } from '../utilidades/alias.js';
import { formatearFecha } from '../utilidades/fecha.js';

export function AdminDashboard({ admin, onSalir }) {
  const mostrarToast = useToast();

  // 'menu' | 'crear' | 'revisar' | 'gestionar'
  const [vista, setVista] = useState('menu');

  // --- Crear inventario (wizard) ---
  const [busquedaCrear, setBusquedaCrear] = useState('');
  const [resultadosCrear, setResultadosCrear] = useState([]);
  const [tiendaCrear, setTiendaCrear] = useState(null);
  const [numeroInventarioCrear, setNumeroInventarioCrear] = useState('');
  const [nombresPendientes, setNombresPendientes] = useState([]);
  const [nombrePendiente, setNombrePendiente] = useState('');
  const [creando, setCreando] = useState(false);

  // --- Revisar inventarios ---
  const [busquedaRevisar, setBusquedaRevisar] = useState('');
  const [resultadosRevisar, setResultadosRevisar] = useState([]);

  // --- Inventario bajo gestión ---
  const [tienda, setTienda] = useState(null);
  const [inventario, setInventario] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [perfiles, setPerfiles] = useState([]);
  const [nombreNuevoPerfil, setNombreNuevoPerfil] = useState('');
  const [clavesGeneradas, setClavesGeneradas] = useState([]);

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
    if (busquedaCrear.trim().length < 2) { setResultadosCrear([]); return undefined; }
    const timeout = setTimeout(async () => {
      try { setResultadosCrear(await api.buscarTiendas(busquedaCrear.trim())); } catch { /* búsqueda incremental */ }
    }, 250);
    return () => clearTimeout(timeout);
  }, [busquedaCrear]);

  useEffect(() => {
    if (vista !== 'revisar') return undefined;
    const timeout = setTimeout(async () => {
      try { setResultadosRevisar(await api.buscarInventarios(busquedaRevisar.trim())); } catch { /* se reintenta */ }
    }, 250);
    return () => clearTimeout(timeout);
  }, [busquedaRevisar, vista]);

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
    const alAlertaErrores = ({ alias, nombre, totalErrores }) => {
      mostrarToast(`${nombre || alias} lleva ${totalErrores} artículos sin reconocer — puede que valga la pena revisarlo`, 'error');
    };
    ['captura:nueva', 'captura:actualizada', 'captura:eliminada', 'tax:abierto', 'tax:cerrado'].forEach((evento) =>
      socket.on(evento, refrescar)
    );
    socket.on('alerta:capturador-errores', alAlertaErrores);
    return () => {
      ['captura:nueva', 'captura:actualizada', 'captura:eliminada', 'tax:abierto', 'tax:cerrado'].forEach((evento) =>
        socket.off(evento, refrescar)
      );
      socket.off('alerta:capturador-errores', alAlertaErrores);
    };
  }, [inventario]);

  async function cargarResumen(id) {
    try { setResumen(await api.resumenInventario(id)); } catch { mostrarToast('No se pudo cargar el resumen', 'error'); }
  }

  async function cargarPerfiles(id) {
    try { setPerfiles(await api.participantesDeInventario(id)); } catch { /* se reintenta con el próximo refresco */ }
  }

  function agregarNombrePendiente() {
    const nombre = nombrePendiente.trim();
    if (!nombre) return;
    const base = derivarAlias(nombre);
    if (!base) return mostrarToast('Escribe un nombre válido', 'error');
    const alias = aliasDisponible(base, nombresPendientes.map((p) => p.alias));
    setNombresPendientes((actuales) => [...actuales, { nombre, alias }]);
    setNombrePendiente('');
  }

  async function crearInventarioCompleto() {
    if (!tiendaCrear || !numeroInventarioCrear.trim()) return;
    setCreando(true);
    try {
      const nuevoInv = await api.crearInventario({
        numeroInventario: numeroInventarioCrear.trim(),
        edp: tiendaCrear.edp,
        creadoPorAdminId: admin.id,
      });

      const generadas = [];
      for (const p of nombresPendientes) {
        const r = await api.crearPerfilComoAdmin(nuevoInv.id, admin.id, p.alias, p.nombre);
        generadas.push({ nombre: p.nombre, alias: p.alias, clave: r.clave });
      }

      setTienda(tiendaCrear);
      setInventario(nuevoInv);
      setClavesGeneradas(generadas);
      setVista('gestionar');
      mostrarToast('Inventario creado', 'ok');

      setBusquedaCrear(''); setResultadosCrear([]); setTiendaCrear(null);
      setNumeroInventarioCrear(''); setNombresPendientes([]);
    } catch (error) {
      mostrarToast(error.info?.error === 'numero_inventario_ya_existe' ? 'Ese número de inventario ya existe' : 'No se pudo crear el inventario', 'error');
    } finally {
      setCreando(false);
    }
  }

  function abrirInventarioExistente(t, inv) {
    setTienda(t);
    setInventario(inv);
    setClavesGeneradas([]);
    setVista('gestionar');
  }

  async function agregarPerfil() {
    const nombre = nombreNuevoPerfil.trim();
    if (!nombre) return;
    const base = derivarAlias(nombre);
    if (!base) return mostrarToast('Escribe un nombre válido', 'error');
    const alias = aliasDisponible(base, perfiles.map((p) => p.alias));
    try {
      const r = await api.crearPerfilComoAdmin(inventario.id, admin.id, alias, nombre);
      setNombreNuevoPerfil('');
      cargarPerfiles(inventario.id);
      if (r.clave) setClavesGeneradas((actuales) => [...actuales, { nombre, alias, clave: r.clave }]);
      mostrarToast(`${nombre} agregado`, 'ok');
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

  const panelAdminInvitar = admin.rol === 'superadmin' && (
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
  );

  const panelMaestros = (
    <div className="tarjeta">
      <h3 style={{ marginTop: 0 }}>Maestros</h3>
      <label className="etiqueta">Tiendas (.xlsx)</label>
      <input ref={inputTiendasRef} className="campo" type="file" accept=".xlsx" disabled={subiendoTiendas} onChange={subirMaestroTiendas} />
      {subiendoTiendas && <p style={{ fontSize: 13, color: 'var(--texto-tenue)', marginTop: -8 }}>Importando…</p>}
      <label className="etiqueta">Productos + reglas de talla (.csv)</label>
      <input ref={inputProductosRef} className="campo" type="file" accept=".csv" disabled={subiendoProductos} onChange={subirMaestroProductos} />
      {subiendoProductos && (
        <p style={{ fontSize: 13, color: 'var(--texto-tenue)', marginTop: -8 }}>
          Importando… {progresoProductos ? `${progresoProductos.toLocaleString('es-CL')} filas procesadas` : 'empezando'}
          {' '}(puede tardar unos minutos, son ~600 mil filas — puedes seguir usando el panel mientras corre).
        </p>
      )}
    </div>
  );

  return (
    <div className="pantalla" style={{ alignItems: 'stretch' }}>
      <div className="contenedor-ancho">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: '1.4em' }}>Panel de administración</h1>
          <button className="btn-texto" onClick={onSalir}>Salir</button>
        </div>

        <div className="grilla-admin">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {panelMaestros}
            {panelAdminInvitar}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {vista === 'menu' && (
              <div className="tarjeta">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <button className="btn btn-primario" style={{ height: 90, flexDirection: 'column', fontSize: 16 }} onClick={() => setVista('crear')}>
                    + Crear inventario
                  </button>
                  <button className="btn btn-secundario" style={{ height: 90, flexDirection: 'column', fontSize: 16 }} onClick={() => setVista('revisar')}>
                    Revisar inventarios realizados
                  </button>
                </div>
              </div>
            )}

            {vista === 'crear' && (
              <div className="tarjeta">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <h3 style={{ margin: 0 }}>Crear inventario</h3>
                  <button className="btn-texto" style={{ padding: 0 }} onClick={() => setVista('menu')}>‹ Volver</button>
                </div>

                {!tiendaCrear ? (
                  <>
                    <label className="etiqueta">EDP o nombre de la tienda</label>
                    <input className="campo" placeholder="Buscar tienda..." value={busquedaCrear} onChange={(e) => setBusquedaCrear(e.target.value)} autoFocus />
                    {resultadosCrear.map((t) => (
                      <button key={t.edp} className="btn btn-secundario btn-chico" style={{ justifyContent: 'flex-start', width: '100%', marginBottom: 6 }} onClick={() => { setTiendaCrear(t); setBusquedaCrear(''); setResultadosCrear([]); }}>
                        <IconoTienda tamano={14} /> {t.edp} · {t.glosa}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="chip" style={{ marginBottom: 16, cursor: 'pointer' }} onClick={() => setTiendaCrear(null)}>{tiendaCrear.edp} · {tiendaCrear.glosa}</div>

                    <label className="etiqueta">Número de inventario</label>
                    <input className="campo" value={numeroInventarioCrear} onChange={(e) => setNumeroInventarioCrear(e.target.value)} />

                    <label className="etiqueta">Personal de captura</label>
                    <p style={{ fontSize: 12, color: 'var(--texto-tenue)', margin: '-4px 0 10px' }}>
                      Cada uno entra con su inicial+apellido y una clave numérica propia que se genera al crear el inventario.
                    </p>
                    {nombresPendientes.map((p) => (
                      <div key={p.alias} className="chip" style={{ margin: '0 6px 6px 0', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {p.nombre} ({p.alias})
                        <button onClick={() => setNombresPendientes((actuales) => actuales.filter((x) => x.alias !== p.alias))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: 0 }}>
                          <IconoEliminar tamano={12} />
                        </button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, margin: '8px 0 20px' }}>
                      <input
                        className="campo"
                        style={{ marginBottom: 0 }}
                        placeholder="Nombre completo, ej. Javier Mena"
                        value={nombrePendiente}
                        onChange={(e) => setNombrePendiente(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarNombrePendiente())}
                      />
                      <button className="btn btn-secundario btn-chico" onClick={agregarNombrePendiente} disabled={!nombrePendiente.trim()}>Agregar</button>
                    </div>

                    <button className="btn btn-primario" onClick={crearInventarioCompleto} disabled={!numeroInventarioCrear.trim() || creando}>
                      {creando ? 'Creando...' : 'Crear inventario'}
                    </button>
                  </>
                )}
              </div>
            )}

            {vista === 'revisar' && (
              <div className="tarjeta">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0 }}>Revisar inventarios realizados</h3>
                  <button className="btn-texto" style={{ padding: 0 }} onClick={() => setVista('menu')}>‹ Volver</button>
                </div>
                <input className="campo" placeholder="Buscar por número, tienda o EDP..." value={busquedaRevisar} onChange={(e) => setBusquedaRevisar(e.target.value)} autoFocus />
                {resultadosRevisar.map((r) => (
                  <button
                    key={r.id}
                    className="btn btn-secundario"
                    style={{ justifyContent: 'space-between', marginBottom: 8, textAlign: 'left' }}
                    onClick={() => abrirInventarioExistente({ edp: r.edp, glosa: r.tienda_glosa }, r)}
                  >
                    <span>{r.numero_inventario} · {r.edp} {r.tienda_glosa}</span>
                    <span style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700, color: 'var(--texto-tenue)' }}>
                      {r.estado} · {formatearFecha(r.creado_en)}
                    </span>
                  </button>
                ))}
                {resultadosRevisar.length === 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--texto-tenue)', fontSize: 13 }}>Sin resultados.</p>
                )}
              </div>
            )}

            {vista === 'gestionar' && inventario && (
              <>
                <div className="tarjeta">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <h3 style={{ margin: 0 }}>{tienda.edp} · {tienda.glosa}</h3>
                    <button className="btn-texto" style={{ padding: 0 }} onClick={() => setVista('menu')}>‹ Volver</button>
                  </div>
                  <p style={{ fontSize: 13, margin: '0 0 12px' }}>
                    Inventario <strong>{inventario.numero_inventario}</strong> · estado <strong>{inventario.estado}</strong>
                  </p>

                  <a className="btn btn-secundario btn-chico" style={{ width: '100%', marginBottom: 8, textDecoration: 'none' }} href={api.urlExportarInventario(inventario.id)}>
                    <IconoDescargar tamano={16} /> Exportar .txt
                  </a>
                  {inventario.estado === 'abierto' ? (
                    <button className="btn btn-secundario btn-chico" style={{ width: '100%' }} onClick={cerrarInventario}>Cerrar inventario</button>
                  ) : (
                    <button className="btn btn-secundario btn-chico" style={{ width: '100%' }} onClick={reabrirInventario}>Reabrir para corregir algo</button>
                  )}

                  {clavesGeneradas.length > 0 && (
                    <div style={{ marginTop: 16, background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--texto-tenue)', fontWeight: 700, marginBottom: 8 }}>
                        Claves para repartir (solo se muestran una vez)
                      </div>
                      {clavesGeneradas.map((c) => (
                        <div key={c.alias} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                          <span>{c.nombre} <span style={{ color: 'var(--texto-tenue)' }}>({c.alias})</span></span>
                          <strong style={{ letterSpacing: 1 }}>{c.clave}</strong>
                        </div>
                      ))}
                      <button className="btn-texto" style={{ padding: 0, marginTop: 6 }} onClick={() => setClavesGeneradas([])}>Ocultar</button>
                    </div>
                  )}

                  <div style={{ marginTop: 16, borderTop: '1px solid var(--borde)', paddingTop: 16 }}>
                    <label className="etiqueta">Personal de captura</label>
                    {perfiles.map((p) => (
                      <div key={p.id} className="chip" style={{ margin: '0 6px 6px 0', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
                        {p.nombre ? `${p.nombre} (${p.alias})` : p.alias} · tax {p.tax_min}-{p.tax_max}
                        {inventario.estado === 'abierto' && (
                          <button onClick={() => quitarPerfil(p)} title="Quitar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: 0 }}>
                            <IconoEliminar tamano={13} />
                          </button>
                        )}
                      </div>
                    ))}
                    {inventario.estado === 'abierto' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <input className="campo" style={{ marginBottom: 0 }} placeholder="Nombre completo" value={nombreNuevoPerfil} onChange={(e) => setNombreNuevoPerfil(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregarPerfil()} />
                        <button className="btn btn-secundario btn-chico" onClick={agregarPerfil} disabled={!nombreNuevoPerfil.trim()}>Agregar</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="tarjeta">
                  {!resumen ? (
                    <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Cargando...</p>
                  ) : (
                    <>
                      <h3 style={{ marginTop: 0 }}>Progreso por participante</h3>
                      <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                        <table className="tabla-resumen">
                          <thead><tr><th>Nombre</th><th>Tax</th><th>Estado</th><th>Unidades</th><th>Acciones</th></tr></thead>
                          <tbody>
                            {resumen.participantes.map((p) => (
                              <tr key={`${p.id}-${p.tax_id ?? 'sin-tax'}`}>
                                <td>{p.nombre || p.alias}</td>
                                <td>{p.numero_tax ?? '—'}</td>
                                <td>{p.tax_estado ?? '—'}</td>
                                <td>{p.unidades}</td>
                                <td>
                                  {p.tax_id && (
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      {p.tax_estado === 'cerrado' && (
                                        <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => reabrirTax(p.tax_id)}>Reabrir</button>
                                      )}
                                      <button className="btn-texto" style={{ padding: 0, fontSize: 12, color: '#B91C1C' }} onClick={() => borrarTax(p.tax_id)}>Borrar</button>
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
                          <thead><tr><th>Código</th><th>Talla</th><th>Descripción</th><th>Reconocido</th><th>Cantidad</th></tr></thead>
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
