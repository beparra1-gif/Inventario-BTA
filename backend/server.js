import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import rutasMaestros from './routes/maestros.js';
import rutasAuth from './routes/auth.js';
import rutasTiendas from './routes/tiendas.js';
import rutasInventarios from './routes/inventarios.js';
import rutasParticipantes from './routes/participantes.js';
import rutasTaxes from './routes/taxes.js';
import rutasCapturas from './routes/capturas.js';
import rutasArticulos from './routes/articulos.js';
import rutasAuditoria from './routes/auditoria.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

const origenesPermitidos = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const corsOptions = { origin: origenesPermitidos.length ? origenesPermitidos : true };

const io = new Server(server, { cors: corsOptions });
app.locals.io = io;

// Los clientes se unen a una room por inventario para recibir en vivo las
// capturas/taxes de esa tienda (dashboard admin y captura de otros taxes).
io.on('connection', (socket) => {
  socket.on('unirse-inventario', (inventarioId) => {
    socket.join(`inventario:${inventarioId}`);
  });
  // El panel admin se suscribe acá para ver el avance de la carga de
  // productos_maestro (593k filas) mientras corre en segundo plano.
  socket.on('unirse-admin', () => {
    socket.join('admin');
  });
});

app.use(cors(corsOptions));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/maestros', rutasMaestros);
app.use('/api/auth', rutasAuth);
app.use('/api/tiendas', rutasTiendas);
app.use('/api/inventarios', rutasInventarios);
app.use('/api/participantes', rutasParticipantes);
app.use('/api/taxes', rutasTaxes);
app.use('/api/capturas', rutasCapturas);
app.use('/api/articulos', rutasArticulos);
app.use('/api/auditoria', rutasAuditoria);

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'error_interno' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Backend Inventario-BTA escuchando en puerto ${PORT}`));
