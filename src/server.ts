import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { Database } from "bun:sqlite";
import { createJwtMiddleware, getUserIdFromContext } from "./auth";

export interface AppDependencies {
  db: Database;
  jwtSecret: string;
}

interface Card {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

interface Comment {
  id: number;
  card_id: number;
  message: string;
  created_by: number;
  created_at: string;
  status: string;
}

interface Project {
  id: number;
  host: string;
  owner: string;
  repository: string;
  created_at: string;
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

  // GET /projects - List projects with optional filters
  v1.get("/projects", (c) => {
    const id = c.req.query("id");
    const host = c.req.query("host");
    const owner = c.req.query("owner");
    const repository = c.req.query("repository");

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (id) {
      conditions.push("id = ?");
      params.push(parseInt(id, 10));
    }
    if (host) {
      conditions.push("host = ?");
      params.push(host);
    }
    if (owner) {
      conditions.push("owner = ?");
      params.push(owner);
    }
    if (repository) {
      conditions.push("repository = ?");
      params.push(repository);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const projects = db
      .query<Project, (string | number)[]>(
        `SELECT * FROM projects ${whereClause} ORDER BY created_at DESC`
      )
      .all(...params);

    return c.json(projects);
  });

  // POST /projects - Create a new project
  v1.post("/projects", async (c) => {
    const body = await c.req.json<{
      host: string;
      owner: string;
      repository: string;
    }>();

    if (!body.host || !body.owner || !body.repository) {
      return c.json({ error: "host, owner, and repository are required" }, 400);
    }

    try {
      const result = db
        .query<{ id: number }, [string, string, string]>(
          `INSERT INTO projects (host, owner, repository)
           VALUES (?, ?, ?)
           RETURNING id`
        )
        .get(body.host, body.owner, body.repository);

      const project = db
        .query<Project, [number]>("SELECT * FROM projects WHERE id = ?")
        .get(result!.id);

      return c.json(project, 201);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("UNIQUE constraint failed")) {
        return c.json({ error: "Project already exists" }, 400);
      }
      throw e;
    }
  });

  // GET /cards - List cards with optional filters and FTS search
  v1.get("/cards", (c) => {
    const id = c.req.query("id");
    const status = c.req.query("status");
    const priority = c.req.query("priority");
    const search = c.req.query("search");
    const projectId = c.req.query("project_id");

    let cards: Card[];

    if (search) {
      // FTS search - prioritize title matches over description
      cards = db
        .query<Card, [string]>(
          `SELECT c.* FROM cards c
           JOIN cards_fts fts ON c.id = fts.rowid
           WHERE cards_fts MATCH ?
           ORDER BY bm25(cards_fts, 10.0, 1.0)`
        )
        .all(search);
    } else {
      // Build dynamic query for filters
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (id) {
        conditions.push("id = ?");
        params.push(parseInt(id, 10));
      }
      if (status) {
        conditions.push("status = ?");
        params.push(status);
      }
      if (priority) {
        conditions.push("priority = ?");
        params.push(parseInt(priority, 10));
      }
      if (projectId) {
        conditions.push("project_id = ?");
        params.push(parseInt(projectId, 10));
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      cards = db
        .query<Card, (string | number)[]>(
          `SELECT * FROM cards ${whereClause} ORDER BY priority DESC, created_at DESC`
        )
        .all(...params);
    }

    return c.json(cards);
  });

  // POST /cards - Create a new card
  v1.post("/cards", async (c) => {
    const userId = getUserIdFromContext(c);
    const body = await c.req.json<{
      project_id: number;
      title: string;
      description?: string;
      status?: string;
      priority?: number;
    }>();

    if (!body.project_id || !body.title) {
      return c.json({ error: "project_id and title are required" }, 400);
    }

    // Validate project exists
    const project = db
      .query<{ id: number }, [number]>("SELECT id FROM projects WHERE id = ?")
      .get(body.project_id);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Validate status if provided
    const validStatuses = [
      "backlog",
      "in_progress",
      "review",
      "blocked",
      "done",
      "wont_do",
      "invalid",
    ];
    if (body.status && !validStatuses.includes(body.status)) {
      return c.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, 400);
    }

    // Validate priority if provided
    if (body.priority !== undefined && (body.priority < 0 || body.priority > 100)) {
      return c.json({ error: "Priority must be between 0 and 100" }, 400);
    }

    const result = db
      .query<{ id: number }, [number, string, string | null, string, number, number]>(
        `INSERT INTO cards (project_id, title, description, status, priority, created_by)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id`
      )
      .get(
        body.project_id,
        body.title,
        body.description ?? null,
        body.status ?? "backlog",
        body.priority ?? 50,
        userId
      );

    const card = db
      .query<Card, [number]>("SELECT * FROM cards WHERE id = ?")
      .get(result!.id);

    return c.json(card, 201);
  });

  // PATCH /cards/:id - Update a card
  v1.patch("/cards/:id", async (c) => {
    const userId = getUserIdFromContext(c);
    const cardId = parseInt(c.req.param("id"), 10);

    const existingCard = db
      .query<Card, [number]>("SELECT * FROM cards WHERE id = ?")
      .get(cardId);

    if (!existingCard) {
      return c.json({ error: "Card not found" }, 404);
    }

    const body = await c.req.json<{
      title?: string;
      description?: string;
      status?: string;
      priority?: number;
    }>();

    // Validate status if provided
    const validStatuses = [
      "backlog",
      "in_progress",
      "review",
      "blocked",
      "done",
      "wont_do",
      "invalid",
    ];
    if (body.status && !validStatuses.includes(body.status)) {
      return c.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, 400);
    }

    // Validate priority if provided
    if (body.priority !== undefined && (body.priority < 0 || body.priority > 100)) {
      return c.json({ error: "Priority must be between 0 and 100" }, 400);
    }

    // Build update query dynamically
    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (body.title !== undefined) {
      updates.push("title = ?");
      params.push(body.title);
    }
    if (body.description !== undefined) {
      updates.push("description = ?");
      params.push(body.description);
    }
    if (body.status !== undefined) {
      updates.push("status = ?");
      params.push(body.status);
    }
    if (body.priority !== undefined) {
      updates.push("priority = ?");
      params.push(body.priority);
    }

    if (updates.length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(cardId);

    db.run(
      `UPDATE cards SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    // Create audit record
    db.run(
      `INSERT INTO cards_audit (card_id, old_status, new_status, old_title, new_title, old_description, new_description, old_priority, new_priority, changed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cardId,
        existingCard.status,
        body.status ?? existingCard.status,
        existingCard.title,
        body.title ?? existingCard.title,
        existingCard.description,
        body.description ?? existingCard.description,
        existingCard.priority,
        body.priority ?? existingCard.priority,
        userId,
      ]
    );

    const updatedCard = db
      .query<Card, [number]>("SELECT * FROM cards WHERE id = ?")
      .get(cardId);

    return c.json(updatedCard);
  });

  // GET /cards/:id/comments - List comments for a card
  v1.get("/cards/:id/comments", (c) => {
    const cardId = parseInt(c.req.param("id"), 10);

    const card = db
      .query<{ id: number }, [number]>("SELECT id FROM cards WHERE id = ?")
      .get(cardId);

    if (!card) {
      return c.json({ error: "Card not found" }, 404);
    }

    const comments = db
      .query<Comment, [number]>(
        "SELECT * FROM comments WHERE card_id = ? AND status != 'deleted' ORDER BY created_at ASC"
      )
      .all(cardId);

    return c.json(comments);
  });

  // POST /cards/:id/comments - Add a comment to a card
  v1.post("/cards/:id/comments", async (c) => {
    const userId = getUserIdFromContext(c);
    const cardId = parseInt(c.req.param("id"), 10);

    const card = db
      .query<{ id: number }, [number]>("SELECT id FROM cards WHERE id = ?")
      .get(cardId);

    if (!card) {
      return c.json({ error: "Card not found" }, 404);
    }

    const body = await c.req.json<{ message: string }>();

    if (!body.message) {
      return c.json({ error: "message is required" }, 400);
    }

    const result = db
      .query<{ id: number }, [number, string, number]>(
        `INSERT INTO comments (card_id, message, created_by)
         VALUES (?, ?, ?)
         RETURNING id`
      )
      .get(cardId, body.message, userId);

    const comment = db
      .query<Comment, [number]>("SELECT * FROM comments WHERE id = ?")
      .get(result!.id);

    return c.json(comment, 201);
  });

  // DELETE /comments/:id - Soft delete a comment
  v1.delete("/comments/:id", (c) => {
    const commentId = parseInt(c.req.param("id"), 10);

    const comment = db
      .query<Comment, [number]>("SELECT * FROM comments WHERE id = ?")
      .get(commentId);

    if (!comment) {
      return c.json({ error: "Comment not found" }, 404);
    }

    if (comment.status === "deleted") {
      return c.json({ error: "Comment already deleted" }, 400);
    }

    db.run("UPDATE comments SET status = 'deleted' WHERE id = ?", [commentId]);

    return c.json({ success: true });
  });

  app.route("/api/v1", v1);

  // Serve built static files from dist/
  app.use("/*", serveStatic({ root: "./dist" }));

  return app;
}
