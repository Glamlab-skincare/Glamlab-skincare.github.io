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
 */
const CACHE_VERSION = 'glamlab-v1';
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
