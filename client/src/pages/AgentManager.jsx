import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { useTenant } from '../context/TenantContext';
import { Users, UserPlus, Trash2, Shield, Briefcase, Headset, Star, MessageSquareText, X } from 'lucide-react';
import toast from 'react-hot-toast';

const AgentManager = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'AGENT', queues: [] });
  const [queues, setQueues] = useState([]);
  const [newQueueName, setNewQueueName] = useState('');
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [agentChats, setAgentChats] = useState([]);
  const [agentStats, setAgentStats] = useState({ total: 0, uniqueCustomers: 0 });
  const [loadingAgentChats, setLoadingAgentChats] = useState(false);
  const { tenant } = useTenant();

  useEffect(() => {
    fetchUsers();
    fetchQueues();
  }, []);

  const fetchQueues = async () => {
    const res = await apiRequest('/queues');
    if (res) setQueues(await res.json());
  };

  const handleSaveQueue = async () => {
    if (!newQueueName) return;
    const res = await apiRequest('/queues', {
      method: 'POST',
      body: JSON.stringify({ name: newQueueName })
    });
    if (res) {
      setNewQueueName('');
      fetchQueues();
      toast.success("Fila criada!");
    }
  };

  const handleDeleteQueue = async (id) => {
    if (!confirm("Excluir fila? Agentes nela perderão o acesso.")) return;

    const previousQueues = queues;
    setQueues(prev => prev.filter(q => q.id !== id));

    try {
      const res = await apiRequest(`/queues/${id}`, { method: 'DELETE' });
      if (!res || !res.ok) {
        setQueues(previousQueues);
        toast.error("Erro ao excluir fila");
      }
    } catch (error) {
      setQueues(previousQueues);
      toast.error("Erro ao excluir fila");
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/users?limit=200&page=1');
      if (res) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.items || []);
        setUsers(list);
        console.log(data)
      }
    } catch (error) {
      toast.error('Erro ao carregar Usuários');
    } finally {
      setLoading(false);
    }
  };

  const toggleQueue = (q) => {


    const newQueues = form.queues.includes(q.name)
      ? form.queues.filter(name => name !== q.name)
      : [...form.queues, q.name];

    setForm({ ...form, queues: newQueues });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name || !form.username || !form.password) return toast.error("Preencha o nome, Usuário e senha.");
    if (form.password.length < 6) return toast.error("A senha deve ter pelo menos 6 caracteres.");

    try {
      let effectiveTenantId = tenant?.id && tenant.id !== 'super_admin' ? tenant.id : null;
      if (!effectiveTenantId) {
        try {
          const saved = localStorage.getItem('selectedTenant');
          const parsed = saved ? JSON.parse(saved) : null;
          if (parsed?.id && parsed.id !== 'super_admin') {
            effectiveTenantId = parsed.id;
          }
        } catch (err) { }
      }
      if (!effectiveTenantId) {
        return toast.error("Selecione um tenant antes de criar o agente.");
      }

      const userData = {
        ...form,
        tenantId: effectiveTenantId
      };

      const res = await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify(userData)
      });

      if (res) {
        toast.success('Usuário criado com sucesso!');
        setForm({ name: '', username: '', password: '', role: 'AGENT', queues: [] });
        fetchUsers();
      }
    } catch (error) {
      toast.error(error.message || "Erro ao salvar");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remover este Usuário?")) return;

    const previousUsers = users;
    setUsers(prev => prev.filter(u => u.id !== id));

    try {
      const res = await apiRequest(`/users/${id}`, { method: 'DELETE' });
      if (res && res.ok) {
        toast.success("Usuário removido");
      } else {
        setUsers(previousUsers);
        toast.error("Erro ao excluir Usuário");
      }
    } catch (error) {
      setUsers(previousUsers);
      toast.error("Erro ao excluir");
    }
  };

  const openAgentModal = async (agent) => {
    setSelectedAgent(agent);
    setAgentChats([]);
    setAgentStats({ total: 0, uniqueCustomers: 0 });
    setLoadingAgentChats(true);
    try {
      const res = await apiRequest(`/chats/agent/${agent.id}?limit=100`);
      if (res && res.ok) {
        const data = await res.json();
        setAgentChats(Array.isArray(data.chats) ? data.chats : []);
        setAgentStats({
          total: Number(data.total || 0),
          uniqueCustomers: Number(data.uniqueCustomers || 0)
        });
      }
    } catch (error) {
      toast.error('Erro ao carregar Histórico do Agente');
    } finally {
      setLoadingAgentChats(false);
    }
  };

  const closeAgentModal = () => {
    setSelectedAgent(null);
  };

  const roleBadge = (role) => {
    const styles = {
      ADMIN: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      MANAGER: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      AGENT: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
    };
    const Icon = role === 'ADMIN' ? Shield : role === 'MANAGER' ? Briefcase : Headset;

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[role] || styles.AGENT}`}>
        <Icon size={12} /> {role}
      </span>
    );
  };

  const renderStars = (avg) => {
    const value = Number(avg || 0);
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={14}
            className={i < Math.round(value) ? 'text-yellow-500' : 'text-gray-300 dark:text-gray-600'}
            fill={i < Math.round(value) ? 'currentColor' : 'none'}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="p-3 sm:p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestão de Equipe</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Gerencie acessos e permissões</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          { }
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 shadow-sm h-fit">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-500" /> Novo Usuário
            </h2>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder=""
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Usuário</label>
                  <input
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Senha</label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cargo</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}
                >
                  <option value="AGENT">Atendente</option>
                  <option value="MANAGER">Gestor</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>

              {form.role === 'AGENT' && (
                <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-200 dark:border-gray-600">
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Filas de Atendimento</label>
                  <div className="space-y-2 flex flex-col">
                    {queues.map(q => (
                      <label key={q.id} className="">
                        <input
                          type="checkbox"
                          checked={form.queues.includes(q.name)}
                          onChange={() => toggleQueue(q)}
                          className="mr-2"
                        />
                        <span>{q.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button type="submit" className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm">
                Criar Acesso
              </button>
            </form>
          </div>

          { }
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Carregando...</div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Nenhum Usuário encontrado.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[720px]">

                  <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 uppercase font-medium">
                    <tr>
                      <th className="px-6 py-3">Nome</th>
                      <th className="px-6 py-3">Login</th>
                      <th className="px-6 py-3">Cargo</th>
                      <th className="px-6 py-3">Filas</th>
                      <th className="px-6 py-3">Avaliação</th>
                      <th className="px-6 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {users.map(u => (
                      <tr
                        key={u.id}
                        className="h-16 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-white flex items-center gap-3">
                          <div className="w-8 min-w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                            {u.name.charAt(0)}
                          </div>
                          {u.name}
                        </td>

                        <td className="px-6 py-4 text-gray-600 dark:text-gray-300 font-mono">
                          {u.username}
                        </td>

                        <td className="px-6 py-4">
                          {roleBadge(u.role)}
                        </td>

                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                          <div
                            title={u.role === 'AGENT' ? u.queues.join(', ') : '-'}
                            className="max-w-xs overflow-hidden whitespace-nowrap truncate"
                          >
                            {u.role === 'AGENT'
                              ? (u.queues.length ? u.queues.join(', ') : 'Nenhuma')
                              : '-'}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          {u.role === 'AGENT' ? (
                            <div className="flex items-center gap-2">
                              {renderStars(u.ratingAvg)}
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {Number(u.ratingAvg || 0).toFixed(1)} ({u.ratingCount || 0})
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>


                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {u.role === 'AGENT' && (
                              <button
                                onClick={() => openAgentModal(u)}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Ver atendimentos"
                              >
                                <MessageSquareText size={16} />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(u.id)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                  </tbody>
                </table>

              </div>
            )}

          </div>
        </div>
        <div className="mt-10">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Users size={20} className="text-blue-500" /> Configuração de Filas
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            { }
            <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nome da Nova Fila</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white"
                  placeholder="Ex: VENDAS"
                  value={newQueueName}
                  onChange={e => setNewQueueName(e.target.value)}
                />
                <button onClick={handleSaveQueue} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 w-full sm:w-auto">
                  Add
                </button>
              </div>
            </div>

            { }
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[480px]">
                  <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500">
                    <tr>
                      <th className="px-6 py-3">Nome da Fila</th>
                      <th className="px-6 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {queues.map(q => (
                      <tr key={q.id}>
                        <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">{q.name}</td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => handleDeleteQueue(q.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-4xl border border-gray-200 dark:border-gray-700 overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Histórico do Agente</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{selectedAgent.name} • {selectedAgent.username}</p>
              </div>
              <button
                onClick={closeAgentModal}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">Chats atribuídos</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{agentStats.total}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">Clientes únicos</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{agentStats.uniqueCustomers}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">Média de avaliação</p>
                <div className="flex items-center gap-2 mt-1">
                  {renderStars(selectedAgent.ratingAvg)}
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {Number(selectedAgent.ratingAvg || 0).toFixed(1)} ({selectedAgent.ratingCount || 0})
                  </span>
                </div>
              </div>
            </div>

            <div className="px-4 sm:px-6 pb-6 flex-1 overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Últimos atendimentos</h4>
                <span className="text-xs text-gray-500 dark:text-gray-400">Mostrando até 100 registros</span>
              </div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
                {loadingAgentChats ? (
                  <div className="p-6 text-center text-gray-500">Carregando histórico...</div>
                ) : agentChats.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">Nenhum atendimento encontrado.</div>
                ) : (
                  <table className="w-full text-sm text-left min-w-[720px]">
                    <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                      <tr>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Cliente</th>
                        <th className="px-4 py-3">Canal</th>
                        <th className="px-4 py-3">Fila</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Última mensagem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {agentChats.map((chat) => {
                        const lastMessage = Array.isArray(chat.messages) && chat.messages.length
                          ? chat.messages[chat.messages.length - 1]
                          : null;
                        return (
                          <tr key={chat.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                            <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                              {chat.updatedAt ? new Date(chat.updatedAt).toLocaleString() : 'N/A'}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">
                              {chat.customerCpf || chat.channelUserId || chat.channelChatId || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                              {chat.channel || 'web'}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                              {chat.queue || chat.transferredTo || '-'}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                              {chat.status || '-'}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 truncate max-w-[220px]">
                              {lastMessage?.text || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  );
};

export default AgentManager;





