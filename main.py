
from __future__ import annotations

import os
from functools import lru_cache
from typing import Any
from uuid import UUID

from fastapi import (
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    Response,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import Client, create_client


# --------------------------------------------------
# APPLICATION
# --------------------------------------------------

app = FastAPI(
    title="Notreiyven Game Journal API",
    description="Backend API for Game Journal",
    version="1.0.0",
)


# --------------------------------------------------
# CORS
# --------------------------------------------------

frontend_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("FRONTEND_ORIGIN", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# SUPABASE CONNECTION
# --------------------------------------------------

@lru_cache(maxsize=1)
def get_supabase() -> Client:
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_secret = os.getenv("SUPABASE_SECRET_KEY")

    if not supabase_url or not supabase_secret:
        raise HTTPException(
            status_code=500,
            detail="Missing backend Supabase configuration.",
        )

    return create_client(
        supabase_url.rstrip("/"),
        supabase_secret,
    )


# --------------------------------------------------
# AUTHENTICATION
# --------------------------------------------------

def get_current_user(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:

    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
        )

    if not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header.",
        )

    token = authorization.split(" ", 1)[1].strip()

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Missing access token.",
        )

    try:
        response = get_supabase().auth.get_user(token)

        user = response.user

        if user is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired session.",
            )

        return {
            "id": str(user.id),
            "email": user.email,
            "user_metadata": user.user_metadata or {},
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session.",
        )


# --------------------------------------------------
# SCHEMAS
# --------------------------------------------------

class SessionCreate(BaseModel):
    duration_minutes: int = Field(gt=0, le=100000)
    played_at: str
    mood: str | None = None
    notes: str | None = None


# --------------------------------------------------
# HELPERS
# --------------------------------------------------

def paginated_response(
    data: list,
    total: int,
    limit: int,
    offset: int,
):
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "data": data,
    }


# --------------------------------------------------
# GENERAL ROUTES
# --------------------------------------------------

@app.get("/")
def root():
    return {
        "name": "Notreiyven Game Journal API",
        "status": "online",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
    }


# --------------------------------------------------
# PROFILE
# GET /api/v1/me
# --------------------------------------------------

@app.get("/api/v1/me")
def get_profile(
    user: dict = Depends(get_current_user),
):

    metadata = user["user_metadata"]
    email = user["email"]

    return {
        "id": user["id"],
        "email": email,
        "display_name": (
            metadata.get("display_name")
            or (email.split("@")[0] if email else "Player")
        ),
        "steam_id": metadata.get("steam_id"),
    }


# --------------------------------------------------
# GAMES
# GET /api/v1/games
# --------------------------------------------------

@app.get("/api/v1/games")
def get_games(
    user: dict = Depends(get_current_user),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    sort_by: str = Query(default="updated_at"),
    order: str = Query(
        default="desc",
        pattern="^(asc|desc)$",
    ),
):

    allowed_sort_fields = {
        "updated_at",
        "created_at",
        "name",
        "priority",
    }

    if sort_by not in allowed_sort_fields:
        raise HTTPException(
            status_code=400,
            detail="Invalid sorting field.",
        )

    try:
        result = (
            get_supabase()
            .table("game_journal_games")
            .select("*", count="exact")
            .eq("user_id", user["id"])
            .order(
                sort_by,
                desc=(order == "desc"),
            )
            .range(
                offset,
                offset + limit - 1,
            )
            .execute()
        )

        return paginated_response(
            result.data or [],
            result.count or 0,
            limit,
            offset,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not retrieve games: {exc}",
        )


# --------------------------------------------------
# GAME STATISTICS
# GET /api/v1/games/stats
# --------------------------------------------------

@app.get("/api/v1/games/stats")
def get_game_stats(
    user: dict = Depends(get_current_user),
):

    try:
        client = get_supabase()

        games_result = (
            client.table("game_journal_games")
            .select(
                "acquisition_status,"
                "play_status,"
                "steam_playtime_minutes,"
                "legacy_manual_playtime_minutes"
            )
            .eq("user_id", user["id"])
            .execute()
        )

        sessions_result = (
            client.table("game_journal_sessions")
            .select("duration_minutes")
            .eq("user_id", user["id"])
            .execute()
        )

        games = games_result.data or []
        sessions = sessions_result.data or []

        acquisition_statuses = [
            game.get("acquisition_status")
            for game in games
        ]

        play_statuses = [
            game.get("play_status")
            for game in games
        ]

        return {
            "total_games": len(games),

            "owned_games": acquisition_statuses.count("owned"),
            "wishlist_games": acquisition_statuses.count("wishlist"),

            "backlog_games": play_statuses.count("backlog"),
            "playing_games": play_statuses.count("playing"),
            "paused_games": play_statuses.count("paused"),
            "completed_games": play_statuses.count("completed"),
            "dropped_games": play_statuses.count("dropped"),

            "total_steam_playtime_minutes": sum(
                int(game.get("steam_playtime_minutes") or 0)
                for game in games
            ),

            "legacy_manual_playtime_minutes": sum(
                int(game.get("legacy_manual_playtime_minutes") or 0)
                for game in games
            ),

            "manual_session_minutes": sum(
                int(session.get("duration_minutes") or 0)
                for session in sessions
            ),

            "session_count": len(sessions),

            "last_steam_sync_at": None,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not calculate statistics: {exc}",
        )


# --------------------------------------------------
# GAME SESSIONS
# GET /api/v1/games/{game_id}/sessions
# --------------------------------------------------

@app.get("/api/v1/games/{game_id}/sessions")
def get_sessions(
    game_id: UUID,
    user: dict = Depends(get_current_user),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):

    try:
        result = (
            get_supabase()
            .table("game_journal_sessions")
            .select("*", count="exact")
            .eq("user_id", user["id"])
            .eq("user_game_id", str(game_id))
            .order(
                "played_at",
                desc=True,
            )
            .range(
                offset,
                offset + limit - 1,
            )
            .execute()
        )

        return paginated_response(
            result.data or [],
            result.count or 0,
            limit,
            offset,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not retrieve sessions: {exc}",
        )


# --------------------------------------------------
# CREATE GAME SESSION
# POST /api/v1/games/{game_id}/sessions
# --------------------------------------------------

@app.post(
    "/api/v1/games/{game_id}/sessions",
    status_code=201,
)
def create_session(
    game_id: UUID,
    payload: SessionCreate,
    user: dict = Depends(get_current_user),
):

    client = get_supabase()

    try:
        game_result = (
            client.table("game_journal_games")
            .select("id")
            .eq("id", str(game_id))
            .eq("user_id", user["id"])
            .limit(1)
            .execute()
        )

        if not game_result.data:
            raise HTTPException(
                status_code=404,
                detail="Game not found.",
            )

        result = (
            client.table("game_journal_sessions")
            .insert({
                "user_id": user["id"],
                "user_game_id": str(game_id),
                "played_at": payload.played_at,
                "duration_minutes": payload.duration_minutes,
                "mood": payload.mood,
                "notes": payload.notes,
            })
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=500,
                detail="Session creation failed.",
            )

        return result.data[0]

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not create session: {exc}",
        )


# --------------------------------------------------
# DELETE GAME SESSION
# DELETE /api/v1/sessions/{session_id}
# --------------------------------------------------

@app.delete(
    "/api/v1/sessions/{session_id}",
    status_code=204,
)
def delete_session(
    session_id: UUID,
    user: dict = Depends(get_current_user),
):

    try:
        result = (
            get_supabase()
            .table("game_journal_sessions")
            .delete()
            .eq("id", str(session_id))
            .eq("user_id", user["id"])
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=404,
                detail="Session not found.",
            )

        return Response(status_code=204)

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not delete session: {exc}",
        )
