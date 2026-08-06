import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';

export function PantallaTaxes({ acceso, participante, onAbrirTax, onSalir }) {
  const mostrarToast = useToast();
  const [taxes, setTaxes] = useState([]);
  const [numeroElegido, setNumeroElegido] = useState(participante.tax_min);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarTaxes();
  }, []);

  async function cargarTaxes() {
    setCargando(true);
    try {
      const lista = await api.taxesDeParticipante(participante.id);
      setTaxes(lista);
      const usados = lista.map((t) => t.numero_tax);
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
      mostrarToast(error.info?.error === 'tax_ya_usado_por_otro_participante'
        ? 'Ese número de tax ya lo está usando otra persona'
        : 'No se pudo abrir el tax', 'error');
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
          <h1 className="titulo-pantalla">Hola, {participante.alias}</h1>
          <p className="subtitulo">Tu rango de tax: {participante.tax_min} – {participante.tax_max}</p>

          {cargando ? (
            <p style={{ textAlign: 'center', color: 'var(--texto-tenue)' }}>Cargando...</p>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {rango.map((n) => {
                  const tax = taxes.find((t) => t.numero_tax === n);
                  const cerrado = tax?.estado === 'cerrado';
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

              <button className="btn btn-primario" onClick={() => abrir(numeroElegido)}>
                Abrir tax {numeroElegido}
              </button>
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
