import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationResultHeading } from '../src/registration-lookup.js';

test('confirms the registration when the entered email is the registered email', () => {
  const data = {
    found: true,
    emailMismatch: true,
    registration: { email: 'ashlieseibers@gmail.com' },
    speakerEmail: 'ashlie.seibers@tn.gov'
  };
  assert.equal(registrationResultHeading(data, 'email', 'ashlieseibers@gmail.com'), 'Registration confirmed');
});

test('reports a different registration email when the entered speaker email is not registered', () => {
  const data = {
    found: true,
    emailMismatch: true,
    registration: { email: 'ashlieseibers@gmail.com' },
    speakerEmail: 'ashlie.seibers@tn.gov'
  };
  assert.equal(registrationResultHeading(data, 'email', 'ashlie.seibers@tn.gov'), 'Registration found under a different email');
});

test('prioritizes an ambiguous name result over email mismatch metadata', () => {
  const data = { found: false, ambiguous: true, emailMismatch: true };
  assert.equal(registrationResultHeading(data, 'name', ''), 'We found more than one possible match');
});

test('confirms a unique name result even when associated emails differ', () => {
  const data = {
    found: true,
    emailMismatch: true,
    registration: { email: 'ashlieseibers@gmail.com' },
    speakerEmail: 'ashlie.seibers@tn.gov'
  };
  assert.equal(registrationResultHeading(data, 'name', ''), 'Registration confirmed');
});

test('reports an unconfirmed lookup using the selected search mode', () => {
  assert.equal(registrationResultHeading({ found: false }, 'email', 'missing@example.com'), 'We couldn’t confirm a registration for that email');
  assert.equal(registrationResultHeading({ found: false }, 'name', ''), 'We couldn’t confirm a registration for that name');
});
