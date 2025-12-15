import { Hono } from "hono";
import { serveStatic } from "hono/bun";

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
