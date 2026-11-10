import type { ReactNode } from 'react';
import WorkflowNavigation from '@/components/workflow-navigation';

export default function Layout({ children }: { children: ReactNode }) {
  return <><WorkflowNavigation slug="activity-notification" name="Activity Approvals" />{children}</>;
}
