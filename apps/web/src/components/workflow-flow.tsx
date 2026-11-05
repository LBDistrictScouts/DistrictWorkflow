import type { MachineGraph } from '@/vendor/sketch/machine';
import { MachineViz } from '@/vendor/sketch/MachineViz';

export default function WorkflowFlow({ graph, id, title = 'Workflow statechart' }: { graph: MachineGraph; id: string; title?: string }) {
  return <section className="workflow-flow" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>{title}</h2>
    <div className="sketch-viewport" role="region" aria-label="Workflow states and transitions" tabIndex={0}>
      <MachineViz graph={graph} id={id} />
    </div>
    <h3>Transitions map</h3>
    <div className="workflow-table-scroll"><table className="workflow-table"><caption>{title} transitions</caption><thead><tr><th scope="col">From</th><th scope="col">Event</th><th scope="col">To</th><th scope="col">Condition</th><th scope="col">Actions</th></tr></thead><tbody>{graph.edges.map(edge => <tr key={edge.id}><td>{edge.sourceId}</td><td>{edge.data.displayEvent || 'Automatic'}</td><td>{edge.data.isTargetless ? 'Stay in current state' : edge.targetId}</td><td>{edge.data.guard ?? '—'}</td><td>{edge.data.actions.join(', ') || '—'}</td></tr>)}</tbody></table></div>
    <p className="sketch-legend">↳ Initial state · ◉ Final state · ∞ Automatic transition. Select a transition target to locate its state.</p>
  </section>;
}
