import { createMachine } from 'xstate';

/** Display model of awardsWorkflow's Temporal orchestration, not an executable replacement. */
export const awardsImportMachine = createMachine({
  id: 'awardsImport', initial: 'initialise_import', states: {
    initialise_import: {
      description: 'Register the validated CSV or Excel import',
      entry: 'initializeAwards',
      on: { IMPORT_INITIALISED: 'resolve_assignees' },
    },
    resolve_assignees: {
      description: 'Resolve the DLV tag into the users assigned to each award',
      entry: 'resolveRoleUser(DLV)',
      on: { ASSIGNEES_RESOLVED: 'next_award', NO_ASSIGNEES: 'import_failed' },
    },
    next_award: {
      description: 'Process each imported row',
      on: { ROW_AVAILABLE: 'lookup_recipient', ALL_ROWS_PROCESSED: 'check_completion' },
    },
    lookup_recipient: {
      description: 'Look up the recipient and current appointments by membership number',
      entry: 'getMemberProfileByMembershipNumber',
      on: { RECIPIENT_FOUND: 'create_award_task', MEMBER_NOT_FOUND: 'report_row_error', LOOKUP_RETRIES_EXHAUSTED: 'report_row_error' },
    },
    create_award_task: {
      description: 'Create a Present Award task in Award listed, assigned to the resolved users',
      entry: 'createAwardTask',
      on: { TASK_CREATED: 'next_award' },
    },
    report_row_error: {
      description: 'Report the unsuccessful row and continue importing the remaining awards',
      on: { ERROR_RECORDED: 'next_award' },
    },
    check_completion: {
      description: 'Check whether every created award task has been presented',
      entry: 'finishAwardsIfComplete',
      on: { ALL_TASKS_COMPLETED: 'completed', TASKS_OUTSTANDING: 'await_presentations' },
    },
    await_presentations: {
      description: 'Wait for task updates without per-award timers',
      on: { awardsProgressChanged: 'check_completion' },
    },
    completed: { description: 'All created award tasks have been presented', type: 'final' },
    import_failed: { description: 'DLV has no users to assign the awards to', type: 'final' },
  },
});
