'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ActivityApproval({ taskId, onApproved }: { taskId: string; onApproved?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  async function approve() {
    setBusy(true); setMessage('');

    try {
      const response = await fetch('/api/activity-notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, action: 'approve' }) });

      if (!response.ok) throw new Error('Approval could not be saved. Refresh the task and try again.');
      setMessage('Approval recorded.'); router.refresh();
      await onApproved?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Please retry.'); }
    finally { setBusy(false); }
  }

  return <div><button type="button" disabled={busy} onClick={approve}>{busy ? 'Saving approval…' : 'Approve activity'}</button><p role="status">{message}</p></div>;
}
