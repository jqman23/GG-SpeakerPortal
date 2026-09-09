export function bindRegistrationLookup() {
  const form = document.getElementById('registration-lookup-form');
  const input = document.getElementById('registration-email');
  const result = document.getElementById('registration-result');
  const submit = form.querySelector('button');
  let revision = 0;
  input.addEventListener('input', () => { revision++; result.replaceChildren(); });
  function line(label, value) {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = label + ': ';
    p.append(strong, String(value));
    result.append(p);
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const request = ++revision;
    submit.disabled = true;
    result.textContent = 'Checking registration records…';
    try {
      const response = await fetch('https://gg-backend-masterplanner.vercel.app/api/resources?service=registration-lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: input.value.trim().toLowerCase() }), signal: AbortSignal.timeout(20000)
      });
      const data = await response.json();
      if (request !== revision) return;
      if (!response.ok) throw new Error(data.error || 'Registration lookup is temporarily unavailable. Please contact the Global Gathering Team.');
      result.replaceChildren();
      const heading = document.createElement('h3');
      heading.className = 'font-bold text-lg mb-3';
      heading.textContent = data.found ? 'Registration confirmed' : 'We couldn’t confirm a registration for that email';
      result.append(heading);
      if (data.found) {
        line('Name', data.registration.name || 'Not available');
        line('Email', data.registration.email);
        line('Registered (GMT)', data.registration.registeredAt || 'Not available');
        line('CEUs included', data.registration.ceusIncluded ? 'Yes' : 'No');
      } else {
        const p = document.createElement('p');
        p.textContent = 'Check the address, allow time for recent registrations to appear, or contact the Global Gathering Team. A missing result does not necessarily mean you aren’t registered.';
        result.append(p);
      }
      line('Registration records last updated', new Date(data.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
    } catch (error) {
      if (request === revision) result.textContent = error.name === 'TimeoutError' || error instanceof TypeError ? 'Registration lookup is temporarily unavailable. Please try again or contact the Global Gathering Team.' : error.message;
    } finally { submit.disabled = false; }
  });
}
