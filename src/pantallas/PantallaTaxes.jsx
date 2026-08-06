import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { EncabezadoInventario } from '../componentes/EncabezadoInventario.jsx';
import { IconoAlerta } from '../componentes/Iconos.jsx';

// Perfil del capturador: cuánto lleva en total, el detalle de cada tax que
// haya tocado (para ver de un vistazo qué le falta) y una alerta si tiene
// artículos sin reconocer, antes de seguir capturando.
export function PantallaTaxes({ acceso, participante, onAbrirTax, onSalir }) {
  const mostrarToast = useToast();
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarElegirNumero, setMostrarElegirNumero] = useState(false);
  const [numeroElegido, setNumeroElegido] = useState(participante.tax_min);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    try {
      const resumenParticipante = await api.resumenParticipante(participante.id);
      setResumen(resumenParticipante);
      const usados = resumenParticipante.taxes.map((t) => t.numero_tax);
      const siguiente = Array.from(
        { length: participante.tax_max - participante.tax_min + 1 },
        (_, i) => participante.tax_min + i
      ).find((n) => !usados.includes(n));
      setNumeroElegido(siguiente ?? participante.tax_min);
    } finally {
      setCargando(false);
    }
  }

  async function abrir(numero) {
    try {
      const tax = await api.abrirTax(participante.id, numero);
      onAbrirTax(tax);
    } catch (error) {
      if (error.info?.error === 'inventario_cerrado') {
        mostrarToast('El admin cerró este inventario — ya no se puede seguir capturando', 'error');
      } else if (error.info?.error === 'tax_ya_usado_por_otro_participante') {
        mostrarToast('Ese número de tax ya lo está usando otra persona', 'error');
      } else {
        mostrarToast('No se pudo abrir el tax', 'error');
      }
    }
  }

  const rango = useMemo(
    () => Array.from({ length: participante.tax_max - participante.tax_min + 1 }, (_, i) => participante.tax_min + i),
    [participante]
  );

  return (
    <div className="pantalla">
      <EncabezadoInventario tienda={acceso.tienda} inventario={acceso.inventario} />
      <div className="contenedor">
        <div className="tarjeta">
          <h1 className="titulo-pantalla">Hola, {participante.nombre || participante.alias}</h1>

          {cargando ? (
            <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Cargando...</p>
          ) : (
            <>
              {resumen && resumen.totalUnidades > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <div style={{ flex: 1, textAlign: 'center', background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{resumen.totalUnidades}</div>
                    <div style={{ fontSize: 11, color: 'var(--texto-tenue)', textTransform: 'uppercase' }}>Capturadas en total</div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', background: resumen.filasNoReconocidas > 0 ? '#FEE2E2' : 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: resumen.filasNoReconocidas > 0 ? '#B91C1C' : 'inherit' }}>
                      {resumen.unidadesNoReconocidas}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--texto-tenue)', textTransform: 'uppercase' }}>Sin reconocer</div>
                  </div>
                </div>
              )}

              {resumen?.filasNoReconocidas > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 12px', marginBottom: 16, fontSize: 13, color: '#92400E' }}>
                  <IconoAlerta tamano={16} />
                  Tienes artículos sin reconocer — revísalos antes de cerrar tus tax.
                </div>
              )}

              {resumen?.taxes.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <label className="etiqueta">Tus tax</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {resumen.taxes.map((t) => (
                      <div key={t.tax_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: '10px 12px' }}>
                        <div>
                          <strong>Tax {t.numero_tax}</strong>
                          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--texto-tenue)' }}>
                            {t.unidades} unidad{t.unidades === 1 ? '' : 'es'}
                            {t.unidades_no_reconocidas > 0 && ` · ${t.unidades_no_reconocidas} sin reconocer`}
                          </span>
                        </div>
                        {t.estado === 'abierto' ? (
                          <button className="btn-texto" style={{ padding: 0 }} onClick={() => onAbrirTax({ id: t.tax_id, numero_tax: t.numero_tax, estado: t.estado })}>
                            Continuar
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--texto-suave)', textTransform: 'uppercase', fontWeight: 700 }}>Cerrado</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button className="btn btn-primario" onClick={() => abrir(numeroElegido)}>
                Empezar tax {numeroElegido}
              </button>

              <button className="btn-texto" style={{ display: 'block', margin: '12px auto 0' }} onClick={() => setMostrarElegirNumero((v) => !v)}>
                {mostrarElegirNumero ? 'Ocultar' : 'Elegir otro número de tax'}
              </button>

              {mostrarElegirNumero && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {rango.map((n) => {
                      const t = resumen?.taxes.find((tx) => tx.numero_tax === n);
                      const cerrado = t?.estado === 'cerrado';
                      const activo = n === numeroElegido;
                      return (
                        <button
                          key={n}
                          disabled={cerrado}
                          onClick={() => setNumeroElegido(n)}
                          className="btn-chico"
                          style={{
                            borderRadius: 8,
                            border: '1px solid var(--borde)',
                            background: activo ? 'var(--primario)' : cerrado ? 'var(--fondo-sutil)' : 'var(--fondo-tarjeta)',
                            color: activo ? 'white' : cerrado ? 'var(--texto-suave)' : 'var(--texto)',
                            fontWeight: 700,
                            textDecoration: cerrado ? 'line-through' : 'none',
                          }}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  <button className="btn btn-secundario" onClick={() => abrir(numeroElegido)}>
                    Abrir tax {numeroElegido}
                  </button>
                </div>
              )}
            </>
          )}

          <button className="btn-texto" style={{ display: 'block', margin: '16px auto 0' }} onClick={onSalir}>
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}
