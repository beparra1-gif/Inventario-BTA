import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { useEscanerCodigoBarras } from '../hooks/useEscanerCodigoBarras.js';
import { IconoEscanear, IconoCerrar, IconoAlerta, IconoEliminar } from '../componentes/Iconos.jsx';
import { FOTO_PLACEHOLDER } from '../utilidades/fotoPlaceholder.js';
import { EncabezadoInventario } from '../componentes/EncabezadoInventario.jsx';
import { sonarExito, sonarError, sonarEncolado } from '../utilidades/feedback.js';
import { useColaOffline } from '../hooks/useColaOffline.js';
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

export function PantallaCaptura({ acceso, participante, tax, onCerrarTax, onVolver }) {
  const mostrarToast = useToast();
  const [capturas, setCapturas] = useState([]);
  const [mostrarManual, setMostrarManual] = useState(false);
  const [codigoManual, setCodigoManual] = useState('');
  const [tallaManual, setTallaManual] = useState('');
  const [previaManual, setPreviaManual] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(null);
  const [valorEdicion, setValorEdicion] = useState('');
  const [enLinea, setEnLinea] = useState(navigator.onLine);

  const taxCerrado = tax.estado === 'cerrado';

  useEffect(() => {
    const alConectar = () => setEnLinea(true);
    const alDesconectar = () => setEnLinea(false);
    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    return () => {
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
    };
  }, []);

  // Si crearCaptura falla por falta de conexión (no porque el servidor la
  // rechace), la captura queda encolada acá en vez de perderse, y se manda
  // sola apenas vuelva la señal.
  const { cola, encolar } = useColaOffline(async (item) => {
    const nueva = await api.crearCaptura(item);
    setCapturas((actuales) => [nueva, ...actuales]);
  });

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

  // error.status solo existe si el servidor alcanzó a responder (ver
  // src/api.js) — si no está, fetch nunca llegó a ningún lado: es falta de
  // conexión, no un rechazo real, así que se encola en vez de mostrarse
  // como error.
  function manejarErrorCaptura(error, itemParaEncolar) {
    if (!error.status && itemParaEncolar) {
      encolar(itemParaEncolar);
      sonarEncolado();
      mostrarToast('Sin conexión — se guardó en el celular y se sube sola cuando vuelva la señal', 'error');
      return;
    }
    if (error.info?.error === 'inventario_cerrado') {
      mostrarToast('El admin cerró este inventario — ya no se puede seguir capturando', 'error');
    } else {
      mostrarToast('No se pudo guardar, intenta de nuevo', 'error');
    }
    sonarError();
  }

  // Escaneo: sin paso de validación aparte antes de guardar — la respuesta
  // de crearCaptura ya trae reconocido/descripción (el backend las calcula
  // igual para el snapshot), así se ahorra una vuelta de red por escaneo y
  // la captura queda lo más rápida posible. Sin notificación con el nombre
  // del producto (interrumpía el ritmo de escaneo): el sonido ya avisa si
  // quedó reconocido o no, y el nombre aparece en la lista de abajo.
  async function agregarPorEscaneo(codigo, talla, ean13Original) {
    const item = { taxId: tax.id, codigo, talla, ean13Original, cantidad: 1, origen: 'scan' };
    try {
      const nueva = await api.crearCaptura(item);
      setCapturas((actuales) => [nueva, ...actuales]);
      nueva.reconocido ? sonarExito() : sonarError();
    } catch (error) {
      manejarErrorCaptura(error, item);
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
    const item = {
      taxId: tax.id,
      codigo: resultado.codigoProducto,
      talla: resultado.tallaCruda,
      ean13Original: null,
      cantidad: 1,
      origen: 'manual',
    };
    try {
      const nueva = await api.crearCaptura(item);
      setCapturas((actuales) => [nueva, ...actuales]);
      nueva.reconocido ? sonarExito() : sonarError();
    } catch (error) {
      manejarErrorCaptura(error, item);
    } finally {
      setCodigoManual('');
      setTallaManual('');
      setPreviaManual(null);
      setMostrarManual(false);
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
    if (!window.confirm(`¿Cerrar tax ${tax.numero_tax} con ${totalUnidades} unidad${totalUnidades === 1 ? '' : 'es'}? Ya no vas a poder agregar más ahí a menos que lo reabras.`)) return;
    try {
      const actualizado = await api.cerrarTax(tax.id);
      onCerrarTax(actualizado);
    } catch {
      mostrarToast('No se pudo cerrar el tax', 'error');
    }
  }

  async function reiniciarTax() {
    if (!window.confirm(`Esto borra las ${totalUnidades} unidades capturadas en este tax y empieza de cero. ¿Seguro?`)) return;
    try {
      await api.reiniciarTax(tax.id);
      setCapturas([]);
      mostrarToast('Tax reiniciado', 'ok');
    } catch {
      mostrarToast('No se pudo reiniciar el tax', 'error');
    }
  }

  async function borrarTax() {
    if (!window.confirm(`Esto borra el tax ${tax.numero_tax} por completo (no solo lo capturado). No se puede deshacer. ¿Seguro?`)) return;
    try {
      await api.eliminarTax(tax.id, { participanteId: participante.id });
      mostrarToast('Tax borrado', 'ok');
      onVolver();
    } catch {
      mostrarToast('No se pudo borrar el tax', 'error');
    }
  }

  const totalUnidades = agrupado.reduce((acc, i) => acc + i.cantidad, 0);

  return (
    <div className="pantalla" style={{ paddingBottom: 100 }}>
      <EncabezadoInventario tienda={acceso.tienda} inventario={acceso.inventario} />
      <div className="contenedor">
        {(!enLinea || cola.length > 0) && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 12px', marginBottom: 16, fontSize: 13, color: '#92400E' }}>
            <IconoAlerta tamano={16} />
            {!enLinea ? 'Sin conexión' : 'Reconectando'} — {cola.length} captura{cola.length === 1 ? '' : 's'} pendiente{cola.length === 1 ? '' : 's'} de subir, no se pierden.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.3em', fontWeight: 700 }}>Tax {tax.numero_tax}</h1>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--texto-tenue)' }}>{participante.nombre || participante.alias}</p>
            </div>
            <div style={{ textAlign: 'center', background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: '6px 14px' }}>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{totalUnidades}</div>
              <div style={{ fontSize: 10, color: 'var(--texto-tenue)', textTransform: 'uppercase' }}>
                unidad{totalUnidades === 1 ? '' : 'es'}
              </div>
            </div>
          </div>
          {!taxCerrado && (
            <div style={{ display: 'flex', gap: 6 }}>
              {totalUnidades > 0 && (
                <button className="btn btn-secundario btn-chico" onClick={reiniciarTax} title="Borra todo y empieza de cero">
                  Reiniciar
                </button>
              )}
              <button className="btn btn-secundario btn-chico" style={{ color: '#B91C1C' }} onClick={borrarTax} title="Borra el tax por completo">
                Borrar
              </button>
              <button className="btn btn-secundario btn-chico" onClick={cerrarTax}>
                Cerrar tax
              </button>
            </div>
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
                <div
                  className="item-captura"
                  key={clave}
                  style={{ border: `2px solid ${item.reconocido ? 'var(--exito)' : '#DC2626'}` }}
                >
                  <div className="item-captura-fila">
                    <span className="item-captura-codigo">{formatearCodigo(item.codigo)}</span>
                    <span className="item-captura-sku">SKU: {etiquetaTalla(item)}</span>
                    <span className="item-captura-cant">
                      cant:{' '}
                      {!taxCerrado && seEstaEditando ? (
                        <input
                          className="campo"
                          style={{ width: 48, textAlign: 'center', padding: 4, marginBottom: 0, display: 'inline-block' }}
                          type="number"
                          inputMode="numeric"
                          autoFocus
                          value={valorEdicion}
                          onChange={(e) => setValorEdicion(e.target.value)}
                          onBlur={() => guardarEdicion(item)}
                          onKeyDown={(e) => e.key === 'Enter' && guardarEdicion(item)}
                        />
                      ) : (
                        <strong
                          style={{ cursor: taxCerrado ? 'default' : 'pointer' }}
                          title="Tocar para editar la cantidad"
                          onClick={() => !taxCerrado && empezarEdicion(item)}
                        >
                          {item.cantidad}
                        </strong>
                      )}
                    </span>
                    {!taxCerrado && (
                      <button
                        onClick={() => eliminarGrupo(item)}
                        title="Eliminar"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-suave)', flexShrink: 0, display: 'flex' }}
                      >
                        <IconoEliminar tamano={16} />
                      </button>
                    )}
                  </div>
                  <div className="descripcion-linea">{item.descripcion || 'Artículo no reconocido'}</div>
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
