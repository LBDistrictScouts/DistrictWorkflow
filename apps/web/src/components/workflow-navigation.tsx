'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function WorkflowNavigation({ slug, name }: { slug: string; name: string }) {
  const pathname = usePathname();
  const base = `/workflows/${slug}`;

  return <nav className="workflow-navigation container" aria-label={`${name} pages`}>
    <Link href="/workflows">← Workflows</Link>
    {['Detail', 'Form', 'Definition', 'Tasks'].map(label => {
      const href = label === 'Detail' ? base : `${base}/${label.toLowerCase()}`;

      return <Link key={label} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>;
    })}
  </nav>;
}
