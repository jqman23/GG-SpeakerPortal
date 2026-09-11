export function bindRegistrationLookup() {
  const form = document.getElementById('registration-lookup-form');
  const emailInput = document.getElementById('registration-email');
  const nameInput = document.getElementById('registration-name');
  const emailFields = document.getElementById('registration-email-fields');
  const nameFields = document.getElementById('registration-name-fields');
  const emailTab = document.getElementById('registration-tab-email');
  const nameTab = document.getElementById('registration-tab-name');
  const result = document.getElementById('registration-result');
  const submit = form.querySelector('button');
  const demo = document.getElementById('registration-demo');
  let mode = 'email';
  let revision = 0;
  [emailInput, nameInput].forEach(input => input.addEventListener('input', () => { revision++; result.replaceChildren(); }));
  function setMode(nextMode, focus = true) {
    mode = nextMode;
    const byEmail = mode === 'email';
    emailFields.hidden = !byEmail;
    nameFields.hidden = byEmail;
    emailInput.required = byEmail;
    nameInput.required = !byEmail;
    emailTab.className = `px-4 py-2 text-sm font-medium border border-gray-200 rounded-l-lg ${byEmail ? 'tab-active bg-[var(--survey-primary)] text-white' : 'tab-inactive'}`;
    nameTab.className = `px-4 py-2 text-sm font-medium border border-gray-200 rounded-r-lg ${byEmail ? 'tab-inactive' : 'tab-active bg-[var(--survey-primary)] text-white'}`;
    emailTab.setAttribute('aria-pressed', String(byEmail));
    nameTab.setAttribute('aria-pressed', String(!byEmail));
    result.replaceChildren();
    revision++;
    if (focus) (byEmail ? emailInput : nameInput).focus();
  }
  emailTab.addEventListener('click', () => setMode('email'));
  nameTab.addEventListener('click', () => setMode('name'));
  function line(label, value) {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = label + ': ';
    p.append(strong, String(value));
    result.append(p);
  }
  function formatRegistrationDate(value) {
    if (!value) return 'Not available';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short'
    }).format(date);
  }
  function paragraph(text, className = '') {
    const p = document.createElement('p');
    p.className = className;
    p.textContent = text;
    result.append(p);
    return p;
  }
  function contactPrompt(text) {
    const box = document.createElement('div');
    box.className = 'hub-note registration-alert';
    const strong = document.createElement('strong');
    strong.textContent = 'Possible email mismatch. ';
    const copy = document.createTextNode(text + ' ');
    const link = document.createElement('a');
    link.href = 'mailto:globalgathering@cuanschutz.edu';
    link.textContent = 'Contact the Global Gathering Team';
    box.append(strong, copy, link, document.createTextNode(' so they can verify your Host access.'));
    result.append(box);
  }
  function renderResult(data, resultMode = mode) {
    result.replaceChildren();
    const heading = document.createElement('h3');
    heading.className = 'font-bold text-lg mb-3';
    heading.textContent = data.found ? 'Registration confirmed' : data.ambiguous ? 'We found more than one possible match' : `We couldn’t confirm a registration for that ${resultMode === 'email' ? 'email' : 'name'}`;
    result.append(heading);
    if (data.found) {
      line('Name', data.registration.name || 'Not available');
      line('Email', data.registration.email);
      line('Registered', formatRegistrationDate(data.registration.registeredAt));
      line('CEUs included', data.registration.ceusIncluded ? 'Yes' : 'No');
      if (data.emailMismatch) contactPrompt(`Your registration email (${data.registration.email}) appears to differ from the email on your speaker profile (${data.speakerEmail}).`);
    } else if (data.ambiguous) {
      paragraph('For your privacy, the lookup cannot choose between people or records with the same name. Try searching by email, or contact the Global Gathering Team.');
    } else {
      paragraph(`Check the ${resultMode === 'email' ? 'address' : 'name'}, allow time for recent registrations to appear, or contact the Global Gathering Team. A missing result does not necessarily mean you aren’t registered.`);
    }
    if (data.updatedAt) line('Registration records last updated', new Date(data.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
  }
  demo.addEventListener('click', () => {
    revision++;
    renderResult({
      found: true,
      registration: { name: 'Jordan S.', email: 'j•••••@registration.example', registeredAt: '2026-09-01T18:30:00Z', ceusIncluded: true },
      speakerEmail: 'j•••••@speaker.example',
      emailMismatch: true
    }, 'email');
    result.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
  });
  async function checkRegistration() {
    const request = ++revision;
    submit.disabled = true;
    result.textContent = 'Checking registration records…';
    try {
      const response = await fetch('https://gg-backend-masterplanner.vercel.app/api/resources?service=registration-lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'email'
          ? { email: emailInput.value.trim().toLowerCase() }
          : { name: nameInput.value.trim() }),
        signal: AbortSignal.timeout(20000)
      });
      const data = await response.json();
      if (request !== revision) return;
      if (!response.ok) throw new Error(data.error || 'Registration lookup is temporarily unavailable. Please contact the Global Gathering Team.');
      renderResult(data);
    } catch (error) {
      if (request === revision) result.textContent = error.name === 'TimeoutError' || error instanceof TypeError ? 'Registration lookup is temporarily unavailable. Please try again or contact the Global Gathering Team.' : error.message;
    } finally { submit.disabled = false; }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    checkRegistration();
  });
  return email => {
    setMode('email', false);
    emailInput.value = String(email || '').trim().toLowerCase();
    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    return checkRegistration();
  };
}
