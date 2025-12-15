import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { createApp } from "./server";
import { generateJwt } from "./auth";

const JWT_SECRET = "test-secret";

function createTestDb(): Database {
  const db = new Database(":memory:", { strict: true });
  db.run("PRAGMA foreign_keys = ON;");

  // Create tables
  db.run(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY,
      host TEXT NOT NULL,
      owner TEXT NOT NULL,
      repository TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(host, owner, repository)
    )
  `);

  db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('human', 'ai')),
      email TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}

describe("/api/v1/user", () => {
  let db: Database;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    db = createTestDb();
    app = createApp({ db, jwtSecret: JWT_SECRET });
  });

  afterAll(() => {
    db.close();
  });

  test("returns 401 without auth token", async () => {
    const res = await app.request("/api/v1/user");
    expect(res.status).toBe(401);
  });

  test("returns 401 with invalid token", async () => {
    const res = await app.request("/api/v1/user", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(401);
  });

  test("returns 404 when user not found in database", async () => {
    // Generate token for non-existent user ID
    const token = await generateJwt(JWT_SECRET, 999);

    const res = await app.request("/api/v1/user", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
  });

  test("returns user info with valid token", async () => {
    // Insert a test user
    db.run(
      "INSERT INTO users (id, username, type, email) VALUES (?, ?, ?, ?)",
      [1, "alice", "human", "alice@example.com"]
    );

    const token = await generateJwt(JWT_SECRET, 1);

    const res = await app.request("/api/v1/user", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);

    const user = await res.json();
    expect(user.id).toBe(1);
    expect(user.username).toBe("alice");
    expect(user.type).toBe("human");
    expect(user.email).toBe("alice@example.com");
    expect(user.created_at).toBeDefined();
  });

  test("returns user without email when email is null", async () => {
    // Insert a user without email
    db.run("INSERT INTO users (id, username, type) VALUES (?, ?, ?)", [
      2,
      "bob",
      "ai",
    ]);

    const token = await generateJwt(JWT_SECRET, 2);

    const res = await app.request("/api/v1/user", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);

    const user = await res.json();
    expect(user.id).toBe(2);
    expect(user.username).toBe("bob");
    expect(user.type).toBe("ai");
    expect(user.email).toBeNull();
  });
});

describe("/api/v1/status", () => {
  let db: Database;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    db = createTestDb();
    app = createApp({ db, jwtSecret: JWT_SECRET });
  });

  afterAll(() => {
    db.close();
  });

  test("returns 401 without auth token", async () => {
    const res = await app.request("/api/v1/status");
    expect(res.status).toBe(401);
  });

  test("returns status with valid token", async () => {
    db.run("INSERT INTO users (id, username, type) VALUES (?, ?, ?)", [
      1,
      "testuser",
      "human",
    ]);

    const token = await generateJwt(JWT_SECRET, 1);

    const res = await app.request("/api/v1/status", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.timestamp).toBeDefined();
  });
});
