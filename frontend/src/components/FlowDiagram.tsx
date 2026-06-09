import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { VinEntry, VoutEntry } from '../lib';
import { formatSats, truncHash, scriptColor } from '../lib';

/* ================================================================
   CUSTOM NODE COMPONENTS
   ================================================================ */

function InputNode({ data }: NodeProps) {
  const sc = scriptColor(data.scriptType as string);
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 8,
      background: '#1f1f1f',
      border: '1px solid rgba(255,255,255,0.08)',
      borderLeft: '4px solid #E50914',
      width: 210, fontFamily: 'Inter, sans-serif',
      position: 'relative',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
      transition: 'all 0.2s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#E50914', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          Input #{data.index as number}
        </span>
        <span style={{
          fontSize: 8, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
          background: sc.bg, color: sc.fg, textTransform: 'uppercase',
        }}>
          {((data.scriptType as string) || '?').toUpperCase()}
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#f5f5f5', marginBottom: 3 }}>
        {formatSats(data.value as number)}
      </div>
      <div style={{ fontSize: 9, color: '#808080', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {(data.address as string) || '—'}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#E50914', width: 9, height: 9, border: '2px solid #1f1f1f' }} />
    </div>
  );
}

function OutputNode({ data }: NodeProps) {
  const sc = scriptColor(data.scriptType as string);
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 8,
      background: '#1f1f1f',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRight: '4px solid #4ca1e8',
      width: 210, fontFamily: 'Inter, sans-serif',
      position: 'relative',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#4ca1e8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          Output #{data.index as number}
        </span>
        <span style={{
          fontSize: 8, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
          background: sc.bg, color: sc.fg, textTransform: 'uppercase',
        }}>
          {((data.scriptType as string) || '?').toUpperCase()}
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#f5f5f5', marginBottom: 3 }}>
        {formatSats(data.value as number)}
      </div>
      <div style={{ fontSize: 9, color: '#808080', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {(data.address as string) || ((data.scriptType as string) === 'op_return' ? 'Unspendable' : '—')}
      </div>
      <Handle type="target" position={Position.Left} style={{ background: '#4ca1e8', width: 9, height: 9, border: '2px solid #1f1f1f' }} />
    </div>
  );
}

function HubNode(_props: NodeProps) {
  return (
    <div style={{
      width: 64, height: 64, borderRadius: '50%',
      background: 'linear-gradient(135deg, #E50914, #b8070f)',
      display: 'grid', placeItems: 'center',
      boxShadow: '0 0 36px rgba(229,9,20,0.35), 0 0 70px rgba(229,9,20,0.12)',
      fontFamily: 'Inter, sans-serif',
      position: 'relative',
      animation: 'hubPulse 3s ease-in-out infinite',
    }}>
      <style>{`
        @keyframes hubPulse {
          0%, 100% { box-shadow: 0 0 36px rgba(229,9,20,0.35), 0 0 70px rgba(229,9,20,0.12); }
          50% { box-shadow: 0 0 46px rgba(229,9,20,0.45), 0 0 90px rgba(229,9,20,0.20); }
        }
      `}</style>
      <span style={{ fontSize: 26, fontWeight: 900, color: '#fff' }}>₿</span>
      <Handle type="target" position={Position.Left} id="hub-in"
        style={{ background: '#E50914', width: 9, height: 9, border: '2px solid #b8070f' }} />
      <Handle type="source" position={Position.Right} id="hub-out"
        style={{ background: '#4ca1e8', width: 9, height: 9, border: '2px solid #b8070f' }} />
    </div>
  );
}

function FeeNode({ data }: NodeProps) {
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 8,
      background: 'rgba(229, 9, 20, 0.06)',
      border: '1px dashed rgba(229, 9, 20, 0.20)',
      borderRight: '4px solid #ff3b47',
      width: 210, fontFamily: 'Inter, sans-serif',
      position: 'relative',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#ff3b47', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>
        ⛏ Miner Fee
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#ff3b47' }}>
        {formatSats(data.fee as number)}
      </div>
      <div style={{ fontSize: 9, color: '#808080' }}>Paid to miner</div>
      <Handle type="target" position={Position.Left}
        style={{ background: '#ff3b47', width: 9, height: 9, border: '2px solid #1f1f1f' }} />
    </div>
  );
}

const nodeTypes = {
  inputNode: InputNode,
  outputNode: OutputNode,
  hubNode: HubNode,
  feeNode: FeeNode,
};

/* ================================================================
   LAYOUT CONSTANTS
   ================================================================ */
const NODE_W = 230;
const NODE_H = 76;
const V_GAP = 18;
const COL_GAP = 300;
const HUB_SIZE = 64;

interface Props { vin: VinEntry[]; vout: VoutEntry[]; fee: number; }

export default function FlowDiagram({ vin, vout, fee }: Props) {
  const maxShow = 8;
  const inputs = vin.slice(0, maxShow);
  const outputs = vout.slice(0, maxShow);

  const { nodes, edges, containerHeight } = useMemo(() => {
    const inCount = inputs.length;
    const outCount = outputs.length + 1;
    const maxCount = Math.max(inCount, outCount);

    const totalH = maxCount * (NODE_H + V_GAP) - V_GAP;

    const inX = 0;
    const hubX = NODE_W + COL_GAP / 2 + 40;
    const outX = hubX + COL_GAP / 2 + 40;

    const hubY = totalH / 2 - HUB_SIZE / 2;

    const inTotalH = inCount * (NODE_H + V_GAP) - V_GAP;
    const inStartY = Math.max(0, (totalH - inTotalH) / 2);

    const outTotalH = outCount * (NODE_H + V_GAP) - V_GAP;
    const outStartY = Math.max(0, (totalH - outTotalH) / 2);

    const ns: Node[] = [];
    const es: Edge[] = [];

    ns.push({
      id: 'hub',
      type: 'hubNode',
      position: { x: hubX, y: hubY },
      data: {},
      draggable: false,
    });

    inputs.forEach((v, i) => {
      const y = inStartY + i * (NODE_H + V_GAP);
      const nodeId = `in-${i}`;
      ns.push({
        id: nodeId,
        type: 'inputNode',
        position: { x: inX, y },
        data: {
          index: i,
          value: v.prevout?.value_sats ?? 0,
          address: v.address ? truncHash(v.address, 12) : undefined,
          scriptType: v.script_type || 'unknown',
        },
        draggable: false,
      });
      es.push({
        id: `e-${nodeId}`,
        source: nodeId,
        target: 'hub',
        targetHandle: 'hub-in',
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#E50914', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#E50914', width: 14, height: 14 },
      });
    });

    outputs.forEach((v, i) => {
      const y = outStartY + i * (NODE_H + V_GAP);
      const nodeId = `out-${i}`;
      ns.push({
        id: nodeId,
        type: 'outputNode',
        position: { x: outX, y },
        data: {
          index: v.n ?? i,
          value: v.value_sats,
          address: v.address ? truncHash(v.address, 12) : undefined,
          scriptType: v.script_type || 'unknown',
        },
        draggable: false,
      });
      es.push({
        id: `e-${nodeId}`,
        source: 'hub',
        sourceHandle: 'hub-out',
        target: nodeId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#4ca1e8', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#4ca1e8', width: 14, height: 14 },
      });
    });

    const feeY = outStartY + outputs.length * (NODE_H + V_GAP);
    ns.push({
      id: 'fee',
      type: 'feeNode',
      position: { x: outX, y: feeY },
      data: { fee },
      draggable: false,
    });
    es.push({
      id: 'e-fee',
      source: 'hub',
      sourceHandle: 'hub-out',
      target: 'fee',
      type: 'smoothstep',
      animated: true,
        style: { stroke: '#ff3b47', strokeWidth: 2, strokeDasharray: '6 4' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#ff3b47', width: 14, height: 14 },
    });

    const containerHeight = Math.max(totalH + 80, 340);
    return { nodes: ns, edges: es, containerHeight };
  }, [inputs, outputs, fee]);

  const onInit = useCallback((instance: any) => {
    setTimeout(() => instance.fitView({ padding: 0.12 }), 50);
  }, []);

  return (
    <div className="flow-container">
      <div className="flow-title">Transaction Flow</div>
      <div style={{ height: containerHeight, borderRadius: 8, overflow: 'hidden', background: '#181818' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={onInit}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
          style={{ background: 'transparent' }}
        >
          <Background color="rgba(255,255,255,0.015)" gap={32} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
