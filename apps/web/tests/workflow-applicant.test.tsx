import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ApplicationForm from '../src/components/training-fund/application-form';
import MemberSearch from '../src/components/member-search';

test('Training Fund forms use member selection instead of manual applicant contact fields', () => {
  for (const mode of ['member', 'staff'] as const) {
    const html = renderToStaticMarkup(createElement(ApplicationForm, { mode }));
    assert.ok(html.includes('Find the applicant'));
    assert.ok(html.includes('role="combobox"'));

    for (const name of ['name', 'email', 'group', 'role', 'membership']) assert.ok(!html.includes(`name="${name}"`), name);
  }

  const member = { id: '40000000-0000-4000-8000-000000000001', name: 'Selected Member' };
  const selected = renderToStaticMarkup(createElement(MemberSearch, { selected: member, onSelect: () => {} }));
  assert.ok(selected.includes(member.name));
  assert.ok(selected.includes(member.id));
  assert.ok(selected.includes('Change applicant'));
});
