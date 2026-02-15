import { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../services/api';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Users, MessageSquare, Bot, Clock, Headset, Search, Activity,
  Eye, History, ArrowRightLeft, XCircle, X, User, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { SkeletonBox } from '../components/LoadingSkeleton';

const MonitoringDashboard = () => {
  const navigate = useNavigate();
  const { tenantId } = useParams();
  const [data, setData] = useState({ chats: [], agents: [] });
  const [loading, setLoading] = useState(true);


  const getTenantId = () => {
    if (tenantId) return tenantId;
    try {
      const saved = localStorage.getItem('selectedTenant');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.id && parsed.id !== 'super_admin') return parsed.id;
      }
    } catch (e) {}
    return null;
  };


  const buildEndpoint = (baseEndpoint) => {
    const currentTenantId = getTenantId();
    if (baseEndpoint.startsWith('/chats/')) return baseEndpoint;
    if (currentTenantId && !baseEndpoint.includes('/tenants/')) {
      return `/tenants/${currentTenantId}${baseEndpoint}`;
    }
    return baseEndpoint;
  };


  const [viewChat, setViewChatState] = useState(null);
  const viewChatRef = useRef(null);
  const [transferChat, setTransferChat] = useState(null);
  const [historyChat, setHistoryChat] = useState(null);
  const [clientHistory, setClientHistory] = useState([]);


  const [targetQueue, setTargetQueue] = useState('');
  const [targetAgent, setTargetAgent] = useState('');


  const [filterQueue, setFilterQueue] = useState('ALL');
  const [filterAgent, setFilterAgent] = useState('ALL');
  const [searchClient, setSearchClient] = useState('');

  const [queues, setQueues] = useState([]);
  const chatEndRef = useRef(null);

  const setViewChat = (chat) => {
    viewChatRef.current = chat;
    setViewChatState(chat);
  };

  useEffect(() => {
    const fetchData = async () => {
      const currentTenantId = getTenantId();
      const endpoint = currentTenantId
        ? `/tenants/${currentTenantId}/analytics`
        : '/monitoring/overview';

      try {
        const res = await apiRequest(endpoint);
        if (res && res.ok) {
          const json = await res.json();


          if (currentTenantId) {
            const chatsRes = await apiRequest(`/tenants/${currentTenantId}/chats`);
            if (chatsRes && chatsRes.ok) {
              const chats = await chatsRes.json();

              const usersRes = await apiRequest(`/tenants/${currentTenantId}/users`);
              const users = usersRes && usersRes.ok ? await usersRes.json() : [];

              setData({
                chats: chats,
                agents: users.filter(u => ['AGENT', 'MANAGER', 'ADMIN'].includes(u.role))
              });

              if (viewChatRef.current) {
                const list = Array.isArray(chats) ? chats : [];
                const updated = list.find(c => c.id === viewChatRef.current.id);
                if (updated) setViewChatState(updated);
              }
            }
          } else {

            setData(json);
          }

          if (!currentTenantId && viewChatRef.current) {
            const list = Array.isArray(json?.chats) ? json.chats : [];
            const updated = list.find(c => c.id === viewChatRef.current.id);
            if (updated) setViewChatState(updated);
          }
        }
      } catch (error) { console.error(error); }
      finally { setLoading(false); }
    };
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [tenantId]);

  useEffect(() => {
    const fetchQueues = async () => {
      try {
        const currentTenantId = getTenantId();
        const res = await apiRequest('/queues');
        if (res && res.ok) {
          const data = await res.json();
          const filtered = currentTenantId
            ? data.filter(q => q.tenantId === currentTenantId)
            : data;
          setQueues(filtered.map(q => q.name));
        }
      } catch (error) {
        console.error(error);
      }
    };
    fetchQueues();
  }, [tenantId]);

  useEffect(() => {
    if (viewChat) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [viewChat]);

  const loadHistory = async (cpf) => {
    if (!cpf || cpf === 'anonimo') return toast.error("Cliente sem CPF identificado.");
    const res = await apiRequest(buildEndpoint(`/chats/history/${cpf}`));
    if (res.ok) { setClientHistory(await res.json()); setHistoryChat(cpf); }
  };

  const handleForceClose = async (id) => {
    if (!confirm("Forçar encerramento?")) return;
    await apiRequest(buildEndpoint(`/chats/${id}/close`), { method: 'PUT' });
    toast.success("Atendimento encerrado");
  };

  const handleTransfer = async () => {
    if (!transferChat) return;
    await apiRequest(buildEndpoint('/chats/transfer'), {
      method: 'POST',
      body: JSON.stringify({
        chatId: transferChat.id,
        queue: targetQueue || transferChat.queue,
        agentId: targetAgent || null,
        agentName: targetAgent ? data.agents.find(a => a.id === targetAgent)?.name : null
      })
    });
    toast.success("Transferido!");
    setTransferChat(null); setTargetQueue(''); setTargetAgent('');
  };

  const filteredChats = data.chats.filter(c => {
    const qMatch = filterQueue === 'ALL' || c.queue === filterQueue;
    const aMatch = filterAgent === 'ALL' || c.agentName === filterAgent;
    const sMatch = searchClient === '' || (c.variables?.nome_cliente || '').toLowerCase().includes(searchClient.toLowerCase()) || (c.customerCpf || '').includes(searchClient);
    return qMatch && aMatch && sMatch && c.status !== 'closed';
  });

  const kpis = {
    total: data.chats.length,
    inBot: data.chats.filter(c => c.status === 'bot').length,
    inQueue: data.chats.filter(c => c.status === 'waiting').length,
    inService: data.chats.filter(c => c.status === 'open' && c.agentId).length
  };

  if (loading) {
    return (
      <main className="p-3 sm:p-4 lg:p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-2">
            <SkeletonBox className="h-6 w-48" />
            <SkeletonBox className="h-4 w-72" />
          </div>
          <SkeletonBox className="h-10 w-full lg:w-52" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`metric_${index}`} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
              <SkeletonBox className="h-4 w-24" />
              <SkeletonBox className="h-7 w-20" />
              <SkeletonBox className="h-3 w-28" />
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
            <SkeletonBox className="h-4 w-32" />
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonBox key={`chat_${index}`} className="h-10 w-full" />
            ))}
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
            <SkeletonBox className="h-4 w-28" />
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonBox key={`agent_${index}`} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-400 mx-auto space-y-6 h-[calc(100vh-60px)] flex flex-col">

      {}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
            <Activity size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">Monitoramento Operacional</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Visão em tempo real da operação.</p>
          </div>
        </div>
      </div>

      {}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Ativos" value={kpis.total} icon={MessageSquare} color="text-gray-500" />
        <KPICard title="No Bot" value={kpis.inBot} icon={Bot} color="text-blue-500" />
        <KPICard title="Fila" value={kpis.inQueue} icon={Clock} color="text-orange-500" />
        <KPICard title="Humanos" value={kpis.inService} icon={Headset} color="text-green-500" />
      </div>

      {}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 flex-1 min-h-0">

        {}
        <div className="lg:col-span-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 font-semibold text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800/50">
            EQUIPES & AGENTES
          </div>

          {}
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 space-y-3">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Filas em Tempo Real</div>
            {queues.map(q => {
              const count = data.chats.filter(c => c.queue === q).length;
              const wait = data.chats.filter(c => c.queue === q && c.status === 'waiting').length;
              return (
                <div key={q} className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 dark:text-gray-300 truncate pr-2">{q}</span>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-bold ${count > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>{count}</span>
                    {wait > 0 && <span className="text-xs text-orange-500 bg-orange-50 dark:bg-orange-900/20 px-1.5 rounded-full">+{wait}</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider sticky top-0 bg-white dark:bg-gray-800 pb-2">Agentes Online ({data.agents.filter(a => a.isOnline).length})</div>
            {data.agents.map(a => (
              <div key={a.id} className="flex justify-between items-center group">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{a.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{a.role}</div>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-gray-800 ${a.isOnline ? 'bg-green-500' : 'bg-gray-300'}`} title={a.isOnline ? 'Online' : 'Offline'}></div>
              </div>
            ))}
          </div>
        </div>

        {}
        <div className="lg:col-span-9 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gray-50 dark:bg-gray-800/50">
            <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-200">PAINEL DE ATENDIMENTOS</h3>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
                <input
                  className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-48"
                  placeholder="Buscar..."
                  value={searchClient}
                  onChange={e => setSearchClient(e.target.value)}
                />
              </div>
              <select className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 px-2 py-1.5 outline-none w-full sm:w-auto" value={filterQueue} onChange={e => setFilterQueue(e.target.value)}>
                <option value="ALL">Todas Filas</option>
                {queues.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left min-w-[700px]">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-700 sticky top-0">
                <tr>
                  <th className="px-6 py-3">Cliente</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Agente/Fila</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredChats.length === 0 ? (
                  <tr><td colSpan="4" className="text-center py-12 text-gray-400">Nenhum atendimento encontrado.</td></tr>
                ) : (
                  filteredChats.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 dark:text-white">{c.variables?.nome_cliente || 'Visitante'}</div>
                        <div className="text-xs text-gray-500 font-mono mt-0.5">{c.customerCpf !== 'anonimo' ? c.customerCpf : 'Não identificado'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={c.status} hasAgent={!!c.agentId} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-gray-900 dark:text-white font-medium">{c.queue || '-'}</div>
                        <div className="text-xs text-gray-500">{c.agentName || 'Aguardando...'}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <ActionButton icon={Eye} onClick={() => setViewChat(c)} title="Espionar" />
                          <ActionButton icon={History} onClick={() => loadHistory(c.customerCpf)} title="Histórico" />
                          <ActionButton icon={ArrowRightLeft} onClick={() => setTransferChat(c)} title="Transferir" />
                          <ActionButton icon={XCircle} onClick={() => handleForceClose(c.id)} title="Forçar Fim" variant="danger" />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {}
      {viewChat && (
        <Modal onClose={() => setViewChat(null)} title={`Monitorando: ${viewChat.variables?.nome_cliente || 'Anônimo'}`}>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex-1 overflow-y-auto p-4 space-y-3 h-100">
            {viewChat.messages.map((m, i) => (
              <div key={i} className={`flex ${m.sender === 'agent' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${m.sender === 'agent'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : m.sender === 'system'
                    ? 'bg-gray-200 text-gray-600 text-xs mx-auto rounded-full px-3 py-1 shadow-none'
                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-bl-sm'
                  }`}>
                  {m.sender !== 'system' && (
                    <div className="text-[10px] font-bold opacity-70 mb-1 uppercase tracking-wide">
                      {m.sender === 'bot' ? '🤖 Bot' : m.sender}
                    </div>
                  )}
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="mt-4 text-center text-xs text-gray-400">
            <Eye size={12} className="inline mr-1" /> Modo espectador ativo
          </div>
        </Modal>
      )}

      {}
      {transferChat && (
        <Modal onClose={() => setTransferChat(null)} title="Transferir Atendimento">
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-800 dark:text-blue-200 mb-4">
              Transferindo <strong>{transferChat.variables?.nome_cliente}</strong> da fila <strong>{transferChat.queue || 'Bot'}</strong>.
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nova Fila</label>
              <select className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" onChange={e => { setTargetQueue(e.target.value); setTargetAgent(''); }}>
                <option value="">Selecione...</option>
                {queues.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Atribuir a Agente (Opcional)</label>
              <select className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" onChange={e => { setTargetAgent(e.target.value); setTargetQueue(''); }}>
                <option value="">Nenhum</option>
                {data.agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.isOnline ? 'ON' : 'OFF'})</option>)}
              </select>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setTransferChat(null)} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleTransfer} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Confirmar</button>
            </div>
          </div>
        </Modal>
      )}

      {}
      {historyChat && (
        <Modal onClose={() => setHistoryChat(null)} title={`Histórico: ${historyChat}`}>
          <div className="space-y-4 max-h-100 overflow-y-auto">
            {clientHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-400">Nenhum histórico anterior.</div>
            ) : (
              clientHistory.map(h => (
                <div key={h.id} className="relative pl-6 pb-6 border-l-2 border-gray-200 dark:border-gray-700 last:pb-0 last:border-0">
                  <div className="absolute -left-2.25 top-0 w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-600 border-2 border-white dark:border-gray-800"></div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {new Date(parseInt(h.id.split('_')[1])).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    Atendido por: {h.agentName || 'Bot'} em {h.queue || 'Fluxo'}
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded text-xs text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-700">
                    {h.messages.length} mensagens trocadas.
                  </div>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};


const KPICard = ({ title, value, icon: Icon, color }) => (
  <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
    <div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{value}</div>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</div>
    </div>
    <div className={`p-3 rounded-lg bg-gray-50 dark:bg-gray-700 ${color}`}>
      <Icon size={24} />
    </div>
  </div>
);

const StatusBadge = ({ status, hasAgent }) => {
  if (status === 'bot') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">🤖 Bot</span>;
  if (status === 'waiting') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border border-orange-200 dark:border-orange-800">⏳ Fila</span>;
  return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800">👨‍💻 Humano</span>;
};

const ActionButton = ({ icon: Icon, onClick, title, variant = 'default' }) => (
  <button
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded-md transition-colors ${variant === 'danger'
      ? 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
      : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
      }`}
  >
    <Icon size={16} />
  </button>
);

const Modal = ({ children, onClose, title }) => (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={20} /></button>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  </div>
);

export default MonitoringDashboard;
