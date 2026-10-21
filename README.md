# API demo-flight (Node.js + Express + SQL Server + JWT)

## Como executar
1. Crie o banco rodando `sql_server_demo_flight_db.sql` (script do professor) no SSMS,
   ou com `sqlcmd -S localhost -U sa -P senha -i sql_server_demo_flight_db.sql`.
   O SQL Server precisa aceitar conexoes TCP/IP na porta 1433 e login por usuario/senha (modo misto).
2. `npm install`
3. Copie `.env.example` para `.env` e preencha usuario/senha do banco e o `JWT_SECRET`.
4. `npm start` (ou `npm run dev` com nodemon).

## Rotas

### Publicas
| Metodo | Rota | Descricao |
|---|---|---|
| POST | `/login` | Body `{ "login_email", "password" }` -> retorna `token` JWT |
| GET | `/aircraft`, `/aircraft/:id` | Aeronaves |
| GET | `/passengers`, `/passengers/:id` | Passageiros |
| GET | `/flights`, `/flights/:id` | Voos |
| GET | `/boarding-pass`, `/boarding-pass/:id` | Cartoes de embarque |
| GET | `/boarding-pass-details` | JOIN: cartao + passageiro + voo + aeronave |

As listagens aceitam paginacao opcional: `?limit=100&offset=0`. Sem `limit`, retornam todos os registros.

### Privadas (header `Authorization: Bearer <token>`)
| Metodo | Rota | Permissao |
|---|---|---|
| GET | `/users` | admin: todos; regular: apenas o proprio |
| GET | `/users/:id` | admin: qualquer; regular: o proprio |
| POST | `/users` | somente admin |
| PUT / PATCH | `/users/:id` | admin: qualquer; regular: apenas o proprio (sem alterar `user_type`) |
| DELETE | `/users/:id` | somente admin (nao exclui a si mesmo) |

PUT exige `name` e `login_email`; PATCH aceita campos parciais.

## Senhas
O script SQL insere senhas em texto puro (`12345`). A API aceita esse login e converte a senha para hash bcrypt
automaticamente no primeiro acesso. Usuarios criados/alterados pela API ja ficam com hash.

## Exemplos (curl)
```bash
# login
curl -X POST localhost:3000/login -H "Content-Type: application/json" \
  -d '{"login_email":"a@a.com","password":"12345"}'

# consulta com JOIN (publica)
curl "localhost:3000/boarding-pass-details?limit=10"

# criar usuario (admin)
curl -X POST localhost:3000/users -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Eva","login_email":"e@e.com","password":"abc123","user_type":"regular"}'

# alterar o proprio nome (regular ou admin)
curl -X PATCH localhost:3000/users/3 -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Charlie B."}'
```
