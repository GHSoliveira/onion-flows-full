import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';
import { socketService } from '../services/socket';
import {
  User, MessageCircle, Clock, Play, XCircle, Send, LogOut, Headset, Star
} from 'lucide-react';
import toast from 'react-hot-toast';
import { CenterSkeleton } from '../components/LoadingSkeleton';

const AgentWorkspace = () => {
  const { user, logout } = useAuth();
  const [waitingChats, setWaitingChats] = useState([]);
  const [myChats, setMyChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [agentInput, setAgentInput] = useState('');
  const [visibleVars, setVisibleVars] = useState([]);
  const [rootVars, setRootVars] = useState([]);
  const [quickReplies, setQuickReplies] = useState([]);
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [quickDraft, setQuickDraft] = useState('');
  const [tick, setTick] = useState(Date.now());
  const chatEndRef = useRef(null);
  const selectedChatRef = useRef(null);

  const renderStars = (avg) => {
    const value = Number(avg || 0);
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={12}
            className={i < Math.round(value) ? 'text-yellow-500' : 'text-gray-300 dark:text-gray-600'}
            fill={i < Math.round(value) ? 'currentColor' : 'none'}
          />
        ))}
      </div>
    );
  };

  const renderChannelBadge = (channel) => {
    const key = (channel || 'web').toLowerCase();
    const icon = key === 'telegram' ? Send : MessageCircle;
    const label = key === 'telegram' ? 'Telegram' : (channel || 'Web');
    const Icon = icon;
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-300">
        <Icon size={10} /> {label}
      </span>
    );
  };



  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiRequest('/chats/my-queues');
      if (res && res.ok) {
        const data = await res.json();
        setWaitingChats(prev => JSON.stringify(prev) !== JSON.stringify(data.waiting) ? data.waiting : prev);
        setMyChats(prev => JSON.stringify(prev) !== JSON.stringify(data.active) ? data.active : prev);

        const current = selectedChatRef.current;
        if (current) {
          const all = [...data.active, ...data.waiting];
          const updated = all.find(c => c.id === current.id);
          const varsChanged = JSON.stringify(updated?.vars || {}) !== JSON.stringify(current.vars || {});
          const variablesChanged = JSON.stringify(updated?.variables || {}) !== JSON.stringify(current.variables || {});
          const messagesChanged = updated && updated.messages.length !== current.messages.length;
          if (updated && (messagesChanged || varsChanged || variablesChanged)) {
            setSelectedChat(updated);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    let timeoutId;

    if (!user) return;

    const poll = async () => {
      await fetchAll();
      if (isMounted) {
        timeoutId = setTimeout(poll, 1000);
      }
    };

    poll();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [user, fetchAll]);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    socketService.connect(token);

    const refresh = () => fetchAll();
    socketService.on('message', refresh);
    socketService.on('new_chat', refresh);
    socketService.on('queue_update', refresh);
    socketService.on('agent_assigned', refresh);
    socketService.on('chat_closed', refresh);

    return () => {
      socketService.off('message', refresh);
      socketService.off('new_chat', refresh);
      socketService.off('queue_update', refresh);
      socketService.off('agent_assigned', refresh);
      socketService.off('chat_closed', refresh);
    };
  }, [user, fetchAll]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (!user?.tenantId) return;
        const res = await apiRequest(`/tenants/${user.tenantId}/settings`);
        if (res && res.ok) {
          const settings = await res.json();
          setVisibleVars(settings.agentViewVars || []);
        }
      } catch (error) {
        console.error('Erro ao carregar settings:', error);
      }
    };
    loadSettings();
  }, [user?.tenantId]);

  useEffect(() => {
    const loadRootVars = async () => {
      try {
        const res = await apiRequest('/variables');
        if (res && res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          setRootVars(list.filter(v => v.isRoot === true && v.enabled !== false));
        }
      } catch (error) {
        console.error('Erro ao carregar variáveis root:', error);
      }
    };
    loadRootVars();
  }, []);

  useEffect(() => {
    const loadQuickReplies = async () => {
      try {
        const res = await apiRequest('/templates');
        if (res && res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          setQuickReplies(list.filter(t => t.scope === 'root'));
        }
      } catch (error) {
        console.error('Erro ao carregar templates:', error);
      }
    };
    loadQuickReplies();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [selectedChat?.messages]);

  const handlePickup = async (chat) => {
    try {
      const res = await apiRequest('/chats/pickup', {
        method: 'POST',
        body: JSON.stringify({ chatId: chat.id })
      });
      if (res && res.ok) {
        const updatedChat = await res.json();
        setSelectedChat(updatedChat);
        toast.success("Atendimento iniciado!");
      } else {
        toast.error("Não foi possível puxar este atendimento.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao puxar atendimento");
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!agentInput.trim() || !selectedChat) return;
    if (selectedChat.status === 'waiting') return toast.error("Puxe o atendimento antes de responder.");

    const textToSend = agentInput;
    setAgentInput('');

    try {
      const res = await apiRequest(`/chats/${selectedChat.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          sender: 'agent',
          agentName: user.name,
          text: textToSend
        })
      });

      if (res && res.ok) {
        const savedMsg = await res.json();
        setSelectedChat(prev => ({
          ...prev,
          messages: [...prev.messages, savedMsg]
        }));
      }
    } catch (error) {
      console.error("Erro ao enviar:", error);
      toast.error("Falha no envio");
    }
  };

  const handleClose = async () => {
    if (!confirm("Encerrar atendimento?")) return;

    const continueFlow = selectedChat?.continueFlowAfterQueue ?? false;

    try {
      await apiRequest(`/chats/${selectedChat.id}/close`, {
        method: 'PUT',
        body: JSON.stringify({ continueFlow })
      });
      setSelectedChat(null);
      toast.success(continueFlow ? "Cliente devolvido ao bot" : "Atendimento finalizado");
    } catch (error) {
      toast.error("Erro ao encerrar");
    }
  };

  if (!user) return <CenterSkeleton />;

  const chatVars = { ...(selectedChat?.variables || {}), ...(selectedChat?.vars || {}) };

  const normalizeKey = (value) => String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  const resolveVarValue = (name) => {
    if (!name) return undefined;
    if (Object.prototype.hasOwnProperty.call(chatVars, name)) return chatVars[name];
    const target = normalizeKey(name);
    const entry = Object.entries(chatVars).find(([key]) => normalizeKey(key) === target);
    return entry ? entry[1] : undefined;
  };

  const renderTemplateText = (text) => {
    if (!text) return '';
    return text.replace(/\{([\w.-]+)\}/g, (match, key) => {
      if (key === 'nome_agente') return user?.name || match;
      const value = chatVars?.[key];
      return value !== undefined && value !== null ? String(value) : match;
    });
  };

  const handleQuickSelect = (template) => {
    const filled = renderTemplateText(template.text || '');
    setQuickDraft(filled);
    setShowQuickModal(true);
  };

  const handleQuickSend = async () => {
    if (!quickDraft.trim() || !selectedChat) return;
    if (selectedChat.status === 'waiting') return toast.error("Puxe o atendimento antes de responder.");
    try {
      const res = await apiRequest(`/chats/${selectedChat.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          sender: 'agent',
          agentName: user.name,
          text: quickDraft
        })
      });
      if (res && res.ok) {
        const savedMsg = await res.json();
        setSelectedChat(prev => ({
          ...prev,
          messages: [...prev.messages, savedMsg]
        }));
        setShowQuickModal(false);
        setQuickDraft('');
      }
    } catch (error) {
      toast.error('Falha no envio');
    }
  };

  const filterVars = (vars) => {
    if (!vars) return [];
    const entries = Object.entries(vars);
    if (!visibleVars || visibleVars.length === 0) return entries;
    return entries.filter(([key]) => visibleVars.includes(key));
  };

  const formatWait = (chat) => {
    const since = chat.waitingSince || chat.transferredAt || chat.createdAt;
    if (!since) return '0s';
    const diff = Math.max(0, tick - new Date(since).getTime());
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <div className="flex flex-col lg:flex-row h-full w-full overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">

      {}
      <aside className="w-full lg:w-80 lg:min-w-[320px] bg-white dark:bg-gray-800 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 flex flex-col z-10 max-h-[45vh] lg:max-h-none">
        <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-900 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
          <div>
            <div className="font-bold text-sm text-gray-900 dark:text-white truncate max-w-[200px]">{user.name}</div>
            <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Online
            </div>
            <div className="mt-1 flex items-center gap-2">
              {renderStars(user.ratingAvg)}
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                {Number(user.ratingAvg || 0).toFixed(1)} ({user.ratingCount || 0})
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {}
          <div className="sticky top-0 z-20 px-3 sm:px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase flex items-center gap-2 border-b border-blue-100 dark:border-blue-800/30">
            <MessageCircle size={14} /> Em Atendimento ({myChats.length})
          </div>

          {myChats.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-xs italic bg-gray-50/50 dark:bg-gray-800/50">Você está livre.</div>
          ) : (
            myChats.map(chat => (
              <div
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                className={`p-2 sm:p-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-all ${selectedChat?.id === chat.id ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500 pl-2' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-l-4 border-l-transparent'}`}
              >
                <div className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">
                  {chat.vars?.nome_cliente || chat.variables?.nome_cliente || 'Cliente'}
                </div>
                <div className="mt-1">{renderChannelBadge(chat.channel)}</div>
                <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-1">
                  <MessageCircle size={10} /> {chat.queue}
                </div>
              </div>
            ))
          )}

          {}
          <div className="sticky top-0 z-20 px-3 sm:px-4 py-2 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 text-xs font-bold uppercase flex items-center gap-2 border-y border-orange-100 dark:border-orange-800/30 mt-2">
            <Clock size={14} /> Fila de Espera ({waitingChats.length})
          </div>

          {waitingChats.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-xs bg-gray-50/50 dark:bg-gray-800/50">Fila vazia.</div>
          ) : (
            waitingChats.map(chat => (
              <div
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                className={`p-2 sm:p-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-all ${selectedChat?.id === chat.id ? 'bg-orange-50 dark:bg-orange-900/20 border-l-4 border-l-orange-500 pl-2' : 'hover:bg-orange-50/30 dark:hover:bg-orange-900/10 border-l-4 border-l-transparent'}`}
              >
                <div className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">
                  {chat.vars?.nome_cliente || chat.variables?.nome_cliente || 'Anônimo'}
                </div>
                <div className="mt-1">{renderChannelBadge(chat.channel)}</div>
                <div className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1 mt-1 font-medium">
                  <Clock size={10} /> {chat.queue} · {formatWait(chat)}
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                  Entrou: {chat.waitingSince ? new Date(chat.waitingSince).toLocaleTimeString() : '—'}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {}
      <main className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 relative min-w-0">
        {selectedChat ? (
          <>
            <header className="min-h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6 shadow-sm z-10 shrink-0">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <User size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate max-w-[200px] sm:max-w-[260px]">
                    {(visibleVars.length === 0 || visibleVars.includes('nome_cliente'))
                      ? (selectedChat.variables?.nome_cliente || 'Visitante')
                      : 'Visitante'}
                  </h3>
                  {(visibleVars.length === 0 || visibleVars.includes('cpf')) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">CPF: {selectedChat.variables?.cpf || 'N/A'}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                {selectedChat.status === 'waiting' ? (
                  <button
                    onClick={() => handlePickup(selectedChat)}
                    className="flex items-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold uppercase transition-colors shadow-sm active:scale-95"
                  >
                    <Play size={14} fill="white" /> PUXAR ATENDIMENTO
                  </button>
                ) : (
                  <button
                    onClick={handleClose}
                    className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50 rounded-lg text-xs font-bold uppercase transition-colors"
                  >
                    <XCircle size={14} /> Encerrar
                  </button>
                )}
              </div>
            </header>

            {}
            {selectedChat.status === 'open' && (
              <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6 py-2 flex gap-4 lg:gap-6 overflow-x-auto shrink-0 scrollbar-hide">
                {filterVars(selectedChat.variables || {}).map(([key, val]) => (
                  <div key={key} className="flex flex-col min-w-[100px]">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{key.replace('_', ' ')}</span>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate" title={String(val)}>{String(val)}</span>
                  </div>
                ))}
              </div>
            )}

            {}
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
              <div className="flex-1 p-4 lg:p-6 overflow-y-auto space-y-3 custom-scrollbar bg-gray-50/50 dark:bg-gray-900/50">
                {selectedChat.messages.map((m, i) => (
                  <div key={i} className={`flex ${m.sender === 'agent' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${m.sender === 'agent'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : m.sender === 'system'
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs text-center w-full shadow-none italic py-1 mb-2 rounded-lg'
                        : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600 rounded-bl-sm'
                      }`}>
                      {m.sender !== 'system' && (
                        <div className={`text-[10px] font-bold mb-1 uppercase tracking-wide opacity-80 ${m.sender === 'agent' ? 'text-blue-100' : 'text-blue-600 dark:text-blue-400'}`}>
                          {m.sender === 'agent' ? 'Você' : m.sender.toUpperCase()}
                        </div>
                      )}
                      {m.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
                <div>
                  <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Info do Cliente</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500">CPF</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200">{chatVars?.cpf || '—'}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500">Nome</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200">{chatVars?.nome_cliente || '—'}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500">Canal</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200">{selectedChat.channel || 'web'}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Variáveis Root</div>
                  {rootVars.length === 0 ? (
                    <div className="text-xs text-gray-400">Nenhuma variável root ativa.</div>
                  ) : (
                    <div className="space-y-2">
                      {rootVars.map((v) => (
                        <div key={v.id} className="flex justify-between gap-2 text-sm">
                          <span className="text-gray-500">{v.name}</span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[140px]">
                            {resolveVarValue(v.name) ?? v.defaultValue ?? '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Mensagens Rápidas</div>
                  {quickReplies.length === 0 ? (
                    <div className="text-xs text-gray-400">Nenhuma mensagem root.</div>
                  ) : (
                    <div className="space-y-2">
                      {quickReplies.map((tpl) => (
                        <button
                          key={tpl.id}
                          onClick={() => handleQuickSelect(tpl)}
                          className="w-full text-left text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        >
                          <div className="font-semibold text-gray-800 dark:text-gray-200">{tpl.name}</div>
                          <div className="text-[11px] text-gray-500 line-clamp-2">{tpl.text}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </aside>
            </div>

            {}
            <form onSubmit={handleSend} className="p-3 sm:p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex gap-3 shrink-0">
              <input
                className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-800 text-gray-900 dark:text-white"
                value={agentInput}
                onChange={e => setAgentInput(e.target.value)}
                placeholder={selectedChat.status === 'waiting' ? "Puxe o atendimento para responder..." : "Digite sua mensagem..."}
                disabled={selectedChat.status === 'waiting'}
              />
              <button
                type="submit"
                disabled={selectedChat.status === 'waiting'}
                className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center"
              >
                <Send size={20} />
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
            <Headset size={64} className="mb-4 opacity-20" />
            <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-300">Área de Atendimento</h3>
            <p className="text-sm mt-2">Selecione um cliente ao lado para começar.</p>
          </div>
        )}
        {showQuickModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowQuickModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Mensagem rápida</h3>
              <textarea
                className="w-full min-h-[140px] px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={quickDraft}
                onChange={(e) => setQuickDraft(e.target.value)}
              />
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowQuickModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleQuickSend}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Enviar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AgentWorkspace;
