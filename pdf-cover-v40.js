// Narrador v40 — automatically use the first PDF page as the book cover.
// This works even when page 1 is an image-only cover because PDF.js renders the page visually.
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const DB_NAME = "narrador-db-v1";
const STORE = "books";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function titleFromFile(file) {
  return String(file?.name || "")
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function allBooks() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function putBook(book) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(book);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function renderFirstPageCover(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);

  // Render crisply, then fit the complete page inside a 2:3 portrait canvas.
  const baseViewport = page.getViewport({ scale: 1 });
  const renderScale = Math.min(2.25, Math.max(1.25, 1100 / Math.max(1, baseViewport.width)));
  const viewport = page.getViewport({ scale: renderScale });

  const pageCanvas = document.createElement("canvas");
  pageCanvas.width = Math.max(1, Math.round(viewport.width));
  pageCanvas.height = Math.max(1, Math.round(viewport.height));
  const pageCtx = pageCanvas.getContext("2d", { alpha: false });
  pageCtx.fillStyle = "#fff";
  pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
  await page.render({ canvasContext: pageCtx, viewport }).promise;

  const width = 900;
  const height = 1350;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d", { alpha: false });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  const scale = Math.min(width / pageCanvas.width, height / pageCanvas.height);
  const w = pageCanvas.width * scale;
  const h = pageCanvas.height * scale;
  ctx.drawImage(pageCanvas, (width - w) / 2, (height - h) / 2, w, h);

  try { await pdf.destroy(); } catch (_) {}
  return out.toDataURL("image/jpeg", 0.9);
}

async function waitForImportedBook(expectedTitle, startedAt) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const books = await allBooks();
      const candidates = books
        .filter((book) => String(book.title || "").trim() === expectedTitle && Number(book.createdAt || 0) >= startedAt - 5000)
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      if (candidates[0]) return candidates[0];
    } catch (_) {}
    await sleep(350);
  }
  return null;
}

function applyCoverLive(book, dataUrl) {
  const currentTitle = document.querySelector("#bookTitle")?.textContent?.trim();
  if (currentTitle === String(book.title || "").trim()) {
    const cover = document.querySelector("#cover");
    if (cover) {
      cover.textContent = "";
      cover.classList.add("hasCustomCover");
      cover.style.backgroundImage = `url(${JSON.stringify(dataUrl).slice(1, -1)})`;
      cover.style.backgroundSize = "contain";
      cover.style.backgroundPosition = "center";
      cover.style.backgroundRepeat = "no-repeat";
      cover.style.backgroundColor = "#fff";
    }
  }

  document.querySelectorAll("#library .bookRow").forEach((row) => {
    const title = row.querySelector("h4")?.textContent?.trim();
    if (title !== String(book.title || "").trim()) return;
    const mini = row.querySelector(".miniCover");
    if (!mini) return;
    mini.textContent = "";
    mini.style.backgroundImage = `url(${JSON.stringify(dataUrl).slice(1, -1)})`;
    mini.style.backgroundSize = "contain";
    mini.style.backgroundPosition = "center";
    mini.style.backgroundRepeat = "no-repeat";
    mini.style.backgroundColor = "#fff";
  });
}

async function processSelectedPdf(file) {
  const startedAt = Date.now();
  const expectedTitle = titleFromFile(file);
  if (!expectedTitle) return;

  try {
    const coverDataUrl = await renderFirstPageCover(file);
    const book = await waitForImportedBook(expectedTitle, startedAt);
    if (!book) return;

    // Do not overwrite a cover the user manually chose during the import.
    if (!book.coverDataUrl) {
      book.coverDataUrl = coverDataUrl;
      book.coverSource = "pdf-first-page";
      await putBook(book);
    }

    const finalCover = book.coverDataUrl || coverDataUrl;
    applyCoverLive(book, finalCover);
    setTimeout(() => applyCoverLive(book, finalCover), 500);
    setTimeout(() => applyCoverLive(book, finalCover), 1400);
  } catch (error) {
    console.warn("Narrador v40: no se pudo generar la portada automática", error);
  }
}

// Capture phase matters: app.js clears input.value in its own change handler.
document.addEventListener("change", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.id !== "pdfInput" && input.id !== "pdfInput2") return;
  const file = input.files?.[0];
  if (!file) return;
  if (file.type && file.type !== "application/pdf") return;
  processSelectedPdf(file);
}, true);