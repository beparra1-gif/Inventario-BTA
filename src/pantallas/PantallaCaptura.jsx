import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { useEscanerCodigoBarras } from '../hooks/useEscanerCodigoBarras.js';
import { IconoEscanear, IconoCerrar, IconoAlerta, IconoEliminar } from '../componentes/Iconos.jsx';
import { FOTO_PLACEHOLDER } from '../utilidades/fotoPlaceholder.js';
import { EncabezadoInventario } from '../componentes/EncabezadoInventario.jsx';
import { sonarEscaneado, sonarExito, sonarError, sonarEncolado } from '../utilidades/feedback.js';
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

export function PantallaCaptura({ acceso, participante, tax, onCambiarTax, onVolver }) {
  const mostrarToast = useToast();
  const [capturas, setCapturas] = useState([]);
  const [misTax, setMisTax] = useState([]);
  const [mostrarManual, setMostrarManual] = useState(false);
  const [codigoManual, setCodigoManual] = useState('');
  const [tallaManual, setTallaManual] = useState('');
  // null = todavía no se consultó (código incompleto); [] = código
  // consultado pero no está en el maestro (cae al campo de talla libre);
  // [...] = tallas para elegir.
  const [tallasDisponibles, setTallasDisponibles] = useState(null);
  const [cantidadManual, setCantidadManual] = useState('1');
  const [previaManual, setPreviaManual] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(null);
  const [valorEdicion, setValorEdicion] = useState('');
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  const [editandoNombreTax, setEditandoNombreTax] = useState(false);
  const [nombreTaxInput, setNombreTaxInput] = useState(tax.nombre || '');

  const taxCerrado = tax.estado === 'cerrado';
  // El admin puede cerrar el inventario completo sin que eso cierre los tax
  // individuales (no cascadea) — igual hay que bloquear toda edición acá,
  // no solo cuando el propio tax está cerrado, y dejarlo en modo visualizador.
  const inventarioCerrado = acceso.inventario.estado !== 'abierto';
  const soloLectura = taxCerrado || inventarioCerrado;

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
  // sola apenas vuelva la señal. Si la fila optimista que la originó sigue
  // en pantalla (idLocal calza) se reemplaza en el mismo lugar; si no
  // (por ejemplo, se recargó la página y la cola se sincroniza sola al
  // volver la conexión) se agrega como fila nueva.
  const { cola, encolar } = useColaOffline(async (item) => {
    const nueva = await api.crearCaptura(item);
    setCapturas((actuales) => {
      const yaEstaEnPantalla = actuales.some((c) => c.idLocal === item.idLocal);
      return yaEstaEnPantalla
        ? actuales.map((c) => (c.idLocal === item.idLocal ? nueva : c))
        : [nueva, ...actuales];
    });
  });

  // Si el usuario cambia de tax con el panel de navegación (ver más abajo)
  // el componente sigue montado con props nuevas — hay que volver a cargar
  // para ese tax puntual en vez de arrastrar lo del anterior.
  useEffect(() => {
    cargarCapturas();
    setEditando(null);
    setNombreTaxInput(tax.nombre || '');
    setEditandoNombreTax(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tax.id]);

  // Lista de todos los tax del participante, para el panel de navegación —
  // así puede saltar de uno a otro a revisar/corroborar sin tener que
  // volver a la pantalla de inicio cada vez.
  useEffect(() => {
    api.resumenParticipante(participante.id).then((r) => setMisTax(r.taxes)).catch(() => {});
  }, [participante.id, tax.id]);

  async function cargarCapturas() {
    setCargando(true);
    try {
      setCapturas(await api.capturasDeTax(tax.id));
    } finally {
      setCargando(false);
    }
  }

  // Mientras el tax está abierto se muestra en el orden en que se fue
  // capturando, una fila por escaneo/ingreso (sin sumar de una) — así el
  // capturador ve exactamente lo que hizo, en orden, y puede editar/borrar
  // cada entrada puntual. Recién al cerrar el tax se agrupa y suma por
  // código+talla, como una especie de "informe final" de solo lectura.
  const listaMostrada = useMemo(
    () => (taxCerrado ? agruparCapturas(capturas) : capturas),
    [capturas, taxCerrado]
  );

  // error.status solo existe si el servidor alcanzó a responder (ver
  // src/api.js) — si no está, fetch nunca llegó a ningún lado: es falta de
  // conexión, no un rechazo real, así que se encola en vez de mostrarse
  // como error. idLocal identifica la fila optimista que hay que corregir:
  // si fue por falta de conexión se deja tal cual (queda "pendiente",
  // useColaOffline la reconcilia sola al subir), si fue un rechazo real del
  // servidor se saca de la lista.
  function manejarErrorCaptura(error, itemParaEncolar, idLocal) {
    if (!error.status && itemParaEncolar) {
      encolar(itemParaEncolar);
      sonarEncolado();
      mostrarToast('Sin conexión — se guardó en el celular y se sube sola cuando vuelva la señal', 'error');
      return;
    }
    if (idLocal) setCapturas((actuales) => actuales.filter((c) => c.idLocal !== idLocal));
    if (error.info?.error === 'inventario_cerrado') {
      mostrarToast('El admin cerró este inventario — ya no se puede seguir capturando', 'error');
    } else {
      mostrarToast('No se pudo guardar, intenta de nuevo', 'error');
    }
    sonarError();
  }

  // Captura optimista: la fila aparece y suma al total al toque (reconocido
  // en null = "pendiente"), sin esperar la vuelta de la red — clave en
  // tiendas lejos del datacenter, donde esa vuelta puede sentirse lenta si
  // es lo único que decide cuándo se ve reflejado el escaneo. Se reemplaza
  // por la fila real apenas responde el servidor (o se marca/saca según
  // corresponda si falla, ver manejarErrorCaptura).
  async function crearCapturaOptimista(datos) {
    const idLocal = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setCapturas((actuales) => [
      { idLocal, codigo: datos.codigo, talla: datos.talla, cantidad: datos.cantidad, reconocido: null, descripcion: null, tallaReal: null },
      ...actuales,
    ]);
    const item = { ...datos, idLocal };
    try {
      const nueva = await api.crearCaptura(item);
      setCapturas((actuales) => actuales.map((c) => (c.idLocal === idLocal ? nueva : c)));
      nueva.reconocido ? sonarExito() : sonarError();
    } catch (error) {
      manejarErrorCaptura(error, item, idLocal);
    }
  }

  // Escaneo: sin paso de validación aparte antes de guardar — la respuesta
  // de crearCaptura ya trae reconocido/descripción (el backend las calcula
  // igual para el snapshot). Sin notificación con el nombre del producto
  // (interrumpía el ritmo de escaneo): el sonido ya avisa si quedó
  // reconocido o no, y el nombre aparece en la lista de abajo.
  function agregarPorEscaneo(codigo, talla, ean13Original) {
    sonarEscaneado();
    crearCapturaOptimista({ taxId: tax.id, codigo, talla, ean13Original, cantidad: 1, origen: 'scan' });
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
    { activo: !soloLectura && !mostrarManual }
  );

  // Apenas el código queda completo, se consultan las tallas que existen
  // para ese artículo en el maestro — así se elige de una lista (cruda +
  // real ya traducida) en vez de tener que adivinar/escribir la talla
  // cruda de a dos dígitos. Si no está en el maestro, tallasDisponibles
  // queda en [] y el formulario cae al campo de talla libre de siempre.
  useEffect(() => {
    setTallaManual('');
    if (!/^\d{7}$/.test(codigoManual)) {
      setTallasDisponibles(null);
      return undefined;
    }
    let cancelado = false;
    api
      .tallasDeArticulo(codigoManual)
      .then((r) => { if (!cancelado) setTallasDisponibles(r.tallas); })
      .catch(() => { if (!cancelado) setTallasDisponibles([]); });
    return () => { cancelado = true; };
  }, [codigoManual]);

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

  function confirmarManual() {
    const resultado = parseArticuloManual(codigoManual, tallaManual);
    if (!resultado.valido) return;
    const cantidad = Number(cantidadManual);
    if (!Number.isInteger(cantidad) || cantidad <= 0) return;
    crearCapturaOptimista({
      taxId: tax.id,
      codigo: resultado.codigoProducto,
      talla: resultado.tallaCruda,
      ean13Original: null,
      cantidad,
      origen: 'manual',
    });
    setCodigoManual('');
    setTallaManual('');
    setTallasDisponibles(null);
    setCantidadManual('1');
    setPreviaManual(null);
    setMostrarManual(false);
  }

  function empezarEdicion(item) {
    setEditando(item.id);
    setValorEdicion(String(item.cantidad));
  }

  async function guardarEdicion(item) {
    const cantidad = Number(valorEdicion);
    setEditando(null);
    if (!Number.isInteger(cantidad) || cantidad <= 0) return;
    if (cantidad === item.cantidad) return;
    try {
      const actualizada = await api.editarCaptura(item.id, cantidad);
      setCapturas((actuales) => actuales.map((c) => (c.id === item.id ? actualizada : c)));
    } catch (error) {
      manejarErrorCaptura(error);
    }
  }

  async function eliminarFila(item) {
    try {
      await api.eliminarCaptura(item.id);
      setCapturas((actuales) => actuales.filter((c) => c.id !== item.id));
    } catch (error) {
      manejarErrorCaptura(error);
    }
  }

  async function guardarNombreTax() {
    try {
      const actualizado = await api.renombrarTax(tax.id, nombreTaxInput.trim());
      setEditandoNombreTax(false);
      onCambiarTax(actualizado);
    } catch {
      mostrarToast('No se pudo guardar el nombre del tax', 'error');
    }
  }

  async function cerrarTax() {
    if (!window.confirm(`¿Cerrar tax ${tax.numero_tax} con ${totalUnidades} unidad${totalUnidades === 1 ? '' : 'es'}? Ya no vas a poder agregar más ahí a menos que lo reabras.`)) return;
    try {
      await api.cerrarTax(tax.id);
      mostrarToast('Tax cerrado', 'ok');
      onVolver();
    } catch {
      mostrarToast('No se pudo cerrar el tax', 'error');
    }
  }

  async function solicitarModificacion() {
    try {
      await api.solicitarModificacion(participante.id, tax.numero_tax);
      mostrarToast('Se avisó al administrador', 'ok');
    } catch {
      mostrarToast('No se pudo avisar al administrador', 'error');
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

  const totalUnidades = listaMostrada.reduce((acc, i) => acc + i.cantidad, 0);

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

        {inventarioCerrado && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: '10px 12px', marginBottom: 16, fontSize: 13, color: 'var(--texto-tenue)' }}>
            <IconoAlerta tamano={16} />
            {acceso.inventario.verificado_en
              ? 'Este inventario está cerrado y verificado por el admin — podés ver lo capturado pero no modificarlo.'
              : 'El admin cerró este inventario — podés ver lo capturado pero no modificarlo hasta que lo reabra.'}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
          <button className="btn-texto" style={{ padding: 0 }} onClick={onVolver}>
            ‹ Inicio (ver totales)
          </button>
          {inventarioCerrado && (
            <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={solicitarModificacion}>
              Solicitar modificación al admin
            </button>
          )}
        </div>

        {misTax.length > 1 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 10 }}>
            {misTax.map((t) => (
              <button
                key={t.tax_id}
                onClick={() => onCambiarTax({ id: t.tax_id, numero_tax: t.numero_tax, nombre: t.nombre, estado: t.estado })}
                className="btn-chico"
                title={t.nombre || undefined}
                style={{
                  flexShrink: 0,
                  borderRadius: 8,
                  border: '1px solid var(--borde)',
                  background: t.tax_id === tax.id ? 'var(--primario)' : 'var(--fondo-tarjeta)',
                  color: t.tax_id === tax.id ? 'white' : 'var(--texto)',
                  fontWeight: 700,
                }}
              >
                Tax {t.numero_tax}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.3em', fontWeight: 700 }}>Tax {tax.numero_tax}</h1>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--texto-tenue)' }}>{participante.nombre || participante.alias}</p>
              {editandoNombreTax ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                  <input
                    className="campo"
                    style={{ marginBottom: 0, padding: '6px 10px', fontSize: 12, width: 160 }}
                    placeholder="Nombre o ubicación"
                    value={nombreTaxInput}
                    onChange={(e) => setNombreTaxInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && guardarNombreTax()}
                    autoFocus
                  />
                  <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={guardarNombreTax}>Guardar</button>
                  <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={() => setEditandoNombreTax(false)}>Cancelar</button>
                </div>
              ) : (
                <p
                  style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--primario)', cursor: soloLectura ? 'default' : 'pointer' }}
                  onClick={() => !soloLectura && setEditandoNombreTax(true)}
                >
                  {tax.nombre || (!soloLectura && '+ Agregar nombre o ubicación')}
                </p>
              )}
            </div>
            <div style={{ textAlign: 'center', background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: '6px 14px' }}>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{totalUnidades}</div>
              <div style={{ fontSize: 10, color: 'var(--texto-tenue)', textTransform: 'uppercase' }}>
                unidad{totalUnidades === 1 ? '' : 'es'}
              </div>
            </div>
          </div>
          {!soloLectura && (
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
        ) : listaMostrada.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>
            {soloLectura ? 'Este tax no tiene artículos.' : 'Escanea o ingresa un artículo para empezar.'}
          </p>
        ) : (
          <div className="lista-capturas">
            {listaMostrada.map((item) => {
              const clave = item.id ?? item.idLocal ?? `${item.codigo}-${item.talla}`;
              const seEstaEditando = editando === item.id;
              const pendiente = item.reconocido === null;
              const colorBorde = pendiente ? 'var(--borde)' : item.reconocido ? 'var(--exito)' : '#DC2626';
              // agruparCapturas no conserva el flag "offline" (solo lo que
              // el backend devuelve), así que se detecta acá mismo mirando
              // la cola pendiente de subir.
              const enColaOffline = cola.some((c) => c.codigo === item.codigo && c.talla === item.talla);
              return (
                <div className="item-captura" key={clave} style={{ border: `2px solid ${colorBorde}` }}>
                  <div className="item-captura-fila">
                    <span className="item-captura-codigo">{formatearCodigo(item.codigo)}</span>
                    <span className="item-captura-sku">SKU: {etiquetaTalla(item)}</span>
                    <span className="item-captura-cant">
                      cant:{' '}
                      {!soloLectura && !pendiente && seEstaEditando ? (
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
                          style={{ cursor: soloLectura || pendiente ? 'default' : 'pointer' }}
                          title={pendiente ? undefined : 'Tocar para editar la cantidad'}
                          onClick={() => !soloLectura && !pendiente && empezarEdicion(item)}
                        >
                          {item.cantidad}
                        </strong>
                      )}
                    </span>
                    {!soloLectura && !pendiente && (
                      <button
                        onClick={() => eliminarFila(item)}
                        title="Eliminar"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-suave)', flexShrink: 0, display: 'flex' }}
                      >
                        <IconoEliminar tamano={16} />
                      </button>
                    )}
                  </div>
                  <div className="descripcion-linea">
                    {pendiente ? (enColaOffline ? 'Pendiente de subir…' : 'Verificando…') : item.descripcion || 'Artículo no reconocido'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!soloLectura && (
        <button className="boton-flotante" onClick={() => setMostrarManual(true)} title="Ingresar código manualmente">
          <IconoEscanear />
        </button>
      )}

      {mostrarManual && (
        <div className="fondo-hoja" onClick={() => setMostrarManual(false)}>
          <div className="hoja" onClick={(e) => e.stopPropagation()}>
            {/* Fijo arriba de la hoja (no se va con el scroll ni queda tapado
                por el teclado en el celular) para poder revisar de un
                vistazo qué se está por agregar, sin tener que bajar. */}
            <div className="hoja-fija-arriba">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Ingresar manualmente</h3>
                <button onClick={() => setMostrarManual(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-tenue)' }}>
                  <IconoCerrar tamano={20} />
                </button>
              </div>
              <div className="resumen-ingreso-manual">
                <strong>{codigoManual ? formatearCodigo(codigoManual) : 'Código —'}</strong>
                <span>
                  Talla{' '}
                  <strong>
                    {tallaManual ? previaManual?.tallaReal || (tallaManual === '01' ? 'única' : `${tallaManual}*`) : '—'}
                  </strong>
                </span>
                <span>
                  Cant. <strong>{cantidadManual || '—'}</strong>
                </span>
              </div>
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

            {tallasDisponibles && tallasDisponibles.length > 0 ? (
              <>
                <label className="etiqueta">Talla ({tallasDisponibles.length} disponible{tallasDisponibles.length === 1 ? '' : 's'})</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {tallasDisponibles.map((t) => {
                    const etiqueta = t.tallaReal || (t.tallaUnica ? 'única' : `${t.tallaCruda}*`);
                    const activa = tallaManual === t.tallaCruda;
                    return (
                      <button
                        key={t.tallaCruda}
                        onClick={() => setTallaManual(t.tallaCruda)}
                        className="btn-chico"
                        style={{
                          borderRadius: 8,
                          border: '1px solid var(--borde)',
                          background: activa ? 'var(--primario)' : 'var(--fondo-tarjeta)',
                          color: activa ? 'white' : 'var(--texto)',
                          fontWeight: 700,
                        }}
                      >
                        {etiqueta}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <label className="etiqueta">
                  Talla{tallasDisponibles && /^\d{7}$/.test(codigoManual) ? ' (artículo no está en el maestro, ingrésala a mano)' : ''}
                </label>
                <input
                  className="campo"
                  inputMode="numeric"
                  maxLength={2}
                  value={tallaManual}
                  onChange={(e) => setTallaManual(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && confirmarManual()}
                />
              </>
            )}

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

            <label className="etiqueta">Cantidad</label>
            <input
              className="campo"
              type="number"
              inputMode="numeric"
              min={1}
              value={cantidadManual}
              onChange={(e) => setCantidadManual(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmarManual()}
            />

            <button
              className="btn btn-primario"
              onClick={confirmarManual}
              disabled={!/^\d{7}$/.test(codigoManual) || !tallaManual || !(Number(cantidadManual) > 0)}
            >
              Agregar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
