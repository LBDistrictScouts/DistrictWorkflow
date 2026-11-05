// Adapted from statelyai/sketch; see README.md and LICENSE in this directory.
import type { GraphEdge } from '@statelyai/graph';
import type { TransitionData, MachineGraph } from './machine';
import { getRelativeTarget, getEventCategory } from './machine';

export function TransitionViz({ edge, graph, sourceId, diagramId }: {
  edge: GraphEdge<TransitionData>; graph: MachineGraph; sourceId: string; diagramId: string;
}) {
  const { data } = edge;
  const target = data.isTargetless ? null : getRelativeTarget(sourceId, edge.targetId, graph);
  const category = getEventCategory(data.eventType);
  return <div className="sketch-transition" data-testid="transition">
    {data.guard && <div className="sketch-guard">{data.guardPrefix && <em>{data.guardPrefix} </em>}<code>{data.guard}</code></div>}
    {!data.guard && data.guardPrefix === 'else' && <em>else</em>}
    <div className="sketch-event">
      {category && <span aria-label={category === 'always' ? 'Automatic transition' : category} title={category}>{({ after: '◷', always: '∞', done: '✓', error: '⊗' })[category]}</span>}
      {data.displayEvent && <code data-testid="transition-event">{data.displayEvent}</code>}
      {target && <><span aria-hidden="true">→</span><a href={`#${diagramId}-${edge.targetId}`}>{target}</a></>}
    </div>
    {data.description && <div className="sketch-transition-description">{data.description}</div>}
    {data.actions.length > 0 && <div className="sketch-actions" data-testid="transition-actions">{data.actions.map((action, i) => <code key={i}>{action}</code>)}</div>}
  </div>;
}
