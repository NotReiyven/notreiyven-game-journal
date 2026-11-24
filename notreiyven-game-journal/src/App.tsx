
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen, CalendarDays, Clock3, Gamepad2, LayoutDashboard, LogOut,
  Menu, Plus, Search, Sparkles, Trash2, UserRound, X, ChevronRight,
} from "lucide-react";
import type { Session, Game, Stats } from "./lib/api";
import { api } from "./lib/api";
import { configReady, missingConfig, supabase } from "./lib/supabase";

type Profile = {
  display_name: string;
  email: string | null;
  steam_id: string | null;
};

type PageName = "dashboard" | "games" | "journal" | "profile";

const emptyStats: Stats = {
  total_games: 0,
  owned_games: 0,
  wishlist_games: 0,
  backlog_games: 0,
  playing_games: 0,
  paused_games: 0,
  completed_games: 0,
  dropped_games: 0,
  total_steam_playtime_minutes: 0,
  legacy_manual_playtime_minutes: 0,
  manual_session_minutes: 0,
  session_count: 0,
  last_steam_sync_at: null,
};

function formatHours(minutes: number) {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function gameImage(game: Game) {
  return game.platform === "steam" && game.steam_app_id
    ? `https://cdn.akamai.steamstatic.com/steam/apps/${game.steam_app_id}/header.jpg`
    : "";
}

export default function App() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [page, setPage] = useState<PageName>("dashboard");
  const [games, setGames] = useState<Game[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [selectedGame, setSelectedGame] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSessionToken(data.session?.access_token ?? null);
      setAuthReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionToken(session?.access_token ?? null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const loadData = useCallback(async (token: string) => {
    setLoading(true);
    setError("");

    try {
      const [gameRows, statRow, profileRow] = await Promise.all([
        api.games(token),
        api.stats(token),
        api.profile(token),
      ]);

      setGames(gameRows);
      setStats(statRow);
      setProfile(profileRow);

      const sessionPages = await Promise.all(
        gameRows.map(async (game) => {
          try {
            const result = await api.sessions(token, game.id);
            return result.data.map((item) => ({
              ...item,
              gameName: game.name,
            }));
          } catch {
            return [];
          }
        }),
      );

      setSessions(
        sessionPages
          .flat()
          .sort(
            (a, b) =>
              new Date(b.played_at).getTime() -
              new Date(a.played_at).getTime(),
          ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load your journal.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionToken) {
      void loadData(sessionToken);
    } else {
      setGames([]);
      setSessions([]);
      setProfile(null);
      setStats(emptyStats);
    }
  }, [sessionToken, loadData]);

  const refresh = async () => {
    if (sessionToken) await loadData(sessionToken);
  };

  const filteredGames = useMemo(
    () =>
      games.filter((game) =>
        game.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [games, search],
  );

  const visibleSessions = useMemo(
    () =>
      sessions.filter(
        (item) =>
          selectedGame === "all" ||
          item.user_game_id === selectedGame,
      ),
    [sessions, selectedGame],
  );

  const handleSignOut = async () => {
    await supabase?.auth.signOut();
    setSessionToken(null);
  };

  const addSession = async (
    gameId: string,
    duration: number,
    date: string,
    mood: string,
    notes: string,
  ) => {
    if (!sessionToken) return;

    await api.addSession(sessionToken, gameId, {
      duration_minutes: duration,
      played_at: new Date(date).toISOString(),
      mood,
      notes,
    });

    setShowAdd(false);
    setNotice("Session saved to your journal.");
    await refresh();
  };

  const removeSession = async (id: string) => {
    if (!sessionToken || !confirm("Delete this journal entry?")) return;

    try {
      await api.deleteSession(sessionToken, id);
      setSessions((items) => items.filter((item) => item.id !== id));
      setNotice("Journal entry deleted.");
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not delete session.",
      );
    }
  };

  if (!configReady) {
    return <SetupScreen missing={missingConfig} />;
  }

  if (!authReady) {
    return (
      <div className="screen-center">
        <div className="spinner" />
        <p>Preparing your journal...</p>
      </div>
    );
  }

  if (!sessionToken) {
    return <AuthScreen />;
  }

  const navItems: {
    id: PageName;
    label: string;
    icon: typeof LayoutDashboard;
  }[] = [
    { id: "dashboard", label: "Overview", icon: LayoutDashboard },
    { id: "games", label: "My games", icon: Gamepad2 },
    { id: "journal", label: "Journal", icon: BookOpen },
    { id: "profile", label: "Profile", icon: UserRound },
  ];

  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Close menu"
        />
      )}

      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-icon">
            <Gamepad2 size={21} />
          </div>
          <div>
            <strong>GAME JOURNAL</strong>
            <span>YOUR PLAY, REMEMBERED</span>
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileNav(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => {
                setPage(id);
                setMobileNav(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {page === id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Sparkles size={16} />
            <strong>A little at a time</strong>
            <p>Every session becomes a memory worth keeping.</p>
          </div>

          <button
            className="account-row"
            onClick={() => setPage("profile")}
          >
            <div className="avatar">
              {(profile?.display_name || "G").slice(0, 1).toUpperCase()}
            </div>
            <div className="account-copy">
              <strong>{profile?.display_name || "Player"}</strong>
              <span>{profile?.email || "Your account"}</span>
            </div>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={20} />
          </button>

          <div className="breadcrumb">
            PERSONAL SPACE <span>/</span> {page.toUpperCase()}
          </div>

          <div className="topbar-right">
            <span className="status-dot" />
            <span>Synced with your library</span>
            <button
              className="icon-button"
              title="Sign out"
              onClick={handleSignOut}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <div className="content">
          {error && (
            <div className="alert error-alert">
              {error}
              <button onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}

          {notice && (
            <div className="alert success-alert">
              {notice}
              <button onClick={() => setNotice("")}>
                <X size={15} />
              </button>
            </div>
          )}

          {loading && (
            <div className="loading-line">
              <span />
              Updating your journal...
            </div>
          )}

          {page === "dashboard" && (
            <Dashboard
              stats={stats}
              sessions={sessions}
              games={games}
              onAdd={() => setShowAdd(true)}
              onJournal={() => setPage("journal")}
            />
          )}

          {page === "games" && (
            <GamesPage
              games={filteredGames}
              search={search}
              setSearch={setSearch}
              onAdd={() => setShowAdd(true)}
              onJournal={(id) => {
                setSelectedGame(id);
                setPage("journal");
              }}
            />
          )}

          {page === "journal" && (
            <JournalPage
              sessions={visibleSessions}
              games={games}
              selectedGame={selectedGame}
              setSelectedGame={setSelectedGame}
              onAdd={() => setShowAdd(true)}
              onDelete={removeSession}
            />
          )}

          {page === "profile" && (
            <ProfilePage profile={profile} stats={stats} />
          )}
        </div>

        <footer className="footer">
          GAME JOURNAL <span>·</span> A QUIET PLACE FOR YOUR GAMING MEMORIES
        </footer>
      </main>

      {showAdd && (
        <AddSessionModal
          games={games.filter(
            (game) => game.acquisition_status === "owned",
          )}
          onClose={() => setShowAdd(false)}
          onSave={addSession}
        />
      )}
    </div>
  );
}

function SetupScreen({ missing }: { missing: string[] }) {
  return (
    <div className="screen-center">
      <div className="auth-card">
        <div className="brand-icon large">
          <Gamepad2 />
        </div>

        <h1>Configuration incomplete</h1>

        <p>
          The following environment variables are missing from this
          deployment:
        </p>

        <ul>
          {missing.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>

        <p className="muted">
          Add these variables in your Vercel project settings and redeploy.
          Never expose your Supabase secret key in this frontend.
        </p>
      </div>
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!supabase) return;

    setBusy(true);
    setMessage("");

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName,
            },
          },
        });

        if (error) throw error;

        setMessage(
          "Account created. If email confirmation is enabled, check your inbox, then sign in.",
        );
        setMode("login");
      }
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : "Authentication failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-visual">
        <div className="auth-orb orb-one" />
        <div className="auth-orb orb-two" />

        <div className="auth-visual-copy">
          <div className="brand-icon large">
            <Gamepad2 size={30} />
          </div>

          <p className="eyebrow">YOUR PERSONAL GAMING DIARY</p>

          <h1>
            Every session
            <br />
            <em>has a story.</em>
          </h1>

          <p className="muted">
            Keep track of the games you play, the time you spend, and
            the moments you want to remember.
          </p>

          <div className="visual-note">
            <BookOpen size={17} />
            A journal for your player life.
          </div>
        </div>
      </div>

      <div className="auth-form-side">
        <form className="auth-card" onSubmit={submit}>
          <p className="eyebrow">
            {mode === "login" ? "WELCOME BACK" : "START YOUR JOURNAL"}
          </p>

          <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>

          <p className="muted">
            Use the same Supabase account as Backlog Compass.
          </p>

          {mode === "signup" && (
            <label>
              Display name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                placeholder="Your player name"
              />
            </label>
          )}

          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="At least 6 characters"
            />
          </label>

          {message && <div className="inline-message">{message}</div>}

          <button className="primary-button full-button" disabled={busy}>
            {busy
              ? "Please wait..."
              : mode === "login"
                ? "Sign in to journal"
                : "Create an account"}
            <ChevronRight size={17} />
          </button>

          <p className="switch-auth">
            {mode === "login"
              ? "New here?"
              : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setMessage("");
              }}
            >
              {mode === "login"
                ? "Create an account"
                : "Sign in instead"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

function StatTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Clock3;
}) {
  return (
    <div className="stat-tile">
      <div className="stat-top">
        <span>{label}</span>
        <div className="stat-icon">
          <Icon size={17} />
        </div>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Dashboard({
  stats,
  sessions,
  games,
  onAdd,
  onJournal,
}: {
  stats: Stats;
  sessions: Session[];
  games: Game[];
  onAdd: () => void;
  onJournal: () => void;
}) {
  const recent = sessions.slice(0, 5);

  const totalMinutes =
    stats.total_steam_playtime_minutes +
    stats.legacy_manual_playtime_minutes +
    stats.manual_session_minutes;

  return (
    <>
      <PageHeading
        eyebrow="YOUR GAMING AT A GLANCE"
        title="Welcome back, player."
        description="A little record of the time you've spent in other worlds."
        action={
          <button className="primary-button" onClick={onAdd}>
            <Plus size={17} />
            Log a session
          </button>
        }
      />

      <div className="stats-grid">
        <StatTile
          label="Tracked playtime"
          value={formatHours(totalMinutes)}
          detail="Combined recorded time"
          icon={Clock3}
        />
        <StatTile
          label="Sessions logged"
          value={String(stats.session_count)}
          detail="Journal entries"
          icon={CalendarDays}
        />
        <StatTile
          label="Games in library"
          value={String(stats.total_games)}
          detail={`${stats.owned_games} owned · ${stats.wishlist_games} wishlist`}
          icon={Gamepad2}
        />
        <StatTile
          label="Currently playing"
          value={String(stats.playing_games)}
          detail="Games marked in progress"
          icon={Sparkles}
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">THE LATEST</p>
              <h2>Recent sessions</h2>
            </div>
            <button className="text-button" onClick={onJournal}>
              View journal <ChevronRight size={15} />
            </button>
          </div>

          {recent.length ? (
            <div className="session-list">
              {recent.map((item) => (
                <SessionRow key={item.id} session={item} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No sessions just yet"
              copy="Your gaming memories will show up here after your first log."
            />
          )}
        </section>

        <section className="panel quick-panel">
          <p className="eyebrow">YOUR COLLECTION</p>
          <h2>In your library</h2>

          <div className="mini-count">
            <strong>{games.length}</strong>
            <span>games available to journal</span>
          </div>

          <div className="progress-track">
            <span
              style={{
                width: `${
                  games.length
                    ? (stats.completed_games /
                        Math.max(stats.owned_games, 1)) *
                      100
                    : 0
                }%`,
              }}
            />
          </div>

          <div className="quick-row">
            <span>Completed games</span>
            <strong>{stats.completed_games}</strong>
          </div>

          <div className="quick-row">
            <span>Backlog games</span>
            <strong>{stats.backlog_games}</strong>
          </div>

          <button
            className="secondary-button full-button"
            onClick={onJournal}
          >
            Browse journal <ChevronRight size={16} />
          </button>
        </section>
      </div>
    </>
  );
}

function GamesPage({
  games,
  search,
  setSearch,
  onAdd,
  onJournal,
}: {
  games: Game[];
  search: string;
  setSearch: (v: string) => void;
  onAdd: () => void;
  onJournal: (id: string) => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="YOUR COLLECTION"
        title="My games"
        description="Games from your existing Backlog Compass library."
        action={
          <button className="primary-button" onClick={onAdd}>
            <Plus size={17} />
            Log a session
          </button>
        }
      />

      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            placeholder="Find a game..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="result-count">{games.length} games</span>
      </div>

      {games.length ? (
        <div className="games-grid">
          {games.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              onClick={() => onJournal(game.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No games found"
          copy="Add games to your library in Backlog Compass, or try another search."
        />
      )}
    </>
  );
}

function GameCard({
  game,
  onClick,
}: {
  game: Game;
  onClick: () => void;
}) {
  const image = gameImage(game);

  return (
    <button className="game-card" onClick={onClick}>
      <div className="game-art">
        {image ? (
          <img
            src={image}
            alt=""
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : null}

        <div className="art-fallback">
          <Gamepad2 size={27} />
        </div>

        <span className="game-platform">{game.platform}</span>
      </div>

      <div className="game-card-info">
        <strong>{game.name}</strong>
        <span>
          {game.play_status.replace("_", " ")} <i />{" "}
          {game.acquisition_status}
        </span>
      </div>

      <div className="game-card-arrow">
        <ChevronRight size={17} />
      </div>
    </button>
  );
}

function JournalPage({
  sessions,
  games,
  selectedGame,
  setSelectedGame,
  onAdd,
  onDelete,
}: {
  sessions: Session[];
  games: Game[];
  selectedGame: string;
  setSelectedGame: (v: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="YOUR GAMING HISTORY"
        title="The journal"
        description="Every session, note, and little victory in one place."
        action={
          <button className="primary-button" onClick={onAdd}>
            <Plus size={17} />
            New entry
          </button>
        }
      />

      <div className="toolbar">
        <div className="filter-select">
          <CalendarDays size={16} />
          <select
            value={selectedGame}
            onChange={(e) => setSelectedGame(e.target.value)}
          >
            <option value="all">All games</option>
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </select>
        </div>

        <span className="result-count">{sessions.length} entries</span>
      </div>

      {sessions.length ? (
        <div className="journal-list">
          {sessions.map((item) => (
            <div className="journal-entry" key={item.id}>
              <div className="entry-date">
                <strong>
                  {new Date(item.played_at).toLocaleDateString(undefined, {
                    day: "2-digit",
                  })}
                </strong>
                <span>
                  {new Date(item.played_at).toLocaleDateString(undefined, {
                    month: "short",
                  })}
                </span>
              </div>

              <div className="entry-body">
                <div className="entry-title">
                  <div>
                    <h3>{item.gameName || "Game session"}</h3>
                    <span>{formatDate(item.played_at)}</span>
                  </div>
                  <strong className="entry-duration">
                    {formatDuration(item.duration_minutes)}
                  </strong>
                </div>

                {item.mood && (
                  <span className="mood-chip">{item.mood}</span>
                )}

                {item.notes && (
                  <p className="entry-notes">{item.notes}</p>
                )}
              </div>

              <button
                className="icon-button delete-button"
                title="Delete entry"
                onClick={() => onDelete(item.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Your journal is waiting"
          copy="Log a gaming session to start building your personal play history."
        />
      )}
    </>
  );
}

function SessionRow({ session }: { session: Session }) {
  return (
    <div className="session-row">
      <div className="session-symbol">
        <Gamepad2 size={17} />
      </div>

      <div className="session-row-copy">
        <strong>{session.gameName || "Game session"}</strong>
        <span>
          {formatDate(session.played_at)}
          {session.mood ? ` · ${session.mood}` : ""}
        </span>
      </div>

      <strong className="session-time">
        {formatDuration(session.duration_minutes)}
      </strong>
    </div>
  );
}

function EmptyState({
  title,
  copy,
}: {
  title: string;
  copy: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <BookOpen size={22} />
      </div>
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

function ProfilePage({
  profile,
  stats,
}: {
  profile: Profile | null;
  stats: Stats;
}) {
  return (
    <>
      <PageHeading
        eyebrow="YOUR ACCOUNT"
        title="Player profile"
        description="Your account details and a small summary of your play history."
      />

      <div className="profile-layout">
        <section className="panel profile-card">
          <div className="profile-avatar">
            {(profile?.display_name || "P").slice(0, 1).toUpperCase()}
          </div>

          <h2>{profile?.display_name || "Player"}</h2>
          <p className="muted">
            {profile?.email || "No email available"}
          </p>

          <div className="profile-divider" />

          <div className="profile-detail">
            <span>Display name</span>
            <strong>{profile?.display_name || "—"}</strong>
          </div>

          <div className="profile-detail">
            <span>Steam ID</span>
            <strong>{profile?.steam_id || "Not linked"}</strong>
          </div>
        </section>

        <section className="panel profile-summary">
          <p className="eyebrow">YOUR JOURNEY SO FAR</p>
          <h2>A few numbers</h2>

          <div className="quick-row">
            <span>Games in your library</span>
            <strong>{stats.total_games}</strong>
          </div>

          <div className="quick-row">
            <span>Sessions recorded</span>
            <strong>{stats.session_count}</strong>
          </div>

          <div className="quick-row">
            <span>Completed games</span>
            <strong>{stats.completed_games}</strong>
          </div>

          <div className="quick-row">
            <span>Manual session time</span>
            <strong>{formatHours(stats.manual_session_minutes)}</strong>
          </div>
        </section>
      </div>
    </>
  );
}

function AddSessionModal({
  games,
  onClose,
  onSave,
}: {
  games: Game[];
  onClose: () => void;
  onSave: (
    gameId: string,
    duration: number,
    date: string,
    mood: string,
    notes: string,
  ) => Promise<void>;
}) {
  const [gameId, setGameId] = useState(games[0]?.id || "");
  const [duration, setDuration] = useState("60");

  const [date, setDate] = useState(() =>
    new Date(
      Date.now() - new Date().getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 16),
  );

  const [mood, setMood] = useState("fun");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!gameId) {
      setError("You need an owned game in your library first.");
      return;
    }

    const mins = Number(duration);

    if (!Number.isInteger(mins) || mins < 1 || mins > 1440) {
      setError("Duration must be between 1 and 1440 minutes.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await onSave(gameId, mins, date, mood, notes);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save session.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="modal" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">ADD TO YOUR HISTORY</p>
            <h2>Log a session</h2>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>

        {games.length ? (
          <>
            <label>
              Which game?
              <select
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
              >
                {games.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="form-two">
              <label>
                Duration (minutes)
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  required
                />
              </label>

              <label>
                Date and time
                <input
                  type="datetime-local"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
            </div>

            <label>
              How was it?
              <select
                value={mood}
                onChange={(e) => setMood(e.target.value)}
              >
                <option value="fun">Fun</option>
                <option value="relaxed">Relaxed</option>
                <option value="challenging">Challenging</option>
                <option value="frustrating">Frustrating</option>
                <option value="focused">Focused</option>
                <option value="story">Story-focused</option>
                <option value="social">Social</option>
              </select>
            </label>

            <label>
              Notes <span className="optional">(optional)</span>
              <textarea
                rows={4}
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What happened during this session? Any memorable moments?"
              />
            </label>
          </>
        ) : (
          <EmptyState
            title="No owned games available"
            copy="Add an owned game to your library in Backlog Compass before recording a session."
          />
        )}

        {error && <div className="inline-message">{error}</div>}

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            className="primary-button"
            disabled={busy || !games.length}
          >
            {busy ? "Saving..." : "Save session"}
            <ChevronRight size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
