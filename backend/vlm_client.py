"""VLM client. In-process HuggingFace (default) + remote OpenAI-compatible endpoints."""
import asyncio
import base64
import io
import json
import os
import re
import threading
from dataclasses import dataclass
from typing import Any

import httpx

# ---------- HuggingFace local backend ----------

_HF_MODEL = None
_HF_PROCESSOR = None
_HF_LOCK = threading.Lock()


def _ensure_hf_loaded() -> None:
    global _HF_MODEL, _HF_PROCESSOR
    if _HF_MODEL is not None:
        return
    with _HF_LOCK:
        if _HF_MODEL is not None:
            return
        import torch
        from transformers import AutoModelForImageTextToText, AutoProcessor

        model_id = os.getenv("HF_MODEL", "Qwen/Qwen3-VL-4B-Instruct")
        print(f"[vlm] loading {model_id} (first run downloads weights, can take a few minutes)…", flush=True)
        processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
        if torch.cuda.is_available():
            dtype, device_map = torch.bfloat16, "auto"
        elif torch.backends.mps.is_available():
            dtype, device_map = torch.float16, {"": "mps"}
        else:
            dtype, device_map = torch.float32, {"": "cpu"}
        model = AutoModelForImageTextToText.from_pretrained(
            model_id, torch_dtype=dtype, device_map=device_map, trust_remote_code=True
        )
        model.eval()
        _HF_PROCESSOR = processor
        _HF_MODEL = model
        print("[vlm] model ready", flush=True)


def _hf_generate_sync(system_prompt: str, user_prompt: str, image_bytes: bytes) -> str:
    import torch
    from PIL import Image

    _ensure_hf_loaded()
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    # MPS chokes on huge images; cap long edge so visual-token count stays sane
    max_edge = int(os.getenv("HF_MAX_IMAGE_EDGE", "1280"))
    if max(img.size) > max_edge:
        s = max_edge / max(img.size)
        img = img.resize((int(img.width * s), int(img.height * s)), Image.LANCZOS)

    messages = [
        {"role": "system", "content": [{"type": "text", "text": system_prompt}]},
        {"role": "user", "content": [
            {"type": "image", "image": img},
            {"type": "text", "text": user_prompt},
        ]},
    ]
    inputs = _HF_PROCESSOR.apply_chat_template(
        messages, add_generation_prompt=True, tokenize=True,
        return_dict=True, return_tensors="pt",
    ).to(_HF_MODEL.device)
    with torch.no_grad():
        out = _HF_MODEL.generate(**inputs, max_new_tokens=1536, do_sample=False)
    new_tokens = out[0][inputs["input_ids"].shape[1]:]
    return _HF_PROCESSOR.decode(new_tokens, skip_special_tokens=True)


# ---------- Remote OpenAI-compatible backend ----------

@dataclass
class RemoteConfig:
    base_url: str
    api_key: str
    model: str
    extra_headers: dict[str, str]


def _load_remote(provider: str) -> RemoteConfig:
    if provider == "openrouter":
        key = os.getenv("OPENROUTER_API_KEY", "")
        if not key:
            raise RuntimeError("OPENROUTER_API_KEY is not set")
        return RemoteConfig(
            "https://openrouter.ai/api/v1", key,
            os.getenv("OPENROUTER_MODEL", "qwen/qwen3-vl-4b-instruct"),
            {"HTTP-Referer": "http://localhost:8765", "X-Title": "body-score-analyzer"},
        )
    if provider == "dashscope":
        key = os.getenv("DASHSCOPE_API_KEY", "")
        if not key:
            raise RuntimeError("DASHSCOPE_API_KEY is not set")
        return RemoteConfig(
            "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", key,
            os.getenv("DASHSCOPE_MODEL", "qwen3-vl-plus"), {},
        )
    if provider == "local":
        return RemoteConfig(
            os.getenv("LOCAL_VLM_BASE_URL", "http://localhost:8000/v1"),
            os.getenv("LOCAL_VLM_API_KEY", "EMPTY"),
            os.getenv("LOCAL_VLM_MODEL", "Qwen/Qwen3-VL-4B-Instruct"), {},
        )
    raise RuntimeError(f"Unknown VLM_PROVIDER: {provider}")


def _image_to_data_url(image_bytes: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(image_bytes).decode('ascii')}"


async def _remote_call(cfg: RemoteConfig, system_prompt: str, user_prompt: str, data_url: str) -> str:
    payload = {
        "model": cfg.model, "temperature": 0.2, "max_tokens": 2048,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text", "text": user_prompt},
            ]},
        ],
    }
    headers = {"Authorization": f"Bearer {cfg.api_key}", "Content-Type": "application/json", **cfg.extra_headers}
    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(f"{cfg.base_url}/chat/completions", json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    content = data["choices"][0]["message"]["content"]
    if isinstance(content, list):
        content = "".join(p.get("text", "") for p in content if isinstance(p, dict))
    return content


# ---------- Public entrypoint ----------

def _strip_json_fence(text: str) -> str:
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1)
    brace = re.search(r"(\{.*\})", text, re.DOTALL)
    return brace.group(1) if brace else text


def _normalize_bboxes(result: dict, image_w: int, image_h: int) -> dict:
    """If the model returned pixel bboxes (any value > 1), normalize to 0..1."""
    regions = result.get("regions") or {}
    for r in regions.values():
        if not r or not r.get("bbox"):
            continue
        bbox = r["bbox"]
        if len(bbox) != 4:
            r["bbox"] = None
            continue
        if any(v > 1.0 for v in bbox):
            x, y, w, h = bbox
            r["bbox"] = [x / image_w, y / image_h, w / image_w, h / image_h]
    return result


async def call_vlm_json(system_prompt: str, user_prompt: str, image_bytes: bytes, mime: str) -> dict[str, Any]:
    provider = os.getenv("VLM_PROVIDER", "huggingface").lower()
    if provider in {"huggingface", "hf"}:
        content = await asyncio.to_thread(_hf_generate_sync, system_prompt, user_prompt, image_bytes)
    else:
        cfg = _load_remote(provider)
        data_url = _image_to_data_url(image_bytes, mime)
        content = await _remote_call(cfg, system_prompt, user_prompt, data_url)

    raw = _strip_json_fence(content)
    try:
        result = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"VLM returned non-JSON content: {content[:500]}") from e

    from PIL import Image
    with Image.open(io.BytesIO(image_bytes)) as im:
        result = _normalize_bboxes(result, im.width, im.height)
    return result
