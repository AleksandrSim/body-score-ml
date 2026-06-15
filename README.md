# body-score-ml

VLM-powered physique / body-composition scorer. Drag-drop a body photo and a
vision-language model (Qwen3-VL) grades it like a strength coach: per-region
scores, an overall 1–100 score, estimated body-fat %, and training priorities.

## Stack
- **backend/** — FastAPI. `POST /analyze` runs the VLM; `/` serves the UI.
- **frontend/** — vanilla HTML/CSS/JS report (score ring, letter rank, region bars, bbox overlay).
- **scripts/batch_analyze.py** — batch a folder of photos into annotated images + JSON.

## VLM backends (`VLM_PROVIDER` in `.env`)
- `huggingface` (default) — local in-process Qwen3-VL (MPS/CUDA/CPU autodetect)
- `openrouter`, `dashscope`, `local` — remote OpenAI-compatible endpoints

## Run
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # pick a provider
uvicorn backend.main:app --port 8765
# open http://localhost:8765  (first run downloads weights; analysis ~60–90s on Mac MPS)
```

## Batch
```bash
python -m scripts.batch_analyze --in ./photos --out ./results
```

Scored regions: shoulders, chest, arms, abs, back, legs, posture, symmetry, body_fat, conditioning.
