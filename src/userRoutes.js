const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { authenticate, requireAdmin } = require('./auth');

const router = express.Router();
router.use(authenticate); // todas as rotas abaixo exigem token JWT

const PUBLIC_COLUMNS = 'id, name, login_email, user_type';
const OUTPUT_COLUMNS = 'INSERTED.id, INSERTED.name, INSERTED.login_email, INSERTED.user_type';
const USER_TYPES = ['admin', 'regular'];

const isAdmin = (req) => req.user.user_type === 'admin';
const canAccess = (req, id) => isAdmin(req) || req.user.id === id;

function parseId(req, res) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'ID invalido.' });
    return null;
  }
  return id;
}

function handleDbError(err, res, next) {
  // 2627/2601 = violacao de UNIQUE; 547 = violacao de CHECK/FK
  if (err.number === 2627 || err.number === 2601) return res.status(409).json({ error: 'Ja existe um usuario com esse login_email.' });
  if (err.number === 547) return res.status(400).json({ error: "user_type deve ser 'admin' ou 'regular'." });
  next(err);
}

// LISTAR: admin ve todos; regular ve apenas o proprio cadastro
router.get('/', async (req, res, next) => {
  try {
    const { rows } = isAdmin(req)
      ? await db.query(`SELECT ${PUBLIC_COLUMNS} FROM sys_user ORDER BY id`)
      : await db.query(`SELECT ${PUBLIC_COLUMNS} FROM sys_user WHERE id = @p1`, [req.user.id]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// CONSULTAR UM
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    if (!canAccess(req, id)) return res.status(403).json({ error: 'Voce so pode acessar os seus proprios dados.' });
    const { rows } = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM sys_user WHERE id = @p1`, [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuario nao encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// CRIAR: somente admin
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { name, login_email, password, user_type } = req.body || {};
    if (!name || !login_email || !password || !user_type) {
      return res.status(400).json({ error: 'Informe name, login_email, password e user_type.' });
    }
    if (!USER_TYPES.includes(user_type)) {
      return res.status(400).json({ error: "user_type deve ser 'admin' ou 'regular'." });
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO sys_user (name, login_email, password, user_type)
       OUTPUT ${OUTPUT_COLUMNS}
       VALUES (@p1, @p2, @p3, @p4)`,
      [name, login_email, hash, user_type]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    handleDbError(err, res, next);
  }
});

// ATUALIZAR: admin altera qualquer um; regular altera somente os proprios dados (e nao o user_type)
// PUT exige name e login_email; PATCH aceita atualizacao parcial.
async function updateUser(req, res, next) {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    if (!canAccess(req, id)) return res.status(403).json({ error: 'Voce so pode alterar os seus proprios dados.' });

    const { name, login_email, password, user_type } = req.body || {};

    if (req.method === 'PUT' && (!name || !login_email)) {
      return res.status(400).json({ error: 'PUT exige name e login_email (use PATCH para atualizacao parcial).' });
    }
    if (user_type !== undefined) {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Apenas admin pode alterar user_type.' });
      if (!USER_TYPES.includes(user_type)) {
        return res.status(400).json({ error: "user_type deve ser 'admin' ou 'regular'." });
      }
    }

    const fields = [];
    const values = [];
    const add = (column, value) => {
      values.push(value);
      fields.push(`${column} = @p${values.length}`);
    };
    if (name !== undefined) add('name', name);
    if (login_email !== undefined) add('login_email', login_email);
    if (password !== undefined) add('password', await bcrypt.hash(password, 10));
    if (user_type !== undefined) add('user_type', user_type);

    if (fields.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

    values.push(id);
    const { rows } = await db.query(
      `UPDATE sys_user SET ${fields.join(', ')} OUTPUT ${OUTPUT_COLUMNS} WHERE id = @p${values.length}`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuario nao encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    handleDbError(err, res, next);
  }
}
router.put('/:id', updateUser);
router.patch('/:id', updateUser);

// EXCLUIR: somente admin (nao pode excluir a propria conta, para evitar ficar sem admin)
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    if (id === req.user.id) return res.status(400).json({ error: 'Voce nao pode excluir a sua propria conta.' });
    const { rowCount } = await db.query('DELETE FROM sys_user WHERE id = @p1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Usuario nao encontrado.' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
