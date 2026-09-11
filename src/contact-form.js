const CONTACT_EMAIL = 'globalgathering@cuanschutz.edu';
const SESSIONS_URL = '/api/sessions';
const CONTACT_URL = 'https://gg-backend-masterplanner.vercel.app/api/resources?service=speaker-contact';

export function bindContactForm() {
  const modal = document.getElementById('contact-form-modal');
  const dialog = modal?.querySelector('.contact-modal-dialog');
  const form = document.getElementById('contact-form');
  if (!modal || !dialog || !form) return;
  const name = document.getElementById('contact-name');
  const email = document.getElementById('contact-email');
  const session = document.getElementById('contact-session');
  const options = document.getElementById('contact-session-options');
  const message = document.getElementById('contact-message');
  const status = document.getElementById('contact-form-status');
  const submit = form.querySelector('[type="submit"]');
  let lastFocus;

  async function loadSessions() {
    if (options.children.length) return;
    try {
      const response = await fetch(SESSIONS_URL, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) return;
      const data = await response.json();
      options.replaceChildren(...(data.sessions || []).map(item => {
        const option = document.createElement('option');
        option.value = item.title;
        return option;
      }));
    } catch (_) {}
  }

  function open(source) {
    lastFocus = source;
    modal.hidden = false;
    document.body.classList.add('contact-modal-open');
    status.textContent = '';
    dialog.focus();
    loadSessions();
    requestAnimationFrame(() => name.focus());
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove('contact-modal-open');
    lastFocus?.focus();
  }

  document.addEventListener('click', event => {
    const link = event.target.closest?.(`a[href^="mailto:${CONTACT_EMAIL}"]`);
    if (!link) return;
    event.preventDefault();
    open(link);
  });
  modal.querySelectorAll('[data-contact-close]').forEach(button => button.addEventListener('click', close));
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
    if (event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button:not(:disabled), input:not([tabindex="-1"]), textarea')].filter(item => !item.hidden);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    submit.disabled = true;
    status.className = 'contact-form-status';
    status.textContent = 'Sending your message…';
    try {
      const response = await fetch(CONTACT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.value.trim(), email: email.value.trim(), session: session.value.trim(),
          message: message.value.trim(), website: form.elements.website.value
        }),
        signal: AbortSignal.timeout(20000)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Your message could not be sent.');
      form.reset();
      status.className = 'contact-form-status contact-form-success';
      status.textContent = 'Your message was sent to the Global Gathering Team.';
      submit.textContent = 'Sent';
      setTimeout(() => { submit.textContent = 'Send message'; close(); }, 1800);
    } catch (error) {
      status.className = 'contact-form-status contact-form-error';
      status.textContent = error.name === 'TimeoutError' || error instanceof TypeError
        ? 'Your message could not be sent right now. Please try again.' : error.message;
    } finally { submit.disabled = false; }
  });
}
