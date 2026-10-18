// magaza.js — Aile Takımı · Mağaza (ekonomi) modülü
// Koleksiyonlar: shop, wallets/{uid}, purchases
// Bakiye = günlüklerden kazanılan − harcanan
//   harcanan = wallets.spent* (kozmetikler) + purchases içinde reddedilmemiş gerçek ödüller
//   (böylece reddedilen talep tek yazmayla, kendiliğinden iade olur)

// ---- Kurallar: değiştirmek için sadece burayı düzenle -----------------------
const RULES = {
  goldPerRoutine: 5,     // her rutin
  routinesPerDay: 8,     // rutin indeksleri 0..7
  goldFullDay: 20,       // 8 rutin tamamsa günlük bonus
  streakEvery: 7,        // her 7. seri gününde
  goldStreak: 50,        //   +50 altın
  diamondEvery: 30,      // her 30. seri gününde
  diamondPerStreak: 1,   //   +1 elmas
};
const MAX_BUYS = 200;    // purchases dinleyici sınırı (kendi kayıtların)

const ICON = '<path d="M6 7h12l1 13H5L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/>';
const SYM = { gold: "🪙", diamond: "💎" };

// ---- Saf hesaplar ----------------------------------------------------------
const num = (v) => (Number.isFinite(+v) ? +v : 0);
const dayNum = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN;
};

// Günlüklerden kazanç. Seri: ardışık "canlı" günler (rutin yapılmış ya da joker j=1).
// Joker günü seriyi korur ama seri sayısını artırmaz.
export function earnings(days, today) {
  const t = dayNum(today);
  let gold = 0, dia = 0, streak = 0, prev = null;
  const keys = Object.keys(days || {})
    .filter((k) => { const n = dayNum(k); return !isNaN(n) && n <= t; })
    .sort();
  for (const k of keys) {
    const d = days[k] || {};
    const r = Array.isArray(d.r) ? d.r : [];
    const n = new Set(r.filter((i) => Number.isInteger(i) && i >= 0 && i < RULES.routinesPerDay)).size;
    const joker = d.j === 1 || d.j === true;
    if (!n && !joker) continue;
    const kn = dayNum(k);
    if (prev !== null && kn - prev !== 1) streak = 0;
    if (n) {
      gold += n * RULES.goldPerRoutine;
      if (n === RULES.routinesPerDay) gold += RULES.goldFullDay;
      streak++;
      if (streak % RULES.streakEvery === 0) gold += RULES.goldStreak;
      if (streak % RULES.diamondEvery === 0) dia += RULES.diamondPerStreak;
    }
    prev = kn;
  }
  const alive = prev !== null && prev >= t - 1;
  return { gold, dia, streak: alive ? streak : 0 };
}

// ---- Durum -----------------------------------------------------------------
const S = {
  ctx: null, uid: null,
  items: null,       // shop belgeleri (null = yükleniyor)
  wallet: undefined, // undefined = yükleniyor, {} = belge yok
  buys: null,        // kendi purchases kayıtları
  pending: null,     // yönetici: bekleyen talepler
  err: {}, slow: false, busy: false,
  unsubs: [], admUnsub: null, slowT: null,
};
let R = {};          // bölüm elemanları

const isAdmin = () => !!(S.ctx.me && S.ctx.me.admin === true);
const curOf = (it) => (it.currency === "diamond" ? "diamond" : "gold");
const isCos = (it) => it.kind === "cosmetic";
const byId = (id) => (S.items || []).find((i) => i.id === id);
const ready = () => S.items !== null && S.wallet !== undefined && S.buys !== null &&
  !(S.err.items || S.err.wallet || S.err.buys) && !!S.ctx.me;
const msOf = (ts) => (ts && ts.toMillis ? ts.toMillis() : Date.now());
const when = (ts) => {
  const d = ts && ts.toDate ? ts.toDate() : null;
  return d ? d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) : "şimdi";
};
const toast = (m) => S.ctx.toast && S.ctx.toast(m);
const esc = (s) => S.ctx.esc(s == null ? "" : String(s));
const withTimeout = (p, ms = 15000) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

function balance() {
  const e = earnings(S.ctx.me && S.ctx.me.days, S.ctx.today);
  const w = S.wallet || {};
  const real = { gold: 0, diamond: 0 };
  (S.buys || []).forEach((b) => {
    if (b.status !== "reddedildi" && b.currency in real) real[b.currency] += num(b.price);
  });
  const sg = num(w.spentGold) + real.gold, sd = num(w.spentDiamonds) + real.diamond;
  return { gold: e.gold - sg, diamond: e.dia - sd, eg: e.gold, ed: e.dia, sg, sd, streak: e.streak };
}

// ---- Firestore dinleyicileri -----------------------------------------------
function stop() {
  S.unsubs.forEach((u) => u());
  S.unsubs = [];
  if (S.admUnsub) { S.admUnsub(); S.admUnsub = null; }
  clearTimeout(S.slowT);
}

function subscribe() {
  stop();
  const { db, uid, fs } = S.ctx;
  S.uid = uid; S.items = null; S.wallet = undefined; S.buys = null; S.pending = null;
  S.err = {}; S.slow = false;
  S.slowT = setTimeout(() => { S.slow = true; paint(); }, 8000);
  const on = (key, ref, cb) =>
    S.unsubs.push(fs.onSnapshot(ref, (snap) => { delete S.err[key]; cb(snap); paint(); },
      (e) => { S.err[key] = e; paint(); }));
  const rows = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
  on("items", fs.query(fs.collection(db, "shop"), fs.limit(80)), (s) => (S.items = rows(s)));
  on("wallet", fs.doc(db, "wallets", uid), (s) => (S.wallet = s.exists() ? s.data() : {}));
  on("buys", fs.query(fs.collection(db, "purchases"), fs.where("uid", "==", uid), fs.limit(MAX_BUYS)),
    (s) => (S.buys = rows(s)));
  syncAdmin();
}

function syncAdmin() {
  const { db, fs } = S.ctx;
  if (isAdmin() && !S.admUnsub) {
    S.admUnsub = fs.onSnapshot(
      fs.query(fs.collection(db, "purchases"), fs.where("status", "==", "bekliyor"), fs.limit(50)),
      (s) => { S.pending = s.docs.map((d) => ({ id: d.id, ...d.data() })); delete S.err.pending; paint(); },
      (e) => { S.err.pending = e; paint(); });
  } else if (!isAdmin() && S.admUnsub) {
    S.admUnsub(); S.admUnsub = null; S.pending = null;
  }
}

// ---- Çizim -----------------------------------------------------------------
function setHtml(node, html) {           // aynıysa dokunma: dokunuşlar kaybolmasın
  if (node && node._h !== html) { node.innerHTML = html; node._h = html; }
}
const skel = (n) => Array.from({ length: n }, () => '<div class="mg-sk"></div>').join("");

function paint() {
  if (!R.bal || !S.ctx) return;
  paintBalance(); paintShop(); paintMine(); paintAdmin();
}

function paintBalance() {
  const b = balance(), ok = ready();
  const v = (x) => (ok ? x : "…");
  let alert = "";
  if (S.err.items || S.err.wallet || S.err.buys) {
    const denied = [S.err.items, S.err.wallet, S.err.buys].some((e) => e && e.code === "permission-denied");
    alert = `<div class="mg-alert"><span>${denied
      ? "Mağazaya erişim izni yok. Yönetici Firestore kurallarını eklemeli."
      : "Mağaza yüklenemedi. İnternetini kontrol et."}</span>
      <button data-act="retry">Tekrar dene</button></div>`;
  } else if (!ok && S.slow) {
    alert = '<div class="mg-alert"><span>Bağlantı yavaş görünüyor, bekliyoruz…</span></div>';
  } else if (S.buys && S.buys.length >= MAX_BUYS) {
    alert = '<div class="mg-alert"><span>Çok fazla talep birikti, satın alma kapalı. Yöneticiye haber ver.</span></div>';
  }
  const hint = b.streak > 0
    ? `${b.streak} günlük serindesin. Sonraki elmasa ${RULES.diamondEvery - (b.streak % RULES.diamondEvery)} gün var.`
    : `Bugün bir rutin işaretle, serin başlasın. Her ${RULES.diamondEvery} günlük seri 1 elmas kazandırır.`;
  setHtml(R.bal, `
    <div class="mg-tiles">
      <div class="mg-tile mg-gold"><span class="mg-lbl">${SYM.gold} Altın</span><b class="mg-num">${v(b.gold)}</b>
        <span class="mg-cap">${ok ? `Kazanılan ${b.eg}, harcanan ${b.sg}` : "Hesaplanıyor"}</span></div>
      <div class="mg-tile mg-dia"><span class="mg-lbl">${SYM.diamond} Elmas</span><b class="mg-num">${v(b.diamond)}</b>
        <span class="mg-cap">${ok ? `Kazanılan ${b.ed}, harcanan ${b.sd}` : "Hesaplanıyor"}</span></div>
    </div>
    <p class="mg-hint">${esc(hint)}</p>${alert}`);
}

function card(it, b, ok, owned) {
  const c = curOf(it), p = num(it.price), sym = SYM[c];
  const own = isCos(it) && owned.includes(it.id);
  let act;
  if (own) act = '<span class="mg-own">Sahipsin ✓</span>';
  else if (!ok) act = '<button disabled>…</button>';
  else if (b[c] < p) act = '<button disabled>Yetmiyor</button>';
  else act = `<button class="mg-go" data-act="buy" data-id="${esc(it.id)}">Al</button>`;
  const lack = !own && ok && b[c] < p ? `<small class="mg-mu">${p - b[c]} ${sym} eksik</small>` : "";
  return `<div class="mg-card">
    <div class="mg-top"><b class="mg-name">${esc(it.name)}</b>
      <span class="mg-tag">${isCos(it) ? "Kozmetik" : "Gerçek ödül"}</span></div>
    ${it.desc ? `<p class="mg-desc">${esc(it.desc)}</p>` : ""}
    <div class="mg-foot"><div class="mg-pc"><span class="mg-price">${p} ${sym}</span>${lack}</div>${act}</div></div>`;
}

function paintShop() {
  let html;
  if (S.err.items) html = "";
  else if (S.items === null) html = skel(3);
  else {
    const list = S.items.filter((i) => i.active !== false && num(i.price) > 0);
    if (!list.length) {
      html = `<div class="mg-empty"><b>Mağaza henüz boş</b><p>Yönetici ürün ekleyince burada görünecek.${
        isAdmin() ? " Aşağıdaki Yönetim bölümünden ilk ürünü ekleyebilirsin." : ""}</p></div>`;
    } else {
      const b = balance(), ok = ready(), owned = (S.wallet && S.wallet.owned) || [];
      const sort = (a, z) => num(a.price) - num(z.price) || String(a.name).localeCompare(String(z.name), "tr");
      html = [["gold", "Altınla alınanlar"], ["diamond", "Elmasla alınanlar"]].map(([c, t]) => {
        const g = list.filter((i) => curOf(i) === c).sort(sort);
        return g.length ? `<h2>${t}</h2>${g.map((i) => card(i, b, ok, owned)).join("")}` : "";
      }).join("");
      const mine = items().filter((i) => owned.includes(i.id) && isCos(i));
      if (mine.length) html += `<h2>Koleksiyonum</h2><div class="mg-chips">${
        mine.map((i) => `<span class="mg-chip">${esc(i.name)}</span>`).join("")}</div>`;
    }
  }
  setHtml(R.shop, html);
}
const items = () => S.items || [];

function paintMine() {
  if (S.err.buys) return setHtml(R.mine, "");
  if (S.buys === null) return setHtml(R.mine, "<h2>Taleplerim</h2>" + skel(1));
  const sorted = [...S.buys].sort((a, z) => msOf(z.ts) - msOf(a.ts));
  const pend = sorted.filter((b) => b.status === "bekliyor");
  const done = sorted.filter((b) => b.status !== "bekliyor").slice(0, 5);
  const st = (s) => s === "onaylandı" ? '<span class="mg-st mg-ok">Onaylandı</span>'
    : s === "reddedildi" ? '<span class="mg-st mg-no">Reddedildi, iade edildi</span>'
    : '<span class="mg-st mg-wait">Bekliyor</span>';
  const row = (b) => `<div class="mg-row"><div class="mg-rt"><b>${esc(b.itemName || "Ürün")}</b>
    <small class="mg-mu">${when(b.ts)}</small></div>
    <div class="mg-rr"><span class="mg-pill">${num(b.price)} ${SYM[b.currency] || ""}</span>${st(b.status)}</div></div>`;
  let html = `<h2>Bekleyen taleplerim${pend.length ? ` (${pend.length})` : ""}</h2>`;
  if (!sorted.length) {
    html += '<div class="mg-empty"><p>Henüz talebin yok. Gerçek ödüllerden birini seçince burada görünür.</p></div>';
  } else {
    html += pend.length ? pend.map(row).join("") : '<div class="mg-empty"><p>Bekleyen talebin yok.</p></div>';
    if (done.length) html += `<h2>Son sonuçlar</h2>${done.map(row).join("")}`;
  }
  setHtml(R.mine, html);
}

function paintAdmin() {
  if (!isAdmin()) return setHtml(R.adm, "");
  let html = "<h2>Yönetim: onay bekleyenler</h2>";
  if (S.err.pending) html += '<div class="mg-alert"><span>Talepler okunamadı. Kuralları kontrol et.</span><button data-act="retry">Tekrar dene</button></div>';
  else if (S.pending === null) html += skel(1);
  else if (!S.pending.length) html += '<div class="mg-empty"><p>Şu an onay bekleyen talep yok.</p></div>';
  else {
    html += [...S.pending].sort((a, z) => msOf(a.ts) - msOf(z.ts)).map((b) => `
      <div class="mg-card"><div class="mg-top"><b class="mg-name">${esc(b.itemName)}</b>
        <span class="mg-pill">${num(b.price)} ${SYM[b.currency] || ""}</span></div>
        <p class="mg-desc">${esc(b.name || "Biri")} istedi, ${when(b.ts)}</p>
        <div class="mg-btns"><button data-act="reject" data-id="${esc(b.id)}">Reddet</button>
        <button class="mg-ok-b" data-act="approve" data-id="${esc(b.id)}">Onayla</button></div></div>`).join("");
  }
  html += `<h2>Yönetim: ürünler</h2><button class="mg-go mg-wide" data-act="newitem">Ürün ekle</button>`;
  if (S.items) html += [...S.items].sort((a, z) => String(a.name).localeCompare(String(z.name), "tr")).map((it) => `
    <div class="mg-row"><div class="mg-rt"><b>${esc(it.name)}</b>
      <small class="mg-mu">${num(it.price)} ${SYM[curOf(it)]}, ${isCos(it) ? "kozmetik" : "gerçek"}${it.active === false ? ", kapalı" : ""}</small></div>
      <div class="mg-rr"><button data-act="edit" data-id="${esc(it.id)}">Düzenle</button>
      <button data-act="toggle" data-id="${esc(it.id)}">${it.active === false ? "Aç" : "Kapat"}</button></div></div>`).join("");
  setHtml(R.adm, html);
}

// ---- Alt sayfa (onay penceresi / form) -------------------------------------
const openSheet = (html) => { R.sheet.innerHTML = `<div class="mg-bd" data-act="close"></div><div class="mg-sh" role="dialog" aria-modal="true">${html}</div>`; };
const closeSheet = () => { R.sheet.innerHTML = ""; };

function askBuy(id) {
  const it = byId(id);
  if (!it || !ready()) return;
  const c = curOf(it), p = num(it.price), left = balance()[c] - p;
  openSheet(`<h3>${esc(it.name)}</h3>
    <p class="mg-desc">${isCos(it) ? "Hemen senin olur." : "Bu gerçek bir ödül. Talebin yöneticiye gider; reddedilirse bedelin iade edilir."}</p>
    <p><b>${p} ${SYM[c]}</b> harcanacak, kalan ${left} ${SYM[c]}.</p>
    <div class="mg-btns"><button data-act="close">Vazgeç</button>
    <button class="mg-go" data-act="confirm-buy" data-id="${esc(id)}">Satın al</button></div>`);
}

function openForm(id) {
  const it = (id && byId(id)) || { active: true, currency: "gold", kind: "real" };
  const sel = (v, o) => (v === o ? " selected" : "");
  openSheet(`<h3>${id ? "Ürünü düzenle" : "Yeni ürün"}</h3>
    <label>Ad<input id="mg-f-name" maxlength="60" value="${esc(it.name || "")}" placeholder="Yemeği sen seç"></label>
    <label>Açıklama<input id="mg-f-desc" maxlength="200" value="${esc(it.desc || "")}" placeholder="İsteğe bağlı"></label>
    <label>Fiyat<input id="mg-f-price" type="number" inputmode="numeric" min="1" max="99999" value="${it.price ? num(it.price) : ""}"></label>
    <label>Para birimi<select id="mg-f-cur"><option value="gold"${sel(curOf(it), "gold")}>Altın</option>
      <option value="diamond"${sel(curOf(it), "diamond")}>Elmas</option></select></label>
    <label>Tür<select id="mg-f-kind"><option value="real"${sel(isCos(it) ? "cosmetic" : "real", "real")}>Gerçek ödül (onay gerekir)</option>
      <option value="cosmetic"${sel(isCos(it) ? "cosmetic" : "real", "cosmetic")}>Kozmetik (anında)</option></select></label>
    <label class="mg-chk"><input id="mg-f-act" type="checkbox"${it.active === false ? "" : " checked"}> Satışta</label>
    <p class="mg-errt" id="mg-f-err"></p>
    <div class="mg-btns"><button data-act="close">Vazgeç</button>
    <button class="mg-go" data-act="save" data-id="${esc(id || "")}">Kaydet</button></div>`);
}

// ---- İşlemler --------------------------------------------------------------
async function run(btn, fn, okMsg) {
  if (S.busy) return false;
  S.busy = true;
  const old = btn && btn.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "Bekle…"; }
  try {
    await withTimeout(fn());
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    if (e.message === "timeout") {
      toast("Bağlantı yavaş. İşlem bekliyor olabilir, birazdan kontrol et.");
      closeSheet();
    } else if (e.code === "permission-denied") toast("Bu işleme iznin yok.");
    else toast("İşlem yapılamadı. İnternetini kontrol edip tekrar dene.");
    return false;
  } finally {
    S.busy = false;
    if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = old; }
  }
}

async function doBuy(btn, id) {
  const it = byId(id);
  if (!it || it.active === false) { toast("Bu ürün artık satışta değil."); return closeSheet(); }
  const c = curOf(it), p = num(it.price), owned = (S.wallet && S.wallet.owned) || [];
  if (!ready() || balance()[c] < p) { toast("Bakiyen yetmiyor."); return closeSheet(); }
  if (isCos(it) && owned.includes(id)) { toast("Bu zaten sende."); return closeSheet(); }
  const { db, uid, me, fs } = S.ctx;
  const ok = await run(btn, () => isCos(it)
    ? fs.setDoc(fs.doc(db, "wallets", uid),
        { [c === "diamond" ? "spentDiamonds" : "spentGold"]: fs.increment(p), owned: [...owned, id] }, { merge: true })
    : fs.addDoc(fs.collection(db, "purchases"),
        { uid, name: (me && me.name) || "", itemId: id, itemName: it.name, price: p, currency: c, status: "bekliyor", ts: fs.serverTimestamp() }),
    isCos(it) ? "Aldın!" : "Talebin yöneticiye gitti.");
  if (ok) closeSheet();
}

async function decide(btn, id, status) {
  const { db, uid, fs } = S.ctx;
  const ok = await run(btn, () => fs.updateDoc(fs.doc(db, "purchases", id),
    { status, decidedBy: uid, decidedAt: fs.serverTimestamp() }),
    status === "onaylandı" ? "Onaylandı." : "Reddedildi, bedel iade edildi.");
  if (ok) closeSheet();
}

async function saveItem(btn, id) {
  const q = (s) => R.sheet.querySelector(s);
  const name = q("#mg-f-name").value.trim(), price = Math.round(Number(q("#mg-f-price").value));
  const bad = !name ? "Ürüne bir ad ver." : !(price >= 1 && price <= 99999) ? "Fiyat 1 ile 99999 arasında olmalı." : "";
  if (bad) { q("#mg-f-err").textContent = bad; return; }
  const { db, fs } = S.ctx;
  const data = {
    name, desc: q("#mg-f-desc").value.trim(), price,
    currency: q("#mg-f-cur").value === "diamond" ? "diamond" : "gold",
    kind: q("#mg-f-kind").value === "cosmetic" ? "cosmetic" : "real",
    active: q("#mg-f-act").checked,
  };
  const ok = await run(btn, () => id
    ? fs.updateDoc(fs.doc(db, "shop", id), data)
    : fs.addDoc(fs.collection(db, "shop"), { ...data, createdAt: fs.serverTimestamp() }),
    id ? "Ürün güncellendi." : "Ürün eklendi.");
  if (ok) closeSheet();
}

function onClick(e) {
  const t = e.target.closest("[data-act]");
  if (!t || t.disabled) return;
  const id = t.dataset.id, { db, fs } = S.ctx;
  switch (t.dataset.act) {
    case "close": return closeSheet();
    case "retry": return subscribe();
    case "buy": return askBuy(id);
    case "confirm-buy": return doBuy(t, id);
    case "approve": return decide(t, id, "onaylandı");
    case "reject": {
      const b = (S.pending || []).find((x) => x.id === id);
      if (!b) return;
      return openSheet(`<h3>Talep reddedilsin mi?</h3>
        <p class="mg-desc">${esc(b.name || "Biri")}: ${esc(b.itemName)}. ${num(b.price)} ${SYM[b.currency] || ""} kendisine iade edilir.</p>
        <div class="mg-btns"><button data-act="close">Vazgeç</button>
        <button class="mg-bad" data-act="confirm-reject" data-id="${esc(id)}">Reddet</button></div>`);
    }
    case "confirm-reject": return decide(t, id, "reddedildi");
    case "newitem": return openForm();
    case "edit": return openForm(id);
    case "save": return saveItem(t, id);
    case "toggle": {
      const it = byId(id);
      if (it) run(null, () => fs.updateDoc(fs.doc(db, "shop", id), { active: it.active === false }),
        it.active === false ? "Ürün açıldı." : "Ürün kapatıldı.");
    }
  }
}

// ---- Stil ------------------------------------------------------------------
const CSS = `
.mg{padding:14px 14px 28px;color:var(--tx);font-size:15px;line-height:1.4;display:flex;flex-direction:column;gap:12px}
.mg,.mg *{box-sizing:border-box}
.mg>:empty{display:none}
.mg section{display:flex;flex-direction:column;gap:12px}
.mg h2{margin:8px 0 0;font-size:19px;font-weight:900}
.mg h3{margin:0;font-size:20px;font-weight:900}
.mg p{margin:0}
.mg button{font:inherit;font-weight:800;min-height:44px;padding:0 16px;border:0;border-radius:14px;background:var(--bd);color:var(--tx);cursor:pointer}
.mg button:disabled{opacity:.55;cursor:default}
.mg button:focus-visible,.mg input:focus-visible,.mg select:focus-visible{outline:3px solid var(--h2);outline-offset:2px}
.mg-go{background:var(--h1)!important;color:#fff!important}
.mg-bad{background:#dc2626!important;color:#fff!important}
.mg-ok-b{background:var(--ac)!important;color:#0b2512!important}
.mg-wide{width:100%}
.mg-mu{color:var(--mu)}
.mg-tiles{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.mg-tile{border-radius:22px;padding:16px;display:flex;flex-direction:column;gap:4px;min-height:132px}
.mg-gold{background:linear-gradient(135deg,#fcd34d,#f59e0b);color:#2a1700}
.mg-dia{background:linear-gradient(135deg,var(--h1),var(--h2));color:#fff}
.mg-lbl{font-weight:800;font-size:15px}
.mg-num{font-size:42px;line-height:1.05;font-weight:900;letter-spacing:-1px}
.mg-cap{font-size:13px;opacity:.9;margin-top:auto}
.mg-hint{color:var(--mu);font-size:14px}
.mg-card{background:var(--card);border:1px solid var(--bd);border-radius:20px;padding:14px 16px;display:flex;flex-direction:column;gap:8px}
.mg-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.mg-name{font-size:16px;font-weight:800}
.mg-tag,.mg-pill,.mg-chip,.mg-st{font-size:12.5px;font-weight:800;padding:4px 10px;border-radius:99px;background:var(--bd);white-space:nowrap}
.mg-desc{color:var(--mu);font-size:14px}
.mg-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}
.mg-pc{display:flex;flex-direction:column}
.mg-price{font-size:19px;font-weight:900}
.mg-own{font-weight:800;color:var(--ac)}
.mg-row{background:var(--card);border:1px solid var(--bd);border-radius:18px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.mg-rt{display:flex;flex-direction:column;min-width:0;flex:1 1 140px}
.mg-rr{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mg-ok{background:var(--ac);color:#0b2512}.mg-no{background:#fecaca;color:#7f1d1d}.mg-wait{background:#fed7aa;color:#7c2d12}
.mg-chips{display:flex;flex-wrap:wrap;gap:8px}
.mg-empty{background:var(--card);border:1.5px dashed var(--bd);border-radius:20px;padding:18px;text-align:center;display:flex;flex-direction:column;gap:6px}
.mg-empty p{color:var(--mu)}
.mg-alert{background:#fff1e6;color:#7c2d12;border:1px solid var(--fl);border-radius:18px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;font-weight:700}
.mg-btns{display:flex;gap:10px}.mg-btns button{flex:1}
.mg-sk{height:84px;border-radius:20px;background:linear-gradient(90deg,var(--bd),var(--card),var(--bd));background-size:200% 100%;animation:mgsk 1.4s linear infinite}
@keyframes mgsk{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.mg-sk{animation:none}}
.mg-bd{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:900}
.mg-sh{position:fixed;left:0;right:0;bottom:0;z-index:901;max-width:520px;margin:0 auto;max-height:88vh;overflow:auto;background:var(--card);color:var(--tx);border-radius:22px 22px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:12px}
.mg-sh label{display:flex;flex-direction:column;gap:4px;font-weight:700;font-size:14px}
.mg-sh input,.mg-sh select{font:inherit;font-size:16px;min-height:44px;border-radius:12px;border:1.5px solid var(--bd);background:var(--bg);color:var(--tx);padding:0 12px;width:100%}
.mg-sh .mg-chk{flex-direction:row;align-items:center;gap:10px;min-height:44px}
.mg-sh .mg-chk input{width:24px;min-height:24px;height:24px}
.mg-errt{color:#dc2626;font-weight:700;min-height:1em}
`;
function injectCss() {
  if (document.getElementById("mg-css")) return;
  const s = document.createElement("style");
  s.id = "mg-css"; s.textContent = CSS;
  document.head.appendChild(s);
}

// ---- Modül sözleşmesi ------------------------------------------------------
export default {
  id: "magaza",
  title: "Mağaza",
  icon: ICON,
  mount(el, ctx) {
    injectCss();
    S.ctx = ctx;
    el.innerHTML = `<div class="mg"><section class="mg-bal"></section><section class="mg-shop"></section>
      <section class="mg-mine"></section><section class="mg-adm"></section><div class="mg-sheet"></div></div>`;
    const q = (c) => el.querySelector("." + c);
    R = { bal: q("mg-bal"), shop: q("mg-shop"), mine: q("mg-mine"), adm: q("mg-adm"), sheet: q("mg-sheet") };
    el.onclick = onClick;
    subscribe();
    paint();
  },
  update(ctx) {
    S.ctx = ctx;
    if (ctx.uid !== S.uid) subscribe();
    else syncAdmin();
    paint();
  },
};
