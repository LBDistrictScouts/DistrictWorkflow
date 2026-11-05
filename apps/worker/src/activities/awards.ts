import { resolveRoleUser } from './directory';
import { awardsRepository } from '@district/persistence/runtime';

export async function initializeAwards(input: Parameters<ReturnType<typeof awardsRepository>['initialize']>[0]) { return awardsRepository().initialize(input); }

export async function createAwardTask(input: Parameters<ReturnType<typeof awardsRepository>['createTask']>[0]) { return awardsRepository().createTask({ ...input, assignees: input.assignees ?? await resolveRoleUser('DLV') }); }

export async function finishAwardsIfComplete(executionId: string) { return awardsRepository().finishIfComplete(executionId); }
