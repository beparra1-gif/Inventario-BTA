import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { obtenerSocket, unirseAInventario, unirseAdmin } from '../socket.js';
import { IconoDescargar, IconoTienda, IconoEliminar, IconoCompartir } from '../componentes/Iconos.jsx';
import { derivarAlias, aliasDisponible } from '../utilidades/alias.js';
import { formatearFecha } from '../utilidades/fecha.js';
import { PantallaTaxes } from './PantallaTaxes.jsx';
import { PantallaCaptura } from './PantallaCaptura.jsx';
import { AuditoriaPanel } from './AuditoriaPanel.jsx';
import { CruceStockScreen } from './CruceStockScreen.jsx';
import { ActividadInventarioScreen } from './ActividadInventarioScreen.jsx';
import { HistoricoTiendaScreen } from './HistoricoTiendaScreen.jsx';
import { HeaderAdmin } from '../componentes/HeaderAdmin.jsx';
import { EditorTax } from './EditorTax.jsx';

export function AdminDashboard({ admin, onSalir, onActualizarAdmin }) {
  const mostrarToast = useToast();

  // 'menu' | 'crear' | 'revisar' | 'gestionar' | 'admins' | 'maestros' | 'perfil' | 'auditoria' | 'cruce' | 'actividad'
  const [vista, setVista] = useState('menu');

  // --- Crear inventario (wizard) ---
  const [busquedaCrear, setBusquedaCrear] = useState('');
  const [resultadosCrear, setResultadosCrear] = useState([]);
  const [tiendaCrear, setTiendaCrear] = useState(null);
  const [numeroInventarioCrear, setNumeroInventarioCrear] = useState('');
  const [toleranciaCrear, setToleranciaCrear] = useState('0');
  const [nombresPendientes, setNombresPendientes] = useState([]);
  const [nombrePendiente, setNombrePendiente] = useState('');
  const [creando, setCreando] = useState(false);

  // --- Revisar inventarios ---
  const [busquedaRevisar, setBusquedaRevisar] = useState('');
  const [resultadosRevisar, setResultadosRevisar] = useState([]);

  // --- Últimos inventarios (vista menú) ---
  const [recientes, setRecientes] = useState([]);

  // --- Inventario bajo gestión ---
  const [tienda, setTienda] = useState(null);
  const [inventario, setInventario] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [perfiles, setPerfiles] = useState([]);
  const [nombreNuevoPerfil, setNombreNuevoPerfil] = useState('');
  const [clavesGeneradas, setClavesGeneradas] = useState([]);
  const [validandoTaxId, setValidandoTaxId] = useState(null);
  const [cantidadValidacion, setCantidadValidacion] = useState('');
  const [editorContextoTax, setEditorContextoTax] = useState(null);

  // --- Cruce de stock (pantalla propia, ver CruceStockScreen) ---
  const [cruceVistaInicial, setCruceVistaInicial] = useState('resumen');

  // --- Modo captura del admin (agregar artículos con su propio tax) ---
  const [adminParticipante, setAdminParticipante] = useState(null);
  const [adminTax, setAdminTax] = useState(null);

  const [emailNuevoAdmin, setEmailNuevoAdmin] = useState('');
  const [nombreNuevoAdmin, setNombreNuevoAdmin] = useState('');
  const [rolNuevoAdmin, setRolNuevoAdmin] = useState('admin');
  const [adminInvitado, setAdminInvitado] = useState(null);

  // --- Administradores (superadmin) ---
  const [listaAdmins, setListaAdmins] = useState([]);
  const [passwordsGeneradas, setPasswordsGeneradas] = useState([]);
  const [modificandoClaveId, setModificandoClaveId] = useState(null);
  const [nuevaClaveAdmin, setNuevaClaveAdmin] = useState('');
  const [mostrarNuevaClaveAdmin, setMostrarNuevaClaveAdmin] = useState(false);

  // --- Mi perfil ---
  const [nombrePerfil, setNombrePerfil] = useState(admin.nombre ?? '');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [passwordActualPerfil, setPasswordActualPerfil] = useState('');
  const [passwordNuevaPerfil, setPasswordNuevaPerfil] = useState('');
  const [passwordNuevaRepetirPerfil, setPasswordNuevaRepetirPerfil] = useState('');
  const [mostrarClavesPerfil, setMostrarClavesPerfil] = useState(false);
  const [cambiandoPasswordPerfil, setCambiandoPasswordPerfil] = useState(false);

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

  // Sin texto de búsqueda, "Revisar inventarios" muestra los últimos con
  // más contexto (unidades, quién participó) en vez de una lista plana —
  // así hace también de "últimos inventarios" sin duplicar esa vista en
  // la pantalla principal.
  useEffect(() => {
    if (vista !== 'revisar') return undefined;
    if (!busquedaRevisar.trim()) {
      cargarRecientes();
      return undefined;
    }
    const timeout = setTimeout(async () => {
      try { setResultadosRevisar(await api.buscarInventarios(busquedaRevisar.trim(), admin.id)); } catch { /* se reintenta */ }
    }, 250);
    return () => clearTimeout(timeout);
  }, [busquedaRevisar, vista]);

  useEffect(() => {
    if (vista === 'admins') cargarAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista]);

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

  // Si se cambia de inventario (o se sale de "gestionar") no hay que
  // arrastrar el modo captura del admin del inventario anterior.
  useEffect(() => {
    setAdminParticipante(null);
    setAdminTax(null);
    setCruceVistaInicial('resumen');
  }, [inventario?.id]);

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
    const alSolicitudModificar = ({ alias, nombre, numeroTax }) => {
      mostrarToast(
        numeroTax
          ? `${nombre || alias} necesita modificar el tax ${numeroTax} — reábrelo desde "Progreso por participante"`
          : `${nombre || alias} necesita que le reabras algo — revisa "Progreso por participante"`,
        'error'
      );
    };
    const alInconsistenciaAuditoria = ({ alias, nombre, numeroTax, cantidadCapturada, cantidadValidada }) => {
      mostrarToast(
        `Auditoría: tax ${numeroTax} de ${nombre || alias} no calza — capturado ${cantidadCapturada}, validado ${cantidadValidada}`,
        'error'
      );
    };
    ['captura:nueva', 'captura:actualizada', 'captura:eliminada', 'tax:abierto', 'tax:cerrado'].forEach((evento) =>
      socket.on(evento, refrescar)
    );
    socket.on('alerta:capturador-errores', alAlertaErrores);
    socket.on('solicitud:modificar', alSolicitudModificar);
    socket.on('auditoria:inconsistencia', alInconsistenciaAuditoria);
    return () => {
      ['captura:nueva', 'captura:actualizada', 'captura:eliminada', 'tax:abierto', 'tax:cerrado'].forEach((evento) =>
        socket.off(evento, refrescar)
      );
      socket.off('alerta:capturador-errores', alAlertaErrores);
      socket.off('solicitud:modificar', alSolicitudModificar);
      socket.off('auditoria:inconsistencia', alInconsistenciaAuditoria);
    };
  }, [inventario]);

  async function cargarResumen(id) {
    try { setResumen(await api.resumenInventario(id)); } catch { mostrarToast('No se pudo cargar el resumen', 'error'); }
  }

  async function cargarPerfiles(id) {
    try { setPerfiles(await api.participantesDeInventario(id, admin.id)); } catch { /* se reintenta con el próximo refresco */ }
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
        toleranciaDiferencia: Number(toleranciaCrear) || 0,
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
      cargarRecientes();

      setBusquedaCrear(''); setResultadosCrear([]); setTiendaCrear(null);
      setNumeroInventarioCrear(''); setToleranciaCrear('0'); setNombresPendientes([]);
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

  async function regenerarClave(perfil) {
    if (
      perfil.clave &&
      !window.confirm(`Esto restablece la clave de ${perfil.nombre || perfil.alias} a la del inventario. ¿Seguro?`)
    ) {
      return;
    }
    try {
      const r = await api.regenerarClaveParticipante(perfil.id, admin.id);
      cargarPerfiles(inventario.id);
      setClavesGeneradas((actuales) => [...actuales, { nombre: perfil.nombre, alias: perfil.alias, clave: r.clave }]);
      mostrarToast('Clave restablecida', 'ok');
    } catch {
      mostrarToast('No se pudo generar la clave', 'error');
    }
  }

  // Abre WhatsApp con el mensaje ya armado (tienda, N° de inventario, sigla
  // y clave) para que el admin solo tenga que elegir el contacto y mandar —
  // no guardamos teléfonos de nadie, por eso wa.me sin número: deja elegir
  // el destinatario en la app misma.
  function compartirPorWhatsapp(nombreOAlias, alias, clave) {
    const lineas = [
      `Hola ${nombreOAlias}, estos son tus datos para capturar el inventario:`,
      '',
      `Tienda: ${tienda.edp} · ${tienda.glosa}`,
    ];
    if (inventario.numero_inventario) lineas.push(`N° de inventario: ${inventario.numero_inventario}`);
    lineas.push(`Tu sigla: ${alias}`, `Tu clave: ${clave}`);
    window.open(`https://wa.me/?text=${encodeURIComponent(lineas.join('\n'))}`, '_blank', 'noopener,noreferrer');
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
    // Si nunca se cargó un stock teórico, el backend no tiene nada contra
    // qué exigir validación y cierra directo — hay que avisar antes de que
    // eso pase, para que sea una decisión consciente y no un cierre "a
    // ciegas" sin haber cruzado nada.
    if (!inventario.stock_cargado_en) {
      const confirmar = window.confirm(
        'Este inventario no tiene un stock teórico cargado, así que no hay diferencias para revisar. ¿Seguro que querés cerrarlo sin verificar ni revisar diferencias?'
      );
      if (!confirmar) return;
    }
    try {
      setInventario(await api.cerrarInventario(inventario.id, admin.id));
      mostrarToast('Inventario cerrado — nadie puede seguir capturando hasta que lo reabras', 'ok');
    } catch (error) {
      if (error.info?.error === 'diferencias_sin_validar') {
        mostrarToast(`Hay ${error.info.pendientes} diferencia${error.info.pendientes === 1 ? '' : 's'} sin validar en el reporte de diferencias — revísalas antes de cerrar`, 'error');
        setCruceVistaInicial('resumen');
        setVista('cruce');
        return;
      }
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

  async function verificarInventario() {
    try {
      setInventario(await api.verificarInventario(inventario.id, admin.id));
      mostrarToast('Inventario marcado como verificado', 'ok');
    } catch {
      mostrarToast('No se pudo marcar como verificado', 'error');
    }
  }

  // El admin agrega artículos como si fuera un capturador más, con su
  // propio tax (o los que necesite) — reusa el mismo perfil siempre
  // (alias fijo por admin, no uno de los de "Personal de captura") así
  // vuelve a encontrar lo que ya había cargado si entra de nuevo.
  async function iniciarCapturaAdmin() {
    try {
      const alias = `admin-${admin.id}`;
      const nombre = `${admin.nombre || admin.email} (admin)`;
      const r = await api.crearPerfilComoAdmin(inventario.id, admin.id, alias, nombre);
      setAdminParticipante(r);
      cargarPerfiles(inventario.id);
    } catch {
      mostrarToast('No se pudo iniciar la captura', 'error');
    }
  }

  // "Modificar" abre directo el editor del tax (reabre solo si hace falta,
  // adentro) en vez de solo reabrirlo y dejar al admin sin forma de tocar
  // artículos puntuales desde acá.
  function abrirEditorTax(p) {
    setEditorContextoTax({
      taxId: p.tax_id,
      numeroTax: p.numero_tax,
      taxNombre: p.tax_nombre,
      nombre: p.nombre,
      alias: p.alias,
      estado: p.tax_estado,
    });
  }

  async function cerrarTaxDesdeAdmin(taxId) {
    try {
      await api.cerrarTax(taxId);
      cargarResumen(inventario.id);
      mostrarToast('Tax cerrado', 'ok');
    } catch {
      mostrarToast('No se pudo cerrar el tax', 'error');
    }
  }

  async function borrarTax(taxId) {
    if (!window.confirm('Esto borra el tax y todo lo capturado en él. ¿Seguro?')) return;
    try {
      await api.eliminarTax(taxId, { adminId: admin.id });
      cargarResumen(inventario.id);
      mostrarToast('Tax borrado — el participante puede volver a capturarlo', 'ok');
    } catch {
      mostrarToast('No se pudo borrar el tax', 'error');
    }
  }

  async function reiniciarTaxDesdeAdmin(taxId, unidades) {
    if (!window.confirm(`Esto borra las ${unidades} unidades de ese tax y lo deja abierto de nuevo para rehacerlo. ¿Seguro?`)) return;
    try {
      await api.reiniciarTax(taxId);
      cargarResumen(inventario.id);
      mostrarToast('Tax reiniciado', 'ok');
    } catch {
      mostrarToast('No se pudo reiniciar el tax', 'error');
    }
  }

  function iniciarValidarTax(p) {
    setValidandoTaxId(p.tax_id);
    setCantidadValidacion(String(p.unidades));
  }

  async function confirmarValidacionTax(p) {
    const cantidad = Number(cantidadValidacion);
    if (!Number.isInteger(cantidad) || cantidad < 0) return;
    try {
      const r = await api.auditoriaValidarTax(p.tax_id, admin.id, cantidad);
      setValidandoTaxId(null);
      cargarResumen(inventario.id);
      mostrarToast(
        r.inconsistente ? `Inconsistencia: se capturaron ${r.cantidadCapturada}, se validaron ${cantidad}` : 'Validado, todo calza',
        r.inconsistente ? 'error' : 'ok'
      );
    } catch {
      mostrarToast('No se pudo validar el tax', 'error');
    }
  }

  async function borrarInventario(inv) {
    if (
      !window.confirm(
        `Esto borra el inventario ${inv.numero_inventario} completo (todas las capturas y perfiles). No se puede deshacer. ¿Seguro?`
      )
    ) {
      return;
    }
    try {
      await api.eliminarInventario(inv.id, admin.id);
      mostrarToast('Inventario borrado', 'ok');
      if (inventario?.id === inv.id) { setVista('menu'); setInventario(null); }
      if (vista === 'revisar') setResultadosRevisar((actuales) => actuales.filter((r) => r.id !== inv.id));
      cargarRecientes();
    } catch {
      mostrarToast('No se pudo borrar el inventario', 'error');
    }
  }

  async function cargarRecientes() {
    try { setRecientes(await api.inventariosRecientes(admin.id, 12)); } catch { /* se reintenta con el próximo refresco */ }
  }

  async function cargarAdmins() {
    try { setListaAdmins(await api.listarAdmins(admin.id)); } catch { mostrarToast('No se pudo cargar la lista de administradores', 'error'); }
  }

  async function cambiarRolAdmin(a, nuevoRol) {
    try {
      await api.actualizarAdmin(a.id, admin.id, { rol: nuevoRol });
      cargarAdmins();
      mostrarToast('Rol actualizado', 'ok');
    } catch {
      mostrarToast('No se pudo actualizar el rol', 'error');
    }
  }

  async function resetearPasswordAdminAccion(a) {
    if (
      !window.confirm(
        `Esto genera una clave temporal nueva para ${a.nombre || a.email} — la anterior deja de servir y le va a pedir cambiarla apenas entre. ¿Seguro?`
      )
    ) {
      return;
    }
    try {
      const r = await api.resetearPasswordAdmin(a.id, admin.id);
      setPasswordsGeneradas((actuales) => [...actuales, { id: a.id, nombre: a.nombre, email: a.email, password: r.passwordTemporal }]);
      mostrarToast('Clave temporal generada', 'ok');
    } catch {
      mostrarToast('No se pudo generar la clave', 'error');
    }
  }

  function iniciarModificarClave(a) {
    setModificandoClaveId(a.id);
    setNuevaClaveAdmin('');
  }

  async function guardarClaveModificada(a) {
    if (nuevaClaveAdmin.length < 8) {
      mostrarToast('La clave nueva debe tener al menos 8 caracteres', 'error');
      return;
    }
    try {
      await api.modificarPasswordAdmin(a.id, admin.id, nuevaClaveAdmin);
      setModificandoClaveId(null);
      setNuevaClaveAdmin('');
      mostrarToast('Clave actualizada — se le va a pedir cambiarla apenas entre', 'ok');
    } catch {
      mostrarToast('No se pudo actualizar la clave', 'error');
    }
  }

  // Mismo mecanismo que compartirPorWhatsapp (participantes), pero para la
  // clave temporal de un admin — sin tienda/inventario de por medio.
  function compartirPasswordAdminPorWhatsapp(nombreOEmail, password) {
    const mensaje = [
      `Hola ${nombreOEmail}, tu clave temporal para entrar al panel de administración es:`,
      password,
      'Te la va a pedir cambiar apenas entres.',
    ].join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener,noreferrer');
  }

  async function borrarAdmin(a) {
    if (!window.confirm(`Esto borra la cuenta de ${a.nombre || a.email}. No se puede deshacer. ¿Seguro?`)) return;
    try {
      await api.eliminarAdmin(a.id, admin.id);
      setListaAdmins((actuales) => actuales.filter((x) => x.id !== a.id));
      mostrarToast('Administrador borrado', 'ok');
    } catch (error) {
      mostrarToast(
        error.info?.error === 'ultimo_superadmin' ? 'No puedes borrar al único superadmin que queda' : 'No se pudo borrar el administrador',
        'error'
      );
    }
  }

  async function guardarPerfil() {
    setGuardandoPerfil(true);
    try {
      const actualizado = await api.actualizarAdmin(admin.id, admin.id, { nombre: nombrePerfil });
      onActualizarAdmin({ ...admin, nombre: actualizado.nombre });
      mostrarToast('Perfil actualizado', 'ok');
    } catch {
      mostrarToast('No se pudo actualizar el perfil', 'error');
    } finally {
      setGuardandoPerfil(false);
    }
  }

  async function cambiarPasswordPerfil() {
    if (!passwordActualPerfil || passwordNuevaPerfil.length < 8) return;
    if (passwordNuevaPerfil !== passwordNuevaRepetirPerfil) {
      mostrarToast('La clave nueva no coincide en los dos campos', 'error');
      return;
    }
    setCambiandoPasswordPerfil(true);
    try {
      await api.cambiarPassword(admin.id, passwordActualPerfil, passwordNuevaPerfil);
      setPasswordActualPerfil('');
      setPasswordNuevaPerfil('');
      setPasswordNuevaRepetirPerfil('');
      mostrarToast('Clave actualizada', 'ok');
    } catch {
      mostrarToast('Clave actual incorrecta', 'error');
    } finally {
      setCambiandoPasswordPerfil(false);
    }
  }

  // Modo captura del admin: pantalla completa reusando tal cual las mismas
  // PantallaTaxes/PantallaCaptura del capturador (mismo look, mismo
  // escáner, misma cola offline) en vez de reimplementar todo — el admin
  // "sale" con el mismo botón "Salir"/"‹ Inicio" de siempre, que acá vuelve
  // a la gestión del inventario en vez de cerrar sesión.
  if (adminParticipante) {
    return adminTax ? (
      <PantallaCaptura
        acceso={{ tienda, inventario }}
        participante={adminParticipante}
        tax={adminTax}
        onCambiarTax={setAdminTax}
        onVolver={() => setAdminTax(null)}
      />
    ) : (
      <PantallaTaxes
        acceso={{ tienda, inventario }}
        participante={adminParticipante}
        onAbrirTax={setAdminTax}
        onSalir={() => { setAdminParticipante(null); setAdminTax(null); }}
      />
    );
  }

  return (
    <div className="pantalla" style={{ alignItems: 'stretch', padding: 0 }}>
      <HeaderAdmin admin={admin} vista={vista} onNavegar={setVista} onSalir={onSalir} />

      <div className="contenedor-ancho" style={{ padding: '24px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {vista === 'menu' && (
              <div className="hero-crear">
                <h1>Hola, {admin.nombre || admin.email}</h1>
                <p>¿Qué inventario vamos a levantar hoy?</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button className="btn btn-primario" style={{ height: 64, fontSize: 17 }} onClick={() => setVista('crear')}>
                    + Crear inventario
                  </button>
                  <button className="btn btn-secundario" style={{ height: 56, fontSize: 15 }} onClick={() => setVista('revisar')}>
                    Revisar inventarios realizados
                  </button>
                </div>
              </div>
            )}

            {vista === 'auditoria' && <AuditoriaPanel adminId={admin.id} onVolver={() => setVista('menu')} />}

            {vista === 'historico' && <HistoricoTiendaScreen adminId={admin.id} onVolver={() => setVista('menu')} />}

            {vista === 'cruce' && inventario && (
              <CruceStockScreen
                inventario={inventario}
                adminId={admin.id}
                vistaInicial={cruceVistaInicial}
                onVolver={() => setVista('gestionar')}
              />
            )}

            {vista === 'actividad' && inventario && (
              <ActividadInventarioScreen inventario={inventario} adminId={admin.id} onVolver={() => setVista('gestionar')} />
            )}

            {vista === 'maestros' && admin.rol === 'superadmin' && (
              <div className="tarjeta" style={{ maxWidth: 560 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <h3 style={{ margin: 0 }}>Maestros</h3>
                  <button className="btn-texto" style={{ padding: 0 }} onClick={() => setVista('menu')}>‹ Volver</button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--texto-tenue)', margin: '-4px 0 16px' }}>
                  Reemplaza los importadores de línea de comandos: sube acá el archivo y se actualiza para todas las tiendas.
                </p>
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
            )}

            {vista === 'admins' && admin.rol === 'superadmin' && (
              <div className="tarjeta" style={{ maxWidth: 640 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0 }}>Administradores</h3>
                  <button className="btn-texto" style={{ padding: 0 }} onClick={() => setVista('menu')}>‹ Volver</button>
                </div>

                <div style={{ background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <label className="etiqueta">Agregar administrador</label>
                  <input className="campo" type="email" placeholder="Correo" value={emailNuevoAdmin} onChange={(e) => setEmailNuevoAdmin(e.target.value)} />
                  <input className="campo" placeholder="Nombre" value={nombreNuevoAdmin} onChange={(e) => setNombreNuevoAdmin(e.target.value)} />
                  <select className="campo" value={rolNuevoAdmin} onChange={(e) => setRolNuevoAdmin(e.target.value)}>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Superadmin</option>
                    <option value="auditor">Auditor</option>
                  </select>
                  <button className="btn btn-secundario btn-chico" style={{ width: '100%' }} onClick={invitarAdmin} disabled={!emailNuevoAdmin}>
                    Agregar
                  </button>
                  {adminInvitado && (
                    <div style={{ marginTop: 12, fontSize: 13 }}>
                      <strong>{adminInvitado.email}</strong> agregado. Contraseña temporal (se le pide cambiarla al entrar):
                      <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: 1, marginTop: 4 }}>{adminInvitado.passwordTemporal}</div>
                    </div>
                  )}
                </div>

                {passwordsGeneradas.length > 0 && (
                  <div style={{ marginBottom: 12, background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--texto-tenue)', fontWeight: 700, marginBottom: 8 }}>
                      Claves temporales recién generadas
                    </div>
                    {passwordsGeneradas.map((p) => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '4px 0', gap: 8 }}>
                        <span>{p.nombre || p.email}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <strong style={{ letterSpacing: 1 }}>{p.password}</strong>
                          <button
                            onClick={() => compartirPasswordAdminPorWhatsapp(p.nombre || p.email, p.password)}
                            title="Compartir por WhatsApp"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: 0 }}
                          >
                            <IconoCompartir tamano={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button className="btn-texto" style={{ padding: 0, marginTop: 6 }} onClick={() => setPasswordsGeneradas([])}>Ocultar</button>
                  </div>
                )}

                {listaAdmins.map((a) => (
                  <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--borde)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{a.nombre || '(sin nombre)'}{a.id === admin.id ? ' · tú' : ''}</div>
                        <div style={{ fontSize: 12, color: 'var(--texto-tenue)' }}>{a.email}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <select
                          className="campo"
                          style={{ marginBottom: 0, width: 'auto', fontSize: 12, padding: '6px 8px' }}
                          value={a.rol}
                          disabled={a.id === admin.id}
                          onChange={(e) => cambiarRolAdmin(a, e.target.value)}
                        >
                          <option value="admin">Admin</option>
                          <option value="superadmin">Superadmin</option>
                          <option value="auditor">Auditor</option>
                        </select>
                        {a.id !== admin.id && (
                          <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => iniciarModificarClave(a)}>
                            Modificar clave
                          </button>
                        )}
                        {a.id !== admin.id && (
                          <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => resetearPasswordAdminAccion(a)}>
                            Resetear clave
                          </button>
                        )}
                        {a.id !== admin.id && (
                          <button className="btn-texto" style={{ padding: 0, color: '#B91C1C', display: 'flex' }} title="Borrar" onClick={() => borrarAdmin(a)}>
                            <IconoEliminar tamano={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    {modificandoClaveId === a.id && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                        <input
                          className="campo"
                          style={{ marginBottom: 0, flex: 1, minWidth: 160 }}
                          type={mostrarNuevaClaveAdmin ? 'text' : 'password'}
                          placeholder="Clave nueva (mínimo 8 caracteres)"
                          value={nuevaClaveAdmin}
                          onChange={(e) => setNuevaClaveAdmin(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && guardarClaveModificada(a)}
                          autoFocus
                        />
                        <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => setMostrarNuevaClaveAdmin((v) => !v)}>
                          {mostrarNuevaClaveAdmin ? 'Ocultar' : 'Mostrar'}
                        </button>
                        <button
                          className="btn btn-secundario btn-chico"
                          onClick={() => guardarClaveModificada(a)}
                          disabled={nuevaClaveAdmin.length < 8}
                        >
                          Guardar
                        </button>
                        <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => setModificandoClaveId(null)}>
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {listaAdmins.length === 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--texto-tenue)', fontSize: 13 }}>Cargando...</p>
                )}
              </div>
            )}

            {vista === 'perfil' && (
              <div className="tarjeta">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0 }}>Mi perfil</h3>
                  <button className="btn-texto" style={{ padding: 0 }} onClick={() => setVista('menu')}>‹ Volver</button>
                </div>

                <label className="etiqueta">Correo</label>
                <p style={{ margin: '0 0 12px', fontSize: 14 }}>
                  {admin.email} <span className="chip" style={{ marginLeft: 6 }}>{admin.rol}</span>
                </p>

                <label className="etiqueta">Nombre</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="campo" style={{ marginBottom: 0 }} value={nombrePerfil} onChange={(e) => setNombrePerfil(e.target.value)} />
                  <button
                    className="btn btn-secundario btn-chico"
                    onClick={guardarPerfil}
                    disabled={guardandoPerfil || nombrePerfil.trim() === (admin.nombre ?? '')}
                  >
                    Guardar
                  </button>
                </div>

                <div style={{ marginTop: 20, borderTop: '1px solid var(--borde)', paddingTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="etiqueta" style={{ margin: 0 }}>Cambiar clave de acceso</label>
                    <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => setMostrarClavesPerfil((v) => !v)}>
                      {mostrarClavesPerfil ? 'Ocultar claves' : 'Mostrar claves'}
                    </button>
                  </div>
                  <input
                    className="campo"
                    type={mostrarClavesPerfil ? 'text' : 'password'}
                    placeholder="Clave actual"
                    value={passwordActualPerfil}
                    onChange={(e) => setPasswordActualPerfil(e.target.value)}
                  />
                  <input
                    className="campo"
                    type={mostrarClavesPerfil ? 'text' : 'password'}
                    placeholder="Clave nueva (mínimo 8 caracteres)"
                    value={passwordNuevaPerfil}
                    onChange={(e) => setPasswordNuevaPerfil(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && cambiarPasswordPerfil()}
                  />
                  <input
                    className="campo"
                    type={mostrarClavesPerfil ? 'text' : 'password'}
                    placeholder="Repite la clave nueva"
                    value={passwordNuevaRepetirPerfil}
                    onChange={(e) => setPasswordNuevaRepetirPerfil(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && cambiarPasswordPerfil()}
                  />
                  {passwordNuevaPerfil && passwordNuevaRepetirPerfil && passwordNuevaPerfil !== passwordNuevaRepetirPerfil && (
                    <p style={{ margin: '-8px 0 12px', fontSize: 12, color: '#B91C1C' }}>Las claves nuevas no coinciden.</p>
                  )}
                  <button
                    className="btn btn-secundario btn-chico"
                    style={{ width: '100%' }}
                    onClick={cambiarPasswordPerfil}
                    disabled={
                      !passwordActualPerfil ||
                      passwordNuevaPerfil.length < 8 ||
                      passwordNuevaPerfil !== passwordNuevaRepetirPerfil ||
                      cambiandoPasswordPerfil
                    }
                  >
                    {cambiandoPasswordPerfil ? 'Guardando...' : 'Cambiar clave'}
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

                    <label className="etiqueta">Tolerancia del cruce de stock (unidades)</label>
                    <p style={{ fontSize: 12, color: 'var(--texto-tenue)', margin: '-4px 0 10px' }}>
                      Diferencias dentro de este margen no exigen validación para cerrar. Déjalo en 0 si querés que cualquier
                      diferencia, por chica que sea, tenga que revisarse.
                    </p>
                    <input
                      className="campo"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={toleranciaCrear}
                      onChange={(e) => setToleranciaCrear(e.target.value)}
                    />

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
              <div className="tarjeta" style={{ maxWidth: 720 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0 }}>Revisar inventarios realizados</h3>
                  <button className="btn-texto" style={{ padding: 0 }} onClick={() => setVista('menu')}>‹ Volver</button>
                </div>
                <input className="campo" placeholder="Buscar por número, tienda o EDP..." value={busquedaRevisar} onChange={(e) => setBusquedaRevisar(e.target.value)} autoFocus />

                {!busquedaRevisar.trim() ? (
                  <>
                    {recientes.length > 0 && (
                      <label className="etiqueta">Últimos inventarios</label>
                    )}
                    {recientes.map((r) => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--borde)' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{r.numero_inventario} · {r.edp} {r.tienda_glosa}</div>
                          <div style={{ fontSize: 12, color: 'var(--texto-tenue)' }}>
                            {r.estado} · {r.total_unidades} unidad{r.total_unidades === 1 ? '' : 'es'} · {r.personas.length > 0 ? r.personas.join(', ') : 'sin personal'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                          <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => abrirInventarioExistente({ edp: r.edp, glosa: r.tienda_glosa }, r)}>
                            Ver
                          </button>
                          <button className="btn-texto" style={{ padding: 0, fontSize: 12, color: '#B91C1C' }} onClick={() => borrarInventario(r)}>
                            Borrar
                          </button>
                        </div>
                      </div>
                    ))}
                    {recientes.length === 0 && (
                      <p style={{ textAlign: 'center', color: 'var(--texto-tenue)', fontSize: 13 }}>Todavía no hay inventarios.</p>
                    )}
                  </>
                ) : (
                  <>
                    {resultadosRevisar.map((r) => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'stretch', gap: 6, marginBottom: 8 }}>
                        <button
                          className="btn btn-secundario"
                          style={{ flex: 1, justifyContent: 'space-between', textAlign: 'left' }}
                          onClick={() => abrirInventarioExistente({ edp: r.edp, glosa: r.tienda_glosa }, r)}
                        >
                          <span>{r.numero_inventario} · {r.edp} {r.tienda_glosa}</span>
                          <span style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700, color: 'var(--texto-tenue)' }}>
                            {r.estado} · {formatearFecha(r.creado_en)}
                          </span>
                        </button>
                        <button
                          className="btn btn-secundario btn-chico"
                          title="Borrar inventario"
                          style={{ color: '#B91C1C', flexShrink: 0 }}
                          onClick={() => borrarInventario(r)}
                        >
                          <IconoEliminar tamano={16} />
                        </button>
                      </div>
                    ))}
                    {resultadosRevisar.length === 0 && (
                      <p style={{ textAlign: 'center', color: 'var(--texto-tenue)', fontSize: 13 }}>Sin resultados.</p>
                    )}
                  </>
                )}
              </div>
            )}

            {vista === 'gestionar' && inventario && (
              <>
                <div className="subhead-inventario">
                  <button onClick={() => { setCruceVistaInicial('resumen'); setVista('cruce'); }}>
                    Reporte de diferencias
                  </button>
                  <button onClick={() => { setCruceVistaInicial('cargar'); setVista('cruce'); }}>
                    Actualizar stock teórico
                  </button>
                  <button onClick={() => setVista('actividad')}>
                    Actividad reciente
                  </button>
                  {inventario.estado === 'abierto' ? (
                    <button onClick={cerrarInventario}>Cerrar inventario</button>
                  ) : (
                    <>
                      <a href={api.urlExportarInventario(inventario.id)}>
                        <IconoDescargar tamano={16} /> Exportar inventario
                      </a>
                      <button onClick={reabrirInventario}>Reabrir para corregir algo</button>
                      {!inventario.verificado_en && (
                        <button onClick={verificarInventario}>Marcar como verificado</button>
                      )}
                    </>
                  )}
                  <button className="subhead-peligro" onClick={() => borrarInventario(inventario)}>
                    Borrar inventario
                  </button>
                </div>

                <div className="tarjeta">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <h3 style={{ margin: 0 }}>{tienda.edp} · {tienda.glosa}</h3>
                    <button className="btn-texto" style={{ padding: 0 }} onClick={() => setVista('menu')}>‹ Volver</button>
                  </div>
                  <p style={{ fontSize: 13, margin: '0 0 12px' }}>
                    Inventario <strong>{inventario.numero_inventario}</strong> · estado{' '}
                    <strong>{inventario.estado}</strong>
                    {inventario.estado !== 'abierto' && (
                      inventario.verificado_en ? (
                        <span style={{ color: 'var(--exito)', fontWeight: 700 }}> · verificado</span>
                      ) : (
                        <span style={{ color: 'var(--advertencia)', fontWeight: 700 }}> · sin verificar</span>
                      )
                    )}
                  </p>

                  <button className="btn btn-secundario btn-chico" style={{ width: '100%', marginBottom: 8 }} onClick={iniciarCapturaAdmin}>
                    + Agregar artículos
                  </button>

                  {clavesGeneradas.length > 0 && (
                    <div style={{ marginTop: 16, background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--texto-tenue)', fontWeight: 700, marginBottom: 8 }}>
                        Claves recién generadas para repartir
                      </div>
                      {clavesGeneradas.map((c) => (
                        <div key={c.alias} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '4px 0', gap: 8 }}>
                          <span>{c.nombre} <span style={{ color: 'var(--texto-tenue)' }}>({c.alias})</span></span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            <strong style={{ letterSpacing: 1 }}>{c.clave}</strong>
                            <button
                              onClick={() => compartirPorWhatsapp(c.nombre || c.alias, c.alias, c.clave)}
                              title="Compartir por WhatsApp"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: 0 }}
                            >
                              <IconoCompartir tamano={15} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button className="btn-texto" style={{ padding: 0, marginTop: 6 }} onClick={() => setClavesGeneradas([])}>Ocultar</button>
                    </div>
                  )}

                  <div style={{ marginTop: 16, borderTop: '1px solid var(--borde)', paddingTop: 16 }}>
                    <label className="etiqueta">Personal de captura</label>
                    {perfiles.map((p) => (
                      <div key={p.id} className="chip" style={{ margin: '0 6px 6px 0', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
                        {p.nombre ? `${p.nombre} (${p.alias})` : p.alias}
                        {p.clave ? (
                          <strong style={{ letterSpacing: 1 }}> · clave {p.clave}</strong>
                        ) : (
                          <span style={{ color: 'var(--texto-tenue)' }}> · sin clave visible</span>
                        )}
                        {' '}· tax {p.tax_min}-{p.tax_max}
                        {p.clave && (
                          <button
                            onClick={() => compartirPorWhatsapp(p.nombre || p.alias, p.alias, p.clave)}
                            title="Compartir por WhatsApp"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: 0 }}
                          >
                            <IconoCompartir tamano={13} />
                          </button>
                        )}
                        <button
                          onClick={() => regenerarClave(p)}
                          title={p.clave ? 'Restablecer a la clave del inventario' : 'Esta clave es de antes de poder verse — restablecer'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: 0 }}
                        >
                          ↻
                        </button>
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
                          <thead><tr><th>Nombre</th><th>Tax</th><th>Estado</th><th>Unidades</th><th>Validación</th><th>Acciones</th></tr></thead>
                          <tbody>
                            {resumen.participantes.map((p) => (
                              <tr key={`${p.id}-${p.tax_id ?? 'sin-tax'}`}>
                                <td>{p.nombre || p.alias}</td>
                                <td>{p.numero_tax ?? '—'}{p.tax_nombre && <div style={{ fontSize: 11, color: 'var(--texto-tenue)' }}>{p.tax_nombre}</div>}</td>
                                <td>{p.tax_estado ?? '—'}</td>
                                <td>{p.unidades}</td>
                                <td>
                                  {!p.tax_id ? (
                                    '—'
                                  ) : validandoTaxId === p.tax_id ? (
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                      <input
                                        className="campo"
                                        style={{ marginBottom: 0, width: 64, padding: '4px 6px', fontSize: 12 }}
                                        type="number"
                                        value={cantidadValidacion}
                                        onChange={(e) => setCantidadValidacion(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && confirmarValidacionTax(p)}
                                        autoFocus
                                      />
                                      <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => confirmarValidacionTax(p)}>OK</button>
                                      <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => setValidandoTaxId(null)}>✕</button>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                                      {p.validado_en && (
                                        p.cantidad_validada === p.unidades ? (
                                          <span style={{ color: 'var(--exito)', fontWeight: 700 }}>✓ OK</span>
                                        ) : (
                                          <span style={{ color: '#B91C1C', fontWeight: 700 }} title="Inconsistencia">
                                            ⚠ {p.cantidad_validada} vs {p.unidades}
                                          </span>
                                        )
                                      )}
                                      {p.tax_estado === 'cerrado' ? (
                                        <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => iniciarValidarTax(p)}>
                                          {p.validado_en ? 'Revalidar' : 'Validar'}
                                        </button>
                                      ) : (
                                        !p.validado_en && '—'
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  {/* Mientras el inventario esté cerrado no se puede tocar nada de un
                                      tax puntual — hay que reabrirlo completo ("Reabrir para corregir
                                      algo") para que estas acciones vuelvan a aparecer. */}
                                  {p.tax_id && inventario.estado === 'abierto' && (
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                      {p.tax_estado === 'cerrado' ? (
                                        <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => abrirEditorTax(p)}>Modificar</button>
                                      ) : (
                                        <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => cerrarTaxDesdeAdmin(p.tax_id)}>Cerrar tax</button>
                                      )}
                                      {p.unidades > 0 && (
                                        <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => reiniciarTaxDesdeAdmin(p.tax_id, p.unidades)}>
                                          Rehacer
                                        </button>
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

                {editorContextoTax && (
                  <EditorTax
                    contexto={editorContextoTax}
                    adminId={admin.id}
                    onCerrar={() => setEditorContextoTax(null)}
                    onCambio={() => cargarResumen(inventario.id)}
                  />
                )}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
