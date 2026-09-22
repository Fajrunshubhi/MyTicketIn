-- name: GetUserByID :one
SELECT id, name, username, email, role, created_at
FROM users
WHERE id = $1;

-- name: CreateUser :one
INSERT INTO users (id, name, username, email, password_hash, role)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, name, username, email, role, created_at;
