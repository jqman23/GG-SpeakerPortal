// Shared by the browser and ranking tests. No requests or user-query storage.
export const normalizeSearch = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set('a an the to of for in on and or is are am i my me it do does how what can you your with be as have this any please why don t cannot know need see should will there when after then not sure find out'.split(' '));
const GROUPS = [
  ['register', 'registered', 'registration', 'signup'],
  ['login', 'signin', 'access', 'log', 'sign'],
  ['record', 'recorded', 'recording'],
  ['ceu', 'credit', 'credits', 'eligible', 'eligibility'],
  ['presenter', 'presenters', 'speaker', 'speakers'],
  ['poll', 'polls', 'polling'], ['host', 'hosting'],
  ['caption', 'captions', 'transcript', 'transcription'],
  ['help', 'support', 'contact'], ['slides', 'materials', 'upload'],
  ['share', 'linkedin', 'social'], ['edit', 'update', 'change'],
];
export function queryTerms(query) {
  return [...new Set(normalizeSearch(query).split(' ').filter(t => t && !STOP.has(t)))].slice(0, 20);
}
function near(a, b) {
  const tolerance = a.length >= 7 ? 2 : 1;
  if (a.length < 4 || Math.abs(a.length - b.length) > tolerance) return false;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] !== b[j - 1]));
    if (Math.min(...next) > tolerance) return false;
    row = next;
  }
  return row[b.length] <= tolerance;
}
export function prepareRecord(record) {
  const title = normalizeSearch(record.title);
  const body = normalizeSearch(record.text);
  return { ...record, normalizedTitle: title, normalizedBody: body,
    titleWords: title.split(' '), bodyWords: [...new Set(body.split(' '))] };
}
export function rankRecords(records, query) {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const phrase = normalizeSearch(query);
  const fuzzyCache = new Map();
  const fuzzyMatch = (term, word) => {
    const key = `${term}/${word}`;
    if (!fuzzyCache.has(key)) fuzzyCache.set(key, near(term, word));
    return fuzzyCache.get(key);
  };
  return records.map(record => {
    let score = 0, matched = 0;
    for (const term of terms) {
      const synonyms = GROUPS.find(group => group.includes(term)) || [];
      const match = words => {
        if (words.includes(term)) return 1;
        if (term.length >= 3 && words.some(w => w.startsWith(term))) return .8;
        if (words.some(w => synonyms.includes(w))) return .65;
        if (words.some(w => fuzzyMatch(term, w))) return .45;
        return 0;
      };
      const titleMatch = match(record.titleWords), bodyMatch = match(record.bodyWords);
      if (titleMatch || bodyMatch) matched++;
      score += Math.max(titleMatch * 12, bodyMatch * 3);
    }
    // Require coverage of the query to avoid long, incidental matches taking over.
    if (matched < Math.ceil(terms.length * .7)) return null;
    if (record.normalizedTitle.includes(phrase)) score += 20;
    if (record.normalizedBody.includes(phrase)) score += terms.length > 1 ? 14 : 4;
    score += matched / terms.length * 8;
    return { record, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title));
}
