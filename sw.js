/* sw.js — Service Worker של GlamLab · שלב 1ד במעבר ל-PWA (21.10.2026)
 *
 * מה הוא עושה:
 *   1. שומר במכשיר את "קליפת" האפליקציה — index.html, manifest ואייקונים — כדי שהיא
 *      תיפתח מהר, וגם בלי קליטה (השגרה השמורה בטלפון מוצגת; שאלות לשרת יחכו לקליטה).
 *   2. שומר גופנים ועיצוב מ-Google Fonts ו-cdnjs, כדי שהמראה לא יישבר בלי קליטה.
 *
 * מה הוא **לא** עושה, בכוונה:
 *   ⚠️ לא נוגע בבקשות לשרת (POST ל-script.google.com) — כל תשובה של המנוע תמיד טרייה.
 *   ⚠️ לא שומר שום מידע אישי — רק קבצים ציבוריים שכל מבקרת מקבלת ממילא.
 *   ⚠️ index.html: קודם רשת, ורק אם אין קליטה — מהמטמון. כך עדכון שעלה מגיע מיד.
 *
 * עדכון: כל שינוי ב-CACHE_VERSION מוחק את המטמון הישן בהפעלה הבאה.
 *
 * 26.10.2026 · שלב 2א (D20, ניסוי): קבלת התראה והצגתה.
 *   ⚠️ השרת שולח רק {kind} — בלי שם ובלי שום מידע אישי (הכרעה 3 ב-arch-04).
 *   ⚠️ השם והלשון נקראים מהטלפון עצמו (IndexedDB 'glamlab-sw'), והנוסח מורכב כאן.
 *   ⚠️ הנוסחים כאן זמניים לניסוי; בשלב 2ג הם עוברים לקטלוג המיקרו-קופי (פער פתוח).
 */
const CACHE_VERSION = 'glamlab-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
               './icon-maskable-192.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-32.png'];
const STATIC_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // ⚠️ POST לשרת — לא נוגעים
  const url = new URL(req.url);

  // הדף עצמו: קודם רשת (עדכונים מיד), ובלי קליטה — העותק השמור
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // קבצים של האפליקציה (אותו אתר) וגופנים/עיצוב מוכרים: מהמטמון מיד, ומתעדכן ברקע
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin || STATIC_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(CACHE_VERSION).then((c) =>
        c.match(req).then((hit) => {
          const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; })
                                .catch(() => hit);
          return hit || net;
        })
      )
    );
  }
  // כל השאר (כולל script.google.com) — עובר לרשת כרגיל, בלי מטמון
});

// ── שלב 2א · התראות ──────────────────────────────────────────────────────
const PUSH_TEXT = {
  test: { f: 'זו התראת ניסוי. אם את רואה אותה, התזכורות עובדות ✨',
          m: 'זו התראת ניסוי. אם אתה רואה אותה, התזכורות עובדות ✨',
          n: 'זו התראת ניסוי. אם היא מוצגת, התזכורות עובדות ✨' },
  am:   { f: 'הגיע הזמן לשגרת הבוקר ☀️', m: 'הגיע הזמן לשגרת הבוקר ☀️', n: 'הגיע הזמן לשגרת הבוקר ☀️' },
  pm:   { f: 'הגיע הזמן לשגרת הערב 🌙',  m: 'הגיע הזמן לשגרת הערב 🌙',  n: 'הגיע הזמן לשגרת הערב 🌙' },
};

function readWho() {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open('glamlab-sw', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('kv');
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        try {
          const tx = open.result.transaction('kv', 'readonly');
          const g = tx.objectStore('kv').get('who');
          g.onsuccess = () => resolve(g.result || null);
          g.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
      };
    } catch (e) { resolve(null); }
  });
}

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let kind = 'test';
    try { const d = e.data ? e.data.json() : null; if (d && PUSH_TEXT[d.kind]) kind = d.kind; } catch (_) {}
    const who = await readWho();
    const voice = who && who.gender === 'female' ? 'f' : who && who.gender === 'male' ? 'm' : 'n';
    const name = who && typeof who.name === 'string' ? who.name.trim().slice(0, 30) : '';
    const title = name ? 'GlamLab · ' + name : 'GlamLab';
    await self.registration.showNotification(title, {
      body: PUSH_TEXT[kind][voice],
      icon: './icon-192.png',
      badge: './favicon-32.png',
      lang: 'he', dir: 'rtl',
      tag: 'glamlab-' + kind,
      data: { url: './' },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  })());
});
