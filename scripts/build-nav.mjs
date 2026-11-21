// Writes the site header (logo + menu + «انضم الآن») into every public page, so it's identical everywhere.
// Edit LINKS / MORE here, then run:  node scripts/build-nav.mjs
// The header sits between <!-- nav:start --> and <!-- nav:end -->; the first run replaces the old
// <header class="site-header">…</header>. Behaviour (drawer, «المزيد», scroll) is public/nav.js.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const NAV_JS = '/nav.js?v=1';

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
};
const LINKS = [
  ['home', '/', 'الرئيسية'],
  ['workshop', '/workshop', 'الورشات'],
  ['blog', '/blog', 'المدونة'],
  ['gallery', '/gallery', 'المعرض'],
  ['about', '/#about', 'من نحن'],
];
// [key, href, name, line, extra attributes]
const MORE = [
  ['members', '/#members', 'أعضاء المجتمع', 'وجوه من المجتمع', 'id="nav-members" hidden'],
  ['events', '/#events', 'الفعاليات', 'آخر الأخبار والأنشطة', 'id="nav-events" hidden'],
  ['fields', '/#fields', 'المجالات', 'شو بنتعلّم سوا'],
  ['survey', '/survey', 'استبيان المواضيع', 'قلّنا شو بدك نتعلّم'],
  ['trainer', '/trainer', 'كن مدرّباً معنا', 'شارك خبرتك بورشة'],
  ['faq', '/#faq', 'أسئلة شائعة', 'أجوبة سريعة'],
];

const svg = (key) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[key]}"/></svg>`;
const cur = (key, active) => (key && key === active ? ' aria-current="page"' : '');

function header(active) {
  const links = LINKS.map(([k, href, name]) => `          <li><a href="${href}"${cur(k, active)}>${svg(k)}<span>${name}</span></a></li>`).join('\n');
  const more = MORE.map(([k, href, name, line, extra]) => `              <li${extra && extra.includes('hidden') ? ` ${extra.replace(' hidden', '')} hidden` : ''}><a href="${href}"${cur(k, active)}>${svg(k)}<span><b>${name}</b><small>${line}</small></span></a></li>`).join('\n');
  const moreActive = MORE.some(([k]) => k === active) ? ' is-current' : '';
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
        <ul class="nav-list">
${links}
          <li class="nav-more${moreActive}">
            <button class="nav-more-btn" type="button" aria-expanded="false" aria-controls="nav-more-menu">
              <span>المزيد</span><svg class="nav-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <ul class="nav-menu" id="nav-more-menu">
${more}
            </ul>
          </li>
        </ul>
        <a class="btn btn-primary nav-drawer-cta" href="/join">انضم للمجتمع</a>
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
  writeFileSync(path, html);
  console.log(`ok ${file}${active ? ` (${active})` : ''}`);
}
