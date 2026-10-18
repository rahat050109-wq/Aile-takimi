// paylasim.js — "Paylaş" modülü (Aile Takımı)
// Aile akışı: metin + isteğe bağlı küçük fotoğraf, beğeni, kendi gönderini silme.
// Koleksiyon: "posts". Harici kütüphane / ağ isteği yok (sadece Firestore).

const COL = "posts";
const MAX_CHARS = 280;
const MAX_BYTES = 120 * 1024;      // fotoğraf üst sınırı (belge sınırı 1 MiB)
const MAX_W = 720, MAX_H = 960;    // genişlik 720; çok uzun fotoğraflar için yükseklik sınırı
const FEED_LIMIT = 30;
const TAGS = ["Uyku", "Beslenme", "Temizlik", "Cilt bakımı", "İngilizce", "AI mühendislik", "Namaz", "Spor"];
const TEAM_COLOR = { k: "var(--h1)", a: "var(--ac)", w: "var(--fl)" }; // VARSAYIM: gerçek takım renklerine göre değiştir
const AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const IMG_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

const IC = {
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  cam: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
};
const svg = (p, s = 22) =>
  `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

/* ---------- durum ---------- */
let C = null;                                   // son ctx
let root, listEl, stEl, ta, cnt, pv, sendBtn, fileIn, chipsEl, meAv;
let posts = [], loaded = false, err = null, slow = false, stKey = "";
let unsub = null, hideT = null, slowT = null, tick = null;
let tag = "", img = "", busy = false, shrinking = false;
const nodes = new Map(), likeBusy = new Set();

/* ---------- yardımcılar ---------- */
const esc = (s) => C.esc(s);                    // kullanıcı metni her zaman ctx.esc ile
const me = () => C.me || (C.players && C.players[C.uid]) || null;
const initial = (n) => (Array.from(String(n || "").trim())[0] || "?").toLocaleUpperCase("tr");
const bytes = (url) => Math.floor((url.length - url.indexOf(",") - 1) * 3 / 4);

function ago(ts) {
  const d = ts && ts.toDate ? ts.toDate() : null;
  if (!d) return "";
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "az önce";
  if (s < 3600) return Math.floor(s / 60) + " dk önce";
  if (s < 86400) return Math.floor(s / 3600) + " sa önce";
  if (s < 172800) return "dün";
  return d.getDate() + " " + AY[d.getMonth()];
}

function why(e) {
  const c = e && e.code ? String(e.code) : "";
  if (c.includes("permission")) return "izin yok (Firestore güvenlik kuralları kontrol edilmeli).";
  if (c.includes("unavailable") || c.includes("deadline")) return "internet bağlantısı yok ya da çok yavaş.";
  if (c.includes("invalid-argument") || c.includes("resource-exhausted")) return "gönderi çok büyük ya da günlük kota doldu.";
  return c || (e && e.message) || "bilinmeyen hata.";
}

/* ---------- fotoğraf küçültme ---------- */
async function decode(f) {
  if (window.createImageBitmap) {
    try {
      const b = await createImageBitmap(f, { imageOrientation: "from-image" });
      return { src: b, w: b.width, h: b.height, done: () => b.close && b.close() };
    } catch (_) { /* eski tarayıcı: Image ile dene */ }
  }
  const u = URL.createObjectURL(f);
  try {
    const i = new Image();
    i.src = u;
    await i.decode();
    return { src: i, w: i.naturalWidth, h: i.naturalHeight, done: () => URL.revokeObjectURL(u) };
  } catch (_) {
    URL.revokeObjectURL(u);
    throw new Error("Bu fotoğraf okunamadı. Başka bir fotoğraf dene.");
  }
}

async function shrink(f) {
  const d = await decode(f);
  try {
    if (!d.w || !d.h) throw new Error("Bu fotoğraf okunamadı.");
    let scale = Math.min(1, MAX_W / d.w, MAX_H / d.h), q = 0.6;
    for (let i = 0; i < 10; i++) {
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(d.w * scale));
      cv.height = Math.max(1, Math.round(d.h * scale));
      const g = cv.getContext("2d");
      g.fillStyle = "#fff";                      // şeffaf PNG'ler siyah çıkmasın
      g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(d.src, 0, 0, cv.width, cv.height);
      const url = cv.toDataURL("image/jpeg", q);
      cv.width = cv.height = 0;
      if (bytes(url) <= MAX_BYTES) return url;
      if (q > 0.35) q -= 0.1; else scale *= 0.85;
    }
    throw new Error("Fotoğraf yeterince küçültülemedi. Başka bir fotoğraf dene.");
  } finally { d.done(); }
}

/* ---------- Firestore dinleme ---------- */
function norm(d) {
  const x = d.data({ serverTimestamps: "estimate" });
  return {
    id: d.id,
    uid: String(x.uid || ""),
    name: String(x.name || "?"),
    team: x.team,
    tag: typeof x.tag === "string" ? x.tag : "",
    text: typeof x.text === "string" ? x.text : "",
    img: typeof x.img === "string" && IMG_RE.test(x.img) ? x.img : "",
    ts: x.ts,
    likes: Array.isArray(x.likes) ? x.likes.filter((u) => typeof u === "string") : [],
    _pending: d.metadata.hasPendingWrites,
  };
}

function subscribe() {
  if (unsub) { unsub(); unsub = null; }
  clearTimeout(slowT);
  slow = false;
  if (!loaded) slowT = setTimeout(() => { if (!loaded) { slow = true; renderFeed(); } }, 7000);
  const f = C.fs;
  try {
    const q = f.query(f.collection(C.db, COL), f.orderBy("ts", "desc"), f.limit(FEED_LIMIT));
    unsub = f.onSnapshot(q, onSnap, onErr);
  } catch (e) { onErr(e); }
}

function onSnap(snap) {
  clearTimeout(slowT);
  loaded = true; err = null; slow = false;
  posts = snap.docs.map(norm);
  renderFeed();
}

function onErr(e) {
  clearTimeout(slowT);
  err = why(e);
  unsub = null;
  renderFeed();
}

// Uygulama arka plana geçince 2 dk sonra dinleyiciyi kapat (okuma kotası + pil)
function onVis() {
  clearTimeout(hideT);
  if (document.hidden) {
    hideT = setTimeout(() => { if (unsub) { unsub(); unsub = null; } }, 120000);
  } else {
    if (!unsub && !err) subscribe();
    renderFeed();
  }
}

/* ---------- akış çizimi ---------- */
function likers(l) {
  if (!l.length) return "";
  const P = C.players || {};
  const names = l.map((u) => (u === C.uid ? "Sen" : P[u] && P[u].name)).filter(Boolean);
  names.sort((a, b) => (b === "Sen") - (a === "Sen"));
  if (!names.length) return "";
  const shown = names.slice(0, 3), rest = l.length - shown.length;
  return shown.join(", ") + (rest > 0 ? " +" + rest : "") + " beğendi";
}

function makeNode(p) {
  const n = document.createElement("article");
  n.className = "pz-card pz-post";
  n.dataset.id = p.id;
  n.innerHTML =
    `<header class="pz-ph">
       <div class="pz-av" style="background:${TEAM_COLOR[p.team] || "var(--h1)"}">${esc(initial(p.name))}</div>
       <div class="pz-who"><b>${esc(p.name)}</b><span class="pz-tm"></span></div>
       <button class="pz-del" data-act="del" aria-label="Gönderiyi sil" hidden>${svg(IC.trash)}</button>
     </header>
     ${p.tag ? `<span class="pz-tag">${esc(p.tag)}</span>` : ""}
     ${p.text ? `<p class="pz-tx">${esc(p.text)}</p>` : ""}
     ${p.img ? `<img class="pz-im" alt="${esc(p.name)} tarafından paylaşılan fotoğraf" loading="lazy" decoding="async">` : ""}
     <footer class="pz-ft">
       <button class="pz-lk" data-act="like" aria-pressed="false">${svg(IC.heart)}<span class="pz-n"></span></button>
       <span class="pz-lw"></span>
     </footer>`;
  const im = n.querySelector(".pz-im");
  if (im) im.src = p.img;                        // data URL doğrulandı (IMG_RE), innerHTML'e girmez
  n._r = {
    del: n.querySelector(".pz-del"), lk: n.querySelector(".pz-lk"), n: n.querySelector(".pz-n"),
    tm: n.querySelector(".pz-tm"), lw: n.querySelector(".pz-lw"),
  };
  return n;
}

function paint(n, p) {
  const r = n._r, liked = p.likes.includes(C.uid);
  r.del.hidden = p.uid !== C.uid;
  r.lk.setAttribute("aria-pressed", String(liked));
  r.lk.setAttribute("aria-label", liked ? "Beğeniyi geri al" : "Beğen");
  r.n.textContent = p.likes.length ? String(p.likes.length) : "";
  r.tm.textContent = p._pending ? "gönderiliyor…" : ago(p.ts);
  r.lw.textContent = likers(p.likes);
}

function renderFeed() {
  if (!root) return;
  // durum kutusu (yükleniyor / hata / boş)
  let html = "";
  if (err) {
    html = `<div class="pz-box"><b>Akış yüklenemedi</b><p>${esc(err)}</p><button class="pz-btn2" data-act="retry">Tekrar dene</button></div>`;
  } else if (!loaded) {
    html = `<div class="pz-sk"></div><div class="pz-sk"></div>` +
      (slow ? `<p class="pz-slow">İnternet yavaş görünüyor, gönderiler yükleniyor…</p>` : "");
  } else if (!posts.length) {
    html = `<div class="pz-box"><div class="pz-big">🌱</div><b>Henüz gönderi yok</b><p>İlk paylaşımı sen yap: bugün ne yaptığını yaz ya da bir fotoğraf ekle.</p></div>`;
  }
  const key = (err ? "e" + err : !loaded ? "l" + slow : posts.length ? "" : "z");
  if (key !== stKey) { stKey = key; stEl.innerHTML = html; }

  // anahtarlı liste güncellemesi: fotoğraflar yeniden yüklenmesin
  const ids = new Set(posts.map((p) => p.id));
  for (const [id, n] of nodes) if (!ids.has(id)) { n.remove(); nodes.delete(id); }
  posts.forEach((p, i) => {
    let n = nodes.get(p.id);
    if (!n) { n = makeNode(p); nodes.set(p.id, n); }
    paint(n, p);
    if (listEl.children[i] !== n) listEl.insertBefore(n, listEl.children[i] || null);
  });
}

/* ---------- beğeni / silme ---------- */
async function toggleLike(id) {
  const p = posts.find((x) => x.id === id);
  if (!p || likeBusy.has(id)) return;
  const uid = C.uid, f = C.fs, mine = p.likes.includes(uid);
  likeBusy.add(id);
  p.likes = mine ? p.likes.filter((u) => u !== uid) : p.likes.concat(uid);   // iyimser güncelleme
  renderFeed();
  try {
    const ref = f.doc(C.db, COL, id);
    if (f.arrayUnion && f.arrayRemove) {
      await f.updateDoc(ref, { likes: mine ? f.arrayRemove(uid) : f.arrayUnion(uid) });
    } else {                                     // ctx.fs'te arrayUnion yoksa: taze oku, değiştir, yaz
      const s = await f.getDoc(ref);
      if (!s.exists()) return;
      const cur = Array.isArray(s.data().likes) ? s.data().likes : [];
      const next = mine ? cur.filter((u) => u !== uid) : cur.includes(uid) ? cur : cur.concat(uid);
      await f.updateDoc(ref, { likes: next });
    }
  } catch (e) {
    const cp = posts.find((x) => x.id === id);                               // geri al
    if (cp) cp.likes = mine ? cp.likes.concat(uid) : cp.likes.filter((u) => u !== uid);
    renderFeed();
    C.toast("Beğeni kaydedilemedi: " + why(e));
  } finally { likeBusy.delete(id); }
}

function disarm(n, b) {
  n._arm = false;
  b.classList.remove("pz-arm");
  b.innerHTML = svg(IC.trash);
}

async function askDelete(n, b) {
  if (!n._arm) {                                 // ilk dokunuş: onay iste
    n._arm = true;
    b.classList.add("pz-arm");
    b.textContent = "Sil?";
    n._armT = setTimeout(() => disarm(n, b), 3500);
    return;
  }
  clearTimeout(n._armT);
  disarm(n, b);
  try {
    await C.fs.deleteDoc(C.fs.doc(C.db, COL, n.dataset.id));
    C.toast("Gönderi silindi");
  } catch (e) { C.toast("Silinemedi: " + why(e)); }
}

/* ---------- gönderi oluşturma ---------- */
function syncComposer() {
  const len = ta.value.length;
  cnt.textContent = len + "/" + MAX_CHARS;
  cnt.classList.toggle("pz-warn", len >= MAX_CHARS - 20);
  chipsEl.querySelectorAll(".pz-chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.v === tag)));
  const k = shrinking ? "s" : img ? "i" + img.length : "";
  if (pv.dataset.k !== k) {
    pv.dataset.k = k;
    pv.hidden = !k;
    pv.innerHTML = shrinking
      ? `<div class="pz-pvmsg">Fotoğraf küçültülüyor…</div>`
      : k
        ? `<img alt="Seçilen fotoğrafın önizlemesi"><button class="pz-x" data-act="rm" aria-label="Fotoğrafı kaldır">${svg(IC.x)}</button><div class="pz-pvmsg">${Math.round(bytes(img) / 1024)} KB</div>`
        : "";
    if (img) pv.querySelector("img").src = img;
  }
  sendBtn.disabled = busy || shrinking || !(ta.value.trim() || img);
  sendBtn.querySelector("span").textContent = busy ? "Paylaşılıyor…" : "Paylaş";
}

function resetComposer() { ta.value = ""; img = ""; tag = ""; syncComposer(); }

async function onFile() {
  const f = fileIn.files && fileIn.files[0];
  fileIn.value = "";                             // aynı dosya tekrar seçilebilsin
  if (!f) return;
  if (f.type && !/^image\//.test(f.type)) { C.toast("Sadece fotoğraf eklenebilir, video desteklenmiyor."); return; }
  if (f.size > 30 * 1048576) { C.toast("Bu fotoğraf çok büyük. Daha küçük bir tane seç."); return; }
  shrinking = true; syncComposer();
  try { img = await shrink(f); }
  catch (e) { C.toast(e.message || "Fotoğraf hazırlanamadı."); }
  shrinking = false; syncComposer();
}

async function send() {
  if (busy || shrinking) return;
  const text = ta.value.trim().slice(0, MAX_CHARS);
  if (!text && !img) return;
  const m = me();
  if (!m || !m.name || !m.team) { C.toast("Profilin henüz yüklenmedi, birazdan tekrar dene."); return; }
  busy = true; syncComposer();
  const data = { uid: C.uid, name: m.name, team: m.team, tag, text, ts: C.fs.serverTimestamp(), likes: [] };
  if (img) data.img = img;
  let slowSent = false;
  // Yavaş internette addDoc uzun bekleyebilir: 8 sn sonra formu boşalt, gönderi yerelde sırada kalır
  const t = setTimeout(() => {
    slowSent = true; busy = false; resetComposer();
    C.toast("Bağlantı yavaş. Gönderi sıraya alındı, uygulamayı hemen kapatma.");
  }, 8000);
  try {
    await C.fs.addDoc(C.fs.collection(C.db, COL), data);
    clearTimeout(t);
    if (!slowSent) { resetComposer(); C.toast("Paylaşıldı ✅"); }
  } catch (e) {
    clearTimeout(t);
    C.toast((slowSent ? "Yavaş giden gönderi kaydedilemedi: " : "Paylaşılamadı: ") + why(e));
  } finally { busy = false; syncComposer(); }
}

/* ---------- arayüz iskeleti ---------- */
function onClick(e) {
  const b = e.target.closest("[data-act]");
  if (!b || !root.contains(b)) return;
  const a = b.dataset.act;
  if (a === "tag") { tag = tag === b.dataset.v ? "" : b.dataset.v; syncComposer(); }
  else if (a === "photo") fileIn.click();
  else if (a === "rm") { img = ""; syncComposer(); }
  else if (a === "send") send();
  else if (a === "retry") { err = null; stKey = ""; loaded = false; renderFeed(); subscribe(); }
  else {
    const n = b.closest(".pz-post");
    if (!n) return;
    if (a === "like") toggleLike(n.dataset.id);
    else if (a === "del") askDelete(n, b);
  }
}

function paintMe() {
  const m = me() || {};
  meAv.textContent = initial(m.name);
  meAv.style.background = TEAM_COLOR[m.team] || "var(--h1)";
}

function teardown() {
  if (unsub) { unsub(); unsub = null; }
  clearTimeout(hideT); clearTimeout(slowT); clearInterval(tick);
  document.removeEventListener("visibilitychange", onVis);
  if (root) root.removeEventListener("click", onClick);
  nodes.clear(); likeBusy.clear();
  posts = []; loaded = false; err = null; slow = false; stKey = "";
  tag = ""; img = ""; busy = false; shrinking = false;
}

function injectCss() {
  if (document.getElementById("pz-css")) return;
  const s = document.createElement("style");
  s.id = "pz-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}

export default {
  id: "paylasim",
  title: "Paylaş",
  icon: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',

  mount(el, ctx) {
    teardown();
    C = ctx; root = el;
    injectCss();
    root.classList.add("pz");
    root.innerHTML =
      `<section class="pz-card" aria-label="Yeni gönderi">
         <div class="pz-ch"><div class="pz-av" id="pz-me"></div><b>Aileye bir şey paylaş</b></div>
         <textarea class="pz-ta" rows="3" maxlength="${MAX_CHARS}" placeholder="Bugün ne yaptın? Takım arkadaşlarına bir not bırak…" aria-label="Gönderi metni"></textarea>
         <div class="pz-meta"><span>Rutin etiketi (isteğe bağlı)</span><span class="pz-cnt"></span></div>
         <div class="pz-chips">${TAGS.map((t) => `<button class="pz-chip" data-act="tag" data-v="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join("")}</div>
         <div class="pz-pv" hidden></div>
         <div class="pz-row">
           <button class="pz-btn2" data-act="photo" aria-label="Fotoğraf ekle">${svg(IC.cam)}Fotoğraf</button>
           <button class="pz-send" data-act="send"><span>Paylaş</span>${svg(IC.send, 20)}</button>
         </div>
         <input type="file" accept="image/*" hidden>
         <p class="pz-note">Sadece fotoğraf eklenebilir; video desteklenmiyor. Fotoğraflar otomatik küçültülür.</p>
       </section>
       <div class="pz-st"></div>
       <div class="pz-list"></div>`;
    meAv = root.querySelector("#pz-me");
    ta = root.querySelector(".pz-ta");
    cnt = root.querySelector(".pz-cnt");
    chipsEl = root.querySelector(".pz-chips");
    pv = root.querySelector(".pz-pv");
    sendBtn = root.querySelector(".pz-send");
    fileIn = root.querySelector("input[type=file]");
    stEl = root.querySelector(".pz-st");
    listEl = root.querySelector(".pz-list");

    root.addEventListener("click", onClick);
    ta.addEventListener("input", syncComposer);
    fileIn.addEventListener("change", onFile);
    document.addEventListener("visibilitychange", onVis);
    tick = setInterval(() => { if (!document.hidden) renderFeed(); }, 60000);  // "5 dk önce" yazıları tazelensin

    paintMe(); syncComposer(); renderFeed(); subscribe();
  },

  update(ctx) {
    C = ctx;
    if (!root) return;
    paintMe();
    renderFeed();
  },
};

const CSS = `
.pz{padding:14px 14px 24px;max-width:640px;margin:0 auto;color:var(--tx);box-sizing:border-box}
.pz *{box-sizing:border-box}
.pz [hidden]{display:none!important}
.pz-card{background:var(--card);border:1px solid var(--bd);border-radius:20px;padding:14px;margin-bottom:14px}
.pz-ch{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.pz-ch b{font-size:17px;font-weight:800}
.pz-av{width:40px;height:40px;border-radius:50%;flex:none;display:grid;place-items:center;color:#fff;font-weight:800;font-size:17px}
.pz-ta{width:100%;min-height:84px;resize:none;border:1px solid var(--bd);border-radius:16px;background:var(--bg);color:var(--tx);padding:12px;font:inherit;font-size:16px;line-height:1.4}
.pz-ta:focus{outline:2px solid var(--h2);outline-offset:1px}
.pz-meta{display:flex;justify-content:space-between;align-items:center;margin:6px 2px 8px;font-size:12px;color:var(--mu)}
.pz-warn{color:var(--fl);font-weight:700}
.pz-chips{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;margin-bottom:8px;scrollbar-width:none}
.pz-chips::-webkit-scrollbar{display:none}
.pz-chip{flex:none;min-height:44px;padding:0 14px;border-radius:22px;border:1px solid var(--bd);background:var(--bg);color:var(--tx);font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.pz-chip[aria-pressed=true]{background:linear-gradient(135deg,var(--h1),var(--h2));border-color:transparent;color:#fff}
.pz-row{display:flex;gap:10px;align-items:center}
.pz-btn2{min-height:44px;padding:0 14px;border-radius:16px;border:1px solid var(--bd);background:var(--bg);color:var(--tx);font:inherit;font-size:14px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}
.pz-send{flex:1;min-height:48px;border:0;border-radius:16px;background:linear-gradient(135deg,var(--h1),var(--h2));color:#fff;font:inherit;font-size:16px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}
.pz-send:disabled{opacity:.45;cursor:default}
.pz-note{font-size:12px;color:var(--mu);margin:8px 2px 0;line-height:1.4}
.pz-pv{position:relative;margin:0 0 10px;border-radius:16px;overflow:hidden;border:1px solid var(--bd);background:var(--bg)}
.pz-pv img{display:block;width:100%;max-height:260px;object-fit:cover}
.pz-pvmsg{padding:8px 12px;font-size:12px;color:var(--mu)}
.pz-x{position:absolute;top:4px;right:4px;width:44px;height:44px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;display:grid;place-items:center;cursor:pointer}
.pz-ph{display:flex;align-items:center;gap:10px}
.pz-who{flex:1;min-width:0;display:flex;flex-direction:column}
.pz-who b{font-size:15px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pz-tm{font-size:12px;color:var(--mu)}
.pz-del{min-width:44px;height:44px;margin:-4px -6px -4px 0;border:0;background:none;color:var(--mu);border-radius:14px;display:grid;place-items:center;cursor:pointer;font:inherit;font-size:13px;font-weight:800}
.pz-del.pz-arm{color:#fff;background:var(--fl);padding:0 14px}
.pz-tag{display:inline-block;margin-top:10px;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:700;color:var(--h2);background:var(--bg);background:color-mix(in srgb,var(--h2) 14%,transparent)}
.pz-tx{margin:10px 0 0;font-size:15px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.pz-im{display:block;width:100%;height:auto;margin-top:10px;border-radius:14px;background:var(--bg)}
.pz-ft{display:flex;align-items:center;gap:8px;margin-top:8px}
.pz-lk{min-width:44px;min-height:44px;padding:0 12px 0 8px;border:0;border-radius:22px;background:none;color:var(--mu);font:inherit;font-size:14px;font-weight:700;display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.pz-lk svg{transition:transform .15s}
.pz-lk:active svg{transform:scale(1.25)}
.pz-lk[aria-pressed=true]{color:#e11d48}
.pz-lk[aria-pressed=true] svg{fill:currentColor}
.pz-lw{font-size:12px;color:var(--mu);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pz-box{text-align:center;padding:26px 18px;border:1px dashed var(--bd);border-radius:20px;color:var(--mu);margin-bottom:14px}
.pz-box b{display:block;color:var(--tx);font-size:16px;margin:4px 0}
.pz-box p{margin:6px 0 12px;font-size:14px;line-height:1.45}
.pz-big{font-size:34px}
.pz-sk{height:120px;border-radius:20px;background:var(--card);border:1px solid var(--bd);margin-bottom:14px;animation:pzp 1.2s ease-in-out infinite}
.pz-slow{text-align:center;font-size:13px;color:var(--mu);margin:0 0 12px}
@keyframes pzp{50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.pz-sk{animation:none}.pz-lk svg{transition:none}}
`;
