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

  buscarTiendas: (q) => solicitar(`/api/tiendas${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  obtenerTienda: (edp) => solicitar(`/api/tiendas/${edp}`),

  crearInventario: (datos) => post('/api/inventarios', datos),
  inventarioAbiertoPorEdp: (edp) => solicitar(`/api/inventarios/abierto/${edp}`),
  verificarClaveInventario: (id, clave) => post(`/api/inventarios/${id}/verificar-clave`, { clave }),
  cerrarInventario: (id) => post(`/api/inventarios/${id}/cerrar`, {}),
  reabrirInventario: (id, adminId) => post(`/api/inventarios/${id}/reabrir`, { adminId }),
  resumenInventario: (id) => solicitar(`/api/inventarios/${id}/resumen`),
  participantesDeInventario: (id) => solicitar(`/api/inventarios/${id}/participantes`),
  urlExportarInventario: (id) => `${URL_BASE}/api/inventarios/${id}/exportar`,

  unirseComoParticipante: (inventarioId, clave, alias) =>
    post('/api/participantes', { inventarioId, clave, alias }),
  crearPerfilComoAdmin: (inventarioId, adminId, alias, nombre) =>
    post('/api/participantes/admin', { inventarioId, adminId, alias, nombre }),
  eliminarParticipante: (id, adminId) => solicitar(`/api/participantes/${id}?adminId=${adminId}`, { method: 'DELETE' }),
  taxesDeParticipante: (participanteId) => solicitar(`/api/participantes/${participanteId}/taxes`),
  resumenParticipante: (participanteId) => solicitar(`/api/participantes/${participanteId}/resumen`),

  abrirTax: (participanteId, numeroTax) => post('/api/taxes', { participanteId, numeroTax }),
  cerrarTax: (id) => post(`/api/taxes/${id}/cerrar`, {}),
  reabrirTax: (id, adminId) => post(`/api/taxes/${id}/reabrir`, { adminId }),
  eliminarTax: (id, adminId) => solicitar(`/api/taxes/${id}?adminId=${adminId}`, { method: 'DELETE' }),

  validarArticulo: (codigo, talla) =>
    solicitar(`/api/articulos/validar?codigo=${encodeURIComponent(codigo)}&talla=${encodeURIComponent(talla)}`),

  capturasDeTax: (taxId) => solicitar(`/api/capturas?taxId=${taxId}`),
  capturasAgrupadas: (taxId) => solicitar(`/api/capturas/agrupado?taxId=${taxId}`),
  crearCaptura: (datos) => post('/api/capturas', datos),
  editarGrupoCaptura: (taxId, codigo, talla, cantidad) =>
    solicitar('/api/capturas/grupo', { method: 'PUT', body: JSON.stringify({ taxId, codigo, talla, cantidad }) }),
  eliminarGrupoCaptura: (taxId, codigo, talla) =>
    solicitar(`/api/capturas/grupo?taxId=${taxId}&codigo=${codigo}&talla=${talla}`, { method: 'DELETE' }),

  subirMaestroTiendas: (adminId, archivo) => subirArchivo('/api/maestros/tiendas', adminId, archivo),
  subirMaestroProductos: (adminId, archivo) => subirArchivo('/api/maestros/productos', adminId, archivo),
};
