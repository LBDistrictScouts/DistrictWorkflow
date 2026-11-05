export interface WorkflowTaskRow {
  id: string;
  executionId: string;
  title: string;
  subject: string;
  assignee: string;
  status: 'pending' | 'in_progress' | 'completed' | 'not_required' | 'listed' | 'received' | 'scheduled' | 'presented';
  createdAt: string;
  completedAt?: string;
  href?: string;
  searchText?: string;
}
