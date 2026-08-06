import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const urlCruda = process.env.DATABASE_URL || '';
const esLocal = urlCruda.includes('localhost') || urlCruda.includes('127.0.0.1');
const urlSinSslmode = urlCruda.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');

const pool = new Pool({
  connectionString: urlSinSslmode,
  ssl: esLocal ? false : { rejectUnauthorized: false },
});

export default pool;
