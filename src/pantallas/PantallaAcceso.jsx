import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { IconoTienda, IconoCandado, IconoChevron } from '../componentes/Iconos.jsx';

export function PantallaAcceso({ onAcceso, onIrAdmin }) {
  const mostrarToast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [tienda, setTienda] = useState(null);
  const [clave, setClave] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (tienda || busqueda.trim().length < 2) {
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
  }, [busqueda, tienda]);

  async function entrar() {
    if (!tienda || !clave) return;
    setCargando(true);
    try {
      const inventario = await api.inventarioAbiertoPorEdp(tienda.edp);
      const verificado = await api.verificarClaveInventario(inventario.id, clave);
      onAcceso({ tienda, inventario: verificado, clave });
    } catch (error) {
      if (error.status === 404) mostrarToast(`Tienda ${tienda.edp} no tiene un inventario abierto`, 'error');
      else if (error.status === 401) mostrarToast('Clave incorrecta', 'error');
      else mostrarToast('No se pudo conectar con el servidor', 'error');
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

          {!tienda ? (
            <>
              <input
                className="campo"
                placeholder="Buscar tienda por nombre o EDP..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              {resultados.map((t) => (
                <button
                  key={t.edp}
                  className="btn btn-secundario"
                  style={{ justifyContent: 'flex-start', marginBottom: 8 }}
                  onClick={() => { setTienda(t); setBusqueda(''); setResultados([]); }}
                >
                  <IconoTienda />
                  {t.edp} · {t.glosa}
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="chip" style={{ margin: '0 auto 20px', display: 'flex' }} onClick={() => setTienda(null)}>
                <IconoTienda tamano={14} />
                {tienda.edp} · {tienda.glosa}
                <IconoChevron tamano={12} />
              </div>

              <div className="campo" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
                <IconoCandado tamano={18} />
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder="Clave del inventario"
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && entrar()}
                  style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, padding: '15px 0' }}
                  autoFocus
                />
              </div>

              <button className="btn btn-primario" disabled={!clave || cargando} onClick={entrar}>
                {cargando ? 'Verificando...' : 'Entrar a capturar'}
              </button>
            </>
          )}

          <button className="btn-texto" style={{ display: 'block', margin: '20px auto 0' }} onClick={onIrAdmin}>
            Soy administrador
          </button>
        </div>
      </div>
    </div>
  );
}
