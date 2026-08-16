import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { formatearFecha } from '../utilidades/fecha.js';

const ETIQUETAS = {
  cerrar_inventario: 'Cerró el inventario',
  reabrir_inventario: 'Reabrió el inventario',
  borrar_inventario: 'Borró el inventario',
  borrar_tax: 'Borró un tax',
  validar_tax: 'Validó un tax',
  cargar_stock_teorico: 'Cargó el stock teórico',
  marcar_revisado: 'Marcó una diferencia como revisada',
};

// Bitácora de acciones sensibles de un inventario puntual — no todo queda
// en el estado final (cerrado/abierto), esto responde "quién hizo qué y
// cuándo" para poder resolver dudas o reclamos después.
export function ActividadInventarioScreen({ inventario, adminId, onVolver }) {
  const mostrarToast = useToast();
  const [eventos, setEventos] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setEventos(await api.eventosInventario(inventario.id, adminId));
      } catch {
        mostrarToast('No se pudo cargar la actividad', 'error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventario.id]);

  return (
    <div className="tarjeta" style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>Actividad reciente</h3>
        <button className="btn-texto" style={{ padding: 0 }} onClick={onVolver}>‹ Volver</button>
      </div>
      <p style={{ fontSize: 13, margin: '0 0 16px', color: 'var(--texto-tenue)' }}>{inventario.numero_inventario}</p>

      {!eventos ? (
        <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Cargando...</p>
      ) : eventos.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--texto-tenue)', fontSize: 13 }}>Sin actividad registrada todavía.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {eventos.map((e) => (
            <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--borde)' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {ETIQUETAS[e.tipo] || e.tipo} — <span style={{ fontWeight: 400, color: 'var(--texto-tenue)' }}>{e.admin_nombre || e.admin_email || 'sistema'}</span>
              </div>
              {e.detalle && <div style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>{e.detalle}</div>}
              <div style={{ fontSize: 11, color: 'var(--texto-suave)' }}>{formatearFecha(e.creado_en)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
