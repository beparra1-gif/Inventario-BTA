import { useEffect, useState } from 'react';
import { api } from './api.js';
import { ToastProvider } from './contexto/ToastContext.jsx';
import { useEstadoPersistente } from './hooks/useEstadoPersistente.js';
import { PantallaAcceso } from './pantallas/PantallaAcceso.jsx';
import { PantallaParticipante } from './pantallas/PantallaParticipante.jsx';
import { PantallaTaxes } from './pantallas/PantallaTaxes.jsx';
import { PantallaCaptura } from './pantallas/PantallaCaptura.jsx';
import { AdminLogin } from './pantallas/AdminLogin.jsx';
import { AdminDashboard } from './pantallas/AdminDashboard.jsx';
import { CambiarPassword } from './pantallas/CambiarPassword.jsx';
import './estilos/app.css';

function FlujoCaptura({ onIrAdmin }) {
  const [acceso, setAcceso] = useEstadoPersistente('inv-bta:acceso', null);
  const [participante, setParticipante] = useEstadoPersistente('inv-bta:participante', null);
  const [tax, setTax] = useEstadoPersistente('inv-bta:tax', null);
  const [verificando, setVerificando] = useState(true);

  // La sesión queda guardada hasta 24h (ver useEstadoPersistente), pero el
  // estado del inventario cacheado puede haber cambiado mientras tanto — el
  // admin lo cerró, o lo volvió a abrir. Se revalida por id (no por "hay
  // algo abierto en esta tienda") para que si lo cierran el capturador NO
  // quede afuera: se queda viendo lo que ya tenía, en modo solo lectura
  // (ver PantallaTaxes/PantallaCaptura), hasta que el admin lo reabra. Solo
  // se vuelve a pedir la tienda si el inventario ya no existe (lo borraron).
  useEffect(() => {
    if (!acceso) { setVerificando(false); return; }
    let cancelado = false;
    (async () => {
      try {
        const inventarioVigente = await api.obtenerInventario(acceso.inventario.id);
        if (cancelado) return;
        if (inventarioVigente.estado !== acceso.inventario.estado) {
          setAcceso({ ...acceso, inventario: inventarioVigente });
        }
      } catch {
        if (cancelado) return;
        setAcceso(null);
        setParticipante(null);
        setTax(null);
      } finally {
        if (!cancelado) setVerificando(false);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (verificando) return null;

  if (!acceso) return <PantallaAcceso onAcceso={setAcceso} onIrAdmin={onIrAdmin} />;

  if (!participante) {
    return (
      <PantallaParticipante acceso={acceso} onListo={setParticipante} onVolver={() => setAcceso(null)} />
    );
  }

  if (!tax) {
    return (
      <PantallaTaxes
        acceso={acceso}
        participante={participante}
        onAbrirTax={setTax}
        onSalir={() => { setAcceso(null); setParticipante(null); setTax(null); }}
      />
    );
  }

  // Un tax "cerrado" también se renderiza acá (no vuelve solo al inicio):
  // PantallaCaptura ya sabe mostrarse en modo solo lectura para ese caso —
  // así el panel de navegación puede saltar a ver/corroborar cualquier tax,
  // esté abierto o cerrado, sin que la pantalla lo rebote de vuelta.
  return (
    <PantallaCaptura
      acceso={acceso}
      participante={participante}
      tax={tax}
      onCambiarTax={setTax}
      onVolver={() => setTax(null)}
    />
  );
}

function PanelAdmin({ onVolver }) {
  const [admin, setAdmin] = useEstadoPersistente('inv-bta:admin', null);
  if (!admin) return <AdminLogin onLogin={setAdmin} onVolver={onVolver} />;
  if (admin.debeCambiarPassword) return <CambiarPassword admin={admin} onListo={setAdmin} />;
  return <AdminDashboard admin={admin} onSalir={() => setAdmin(null)} onActualizarAdmin={setAdmin} />;
}

function App() {
  const [modoAdmin, setModoAdmin] = useEstadoPersistente('inv-bta:modo-admin', false);

  return (
    <ToastProvider>
      {modoAdmin ? (
        <PanelAdmin onVolver={() => setModoAdmin(false)} />
      ) : (
        <FlujoCaptura onIrAdmin={() => setModoAdmin(true)} />
      )}
    </ToastProvider>
  );
}

export default App;
