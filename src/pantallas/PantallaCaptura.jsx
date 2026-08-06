import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { useEscanerCodigoBarras } from '../hooks/useEscanerCodigoBarras.js';
import { IconoEscanear, IconoCerrar } from '../componentes/Iconos.jsx';
import { FOTO_PLACEHOLDER } from '../utilidades/fotoPlaceholder.js';
// Mismas funciones puras que usa el backend (sin dependencias de Node),
// reusadas acá tal cual para no duplicar lógica ni arriesgar que el cliente
// se desincronice del servidor — ver backend/utils/ean13.js y fotos.js.
import { parseEAN13, parseArticuloManual, agruparCapturas } from '../../backend/utils/ean13.js';
import { urlFotoMinuscula, urlFotoMayuscula } from '../../backend/utils/fotos.js';

export function PantallaCaptura({ acceso, participante, tax, onCerrarTax }) {
  const mostrarToast = useToast();
  const [capturas, setCapturas] = useState([]);
  const [mostrarManual, setMostrarManual] = useState(false);
  const [codigoManual, setCodigoManual] = useState('');
  const [tallaManual, setTallaManual] = useState('');
  const [cargando, setCargando] = useState(true);

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

  async function agregarCaptura({ codigo, talla, ean13Original, origen }) {
    try {
      const validacion = await api.validarArticulo(codigo, talla);
      await api.crearCaptura({ taxId: tax.id, codigo, talla, ean13Original, cantidad: 1, origen });
      await cargarCapturas();
      mostrarToast(
        validacion.reconocido ? validacion.descripcion : 'Artículo no reconocido — se guardó igual',
        validacion.reconocido ? 'ok' : 'error'
      );
    } catch {
      mostrarToast('No se pudo guardar la captura, intenta de nuevo', 'error');
    }
  }

  useEscanerCodigoBarras(
    (codigoBarras) => {
      const resultado = parseEAN13(codigoBarras);
      if (!resultado.valido) {
        mostrarToast('Código escaneado no válido (debe tener 13 dígitos)', 'error');
        return;
      }
      agregarCaptura({
        codigo: resultado.codigoProducto,
        talla: resultado.tallaCruda,
        ean13Original: codigoBarras,
        origen: 'scan',
      });
    },
    { activo: !taxCerrado }
  );

  function enviarManual() {
    const resultado = parseArticuloManual(codigoManual, tallaManual);
    if (!resultado.valido) {
      mostrarToast(
        resultado.motivo === 'codigo_invalido' ? 'El código debe tener 7 dígitos' : 'La talla debe tener 1 o 2 dígitos',
        'error'
      );
      return;
    }
    agregarCaptura({ codigo: resultado.codigoProducto, talla: resultado.tallaCruda, ean13Original: null, origen: 'manual' });
    setCodigoManual('');
    setTallaManual('');
    setMostrarManual(false);
  }

  async function ajustarUnidad(codigo, talla, delta) {
    const fila = capturas.find((c) => c.codigo === codigo && c.talla === talla);
    if (!fila) return;
    try {
      if (delta > 0) {
        await api.crearCaptura({ taxId: tax.id, codigo, talla, ean13Original: null, cantidad: 1, origen: 'manual' });
      } else if (fila.cantidad > 1) {
        await api.actualizarCaptura(fila.id, fila.cantidad - 1);
      } else {
        await api.eliminarCaptura(fila.id);
      }
      await cargarCapturas();
    } catch {
      mostrarToast('No se pudo actualizar la cantidad', 'error');
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
              const tallaUnica = item.talla === '01';
              return (
                <div className="item-captura" key={`${item.codigo}-${item.talla}`}>
                  <img
                    src={urlFotoMinuscula(item.codigo)}
                    data-intento="minuscula"
                    onError={(e) => {
                      if (e.currentTarget.dataset.intento === 'minuscula') {
                        e.currentTarget.dataset.intento = 'mayuscula';
                        e.currentTarget.src = urlFotoMayuscula(item.codigo);
                      } else {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = FOTO_PLACEHOLDER;
                      }
                    }}
                    alt=""
                  />
                  <div className="detalle">
                    <div className="codigo">
                      {item.codigo} · {tallaUnica ? 'Talla única' : `Talla ${item.talla}`}
                    </div>
                    <div className="descripcion">{item.descripcion || 'Artículo no reconocido'}</div>
                    <span className={`badge ${item.reconocido ? 'badge-ok' : 'badge-error'}`} style={{ marginTop: 4 }}>
                      {item.reconocido ? 'Reconocido' : 'No reconocido'}
                    </span>
                  </div>
                  {!taxCerrado && (
                    <div className="selector-cantidad">
                      <button onClick={() => ajustarUnidad(item.codigo, item.talla, -1)}>−</button>
                      <span>{item.cantidad}</span>
                      <button onClick={() => ajustarUnidad(item.codigo, item.talla, 1)}>+</button>
                    </div>
                  )}
                  {taxCerrado && <span style={{ fontWeight: 700 }}>{item.cantidad}</span>}
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
              onKeyDown={(e) => e.key === 'Enter' && enviarManual()}
            />

            <button className="btn btn-primario" onClick={enviarManual}>Agregar</button>
          </div>
        </div>
      )}
    </div>
  );
}
