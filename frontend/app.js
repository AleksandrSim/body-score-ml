const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const ctaBtn = document.querySelector(".cta");
const report = document.getElementById("report");
const preview = document.getElementById("preview");
const statusEl = document.getElementById("status");
const progressEl = document.getElementById("progress");
const progressBar = document.getElementById("progress-bar");

// Time-based progress: the backend doesn't stream, so we ease toward ~95%
// over the expected duration and snap to 100% when the result arrives.
let progressRAF = null;
function startProgress() {
  const start = performance.now();
  const TAU = 28000; // seconds-scale; ~92% by 75s
  progressEl.classList.remove("hidden", "done");
  progressBar.style.width = "0%";
  cancelAnimationFrame(progressRAF);
  const tick = (now) => {
    const elapsed = now - start;
    const pct = 95 * (1 - Math.exp(-elapsed / TAU));
    progressBar.style.width = pct.toFixed(1) + "%";
    statusEl.textContent = `Analyzing… ${Math.round(elapsed / 1000)}s`;
    progressRAF = requestAnimationFrame(tick);
  };
  progressRAF = requestAnimationFrame(tick);
}
function finishProgress() {
  cancelAnimationFrame(progressRAF);
  progressBar.style.width = "100%";
  setTimeout(() => progressEl.classList.add("hidden"), 500);
}
function resetProgress() {
  cancelAnimationFrame(progressRAF);
  progressEl.classList.add("hidden");
  progressBar.style.width = "0%";
}
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

// ---------- Camera capture ----------
const cameraSection = document.getElementById("camera");
const cameraBtn = document.getElementById("camera-btn");
const cameraVideo = document.getElementById("camera-video");
const cameraCanvas = document.getElementById("camera-canvas");
const cameraShutter = document.getElementById("camera-shutter");
const cameraCancel = document.getElementById("camera-cancel");
const cameraFlip = document.getElementById("camera-flip");
let cameraStream = null;
let facingMode = "environment"; // rear by default; Flip toggles to selfie

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Camera not supported in this browser.");
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    });
  } catch (err) {
    alert("Could not access camera: " + err.message + "\n(Camera needs HTTPS or localhost.)");
    return;
  }
  cameraVideo.srcObject = cameraStream;
  drop.classList.add("hidden");
  cameraSection.classList.remove("hidden");
}

function closeCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach((t) => t.stop()); cameraStream = null; }
  cameraSection.classList.add("hidden");
  drop.classList.remove("hidden");
}

function capturePhoto() {
  const w = cameraVideo.videoWidth, h = cameraVideo.videoHeight;
  if (!w || !h) return;
  cameraCanvas.width = w; cameraCanvas.height = h;
  cameraCanvas.getContext("2d").drawImage(cameraVideo, 0, 0, w, h);
  cameraCanvas.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
    closeCamera();
    handleFile(file);
  }, "image/jpeg", 0.92);
}

cameraBtn.addEventListener("click", (e) => { e.stopPropagation(); openCamera(); });
cameraShutter.addEventListener("click", capturePhoto);
cameraCancel.addEventListener("click", closeCamera);
cameraFlip.addEventListener("click", async () => {
  facingMode = facingMode === "environment" ? "user" : "environment";
  if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop());
  await openCamera();
});

resetBtn.addEventListener("click", () => {
  report.classList.add("hidden");
  drop.classList.remove("hidden");
  regionsEl.innerHTML = "";
  prioritiesEl.innerHTML = "";
  strongestEl.innerHTML = "";
  fileInput.value = "";
  overallEl.textContent = "–";
  ringFill.setAttribute("stroke-dashoffset", RING_C);
  resetProgress();
});

async function handleFile(file) {
  if (!file.type.startsWith("image/")) { alert("Please choose an image file."); return; }
  preview.src = URL.createObjectURL(file);
  drop.classList.add("hidden");
  report.classList.remove("hidden");
  statusEl.textContent = "Analyzing…";
  startProgress();
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
    const data = await resp.json();
    finishProgress();
    render(data);
  } catch (err) {
    resetProgress();
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
      if (willOpen) row.classList.add("active");
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
}
