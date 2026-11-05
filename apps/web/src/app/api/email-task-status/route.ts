import { createElement } from 'react';
import { ImageResponse } from 'next/og';
import { emailTaskStatus } from '@district/integrations/email/task-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  let label = 'Status unavailable - view current status';

  try { label = await emailTaskStatus(new URL(request.url).searchParams.get('token') ?? ''); }
  catch { /* Invalid capabilities and service failures reveal no task information. */ }

  return new ImageResponse(createElement('div', { style: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: 20, background: '#f5f8f8', color: '#103d3f', fontSize: 21 } },
    createElement('div', null, label),
    createElement('div', { style: { marginTop: 12, fontSize: 14 } }, `Status checked ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`)),
  { width: 520, height: 100, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Referrer-Policy': 'no-referrer' } });
}
