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

function setToken(token: string) {
  document.cookie = `token=${token}; path=/; max-age=31536000`;
}

function clearToken() {
  document.cookie = "token=; path=/; max-age=0";
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
        <td>{card.priority}</td>
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

  return (
    <main className="container">
      <header>
        <h1>FiveTwo</h1>
        <button onClick={handleLogout} className="outline">Logout</button>
      </header>

      {projects.length === 0 ? (
        <p>No projects yet.</p>
      ) : (
        projects.map((project) => {
          const projectCards = cardsByProject[project.id] || [];
          return (
            <section key={project.id}>
              <h2>
                {project.host}/{project.owner}/{project.repository}
              </h2>
              {projectCards.length === 0 ? (
                <p>No cards in this project.</p>
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
                    {projectCards.map((c) => (
                      <CardRow key={c.id} card={c} token={token} />
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })
      )}
    </main>
  );
}

export default App;
