import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { IconoTienda } from '../componentes/Iconos.jsx';

// Ya no pide clave del inventario acá: cada capturador tiene la suya propia
// (se pide en PantallaParticipante). Esta pantalla solo ubica la tienda.
export function PantallaAcceso({ onAcceso, onIrAdmin }) {
  const mostrarToast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (busqueda.trim().length < 2) {
      setResultados([]);
      return undefined;
    }
    const timeout = setTimeout(async () => {
      try {
        setResultados(await api.buscarTiendas(busqueda.trim()));
      } catch {
        // búsqueda incremental: un fallo de red acá no amerita interrumpir al usuario
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [busqueda]);

  async function elegirTienda(tienda) {
    setCargando(true);
    try {
      const inventario = await api.inventarioAbiertoPorEdp(tienda.edp);
      onAcceso({ tienda, inventario });
    } catch (error) {
      mostrarToast(
        error.status === 404 ? `Tienda ${tienda.edp} no tiene un inventario abierto` : 'No se pudo conectar con el servidor',
        'error'
      );
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="pantalla">
      <div className="contenedor">
        <div className="tarjeta">
          <h1 className="titulo-pantalla">Inventario BTA</h1>
          <p className="subtitulo">Selecciona tu tienda para empezar a capturar</p>

          <input
            className="campo"
            placeholder="Buscar tienda por nombre o EDP..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            disabled={cargando}
          />
          {resultados.map((t) => (
            <button
              key={t.edp}
              className="btn btn-secundario"
              style={{ justifyContent: 'flex-start', marginBottom: 8 }}
              disabled={cargando}
              onClick={() => elegirTienda(t)}
            >
              <IconoTienda />
              {t.edp} · {t.glosa}
            </button>
          ))}

          <button className="btn-texto" style={{ display: 'block', margin: '20px auto 0' }} onClick={onIrAdmin}>
            Soy administrador
          </button>
        </div>
      </div>
    </div>
  );
}
