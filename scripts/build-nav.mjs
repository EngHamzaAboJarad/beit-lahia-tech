// Writes the site header (logo + menu + «انضم الآن») into every public page, so it's identical everywhere.
// Edit LINKS / GROUPS here, then run:  node scripts/build-nav.mjs
// The header sits between <!-- nav:start --> and <!-- nav:end -->; the first run replaces the old
// <header class="site-header">…</header>. Looks: public/nav.css · behaviour: public/nav.js.
//
// Wide screens: the main links in a rail (a mint pill slides to the one you point at), «المزيد» opens a
// two-column menu. Phones: ☰ opens a sheet from the bottom: the main pages as big tiles, then the rest.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const NAV_JS = '/nav.js?v=2';
const NAV_CSS = '/nav.css?v=2';

// page file → which link is «you are here»
const PAGES = {
  'index.html': 'home', 'workshop.html': 'workshop', 'blog.html': 'blog', 'post.html': 'blog', 'gallery.html': 'gallery',
  'join.html': 'join', 'privacy.html': '', 'survey.html': 'survey', 'trainer.html': 'trainer',
};
const ICON = {
  home: 'M4 11l8-7 8 7v9h-5v-6h-6v6H4z',
  workshop: 'M3 10 12 5l9 5-9 5-9-5ZM7 12.5V17c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4.5',
  blog: 'M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 16.5h5',
  gallery: 'M3.5 4h17v16h-17zM8.5 11.5a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM4 18l5-5 4 4 3-3 4.5 4.5',
  about: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5',
  members: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-7 7-7s7 3 7 7M17 3.5a4 4 0 0 1 0 7.5M19 14c2 1 3 3.5 3 7',
  events: 'M3.5 5h17v15.5h-17zM3.5 10h17M8 3v4M16 3v4',
  fields: 'M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16',
  survey: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  trainer: 'M3 4h18v12H3zM8 20h8M12 16v4M10 8l4 2-4 2z',
  faq: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.2a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2.2-2.5 3.8M12 17h.01',
  join: 'M15 19v-1.5A3.5 3.5 0 0 0 11.5 14h-5A3.5 3.5 0 0 0 3 17.5V19M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 8v6M22 11h-6',
};
// the rail (wide screens) and the tiles (phones). `wide` = only in the rail (on phones it sits in a group below)
const LINKS = [
  ['home', '/', 'الرئيسية'],
  ['workshop', '/workshop', 'الورشات'],
  ['blog', '/blog', 'المدونة'],
  ['gallery', '/gallery', 'المعرض'],
  ['about', '/#about', 'من نحن', 'wide'],
];
// «المزيد»: [key, href, name, line, extra]. extra: 'hidden' = shown by site.js when the section has something;
// 'phone' = only on phones (it's in the rail on wide screens)
const GROUPS = [
  ['المجتمع', [
    ['about', '/#about', 'من نحن', 'قصتنا ورؤيتنا', 'phone'],
    ['members', '/#members', 'أعضاء المجتمع', 'وجوه من المجتمع', 'hidden'],
    ['events', '/#events', 'الفعاليات', 'آخر الأخبار والأنشطة', 'hidden'],
    ['fields', '/#fields', 'المجالات', 'شو بنتعلّم سوا'],
    ['faq', '/#faq', 'أسئلة شائعة', 'أجوبة سريعة'],
  ]],
  ['شارك معنا', [
    ['survey', '/survey', 'استبيان المواضيع', 'قلّنا شو بدك نتعلّم'],
    ['trainer', '/trainer', 'كن مدرّباً معنا', 'شارك خبرتك بورشة'],
  ]],
];

// Faster page changes, in every page's <head> (between <!-- speed:start --> and <!-- speed:end -->):
// · the Firebase bootstrap starts downloading with the page instead of after the page's own script
// · hovering a menu link (or any link to these pages) gets the page ready, so it opens at once (Chrome/Edge).
//   track.js waits until such a page is really opened before counting the visit.
// · the page's data (public/site-data.js: the Worker's edge cache) starts downloading with the page itself
const PRERENDER = ['/', '/workshop', '/blog', '/blog/*', '/gallery', '/join', '/survey', '/trainer', '/privacy'];
const SITE_API = 'https://social.beitlahia.tech/site/';
const DATA = { 'index.html': 'home', 'gallery.html': 'gallery', 'blog.html': 'blog' };
const SPEED = (file) => `<!-- speed:start (scripts/build-nav.mjs) -->${DATA[file] ? `
  <link rel="preload" as="fetch" href="${SITE_API}${DATA[file]}" crossorigin>` : ''}
  <link rel="preconnect" href="https://social.beitlahia.tech" crossorigin>
  <link rel="preconnect" href="https://firestore.googleapis.com" crossorigin>
  <link rel="modulepreload" href="/firebase-init.js">
  <link rel="modulepreload" href="/firebase-config.js">
  <link rel="modulepreload" href="https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js" crossorigin>
  <script type="speculationrules">{"prerender":[{"where":{"and":[{"href_matches":${JSON.stringify(PRERENDER)}},{"not":{"selector_matches":"[target=_blank], [download], [rel~=nofollow]"}}]},"eagerness":"moderate"}]}</script>
  <!-- speed:end -->`;

const svg = (key) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[key]}"/></svg>`;
const cur = (key, active) => (key && key === active ? ' aria-current="page"' : '');

function header(active) {
  const links = LINKS.map(([k, href, name, only]) => `            <li${only ? ' class="nav-wide-only"' : ''}><a class="nav-link" href="${href}" data-k="${k}"${cur(k, active)}>${svg(k)}<span>${name}</span></a></li>`).join('\n');
  const groups = GROUPS.map(([title, items]) => {
    const lis = items.map(([k, href, name, line, extra = '']) => {
      const attrs = (extra === 'hidden' ? ` id="nav-${k}" hidden` : '') + (extra === 'phone' ? ' class="nav-phone-only"' : '');
      return `                  <li${attrs}><a href="${href}" data-k="${k}"${extra === 'phone' ? '' : cur(k, active)}>${svg(k)}<span><b>${name}</b><small>${line}</small></span></a></li>`;
    }).join('\n');
    return `              <div class="nav-group">
                <p class="nav-group-title">${title}</p>
                <ul>
${lis}
                </ul>
              </div>`;
  }).join('\n');
  const moreActive = GROUPS.some(([, items]) => items.some(([k, , , , extra]) => k === active && extra !== 'phone')) ? ' is-current' : '';
  return `<!-- nav:start (scripts/build-nav.mjs writes this block; edit it there) -->
  <header class="site-header" id="site-header">
    <div class="container header-row">
      <a class="brand" href="/" aria-label="كميونتي تقني بيت لاهيا: الرئيسية">
        <img class="brand-mark" src="/favicon.svg" width="34" height="34" alt="">
        <span class="brand-text">
          <span class="brand-kicker">كميونتي تقني</span>
          <span class="brand-name">بيت لاهيا</span>
        </span>
      </a>
      <nav class="nav" id="site-nav" aria-label="القائمة الرئيسية">
        <div class="nav-sheet-head">
          <span class="nav-grip" aria-hidden="true"></span>
          <strong>وين بدك تروح؟</strong>
          <button class="nav-close" type="button" aria-label="إغلاق القائمة"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>
        <div class="nav-rail">
          <span class="nav-ink" aria-hidden="true"></span>
          <ul class="nav-list">
${links}
            <li class="nav-more${moreActive}">
              <button class="nav-more-btn" type="button" aria-expanded="false" aria-controls="nav-more-menu">
                <span>المزيد</span><svg class="nav-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              <div class="nav-menu" id="nav-more-menu">
${groups}
              </div>
            </li>
          </ul>
        </div>
        <a class="btn btn-primary nav-sheet-cta" href="/join">${svg('join')}<span>انضم للمجتمع</span></a>
      </nav>
      <div class="header-actions">
        <a class="btn btn-primary btn-sm nav-cta" href="/join"${active === 'join' ? ' aria-current="page"' : ''}>انضم الآن</a>
        <button class="menu-btn" type="button" id="menu-btn" aria-expanded="false" aria-controls="site-nav" aria-label="فتح القائمة">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path class="l1" d="M4 7h16"/><path class="l2" d="M4 12h16"/><path class="l3" d="M4 17h16"/></svg>
        </button>
      </div>
    </div>
  </header>
  <div class="nav-backdrop" id="nav-backdrop" hidden></div>
  <!-- nav:end -->`;
}

for (const [file, active] of Object.entries(PAGES)) {
  const path = PUBLIC + file;
  let html;
  try { html = readFileSync(path, 'utf8'); } catch { console.log(`skip ${file} (missing)`); continue; }
  const block = header(active);
  if (html.includes('<!-- nav:start')) {
    html = html.replace(/<!-- nav:start[\s\S]*?<!-- nav:end -->/, block);
  } else {
    const m = /<header class="site-header"[\s\S]*?<\/header>/.exec(html);
    if (!m) { console.log(`skip ${file} (no header)`); continue; }
    html = html.replace(m[0], block);
  }
  if (!html.includes('/nav.js')) html = html.replace('</head>', `  <script type="module" src="${NAV_JS}"></script>\n</head>`);
  else html = html.replace(/\/nav\.js\?v=\d+/, NAV_JS);
  // nav.css right after brand.css (it overrides the header bits of styles.css)
  if (!html.includes('/nav.css')) html = html.replace(/(<link rel="stylesheet" href="\/brand\.css\?v=\d+">)/, `$1\n  <link rel="stylesheet" href="${NAV_CSS}">`);
  else html = html.replace(/\/nav\.css\?v=\d+/, NAV_CSS);
  if (!html.includes('/nav.css')) console.log(`  ! ${file}: no brand.css link to put nav.css after`);
  if (html.includes('<!-- speed:start')) html = html.replace(/<!-- speed:start[\s\S]*?<!-- speed:end -->/, SPEED(file));
  else html = html.replace(/(<link rel="stylesheet" href="\/nav\.css\?v=\d+">)/, `$1\n  ${SPEED(file)}`);
  writeFileSync(path, html);
  console.log(`ok ${file}${active ? ` (${active})` : ''}`);
}
