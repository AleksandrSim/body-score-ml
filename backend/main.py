"""FastAPI server: /analyze runs the VLM; / serves the drag-and-drop UI."""
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .prompts import SYSTEM_PROMPT, USER_PROMPT
from .vlm_client import call_vlm_json

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"

app = FastAPI(title="Body Score Analyzer")
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 12 * 1024 * 1024


@app.post("/analyze")
async def analyze(image: UploadFile = File(...)) -> JSONResponse:
    mime = image.content_type or "image/jpeg"
    if mime not in ALLOWED_MIME:
        raise HTTPException(415, f"Unsupported image type: {mime}")
    body = await image.read()
    if len(body) > MAX_BYTES:
        raise HTTPException(413, "Image too large (>12 MB)")
    if not body:
        raise HTTPException(400, "Empty upload")
    try:
        result = await call_vlm_json(SYSTEM_PROMPT, USER_PROMPT, body, mime)
    except Exception as e:
        raise HTTPException(502, f"VLM call failed: {e}") from e
    return JSONResponse(result)


app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="ui")
