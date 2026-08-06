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
  // inventario que quedó cacheado puede haber cambiado mientras tanto: el
  // admin lo cerró y abrió uno nuevo para la misma tienda, o simplemente ya
  // no queda ninguno abierto. Sin esto, el capturador queda "atrapado"
  // viendo/usando un inventario viejo y todo le falla con un error confuso.
  useEffect(() => {
    if (!acceso) { setVerificando(false); return; }
    let cancelado = false;
    (async () => {
      try {
        const inventarioVigente = await api.inventarioAbiertoPorEdp(acceso.tienda.edp);
        if (cancelado) return;
        if (inventarioVigente.id !== acceso.inventario.id) {
          setAcceso({ ...acceso, inventario: inventarioVigente });
          setParticipante(null);
          setTax(null);
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

  if (!tax || tax.estado === 'cerrado') {
    return (
      <PantallaTaxes
        acceso={acceso}
        participante={participante}
        onAbrirTax={setTax}
        onSalir={() => { setAcceso(null); setParticipante(null); setTax(null); }}
      />
    );
  }

  return (
    <PantallaCaptura
      acceso={acceso}
      participante={participante}
      tax={tax}
      onCerrarTax={setTax}
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
