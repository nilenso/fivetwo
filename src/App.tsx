import { useEffect, useState } from "react";
import Markdown from "react-markdown";

interface Project {
  id: number;
  host: string;
  owner: string;
  repository: string;
  created_at: string;
}

interface Card {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  created_at: string;
}

interface Comment {
  id: number;
  card_id: number;
  message: string;
  created_by: number;
  created_at: string;
}

function getToken(): string | null {
  const match = document.cookie.match(/(?:^|; )token=([^;]*)/);
  return match ? match[1] : null;
}

function PriorityDisplay({ priority }: { priority: number }) {
  switch (priority) {
    case 20:
      return <span title="Low priority">▰▱▱</span>;
    case 50:
      return <span title="Medium priority">▰▰▱</span>;
    case 80:
      return <span title="High priority">▰▰▰</span>;
    default:
      return <span>{priority}</span>;
  }
}

const TERMINAL_STATUSES = ["done", "wont_do", "invalid"] as const;

function setToken(token: string) {
  document.cookie = `token=${token}; path=/; max-age=31536000`;
}

function clearToken() {
  document.cookie = "token=; path=/; max-age=0";
}

function NewProjectForm({
  token,
  onSuccess,
  onCancel,
}: {
  token: string;
  onSuccess: (project: Project) => void;
  onCancel: () => void;
}) {
  const [host, setHost] = useState("github.com");
  const [owner, setOwner] = useState("");
  const [repository, setRepository] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/projects", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ host, owner, repository }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create project");
      }

      const project = await res.json();
      onSuccess(project);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog open>
      <article>
        <header>
          <button
            aria-label="Close"
            rel="prev"
            onClick={onCancel}
            disabled={submitting}
          />
          <h2>Add Project</h2>
        </header>
        <form onSubmit={handleSubmit}>
          <label>
            Host
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="github.com"
              required
              disabled={submitting}
            />
          </label>
          <label>
            Owner
            <input
              type="text"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="username or organization"
              required
              autoFocus
              disabled={submitting}
            />
          </label>
          <label>
            Repository
            <input
              type="text"
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
              placeholder="repository-name"
              required
              disabled={submitting}
            />
          </label>
          {error && <p style={{ color: "var(--pico-del-color)" }}>{error}</p>}
          <button type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? "Creating..." : "Create Project"}
          </button>
        </form>
      </article>
    </dialog>
  );
}

function CardRow({ card, token }: { card: Card; token: string }) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  const toggleComments = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/v1/cards/${card.id}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setComments(await res.json());
      }
    } finally {
      setLoadingComments(false);
    }
  };

  return (
    <>
      <tr onClick={toggleComments} style={{ cursor: "pointer" }}>
        <td>{card.id}</td>
        <td>{card.title}</td>
        <td>{card.status}</td>
        <td><PriorityDisplay priority={card.priority} /></td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} style={{ background: "var(--card-background-color)" }}>
            {card.description && (
              <div style={{ marginBottom: "1rem" }}>
                <strong>Description</strong>
                <Markdown>{card.description}</Markdown>
              </div>
            )}
            {loadingComments ? (
              <p aria-busy="true">Loading comments...</p>
            ) : comments.length === 0 ? (
              <p><em>No comments</em></p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {comments.map((c) => (
                    <tr key={c.id}>
                      <td style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                        {new Date(c.created_at).toLocaleString()}
                      </td>
                      <td>
                        <Markdown>{c.message}</Markdown>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function App() {
  const [token, setTokenState] = useState<string | null>(getToken);
  const [tokenInput, setTokenInput] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);

  const fetchData = async (authToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${authToken}` };
      const [projectsRes, cardsRes] = await Promise.all([
        fetch("/api/v1/projects", { headers }),
        fetch("/api/v1/cards", { headers }),
      ]);

      if (!projectsRes.ok || !cardsRes.ok) {
        if (projectsRes.status === 401 || cardsRes.status === 401) {
          clearToken();
          setTokenState(null);
          throw new Error("Invalid token");
        }
        throw new Error("Failed to fetch data");
      }

      const [projectsData, cardsData] = await Promise.all([
        projectsRes.json(),
        cardsRes.json(),
      ]);

      setProjects(projectsData);
      setCards(cardsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchData(token);
    }
  }, [token]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenInput.trim()) {
      setToken(tokenInput.trim());
      setTokenState(tokenInput.trim());
      setTokenInput("");
    }
  };

  const handleLogout = () => {
    clearToken();
    setTokenState(null);
    setProjects([]);
    setCards([]);
  };

  if (!token) {
    return (
      <main className="container">
        <h1>FiveTwo</h1>
        <dialog open>
          <article>
            <h2>Enter JWT Token</h2>
            <form onSubmit={handleSubmit}>
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Paste your JWT token"
                autoFocus
              />
              <button type="submit">Save</button>
            </form>
          </article>
        </dialog>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="container">
        <p aria-busy="true">Loading...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container">
        <h1>FiveTwo</h1>
        <p>Error: {error}</p>
        <button onClick={handleLogout}>Try Again</button>
      </main>
    );
  }

  // Group cards by project_id
  const cardsByProject = cards.reduce((acc, card) => {
    if (!acc[card.project_id]) {
      acc[card.project_id] = [];
    }
    acc[card.project_id].push(card);
    return acc;
  }, {} as Record<number, Card[]>);

  const handleProjectCreated = (project: Project) => {
    setProjects((prev) => [project, ...prev]);
    setShowNewProjectForm(false);
  };

  return (
    <main className="container">
      <header>
        <h1>FiveTwo</h1>
        <div>
          <button onClick={() => setShowNewProjectForm(true)} style={{ marginRight: "0.5rem" }}>
            Add Project
          </button>
          <button onClick={handleLogout} className="outline">Logout</button>
        </div>
      </header>

      {showNewProjectForm && (
        <NewProjectForm
          token={token}
          onSuccess={handleProjectCreated}
          onCancel={() => setShowNewProjectForm(false)}
        />
      )}

      {projects.length === 0 ? (
        <p>No projects yet.</p>
      ) : (
        projects.map((project) => {
          const projectCards = cardsByProject[project.id] || [];
          const activeCards = projectCards.filter(
            (c) => !TERMINAL_STATUSES.includes(c.status as typeof TERMINAL_STATUSES[number])
          );
          const terminatedCards = projectCards.filter(
            (c) => TERMINAL_STATUSES.includes(c.status as typeof TERMINAL_STATUSES[number])
          );
          return (
            <section key={project.id}>
              <h2>
                {project.host}/{project.owner}/{project.repository}
              </h2>
              {activeCards.length === 0 ? (
                <p>No active cards in this project.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCards.map((c) => (
                      <CardRow key={c.id} card={c} token={token} />
                    ))}
                  </tbody>
                </table>
              )}
              {terminatedCards.length > 0 && (
                <details>
                  <summary>
                    Completed ({terminatedCards.length} card{terminatedCards.length !== 1 ? "s" : ""})
                  </summary>
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Title</th>
                        <th>Status</th>
                        <th>Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {terminatedCards.map((c) => (
                        <CardRow key={c.id} card={c} token={token} />
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </section>
          );
        })
      )}
    </main>
  );
}

export default App;
