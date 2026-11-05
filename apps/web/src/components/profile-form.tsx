'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { UserProfile } from '@district/contracts/profile/types';

export default function ProfileForm({ initial, directoryName }: { initial: UserProfile; directoryName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

 if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(''); setSaved(false);

    try {
      const response = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        displayName: String(data.get('displayName') || '').trim() || null,
        taskResponsePreference: String(data.get('taskResponsePreference')),
      }) });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Unable to save your profile');
      setSaved(true); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save your profile'); }
    finally { setBusy(false); }
  }

  return <form className="fund-form" onSubmit={save} onChange={() => setSaved(false)}>
    <fieldset disabled={busy}><legend>About you</legend>
      <label>Display name <span>(optional)</span><input name="displayName" defaultValue={initial.displayName ?? ''} placeholder={directoryName} maxLength={200} autoComplete="nickname" /></label>
      <p className="fund-hint">Leave blank to use your district directory name. Your profile and preferences apply across all your appointment sign-ins.</p>
    </fieldset>
    <fieldset disabled={busy}><legend>Task requests</legend>
      <p>Choose how task requests arrive by email. Your tasks and response requirements stay the same.</p>
      <label className="fund-declaration"><input name="taskResponsePreference" type="radio" value="response-links" defaultChecked={initial.taskResponsePreference === 'response-links'} required />
        <span><strong>Response links in email</strong><br />For simple requests, show a link for each choice. Complex requests open a form.</span>
      </label>
      <label className="fund-declaration"><input name="taskResponsePreference" type="radio" value="task-notification" defaultChecked={initial.taskResponsePreference === 'task-notification'} required />
        <span><strong>Task notification</strong><br />Send one “Open task” link. I’ll review the task and respond on the website.</span>
      </label>
      <p className="fund-hint">Applies to future simple and complex response request emails. Existing emails keep their links.</p>
    </fieldset>
    {error && <p className="fund-error" role="alert">{error}</p>}
    {saved && <p className="fund-success" role="status">Your profile has been saved.</p>}
    <button className="button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
  </form>;
}
