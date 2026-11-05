// Adapted from statelyai/sketch; see README.md and LICENSE in this directory.
import { getRoots, getChildren, getOutEdges, getRelativeDistance, type GraphNode, type GraphEdge } from '@statelyai/graph';
import type { StateNodeData, TransitionData, MachineGraph } from './machine';
import { StateNodeViz } from './StateNodeViz';
import { TransitionViz } from './TransitionViz';

export function sortedChildren(graph: MachineGraph, parentId: string, parallel = false) {
  const children = getChildren(graph, parentId) as GraphNode<StateNodeData>[];
  return parallel ? children : [...children].sort((a, b) =>
    (getRelativeDistance(graph, a.id) ?? Infinity) - (getRelativeDistance(graph, b.id) ?? Infinity));
}

export function MachineViz({ graph, id }: { graph: MachineGraph; id: string }) {
  const root = (getRoots(graph) as GraphNode<StateNodeData>[])[0];
  if (!root) return null;
  const edges = getOutEdges(graph, root.id) as GraphEdge<TransitionData>[];
  return <div className="sketch-machine" data-testid="machine-root">
    <h3 className="sketch-name" data-testid="machine-name">{root.data.key}</h3>
    {root.data.description && <p>{root.data.description}</p>}
    {edges.map(edge => <TransitionViz key={edge.id} edge={edge} graph={graph} sourceId={root.id} diagramId={id} />)}
    <div className="sketch-children">
      {sortedChildren(graph, root.id).map(child => <StateNodeViz key={child.id} node={child} graph={graph}
        isInitial={root.data.initialId === child.id} diagramId={id} />)}
    </div>
  </div>;
}
