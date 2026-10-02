import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const $ = (s) => document.querySelector(s);
const views = ["library", "processing", "book", "player"];
const DB_NAME = "narrador-db-v1";
const STORE = "books";
let db;

const state = {
  books: [],
  currentBook: null,
  currentChapter: 0,
  voices: [],
  segments: [],
  segmentIndex: 0,
  speaking: false,
};

const STYLE = {
  warm: { rate: 0.95, pitch: 1.00, pause: 230 },
  cinematic: { rate: 0.90, pitch: 0.97, pause: 320 },
  expressive: { rate: 1.00, pitch: 1.03, pause: 200 },
  calm: { rate: 0.86, pitch: 0.99, pause: 360 },
};

function showView(name) {
  views.forEach((v) => $(`#${v}View`).classList.toggle("active", v === name));
  window.scrollTo({ top: 0, behavior: "instant" });
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), 2800);
}

function initials(title = "Narrador") {
  return title.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("") || "NV";
}

function escapeHtml(s = "") {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}

function cleanText(text) {
  return text
    .replace(/\u00ad/g, "")
    .replace(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])-\n([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function estimateMinutes(chars) {
  return Math.max(1, Math.round(chars / 900));
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function dbAll() {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(book) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(book);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function dbDelete(id) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function loadBooks() {
  state.books = (await dbAll()).sort((a, b) => b.createdAt - a.createdAt);
  renderLibrary();
}

function renderLibrary() {
  const wrap = $("#library");
  wrap.innerHTML = "";
  $("#emptyState").classList.toggle("hidden", state.books.length > 0);
  $("#clearBtn").classList.toggle("hidden", state.books.length === 0);

  state.books.forEach((book) => {
    const btn = document.createElement("button");
    btn.className = "bookRow";
    btn.innerHTML = `<div class="miniCover">${initials(book.title)}</div><div class="grow"><h4>${escapeHtml(book.title)}</h4><p>${book.chapters.length} capítulos · ~${estimateMinutes(book.charCount)} min</p></div><div class="chev">›</div>`;
    btn.onclick = () => openBook(book.id);
    wrap.appendChild(btn);
  });
}

async function extractPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    $("#processingStatus").textContent = `Leyendo página ${i} de ${pdf.numPages}`;
    $("#progressBar").style.width = `${Math.round((i / pdf.numPages) * 74)}%`;
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let out = "";
    let lastY = null;

    for (const item of content.items) {
      const y = Math.round(item.transform?.[5] ?? 0);
      if (lastY !== null && Math.abs(y - lastY) > 5) out += "\n";
      out += item.str + " ";
      lastY = y;
    }

    pages.push(cleanText(out));
    await new Promise((r) => setTimeout(r, 0));
  }

  return { pages, numPages: pdf.numPages };
}

function detectChapters(pages) {
  const heading = /^\s*((chapter|cap[ií]tulo|part|parte|book|libro)\s+([ivxlcdm\d]+|[a-záéíóúñ]+)|prologue|pr[oó]logo|epilogue|ep[ií]logo|introduction|introducci[oó]n)\b.*$/i;
  const chapters = [];
  let current = { title: "Inicio", text: "", startPage: 1 };

  for (let i = 0; i < pages.length; i++) {
    const pageText = pages[i];
    const lines = pageText.split("\n").map((x) => x.trim()).filter(Boolean);
    let hit = -1;

    for (let j = 0; j < Math.min(lines.length, 14); j++) {
      if (heading.test(lines[j]) && lines[j].length < 110) { hit = j; break; }
    }

    if (hit >= 0 && current.text.trim().length > 350) {
      chapters.push({ ...current, text: cleanText(current.text) });
      current = { title: lines[hit], text: lines.slice(hit + 1).join("\n") + "\n", startPage: i + 1 };
    } else {
      current.text += pageText + "\n\n";
      if (hit >= 0 && current.title === "Inicio") current.title = lines[hit];
    }
  }

  if (current.text.trim()) chapters.push({ ...current, text: cleanText(current.text) });

  if (chapters.length === 1 && chapters[0].text.length > 18000) {
    const text = chapters[0].text;
    const result = [];
    let pos = 0;
    let n = 1;
    while (pos < text.length) {
      let end = Math.min(pos + 12000, text.length);
      if (end < text.length) {
        const boundary = text.lastIndexOf("\n\n", end);
        if (boundary > pos + 6000) end = boundary;
      }
      result.push({ title: `Sección ${n++}`, text: text.slice(pos, end).trim(), startPage: null });
      pos = end;
    }
    return result;
  }

  return chapters;
}

function makeDirectedSegment(text) {
  const trimmed = text.trim();
  return {
    text: trimmed,
    dialogue: /^([“\"«—-])/.test(trimmed) || /[”\"»]$/.test(trimmed),
    question: /\?$/.test(trimmed),
    exclamation: /!$/.test(trimmed),
    ellipsis: /…|\.\.\.$/.test(trimmed),
  };
}

function segmentText(text) {
  const paragraphs = text.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  const result = [];

  for (const paragraph of paragraphs) {
    const sentences = paragraph.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [paragraph];
    let buffer = "";

    for (const sentence of sentences) {
      const s = sentence.trim();
      if ((buffer + " " + s).length > 380 && buffer) {
        result.push(makeDirectedSegment(buffer.trim()));
        buffer = s;
      } else {
        buffer += (buffer ? " " : "") + s;
      }
    }

    if (buffer) result.push(makeDirectedSegment(buffer.trim()));
  }

  return result;
}

function loadVoices() {
  const all = speechSynthesis.getVoices();
  state.voices = all.filter((v) => /^es|^en/i.test(v.lang));
  if (!state.voices.length) state.voices = all;

  const sel = $("#voiceSelect");
  sel.innerHTML = "";

  state.voices.forEach((v, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${v.name} · ${v.lang}`;
    sel.appendChild(opt);
  });

  const preferred = state.voices.findIndex((v) => /premium|enhanced|siri|natural/i.test(v.name));
  if (preferred >= 0) sel.value = String(preferred);
}

function selectedVoice() {
  const idx = Number($("#voiceSelect").value);
  return state.voices[idx] || state.voices[0] || null;
}

function utteranceFor(segment) {
  const style = STYLE[$("#styleSelect").value] || STYLE.warm;
  const speed = Number($("#speedRange").value);
  const u = new SpeechSynthesisUtterance(segment.text);
  u.rate = Math.max(0.65, Math.min(1.35, style.rate * speed));
  u.pitch = style.pitch;

  if (segment.dialogue) { u.rate *= 1.02; u.pitch += 0.02; }
  if (segment.question) u.pitch += 0.03;
  if (segment.exclamation) u.rate *= 1.02;
  if (segment.ellipsis) u.rate *= 0.96;

  const voice = selectedVoice();
  if (voice) u.voice = voice;
  return u;
}

function pauseFor(segment) {
  const base = (STYLE[$("#styleSelect").value] || STYLE.warm).pause;
  if (segment.question || segment.exclamation) return base + 110;
  if (segment.ellipsis) return base + 160;
  if (segment.dialogue) return base + 40;
  return base;
}

function openBook(id) {
  speechSynthesis.cancel();
  state.speaking = false;
  state.currentBook = state.books.find((b) => b.id === id);
  if (!state.currentBook) return;

  $("#bookTitle").textContent = state.currentBook.title;
  $("#bookMeta").textContent = `${state.currentBook.pages} páginas · ${state.currentBook.chapters.length} capítulos`;
  $("#cover").textContent = initials(state.currentBook.title);
  $("#chapterCount").textContent = String(state.currentBook.chapters.length);

  const list = $("#chapters");
  list.innerHTML = "";

  state.currentBook.chapters.forEach((chapter, index) => {
    const btn = document.createElement("button");
    btn.className = "chapterRow";
    btn.innerHTML = `<div class="grow"><h4>${escapeHtml(chapter.title || `Capítulo ${index + 1}`)}</h4><p>~${estimateMinutes(chapter.text.length)} min · ${chapter.text.length.toLocaleString()} caracteres</p></div><div class="chev">›</div>`;
    btn.onclick = () => openPlayer(index);
    list.appendChild(btn);
  });

  showView("book");
}

function openPlayer(index) {
  speechSynthesis.cancel();
  state.currentChapter = index;
  state.segmentIndex = 0;
  state.speaking = false;
  state.segments = segmentText(state.currentBook.chapters[index].text);

  $("#playerCover").textContent = initials(state.currentBook.title);
  $("#playerBook").textContent = state.currentBook.title;
  $("#playerChapter").textContent = state.currentBook.chapters[index].title || `Capítulo ${index + 1}`;

  updatePlayer();
  showView("player");
}

function updatePlayer() {
  const total = Math.max(1, state.segments.length);
  const current = Math.min(state.segmentIndex, total - 1);
  const pct = Math.round((current / total) * 100);

  $("#speechProgress").style.width = `${pct}%`;
  $("#speechPercent").textContent = `${pct}%`;
  $("#speechSegment").textContent = `${Math.min(current + 1, total)} / ${total}`;
  $("#currentText").textContent = state.segments[current]?.text || "No hay texto.";
  $("#playBtn").textContent = state.speaking ? "Ⅱ" : "▶";
}

function speakSegment(index) {
  if (!state.segments.length) return;
  speechSynthesis.cancel();
  state.segmentIndex = Math.max(0, Math.min(index, state.segments.length - 1));

  const segment = state.segments[state.segmentIndex];
  const u = utteranceFor(segment);

  u.onstart = () => { state.speaking = true; updatePlayer(); };
  u.onend = () => {
    if (!state.speaking) return;
    if (state.segmentIndex < state.segments.length - 1) {
      const wait = pauseFor(segment);
      state.segmentIndex++;
      updatePlayer();
      setTimeout(() => { if (state.speaking) speakSegment(state.segmentIndex); }, wait);
    } else {
      state.speaking = false;
      updatePlayer();
    }
  };

  u.onerror = () => {
    state.speaking = false;
    updatePlayer();
    toast("La voz del dispositivo se detuvo.");
  };

  speechSynthesis.speak(u);
}

function togglePlay() {
  if (state.speaking) {
    state.speaking = false;
    speechSynthesis.cancel();
    updatePlayer();
  } else {
    state.speaking = true;
    speakSegment(state.segmentIndex);
  }
}

async function importFile(file) {
  if (!file) return;
  if (file.type && file.type !== "application/pdf") return toast("Selecciona un PDF.");

  showView("processing");
  $("#progressBar").style.width = "5%";
  $("#processingTitle").textContent = "Analizando el libro…";
  $("#processingStatus").textContent = "Abriendo el PDF.";

  try {
    const { pages, numPages } = await extractPdf(file);
    $("#processingStatus").textContent = "Detectando capítulos y preparando la narración…";
    $("#progressBar").style.width = "86%";

    const chapters = detectChapters(pages);
    const charCount = chapters.reduce((n, c) => n + c.text.length, 0);
    if (charCount < 120) throw new Error("scanned");

    const book = {
      id: crypto.randomUUID?.() || `${Date.now()}`,
      title: file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "),
      pages: numPages,
      chapters,
      charCount,
      createdAt: Date.now(),
    };

    await dbPut(book);
    state.books.unshift(book);
    $("#progressBar").style.width = "100%";
    $("#processingStatus").textContent = "Listo.";
    renderLibrary();
    setTimeout(() => openBook(book.id), 350);
  } catch (err) {
    console.error(err);
    showView("library");
    toast(err?.message === "scanned" ? "Ese PDF parece escaneado. Esta versión necesita texto seleccionable." : "No pude leer ese PDF. Prueba otro archivo.");
  }
}

for (const id of ["#pdfInput", "#pdfInput2"]) {
  $(id).addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    importFile(file);
    e.target.value = "";
  });
}

$("#previewBtn").onclick = () => {
  const text = state.currentBook?.chapters?.[0]?.text || "";
  const sample = segmentText(text.slice(0, 900))[0];
  if (!sample) return toast("No hay texto para la muestra.");
  speechSynthesis.cancel();
  speechSynthesis.speak(utteranceFor(sample));
};

$("#speedRange").oninput = (e) => {
  $("#speedLabel").textContent = `${Number(e.target.value).toFixed(2)}×`;
};

$("#playBtn").onclick = togglePlay;
$("#prevBtn").onclick = () => {
  state.speaking = false;
  speechSynthesis.cancel();
  state.segmentIndex = Math.max(0, state.segmentIndex - 1);
  updatePlayer();
};
$("#nextBtn").onclick = () => {
  state.speaking = false;
  speechSynthesis.cancel();
  state.segmentIndex = Math.min(Math.max(0, state.segments.length - 1), state.segmentIndex + 1);
  updatePlayer();
};

$("#clearBtn").onclick = async () => {
  if (!confirm("¿Eliminar todos los libros guardados en este dispositivo?")) return;
  for (const book of state.books) await dbDelete(book.id);
  state.books = [];
  renderLibrary();
};

document.addEventListener("click", (e) => {
  const go = e.target?.dataset?.go;
  if (!go) return;
  state.speaking = false;
  speechSynthesis.cancel();
  showView(go);
});

speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();
await openDB();
await loadBooks();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
