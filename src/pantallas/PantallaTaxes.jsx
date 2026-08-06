import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';
import { formatearFecha } from '../utilidades/fecha.js';

export function PantallaTaxes({ acceso, participante, onAbrirTax, onSalir }) {
  const mostrarToast = useToast();
  const [taxes, setTaxes] = useState([]);
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
      const [listaTaxes, resumenParticipante] = await Promise.all([
        api.taxesDeParticipante(participante.id),
        api.resumenParticipante(participante.id),
      ]);
      setTaxes(listaTaxes);
      setResumen(resumenParticipante);
      const usados = listaTaxes.map((t) => t.numero_tax);
      const siguiente = Array.from(
        { length: participante.tax_max - participante.tax_min + 1 },
        (_, i) => participante.tax_min + i
      ).find((n) => !usados.includes(n));
      setNumeroElegido(siguiente ?? participante.tax_min);
    } finally {
      setCargando(false);
    }
  }

  const taxAbierto = taxes.find((t) => t.estado === 'abierto');

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
      <div className="contenedor">
        <div className="tarjeta">
          <div style={{ textAlign: 'center', marginBottom: 16, fontSize: 12, color: 'var(--texto-tenue)' }}>
            {acceso.tienda.edp} · {acceso.tienda.glosa}
            {acceso.inventario.numero_inventario && <> · inv. {acceso.inventario.numero_inventario}</>}
            {formatearFecha(acceso.inventario.creado_en) && <> · {formatearFecha(acceso.inventario.creado_en)}</>}
          </div>

          <h1 className="titulo-pantalla">Hola, {participante.alias}</h1>

          {cargando ? (
            <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Cargando...</p>
          ) : (
            <>
              {resumen && resumen.totalUnidades > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  <div style={{ flex: 1, textAlign: 'center', background: 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{resumen.totalUnidades}</div>
                    <div style={{ fontSize: 11, color: 'var(--texto-tenue)', textTransform: 'uppercase' }}>Capturadas</div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', background: resumen.filasNoReconocidas > 0 ? '#FEE2E2' : 'var(--fondo-sutil)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: resumen.filasNoReconocidas > 0 ? '#B91C1C' : 'inherit' }}>
                      {resumen.unidadesNoReconocidas}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--texto-tenue)', textTransform: 'uppercase' }}>Con error</div>
                  </div>
                </div>
              )}

              {taxAbierto ? (
                <button className="btn btn-primario" onClick={() => onAbrirTax(taxAbierto)}>
                  Continuar capturando (tax {taxAbierto.numero_tax})
                </button>
              ) : (
                <button className="btn btn-primario" onClick={() => abrir(numeroElegido)}>
                  Empezar a capturar (tax {numeroElegido})
                </button>
              )}

              <button className="btn-texto" style={{ display: 'block', margin: '12px auto 0' }} onClick={() => setMostrarElegirNumero((v) => !v)}>
                {mostrarElegirNumero ? 'Ocultar' : 'Elegir otro número de tax'}
              </button>

              {mostrarElegirNumero && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {rango.map((n) => {
                      const t = taxes.find((tx) => tx.numero_tax === n);
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
                  {!taxAbierto && (
                    <button className="btn btn-secundario" onClick={() => abrir(numeroElegido)}>
                      Abrir tax {numeroElegido}
                    </button>
                  )}
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
