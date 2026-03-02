import { useState, useEffect, useRef, useCallback } from 'react';
import { apiRequest } from '../services/api';
import {
  Play,
  RefreshCcw,
  Send,
  Bot,
  User,
  Terminal,
  Cpu
} from 'lucide-react';
import toast from 'react-hot-toast';

const ChatSimulator = () => {
  const [flows, setFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [activeFlow, setActiveFlow] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [sessionVars, setSessionVars] = useState({});
  const [userInput, setUserInput] = useState('');
  const [chatId, setChatId] = useState(null);
  const [currentCpf, setCurrentCpf] = useState(null);
  const [isClosed, setIsClosed] = useState(false);
  const [chatMetadata, setChatMetadata] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await apiRequest('/flows?limit=200&page=1');
        if (!response || !response.ok) return;
        const payload = await response.json();
        const list = Array.isArray(payload) ? payload : (payload?.items || []);
        setFlows(list);
      } catch (error) {
        console.error(error);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const refreshChat = useCallback(async (targetChatId) => {
    if (!targetChatId) return;

    const res = await apiRequest(`/chats/${targetChatId}`);
    if (!res || !res.ok) return;

    const chat = await res.json();
    setMessages(Array.isArray(chat.messages) ? chat.messages : []);
    setSessionVars(chat.vars || {});
    setCurrentNodeId(chat.currentNodeId || null);
    setChatMetadata(chat);
    setIsClosed(chat.status === 'closed');
    setIsTyping(false);
  }, []);

  const startSimulation = async () => {
    if (!selectedFlowId) {
      return toast.error('Selecione um fluxo');
    }

    const flowResponse = await apiRequest(`/flows/${selectedFlowId}`);
    if (!flowResponse || !flowResponse.ok) {
      return toast.error('Nao foi possivel carregar o fluxo');
    }

    const flow = await flowResponse.json();
    if (!flow?.published?.nodes?.length) {
      return toast.error('Este fluxo nao foi publicado.');
    }

    const simCpf = `sim_${Date.now()}`;
    setCurrentCpf(simCpf);
    setIsTyping(true);

    const chatResponse = await apiRequest('/chats/init', {
      method: 'POST',
      body: JSON.stringify({
        customerCpf: simCpf,
        flowId: selectedFlowId,
        mode: 'simulator'
      })
    });

    if (!chatResponse || !chatResponse.ok) {
      setIsTyping(false);
      return toast.error('Nao foi possivel iniciar a simulacao');
    }

    const chat = await chatResponse.json();
    setChatId(chat.id);
    setActiveFlow(flow);
    setMessages(Array.isArray(chat.messages) ? chat.messages : []);
    setSessionVars(chat.vars || {});
    setCurrentNodeId(chat.currentNodeId || null);
    setChatMetadata(chat);
    setIsClosed(chat.status === 'closed');
    setIsTyping(false);
  };

  const handleSend = async (event) => {
    event.preventDefault();
    if (isClosed || !userInput.trim() || !chatId) return;

    const text = userInput.trim();
    setUserInput('');
    setIsTyping(true);

    const response = await apiRequest(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ sender: 'user', text })
    });

    if (!response || !response.ok) {
      setIsTyping(false);
      return toast.error('Erro ao enviar mensagem');
    }

    await refreshChat(chatId);
  };

  const handleButtonClick = async (buttonId, label) => {
    if (isClosed || !chatId) return;

    setIsTyping(true);
    const response = await apiRequest(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        sender: 'user',
        text: label,
        buttonId
      })
    });

    if (!response || !response.ok) {
      setIsTyping(false);
      return toast.error('Erro de conexao no fluxo');
    }

    await refreshChat(chatId);
  };

  useEffect(() => {
    let isMounted = true;
    let timeoutId = null;

    const pollData = async () => {
      if (!isMounted || !chatId || isClosed) {
        return;
      }

      try {
        await refreshChat(chatId);
      } catch (error) {
        console.error('[POLL] Erro:', error.message);
      }

      if (isMounted && !isClosed) {
        timeoutId = setTimeout(pollData, 2000);
      }
    };

    timeoutId = setTimeout(pollData, 1000);

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [chatId, isClosed, refreshChat]);

  return (
    <main className="content min-h-screen flex flex-col p-3 sm:p-4 lg:p-6 overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 p-4 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm mb-4 lg:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
            <Cpu size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Simulador de Chatbot</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Ambiente de teste controlado.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            className="p-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-700 dark:text-gray-200 w-full sm:w-auto"
            value={selectedFlowId}
            onChange={(event) => setSelectedFlowId(event.target.value)}
          >
            <option value="">Selecione um fluxo...</option>
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.name} {flow.published ? 'OK' : 'RASCUNHO'}
              </option>
            ))}
          </select>

          <button
            onClick={startSimulation}
            disabled={!selectedFlowId}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm w-full sm:w-auto justify-center"
          >
            <Play size={16} /> Iniciar Sessao
          </button>

          {chatId && (
            <button
              onClick={() => {
                setMessages([]);
                setChatId(null);
                setIsClosed(false);
                setSessionVars({});
                setChatMetadata(null);
                setCurrentNodeId(null);
              }}
              className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors border border-gray-200 dark:border-gray-600"
              title="Resetar"
            >
              <RefreshCcw size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col lg:flex-row gap-4 lg:gap-6 min-h-0">
        <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm flex flex-col overflow-hidden">
          <div className="flex-1 p-4 lg:p-6 overflow-y-auto space-y-4 bg-gray-50/50 dark:bg-gray-900/50 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
            {messages.length === 0 && !chatId && (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <Bot size={64} className="mb-4 opacity-20" />
                <p className="text-sm">Selecione um fluxo acima e clique em iniciar.</p>
              </div>
            )}

            {messages.map((message, index) => (
              <div key={`${message.id || index}`} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    message.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : message.sender === 'system'
                        ? 'bg-transparent text-gray-500 text-xs text-center w-full shadow-none italic'
                        : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600 rounded-bl-sm'
                  }`}
                >
                  {message.sender !== 'system' && (
                    <div
                      className={`text-[10px] font-bold mb-1 uppercase tracking-wide flex items-center gap-1 ${
                        message.sender === 'user' ? 'text-blue-100' : 'text-gray-400'
                      }`}
                    >
                      {message.sender === 'bot' ? <Bot size={12} /> : <User size={12} />}
                      {message.sender}
                    </div>
                  )}

                  {message.text}

                  {message.buttons && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.buttons.map((button) => (
                        <button
                          key={button.id}
                          onClick={() => handleButtonClick(button.id, button.label)}
                          disabled={isClosed}
                          className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-xs font-medium rounded-full border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {button.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75"></span>
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSend} className="p-3 sm:p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex gap-3">
            <input
              className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-800 text-gray-900 dark:text-white"
              value={userInput}
              onChange={(event) => setUserInput(event.target.value)}
              placeholder={isClosed ? 'Atendimento encerrado.' : 'Digite sua mensagem...'}
              disabled={!chatId || isClosed}
            />
            <button
              type="submit"
              disabled={!chatId || isClosed}
              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <Send size={20} />
            </button>
          </form>
        </div>

        <div className="w-full lg:w-80 bg-[#0f172a] rounded-xl border border-gray-800 flex flex-col overflow-hidden shadow-lg">
          <div className="p-4 border-b border-gray-800 bg-[#1e293b] flex items-center gap-2 text-gray-200">
            <Terminal size={16} className="text-green-400" />
            <span className="text-xs font-mono font-bold tracking-wider">MEMORY_DUMP</span>
          </div>

          <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-gray-400 space-y-4 scrollbar-thin scrollbar-thumb-gray-700">
            <div>
              <div className="text-gray-500 mb-1">
                <div className="text-blue-400 break-all">{chatId || 'null'}</div>
                {currentCpf && (
                  <div className="text-green-400 mt-1">CPF: {currentCpf}</div>
                )}
              </div>
              {chatMetadata && (
                <div className="text-[11px] text-gray-400 space-y-1">
                  <div>Em espera de: <span className="text-white">{chatMetadata.queue || '---'}</span></div>
                  <div>Agente responsavel: <span className="text-blue-300">{chatMetadata.agentName || 'Aguardando agente'}</span></div>
                  <div>Status: <span className="text-green-300">{chatMetadata.status || 'Aguardando'}</span></div>
                  <div>No atual: <span className="text-orange-300">{currentNodeId || '---'}</span></div>
                </div>
              )}
            </div>

            <div>
              <div className="text-gray-500 mb-2">
                {Object.keys(sessionVars).length === 0 ? (
                  <span className="text-gray-600 italic">empty</span>
                ) : (
                  Object.entries(sessionVars).map(([key, value]) => (
                    <div key={key} className="flex gap-2 mb-1">
                      <span className="text-purple-400">{key}:</span>
                      <span className="text-yellow-300">"{String(value)}"</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {activeFlow && (
              <div>
                <div className="text-gray-500 mb-1">
                  <div className="text-orange-400">{activeFlow.name}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};

export default ChatSimulator;
