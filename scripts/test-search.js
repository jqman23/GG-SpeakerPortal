import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRecord, rankRecords } from '../src/search-engine.js';

const records = [
  { id: 'host', title: 'Why don’t I see a “Join as host” button?', text: 'The button will not appear before September 28, 2026.' },
  { id: 'register', title: 'Registration Information Lookup', text: 'Check whether you are registered with your registration email.' },
  { id: 'faq', title: 'What is Attendee Hub, and how do I log in?', text: 'Enter your registration email and verification code.' },
  { id: 'session', title: 'Centering Culture for Transformative Systems Change', text: 'María García · Embedded · CEU Eligible' },
  { id: 'incidental', title: 'Other resources', text: 'Learn about your session, registration, the join as host button and support.' },
].map(prepareRecord);
const ids = query => rankRecords(records, query).map(result => result.record.id);

test('exact FAQ title ranks above incidental body mentions', () => {
  assert.equal(ids('join as host')[0], 'host');
});
test('handles two-letter typos and partial words', () => {
  assert.equal(ids('registed')[0], 'register');
  assert.equal(ids('registr')[0], 'register');
});
test('natural questions and synonyms find the relevant tool', () => {
  assert.equal(ids('am I registered?')[0], 'register');
  assert.equal(ids('signup')[0], 'register');
});
test('accent-insensitive speaker names find database sessions', () => {
  assert.equal(ids('Maria Garcia')[0], 'session');
});
test('unrelated queries and empty input do not create spurious matches', () => {
  assert.deepEqual(ids(''), []);
  assert.deepEqual(ids('how do I'), []);
  assert.deepEqual(ids('astronaut zebras'), []);
  assert.deepEqual(ids('<script>alert(1)</script>'), []);
});
test('requires query coverage instead of matching one generic word', () => {
  assert.deepEqual(ids('session astronaut zebras'), []);
});
