import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, Code, Split, FileText, Send, Clock, Users, Hourglass, Anchor, Database, Globe, Flag } from 'lucide-react';

const ConfigWrapper = ({ title, onClose, onSave, children }) => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-t-xl">
                <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">{title}</h3>
                <button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">{children}</div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-xl flex justify-end gap-3">
                <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
                <button onClick={onSave} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg shadow-sm flex items-center gap-2 transition-colors">
                    <Save size={16} /> Salvar Alterações
                </button>
            </div>
        </div>
    </div>
);

const AnchorConfig = ({ data, onChange }) => (
    <div className="space-y-4">
        <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Nome desta Âncora</label>
            <input
                className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-white"
                placeholder="Ex: menu_principal"
                value={data.anchorName || ''}
                onChange={e => onChange({ anchorName: e.target.value })}
            />
            <p className="text-[10px] text-gray-400 mt-1">
                Dê um nome único. Use este mesmo nome no nó "Ir Para" (GoTo) para criar um salto no fluxo.
            </p>
        </div>
    </div>
);



const ScriptConfig = ({ data, onChange }) => (
    <div className="space-y-4">
        <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Código JavaScript (Sandbox)</label>
            <p className="text-[10px] text-gray-400 mb-2">Use o objeto 'vars' para ler/escrever. Ex: vars.nome = vars.nome.toUpperCase();</p>
            <textarea
                className="w-full p-3 border rounded-lg h-64 font-mono text-xs dark:bg-gray-900 dark:text-green-400 focus:ring-2 focus:ring-blue-500 outline-none"
                value={data.script || ''}
                onChange={e => onChange({ script: e.target.value })}
                placeholder="// Escreva seu código aqui..."
            />
        </div>
    </div>
);

const ConditionConfig = ({ data, onChange, vars }) => (
    <div className="space-y-4">
        <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-gray-500 uppercase">Regras de Condição (IF)</label>
            <button
                onClick={() => onChange({ conditions: [...(data.conditions || []), { id: Date.now(), variable: '', operator: '==', value: '' }] })}
                className="text-xs text-blue-600 font-bold flex items-center gap-1"
            >
                <Plus size={14} /> Add Regra
            </button>
        </div>
        <div className="space-y-3">
            {(data.conditions || []).map((cond, i) => (
                <div key={cond.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 space-y-2">
                    <div className="flex gap-2">
                        <select
                            className="flex-1 p-2 border rounded text-xs dark:bg-gray-800"
                            value={cond.variable}
                            onChange={e => {
                                const newC = [...data.conditions]; newC[i].variable = e.target.value; onChange({ conditions: newC });
                            }}
                        >
                            <option value="">Variável...</option>
                            {vars.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                        </select>
                        <select
                            className="w-20 p-2 border rounded text-xs dark:bg-gray-800"
                            value={cond.operator}
                            onChange={e => {
                                const newC = [...data.conditions]; newC[i].operator = e.target.value; onChange({ conditions: newC });
                            }}
                        >
                            <option value="==">==</option>
                            <option value="!=">!=</option>
                            <option value=">">&gt;</option>
                            <option value="<">&lt;</option>
                            <option value="contains">contém</option>
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <input
                            className="flex-1 p-2 border rounded text-xs dark:bg-gray-800"
                            placeholder="Valor"
                            value={cond.value}
                            onChange={e => {
                                const newC = [...data.conditions]; newC[i].value = e.target.value; onChange({ conditions: newC });
                            }}
                        />
                        <button onClick={() => onChange({ conditions: data.conditions.filter(c => c.id !== cond.id) })} className="text-red-500"><Trash2 size={16} /></button>
                    </div>
                </div>
            ))}
            <div className="text-[10px] text-gray-400 italic">Cada regra acima gerará uma saída lateral no nó.</div>
        </div>
        <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
            <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative flex items-center">
                    <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={data.hasElse ?? true}
                        onChange={e => onChange({ hasElse: e.target.checked })}
                    />
                    <div className="w-10 h-5 bg-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </div>
                <span className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide group-hover:text-blue-500 transition-colors">
                    Gerar saída "Senão" (Else)
                </span>
            </label>
            <p className="text-[10px] text-gray-400 mt-1 pl-13">
                Se desmarcado, o fluxo irá travar caso nenhuma condição acima seja atendida.
            </p>
        </div>
    </div>
);

const TemplateConfig = ({ data, onChange, templates }) => (
    <div className="space-y-4">
        <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Selecionar Template (HSM)</label>
            <select
                className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-gray-700"
                value={data.templateId || ''}
                onChange={e => onChange({ templateId: e.target.value })}
            >
                <option value="">Selecione um modelo...</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
        </div>
        {data.templateId && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg">
                <p className="text-xs text-blue-600 dark:text-blue-400 italic">Os botões configurados neste template aparecerão automaticamente como saídas no fluxo.</p>
            </div>
        )}
    </div>
);

const HttpRequestConfig = ({ data, onChange, vars }) => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE'];

    const addMapping = () => {
        const newMappings = [...(data.mappings || []), { jsonPath: '', varName: '' }];
        onChange({ mappings: newMappings });
    };

    const updateMapping = (index, field, value) => {
        const newMappings = [...data.mappings];
        newMappings[index][field] = value;
        onChange({ mappings: newMappings });
    };

    const removeMapping = (index) => {
        onChange({ mappings: data.mappings.filter((_, i) => i !== index) });
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
                <div className="col-span-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Método</label>
                    <select
                        className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-white"
                        value={data.method || 'GET'}
                        onChange={e => onChange({ method: e.target.value })}
                    >
                        {methods.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div className="col-span-3">
                    <label className="text-xs font-bold text-gray-500 uppercase">Endpoint (URL)</label>
                    <input
                        type="text"
                        className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-white"
                        placeholder="https://api.exemplo.com/v1/cliente/{cpf}"
                        value={data.url || ''}
                        onChange={e => onChange({ url: e.target.value })}
                    />
                </div>
            </div>

            <p className="text-[10px] text-gray-400">
                Dica: Use <code>{'{variavel}'}</code> na URL para enviar dados dinâmicos.
            </p>

            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center mb-3">
                    <label className="text-xs font-bold text-gray-500 uppercase">Mapear Resposta JSON</label>
                    <button
                        onClick={addMapping}
                        className="text-xs text-blue-600 font-bold flex items-center gap-1"
                    >
                        <Plus size={14} /> Add Campo
                    </button>
                </div>

                <div className="space-y-2">
                    {(data.mappings || []).map((m, i) => (
                        <div key={i} className="flex gap-2 items-center bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg">
                            <input
                                className="flex-1 p-1.5 border rounded text-xs dark:bg-gray-800 dark:text-white"
                                placeholder="Caminho (ex: data.nome)"
                                value={m.jsonPath}
                                onChange={e => updateMapping(i, 'jsonPath', e.target.value)}
                            />
                            <span className="text-gray-400">➜</span>
                            <select
                                className="flex-1 p-1.5 border rounded text-xs dark:bg-gray-800 dark:text-white"
                                value={m.varName}
                                onChange={e => updateMapping(i, 'varName', e.target.value)}
                            >
                                <option value="">Salvar em...</option>
                                {vars.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                            </select>
                            <button onClick={() => removeMapping(i)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                    {(!data.mappings || data.mappings.length === 0) && (
                        <p className="text-center text-[11px] text-gray-400 py-2 italic">Nenhum mapeamento definido.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

const GotoConfig = ({ data, onChange }) => (
    <div className="space-y-4">
        <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Identificador da Âncora</label>
            <input
                className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-gray-700"
                placeholder="Ex: menu_financeiro"
                value={data.targetAnchor || ''}
                onChange={e => onChange({ targetAnchor: e.target.value })}
            />
            <p className="text-[10px] text-gray-400 mt-1">O fluxo saltará para o nó do tipo 'Âncora' que tiver este mesmo nome.</p>
        </div>
    </div>
);

const FinalNodeConfig = ({ data, onChange }) => (
    <div className="space-y-4">
        <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Mensagem de Encerramento</label>
            <textarea
                className="w-full mt-1 p-3 border rounded-lg h-32 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:bg-gray-700 dark:border-gray-600"
                value={data.text || ''}
                onChange={e => onChange({ text: e.target.value })}
                placeholder="Atendimento finalizado. Obrigado!"
            />
            <p className="text-[10px] text-gray-400 mt-1">
                Mensagem exibida ao cliente quando o fluxo chegar neste nó.
            </p>
        </div>
    </div>
);



const MessageConfig = ({ data, onChange }) => (
    <div>
        <label className="text-xs font-bold text-gray-500 uppercase">Texto da Mensagem</label>
        <textarea
            className="w-full mt-1 p-3 border rounded-lg h-32 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:bg-gray-700 dark:border-gray-600"
            value={data.text || ''}
            onChange={e => onChange({ text: e.target.value })}
            placeholder="Olá! Como posso ajudar?"
        />
    </div>
);



const NodeConfigModal = ({ node, isOpen, onClose, onSave, vars = [], templates = [], schedules = [], queues = [] }) => {
    const [localData, setLocalData] = useState({});

    useEffect(() => {
        if (node) setLocalData({ ...node.data });
    }, [node]);

    const handleLocalChange = (newData) => setLocalData(prev => ({ ...prev, ...newData }));

    const handleSave = () => {
        onSave(node.id, localData);
        onClose();
    };

    if (!isOpen || !node) return null;

    let Content = null;
    let Title = 'Configurar Nó';
    let Icon = FileText;

    switch (node.type) {
        case 'setValueNode':
            Title = 'Definir Valor de Variável';
            Icon = Database;
            Content = (
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Variável Alvo</label>
                        <select
                            className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            value={localData.variableName || ''}
                            onChange={e => handleLocalChange({ variableName: e.target.value })}
                        >
                            <option value="">Selecione a variável...</option>
                            {vars.map(v => (
                                <option key={v.id} value={v.name}>{v.name}</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-gray-400 mt-1">Escolha qual variável terá o valor alterado.</p>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Valor a ser Atribuído</label>
                        <input
                            type="text"
                            className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Ex: true, 100, Ativo..."
                            value={localData.value || ''}
                            onChange={e => handleLocalChange({ value: e.target.value })}
                        />
                        <p className="text-[10px] text-gray-400 mt-1">Dica: Você pode usar outras variáveis aqui usando {'{var_nome}'}.</p>
                    </div>
                </div>
            );
            break;
        case 'messageNode':
            Title = 'Configurar Mensagem';
            Content = <MessageConfig data={localData} onChange={handleLocalChange} />;
            break;
        case 'scriptNode':
            Title = 'Configurar Script JS';
            Icon = Code;
            Content = <ScriptConfig data={localData} onChange={handleLocalChange} />;
            break;
        case 'conditionNode':
            Title = 'Configurar Condicional';
            Icon = Split;
            Content = <ConditionConfig data={localData} onChange={handleLocalChange} vars={vars} />;
            break;
        case 'templateNode':
            Title = 'Configurar Template HSM';
            Icon = FileText;
            Content = <TemplateConfig data={localData} onChange={handleLocalChange} templates={templates} />;
            break;
        case 'gotoNode':
            Title = 'Salto de Fluxo (GoTo)';
            Icon = Send;
            Content = <GotoConfig data={localData} onChange={handleLocalChange} />;
            break;
        case 'anchorNode':
            Title = 'Configurar Âncora';
            Icon = Anchor;
            Content = <AnchorConfig data={localData} onChange={handleLocalChange} />;
            break;

        case 'delayNode':
            Title = 'Configurar Delay';
            Content = (
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Tempo de Espera (segundos)</label>
                    <input type="number" className="w-full mt-1 p-2 border rounded dark:bg-gray-700"
                        value={localData.delay || 1} onChange={e => handleLocalChange({ delay: e.target.value })} />
                </div>
            );
            break;
        case 'queueNode':
            Title = 'Transferir para Fila';
            Content = (
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Escolha a Fila de Destino</label>
                        <select
                            className="w-full mt-1 p-2 border rounded-lg dark:bg-gray-700 dark:text-white"
                            value={localData.queueName || ''}
                            onChange={e => handleLocalChange({ queueName: e.target.value })}
                        >
                            <option value="">Selecione uma fila...</option>
                            {queues.map(q => (
                                <option key={q.id} value={q.name}>{q.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-[11px] text-orange-700 dark:text-orange-300">
                        Ao atingir este nó, o bot será pausado e o cliente entrará na fila selecionada aguardando um agente humano.
                    </div>
                </div>
            );
            break;
        case 'scheduleNode':
            Title = 'Validar Horário';
            Content = (
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Grupo de Horário</label>
                    <select className="w-full mt-1 p-2 border rounded dark:bg-gray-700" value={localData.scheduleId || ''} onChange={e => handleLocalChange({ scheduleId: e.target.value })}>
                        <option value="">Selecione...</option>
                        {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
            );
            break;
        case 'inputNode':
            Title = 'Entrada de Dados';
            Content = (
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Pergunta do Bot</label>
                        <textarea
                            className="w-full mt-1 p-2 border rounded dark:bg-gray-700 h-20"
                            value={localData.text || ''}
                            onChange={e => handleLocalChange({ text: e.target.value })}
                            placeholder="Ex: Qual o seu e-mail?"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Salvar resposta na variável:</label>
                        <select
                            className="w-full mt-1 p-2 border rounded dark:bg-gray-700"
                            value={localData.variableName || ''}
                            onChange={e => handleLocalChange({ variableName: e.target.value })}
                        >
                            <option value="">Selecione uma variável...</option>
                            {vars.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                        </select>
                        <p className="text-[10px] text-gray-400 mt-1">
                            A resposta do cliente será guardada nesta variável para uso posterior.
                        </p>
                    </div>
                </div>
            );
            break;
        case 'httpRequestNode':
            Title = 'Requisição HTTP (API)';
            Icon = Globe;
            Content = (
                <HttpRequestConfig
                    data={localData}
                    onChange={handleLocalChange}
                    vars={vars}
                />
            );
            break;
        case 'finalNode':
            Title = 'Mensagem de Encerramento';
            Icon = Flag;
            Content = <FinalNodeConfig data={localData} onChange={handleLocalChange} />;
            break;
        default:
            Content = <div className="p-4 bg-yellow-50 text-yellow-700 rounded-lg border border-yellow-200">Configuração não mapeada para o tipo: <b>{node.type}</b></div>;
    }

    return (
        <ConfigWrapper title={Title} onClose={onClose} onSave={handleSave}>
            <div className="mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
                <label className="text-xs font-bold text-gray-400 uppercase">Identificador Visual</label>
                <input
                    className="w-full mt-1 p-2 border rounded text-sm bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:text-white"
                    placeholder={node.type}
                    value={localData.customName || ''}
                    onChange={e => handleLocalChange({ customName: e.target.value })}
                />
            </div>
            {Content}
        </ConfigWrapper>
    );
};

export default NodeConfigModal;