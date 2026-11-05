export type TaskReference = { kind: 'award'; id: string } | { kind: 'training-fund'; token: string } | { kind: 'response'; token: string; choice: string };

export function taskReference(href: string, origin: string): TaskReference | null {
  const url = new URL(href, origin);

  if (url.origin !== origin) return null;
  const award = /^#task-([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.exec(url.hash);

  if (award && ['/workflows/awards', '/workflows/awards/tasks'].includes(url.pathname)) return { kind: 'award', id: award[1] };
  const params = new URLSearchParams(url.hash.slice(1)); const token = params.get('token');

  if (!token) return null;

  if (url.pathname === '/tasks') return { kind: 'training-fund', token };

  if (url.pathname === '/responses') return { kind: 'response', token, choice: params.get('choice') ?? '' };

  return null;
}
