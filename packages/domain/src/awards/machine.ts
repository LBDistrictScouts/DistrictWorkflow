import { createMachine, getNextSnapshot } from 'xstate';

export type AwardStage = 'listed' | 'received' | 'scheduled' | 'presented';

export type AwardEvent = { type: 'RECEIVE' | 'SCHEDULE' | 'PRESENT' | 'REASSIGN' };

/** The authoritative lifecycle for each award; persistence validates commands through this machine. */
export const awardsMachine = createMachine({
  // SAFETY: XState setup uses these assertions only as type declarations; runtime data is provided by machine input.
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- XState setup uses this declaration solely to supply machine types, not as runtime data.
  types: {} as { events: AwardEvent },
  id: 'awards', initial: 'listed', states: {
    listed: { description: 'Award listed', on: { RECEIVE: 'received', REASSIGN: { actions: 'recordAssignment' } } },
    received: { description: 'Award received', on: { SCHEDULE: 'scheduled', REASSIGN: { actions: 'recordAssignment' } } },
    scheduled: { description: 'Presentation scheduled', on: { SCHEDULE: 'scheduled', PRESENT: 'presented', REASSIGN: { actions: 'recordAssignment' } } },
    presented: { description: 'Award presented', type: 'final' },
  },
});

export function transitionAward(stage: AwardStage, event: AwardEvent): AwardStage {
  const snapshot = awardsMachine.resolveState({ value: stage, context: {} });

  if (!snapshot.can(event)) throw new TypeError(`Cannot ${event.type.toLowerCase()} an award that is ${stage}`);

  // SAFETY: This flat machine declares exactly the states in the domain status union.
  return getNextSnapshot(awardsMachine, snapshot, event).value as AwardStage;
}
