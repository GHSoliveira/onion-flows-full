import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { socketService } from '../services/socket';
import { ScrollText, Activity, ShieldCheck, Save, LogIn, ArrowRightLeft, MessageSquare, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const SystemLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await apiRequest('/logs');
        if (res && res.ok) {
          const data = await res.json();
          // Backend retorna { logs: [...], total, page, totalPages }
          const logArray = data.logs || (Array.isArray(data) ? data : []);
          setLogs(Array.isArray(logArray) ? logArray : []);
        } else {
          console.warn("Falha ao buscar logs:", res?.status);
        }
      } catch (err) {
        console.error("Erro logs:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();

    const handleNewLog = (newLog) => {
      setLogs(prev => [newLog, ...prev].slice(0, 1000));
    };

    socketService.on('new_log', handleNewLog);

    return () => {
      socketService.off('new_log', handleNewLog);
    };
  }, []);

  const getLogConfig = (type) => {
    switch (type) {
      case 'PUBLISH': return { color: 'text-green-400 bg-green-400/10 border-green-400/20', icon: ShieldCheck, label: 'PUBLICAÇÃO' };
      case 'SAVE': return { color: 'text-blue-400 bg-blue-400/10 border-blue-400/20', icon: Save, label: 'SALVAMENTO' };
      case 'LOGIN': return { color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: LogIn, label: 'ACESSO' };
      case 'TRANSFER': return { color: 'text-purple-400 bg-purple-400/10 border-purple-400/20', icon: ArrowRightLeft, label: 'TRANSFERÊNCIA' };
      case 'CHAT_START': return { color: 'text-pink-400 bg-pink-400/10 border-pink-400/20', icon: MessageSquare, label: 'NOVO CHAT' };
      case 'ERROR': return { color: 'text-red-400 bg-red-400/10 border-red-400/20', icon: AlertCircle, label: 'ERRO' };
      default: return { color: 'text-gray-400 bg-gray-400/10 border-gray-400/20', icon: Activity, label: 'SISTEMA' };
    }
  };

  return (
    <main className="content h-screen bg-gray-50 dark:bg-gray-900 p-6 flex flex-col overflow-hidden">

      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-slate-200 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300">
          <ScrollText size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">Logs de Auditoria</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Registro imutável de ações administrativas e operacionais.</p>
        </div>
      </div>

      <div className="flex-1 bg-[#0f172a] rounded-xl border border-slate-700 overflow-hidden flex flex-col shadow-lg">

        {/* Header da Tabela */}
        <div className="flex items-center justify-between px-6 py-3 bg-[#1e293b] border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-emerald-400 animate-pulse" />
            <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Live Stream</span>
          </div>
          <span className="text-xs font-mono text-slate-500">Últimos 1000 eventos</span>
        </div>

        {/* Corpo da Tabela */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#0f172a] sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-3 text-xs font-mono font-semibold text-slate-500 w-48">TIMESTAMP</th>
                <th className="px-6 py-3 text-xs font-mono font-semibold text-slate-500 w-48">TIPO</th>
                <th className="px-6 py-3 text-xs font-mono font-semibold text-slate-500">MENSAGEM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan="3" className="px-6 py-12 text-center text-slate-500 font-mono text-sm">
                    Carregando registros...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="3" className="px-6 py-12 text-center text-slate-500 font-mono text-sm">
                    Nenhum log encontrado.
                  </td>
                </tr>
              ) : (
                logs.map((log, index) => {
                  const config = getLogConfig(log.type);
                  const Icon = config.icon;
                  const rowKey = log.id || log._id || `log-${index}`;
                  
                  return (
                    <tr key={rowKey} className="hover:bg-slate-800/30 transition-colors group">
                      <td className="px-6 py-3 text-xs font-mono text-slate-400 whitespace-nowrap group-hover:text-slate-300">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${config.color}`}>
                          <Icon size={10} strokeWidth={3} />
                          {config.label}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm font-mono text-slate-300 break-all">
                        {typeof log.message === 'object' ? JSON.stringify(log.message) : String(log.message || '')}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
};

export default SystemLogs;