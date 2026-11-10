'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { taskReference, type TaskReference } from '@/lib/task-reference';
import AwardTask from './award-task';
import ActivityTask from './activity-task';
import TaskPanel from '../training-fund/task-panel';
import ResponseForm from '../response-form';

/** One host for task links from cards, tables, notifications and direct URLs. */
export default function TaskModal() {
  const [task, setTask] = useState<TaskReference | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter(); const pathname = usePathname();
  const changed = useCallback(() => { window.dispatchEvent(new Event('task-updated')); router.refresh(); }, [router]);
  useEffect(() => {
    const openLocation = () => {
      const reference = taskReference(window.location.href, window.location.origin);

      if (reference) {
        setTask(reference);

        // Email capabilities stay only in memory once opened.
        if (reference.kind === 'training-fund' || reference.kind === 'response') window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      }
    };

    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a') : null;

      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const reference = taskReference(link.href, window.location.origin);

      if (reference) { event.preventDefault(); setTask(reference); }
    };

    openLocation();
    document.addEventListener('click', click, true); window.addEventListener('hashchange', openLocation);

    return () => { document.removeEventListener('click', click, true); window.removeEventListener('hashchange', openLocation); };
  }, [pathname]);
  useEffect(() => {
    if (!task || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';

    return () => { element.close(); document.body.style.overflow = previous; };
  }, [task]);

  if (!task) return null;
  const key = task.kind === 'award' || task.kind === 'activity' ? task.id : task.token;

  return <dialog ref={dialog} className="task-modal" aria-labelledby="task-modal-title" onClose={() => { if (!dialog.current?.open) setTask(null); }} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect();

 if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.currentTarget.close(); } }}>
    <header className="task-modal-header"><div><p className="eyebrow">District workflow task</p><h2 id="task-modal-title">{task.kind === 'award' ? 'Present Award' : task.kind === 'activity' ? 'Approve activity notification' : task.kind === 'training-fund' ? 'Training Fund task' : 'Your response'}</h2></div><button type="button" aria-label="Close task" onClick={() => dialog.current?.close()}>Close ×</button></header>
    <div className="task-modal-body">{task.kind === 'award' ? <AwardTask key={key} taskId={task.id} onChanged={changed} /> : task.kind === 'activity' ? <ActivityTask key={key} taskId={task.id} onChanged={changed} /> : task.kind === 'training-fund' ? <TaskPanel key={key} taskToken={task.token} onChanged={changed} /> : <ResponseForm key={key} taskToken={task.token} initialChoice={task.choice} onChanged={changed} />}</div>
  </dialog>;
}
