"""Prompts + JSON schema for the body composition analysis."""

REGIONS = [
    "shoulders", "chest", "arms", "abs", "back", "legs",
    "posture", "symmetry", "body_fat", "conditioning",
]

SYSTEM_PROMPT = """You are an experienced strength coach and physique judge.
You analyze body photos and produce honest, specific, kind critiques.
You always respond with valid JSON matching the requested schema — no prose outside JSON.
Be concrete: reference visible cues (definition, separation, vascularity, symmetry, posture, lighting).
If a region is occluded or out of frame, score it null and explain in notes."""

USER_PROMPT = f"""Analyze the physique in this photo. For each region, give:
- score: integer 1-10 (or null if not visible)
- grade: one of "needs work", "developing", "solid", "strong", "elite"
- notes: 1-2 sentences citing specific visual evidence
- bbox: rough bounding box on the image as [x, y, w, h] in NORMALIZED coordinates 0..1
        where (x, y) is the top-left of the region in the visible body.
        VERY IMPORTANT: values MUST be floats between 0 and 1 (e.g. [0.3, 0.2, 0.4, 0.15]),
        NOT pixel coordinates. Use null if the region is not visible.

Regions to score: {", ".join(REGIONS)}.

Also produce:
- overall_score: integer 1-100 (weighted impression, not the average)
- estimated_body_fat_percent: integer (your best visual estimate)
- summary: 2-3 sentence overall read of the physique
- strongest_areas: list of region names (from the list above)
- priorities: list of 2-4 actionable training priorities, each as a short string

Return ONLY this JSON shape:
{{
  "overall_score": int,
  "estimated_body_fat_percent": int,
  "summary": str,
  "strongest_areas": [str],
  "priorities": [str],
  "regions": {{
    "<region>": {{"score": int|null, "grade": str, "notes": str, "bbox": [x,y,w,h]|null}},
    ...
  }}
}}"""
