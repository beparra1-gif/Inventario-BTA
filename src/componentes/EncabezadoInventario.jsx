import { formatearFecha } from '../utilidades/fecha.js';
import { IconoTienda } from './Iconos.jsx';

// Header consistente en todas las pantallas de captura: tienda, número de
// inventario y fecha siempre visibles, para que nadie pierda el contexto de
// en qué inventario está trabajando.
export function EncabezadoInventario({ tienda, inventario, children }) {
  return (
    <div className="encabezado-inv">
      <div className="encabezado-inv-fila">
        <IconoTienda tamano={14} />
        <span className="encabezado-inv-tienda">{tienda.edp} · {tienda.glosa}</span>
      </div>
      <div className="encabezado-inv-meta">
        {inventario.numero_inventario && <span>Inventario {inventario.numero_inventario}</span>}
        {formatearFecha(inventario.creado_en) && <span>{formatearFecha(inventario.creado_en)}</span>}
      </div>
      {children}
    </div>
  );
}
