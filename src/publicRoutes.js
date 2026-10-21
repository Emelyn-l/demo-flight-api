const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { signToken } = require('./auth');

const router = express.Router();

// ---------- LOGIN ----------
function samePlain(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

router.post('/login', async (req, res, next) => {
  try {
    const { login_email, password } = req.body || {};
    if (!login_email || !password) {
      return res.status(400).json({ error: 'Informe login_email e password.' });
    }
    const { rows } = await db.query('SELECT * FROM sys_user WHERE login_email = @p1', [login_email]);
    const user = rows[0];

    let ok = false;
    if (user) {
      if (user.password.startsWith('$2')) {
        ok = await bcrypt.compare(password, user.password);
      } else if (samePlain(password, user.password)) {
        // Senha legada em texto puro (do script SQL): aceita e converte para hash
        ok = true;
        const hash = await bcrypt.hash(password, 10);
        await db.query('UPDATE sys_user SET password = @p1 WHERE id = @p2', [hash, user.id]);
      }
    }
    if (!ok) return res.status(401).json({ error: 'Credenciais invalidas.' });

    res.json({
      token: signToken(user),
      user: { id: user.id, name: user.name, login_email: user.login_email, user_type: user.user_type },
    });
  } catch (err) {
    next(err);
  }
});

// ---------- CONSULTAS (GET) ----------
// Paginacao opcional: ?limit=100&offset=0 (sem limit, retorna todos os registros)
function pagination(query) {
  const limit = parseInt(query.limit, 10);
  const offset = parseInt(query.offset, 10);
  if (Number.isNaN(limit) || limit <= 0) return { clause: '', params: [] };
  return {
    // SQL Server: OFFSET/FETCH exige ORDER BY (todas as consultas abaixo ja ordenam)
    clause: ' OFFSET @p1 ROWS FETCH NEXT @p2 ROWS ONLY',
    params: [Number.isNaN(offset) || offset < 0 ? 0 : offset, limit],
  };
}

function readOnlyResource(path, table, idColumn) {
  router.get(`/${path}`, async (req, res, next) => {
    try {
      const { clause, params } = pagination(req.query);
      const { rows } = await db.query(`SELECT * FROM ${table} ORDER BY ${idColumn}${clause}`, params);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.get(`/${path}/:id`, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: 'ID invalido.' });
      const { rows } = await db.query(`SELECT * FROM ${table} WHERE ${idColumn} = @p1`, [id]);
      if (!rows[0]) return res.status(404).json({ error: 'Registro nao encontrado.' });
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  });
}

// A rota de JOIN deve vir antes de /boarding-pass/:id para nao ser capturada por ela
router.get('/boarding-pass-details', async (req, res, next) => {
  try {
    const { clause, params } = pagination(req.query);
    const sql = `
      SELECT
        bp.boarding_pass_id AS boarding_pass_id,
        bp.seat_number AS seat_number,
        bp.issue_time AS issue_time,
        p.first_name AS passenger_first_name,
        p.last_name AS passenger_last_name,
        p.birth_date AS passenger_birth_date,
        p.passport_number AS passenger_passport_number,
        f.flight_number AS flight_number,
        f.departure_airport AS departure_airport,
        f.arrival_airport AS arrival_airport,
        f.departure_time AS departure_time,
        f.arrival_time AS arrival_time,
        a.model AS aircraft_model,
        a.manufacturer AS aircraft_manufacturer,
        a.capacity AS aircraft_capacity
      FROM boarding_pass bp
      JOIN passenger p ON bp.passenger_id = p.passenger_id
      JOIN flight f ON bp.flight_id = f.flight_id
      JOIN aircraft a ON f.aircraft_id = a.aircraft_id
      ORDER BY bp.boarding_pass_id${clause}`;
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

readOnlyResource('aircraft', 'aircraft', 'aircraft_id');
readOnlyResource('passengers', 'passenger', 'passenger_id');
readOnlyResource('flights', 'flight', 'flight_id');
readOnlyResource('boarding-pass', 'boarding_pass', 'boarding_pass_id');

module.exports = router;
