'use client';

import { useEffect, useId, useState, type KeyboardEvent } from 'react';

export interface MemberSearchResult { id: string; name: string }

export default function MemberSearch({ selected, onSelect, disabled = false }: {
  selected: MemberSearchResult | null; onSelect(member: MemberSearchResult | null): void; disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState<MemberSearchResult[]>([]);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (selected || disabled || query.trim().length < 2) return;
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setStatus('Searching…'); setError('');

      try {
        const response = await fetch(`/api/members/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: 'no-store' });
        const result = await response.json();

        if (!response.ok) throw new Error(result.error || 'Unable to search members');

        if (controller.signal.aborted) return;
        setMembers(result.members); setActive(-1); setStatus(result.members.length ? `${result.members.length} matching members. Use the arrow keys to choose, then Enter.` : 'No active members found. Try another name or email.');
      } catch (failure) {
        if (!controller.signal.aborted) { setMembers([]); setStatus(''); setError(failure instanceof Error ? failure.message : 'Unable to search members'); }
      }
    }, 300);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, selected, disabled, attempt]);

  function choose(member: MemberSearchResult) {
    if (disabled) return;
    onSelect(member); setMembers([]); setActive(-1); setStatus(''); setError('');
  }

  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();

      if (members.length) setActive(index => event.key === 'ArrowDown' ? (index + 1) % members.length : (index <= 0 ? members.length - 1 : index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();

 if (members[active]) choose(members[active]);
    } else if (event.key === 'Escape') { setMembers([]); setActive(-1); }
  }

  if (selected) return <div className="member-selected"><div><strong>{selected.name}</strong><small>Member UUID: {selected.id}</small></div>
    <button type="button" disabled={disabled} className="text-link" onClick={() => { onSelect(null); setQuery(''); }}>Change applicant</button>
  </div>;

  return <div className="member-search">
    <label htmlFor={id}>Find the applicant<input id={id} type="search" required value={query} maxLength={100} disabled={disabled} autoComplete="off"
      placeholder="Search by member name or email" role="combobox" aria-autocomplete="list" aria-expanded={members.length > 0} aria-controls={`${id}-results`}
      aria-activedescendant={active >= 0 && members[active] ? `${id}-${active}` : undefined} aria-describedby={`${id}-hint`}
      onKeyDown={navigate} onChange={event => { setQuery(event.target.value); setMembers([]); setActive(-1); setStatus(''); setError(''); }} /></label>
    <p id={`${id}-hint`} className="fund-hint">Enter at least two characters and select the correct member. Applicant contact details come from the district directory.</p>
    <ul id={`${id}-results`} role="listbox" aria-label="Matching members" className="member-results">{members.map((member, index) =>
      <li key={member.id} id={`${id}-${index}`} role="option" aria-selected={active === index} className={active === index ? 'is-active' : ''}
        onMouseEnter={() => setActive(index)} onClick={() => choose(member)}><strong>{member.name}</strong><small>{member.id}</small></li>)}</ul>
    <p role="status">{status}</p>
    {error && <div><p className="fund-error" role="alert">{error}</p><button type="button" className="text-link" disabled={disabled} onClick={() => setAttempt(value => value + 1)}>Retry member search</button></div>}
  </div>;
}
