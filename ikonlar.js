// ikonlar.js — "Bugün" ekranındaki rutin ikonları için satın alınabilir ikon paketleri.
// index.html (ikonu çizmek için) ve magaza.js (satmak için) bunu okur.
// Yeni ikon eklemek: aşağıya bir satır ekle. ic = rutinin ikon numarası (4 = İngilizce, 5 = AI).
// İkonlar 24x24, sadece çizgi (stroke), renk uygulamadan gelir.

export const GROUPS = [
  { ic: 0, n: "Uyku", hue: 262,
    def: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>' },
  { ic: 1, n: "Beslenme", hue: 140,
    def: '<path d="M12 7c-3-2-7 0-7 5 0 4 3 8 5 8 1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 5-4 5-8 0-5-4-7-7-5z"/><path d="M12 7c0-2 1-3 3-4"/>' },
  { ic: 4, n: "İngilizce", hue: 215,
    def: '<path d="M4 5h16v11H9l-5 4z"/>' },                       // uygulamadaki varsayılan ikon
  { ic: 5, n: "AI", hue: 280,
    def: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>' },
];

const S = (n, ic, price, p, cur = "gold") => ({ n, ic, price, cur, p });

export default Object.fromEntries([
  // Uyku
  ["sl_moon",     S("Ay ve yıldız", 0, 1,       '<path d="M17 15.5A7 7 0 1 1 9 5a5.5 5.5 0 0 0 8 10.5z"/><path d="M18 3v4M16 5h4"/>', "diamond")],
  ["sl_pillow",   S("Yastık", 0, 60,            '<path d="M3 8c6 1.5 12 1.5 18 0 1 2.5 1 5.5 0 8-6-1.5-12-1.5-18 0-1-2.5-1-5.5 0-8z"/>')],
  ["sl_cloud",    S("Gece bulutu", 0, 60,       '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 11a3.5 3.5 0 0 1-.5 7z"/>')],
  ["sl_bed",      S("Yatak", 0, 90,             '<path d="M3 18V6M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.8"/>')],
  ["sl_clock",    S("Çalar saat", 0, 90,        '<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M5 4L3 6M19 4l2 2"/>')],
  ["sl_lamp",     S("Gece lambası", 0, 90,      '<path d="M8 4h8l2 8H6z"/><path d="M12 12v6M8 20h8"/>')],
  ["sl_mask",     S("Uyku maskesi", 0, 120,     '<path d="M3 10a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/><path d="M7 12q2 2 4 0M13 12q2 2 4 0"/>')],
  ["sl_zzz",      S("Zzz balonu", 0, 120,       '<path d="M5 5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7l-4 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M8.5 8.5h3l-3 4h3M13.5 9h2.5l-2.5 3.5h2.5"/>')],
  // Beslenme
  ["fd_tea",      S("Çay bardağı", 1, 60,       '<path d="M7 6h10c0 4-1.5 5-1.5 8 0 2 .5 3 1 4H7.5c.5-1 1-2 1-4 0-3-1.5-4-1.5-8z"/><path d="M5 21h14M10 2c-1 1 1 1.5 0 3M14 2c-1 1 1 1.5 0 3"/>')],
  ["fd_toast",    S("Ekmek dilimi", 1, 60,      '<path d="M6 20v-8a3.5 3.5 0 0 1-1-6A3 3 0 0 1 8 4h8a3 3 0 0 1 3 2 3.5 3.5 0 0 1-1 6v8z"/>')],
  ["fd_egg",      S("Sahanda yumurta", 1, 60,   '<path d="M5 12c0-4 3-7 7-7s7 3 7 6-3 3-4 5-4 3-7 1-3-3-3-5z"/><circle cx="11" cy="11" r="2.5"/>')],
  ["fd_milk",     S("Süt", 1, 90,               '<path d="M8 3h8v3l2 3v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9l2-3z"/><path d="M6 12h12"/>')],
  ["fd_bowl",     S("Kâse", 1, 90,              '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M15 3l-3 8"/>')],
  ["fd_juice",    S("Meyve suyu", 1, 90,        '<path d="M7 5h10l-1.5 14a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1z"/><path d="M7.5 10h9M13 5l2-3"/>')],
  ["fd_croissant",S("Kruvasan", 1, 120,         '<path d="M3 16c0-5 4-9 9-9s9 4 9 9c-1.5.5-3 0-4-1.5-1 1.5-3 2.5-5 2.5s-4-1-5-2.5c-1 1.5-2.5 2-4 1.5z"/><path d="M8.5 8.5L10 15M12 7v8M15.5 8.5L14 15"/>')],
  ["fd_orange",   S("Portakal", 1, 1,           '<circle cx="12" cy="13.5" r="7"/><path d="M12 6.5V4M12 4c1.5-1.5 3-1.5 4.5-1-.5 1.5-2 2.5-4.5 2z"/>', "diamond")],
  // İngilizce: İngiltere teması
  ["uk_tea",      S("Çay fincanı", 4, 60,  '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2"/><path d="M8 3c-1 1 1 2 0 3M12 3c-1 1 1 2 0 3"/>')],
  ["uk_umbrella", S("Şemsiye", 4, 60,       '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 3V2M12 12v6a2 2 0 0 1-4 0"/>')],
  ["uk_bus",      S("Kırmızı otobüs", 4, 90, '<rect x="3.5" y="3" width="17" height="15" rx="2.5"/><path d="M3.5 10.5h17M9.2 5.8v2.4M14.8 5.8v2.4M9.2 13v2.4M14.8 13v2.4"/><circle cx="8" cy="20" r="1.4"/><circle cx="16" cy="20" r="1.4"/>')],
  ["uk_booth",    S("Telefon kulübesi", 4, 90, '<rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M12 3v18M6 9h12M6 15h12"/>')],
  ["uk_tower",    S("Saat kulesi", 4, 120,  '<path d="M8 21h8M9 21V9h6v12M9.5 9L12 3l2.5 6"/><circle cx="12" cy="12.5" r="1.5"/>')],
  ["uk_crown",    S("Taç", 4, 1,            '<path d="M4 18L3 8l5 4 4-7 4 7 5-4-1 10z"/><path d="M4 21h16"/>', "diamond")],
  // AI
  ["ai_network",  S("Sinir ağı", 5, 60,     '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6.5l3.2 4.2M7 17.5l3.2-4.2M13.8 10.8L17 7M13.8 13.2L17 17"/>')],
  ["ai_robot",    S("Robot", 5, 90,         '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V4M10 4h4"/><circle cx="9.5" cy="13" r="1"/><circle cx="14.5" cy="13" r="1"/><path d="M9.5 16.5h5"/>')],
  ["ai_phone",    S("Akıllı telefon", 5, 90, '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><circle cx="12" cy="10" r="2.5"/><path d="M11 18h2"/>')],
  ["ai_brain",    S("Beyin", 5, 1,          '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>', "diamond")],
]);
