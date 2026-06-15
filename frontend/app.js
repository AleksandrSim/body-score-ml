const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const ctaBtn = document.querySelector(".cta");
const report = document.getElementById("report");
const preview = document.getElementById("preview");
const overlay = document.getElementById("overlay");
const statusEl = document.getElementById("status");
const overallEl = document.getElementById("overall");
const ringFill = document.getElementById("ring-fill");
const headlineEl = document.getElementById("headline");
const summaryEl = document.getElementById("summary");
const bfEl = document.getElementById("bf");
const rankEl = document.getElementById("rank");
const conditionEl = document.getElementById("condition");
const regionsEl = document.getElementById("regions");
const prioritiesEl = document.getElementById("priorities");
const strongestEl = document.getElementById("strongest");
const resetBtn = document.getElementById("reset");

const REGION_ORDER = ["shoulders","chest","arms","abs","back","legs","posture","symmetry","body_fat","conditioning"];
const RING_C = 2 * Math.PI * 85;  // circumference matches r=85 in svg

drop.addEventListener("click", (e) => { if (e.target.tagName !== "BUTTON") fileInput.click(); });
ctaBtn.addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener("change", (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); });

["dragenter","dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave","drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });

resetBtn.addEventListener("click", () => {
  report.classList.add("hidden");
  drop.classList.remove("hidden");
  overlay.innerHTML = "";
  regionsEl.innerHTML = "";
  prioritiesEl.innerHTML = "";
  strongestEl.innerHTML = "";
  fileInput.value = "";
  overallEl.textContent = "–";
  ringFill.setAttribute("stroke-dashoffset", RING_C);
});

async function handleFile(file) {
  if (!file.type.startsWith("image/")) { alert("Please choose an image file."); return; }
  preview.src = URL.createObjectURL(file);
  drop.classList.add("hidden");
  report.classList.remove("hidden");
  statusEl.textContent = "Analyzing… first run can take 60–90s";
  overlay.innerHTML = "";
  regionsEl.innerHTML = "";
  prioritiesEl.innerHTML = "";
  strongestEl.innerHTML = "";
  overallEl.textContent = "–";
  bfEl.textContent = "–"; rankEl.textContent = "–"; conditionEl.textContent = "–";
  headlineEl.textContent = "Analyzing…";
  summaryEl.textContent = "";
  ringFill.setAttribute("stroke-dashoffset", RING_C);

  const fd = new FormData();
  fd.append("image", file);
  try {
    const resp = await fetch("/analyze", { method: "POST", body: fd });
    if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`);
    render(await resp.json());
  } catch (err) {
    statusEl.textContent = "";
    headlineEl.textContent = "Error";
    summaryEl.textContent = err.message;
  }
}

function gradeColor(score) {
  if (score == null) return ["#3a3f4d", "rgba(124,242,195,0)"];
  if (score >= 8) return ["#7cf2c3", "rgba(124,242,195,0.6)"];
  if (score >= 6) return ["#6aa5ff", "rgba(106,165,255,0.5)"];
  if (score >= 4) return ["#ffb86a", "rgba(255,184,106,0.5)"];
  return ["#ff7a7a", "rgba(255,122,122,0.5)"];
}

function rankFromScore(s) {
  if (s == null) return "–";
  if (s >= 92) return "S";
  if (s >= 88) return "A+";
  if (s >= 82) return "A";
  if (s >= 76) return "A−";
  if (s >= 70) return "B+";
  if (s >= 64) return "B";
  if (s >= 58) return "B−";
  if (s >= 52) return "C+";
  if (s >= 46) return "C";
  return "C−";
}

function headlineFromScore(s) {
  if (s == null) return "—";
  if (s >= 88) return "Elite physique";
  if (s >= 78) return "Strong physique";
  if (s >= 68) return "Solid physique";
  if (s >= 58) return "Developing physique";
  return "Foundation phase";
}

function conditioningWord(score) {
  if (score == null) return "–";
  if (score >= 8) return "Elite";
  if (score >= 6) return "Strong";
  if (score >= 4) return "Fair";
  return "Soft";
}

function render(data) {
  statusEl.textContent = "";
  const overall = data.overall_score;
  overallEl.textContent = overall ?? "–";
  headlineEl.textContent = headlineFromScore(overall);
  summaryEl.textContent = data.summary || "";
  bfEl.textContent = data.estimated_body_fat_percent ?? "–";
  rankEl.textContent = rankFromScore(overall);

  const cond = (data.regions || {}).conditioning?.score;
  conditionEl.textContent = conditioningWord(cond);

  // animate ring
  const pct = Math.max(0, Math.min(1, (overall || 0) / 100));
  requestAnimationFrame(() => {
    ringFill.setAttribute("stroke-dashoffset", RING_C * (1 - pct));
  });

  // regions
  const regions = data.regions || {};
  regionsEl.innerHTML = "";
  REGION_ORDER.forEach((key) => {
    const r = regions[key];
    if (!r) return;
    const [c, glow] = gradeColor(r.score);
    const row = document.createElement("div");
    row.className = "region";
    row.style.setProperty("--seg-c", c);
    row.style.setProperty("--seg-glow", glow);

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = key.replace(/_/g, " ");

    const segs = document.createElement("div");
    segs.className = "segments";
    for (let i = 1; i <= 10; i++) {
      const s = document.createElement("div");
      s.className = "seg" + (r.score != null && i <= r.score ? " on" : "");
      segs.appendChild(s);
    }

    const num = document.createElement("div");
    num.className = "num";
    num.textContent = r.score == null ? "–" : r.score;

    const note = document.createElement("div");
    note.className = "note";
    note.textContent = `${r.grade ? r.grade.toUpperCase() + " — " : ""}${r.notes || ""}`;

    row.append(name, segs, num, note);
    row.addEventListener("click", () => {
      const willOpen = !row.classList.contains("active");
      document.querySelectorAll(".region").forEach((el) => el.classList.remove("active"));
      if (willOpen) {
        row.classList.add("active");
        highlightRegion(key, regions);
      } else {
        drawAllBoxes(regions);
      }
    });
    regionsEl.appendChild(row);
  });

  // priorities & strongest
  prioritiesEl.innerHTML = "";
  (data.priorities || []).forEach((p) => {
    const li = document.createElement("li");
    li.textContent = p;
    prioritiesEl.appendChild(li);
  });
  strongestEl.innerHTML = "";
  (data.strongest_areas || []).forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s.replace(/_/g, " ");
    strongestEl.appendChild(li);
  });

  drawAllBoxes(regions);
}

function drawAllBoxes(regions) {
  overlay.innerHTML = "";
  for (const [key, r] of Object.entries(regions)) {
    if (!r || !r.bbox) continue;
    const [x, y, w, h] = r.bbox;
    if (w < 0.01 || h < 0.01) continue;
    const [c] = gradeColor(r.score);
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x); rect.setAttribute("y", y);
    rect.setAttribute("width", w); rect.setAttribute("height", h);
    rect.setAttribute("stroke", c);
    overlay.appendChild(rect);
  }
}

function highlightRegion(key, regions) {
  overlay.innerHTML = "";
  const r = regions[key];
  if (!r || !r.bbox) return;
  const [x, y, w, h] = r.bbox;
  const [c] = gradeColor(r.score);
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", x); rect.setAttribute("y", y);
  rect.setAttribute("width", w); rect.setAttribute("height", h);
  rect.setAttribute("stroke", c);
  rect.setAttribute("stroke-width", "0.01");
  overlay.appendChild(rect);
  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.setAttribute("x", x + 0.005); label.setAttribute("y", y + 0.03);
  label.textContent = `${key.replace(/_/g, " ")} ${r.score ?? "?"}`;
  overlay.appendChild(label);
}
