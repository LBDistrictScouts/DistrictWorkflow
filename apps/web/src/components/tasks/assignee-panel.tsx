'use client';

import { useId, useState } from 'react';

type Person = { id: string; name: string };

export default function AssigneePanel({ assignees, people, disabled, onAdd, onRemove }: { assignees: Person[]; people: Person[]; disabled: boolean; onAdd: (id: string) => void; onRemove: (id: string) => void }) {
  const id = useId(); const [query, setQuery] = useState('');
  const current = [...new Map(assignees.map(person => [person.id, person])).values()];
  const results = people.filter(person => !current.some(assigned => assigned.id === person.id) && person.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return <section className="task-section"><h3>Assignees</h3>
    <ul className="task-assignees">{current.map(person => <li key={person.id}><span>{person.name}</span><button type="button" disabled={disabled || current.length <= 1} aria-label={`Remove ${person.name}`} onClick={() => onRemove(person.id)}>Remove</button></li>)}</ul>
    <p id={`${id}-hint`}>At least one assignee is required. Add someone before removing the last assignee.</p>
    <label htmlFor={`${id}-search`}>Add assignee</label><input id={`${id}-search`} type="search" autoComplete="off" placeholder="Search members by name…" value={query} disabled={disabled} aria-describedby={`${id}-hint`} onChange={event => setQuery(event.target.value)} />
    {query.trim() && <><p role="status">{results.length ? `${results.length} matching members${results.length > 20 ? ' — showing the first 20; refine your search for more' : ''}` : 'No unassigned members match your search.'}</p><ul className="task-assignee-results">{results.slice(0, 20).map(person => <li key={person.id}><span>{person.name}</span><button type="button" disabled={disabled} aria-label={`Add ${person.name}`} onClick={() => { onAdd(person.id); setQuery(''); }}>Add assignee</button></li>)}</ul></>}
  </section>;
}
