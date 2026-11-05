import type { WorkflowTaskRow } from '@district/contracts/workflows/tasks';

export type TaskFilters = { search: string; status: string; assignee: string; sort: string };

export function filterTasks(tasks: WorkflowTaskRow[], filters: TaskFilters) {
  const search = filters.search.trim().toLocaleLowerCase();

  return tasks.filter(task => (!search || [task.title, task.subject, task.assignee, task.searchText ?? ''].join(' ').toLocaleLowerCase().includes(search))
    && (!filters.status || task.status === filters.status)
    && (!filters.assignee || task.assignee === filters.assignee))
    .sort((a, b) => {
      const [key, direction] = filters.sort.split(':');
      const field = (task: WorkflowTaskRow) => key === 'subject' ? task.subject : key === 'status' ? task.status : key === 'assignee' ? task.assignee : task.createdAt;

      return (field(a).localeCompare(field(b), 'en', { numeric: true }) || a.id.localeCompare(b.id)) * (direction === 'desc' ? -1 : 1);
    });
}
