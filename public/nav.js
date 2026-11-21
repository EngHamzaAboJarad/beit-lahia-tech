// Beit Lahia Tech — the site header, on every public page (the markup is the same everywhere:
// scripts/build-nav.mjs writes it between <!-- nav:start --> and <!-- nav:end -->).
// Solid on scroll · «المزيد» menu · a side drawer on phones · the page you're on is marked.
const header = document.getElementById('site-header');
if (header) {
  const btn = document.getElementById('menu-btn');
  const nav = document.getElementById('site-nav');
  const backdrop = document.getElementById('nav-backdrop');
  const more = header.querySelector('.nav-more-btn');
  const phone = window.matchMedia('(max-width: 900px)');

  // solid once the page scrolls
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });

  // «المزيد»: a menu on wide screens, an open list in the drawer
  const setMore = (open) => {
    if (!more) return;
    more.setAttribute('aria-expanded', String(open));
    more.parentElement.classList.toggle('is-open', open);
  };
  more?.addEventListener('click', (e) => { e.stopPropagation(); setMore(more.getAttribute('aria-expanded') !== 'true'); });
  more?.parentElement.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && more.getAttribute('aria-expanded') === 'true') { setMore(false); more.focus(); e.stopPropagation(); }
  });

  // the drawer (phones)
  const setDrawer = (open) => {
    if (!btn) return;
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
    nav.classList.toggle('is-open', open);
    header.classList.toggle('menu-open', open);
    document.documentElement.classList.toggle('nav-locked', open);
    if (backdrop) backdrop.hidden = !open;
    if (open) setMore(true); // the extra links are simply listed in the drawer
    if (open) requestAnimationFrame(() => nav.querySelector('a')?.focus({ preventScroll: true }));
  };
  btn?.addEventListener('click', () => setDrawer(btn.getAttribute('aria-expanded') !== 'true'));
  backdrop?.addEventListener('click', () => setDrawer(false));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) { setDrawer(false); setMore(false); } });
  document.addEventListener('click', (e) => { if (!e.target.closest('.nav-more')) setMore(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (nav.classList.contains('is-open')) { setDrawer(false); btn.focus(); }
    else setMore(false);
  });
  // keep Tab inside the open drawer
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !nav.classList.contains('is-open')) return;
    const items = [...nav.querySelectorAll('a, button')].filter((x) => x.offsetParent !== null);
    const first = items[0]; const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); btn.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); btn.focus(); }
  });
  phone.addEventListener('change', () => { setDrawer(false); setMore(false); });

  // a link to a section of the page you're on just scrolls there
  nav.querySelectorAll('a[href^="/#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (location.pathname !== '/') return;
      const target = document.getElementById(a.getAttribute('href').slice(2));
      if (!target || target.hidden) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      history.replaceState(null, '', `#${target.id}`);
    });
  });
}
