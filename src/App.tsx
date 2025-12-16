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
  type: string;
  created_at: string;
  version: number;
}

const CARD_TYPE_ICONS: Record<string, string> = {
  bug: "🐛",
  story: "📖",
  task: "✅",
  epic: "🏔️",
  spike: "🔬",
  chore: "🔧",
};

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

function CardTile({ card, onClick }: { card: Card; onClick: () => void }) {
  const typeIcon = CARD_TYPE_ICONS[card.type] || "✅";
  return (
    <div className="card-tile" onClick={onClick}>
      <div className="card-tile-header">
        <span className="card-tile-type" title={card.type}>{typeIcon}</span>
        <h3 className="card-tile-title">{card.title}</h3>
        <span className="card-tile-id">#{card.id}</span>
      </div>
      {card.description && (
        <p className="card-tile-description">{card.description}</p>
      )}
      <div className="card-tile-meta">
        <span className="card-tile-status" data-status={card.status}>
          {card.status.replace("_", " ")}
        </span>
        <PriorityDisplay priority={card.priority} />
      </div>
    </div>
  );
}

interface CardReference {
  id: number;
  source_card_id: number;
  target_card_id: number;
  reference_type: string;
  created_at: string;
  target_title?: string;
  source_title?: string;
}

const REFERENCE_TYPE_LABELS: Record<string, string> = {
  blocks: "Blocks",
  blocked_by: "Blocked by",
  relates_to: "Relates to",
  duplicates: "Duplicates",
  duplicated_by: "Duplicated by",
  parent_of: "Parent of",
  child_of: "Child of",
  follows: "Follows",
  precedes: "Precedes",
  clones: "Clones",
  cloned_by: "Cloned by",
};

function SidePanel({
  card,
  token,
  onClose,
}: {
  card: Card | null;
  token: string;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [references, setReferences] = useState<{
    outgoing: CardReference[];
    incoming: CardReference[];
  }>({ outgoing: [], incoming: [] });
  const [loadingRefs, setLoadingRefs] = useState(false);

  useEffect(() => {
    if (!card) return;

    setLoadingComments(true);
    setLoadingRefs(true);

    fetch(`/api/v1/cards/${card.id}/comments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then(setComments)
      .finally(() => setLoadingComments(false));

    fetch(`/api/v1/cards/${card.id}/references`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : { outgoing: [], incoming: [] }))
      .then(setReferences)
      .finally(() => setLoadingRefs(false));
  }, [card, token]);

  return (
    <>
      <div
        className={`side-panel-backdrop ${card ? "open" : ""}`}
        onClick={onClose}
      />
      <div className={`side-panel ${card ? "open" : ""}`}>
        {card && (
          <>
            <div className="side-panel-header">
              <h2 className="side-panel-title">{card.title}</h2>
              <button className="side-panel-close" onClick={onClose}>
                ×
              </button>
            </div>
            <div className="side-panel-meta">
              <span>#{card.id} • v{card.version}</span>
              <span>{CARD_TYPE_ICONS[card.type] || "✅"} {card.type}</span>
              <span>{card.status}</span>
              <span><PriorityDisplay priority={card.priority} /></span>
              <span>{new Date(card.created_at).toLocaleDateString()}</span>
            </div>
            {card.description && (
              <div className="side-panel-section">
                <h4>Description</h4>
                <Markdown>{card.description}</Markdown>
              </div>
            )}
            {(references.outgoing.length > 0 || references.incoming.length > 0 || loadingRefs) && (
              <div className="side-panel-section">
                <h4>References</h4>
                {loadingRefs ? (
                  <p aria-busy="true">Loading references...</p>
                ) : (
                  <>
                    {references.outgoing.length > 0 && (
                      <div style={{ marginBottom: "0.75rem" }}>
                        {references.outgoing.map((ref) => (
                          <div key={ref.id} className="reference-item">
                            <span className="reference-type">{REFERENCE_TYPE_LABELS[ref.reference_type] || ref.reference_type}</span>
                            <span className="reference-card">#{ref.target_card_id} {ref.target_title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {references.incoming.length > 0 && (
                      <div>
                        <small style={{ color: "var(--muted-color)" }}>Referenced by:</small>
                        {references.incoming.map((ref) => (
                          <div key={ref.id} className="reference-item">
                            <span className="reference-type">{REFERENCE_TYPE_LABELS[ref.reference_type] || ref.reference_type}</span>
                            <span className="reference-card">#{ref.source_card_id} {ref.source_title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="side-panel-section">
              <h4>Comments</h4>
              {loadingComments ? (
                <p aria-busy="true">Loading comments...</p>
              ) : comments.length === 0 ? (
                <p><em>No comments</em></p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} style={{ marginBottom: "1rem" }}>
                    <small style={{ color: "var(--muted-color)" }}>
                      {new Date(c.created_at).toLocaleString()}
                    </small>
                    <Markdown>{c.message}</Markdown>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
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
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

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
                <img
                  src={`https://${project.host}/favicon.ico`}
                  alt=""
                  style={{ width: 20, height: 20, marginRight: 8, verticalAlign: "middle" }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
                <a
                  href={`https://${project.host}/${project.owner}/${project.repository}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {project.owner}/{project.repository}
                </a>
              </h2>
              {activeCards.length === 0 ? (
                <p>No active cards in this project.</p>
              ) : (
                <div className="card-grid">
                  {activeCards.map((c) => (
                    <CardTile key={c.id} card={c} onClick={() => setSelectedCard(c)} />
                  ))}
                </div>
              )}
              {terminatedCards.length > 0 && (
                <details>
                  <summary>
                    Completed ({terminatedCards.length} card{terminatedCards.length !== 1 ? "s" : ""})
                  </summary>
                  <div className="card-grid">
                    {terminatedCards.map((c) => (
                      <CardTile key={c.id} card={c} onClick={() => setSelectedCard(c)} />
                    ))}
                  </div>
                </details>
              )}
            </section>
          );
        })
      )}

      <SidePanel
        card={selectedCard}
        token={token}
        onClose={() => setSelectedCard(null)}
      />
    </main>
  );
}

export default App;
