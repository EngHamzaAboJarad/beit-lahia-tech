// One dialog for the whole admin panel, in the site's look, instead of the browser's confirm() / prompt():
//
//   if (!(await ask('نحذف المنشور؟', { tone: 'danger', ok: 'احذف' }))) return;
//   const name = await askText('اسم القالب الجديد؟', 'قالب', { ok: 'احفظ' }); // null when cancelled
//
// tone: 'danger'  — deleting, cancelling, rejecting (red button; «لا» is focused first)
//       'publish' — something goes out to the site or social media (green)
//       'warn'    — unsaved changes would be lost (amber)
//       'default' — any other question
// title: optional heading (each tone has its own). Messages may hold line breaks (\n).
// One dialog at a time: a second call waits for the first to be answered.

const TONES = {
  danger: { title: 'متأكد؟', ok: 'احذف', icon: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>' },
  publish: { title: 'جاهز للنشر؟', ok: 'انشر', icon: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>' },
  warn: { title: 'في تعديلات ما انحفظت', ok: 'كمّل', icon: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>' },
  default: { title: 'تأكيد', ok: 'تمام', icon: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>' },
};

let dlg = null;
let queue = Promise.resolve();

function build() {
  dlg = document.createElement('dialog');
  dlg.className = 'ask-dlg';
  dlg.dir = 'rtl';
  dlg.setAttribute('aria-labelledby', 'ask-title');
  dlg.setAttribute('aria-describedby', 'ask-msg');
  dlg.innerHTML = `<form method="dialog" class="ask-box">
    <span class="ask-icon" aria-hidden="true"><svg viewBox="0 0 24 24"></svg></span>
    <h2 class="ask-title" id="ask-title"></h2>
    <p class="ask-msg" id="ask-msg"></p>
    <input class="ask-input" type="text" autocomplete="off" hidden>
    <div class="ask-actions">
      <button class="btn btn-sm ask-ok" value="ok"></button>
      <button class="btn btn-sm btn-ghost-dark ask-no" value="no" type="button"></button>
    </div>
  </form>`;
  // a click on the dimmed backdrop (outside the box) answers «no», like Esc
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close('no'); });
  dlg.querySelector('.ask-no').addEventListener('click', () => dlg.close('no'));
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); dlg.close('no'); });
  document.body.append(dlg);
}

function open(message, opts, withInput, value) {
  if (!dlg) build();
  const tone = TONES[opts.tone] ? opts.tone : 'default';
  const t = TONES[tone];
  dlg.dataset.tone = tone;
  dlg.querySelector('.ask-icon svg').innerHTML = t.icon;
  dlg.querySelector('.ask-title').textContent = opts.title || t.title;
  dlg.querySelector('.ask-msg').textContent = message || '';
  dlg.querySelector('.ask-msg').hidden = !message;
  const input = dlg.querySelector('.ask-input');
  input.hidden = !withInput;
  input.value = withInput ? String(value ?? '') : '';
  input.placeholder = opts.placeholder || '';
  if (withInput) input.setAttribute('aria-label', opts.title || message || 'النص');
  const ok = dlg.querySelector('.ask-ok');
  ok.textContent = opts.ok || t.ok;
  ok.className = `btn btn-sm ask-ok ${tone === 'danger' ? 'btn-danger-solid' : tone === 'warn' ? 'btn-dark' : 'btn-primary'}`;
  dlg.querySelector('.ask-no').textContent = opts.no || 'لا';
  dlg.returnValue = '';
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok' ? (withInput ? input.value : true) : (withInput ? null : false)), { once: true });
    dlg.showModal();
    if (withInput) { input.focus(); input.select(); } else (tone === 'danger' ? dlg.querySelector('.ask-no') : ok).focus();
  });
}

/** a yes/no question → true / false */
export function ask(message, opts = {}) {
  const run = queue.then(() => open(message, opts, false));
  queue = run.catch(() => {});
  return run;
}

/** a question with a text box → the text, or null when cancelled */
export function askText(message, value = '', opts = {}) {
  const run = queue.then(() => open(message, opts, true, value));
  queue = run.catch(() => {});
  return run;
}
