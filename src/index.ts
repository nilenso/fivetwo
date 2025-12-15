import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { createDatabase } from "./db";

// Parse --db argument
const dbIndex = Bun.argv.indexOf("--db");
if (dbIndex === -1 || !Bun.argv[dbIndex + 1]) {
  console.error("Error: --db <path> argument required");
  process.exit(1);
}
const dbPath = Bun.argv[dbIndex + 1];

// Initialize database
const db = createDatabase(dbPath);

const app = new Hono();

// API v1
const v1 = new Hono();
v1.get("/status", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.route("/api/v1", v1);

// Serve static files and index.html for all other routes
app.get("/*", serveStatic({ root: "./src" }));

export default app;
