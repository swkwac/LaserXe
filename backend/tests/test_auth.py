import os
import sqlite3

import pytest
from fastapi.testclient import TestClient
from passlib.hash import bcrypt

from app.db.connection import get_db
from main import app


def _create_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        create table users (
            id integer primary key autoincrement,
            login text unique not null,
            password_hash text not null,
            created_at text not null,
            updated_at text
        )
        """
    )
    conn.commit()


def _seed_user(conn: sqlite3.Connection) -> None:
    password_hash = bcrypt.using(rounds=12).hash("123")
    conn.execute(
        "insert into users (login, password_hash, created_at) values (?, ?, datetime('now'))",
        ("user", password_hash),
    )
    conn.commit()


@pytest.fixture()
def client():
    os.environ["AUTH_SECRET_KEY"] = "test-secret"
    os.environ["AUTH_COOKIE_NAME"] = "laserxe_session"
    os.environ["AUTH_COOKIE_SECURE"] = "false"
    os.environ["AUTH_COOKIE_SAMESITE"] = "lax"
    os.environ["AUTH_COOKIE_MAX_AGE_SECONDS"] = "3600"

    # check_same_thread=False so the same connection can be used from the test
    # thread (setup) and from the request thread (TestClient runs requests in another thread).
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    _create_schema(conn)
    _seed_user(conn)

    def _override_get_db():
        yield conn

    app.dependency_overrides[get_db] = _override_get_db
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        app.dependency_overrides.clear()
        conn.close()


def test_login_success_sets_cookie(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"login": "user", "password": "123"})
    assert response.status_code == 200
    assert response.json()["user"]["login"] == "user"
    assert "set-cookie" in response.headers
    assert "laserxe_session=" in response.headers["set-cookie"]


def test_login_invalid_password(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"login": "user", "password": "bad"})
    assert response.status_code == 401


def test_me_requires_auth(client: TestClient) -> None:
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_me_with_cookie(client: TestClient) -> None:
    login = client.post("/api/auth/login", json={"login": "user", "password": "123"})
    assert login.status_code == 200
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["user"]["login"] == "user"


def test_logout_clears_session(client: TestClient) -> None:
    login = client.post("/api/auth/login", json={"login": "user", "password": "123"})
    assert login.status_code == 200
    logout = client.post("/api/auth/logout")
    assert logout.status_code == 204
    assert logout.content == b""  # 204 No Content has no body
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_logout_requires_auth(client: TestClient) -> None:
    """Logout without valid session returns 401 (only /api/auth/login is public)."""
    response = client.post("/api/auth/logout")
    assert response.status_code == 401


def test_login_missing_fields_returns_422(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={})
    assert response.status_code == 422


def test_login_empty_fields_returns_422(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"login": "", "password": ""})
    assert response.status_code == 422
