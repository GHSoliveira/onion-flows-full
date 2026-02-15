import React, { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  applyEdgeChanges,
  applyNodeChanges,
  ReactFlowProvider,
  useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';


import {
  MessageSquare, TextCursorInput, Split, FileText,
  Clock, Users, Code, Globe, Hourglass,
  Database, Anchor, Send, Save, Rocket,
  Flag, Play, Star
} from 'lucide-react';

import { getJSON, putJSON } from '../services/api';
import toast from 'react-hot-toast';
import NodeConfigModal from '../components/NodeConfigModal';
import * as CustomNodes from '../nodes/CustomNodes';

const nodeTypes = {
  startNode: CustomNodes.StartNode,
  endNode: CustomNodes.EndNode,
  messageNode: CustomNodes.MessageNode,
  inputNode: CustomNodes.InputNode,
  setValueNode: CustomNodes.SetValueNode,
  conditionNode: CustomNodes.ConditionNode,
  anchorNode: CustomNodes.AnchorNode,
  gotoNode: CustomNodes.GotoNode,
  scriptNode: CustomNodes.ScriptNode,
  finalNode: CustomNodes.FinalNode,
  httpRequestNode: CustomNodes.HttpRequestNode,
  templateNode: CustomNodes.TemplateNode,
  delayNode: CustomNodes.DelayNode,
  queueNode: CustomNodes.QueueNode,
  scheduleNode: CustomNodes.ScheduleNode,
  ratingNode: CustomNodes.RatingNode,
  caseNode: CustomNodes.CaseNode
};

const FlowEditor = () => {
  const { id } = useParams();
  const { getNodes, getViewport } = useReactFlow();


  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {

    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const [nodes, setNodes] = useState([]);
  const [queues, setQueues] = useState([]);
  const [edges, setEdges] = useState([]);
  const [vars, setVars] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [flowName, setFlowName] = useState('');
  const [configModal, setConfigModal] = useState({ open: false, nodeId: null });



  const openConfig = useCallback((nodeId) => {

    const currentNode = getNodes().find(n => n.id === nodeId);
    if (currentNode) {
      console.log("Abrindo config para:", currentNode.type);
      setConfigModal({ open: true, nodeId });
    }
  }, [getNodes]);

  const updateNodeData = useCallback((nodeId, newData) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n));
  }, []);

  const deleteNode = useCallback((nodeId) => {
    if (nodeId === 'start') return toast.error("O nó de início é protegido.");
    setNodes((nds) => nds.filter((n) => n.id !== nodeId && !n.id.startsWith(`child_${nodeId}`)));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, []);

  const hydrateNode = useCallback((node, vData, tData, sData) => ({
    ...node,
    data: {
      ...node.data,
      availableVars: vData,
      availableTemplates: tData,
      availableSchedules: sData,
      onDelete: deleteNode,
      onConfig: (id) => openConfig(id),
      onChange: (v) => updateNodeData(node.id, { text: v }),

    }
  }), [deleteNode, openConfig, updateNodeData]);



  const handleSaveConfig = (nodeId, newData) => {

    updateNodeData(nodeId, newData);

    const parentNode = getNodes().find(n => n.id === nodeId);
    if (!parentNode) return;

    const newNodes = [];
    const newEdges = [];
    const baseX = parentNode.position.x + 300;
    const baseY = parentNode.position.y;


    if (parentNode.type === 'conditionNode' && newData.conditions) {


      setNodes(nds => nds.filter(n => !n.id.startsWith(`child_${nodeId}`)));
      setEdges(eds => eds.filter(e =>
        !(e.source === nodeId && (
          e.id.startsWith(`edge_${nodeId}_`) ||
          e.id.startsWith(`edge_${nodeId}_else`)
        ))
      ));


      newData.conditions.forEach((cond, index) => {
        const condId = String(cond.id);
        const childId = `child_${nodeId}_${condId}`;

        newNodes.push({
          id: childId, type: 'caseNode',
          position: { x: baseX, y: baseY + (index * 80) },
          data: { label: `${cond.variable} ${cond.operator} ${cond.value}` }
        });

        newEdges.push({
          id: `edge_${nodeId}_${condId}`,
          source: nodeId,
          target: childId,
          sourceHandle: condId,
          type: 'smoothstep'
        });
      });


      if (newData.hasElse !== false) {
        const elseId = `child_${nodeId}_else`;

        newNodes.push({
          id: elseId,
          type: 'caseNode',
          position: { x: baseX, y: baseY + (newData.conditions.length * 80) },
          data: { label: "Else" }
        });

        newEdges.push({
          id: `edge_${nodeId}_else`,
          source: nodeId,
          target: elseId,
          sourceHandle: 'else',
          style: { strokeDasharray: 5, stroke: '#94a3b8' }
        });
      }


      if (newNodes.length > 0) {
        setNodes(nds => [...nds, ...newNodes]);
        setEdges(eds => [...eds, ...newEdges]);
      }
    }


    if (parentNode.type === 'templateNode' && newData.templateId) {
      const template = templates.find(t => t.id === newData.templateId);
      if (template && template.buttons) {

        setNodes(nds => nds.filter(n => !n.id.startsWith(`child_${nodeId}`)));
        setEdges(eds => eds.filter(e =>
          !(e.source === nodeId && (
            e.id.startsWith(`e_${nodeId}_`)
          ))
        ));

        template.buttons.forEach((btn, index) => {
          const childId = `child_${nodeId}_${btn.id}`;
          newNodes.push({
            id: childId,
            type: 'caseNode',
            position: { x: baseX, y: baseY + (index * 80) },
            data: { label: btn.label }
          });


          newEdges.push({
            id: `e_${nodeId}_${childId}`,
            source: nodeId,
            target: childId,
            sourceHandle: btn.id,
            type: 'default',
            style: { stroke: '#be185d', strokeWidth: 2 }
          });
        });
      }
    }


    if (parentNode.type === 'scheduleNode') {

      setNodes(nds => nds.filter(n => !n.id.startsWith(`child_${nodeId}`)));
      setEdges(eds => eds.filter(e =>
        !(e.source === nodeId && (
          e.id.startsWith(`e_${nodeId}_`)
        ))
      ));

      ['inside', 'outside'].forEach((type, index) => {
        const childId = `child_${nodeId}_${type}`;
        newNodes.push({
          id: childId, type: 'caseNode',
          position: { x: baseX, y: baseY + (index * 80) },
          data: { label: type === 'inside' ? '✅ Aberto' : '❌ Fechado' }
        });
        newEdges.push({
          id: `e_${nodeId}_${type}`, source: nodeId, target: childId, sourceHandle: 'source',
          style: { stroke: type === 'inside' ? '#16a34a' : '#ef4444' }
        });
      });
    }

    if (newNodes.length > 0) {
      setNodes(nds => [...nds, ...newNodes]);
      setEdges(eds => [...eds, ...newEdges]);
      toast.success("Ramificações criadas!");
    } else {
      toast.success("Configuração salva");
    }
  };



  const load = useCallback(async () => {
    try {
      const [vD, tD, sD, fD, qD] = await Promise.all([
        getJSON('/variables'), getJSON('/templates'), getJSON('/schedules'), getJSON(`/flows/${id}`), getJSON('/queues')
      ]);

      setVars(vD); setTemplates(tD); setSchedules(sD); setFlowName(fD.name); setQueues(qD)

      const source = fD.draft || fD.published || { nodes: [{ id: 'start', type: 'startNode', position: { x: 100, y: 100 }, data: { text: "Início" } }], edges: [] };

      setNodes(source.nodes.map(n => hydrateNode(n, vD, tD, sD)));
      setEdges(source.edges || []);
    } catch (e) { toast.error("Erro ao carregar"); }
  }, [id, hydrateNode]);

  useEffect(() => { load(); }, [load]);



  const onNodesChange = useCallback((c) => setNodes(nds => applyNodeChanges(c, nds)), []);
  const onEdgesChange = useCallback((c) => setEdges(eds => applyEdgeChanges(c, eds)), []);

  const onConnect = useCallback((params) => {
    const sourceNode = nodes.find(n => n.id === params.source);
    if (!sourceNode) return;


    if (['gotoNode', 'endNode', 'finalNode', 'conditionNode', 'templateNode', 'scheduleNode'].includes(sourceNode.type)) {
      return toast.error("Este nó gera conexões automaticamente. Configure-o com duplo clique.");
    }


    if (edges.some(e => e.source === params.source)) return toast.error("Apenas uma saída permitida.");

    setEdges((eds) => addEdge(params, eds));
  }, [nodes, edges]);

  const onEdgeClick = useCallback((evt, edge) => {
    if (edge.id.startsWith('e_')) return toast.error("Conexão estrutural fixa.");
    if (window.confirm("Remover conexão?")) {
      setEdges((eds) => eds.filter(e => e.id !== edge.id));
    }
  }, []);


  const onKeyDown = useCallback((event) => {
    const { key, ctrlKey } = event;


    if (['Delete', 'Backspace', 'a'].includes(key) || (ctrlKey && key === 'a')) {
      const selectedNodes = nodes.filter(n => n.selected);

      if (selectedNodes.some(n => n.id === 'start')) {
        event.preventDefault();
        event.stopPropagation();
        toast.error("O nó de início é protegido e não pode ser removido.");
      }
    }
  }, [nodes]);



  const createNode = (type) => {
    const newId = `${type}_${Date.now()}`;
    const { x, y, zoom } = getViewport();

    const xPos = Math.round(((-x + window.innerWidth / 2) / zoom) / 20) * 20;
    const yPos = Math.round(((-y + window.innerHeight / 2) / zoom) / 20) * 20;

    const newNode = hydrateNode({
      id: newId, type, position: { x: xPos, y: yPos },
      data: { text: '...', conditions: [], mappings: [], customName: '' }
    }, vars, templates, schedules);
    setNodes((nds) => [...nds, newNode]);
  };

  const save = async (publish = false) => {
    if (publish) {
      const excluded = new Set(['endNode', 'finalNode', 'gotoNode']);
      const sources = new Set(edges.map(e => e.source));
      const disconnected = nodes.filter(n => !excluded.has(n.type) && !sources.has(n.id));
      if (disconnected.length > 0) {
        const labels = disconnected
          .slice(0, 4)
          .map(n => n.data?.customName || n.data?.text || n.type)
          .join(', ');
        const extra = disconnected.length > 4 ? ` (+${disconnected.length - 4})` : '';
        toast.error(`Existem nós sem saída: ${labels}${extra}.`);
        return;
      }
      if (!window.confirm(`Publicar "${flowName}" em Produção?`)) return;
    }

    const cleanNodes = nodes.map(({ data, ...n }) => {
      const { availableVars, availableTemplates, availableSchedules, onDelete, onConfig, ...cleanData } = data;
      return { ...n, data: cleanData };
    });

    try {
      await putJSON(`/flows/${id}`, { 
        nodes: cleanNodes, 
        edges, 
        published: publish,
        status: publish ? 'published' : 'draft'
      });
      toast.success(publish ? "Publicado!" : "Rascunho Salvo");
    } catch (e) { 
      console.error("Erro ao salvar:", e);
      toast.error("Erro ao salvar: " + (e.message || 'Erro desconhecido'));
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-900">

      {}
      <NodeConfigModal
        isOpen={configModal.open}
        node={nodes.find(n => n.id === configModal.nodeId)}
        onClose={() => setConfigModal({ open: false, nodeId: null })}
        onSave={handleSaveConfig}
        vars={vars} templates={templates} schedules={schedules}
        queues={queues}
      />

      {}
      <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-3 sm:px-4 py-2 flex flex-wrap items-center gap-3 shadow-sm z-10">
        <span className="font-bold text-sm text-gray-700 dark:text-slate-200 px-2 border-r border-gray-200 dark:border-slate-700 mr-2 truncate max-w-[160px] sm:max-w-[220px]">
          {flowName}
        </span>

        <div className="flex flex-1 gap-2 overflow-x-auto pb-1 no-scrollbar items-center">

        <ToolButton icon={MessageSquare} label="Msg" onClick={() => createNode('messageNode')} />
        <ToolButton icon={TextCursorInput} label="Input" onClick={() => createNode('inputNode')} />
        <ToolButton icon={Split} label="If" onClick={() => createNode('conditionNode')} />
        <ToolButton icon={FileText} label="Template" onClick={() => createNode('templateNode')} />
        <ToolButton icon={Clock} label="Horário" onClick={() => createNode('scheduleNode')} />
        <ToolButton icon={Users} label="Fila" onClick={() => createNode('queueNode')} />
        <ToolButton icon={Star} label="Nota" onClick={() => createNode('ratingNode')} />
        <ToolButton icon={Code} label="Script" onClick={() => createNode('scriptNode')} />
          <ToolButton icon={Globe} label="API" onClick={() => createNode('httpRequestNode')} />
          <ToolButton icon={Hourglass} label="Delay" onClick={() => createNode('delayNode')} />
          <ToolButton icon={Database} label="Set" onClick={() => createNode('setValueNode')} />
          <ToolButton icon={Anchor} label="Flag" onClick={() => createNode('anchorNode')} />
          <ToolButton icon={Send} label="Go" onClick={() => createNode('gotoNode')} />
          <ToolButton icon={Flag} label="Fim" onClick={() => createNode('finalNode')} color="text-red-500" />
        </div>
        <div className="flex gap-2 ml-auto w-full sm:w-auto justify-start sm:justify-end">
          <button
            onClick={() => save(false)}
            className="
      flex items-center gap-1.5 px-3 py-1.5
      bg-white dark:bg-slate-700
      border border-gray-300 dark:border-slate-600
      text-gray-700 dark:text-slate-100
      rounded text-sm font-medium
      hover:bg-gray-50 dark:hover:bg-slate-600
      transition-all shadow-sm
    "
          >
            <Save size={14} />
            Salvar
          </button>

          <button
            onClick={() => save(true)}
            className="
      flex items-center gap-1.5 px-3 py-1.5
      bg-blue-600 dark:bg-blue-500
      text-white
      rounded text-sm font-medium
      hover:bg-blue-700 dark:hover:bg-blue-400
      transition-all shadow-md active:scale-95
    "
          >
            <Rocket size={14} />
            Publicar
          </button>
        </div>
      </div>

      <div style={{ flex: 1 }} className="min-h-[60vh]">
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onKeyDown={onKeyDown}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid={true}
          snapGrid={[20, 20]}
        >
          <Background
            color={isDark ? '#334155' : '#cbd5e1'}
            gap={20}
            size={1}
          />
          <Controls className="dark:bg-slate-800 dark:fill-white" />
        </ReactFlow>
      </div>
    </div>
  );
};

const ToolButton = ({ icon: Icon, label, onClick, color = "text-gray-600 dark:text-slate-300" }) => (
  <button
    onClick={onClick}
    className={`
      flex items-center gap-1.5 px-3 py-1.5
      bg-white dark:bg-slate-700
      border border-gray-200 dark:border-slate-600
      rounded text-xs font-medium
      ${color}
      hover:bg-gray-50 dark:hover:bg-slate-600
      whitespace-nowrap shadow-sm transition-colors
    `}
  >
    <Icon size={14} /> {label}
  </button>
);

export default () => (<ReactFlowProvider><FlowEditor /></ReactFlowProvider>);
