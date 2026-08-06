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
  resumenInventario: (id) => solicitar(`/api/inventarios/${id}/resumen`),
  urlExportarInventario: (id) => `${URL_BASE}/api/inventarios/${id}/exportar`,

  unirseComoParticipante: (inventarioId, clave, alias) =>
    post('/api/participantes', { inventarioId, clave, alias }),
  taxesDeParticipante: (participanteId) => solicitar(`/api/participantes/${participanteId}/taxes`),

  abrirTax: (participanteId, numeroTax) => post('/api/taxes', { participanteId, numeroTax }),
  cerrarTax: (id) => post(`/api/taxes/${id}/cerrar`, {}),

  validarArticulo: (codigo, talla) =>
    solicitar(`/api/articulos/validar?codigo=${encodeURIComponent(codigo)}&talla=${encodeURIComponent(talla)}`),

  capturasDeTax: (taxId) => solicitar(`/api/capturas?taxId=${taxId}`),
  capturasAgrupadas: (taxId) => solicitar(`/api/capturas/agrupado?taxId=${taxId}`),
  crearCaptura: (datos) => post('/api/capturas', datos),
  actualizarCaptura: (id, cantidad) =>
    solicitar(`/api/capturas/${id}`, { method: 'PUT', body: JSON.stringify({ cantidad }) }),
  eliminarCaptura: (id) => solicitar(`/api/capturas/${id}`, { method: 'DELETE' }),

  subirMaestroTiendas: (adminId, archivo) => subirArchivo('/api/maestros/tiendas', adminId, archivo),
  subirMaestroProductos: (adminId, archivo) => subirArchivo('/api/maestros/productos', adminId, archivo),
};
