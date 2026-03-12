"""
Backend de autenticación — Scouteado
Flask + JWT + bcrypt + PostgreSQL (Supabase)
Desplegado como función serverless en Vercel.
"""

import os
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from functools import wraps

import bcrypt
import jwt
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ── Configuración JWT ──────────────────────────────────────────────────────────
JWT_SECRET  = os.getenv("JWT_SECRET", "cambia-este-secreto-en-produccion")
JWT_ALGO    = "HS256"
JWT_EXPIRES = int(os.getenv("JWT_EXPIRES_HOURS", 24))

# ── Conexión PostgreSQL (Supabase) ─────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL")  # postgresql://user:pass@host:5432/db

def _db_kwargs():
    if DATABASE_URL:
        return {"dsn": DATABASE_URL}
    return {
        "host":     os.getenv("DB_HOST", "localhost"),
        "port":     int(os.getenv("DB_PORT", 5432)),
        "dbname":   os.getenv("DB_NAME", "postgres"),
        "user":     os.getenv("DB_USER", "postgres"),
        "password": os.getenv("DB_PASSWORD", ""),
        "sslmode":  os.getenv("DB_SSLMODE", "require"),
    }


@contextmanager
def get_db():
    """Context manager: abre conexión, hace commit o rollback, y la cierra."""
    conn = psycopg2.connect(**_db_kwargs())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── Helpers JWT ────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def check_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def generate_token(user_id: str, email: str) -> str:
    payload = {
        "sub":   user_id,
        "email": email,
        "iat":   datetime.now(timezone.utc),
        "exp":   datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])


def token_required(f):
    """Decorador para endpoints protegidos."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Token requerido"}), 401
        token = auth_header.split(" ", 1)[1]
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expirado"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Token inválido"}), 401
        request.user = payload
        return f(*args, **kwargs)
    return decorated


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/register")
def register():
    """
    POST /api/register
    Body JSON: { nombre, apellido, telefono, club, email, password }
    Respuesta: { token, user: { id, nombre, apellido, email, club } }
    """
    data = request.get_json(silent=True) or {}

    required = ["nombre", "apellido", "telefono", "club", "email", "password"]
    missing  = [f for f in required if not data.get(f, "").strip()]
    if missing:
        return jsonify({"error": f"Campos requeridos: {', '.join(missing)}"}), 400

    nombre   = data["nombre"].strip()
    apellido = data["apellido"].strip()
    telefono = data["telefono"].strip()
    club     = data["club"].strip()
    email    = data["email"].strip().lower()
    password = data["password"]

    if "@" not in email or "." not in email.split("@")[-1]:
        return jsonify({"error": "Correo electrónico inválido"}), 400

    if len(password) < 8:
        return jsonify({"error": "La contraseña debe tener al menos 8 caracteres"}), 400

    user_id       = str(uuid.uuid4())
    password_hash = hash_password(password)

    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cur.fetchone():
                return jsonify({"error": "El correo ya está registrado"}), 409

            cur.execute(
                """INSERT INTO users
                   (id, nombre, apellido, telefono, club, email, password_hash)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (user_id, nombre, apellido, telefono, club, email, password_hash),
            )
    except psycopg2.Error as e:
        return jsonify({"error": f"Error de base de datos: {e.pgerror or str(e)}"}), 500

    token = generate_token(user_id, email)
    return jsonify({
        "token": token,
        "user": {
            "id":       user_id,
            "nombre":   nombre,
            "apellido": apellido,
            "email":    email,
            "club":     club,
        }
    }), 201


@app.post("/api/login")
def login():
    """
    POST /api/login
    Body JSON: { email, password }
    Respuesta: { token, user: { id, nombre, apellido, email, club } }
    """
    data = request.get_json(silent=True) or {}

    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Correo y contraseña requeridos"}), 400

    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                "SELECT id, nombre, apellido, club, password_hash FROM users WHERE email = %s",
                (email,),
            )
            user = cur.fetchone()
    except psycopg2.Error as e:
        return jsonify({"error": f"Error de base de datos: {e.pgerror or str(e)}"}), 500

    if not user or not check_password(password, user["password_hash"]):
        return jsonify({"error": "Credenciales incorrectas"}), 401

    token = generate_token(user["id"], email)
    return jsonify({
        "token": token,
        "user": {
            "id":       user["id"],
            "nombre":   user["nombre"],
            "apellido": user["apellido"],
            "email":    email,
            "club":     user["club"],
        }
    }), 200


@app.get("/api/me")
@token_required
def me():
    """
    GET /api/me  (requiere Authorization: Bearer <token>)
    Respuesta: { user: { id, nombre, apellido, email, club } }
    """
    email = request.user["email"]

    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                "SELECT id, nombre, apellido, club FROM users WHERE email = %s",
                (email,),
            )
            user = cur.fetchone()
    except psycopg2.Error as e:
        return jsonify({"error": f"Error de base de datos: {e.pgerror or str(e)}"}), 500

    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404

    return jsonify({
        "user": {
            "id":       user["id"],
            "nombre":   user["nombre"],
            "apellido": user["apellido"],
            "email":    email,
            "club":     user["club"],
        }
    }), 200


# ── Healthcheck ───────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
        return jsonify({"status": "ok", "db": "connected"}), 200
    except Exception as e:
        return jsonify({"status": "ok", "db": "error", "detail": str(e)}), 200


# ── Main (local dev) ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    port  = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
