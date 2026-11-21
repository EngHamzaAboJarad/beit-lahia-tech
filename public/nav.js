// Beit Lahia Tech — the site header, on every public page (the markup is the same everywhere:
// scripts/build-nav.mjs writes it between <!-- nav:start --> and <!-- nav:end -->; looks: nav.css).
// · a pill slides to the link you point at, and rests on where you are
// · «المزيد» opens on hover (or click / keyboard) on wide screens
// · the header tucks away while you scroll down and comes back as soon as you scroll up
// · on the home page, the section in view is marked in the menu
// · phones: ☰ opens a sheet from the bottom; drag it down, tap outside, or Esc to close
const header = document.getElementById('site-header');
if (header) {
  document.documentElement.classList.add('js');
  const btn = document.getElementById('menu-btn');
  const nav = document.getElementById('site-nav');
  const backdrop = document.getElementById('nav-backdrop');
  const rail = header.querySelector('.nav-rail');
  const ink = header.querySelector('.nav-ink');
  const moreLi = header.querySelector('.nav-more');
  const more = header.querySelector('.nav-more-btn');
  const menu = document.getElementById('nav-more-menu');
  const closeBtn = header.querySelector('.nav-close');
  const sheetHead = header.querySelector('.nav-sheet-head');
  const phone = window.matchMedia('(max-width: 900px)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const railLinks = [...header.querySelectorAll('.nav-list > li > .nav-link')];
  const isOpen = () => nav.classList.contains('is-open');

  /* ---------- the sliding pill ---------- */
  let here = null; // the link for where you are (the page, or the section in view)
  let hover = null;
  function placeInk(target, slide = true) {
    if (!ink || !rail || phone.matches) return;
    if (!target || !target.offsetParent) { ink.classList.remove('is-on'); return; }
    const r = rail.getBoundingClientRect(); const t = target.getBoundingClientRect();
    ink.classList.toggle('no-slide', !slide || !ink.classList.contains('is-on'));
    ink.style.width = `${t.width}px`;
    ink.style.transform = `translateX(${t.left - r.left - 1}px)`;
    ink.classList.add('is-on');
    ink.classList.toggle('is-here', target === here && !hover);
  }
  const restInk = () => { hover = null; placeInk(here); };
  railLinks.concat(more ? [more] : []).forEach((el) => {
    el.addEventListener('pointerenter', () => { hover = el; placeInk(el); });
    el.addEventListener('focus', () => { hover = el; placeInk(el); });
    el.addEventListener('blur', () => { if (hover === el) restInk(); });
  });
  rail?.addEventListener('pointerleave', () => { if (!moreLi?.classList.contains('is-open')) restInk(); });

  /* ---------- where you are ---------- */
  // the page's own link: in the rail, or an item of «المزيد» (the survey, the trainers' form)
  const pageLink = railLinks.find((a) => a.getAttribute('aria-current') === 'page')
    || menu?.querySelector('a[aria-current="page"]') || null;
  // mark `link` (a rail link or a menu item; null = the page's own) as where you are
  function setHere(link) {
    const mark = link || pageLink;
    header.querySelectorAll('.is-here').forEach((x) => x.classList.remove('is-here'));
    mark?.classList.add('is-here');
    const inMenu = !!mark && !!menu?.contains(mark);
    moreLi?.classList.toggle('is-current', inMenu);
    here = inMenu ? more : mark; // the pill rests on «المزيد» for an item inside it
    if (!hover) placeInk(here);
  }

  // home page: the section in view (who + goals belong to «من نحن»)
  if (location.pathname === '/' || location.pathname === '/index.html') {
    const ALIAS = { who: 'about', goals: 'about' };
    const sections = [...document.querySelectorAll('main section[id]')];
    let spied; let ticking = false;
    const spy = () => {
      ticking = false;
      const y = innerHeight * 0.35;
      const s = sections.find((x) => { if (x.hidden) return false; const r = x.getBoundingClientRect(); return r.top <= y && r.bottom > y; });
      const id = s ? ALIAS[s.id] || s.id : null;
      // «من نحن» is in the rail on wide screens, and in the menu on phones
      const link = !id ? null
        : (!phone.matches && header.querySelector(`.nav-list > li > a[href="/#${id}"]`)) || menu?.querySelector(`a[href="/#${id}"]`) || null;
      if (link === spied) return;
      spied = link; setHere(link);
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
    phone.addEventListener('change', () => { spied = undefined; spy(); });
    spy();
  } else setHere(null);

  /* ---------- solid on scroll, tucked away while scrolling down ---------- */
  let lastY = scrollY;
  const onScroll = () => {
    const y = scrollY;
    header.classList.toggle('is-scrolled', y > 8);
    const busy = isOpen() || moreLi?.classList.contains('is-open') || !!header.querySelector(':focus-visible');
    if (busy || y < 140) header.classList.remove('is-hidden');
    else if (y > lastY + 6) header.classList.add('is-hidden');
    else if (y < lastY - 6) header.classList.remove('is-hidden');
    if (Math.abs(y - lastY) > 6) lastY = y;
  };
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });
  header.addEventListener('focusin', () => { if (header.querySelector(':focus-visible')) header.classList.remove('is-hidden'); });

  /* ---------- «المزيد» ---------- */
  let hoverTimer = 0;
  const setMore = (open, focusFirst = false) => {
    if (!more || phone.matches) return;
    clearTimeout(hoverTimer);
    more.setAttribute('aria-expanded', String(open));
    moreLi.classList.toggle('is-open', open);
    if (open) { header.classList.remove('is-hidden'); hover = more; placeInk(more); } else if (!more.matches(':hover, :focus-visible')) restInk();
    if (open && focusFirst) requestAnimationFrame(() => menu.querySelector('li:not([hidden]) a')?.focus());
  };
  more?.addEventListener('click', (e) => { e.stopPropagation(); setMore(more.getAttribute('aria-expanded') !== 'true'); });
  more?.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setMore(true, true); } });
  // hover opens it on a mouse (a short pause, so passing over doesn't flash it)
  moreLi?.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || !finePointer.matches || phone.matches) return;
    clearTimeout(hoverTimer); hoverTimer = setTimeout(() => setMore(true), 90);
  });
  moreLi?.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse' || phone.matches) return;
    clearTimeout(hoverTimer); hoverTimer = setTimeout(() => setMore(false), 220);
  });
  // arrows walk the menu, Esc closes it
  menu?.addEventListener('keydown', (e) => {
    if (phone.matches) return;
    const items = [...menu.querySelectorAll('li:not([hidden]) a')].filter((a) => a.offsetParent !== null);
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  });
  moreLi?.addEventListener('focusout', (e) => { if (!phone.matches && !moreLi.contains(e.relatedTarget)) setMore(false); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.nav-more')) setMore(false); });

  /* ---------- the sheet (phones) ---------- */
  const setSheet = (open) => {
    if (!btn) return;
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
    nav.style.removeProperty('--drag');
    nav.classList.toggle('is-open', open);
    header.classList.toggle('menu-open', open);
    header.classList.remove('is-hidden');
    document.documentElement.classList.toggle('nav-locked', open);
    if (backdrop) backdrop.hidden = !open;
    if (open) { nav.scrollTop = 0; requestAnimationFrame(() => nav.querySelector('.nav-link')?.focus({ preventScroll: true })); }
  };
  btn?.addEventListener('click', () => setSheet(!isOpen()));
  closeBtn?.addEventListener('click', () => { setSheet(false); btn.focus(); });
  backdrop?.addEventListener('click', () => setSheet(false));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) { setSheet(false); setMore(false); } });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isOpen()) { setSheet(false); btn.focus(); } else if (moreLi?.classList.contains('is-open')) { setMore(false); more.focus(); }
  });
  // keep Tab inside the open sheet
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !isOpen()) return;
    const items = [...nav.querySelectorAll('a, button')].filter((x) => x.offsetParent !== null);
    const first = items[0]; const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); btn.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); btn.focus(); }
  });
  // drag the sheet down by its top to close it
  if (sheetHead) {
    let y0 = null; let dy = 0; let t0 = 0;
    sheetHead.addEventListener('pointerdown', (e) => {
      if (!isOpen() || e.target.closest('.nav-close')) return;
      y0 = e.clientY; dy = 0; t0 = performance.now();
      nav.classList.add('is-dragging'); sheetHead.setPointerCapture(e.pointerId);
    });
    sheetHead.addEventListener('pointermove', (e) => {
      if (y0 == null) return;
      dy = Math.max(0, e.clientY - y0);
      nav.style.setProperty('--drag', `${dy}px`);
    });
    const end = () => {
      if (y0 == null) return;
      y0 = null; nav.classList.remove('is-dragging');
      const fast = dy > 40 && dy / Math.max(1, performance.now() - t0) > 0.5; // a quick flick
      if (dy > nav.offsetHeight * 0.28 || fast) setSheet(false);
      else nav.style.removeProperty('--drag');
    };
    sheetHead.addEventListener('pointerup', end);
    sheetHead.addEventListener('pointercancel', end);
  }
  phone.addEventListener('change', () => { setSheet(false); setMore(false); requestAnimationFrame(() => placeInk(here, false)); });
  addEventListener('resize', () => placeInk(hover || here, false), { passive: true });
  document.fonts?.ready.then(() => placeInk(hover || here, false));

  /* ---------- a link to a section of the page you're on just scrolls there ---------- */
  nav.querySelectorAll('a[href^="/#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (location.pathname !== '/' && location.pathname !== '/index.html') return;
      const target = document.getElementById(a.getAttribute('href').slice(2));
      if (!target || target.hidden) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth' });
      history.replaceState(null, '', `#${target.id}`);
    });
  });
}
