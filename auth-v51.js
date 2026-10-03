// Narrador v51 — local accounts, password login and per-user libraries.
// Accounts are stored only on this device for now. Existing books are migrated
// automatically into the first account created on the device.
(() => {
  const AUTH_DB = "narrador-auth-v1";
  const AUTH_VERSION = 1;
  const USERS = "users";
  const SESSION_KEY = "narrador-auth-session-v51";
  const PREF_KEY = "narrador-voice-prefs-v10";
  const SCOPED_DBS = new Set(["narrador-db-v1", "narrador-audio-v1"]);
  const encoder = new TextEncoder();

  const idbProto = Object.getPrototypeOf(indexedDB);
  const nativeOpenFn = idbProto.open;
  const nativeOpen = (name, version) => version === undefined
    ? nativeOpenFn.call(indexedDB, name)
    : nativeOpenFn.call(indexedDB, name, version);

  const storageProto = Storage.prototype;
  const nativeGet = storageProto.getItem;
  const nativeSet = storageProto.setItem;
  const nativeRemove = storageProto.removeItem;

  function readSessionRaw() {
    try { return JSON.parse(nativeGet.call(localStorage, SESSION_KEY) || "null"); }
    catch (_) { return null; }
  }

  let session = readSessionRaw();
  let activeUserId = session?.userId ? String(session.userId) : "";

  function scopedDbName(name) {
    name = String(name);
    return activeUserId && SCOPED_DBS.has(name) ? `${name}::${activeUserId}` : name;
  }

  function scopedStorageKey(key) {
    key = String(key);
    return activeUserId && key === PREF_KEY ? `${key}::${activeUserId}` : key;
  }

  // Remap the two Narrador data databases before the rest of the app starts.
  // This lets every existing feature keep using its current DB code while each
  // signed-in profile receives a completely separate library and AI audio cache.
  try {
    idbProto.open = function(name, version) {
      const mapped = scopedDbName(name);
      return version === undefined
        ? nativeOpenFn.call(this, mapped)
        : nativeOpenFn.call(this, mapped, version);
    };
  } catch (_) {
    try {
      indexedDB.open = function(name, version) {
        const mapped = scopedDbName(name);
        return version === undefined
          ? nativeOpenFn.call(indexedDB, mapped)
          : nativeOpenFn.call(indexedDB, mapped, version);
      };
    } catch (_) {}
  }

  // Voice/language preferences are profile-specific too.
  try {
    storageProto.getItem = function(key) { return nativeGet.call(this, scopedStorageKey(key)); };
    storageProto.setItem = function(key, value) { return nativeSet.call(this, scopedStorageKey(key), value); };
    storageProto.removeItem = function(key) { return nativeRemove.call(this, scopedStorageKey(key)); };
  } catch (_) {}

  function bytesToBase64(bytes) {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }

  function base64ToBytes(value) {
    const s = atob(value);
    return Uint8Array.from(s, c => c.charCodeAt(0));
  }

  function uid() {
    return crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  function normalizeUsername(value = "") {
    return String(value).trim().toLowerCase();
  }

  async function passwordHash(password, saltBase64) {
    const salt = saltBase64 ? base64ToBytes(saltBase64) : crypto.getRandomValues(new Uint8Array(16));
    const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, material, 256);
    return { salt: bytesToBase64(salt), hash: bytesToBase64(new Uint8Array(bits)) };
  }

  function openAuthDB() {
    return new Promise((resolve, reject) => {
      const req = nativeOpen(AUTH_DB, AUTH_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(USERS)) {
          const store = db.createObjectStore(USERS, { keyPath: "id" });
          store.createIndex("username", "username", { unique: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function userCount() {
    const db = await openAuthDB();
    const count = await new Promise((resolve, reject) => {
      const req = db.transaction(USERS, "readonly").objectStore(USERS).count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
    try { db.close(); } catch (_) {}
    return count;
  }

  async function getUserByUsername(username) {
    const db = await openAuthDB();
    const result = await new Promise((resolve, reject) => {
      const req = db.transaction(USERS, "readonly").objectStore(USERS).index("username").get(normalizeUsername(username));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    try { db.close(); } catch (_) {}
    return result;
  }

  async function getUserById(id) {
    if (!id) return null;
    const db = await openAuthDB();
    const result = await new Promise((resolve, reject) => {
      const req = db.transaction(USERS, "readonly").objectStore(USERS).get(String(id));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    try { db.close(); } catch (_) {}
    return result;
  }

  async function putUser(user) {
    const db = await openAuthDB();
    await new Promise((resolve, reject) => {
      const req = db.transaction(USERS, "readwrite").objectStore(USERS).put(user);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    try { db.close(); } catch (_) {}
  }

  function requestAll(store) {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function readLegacyBooks() {
    return new Promise(resolve => {
      const req = nativeOpen("narrador-db-v1");
      req.onupgradeneeded = () => { try { req.transaction?.abort(); } catch (_) {} resolve([]); };
      req.onerror = () => resolve([]);
      req.onsuccess = async () => {
        const db = req.result;
        try {
          if (!db.objectStoreNames.contains("books")) { db.close(); resolve([]); return; }
          const rows = await requestAll(db.transaction("books", "readonly").objectStore("books"));
          db.close();
          resolve(rows);
        } catch (_) { try { db.close(); } catch (_) {} resolve([]); }
      };
    });
  }

  async function writeScopedBooks(userId, books) {
    if (!books?.length) return;
    const name = `narrador-db-v1::${userId}`;
    const db = await new Promise((resolve, reject) => {
      const req = nativeOpen(name, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains("books")) req.result.createObjectStore("books", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("books", "readwrite");
      const store = tx.objectStore("books");
      books.forEach(book => store.put(book));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Migración cancelada"));
    });
    try { db.close(); } catch (_) {}
  }

  async function readLegacyAudio() {
    return new Promise(resolve => {
      const req = nativeOpen("narrador-audio-v1");
      req.onupgradeneeded = () => { try { req.transaction?.abort(); } catch (_) {} resolve({ jobs: [], chunks: [] }); };
      req.onerror = () => resolve({ jobs: [], chunks: [] });
      req.onsuccess = async () => {
        const db = req.result;
        try {
          const jobs = db.objectStoreNames.contains("jobs") ? await requestAll(db.transaction("jobs", "readonly").objectStore("jobs")) : [];
          const chunks = db.objectStoreNames.contains("chunks") ? await requestAll(db.transaction("chunks", "readonly").objectStore("chunks")) : [];
          db.close();
          resolve({ jobs, chunks });
        } catch (_) { try { db.close(); } catch (_) {} resolve({ jobs: [], chunks: [] }); }
      };
    });
  }

  async function writeScopedAudio(userId, data) {
    if (!data?.jobs?.length && !data?.chunks?.length) return;
    const name = `narrador-audio-v1::${userId}`;
    const db = await new Promise((resolve, reject) => {
      const req = nativeOpen(name, 1);
      req.onupgradeneeded = () => {
        const target = req.result;
        if (!target.objectStoreNames.contains("jobs")) target.createObjectStore("jobs", { keyPath: "bookId" });
        if (!target.objectStoreNames.contains("chunks")) {
          const store = target.createObjectStore("chunks", { keyPath: "key" });
          store.createIndex("bookId", "bookId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const stores = [];
    if (data.jobs?.length) stores.push("jobs");
    if (data.chunks?.length) stores.push("chunks");
    if (!stores.length) { db.close(); return; }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, "readwrite");
      data.jobs?.forEach(row => tx.objectStore("jobs").put(row));
      data.chunks?.forEach(row => tx.objectStore("chunks").put(row));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Migración cancelada"));
    });
    try { db.close(); } catch (_) {}
  }

  async function migrateLegacyFor(user) {
    if (!user?.legacyOwner || user.migrationDone) return user;
    try {
      const [books, audio] = await Promise.all([readLegacyBooks(), readLegacyAudio()]);
      await writeScopedBooks(user.id, books);
      await writeScopedAudio(user.id, audio);
      const oldPrefs = nativeGet.call(localStorage, PREF_KEY);
      if (oldPrefs && !nativeGet.call(localStorage, `${PREF_KEY}::${user.id}`)) {
        nativeSet.call(localStorage, `${PREF_KEY}::${user.id}`, oldPrefs);
      }
      user.migrationDone = true;
      user.migratedAt = Date.now();
      await putUser(user);
    } catch (error) {
      console.warn("Narrador: no se pudo completar la migración del perfil", error);
    }
    return user;
  }

  function setSession(user) {
    session = { userId: String(user.id), username: user.username, displayName: user.displayName, signedInAt: Date.now() };
    activeUserId = String(user.id);
    nativeSet.call(localStorage, SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    nativeRemove.call(localStorage, SESSION_KEY);
    session = null;
    activeUserId = "";
  }

  function installStyle() {
    if (document.getElementById("narradorAuthStyle51")) return;
    const style = document.createElement("style");
    style.id = "narradorAuthStyle51";
    style.textContent = `
      body.narradorAuthLocked51{overflow:hidden!important}
      #narradorAuth51{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:calc(24px + env(safe-area-inset-top)) 18px calc(24px + env(safe-area-inset-bottom));background:radial-gradient(circle at 50% 12%,rgba(79,115,255,.16),transparent 34rem),#f5f7fb;overflow:auto;-webkit-overflow-scrolling:touch}
      .auth51Card{width:min(100%,430px);background:rgba(255,255,255,.96);border:1px solid #e3e7ef;border-radius:30px;padding:26px 22px 22px;box-shadow:0 28px 80px rgba(32,44,75,.16);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
      .auth51Brand{display:grid;justify-items:center;text-align:center}.auth51Logo{width:70px;height:70px;border-radius:23px;display:grid;place-items:center;color:#fff;font-size:34px;font-weight:950;background:linear-gradient(145deg,#3977ff,#6b55ff);box-shadow:0 18px 38px rgba(74,91,255,.28)}.auth51Brand h1{margin:15px 0 2px;font-size:30px;letter-spacing:-.045em;color:#111827}.auth51Brand p{margin:0;color:#798497;font-size:13px;font-weight:650}
      .auth51Tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;background:#f0f3f8;border-radius:14px;padding:4px;margin:24px 0 18px}.auth51Tabs button{border:0;background:transparent;border-radius:11px;min-height:42px;color:#748095;font-weight:850;font-size:14px}.auth51Tabs button.active{background:#fff;color:#1f2937;box-shadow:0 3px 12px rgba(27,39,72,.08)}
      .auth51Form{display:grid;gap:13px}.auth51Form.hidden{display:none}.auth51Form label{display:grid;gap:7px;font-size:12px;font-weight:850;color:#6b7688}.auth51Form input{width:100%;box-sizing:border-box;min-height:52px;border:1px solid #dfe4ec;border-radius:15px;background:#fbfcfe;padding:0 15px;font-size:16px;color:#111827;outline:none;-webkit-appearance:none}.auth51Form input:focus{border-color:#5e78ff;box-shadow:0 0 0 4px rgba(79,115,255,.10)}
      .auth51Primary{min-height:52px;border:0;border-radius:15px;background:linear-gradient(145deg,#3976ff,#6657ff);color:#fff;font-size:15px;font-weight:900;box-shadow:0 12px 25px rgba(61,100,255,.25);margin-top:3px}.auth51Primary:disabled{opacity:.5;box-shadow:none}.auth51Message{min-height:19px;margin:11px 2px 0;color:#d14343;font-size:12px;font-weight:750;line-height:1.4}.auth51Message.ok{color:#2f7b54}.auth51Note{margin:11px 0 0;text-align:center;color:#8a94a5;font-size:11px;line-height:1.45}
      .auth51Profile{display:flex;align-items:center;gap:14px;padding:15px;background:#fff;border:1px solid #e4e8ef;border-radius:18px;margin-bottom:18px}.auth51Avatar{width:50px;height:50px;border-radius:16px;display:grid;place-items:center;flex:none;background:linear-gradient(145deg,#e7efff,#efeaff);color:#526cf5;font-size:21px;font-weight:950}.auth51ProfileText{min-width:0;flex:1}.auth51ProfileText strong,.auth51ProfileText span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.auth51ProfileText strong{font-size:15px;color:#172033}.auth51ProfileText span{font-size:12px;color:#7b8798;margin-top:3px}.auth51Logout{border:0;border-radius:12px;background:#f3f5f8;color:#586477;min-height:38px;padding:0 12px;font-size:12px;font-weight:850}
      .auth51LocalBadge{display:inline-flex!important;width:max-content;margin-top:6px!important;padding:4px 7px;border-radius:999px;background:#edf3ff;color:#5270e8!important;font-size:10px!important;font-weight:900!important;text-transform:uppercase;letter-spacing:.06em}
    `;
    document.head.appendChild(style);
  }

  function authOverlay() {
    let root = document.getElementById("narradorAuth51");
    if (root) return root;
    root = document.createElement("div");
    root.id = "narradorAuth51";
    root.innerHTML = `
      <div class="auth51Card">
        <div class="auth51Brand"><div class="auth51Logo">N</div><h1>Narrador</h1><p>Tu biblioteca. Tu perfil.</p></div>
        <div class="auth51Tabs"><button type="button" class="active" data-auth51-tab="login">Iniciar sesión</button><button type="button" data-auth51-tab="register">Crear cuenta</button></div>
        <form id="auth51Login" class="auth51Form" autocomplete="on">
          <label>Usuario<input id="auth51LoginUser" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="tu_usuario" required></label>
          <label>Contraseña<input id="auth51LoginPass" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required></label>
          <button class="auth51Primary" type="submit">Entrar a Narrador</button>
        </form>
        <form id="auth51Register" class="auth51Form hidden" autocomplete="on">
          <label>Nombre<input id="auth51Name" name="name" autocomplete="name" placeholder="Tu nombre" maxlength="60" required></label>
          <label>Usuario<input id="auth51User" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="tu_usuario" maxlength="30" required></label>
          <label>Contraseña<input id="auth51Pass" name="new-password" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres" minlength="6" required></label>
          <label>Confirmar contraseña<input id="auth51Confirm" type="password" autocomplete="new-password" placeholder="Repite la contraseña" minlength="6" required></label>
          <button class="auth51Primary" type="submit">Crear mi cuenta</button>
        </form>
        <div id="auth51Message" class="auth51Message"></div>
        <p class="auth51Note">Beta de perfiles: la cuenta y sus libros se guardan de forma privada en este dispositivo. La sincronización entre dispositivos llegará con la nube.</p>
      </div>`;
    document.body.appendChild(root);
    document.body.classList.add("narradorAuthLocked51");
    return root;
  }

  function message(text = "", ok = false) {
    const el = document.getElementById("auth51Message");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("ok", !!ok);
  }

  function busy(form, value, text) {
    const btn = form?.querySelector("button[type='submit']");
    if (!btn) return;
    if (!btn.dataset.original) btn.dataset.original = btn.textContent;
    btn.disabled = !!value;
    btn.textContent = value ? text : btn.dataset.original;
  }

  function installAuthEvents(root) {
    root.querySelectorAll("[data-auth51-tab]").forEach(button => {
      button.addEventListener("click", () => {
        const mode = button.dataset.auth51Tab;
        root.querySelectorAll("[data-auth51-tab]").forEach(b => b.classList.toggle("active", b === button));
        document.getElementById("auth51Login")?.classList.toggle("hidden", mode !== "login");
        document.getElementById("auth51Register")?.classList.toggle("hidden", mode !== "register");
        message("");
      });
    });

    document.getElementById("auth51Login")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const username = normalizeUsername(document.getElementById("auth51LoginUser")?.value);
      const password = String(document.getElementById("auth51LoginPass")?.value || "");
      if (!username || !password) return message("Escribe tu usuario y contraseña.");
      busy(form, true, "Entrando…");
      message("");
      try {
        const user = await getUserByUsername(username);
        if (!user) throw new Error("Ese usuario no existe en este dispositivo.");
        const result = await passwordHash(password, user.salt);
        if (result.hash !== user.passwordHash) throw new Error("La contraseña no es correcta.");
        await migrateLegacyFor(user);
        setSession(user);
        message("Listo. Abriendo tu biblioteca…", true);
        setTimeout(() => location.reload(), 180);
      } catch (error) {
        message(error?.message || "No pude iniciar sesión.");
        busy(form, false);
      }
    });

    document.getElementById("auth51Register")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const displayName = String(document.getElementById("auth51Name")?.value || "").trim();
      const username = normalizeUsername(document.getElementById("auth51User")?.value);
      const password = String(document.getElementById("auth51Pass")?.value || "");
      const confirm = String(document.getElementById("auth51Confirm")?.value || "");
      if (displayName.length < 2) return message("Escribe tu nombre.");
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return message("El usuario debe tener 3–30 caracteres: letras, números, punto, guion o guion bajo.");
      if (password.length < 6) return message("La contraseña debe tener al menos 6 caracteres.");
      if (password !== confirm) return message("Las contraseñas no coinciden.");
      busy(form, true, "Creando perfil…");
      message("");
      try {
        if (await getUserByUsername(username)) throw new Error("Ese usuario ya existe en este dispositivo.");
        const first = (await userCount()) === 0;
        const secret = await passwordHash(password);
        const user = {
          id: uid(), username, displayName,
          salt: secret.salt, passwordHash: secret.hash,
          createdAt: Date.now(), lastLoginAt: Date.now(),
          legacyOwner: first, migrationDone: false,
        };
        await putUser(user);
        if (first) {
          message("Protegiendo tu biblioteca actual dentro de tu perfil…", true);
          await migrateLegacyFor(user);
        }
        setSession(user);
        message("Cuenta creada. Abriendo Narrador…", true);
        setTimeout(() => location.reload(), 180);
      } catch (error) {
        message(error?.message || "No pude crear la cuenta.");
        busy(form, false);
      }
    });
  }

  function installProfileUI(user) {
    const settings = document.getElementById("settingsView");
    if (!settings || document.getElementById("narradorProfile51")) return;
    const firstGroup = settings.querySelector(".settingGroupLabel");
    const wrap = document.createElement("div");
    wrap.id = "narradorProfile51";
    const initial = (user.displayName || user.username || "N").trim().charAt(0).toUpperCase();
    wrap.innerHTML = `<div class="settingGroupLabel">Cuenta</div><div class="auth51Profile"><div class="auth51Avatar">${initial}</div><div class="auth51ProfileText"><strong>${escapeHtml(user.displayName || user.username)}</strong><span>@${escapeHtml(user.username)}</span><span class="auth51LocalBadge">Perfil local beta</span></div><button id="auth51Logout" class="auth51Logout" type="button">Cerrar sesión</button></div>`;
    if (firstGroup) settings.insertBefore(wrap, firstGroup); else settings.appendChild(wrap);
    document.getElementById("auth51Logout")?.addEventListener("click", () => {
      if (!confirm("¿Cerrar sesión en Narrador? Tus libros permanecerán guardados en este perfil.")) return;
      clearSession();
      location.reload();
    });

    const homeSub = document.querySelector("#homeView .mainBrandSub");
    if (homeSub) homeSub.textContent = `Hola, ${(user.displayName || user.username).split(/\s+/)[0]}`;
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, m => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[m]));
  }

  async function init() {
    installStyle();
    if (!session?.userId) {
      const root = authOverlay();
      installAuthEvents(root);
      return;
    }

    try {
      const user = await getUserById(session.userId);
      if (!user) {
        clearSession();
        location.reload();
        return;
      }
      user.lastLoginAt = Date.now();
      await putUser(user);
      installProfileUI(user);
      window.__narradorUser51 = { id: user.id, username: user.username, displayName: user.displayName };
      window.dispatchEvent(new CustomEvent("narrador:user-ready", { detail: window.__narradorUser51 }));
    } catch (error) {
      console.warn("Narrador account init:", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  window.__narradorAuth51 = {
    getSession: () => session ? { ...session } : null,
    logout: () => { clearSession(); location.reload(); },
  };
})();