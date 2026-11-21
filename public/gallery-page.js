// Beit Lahia Tech — /gallery: every published album (stacks of cards → the album → the lightbox).
import { getDbLite } from './firebase-init.js';
import { renderFooterLinks } from './content-defaults.js';
import { fetchGallery, renderAlbums, albumsOf, photoCount } from './gallery-ui.js';

const $ = (id) => document.getElementById(id);
document.documentElement.classList.add('js');
const year = $('year'); if (year) year.textContent = new Date().getFullYear();
renderFooterLinks($('footer-social'), null);

(async () => {
  const status = $('gallery-status');
  try {
    const { db, fs } = await getDbLite();
    const list = await fetchGallery(db, fs);
    if (!list.length) { status.textContent = 'لسا ما في صور منشورة. قريباً إن شاء الله.'; return; }
    renderAlbums($('gallery-grid'), list);
    const albums = albumsOf(list).length;
    status.textContent = '';
    $('gallery-count').textContent = `${albums === 1 ? 'ألبوم واحد' : albums === 2 ? 'ألبومين' : `${albums} ${albums <= 10 ? 'ألبومات' : 'ألبوم'}`} · ${photoCount(list.length)}`;
    // the footer's contact, from the settings the admin keeps
    renderFooterLinks($('footer-social'), (await fs.getDoc(fs.doc(db, 'site', 'settings'))).data() || {});
  } catch (e) {
    console.warn('[gallery]', e);
    status.textContent = 'ما قدرنا نجيب الصور هلّق. جرّب كمان شوي.';
  }
})();
