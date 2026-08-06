import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { useEscanerCodigoBarras } from '../hooks/useEscanerCodigoBarras.js';
import { IconoEscanear, IconoCerrar, IconoCheck, IconoAlerta, IconoEliminar } from '../componentes/Iconos.jsx';
import { FOTO_PLACEHOLDER } from '../utilidades/fotoPlaceholder.js';
import { formatearFecha } from '../utilidades/fecha.js';
// Mismas funciones puras que usa el backend (sin dependencias de Node),
// reusadas acá tal cual para no duplicar lógica ni arriesgar que el cliente
// se desincronice del servidor — ver backend/utils/ean13.js y fotos.js.
import { parseEAN13, parseArticuloManual, agruparCapturas } from '../../backend/utils/ean13.js';
import { urlFotoMinuscula, urlFotoMayuscula } from '../../backend/utils/fotos.js';

// "3011576" -> "301-1576", solo para que el código se lea más fácil en la lista.
function formatearCodigo(codigo) {
  return `${codigo.slice(0, 3)}-${codigo.slice(3)}`;
}

function etiquetaTalla(item) {
  // Talla real traducida por reglas_talla (ej. "44"), no el dígito crudo
  // del código de barra (ej. "07"). Solo se cae a "única" cuando el
  // maestro no tiene traducción real para talla_cruda "01" — no todo "01"
  // es talla única, depende del artículo (ver data/maestros/README.md).
  if (item.tallaReal) return item.tallaReal;
  if (item.talla === '01') return 'única';
  return `${item.talla}*`;
}

export function PantallaCaptura({ acceso, participante, tax, onCerrarTax }) {
  const mostrarToast = useToast();
  const [capturas, setCapturas] = useState([]);
  const [mostrarManual, setMostrarManual] = useState(false);
  const [codigoManual, setCodigoManual] = useState('');
  const [tallaManual, setTallaManual] = useState('');
  const [previaManual, setPreviaManual] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(null);
  const [valorEdicion, setValorEdicion] = useState('');

  const taxCerrado = tax.estado === 'cerrado';

  useEffect(() => {
    cargarCapturas();
  }, []);

  async function cargarCapturas() {
    setCargando(true);
    try {
      setCapturas(await api.capturasDeTax(tax.id));
    } finally {
      setCargando(false);
    }
  }

  const agrupado = useMemo(() => agruparCapturas(capturas), [capturas]);

  function manejarErrorCaptura(error) {
    if (error.info?.error === 'inventario_cerrado') {
      mostrarToast('El admin cerró este inventario — ya no se puede seguir capturando', 'error');
    } else {
      mostrarToast('No se pudo guardar, intenta de nuevo', 'error');
    }
  }

  // Escaneo: sin paso de validación aparte antes de guardar — la respuesta
  // de crearCaptura ya trae reconocido/descripción (el backend las calcula
  // igual para el snapshot), así se ahorra una vuelta de red por escaneo y
  // la captura queda lo más rápida posible.
  async function agregarPorEscaneo(codigo, talla, ean13Original) {
    try {
      const nueva = await api.crearCaptura({ taxId: tax.id, codigo, talla, ean13Original, cantidad: 1, origen: 'scan' });
      setCapturas((actuales) => [nueva, ...actuales]);
      mostrarToast(nueva.reconocido ? nueva.descripcion_snapshot : 'No reconocido — se guardó igual', nueva.reconocido ? 'ok' : 'error');
    } catch (error) {
      manejarErrorCaptura(error);
    }
  }

  useEscanerCodigoBarras(
    (codigoBarras) => {
      const resultado = parseEAN13(codigoBarras);
      if (!resultado.valido) {
        mostrarToast('Código escaneado no válido (debe tener 13 dígitos)', 'error');
        return;
      }
      agregarPorEscaneo(resultado.codigoProducto, resultado.tallaCruda, codigoBarras);
    },
    { activo: !taxCerrado && !mostrarManual }
  );

  // Manual: acá sí se corrobora antes de guardar (por eso trae foto) —
  // ingresado a mano es más propenso a error de tipeo que un escaneo.
  useEffect(() => {
    if (!/^\d{7}$/.test(codigoManual) || !tallaManual) {
      setPreviaManual(null);
      return undefined;
    }
    const timeout = setTimeout(async () => {
      try {
        setPreviaManual(await api.validarArticulo(codigoManual, tallaManual.padStart(2, '0')));
      } catch {
        setPreviaManual(null);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [codigoManual, tallaManual]);

  async function confirmarManual() {
    const resultado = parseArticuloManual(codigoManual, tallaManual);
    if (!resultado.valido) return;
    try {
      const nueva = await api.crearCaptura({
        taxId: tax.id,
        codigo: resultado.codigoProducto,
        talla: resultado.tallaCruda,
        ean13Original: null,
        cantidad: 1,
        origen: 'manual',
      });
      setCapturas((actuales) => [nueva, ...actuales]);
      mostrarToast(nueva.reconocido ? nueva.descripcion_snapshot : 'No reconocido — se guardó igual', nueva.reconocido ? 'ok' : 'error');
      setCodigoManual('');
      setTallaManual('');
      setPreviaManual(null);
      setMostrarManual(false);
    } catch (error) {
      manejarErrorCaptura(error);
    }
  }

  function empezarEdicion(item) {
    setEditando(`${item.codigo}-${item.talla}`);
    setValorEdicion(String(item.cantidad));
  }

  async function guardarEdicion(item) {
    const cantidad = Number(valorEdicion);
    setEditando(null);
    if (!Number.isInteger(cantidad) || cantidad <= 0) return;
    if (cantidad === item.cantidad) return;
    try {
      await api.editarGrupoCaptura(tax.id, item.codigo, item.talla, cantidad);
      await cargarCapturas();
    } catch (error) {
      manejarErrorCaptura(error);
    }
  }

  async function eliminarGrupo(item) {
    try {
      await api.eliminarGrupoCaptura(tax.id, item.codigo, item.talla);
      setCapturas((actuales) => actuales.filter((c) => !(c.codigo === item.codigo && c.talla === item.talla)));
    } catch (error) {
      manejarErrorCaptura(error);
    }
  }

  async function cerrarTax() {
    try {
      const actualizado = await api.cerrarTax(tax.id);
      onCerrarTax(actualizado);
    } catch {
      mostrarToast('No se pudo cerrar el tax', 'error');
    }
  }

  const totalUnidades = agrupado.reduce((acc, i) => acc + i.cantidad, 0);

  return (
    <div className="pantalla" style={{ paddingBottom: 100 }}>
      <div className="contenedor">
        <div style={{ textAlign: 'center', marginBottom: 8, fontSize: 11, color: 'var(--texto-tenue)' }}>
          {acceso.tienda.edp} · {acceso.tienda.glosa}
          {acceso.inventario.numero_inventario && <> · inv. {acceso.inventario.numero_inventario}</>}
          {formatearFecha(acceso.inventario.creado_en) && <> · {formatearFecha(acceso.inventario.creado_en)}</>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.3em', fontWeight: 700 }}>Tax {tax.numero_tax}</h1>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--texto-tenue)' }}>
              {participante.alias} · {totalUnidades} unidad{totalUnidades === 1 ? '' : 'es'}
            </p>
          </div>
          {!taxCerrado && (
            <button className="btn btn-secundario btn-chico" onClick={cerrarTax}>
              Cerrar tax
            </button>
          )}
        </div>

        {cargando ? (
          <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Cargando...</p>
        ) : agrupado.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>
            {taxCerrado ? 'Este tax no tiene artículos.' : 'Escanea o ingresa un artículo para empezar.'}
          </p>
        ) : (
          <div className="lista-capturas">
            {agrupado.map((item) => {
              const clave = `${item.codigo}-${item.talla}`;
              const seEstaEditando = editando === clave;
              return (
                <div className="item-captura" key={clave} style={{ padding: '10px 12px' }}>
                  <span style={{ flexShrink: 0, color: item.reconocido ? 'var(--exito)' : '#B91C1C' }}>
                    {item.reconocido ? <IconoCheck tamano={18} /> : <IconoAlerta tamano={18} />}
                  </span>
                  <div className="detalle">
                    <div className="codigo">
                      {formatearCodigo(item.codigo)} · {etiquetaTalla(item)}
                    </div>
                    <div className="descripcion">{item.descripcion || 'Artículo no reconocido'}</div>
                  </div>
                  {!taxCerrado && seEstaEditando ? (
                    <input
                      className="campo"
                      style={{ width: 56, textAlign: 'center', padding: 8, marginBottom: 0 }}
                      type="number"
                      inputMode="numeric"
                      autoFocus
                      value={valorEdicion}
                      onChange={(e) => setValorEdicion(e.target.value)}
                      onBlur={() => guardarEdicion(item)}
                      onKeyDown={(e) => e.key === 'Enter' && guardarEdicion(item)}
                    />
                  ) : (
                    <span
                      style={{ fontWeight: 700, minWidth: 24, textAlign: 'center', cursor: taxCerrado ? 'default' : 'pointer' }}
                      onClick={() => !taxCerrado && empezarEdicion(item)}
                    >
                      {item.cantidad}
                    </span>
                  )}
                  {!taxCerrado && (
                    <button
                      onClick={() => eliminarGrupo(item)}
                      title="Eliminar"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-suave)', flexShrink: 0 }}
                    >
                      <IconoEliminar tamano={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!taxCerrado && (
        <button className="boton-flotante" onClick={() => setMostrarManual(true)} title="Ingresar código manualmente">
          <IconoEscanear />
        </button>
      )}

      {mostrarManual && (
        <div className="fondo-hoja" onClick={() => setMostrarManual(false)}>
          <div className="hoja" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Ingresar manualmente</h3>
              <button onClick={() => setMostrarManual(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-tenue)' }}>
                <IconoCerrar tamano={20} />
              </button>
            </div>

            <label className="etiqueta">Código de producto (7 dígitos)</label>
            <input
              className="campo"
              inputMode="numeric"
              maxLength={7}
              value={codigoManual}
              onChange={(e) => setCodigoManual(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />

            <label className="etiqueta">Talla</label>
            <input
              className="campo"
              inputMode="numeric"
              maxLength={2}
              value={tallaManual}
              onChange={(e) => setTallaManual(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && confirmarManual()}
            />

            {previaManual && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 10, marginBottom: 16 }}>
                <img
                  src={urlFotoMinuscula(previaManual.codigo)}
                  data-intento="minuscula"
                  onError={(e) => {
                    if (e.currentTarget.dataset.intento === 'minuscula') {
                      e.currentTarget.dataset.intento = 'mayuscula';
                      e.currentTarget.src = urlFotoMayuscula(previaManual.codigo);
                    } else {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = FOTO_PLACEHOLDER;
                    }
                  }}
                  alt=""
                  style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'contain', background: 'white', border: '1px solid var(--borde)' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {previaManual.descripcion || 'No reconocido'}
                  </div>
                  <span className={`badge ${previaManual.reconocido ? 'badge-ok' : 'badge-error'}`}>
                    {previaManual.reconocido ? 'Reconocido' : 'No reconocido'}
                  </span>
                </div>
              </div>
            )}

            <button className="btn btn-primario" onClick={confirmarManual} disabled={!/^\d{7}$/.test(codigoManual) || !tallaManual}>
              Agregar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
