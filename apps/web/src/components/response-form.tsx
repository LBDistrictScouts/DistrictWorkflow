'use client';

import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import type { ResponseView } from '@district/contracts/responses/types';

class ResponseHttpError extends Error { constructor(message: string, public status: number) { super(message); } }

async function request(token: string, action: 'view' | 'submit', answers?: Record<string, string>): Promise<ResponseView> {
  const response = await fetch('/api/responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action, answers }) });
  const result = await response.json();

  if (!response.ok) throw new ResponseHttpError(result.error || 'Unable to open this response', response.status);

  return result;
}

export default function ResponseForm({ taskToken, initialChoice, onChanged }: { taskToken?: string; initialChoice?: string; onChanged?: () => void } = {}) {
  const token = useRef('');
  const pending = useRef<Record<string, string> | null>(null);
  const preselected = useRef('');
  const [view, setView] = useState<ResponseView | null>(null);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let version = 0;

    function open() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      token.current = taskToken || params.get('token') || token.current;
      preselected.current = initialChoice || params.get('choice') || preselected.current;

      if (!token.current) return;

      if (!taskToken) window.history.replaceState(window.history.state, '', window.location.pathname);
      const current = ++version;
      request(token.current, 'view').then(result => {
        if (!active || current !== version) return;
        pending.current = null; setRetry(false); setView(result); setError('');
        setChoice(result.definition.kind === 'simple' && result.definition.choices.some(item => item.value === preselected.current) ? preselected.current : '');
      }).catch(failure => { if (active && current === version) { setView(null); setError(failure.message); } });
    }

    open(); window.addEventListener('hashchange', open);

    return () => { active = false; window.removeEventListener('hashchange', open); };
  }, [taskToken, initialChoice]);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!view || busy) return;

    if (!pending.current) {
      const data = new FormData(event.currentTarget);
      pending.current = Object.fromEntries([...data.entries()].flatMap(([name, value]) => value !== '' ? [[name, String(value)]] : []));
    }

    setBusy(true); setError('');

    try { setView(await request(token.current, 'submit', pending.current)); onChanged?.(); pending.current = null; setRetry(false); }
    catch (failure) {
      // Keep the exact payload after an uncertain receipt; never accidentally submit changed bank details.
      const invalid = failure instanceof ResponseHttpError && failure.status === 400;

      if (invalid) pending.current = null;
      setRetry(!invalid); setError(failure instanceof Error ? failure.message : 'Unable to record your response');
    } finally { setBusy(false); }
  }

  if (view?.completed) return <div className="empty-state" role="status"><h1>Response received</h1><p>Your response has been recorded. You can close this page.</p></div>;

  if (!view) return <div className="empty-state"><h1>Your response</h1><p>Open your personal email link to load this task. If you just signed in, reopen the link.</p>{error && <p className="fund-error" role="alert">{error}</p>}</div>;

  return <form className="fund-form" onSubmit={submit}>
    <h1>{view.heading}</h1><p>{view.instructions}</p>
    <fieldset disabled={busy || retry}><legend>{view.definition.kind === 'simple' ? 'Choose your response' : 'Your details'}</legend>
      {view.definition.kind === 'simple' ? view.definition.choices.map(item => <label className="fund-declaration" key={item.value}>
        <input name="choice" type="radio" required value={item.value} checked={choice === item.value} onChange={() => setChoice(item.value)} />{item.label}
      </label>) : view.definition.fields.map(field => <label key={field.name}>{field.label}{!field.required && <span>(optional)</span>}
        {field.type === 'textarea' ? <textarea name={field.name} required={field.required} maxLength={field.maxLength ?? 4000} rows={4} autoComplete="off" />
          : field.type === 'select' ? <select name={field.name} required={field.required} defaultValue=""><option value="">Choose an option</option>{field.options?.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            : <input name={field.name} type={field.type} required={field.required} maxLength={field.maxLength ?? 4000} pattern={field.pattern} autoComplete="off" />}
      </label>)}
    </fieldset>
    {error && <p className="fund-error" role="alert">{error}</p>}
    {retry && <p role="status">Retrying preserves your original answers. If the response was already recorded, it will not be recorded twice.</p>}
    <button className="button" disabled={busy} type="submit">{busy ? 'Submitting…' : retry ? 'Retry response' : 'Confirm response'}</button>
  </form>;
}
