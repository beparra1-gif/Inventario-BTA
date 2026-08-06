export function formatearFecha(fechaISO) {
  if (!fechaISO) return null;
  return new Date(fechaISO).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
