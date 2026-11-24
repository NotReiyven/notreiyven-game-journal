const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ?.trim()
  .replace(/\/+$/, "");
export type Game = {
  id: string;
  game_id: string;
  name: string;
  platform: "steam" | "other";
  steam_app_id: number | null;
  store_url: string | null;
  acquisition_status: "owned" | "wishlist";
  play_status: "backlog" | "playing" | "paused" | "completed" | "dropped";
  priority: number;
  mood_tags: string[];
  steam_playtime_minutes: number;
  legacy_manual_playtime_minutes: number;
  notes: string | null;
};

export type Session = {
  id: string;
  user_game_id: string;
  played_at: string;
  duration_minutes: number;
  mood: string | null;
  notes: string | null;
  gameName?: string;
};

export type Stats = {
  total_games: number;
  owned_games: number;
  wishlist_games: number;
  backlog_games: number;
  playing_games: number;
  paused_games: number;
  completed_games: number;
  dropped_games: number;
  total_steam_playtime_minutes: number;
  legacy_manual_playtime_minutes: number;
  manual_session_minutes: number;
  session_count: number;
  last_steam_sync_at: string | null;
};

type Page<T> = { total: number; limit: number; offset: number; data: T[] };

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  if (!API_BASE) throw new ApiError("VITE_API_BASE_URL is missing. Configure your .env file.");
  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.detail || message;
    } catch { /* Keep the HTTP status message. */ }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  profile: (token: string) => request<{ id: string; email: string | null; display_name: string; steam_id: string | null }>("/me", token),
  games: async (token: string) => (await request<Page<Game>>("/games?limit=100&sort_by=updated_at&order=desc", token)).data,
  stats: (token: string) => request<Stats>("/games/stats", token),
  sessions: (token: string, gameId: string) => request<Page<Session>>(`/games/${gameId}/sessions?limit=100&offset=0`, token),
  addSession: (token: string, gameId: string, data: { duration_minutes: number; played_at: string; mood: string; notes: string }) =>
    request<Session>(`/games/${gameId}/sessions`, token, { method: "POST", body: JSON.stringify(data) }),
  deleteSession: (token: string, sessionId: string) =>
    request<void>(`/sessions/${sessionId}`, token, { method: "DELETE" }),
};