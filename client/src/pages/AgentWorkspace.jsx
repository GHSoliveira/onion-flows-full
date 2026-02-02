import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';
import {
  User, MessageCircle, Clock, Play, XCircle, Send, LogOut, Headset
} from 'lucide-react';
import toast from 'react-hot-toast';

const AgentWorkspace = () => {
  const { user, logout } = useAuth();
  const [waitingChats, setWaitingChats] = useState([]);
  const [myChats, setMyChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [agentInput, setAgentInput] = useState('');
  const chatEndRef = useRef(null);

  // 1. Polling Unificado
  // 1. Polling Unificado Seguro
  useEffect(() => {
    let isMounted = true;
    let timeoutId;

    if (!user) return;

    const fetchAll = async () => {
      try {
        const res = await apiRequest('/chats/my-queues');
        if (res && res.ok && isMounted) {
          const data = await res.json();

          // Comparações simples para evitar setStates desnecessários
          setWaitingChats(prev => JSON.stringify(prev) !== JSON.stringify(data.waiting) ? data.waiting : prev);
          setMyChats(prev => JSON.stringify(prev) !== JSON.stringify(data.active) ? data.active : prev);

          if (selectedChat) {
            const all = [...data.active, ...data.waiting];
            const updated = all.find(c => c.id === selectedChat.id);
            if (updated && updated.messages.length !== selectedChat.messages.length) {
              setSelectedChat(updated);
            }
          }
        }
      } catch (e) { console.error(e); }

      if (isMounted) {
        timeoutId = setTimeout(fetchAll, 3000);
      }
    };

    fetchAll();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [user, selectedChat?.id]); // Removido selectedChat inteiro da dependência

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

    const continueFlow = confirm("Deseja devolver o cliente para o fluxo automático (Bot)?\nCancel = Finalizar Definitivo");

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

  if (!user) return <div className="flex justify-center items-center h-full"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="flex h-full w-full overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">

      {/* SIDEBAR INTERNA (Listas) - Largura fixa para não espremer */}
      <aside className="w-80 min-w-[320px] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col z-10">
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
          <div>
            <div className="font-bold text-sm text-gray-900 dark:text-white">{user.name}</div>
            <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Online
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Meus Atendimentos */}
          <div className="sticky top-0 z-20 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase flex items-center gap-2 border-b border-blue-100 dark:border-blue-800/30">
            <MessageCircle size={14} /> Em Atendimento ({myChats.length})
          </div>

          {myChats.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-xs italic bg-gray-50/50 dark:bg-gray-800/50">Você está livre.</div>
          ) : (
            myChats.map(chat => (
              <div
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                className={`p-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-all ${selectedChat?.id === chat.id ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500 pl-2' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-l-4 border-l-transparent'}`}
              >
                <div className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">{chat.variables?.nome_cliente || 'Cliente'}</div>
                <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-1">
                  <MessageCircle size={10} /> {chat.queue}
                </div>
              </div>
            ))
          )}

          {/* Fila de Espera */}
          <div className="sticky top-0 z-20 px-4 py-2 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 text-xs font-bold uppercase flex items-center gap-2 border-y border-orange-100 dark:border-orange-800/30 mt-2">
            <Clock size={14} /> Fila de Espera ({waitingChats.length})
          </div>

          {waitingChats.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-xs bg-gray-50/50 dark:bg-gray-800/50">Fila vazia.</div>
          ) : (
            waitingChats.map(chat => (
              <div
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                className={`p-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-all ${selectedChat?.id === chat.id ? 'bg-orange-50 dark:bg-orange-900/20 border-l-4 border-l-orange-500 pl-2' : 'hover:bg-orange-50/30 dark:hover:bg-orange-900/10 border-l-4 border-l-transparent'}`}
              >
                <div className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">{chat.variables?.nome_cliente || 'Anônimo'}</div>
                <div className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1 mt-1 font-medium">
                  <Clock size={10} /> {chat.queue}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ÁREA PRINCIPAL (CHAT) - Flex 1 para ocupar o resto */}
      <main className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 relative min-w-0">
        {selectedChat ? (
          <>
            <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6 shadow-sm z-10 shrink-0">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <User size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate max-w-[200px]">{selectedChat.variables?.nome_cliente || 'Visitante'}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">CPF: {selectedChat.variables?.cpf || 'N/A'}</p>
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                {selectedChat.status === 'waiting' ? (
                  <button
                    onClick={() => handlePickup(selectedChat)}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold uppercase transition-colors shadow-sm active:scale-95"
                  >
                    <Play size={14} fill="white" /> PUXAR ATENDIMENTO
                  </button>
                ) : (
                  <button
                    onClick={handleClose}
                    className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50 rounded-lg text-xs font-bold uppercase transition-colors"
                  >
                    <XCircle size={14} /> Encerrar
                  </button>
                )}
              </div>
            </header>

            {/* CRM Rápido */}
            {selectedChat.status === 'open' && (
              <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-2 flex gap-6 overflow-x-auto shrink-0 scrollbar-hide">
                {Object.entries(selectedChat.variables || {}).map(([key, val]) => (
                  <div key={key} className="flex flex-col min-w-[100px]">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{key.replace('_', ' ')}</span>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate" title={String(val)}>{String(val)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Lista de Mensagens */}
            <div className="flex-1 p-6 overflow-y-auto space-y-3 custom-scrollbar bg-gray-50/50 dark:bg-gray-900/50">
              {selectedChat.messages.map((m, i) => (
                <div key={i} className={`flex ${m.sender === 'agent' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${m.sender === 'agent'
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

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex gap-3 shrink-0">
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
      </main>
    </div>
  );
};

export default AgentWorkspace;