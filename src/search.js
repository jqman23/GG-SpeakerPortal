import { normalizeSearch, queryTerms, prepareRecord, rankRecords } from './search-engine.js';

export function createPortalSearch({ tabs, activateTab, openSession }) {
  const $ = id => document.getElementById(id);
  const input = $('portal-search-input'), results = $('portal-search-results');
  const categories = ['All', 'FAQs', 'Guidance', 'Tools', 'Resources', 'Sessions'];
  let contentRecords = [], sessionRecords = [], records = [], filter = 'All', limit = 15;
  let sessionState = 'loading', navigating = false, searchTimer, rebuildTimer;
  const enabledTabs = tabs.filter(t => t.enabled && !t.external && t.sectionId !== 'portal-search');
  const returnButton = document.createElement('button');
  returnButton.type = 'button';
  returnButton.className = 'search-return';
  returnButton.textContent = '← Back to search results';
  returnButton.hidden = true;
  $('primary-tabs').after(returnButton);

  const textOf = node => {
    const copy = node.cloneNode(true);
    copy.querySelectorAll('script, style, summary, input, textarea, select, button, [hidden], #registration-result, #lookup-results, #overview-updates, #share-session-summary, #share-session-suggestions, #share-status').forEach(el => el.remove());
    return copy.textContent.replace(/\s+/g, ' ').trim();
  };
  function stableId(node, section, title) {
    if (node.id) return node.id;
    const base = `${section}-${normalizeSearch(title).replace(/ /g, '-')}`;
    let id = base, suffix = 2;
    while ($(id) && $(id) !== node) id = `${base}-${suffix++}`;
    node.id = id;
    return id;
  }
  function rebuild() {
    contentRecords = [];
    for (const tab of enabledTabs) {
      const root = $(tab.sectionId);
      if (!root) continue;
      const add = (node, title, type, text = textOf(node)) => {
        if (!title) return;
        const target = stableId(node, tab.sectionId, title);
        contentRecords.push(prepareRecord({ id: `${tab.sectionId}/${target}`, section: tab.sectionId, target, title, text, type, path: tab.mobileLabel || tab.label }));
      };
      if (tab.sectionId === 'faqs') {
        root.querySelectorAll('details').forEach(node => add(node, node.querySelector('summary')?.textContent.trim(), 'FAQs'));
      } else if (['registration-lookup', 'session-lookup', 'share'].includes(tab.sectionId)) {
        add(root, root.querySelector('h2')?.textContent.trim() || tab.label, 'Tools');
      } else {
        root.querySelectorAll('.hub-hero, .hub-section, .hub-support').forEach(node => {
          const steps = node.querySelectorAll('.overview-step-actions');
          if (steps.length) {
            node.querySelectorAll('li').forEach(li => add(li, li.querySelector('h4')?.textContent.trim(), 'Guidance'));
          } else add(node, node.querySelector('h2, h3, h4')?.textContent.trim(), 'Guidance');
        });
      }
      const seenLinks = new Set();
      root.querySelectorAll('a[href^="https://"], a[href^="mailto:"]').forEach(link => {
        if (seenLinks.has(link.href)) return;
        seenLinks.add(link.href);
        add(link, link.textContent.trim(), 'Resources');
      });
    }
    records = [...contentRecords, ...sessionRecords];
    render();
  }
  function highlighted(text, query) {
    const fragment = document.createDocumentFragment();
    const terms = queryTerms(query);
    String(text).split(/(\s+|[.,;:!?()“”"—–]+)/).forEach(part => {
      const normalized = normalizeSearch(part);
      if (normalized && terms.some(t => normalized.startsWith(t))) {
        const mark = document.createElement('mark'); mark.textContent = part; fragment.append(mark);
      } else fragment.append(document.createTextNode(part));
    });
    return fragment;
  }
  function excerpt(record, query) {
    const text = record.text;
    const terms = queryTerms(query);
    const index = text.toLowerCase().search(new RegExp(terms.join('|') || '$^', 'i'));
    const start = index > 65 ? text.lastIndexOf(' ', index - 45) + 1 : 0;
    return `${start ? '…' : ''}${text.slice(start, start + 210)}${text.length > start + 210 ? '…' : ''}`;
  }
  function render() {
    const query = input.value.trim();
    const ranked = rankRecords(records, query);
    const filtered = ranked.filter(({ record }) => filter === 'All' || record.type === filter);
    $('portal-search-clear').hidden = !input.value;
    $('search-filters').replaceChildren(...categories.map(type => {
      const button = document.createElement('button');
      button.type = 'button'; button.setAttribute('aria-pressed', String(filter === type));
      const count = type === 'All' ? ranked.length : ranked.filter(r => r.record.type === type).length;
      button.textContent = `${type}${query ? ` (${count})` : ''}`;
      button.addEventListener('click', () => { filter = type; limit = 15; render(); syncSearchUrl();
        [...$('search-filters').children].find(b => b.textContent.startsWith(type))?.focus(); });
      return button;
    }));
    $('search-session-status').textContent = sessionState === 'loading' ? 'Session details are loading. Answers and resources are ready to search.' : sessionState === 'error' ? 'Session details are unavailable right now. Answers and resources are still searchable; refresh to retry sessions.' : '';
    $('search-status').textContent = !query ? 'Start with a topic, a question, or a name.' : filtered.length ? `${filtered.length} result${filtered.length === 1 ? '' : 's'}${filter !== 'All' ? ` in ${filter}` : ''}. Showing ${Math.min(limit, filtered.length)}.` : `No results for “${query}”${filter !== 'All' ? ` in ${filter}` : ''}. Try fewer words${filter !== 'All' ? ' or choose All' : ', such as “registration” or “host”'}.`;
    $('search-suggestions').replaceChildren();
    if (!query) {
      ['Join as host', 'Am I registered?', 'CEU eligibility', 'Zoom and Embedded', 'Upload materials', 'Contact support'].forEach(topic => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = `${topic} ↗`;
        button.addEventListener('click', () => { input.value = topic; limit = 15; render(); syncSearchUrl(); input.focus(); });
        $('search-suggestions').append(button);
      });
    }
    results.replaceChildren(...filtered.slice(0, limit).map(({ record }, index) => {
      const li = document.createElement('li'), link = document.createElement('a');
      link.href = `#portal/${record.id}`; link.className = 'search-result';
      const meta = document.createElement('span'); meta.className = 'search-result-meta'; meta.textContent = `${record.type} / ${record.path}${index === 0 && filter === 'All' ? ' · Top match' : ''}`;
      const title = document.createElement('span'); title.className = 'search-result-title'; title.append(highlighted(record.title, query));
      const preview = document.createElement('span'); preview.className = 'search-result-preview'; preview.append(highlighted(excerpt(record, query), query));
      const arrow = document.createElement('span'); arrow.className = 'search-result-arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
      link.append(meta, title, preview, arrow);
      link.addEventListener('click', event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); syncSearchUrl(); history.pushState(null, '', link.hash); navigate(record);
      });
      li.append(link); return li;
    }));
    $('search-show-more').hidden = filtered.length <= limit;
  }
  function syncSearchUrl() {
    if (!$('portal-search').classList.contains('active')) return;
    const params = new URLSearchParams({ q: input.value, type: filter });
    history.replaceState(null, '', `#portal/search?${params}`);
  }
  function focusDestination(target) {
    if (!target) return;
    target.closest('details')?.setAttribute('open', '');
    target.querySelectorAll?.('details').forEach(el => { el.open = true; });
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      const focus = target.matches('details') ? target.querySelector('summary') : target;
      if (!focus.matches('a, button, input, summary')) focus.setAttribute('tabindex', '-1');
      focus.focus({ preventScroll: true });
      target.classList.remove('search-destination'); void target.offsetWidth;
      target.classList.add('search-destination');
      setTimeout(() => target.classList.remove('search-destination'), 2400);
    });
  }
  function navigate(record) {
    navigating = true;
    if (record.session) openSession(record.session); else activateTab(record.section);
    navigating = false;
    returnButton.hidden = false;
    const target = record.session ? $('lookup-results') : record.section === 'registration-lookup' && record.target === record.section ? $('registration-email') : $(record.target);
    focusDestination(target);
  }
  function showSearch(push = true) {
    navigating = true; activateTab('portal-search'); navigating = false;
    returnButton.hidden = true;
    if (push) history.pushState(null, '', '#portal/search');
    syncSearchUrl(); render(); input.focus();
  }
  function route() {
    const hash = location.hash;
    if (hash.startsWith('#portal/search')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      input.value = (params.get('q') || '').slice(0, 200);
      filter = categories.includes(params.get('type')) ? params.get('type') : 'All';
      showSearch(false); return;
    }
    if (hash.startsWith('#portal/')) {
      const record = records.find(r => `#portal/${r.id}` === hash);
      if (record) navigate(record);
      else if (hash.startsWith('#portal/session/') && sessionState === 'loading') {
        navigating = true; activateTab('portal-search'); navigating = false; render();
        $('search-status').textContent = 'Loading your linked session…';
      }
      else { showSearch(false); $('search-status').textContent = 'That result is no longer available. Search the current resources above.'; }
    } else if (hash.startsWith('#portal-tab/')) {
      const section = hash.slice('#portal-tab/'.length);
      if (enabledTabs.some(tab => tab.sectionId === section)) {
        navigating = true; activateTab(section); navigating = false; returnButton.hidden = true;
      }
    } else if (!hash) {
      navigating = true; activateTab(enabledTabs[0].sectionId); navigating = false; returnButton.hidden = true;
    }
  }
  $('portal-search-form').addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); render(); syncSearchUrl(); results.querySelector('a')?.focus(); });
  input.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { limit = 15; render(); syncSearchUrl(); }, 100); });
  input.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); results.querySelector('a')?.focus(); } });
  results.addEventListener('keydown', event => {
    const links = [...results.querySelectorAll('a')], index = links.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') { event.preventDefault(); links[Math.min(index + 1, links.length - 1)]?.focus(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); (index <= 0 ? input : links[index - 1]).focus(); }
    if (event.key === 'Escape') input.focus();
  });
  document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); showSearch(); } });
  $('portal-search-clear').addEventListener('click', () => { input.value = ''; filter = 'All'; limit = 15; render(); syncSearchUrl(); input.focus(); });
  $('search-show-more').addEventListener('click', () => { const previous = limit; limit += 15; render(); results.querySelectorAll('a')[previous]?.focus(); });
  returnButton.addEventListener('click', () => showSearch());
  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);
  rebuild();
  // Watch editorial content only: never index registration responses or form values.
  const observer = new MutationObserver(() => { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuild, 150); });
  enabledTabs.filter(tab => ['overview', 'faqs', 'attendee-hub'].includes(tab.sectionId)).forEach(tab => {
    observer.observe($(tab.sectionId), { childList: true, subtree: true, characterData: true });
  });
  route();
  return {
    setSessions(sessions, failed = false) {
      sessionState = failed ? 'error' : 'ready';
      sessionRecords = sessions.map(session => prepareRecord({ id: `session/${encodeURIComponent(session.id)}`, title: session.title || 'Untitled session', type: 'Sessions', path: 'Session lookup', session,
        text: [(session.speakers || []).map(s => s.name).join(', '), session.description, session.code, session.presentationType, session.videoFormat, session.ceuEligibility, session.recordingStatus].filter(Boolean).join(' · ') }));
      records = [...contentRecords, ...sessionRecords]; render();
      if (location.hash.startsWith('#portal/session/')) route();
    },
    onTabChange(section) {
      returnButton.hidden = true;
      if (navigating) return;
      history.pushState(null, '', section === 'portal-search' ? `#portal/search?${new URLSearchParams({ q: input.value, type: filter })}` : `#portal-tab/${section}`);
      if (section === 'portal-search') requestAnimationFrame(() => input.focus());
    }
  };
}
