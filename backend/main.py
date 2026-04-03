from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.matches import router as matches_router
from backend.api.sessions import router as sessions_router
from backend.api.users import router as users_router
from backend.config import settings
from backend.db import Base, engine

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500", "http://localhost:5500", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "PeerStud Backend Running"}


app.include_router(users_router)
app.include_router(matches_router)
app.include_router(sessions_router)
