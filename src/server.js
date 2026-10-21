require('dotenv').config();
const express = require('express');
const publicRoutes = require('./publicRoutes');
const userRoutes = require('./userRoutes');
const { getPool } = require('./db');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET nao definido. Crie o arquivo .env (veja .env.example).');
  process.exit(1);
}

const app = express();
app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'ok', api: 'demo-flight' }));

app.use('/', publicRoutes); // /login e consultas (publicas)
app.use('/users', userRoutes); // CRUD de sys_user (privado, JWT)

app.use((req, res) => res.status(404).json({ error: 'Rota nao encontrada.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalido.' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API rodando em http://localhost:${port}`));

// Testa a conexao com o SQL Server ja na inicializacao (a API continua de pe se falhar)
getPool()
  .then(() => console.log('Conectado ao SQL Server.'))
  .catch((err) => console.error('Falha ao conectar ao SQL Server:', err.message));
