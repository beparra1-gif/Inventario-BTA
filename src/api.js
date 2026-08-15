const URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function solicitar(ruta, opciones = {}) {
  const respuesta = await fetch(`${URL_BASE}${ruta}`, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...opciones.headers },
  });

  const esJSON = respuesta.headers.get('content-type')?.includes('application/json');
  const cuerpo = esJSON ? await respuesta.json() : await respuesta.text();

  if (!respuesta.ok) {
    const error = new Error(cuerpo?.error || 'error_de_red');
    error.status = respuesta.status;
    error.info = cuerpo;
    throw error;
  }
  return cuerpo;
}

function post(ruta, body) {
  return solicitar(ruta, { method: 'POST', body: JSON.stringify(body) });
}

// Sin el header Content-Type: fetch lo arma solo con el boundary correcto
// cuando el body es un FormData.
async function subirArchivo(ruta, adminId, archivo) {
  const formulario = new FormData();
  formulario.append('adminId', adminId);
  formulario.append('archivo', archivo);
  const respuesta = await fetch(`${URL_BASE}${ruta}`, { method: 'POST', body: formulario });
  const cuerpo = await respuesta.json();
  if (!respuesta.ok) {
    const error = new Error(cuerpo?.error || 'error_de_red');
    error.status = respuesta.status;
    error.info = cuerpo;
    throw error;
  }
  return cuerpo;
}

export const api = {
  urlBase: URL_BASE,

  login: (email, password) => post('/api/auth/login', { email, password }),
  necesitaConfiguracion: () => solicitar('/api/auth/necesita-configuracion'),
  configuracionInicial: (email, password, nombre) =>
    post('/api/auth/configuracion-inicial', { email, password, nombre }),
  cambiarPassword: (adminId, passwordActual, passwordNueva) =>
    post('/api/auth/cambiar-password', { adminId, passwordActual, passwordNueva }),
  invitarAdmin: (solicitanteId, email, nombre, rol) =>
    post('/api/auth/admins', { solicitanteId, email, nombre, rol }),
  listarAdmins: (solicitanteId) => solicitar(`/api/auth/admins?solicitanteId=${solicitanteId}`),
  actualizarAdmin: (id, solicitanteId, cambios) =>
    solicitar(`/api/auth/admins/${id}`, { method: 'PUT', body: JSON.stringify({ solicitanteId, ...cambios }) }),
  eliminarAdmin: (id, solicitanteId) =>
    solicitar(`/api/auth/admins/${id}?solicitanteId=${solicitanteId}`, { method: 'DELETE' }),
  resetearPasswordAdmin: (id, solicitanteId) =>
    post(`/api/auth/admins/${id}/resetear-password`, { solicitanteId }),
  modificarPasswordAdmin: (id, solicitanteId, passwordNueva) =>
    post(`/api/auth/admins/${id}/modificar-password`, { solicitanteId, passwordNueva }),

  buscarTiendas: (q) => solicitar(`/api/tiendas${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  obtenerTienda: (edp) => solicitar(`/api/tiendas/${edp}`),

  crearInventario: (datos) => post('/api/inventarios', datos),
  buscarInventarios: (q, adminId) => solicitar(`/api/inventarios?adminId=${adminId}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  inventariosRecientes: (adminId, limite = 2) => solicitar(`/api/inventarios/recientes?adminId=${adminId}&limite=${limite}`),
  inventarioAbiertoPorEdp: (edp) => solicitar(`/api/inventarios/abierto/${edp}`),
  obtenerInventario: (id) => solicitar(`/api/inventarios/${id}`),
  cerrarInventario: (id) => post(`/api/inventarios/${id}/cerrar`, {}),
  reabrirInventario: (id, adminId) => post(`/api/inventarios/${id}/reabrir`, { adminId }),
  verificarInventario: (id, adminId) => post(`/api/inventarios/${id}/verificar`, { adminId }),
  eliminarInventario: (id, adminId) => solicitar(`/api/inventarios/${id}?adminId=${adminId}`, { method: 'DELETE' }),
  resumenInventario: (id) => solicitar(`/api/inventarios/${id}/resumen`),
  // Con adminId trae también la clave en texto de cada perfil (solo admins).
  participantesDeInventario: (id, adminId) =>
    solicitar(`/api/inventarios/${id}/participantes${adminId ? `?adminId=${adminId}` : ''}`),
  urlExportarInventario: (id) => `${URL_BASE}/api/inventarios/${id}/exportar`,

  loginParticipante: (inventarioId, alias, clave) =>
    post('/api/participantes/login', { inventarioId, alias, clave }),
  crearPerfilComoAdmin: (inventarioId, adminId, alias, nombre) =>
    post('/api/participantes/admin', { inventarioId, adminId, alias, nombre }),
  eliminarParticipante: (id, adminId) => solicitar(`/api/participantes/${id}?adminId=${adminId}`, { method: 'DELETE' }),
  regenerarClaveParticipante: (id, adminId) => post(`/api/participantes/${id}/regenerar-clave`, { adminId }),
  resumenParticipante: (participanteId) => solicitar(`/api/participantes/${participanteId}/resumen`),
  solicitarModificacion: (participanteId, numeroTax) =>
    post(`/api/participantes/${participanteId}/solicitar-modificacion`, { numeroTax }),

  abrirTax: (participanteId, numeroTax, nombre) => post('/api/taxes', { participanteId, numeroTax, nombre }),
  renombrarTax: (id, nombre) => solicitar(`/api/taxes/${id}/nombre`, { method: 'PUT', body: JSON.stringify({ nombre }) }),
  cerrarTax: (id) => post(`/api/taxes/${id}/cerrar`, {}),
  // { adminId } para el panel admin o { participanteId } para que el propio
  // capturador reabra/borre su propio tax sin depender del admin.
  reabrirTax: (id, { adminId, participanteId } = {}) =>
    post(`/api/taxes/${id}/reabrir`, { adminId, participanteId }),
  reiniciarTax: (id) => solicitar(`/api/taxes/${id}/capturas`, { method: 'DELETE' }),
  eliminarTax: (id, { adminId, participanteId } = {}) => {
    const params = new URLSearchParams();
    if (adminId) params.set('adminId', adminId);
    if (participanteId) params.set('participanteId', participanteId);
    return solicitar(`/api/taxes/${id}?${params.toString()}`, { method: 'DELETE' });
  },

  validarArticulo: (codigo, talla) =>
    solicitar(`/api/articulos/validar?codigo=${encodeURIComponent(codigo)}&talla=${encodeURIComponent(talla)}`),
  tallasDeArticulo: (codigo) => solicitar(`/api/articulos/tallas?codigo=${encodeURIComponent(codigo)}`),

  capturasDeTax: (taxId) => solicitar(`/api/capturas?taxId=${taxId}`),
  capturasAgrupadas: (taxId) => solicitar(`/api/capturas/agrupado?taxId=${taxId}`),
  crearCaptura: (datos) => post('/api/capturas', datos),
  editarCaptura: (id, cantidad) =>
    solicitar(`/api/capturas/${id}`, { method: 'PUT', body: JSON.stringify({ cantidad }) }),
  eliminarCaptura: (id) => solicitar(`/api/capturas/${id}`, { method: 'DELETE' }),

  subirMaestroTiendas: (adminId, archivo) => subirArchivo('/api/maestros/tiendas', adminId, archivo),
  subirMaestroProductos: (adminId, archivo) => subirArchivo('/api/maestros/productos', adminId, archivo),

  // Auditoría: admin, superadmin o auditor pueden usar estas tres — ver
  // backend/routes/auditoria.js.
  auditoriaTaxesDeInventario: (inventarioId, auditorId) =>
    solicitar(`/api/auditoria/inventarios/${inventarioId}/taxes?auditorId=${auditorId}`),
  auditoriaDetalleTax: (taxId, auditorId) => solicitar(`/api/auditoria/taxes/${taxId}?auditorId=${auditorId}`),
  auditoriaValidarTax: (taxId, auditorId, cantidadValidada) =>
    post(`/api/auditoria/taxes/${taxId}/validar`, { auditorId, cantidadValidada }),
};
