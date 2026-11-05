// Adapted from statelyai/sketch; see README.md and LICENSE in this directory.
import { getOutEdges, type GraphNode, type GraphEdge } from '@statelyai/graph';
import type { StateNodeData, TransitionData, MachineGraph } from './machine';
import { getEventCategory } from './machine';
import { sortedChildren } from './MachineViz';
import { TransitionViz } from './TransitionViz';

export function StateNodeViz({ node, graph, isInitial, isRegion, diagramId }: {
  node: GraphNode<StateNodeData>; graph: MachineGraph; isInitial?: boolean; isRegion?: boolean; diagramId: string;
}) {
  const { data } = node;
  const outEdges = getOutEdges(graph, node.id) as GraphEdge<TransitionData>[];
  const isParallel = data.type === 'parallel';
  const children = sortedChildren(graph, node.id, isParallel);
  const isChoice = (data.type === 'atomic' || data.type === null) && data.invocations.length === 0
    && outEdges.length > 1 && outEdges.every(edge => getEventCategory(edge.data.eventType) === 'always' && edge.data.guard);
  return <div id={`${diagramId}-${node.id}`} data-state-id={node.id} className="sketch-state" tabIndex={-1}>
    <div className={`sketch-card${data.type === 'final' ? ' sketch-final' : ''}${isRegion ? ' sketch-region' : ''}`} data-testid="state-card">
      <div className="sketch-state-heading">
        {isInitial && <span title="Initial state" aria-label="Initial state">↳</span>}
        {isParallel && <span title="Parallel states" aria-label="Parallel states">▥</span>}
        {data.type === 'final' && <span title="Final state" aria-label="Final state">◉</span>}
        {isChoice && <span title="Choice" aria-label="Choice">◇</span>}
        {data.type === 'history' && <span aria-label={`${data.historyType} history`}>{data.historyType === 'deep' ? 'H*' : 'H'}</span>}
        <strong>{data.key}</strong>
      </div>
      {data.description && <div className="sketch-description" data-testid="state-description">{data.description}</div>}
      {data.invocations.length > 0 && <div className="sketch-actions" data-testid="state-invocations"><small>invoke</small>{data.invocations.map((inv, i) => <code key={i}>{inv}</code>)}</div>}
      {(['entry', 'exit'] as const).map(kind => data[kind].length > 0 && <div key={kind} className="sketch-actions" data-testid={`state-${kind}`}>
        <small>{kind}</small>{data[kind].map((action, i) => <code key={i}>{action}</code>)}
      </div>)}
      {children.length > 0 && <div className="sketch-children sketch-nested">
        {children.map(child => <StateNodeViz key={child.id} node={child} graph={graph} isInitial={data.initialId === child.id} isRegion={isParallel} diagramId={diagramId} />)}
      </div>}
    </div>
    {outEdges.length > 0 && <div className="sketch-edges">{outEdges.map(edge => <div key={edge.id} className="sketch-tree-edge">
      <TransitionViz edge={edge} graph={graph} sourceId={node.id} diagramId={diagramId} />
    </div>)}</div>}
  </div>;
}
