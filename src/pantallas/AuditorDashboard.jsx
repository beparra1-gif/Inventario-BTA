import { AuditoriaPanel } from './AuditoriaPanel.jsx';

// Rol de solo consulta + validación: el auditor ve inventarios/tax pero no
// puede crear, cerrar, borrar ni administrar nada de eso (el backend igual
// lo bloquea aparte, esto es solo para no ofrecerle botones que fallarían).
// El mismo contenido (AuditoriaPanel) también vive embebido directamente en
// AdminDashboard, para que admin/superadmin no tengan que crear ni entrar
// con una cuenta aparte solo para auditar.
export function AuditorDashboard({ admin, onSalir }) {
  return (
    <div className="pantalla" style={{ alignItems: 'stretch' }}>
      <div className="contenedor-ancho">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: '1.4em' }}>Panel de auditoría</h1>
          <button className="btn-texto" onClick={onSalir}>Salir</button>
        </div>
        <AuditoriaPanel adminId={admin.id} />
      </div>
    </div>
  );
}
