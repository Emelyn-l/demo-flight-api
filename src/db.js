require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 1433,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  pool: { max: 20, min: 0, idleTimeoutMillis: 30000 },
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
  },
};

let poolPromise;
function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect().catch((err) => {
      poolPromise = undefined; // permite tentar de novo na proxima requisicao
      throw err;
    });
  }
  return poolPromise;
}

// Executa uma consulta com parametros posicionais: @p1, @p2, ...
async function query(text, params = []) {
  const pool = await getPool();
  const request = pool.request();
  params.forEach((value, i) => request.input(`p${i + 1}`, value));
  const result = await request.query(text);
  return { rows: result.recordset || [], rowCount: result.rowsAffected[0] || 0 };
}

module.exports = { query, getPool };
