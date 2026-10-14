"""Run from the backend folder:  uvicorn app.main:app --reload --port 8000"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from . import state
from .api import explanation, health, prediction, whatif


@asynccontextmanager
async def lifespan(app: FastAPI):
    state.load()
    yield


app = FastAPI(title="Cardiovascular Risk Visualization API",
              description="Decision-support / educational use only. Not a diagnostic device.",
              version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])
for r in (health.router, prediction.router, explanation.router, whatif.router):
    app.include_router(r)
