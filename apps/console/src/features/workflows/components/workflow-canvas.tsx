// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { BusinessWorkflowDefinition, BusinessWorkflowNode, WorkflowEdgeDefinition } from "../types";
import { BusinessNode, type BusinessNodeData } from "./business-node";
import { WorkflowInspectorDrawer } from "./workflow-inspector-drawer";
import { WorkflowPalette } from "./workflow-palette";
import {
  PALETTE_NODE_TEMPLATES,
  createNodeFromPaletteTemplate,
  type PaletteNodeTemplate,
} from "../palette-catalog";

export interface WorkflowCanvasProps {
  readonly workflow: BusinessWorkflowDefinition;
  readonly onWorkflowStateChange?: (updatedWorkflow: BusinessWorkflowDefinition) => void;
  readonly onWorkflowEdited?: () => void;
  readonly onEdgesUpdated?: (edges: Edge[]) => void;
  readonly onApprove?: () => Promise<void> | void;
  readonly onReject?: () => Promise<void> | void;
}

export function getDefaultWorkflowEdges(
  nodes: readonly BusinessWorkflowNode[],
): WorkflowEdgeDefinition[] {
  const edgeDefs: WorkflowEdgeDefinition[] = [];
  const decisionNode = nodes.find((n) => n.type === "decision_router");

  if (decisionNode && decisionNode.branches) {
    const preDecisionNodes = nodes
      .filter((n) => n.stepNumber < decisionNode.stepNumber)
      .sort((a, b) => a.stepNumber - b.stepNumber);

    for (let i = 0; i < preDecisionNodes.length - 1; i++) {
      edgeDefs.push({
        source: preDecisionNodes[i].id,
        target: preDecisionNodes[i + 1].id,
      });
    }
    if (preDecisionNodes.length > 0) {
      edgeDefs.push({
        source: preDecisionNodes[preDecisionNodes.length - 1].id,
        target: decisionNode.id,
      });
    }

    decisionNode.branches.forEach((branch) => {
      const isAuto = branch.variant === "auto";
      edgeDefs.push({
        source: decisionNode.id,
        sourceHandle: isAuto ? "auto" : "approval",
        target: branch.targetNodeId,
        label: branch.label,
      });
    });
  } else {
    const sorted = [...nodes].sort((a, b) => a.stepNumber - b.stepNumber);
    for (let i = 0; i < sorted.length - 1; i++) {
      edgeDefs.push({
        source: sorted[i].id,
        target: sorted[i + 1].id,
      });
    }
  }

  return edgeDefs;
}

function getNodePosition(node: BusinessWorkflowNode, index: number): { x: number; y: number } {
  if (node.stepLabel === "4A") return { x: 780, y: 100 };
  if (node.stepLabel === "4B") return { x: 780, y: 280 };
  if (node.stepNumber === 1) return { x: 60, y: 190 };
  if (node.stepNumber === 2) return { x: 300, y: 190 };
  if (node.stepNumber === 3) return { x: 540, y: 190 };
  if (node.stepNumber === 4) return { x: 780, y: 190 };
  return { x: 60 + index * 240, y: 190 };
}

function WorkflowCanvasInner({
  workflow,
  onWorkflowStateChange,
  onWorkflowEdited,
  onEdgesUpdated,
  onApprove,
  onReject,
}: WorkflowCanvasProps) {
  const [selectedNode, setSelectedNode] = useState<BusinessWorkflowNode | null>(null);
  const [currentWorkflow, setCurrentWorkflow] = useState<BusinessWorkflowDefinition>(workflow);
  const [isPaletteOpen, setIsPaletteOpen] = useState<boolean>(true);
  const [customPositions, setCustomPositions] = useState<Record<string, { x: number; y: number }>>({});
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    setCurrentWorkflow(workflow);
  }, [workflow]);

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      businessNode: BusinessNode,
    }),
    [],
  );

  const handleApprove = useCallback(async () => {
    if (onApprove) {
      await onApprove();
      return;
    }
    const updatedNodes = currentWorkflow.nodes.map((n) => {
      if (n.type === "approval_gate" || n.type === "action") {
        return { ...n, status: "completed" as const };
      }
      return n;
    });

    const updated: BusinessWorkflowDefinition = {
      ...currentWorkflow,
      nodes: updatedNodes,
    };
    setCurrentWorkflow(updated);
    onWorkflowStateChange?.(updated);
    setSelectedNode((prev) => (prev ? updatedNodes.find((n) => n.id === prev.id) ?? null : null));
  }, [currentWorkflow, onApprove, onWorkflowStateChange]);

  const handleReject = useCallback(async () => {
    if (onReject) {
      await onReject();
      return;
    }
    const updatedNodes = currentWorkflow.nodes.map((n) => {
      if (n.type === "approval_gate") {
        return { ...n, status: "rejected" as const };
      }
      return n;
    });

    const updated: BusinessWorkflowDefinition = {
      ...currentWorkflow,
      nodes: updatedNodes,
    };
    setCurrentWorkflow(updated);
    onWorkflowStateChange?.(updated);
    setSelectedNode((prev) => (prev ? updatedNodes.find((n) => n.id === prev.id) ?? null : null));
  }, [currentWorkflow, onReject, onWorkflowStateChange]);

  const initialNodes: Node<BusinessNodeData>[] = useMemo(() => {
    return currentWorkflow.nodes.map((node, index) => ({
      id: node.id,
      type: "businessNode",
      position: customPositions[node.id] ?? getNodePosition(node, index),
      data: {
        node,
        onSelect: (n: BusinessWorkflowNode) => setSelectedNode(n),
        onApprove: handleApprove,
        onReject: handleReject,
      },
    }));
  }, [currentWorkflow, customPositions, handleApprove, handleReject]);

  const initialEdges: Edge[] = useMemo(() => {
    const nodes = currentWorkflow.nodes;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const rawEdges = currentWorkflow.edges;

    // 1. Get baseline edges for the core workflow
    const baselineDefs = getDefaultWorkflowEdges(nodes);

    // 2. Merge configured/custom edges with baseline edges
    const combinedDefs: WorkflowEdgeDefinition[] = [];

    if (Array.isArray(rawEdges) && rawEdges.length > 0) {
      combinedDefs.push(...rawEdges);
      for (const base of baselineDefs) {
        const alreadyHasConnection = combinedDefs.some(
          (c) => c.source === base.source && c.target === base.target
        );
        const targetAlreadyHasIncoming = combinedDefs.some(
          (c) => c.target === base.target
        );
        if (!alreadyHasConnection && !targetAlreadyHasIncoming) {
          combinedDefs.push(base);
        }
      }
    } else {
      combinedDefs.push(...baselineDefs);
    }

    const result: Edge[] = [];
    for (const re of combinedDefs) {
      if (!re?.source || !re?.target) continue;
      const sourceNode = nodeMap.get(re.source);
      const targetNode = nodeMap.get(re.target);
      if (!sourceNode || !targetNode) continue;

      const isAuto = re.sourceHandle === "auto";
      const isApproval = re.sourceHandle === "approval";
      const isCompleted = sourceNode.status === "completed";
      const isTargetActive = targetNode.status !== "idle";

      let color = "#94a3b8";
      if (isCompleted) {
        color = "#10b981";
      } else if (isTargetActive) {
        color = isAuto ? "#10b981" : isApproval ? "#f59e0b" : "#6366f1";
      }

      result.push({
        id: `e-${re.source}-${re.target}`,
        source: re.source,
        sourceHandle: re.sourceHandle ?? undefined,
        target: re.target,
        targetHandle: re.targetHandle ?? undefined,
        animated: false,
        style: {
          stroke: color,
          strokeWidth: 2.2,
          strokeDasharray: isApproval ? "6 4" : undefined,
        },
        label: re.label,
        labelStyle: re.label
          ? {
              fill: isTargetActive ? (isAuto ? "#059669" : "#d97706") : "#475569",
              fontWeight: 600,
              fontSize: 11,
            }
          : undefined,
        labelBgStyle: re.label ? { fill: "#ffffff", fillOpacity: 0.98 } : undefined,
        labelBgPadding: [6, 4] as [number, number],
        labelBgBorderRadius: 6,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
        },
      });
    }

    return result;
  }, [currentWorkflow.edges, currentWorkflow.nodes]);

  const [userEdges, setUserEdges] = useState<Edge[]>([]);
  const prevWorkflowIdRef = useRef(workflow.id);
  const [canvasTip, setCanvasTip] = useState<string | null>(null);

  useEffect(() => {
    if (prevWorkflowIdRef.current !== workflow.id) {
      prevWorkflowIdRef.current = workflow.id;
      setUserEdges([]);
      setCanvasTip(null);
    }
  }, [workflow.id]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Merge initial baseline edges with user custom connections, keeping only valid node pairs
  useEffect(() => {
    const validNodeIds = new Set(currentWorkflow.nodes.map((n) => n.id));

    const validInitial = initialEdges.filter(
      (e) => validNodeIds.has(e.source) && validNodeIds.has(e.target)
    );

    const validUser = userEdges.filter(
      (e) => validNodeIds.has(e.source) && validNodeIds.has(e.target)
    );

    const merged: Edge[] = [...validInitial];
    for (const ue of validUser) {
      if (!merged.some((e) => e.source === ue.source && e.target === ue.target)) {
        merged.push(ue);
      }
    }

    setEdges(merged);
  }, [initialEdges, userEdges, currentWorkflow.nodes, setEdges]);

  // Sync edges upward so parent page can validate workflow on publish
  useEffect(() => {
    onEdgesUpdated?.(edges);
  }, [edges, onEdgesUpdated]);

  // Compute which nodes (after step 1) currently lack incoming edges
  const unconnectedNodeIds = useMemo(() => {
    const targetSet = new Set(edges.map((e) => e.target));
    return new Set(
      currentWorkflow.nodes
        .filter((n) => n.stepNumber > 1 && !targetSet.has(n.id))
        .map((n) => n.id)
    );
  }, [edges, currentWorkflow.nodes]);

  useEffect(() => {
    setNodes((prevNodes) =>
      currentWorkflow.nodes.map((node, index) => {
        const existingNode = prevNodes.find((n) => n.id === node.id);
        return {
          id: node.id,
          type: "businessNode",
          position: existingNode?.position ?? customPositions[node.id] ?? getNodePosition(node, index),
          data: {
            node,
            onSelect: (n: BusinessWorkflowNode) => setSelectedNode(n),
            onApprove: handleApprove,
            onReject: handleReject,
            isUnconnected: unconnectedNodeIds.has(node.id),
          },
        };
      })
    );
  }, [currentWorkflow, customPositions, handleApprove, handleReject, setNodes, unconnectedNodeIds]);

  useEffect(() => {
    if (selectedNode) {
      const updated = currentWorkflow.nodes.find((n) => n.id === selectedNode.id);
      if (updated) setSelectedNode(updated);
    }
  }, [currentWorkflow, selectedNode]);

  // Free interactive wiring between node handles (persisted into userEdges and currentWorkflow.edges)
  const handleConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      const isAuto = params.sourceHandle === "auto";
      const isApproval = params.sourceHandle === "approval";
      const color = isAuto ? "#10b981" : isApproval ? "#f59e0b" : "#6366f1";
      const edgeLabel = isAuto ? "Tự động / Trong hạn mức" : isApproval ? "Cần Sếp duyệt / Vượt mức" : undefined;

      const newEdge: Edge = {
        id: `e-${params.source}-${params.target}-${Date.now()}`,
        source: params.source,
        sourceHandle: params.sourceHandle,
        target: params.target,
        targetHandle: params.targetHandle,
        animated: true,
        style: {
          stroke: color,
          strokeWidth: 2.2,
          strokeDasharray: isApproval ? "5 5" : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
        },
        label: edgeLabel,
        labelStyle: { fill: isAuto ? "#059669" : isApproval ? "#d97706" : "#4338ca", fontWeight: 600, fontSize: 11 },
        labelBgStyle: { fill: "#ffffff", fillOpacity: 0.98 },
        labelBgPadding: [6, 4] as [number, number],
        labelBgBorderRadius: 6,
      };

      setUserEdges((prev) => [
        ...prev.filter((e) => !(e.source === params.source && e.target === params.target)),
        newEdge,
      ]);

      const updatedEdgeEntry = {
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle ?? null,
        targetHandle: params.targetHandle ?? null,
        label: edgeLabel,
      };

      const baselineDefs = getDefaultWorkflowEdges(currentWorkflow.nodes);
      const currentEdges = currentWorkflow.edges && currentWorkflow.edges.length > 0
        ? currentWorkflow.edges
        : baselineDefs;

      const basePreserved = [...currentEdges];
      for (const base of baselineDefs) {
        const alreadyHasConnection = basePreserved.some(
          (c) => c.source === base.source && c.target === base.target
        );
        const targetAlreadyHasIncoming = basePreserved.some(
          (c) => c.target === base.target
        );
        if (!alreadyHasConnection && !targetAlreadyHasIncoming) {
          basePreserved.push(base);
        }
      }

      const updatedWorkflow: BusinessWorkflowDefinition = {
        ...currentWorkflow,
        edges: [
          ...basePreserved.filter((e) => !(e.source === params.source && e.target === params.target)),
          updatedEdgeEntry,
        ],
      };
      setCurrentWorkflow(updatedWorkflow);
      onWorkflowStateChange?.(updatedWorkflow);

      setCanvasTip("Đã kết nối dây thành công! Bạn có thể lưu bản nháp hoặc bấm Xuất Bản & Kích Hoạt.");
      onWorkflowEdited?.();
    },
    [currentWorkflow, onWorkflowEdited, onWorkflowStateChange]
  );

  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      const removedChanges = changes.filter((c) => c.type === "remove") as Array<{ id: string }>;
      if (removedChanges.length > 0) {
        const removedIds = new Set(removedChanges.map((c) => c.id));
        setUserEdges((prev) => prev.filter((e) => !removedIds.has(e.id)));
        const existingEdges = currentWorkflow.edges ?? [];
        const updatedEdges = existingEdges.filter(
          (e) => !removedIds.has(`e-${e.source}-${e.target}`)
        );
        const updatedWorkflow: BusinessWorkflowDefinition = {
          ...currentWorkflow,
          edges: updatedEdges,
        };
        setCurrentWorkflow(updatedWorkflow);
        onWorkflowStateChange?.(updatedWorkflow);
        onWorkflowEdited?.();
      }
    },
    [currentWorkflow, onEdgesChange, onWorkflowEdited, onWorkflowStateChange]
  );

  // Drag and Drop from Palette onto Canvas
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const templateId =
        event.dataTransfer.getData("application/reactflow-template-id") ||
        event.dataTransfer.getData("application/reactflow");
      if (!templateId) return;

      const template = PALETTE_NODE_TEMPLATES.find((t) => t.id === templateId);
      if (!template) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const nextStepNumber = currentWorkflow.nodes.length + 1;
      const newNode = createNodeFromPaletteTemplate(template, nextStepNumber);

      setCustomPositions((prev) => ({ ...prev, [newNode.id]: position }));

      const updatedWorkflow: BusinessWorkflowDefinition = {
        ...currentWorkflow,
        nodes: [...currentWorkflow.nodes, newNode],
      };

      setCurrentWorkflow(updatedWorkflow);
      onWorkflowStateChange?.(updatedWorkflow);
      onWorkflowEdited?.();
      setSelectedNode(newNode);
      setCanvasTip(
        `Đã thả khối "${newNode.title}" vào bàn vẽ! Hãy kéo dây từ cổng tròn bên phải của khối trước vào cổng tròn bên trái của khối này để kết nối luồng.`
      );
    },
    [currentWorkflow, onWorkflowEdited, onWorkflowStateChange, screenToFlowPosition]
  );

  // Add node directly via Palette [+] button
  const handleAddNodeFromPalette = useCallback(
    (template: PaletteNodeTemplate) => {
      const nextStepNumber = currentWorkflow.nodes.length + 1;
      const lastIndex = currentWorkflow.nodes.length - 1;
      const lastNode = currentWorkflow.nodes[lastIndex];
      const basePos = lastNode
        ? (customPositions[lastNode.id] ?? getNodePosition(lastNode, lastIndex))
        : { x: 40, y: 150 };

      const offsetPosition = {
        x: basePos.x + 240,
        y: basePos.y,
      };

      const newNode = createNodeFromPaletteTemplate(template, nextStepNumber);

      setCustomPositions((prev) => ({ ...prev, [newNode.id]: offsetPosition }));

      const updatedWorkflow: BusinessWorkflowDefinition = {
        ...currentWorkflow,
        nodes: [...currentWorkflow.nodes, newNode],
      };

      setCurrentWorkflow(updatedWorkflow);
      onWorkflowStateChange?.(updatedWorkflow);
      onWorkflowEdited?.();
      setSelectedNode(newNode);
      setCanvasTip(
        `Đã thêm khối "${newNode.title}"! Hãy kéo dây từ cổng tròn bên phải của khối trước vào cổng tròn bên trái của khối này để kết nối luồng.`
      );
    },
    [currentWorkflow, customPositions, onWorkflowEdited, onWorkflowStateChange]
  );

  // Inspector Drawer updates
  const handleUpdateNode = useCallback(
    (updatedNode: BusinessWorkflowNode) => {
      const updatedNodes = currentWorkflow.nodes.map((n) =>
        n.id === updatedNode.id ? updatedNode : n
      );
      const updatedWorkflow: BusinessWorkflowDefinition = {
        ...currentWorkflow,
        nodes: updatedNodes,
      };
      setCurrentWorkflow(updatedWorkflow);
      setSelectedNode(updatedNode);
      onWorkflowStateChange?.(updatedWorkflow);
      onWorkflowEdited?.();
    },
    [currentWorkflow, onWorkflowEdited, onWorkflowStateChange]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const updatedNodes = currentWorkflow.nodes.filter((n) => n.id !== nodeId);
      const updatedEdges = (currentWorkflow.edges ?? []).filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      );
      const updatedWorkflow: BusinessWorkflowDefinition = {
        ...currentWorkflow,
        nodes: updatedNodes,
        edges: updatedEdges,
      };
      setUserEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setCurrentWorkflow(updatedWorkflow);
      setSelectedNode(null);
      onWorkflowStateChange?.(updatedWorkflow);
      onWorkflowEdited?.();
    },
    [currentWorkflow, onWorkflowEdited, onWorkflowStateChange]
  );

  return (
    <div
      className="canvasViewportWrapper"
      ref={reactFlowWrapper}
      role="region"
      aria-label="Bàn vẽ kéo thả quy trình n8n"
    >
      <WorkflowPalette
        isOpen={isPaletteOpen}
        onToggle={() => setIsPaletteOpen((prev) => !prev)}
        onAddNode={handleAddNodeFromPalette}
      />

      <div
        className="canvasDropArea"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {canvasTip && (
          <div className="canvasTipBanner" role="status">
            <span className="canvasTipIcon" aria-hidden="true">💡</span>
            <span className="canvasTipText">{canvasTip}</span>
            <button
              type="button"
              className="canvasTipClose"
              onClick={() => setCanvasTip(null)}
              aria-label="Đóng gợi ý"
            >
              ✕
            </button>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={1.5}
          className="n8nReactFlowCanvas"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.2}
            color="#cbd5e1"
          />
          <Controls
            className="n8nControls"
            position="bottom-left"
            showInteractive={false}
          />
          <MiniMap
            className="n8nMiniMap"
            position="bottom-right"
            nodeColor={(n) => {
              const t = (n.data as BusinessNodeData)?.node?.type;
              if (t === "event") return "#10b981";
              if (t === "ai_analysis") return "#a855f7";
              if (t === "decision_router") return "#6366f1";
              if (t === "approval_gate") return "#f59e0b";
              return "#38bdf8";
            }}
            maskColor="rgba(241, 245, 249, 0.75)"
          />
        </ReactFlow>
      </div>

      <WorkflowInspectorDrawer
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        onUpdateNode={handleUpdateNode}
        onDeleteNode={handleDeleteNode}
      />
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
