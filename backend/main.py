from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.api.catalog import router as catalog_router
from backend.api.chat import router as chat_router
from backend.api.leaderboard import router as leaderboard_router
from backend.api.matches import router as matches_router
from backend.api.sessions import router as sessions_router
from backend.api.study_groups import router as study_groups_router
from backend.api.tutors import router as tutors_router
from backend.api.users import router as users_router
from backend.config import settings
from backend.db import Base, engine, ensure_runtime_schema, uploads_dir

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_origin_regex=settings.cors_allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    try:
        Base.metadata.create_all(bind=engine)
        ensure_runtime_schema()
    except Exception as exc:
        import logging
        logging.getLogger("uvicorn.error").warning("DB startup skipped (no connection): %s", exc)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "PeerStud Backend Running"}


app.include_router(users_router)
app.include_router(matches_router)
app.include_router(sessions_router)
app.include_router(catalog_router)
app.include_router(study_groups_router)
app.include_router(chat_router)
app.include_router(leaderboard_router)
app.include_router(tutors_router)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir), check_dir=False), name="uploads")
