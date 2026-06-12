import { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Node as RFNode,
  Edge as RFEdge,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
  NodeProps,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useStore } from '../store'
import type { TreeNode } from '@shared/types'
import { isComposite, getDisplayType } from '@shared/types'
import { layoutTree } from './layout'
import { useContextMenu, ContextMenu } from './ContextMenu'

// --- Custom Node Data ---
interface TimelineNodeData extends Record<string, unknown> {
  node: TreeNode
  depth: number
}

// --- Custom Node Component ---

function TimelineNode({ data }: NodeProps) {
  const nodeData = data as unknown as TimelineNodeData
  const node = nodeData.node
  const kind = getDisplayType(node)
  const isComp = isComposite(node)
  const isEnabled = node.Enable !== false

  const bgColor = isComp ? 'bg-indigo-900/70' : 'bg-gray-800/90'
  const borderColor = node.Important ? 'border-yellow-500' : 'border-gray-600'
  const opacity = isEnabled ? 'opacity-100' : 'opacity-40'

  return (
    <div
      className={`${bgColor} ${borderColor} ${opacity} border-2 rounded-lg px-3 py-2 min-w-[120px] max-w-[200px] shadow-lg cursor-pointer transition-all hover:border-blue-400`}
      style={{
        borderLeftWidth: '4px',
        borderLeftColor: `rgba(${Math.round(node.Color.X * 255)}, ${Math.round(node.Color.Y * 255)}, ${Math.round(node.Color.Z * 255)}, ${node.Color.W})`
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-500 !w-2 !h-2" />
      <div className="text-[11px] font-bold text-gray-200 truncate">{node.DisplayName || kind}</div>
      <div className="text-[9px] text-gray-500 mt-0.5 truncate">
        {kind}
        {node.Remark && ` · ${node.Remark}`}
      </div>
      {'Delay' in node && typeof (node as any).Delay === 'number' && (
        <div className="text-[9px] text-cyan-400 mt-0.5">⏱ {(node as any).Delay.toFixed(2)}s</div>
      )}
      {'Script' in node && typeof (node as any).Script === 'string' && (node as any).Script && (
        <div className="text-[9px] text-purple-400 mt-0.5">{'</>'} script</div>
      )}
      {'TriggerConds' in node && Array.isArray((node as any).TriggerConds) && (
        <div className="text-[9px] text-green-400 mt-0.5">🔍 {(node as any).TriggerConds.length} cond(s)</div>
      )}
      {'TriggerActions' in node && Array.isArray((node as any).TriggerActions) && (
        <div className="text-[9px] text-orange-400 mt-0.5">⚡ {(node as any).TriggerActions.length} action(s)</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-500 !w-2 !h-2" />
    </div>
  )
}

const nodeTypes = { timelineNode: TimelineNode }

// --- Canvas Inner ---

function CanvasInner() {
  const doc = useStore(s => s.doc)
  const selectedNodeId = useStore(s => s.selectedNodeId)
  const selectNode = useStore(s => s.selectNode)
  const { fitView } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode<TimelineNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([])
  const { menu, showMenu, hideMenu } = useContextMenu()

  // Build ReactFlow nodes and edges from tree
  const { rfNodes, rfEdges } = useMemo(() => {
    if (!doc) return { rfNodes: [] as RFNode<TimelineNodeData>[], rfEdges: [] as RFEdge[] }

    const rfNodes: RFNode<TimelineNodeData>[] = []
    const rfEdges: RFEdge[] = []

    function walk(node: TreeNode, parentId: string | null, depth: number) {
      const id = String(node.Id)
      rfNodes.push({
        id,
        type: 'timelineNode',
        position: { x: 0, y: 0 },
        data: { node, depth },
        selected: node.Id === selectedNodeId
      } as RFNode<TimelineNodeData>)
      if (parentId !== null) {
        rfEdges.push({
          id: `${parentId}->${id}`,
          source: parentId,
          target: id,
          type: 'smoothstep',
          style: { stroke: '#4b5563', strokeWidth: 1.5 },
          animated: false
        })
      }
      if (isComposite(node)) {
        for (const child of node.Childs) {
          walk(child, id, depth + 1)
        }
      }
    }

    // Root node
    const rootTreeNode: TreeNode = {
      $type: '__Root__',
      DisplayName: doc.TreeRoot.DisplayName || 'Start',
      Id: 0,
      Enable: true,
      Important: false,
      Color: { X: 1, Y: 1, Z: 1, W: 1 },
      Remark: '',
      Tag: '',
      Childs: doc.TreeRoot.Childs
    } as any

    rfNodes.push({
      id: 'root',
      type: 'timelineNode',
      position: { x: 0, y: 0 },
      data: { node: rootTreeNode, depth: 0 }
    } as RFNode<TimelineNodeData>)

    for (const child of doc.TreeRoot.Childs) {
      walk(child, 'root', 1)
    }

    // Apply Dagre layout
    const layouted = layoutTree(rfNodes as any, rfEdges)
    return { rfNodes: layouted as RFNode<TimelineNodeData>[], rfEdges }
  }, [doc, selectedNodeId])

  useEffect(() => {
    setNodes(rfNodes)
    setEdges(rfEdges)
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100)
  }, [rfNodes, rfEdges, setNodes, setEdges, fitView])

  const onNodeClick = useCallback((_event: React.MouseEvent, node: RFNode) => {
    const id = node.id === 'root' ? null : parseInt(node.id)
    selectNode(id)
  }, [selectNode])

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: RFNode) => {
    event.preventDefault()
    const id = node.id === 'root' ? null : parseInt(node.id)
    showMenu(event.clientX, event.clientY, id)
  }, [showMenu])

  const onPaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  const onPaneContextMenu = useCallback((event: any) => {
    event.preventDefault()
    showMenu(event.clientX, event.clientY, null)
  }, [showMenu])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onNodeContextMenu={onNodeContextMenu}
      onPaneClick={onPaneClick}
      onPaneContextMenu={onPaneContextMenu}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      defaultEdgeOptions={{ type: 'smoothstep' }}
      proOptions={{ hideAttribution: true }}
      className="bg-gray-900"
    >
      <Background color="#374151" gap={20} size={1} />
      <Controls className="!bg-gray-800 !border-gray-700 !rounded-lg" />
      <MiniMap
        className="!bg-gray-800 !border-gray-700"
        nodeColor={(n: RFNode) => {
          const d = (n.data as unknown as TimelineNodeData)?.node
          if (!d) return '#6b7280'
          return isComposite(d) ? '#4f46e5' : '#374151'
        }}
        maskColor="rgba(0,0,0,0.7)"
        style={{ backgroundColor: '#1f2937' }}
      />
      {menu && <ContextMenu menu={menu} hideMenu={hideMenu} />}
    </ReactFlow>
  )
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}
