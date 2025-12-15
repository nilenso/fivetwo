import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { Database } from "bun:sqlite";
import { createJwtMiddleware, getUserIdFromContext } from "./auth";

export interface AppDependencies {
  db: Database;
  jwtSecret: string;
}

export function createApp({ db, jwtSecret }: AppDependencies): Hono {
  const app = new Hono();

  // Apply JWT middleware to all /api/* routes
  app.use("/api/*", createJwtMiddleware(jwtSecret));

  // API v1
  const v1 = new Hono();

  v1.get("/status", (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  v1.get("/user", (c) => {
    const userId = getUserIdFromContext(c);

    const user = db
      .query<
        {
          id: number;
          username: string;
          type: string;
          email: string | null;
          created_at: string;
        },
        [number]
      >("SELECT id, username, type, email, created_at FROM users WHERE id = ?")
      .get(userId);

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(user);
  });

  app.route("/api/v1", v1);

  // Serve static files and index.html for all other routes
  app.get("/*", serveStatic({ root: "./src" }));

  return app;
}
