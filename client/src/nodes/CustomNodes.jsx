import React from 'react';
import { Handle, Position } from 'reactflow';
import {
    Play, Square, MessageSquare, TextCursorInput,
    Database, Split, Anchor, ArrowRight, Code,
    Globe, Hourglass, Users, Clock, FileText,
    X, Flag, GitBranch, Star
} from 'lucide-react';


const NODE_WIDTH = 220;
const NODE_HEIGHT = 50;


const Tooltip = ({ text }) => (
    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-lg">
        {text || "Sem descrição"}
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
    </div>
);


const CompactNode = ({ id, data, icon: Icon, color, label, outputs = [], onDelete, disableConfig = false }) => {

    const handles = outputs.length > 0 ? outputs : [{ id: 'default', label: '' }];

    return (
        <div
            className="group relative bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all cursor-pointer"
            style={{
                width: 220,
                height: 50,
                borderLeft: `4px solid ${color}`
            }}
            onDoubleClick={(e) => {
                e.stopPropagation();
                if (!disableConfig && data.onConfig) data.onConfig(id);
            }}
        >
            <div className="flex items-center justify-between h-full px-3">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                        <Icon size={18} color={color} />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-100 truncate">
                            {data.customName || label}
                        </span>
                        <span className="text-[9px] text-slate-400 truncate uppercase tracking-wider">
                            {data.subLabel || label}
                        </span>
                    </div>
                </div>

                {onDelete && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(id); }}
                        className="text-slate-300 hover:text-red-500 transition-colors p-1"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {}
            <Handle type="target" position={Position.Left} className="!w-2 !h-6 !rounded-sm !bg-slate-300 dark:!bg-slate-600 !border-none" />

            {}
            {handles.map((output, index) => {
                const topPos = handles.length === 1 ? 50 : ((index + 1) * 100) / (handles.length + 1);
                return (
                    <div key={output.id} className="absolute right-0 w-0 h-0" style={{ top: `${topPos}%` }}>
                        <Handle
                            type="source"
                            position={Position.Right}
                            id={output.id}
                            className="!w-3 !h-3 !bg-slate-400 dark:!bg-slate-500 !border-2 !border-white dark:!border-slate-800 !-right-[6px]"
                        />
                        {output.label && output.id !== 'default' && (
                            <span className="absolute right-[10px] -top-[8px] text-[9px] font-bold text-slate-400 bg-white dark:bg-slate-800 px-1 border border-slate-100 dark:border-slate-700 rounded shadow-sm whitespace-nowrap">
                                {output.label}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export const CaseNode = ({ id, data }) => (
    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all cursor-pointer rounded-full px-4 py-2 shadow-sm min-w-35 h-10">
        <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-slate-400 !border-none" />
        <GitBranch size={14} className="text-slate-400 flex-shrink-0" />
        <span className="text-xs font-semibold dark:text-white text-slate-700 truncate max-w-[120px]" title={data.label}>
            {data.label}
        </span>
        <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-slate-400 !border-none" />
    </div>
);




export const StartNode = (props) => (
    <CompactNode
        {...props}
        icon={Play}
        color="#10b981"
        label="Início"
        onDelete={null}
        disableConfig={true}
    />
);
export const EndNode = (props) => <CompactNode {...props} icon={Square} color="#ef4444" label="Fim" outputs={[]} />;
export const FinalNode = (props) => <CompactNode {...props} icon={Flag} color="#000" label="Finalizar" outputs={[]} />;

export const MessageNode = (props) => <CompactNode {...props} icon={MessageSquare} color="#3b82f6" label="Mensagem" />;
export const InputNode = (props) => <CompactNode {...props} icon={TextCursorInput} color="#f59e0b" label="Entrada" />;
export const SetValueNode = (props) => <CompactNode {...props} icon={Database} color="#059669" label="Definir Var" />;
export const ScriptNode = (props) => <CompactNode {...props} icon={Code} color="#475569" label="Script JS" />;
export const DelayNode = (props) => <CompactNode {...props} icon={Hourglass} color="#d97706" label="Delay" />;
export const AnchorNode = (props) => <CompactNode {...props} icon={Anchor} color="#db2777" label="Âncora" />;
export const GotoNode = (props) => <CompactNode {...props} icon={ArrowRight} color="#db2777" label="Ir Para" outputs={[]} />;
export const QueueNode = (props) => <CompactNode {...props} icon={Users} color="#ea580c" label="Fila" />;
export const RatingNode = (props) => (
    <CompactNode {...props} icon={Star} color="#fbbf24" label="Nota" />
);

export const HttpRequestNode = (props) => (
    <CompactNode
        {...props}
        icon={Globe}
        color="#0891b2"
        label="API HTTP"
        outputs={[{ id: 'source', label: '' }]}
    />
);

export const ConditionNode = (props) => {



    return (
        <CompactNode
            {...props}
            icon={Split}
            color="#7c3aed"
            label="Condicional"
            outputs={[{ id: 'source', label: '' }]}
        />
    );
};

export const ScheduleNode = (props) => (
    <CompactNode
        {...props}
        icon={Clock}
        color="#16a34a"
        label="Horário"
        outputs={[{ id: 'source', label: '' }]}
    />
);

export const TemplateNode = (props) => {


    return (
        <CompactNode
            {...props}
            icon={FileText}
            color="#be185d"
            label="Template HSM"
            outputs={[{ id: 'source', label: '' }]}
        />
    );
};
