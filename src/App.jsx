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
    />
  );
}

function PanelAdmin({ onVolver }) {
  const [admin, setAdmin] = useEstadoPersistente('inv-bta:admin', null);
  if (!admin) return <AdminLogin onLogin={setAdmin} onVolver={onVolver} />;
  if (admin.debeCambiarPassword) return <CambiarPassword admin={admin} onListo={setAdmin} />;
  return <AdminDashboard admin={admin} onSalir={() => setAdmin(null)} />;
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
