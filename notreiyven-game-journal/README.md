# Notreiyven Game Journal

A small, separate React + Vite frontend for recording gaming sessions. It reuses your existing FastAPI deployment, Supabase Auth, and database. It does not create or migrate any database tables.

## 1. Configure

Copy `.env.example` to `.env` and fill in:

- `VITE_API_BASE_URL`: URL of your existing FastAPI deployment.
- `VITE_SUPABASE_URL`: the same Supabase project URL used by your API.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the same publishable/anon key used by your API.

Do **not** put `SUPABASE_SECRET_KEY`, a service-role key, or your Steam API key in this frontend.

## 2. Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## 3. Build

```bash
npm run build
npm run preview
```

Deploy this folder as a separate Vercel project. Vercel's framework preset should detect Vite. Add the three `VITE_` environment variables in the Vercel project settings.

## 4. How it works

- Supabase JS handles sign-in and sign-up against the same Supabase project.
- The Supabase access token is sent as `Authorization: Bearer ...` to your existing FastAPI API.
- Games are loaded from `GET /api/v1/games`.
- Dashboard statistics come from `GET /api/v1/games/stats`.
- Session history is loaded for each game using `GET /api/v1/games/{user_game_id}/sessions`.
- New sessions are saved using `POST /api/v1/games/{user_game_id}/sessions`.
- Session deletion uses `DELETE /api/v1/sessions/{session_id}`.

## 5. Existing API assumptions

This frontend matches the API code supplied with the project. It expects:
- `GET /api/v1/me` to return the signed-in profile.
- `GET /api/v1/games` to return `{ total, limit, offset, data }`.
- `GET /api/v1/games/stats` to return the `GameStats` object.
- Session list responses to return `{ total, limit, offset, data }`.

Your API currently lists sessions per game, so the Journal page loads session history for each game in the library. This is fine for a small personal library. If your API is later expanded with a global sessions endpoint, the Journal page can be made more efficient.

## 6. Important

Your current API uses the Supabase secret key server-side to access data, while verifying the user's Supabase token separately. Keep that secret key only in the API's server environment. Never add it to this frontend.


## 7. Enable CORS on the existing FastAPI backend

Because this is a separate website/domain, the existing API must allow the frontend origin. Your supplied `app/main.py` does not currently configure CORS.

Add this to the existing API's `app/main.py`:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://YOUR-GAME-JOURNAL.vercel.app",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
```

Replace `https://YOUR-GAME-JOURNAL.vercel.app` with the actual deployed frontend domain, then redeploy the API. If you use a custom domain, add that origin too. Avoid `allow_origins=["*"]` for a deployed application.

## 8. Supabase profile requirement

Your API's authentication code requires a matching row in `profiles` for every authenticated Supabase user. This frontend sends the signed-in user's Supabase access token to the API, but it does not create profile rows directly. Keep using the profile-creation trigger or mechanism already configured for Backlog Compass. If a newly registered account signs in but the API responds that the account has no profile, check that trigger and the `profiles` row.

