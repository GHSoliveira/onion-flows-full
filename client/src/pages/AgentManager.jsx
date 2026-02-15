import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { useTenant } from '../context/TenantContext';
import { Users, UserPlus, Trash2, Shield, Briefcase, Headset } from 'lucide-react';
import toast from 'react-hot-toast';

const AgentManager = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'AGENT', queues: [] });
  const [queues, setQueues] = useState([]);
  const [newQueueName, setNewQueueName] = useState('');
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
    await apiRequest(`/queues/${id}`, { method: 'DELETE' });
    fetchQueues();
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/users');
      if (res) {
        const data = await res.json();
        setUsers(data);
        console.log(data)
      }
    } catch (error) {
      toast.error('Erro ao carregar usuários');
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
    if (!form.name || !form.username || !form.password) return toast.error("Preencha o nome, usuário e senha.");
    if (form.password.length < 6) return toast.error("A senha deve ter pelo menos 6 caracteres.");

    try {

      const userData = {
        ...form,
        tenantId: tenant?.id || null
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
    if (!window.confirm("Remover este usuário?")) return;
    try {
      const res = await apiRequest(`/users/${id}`, { method: 'DELETE' });
      if (res) {
        toast.success("Usuário removido");
        fetchUsers();
      }
    } catch (error) {
      toast.error("Erro ao excluir");
    }
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestão de Equipe</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Gerencie acessos e permissões</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm h-fit">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-500" /> Novo Usuário
          </h2>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Ex: Pedro Leonardo o mais gai"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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

        {}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Carregando...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Nenhum usuário encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left table-fixed">

                <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 uppercase font-medium">
                  <tr>
                    <th className="px-6 py-3">Nome</th>
                    <th className="px-6 py-3">Login</th>
                    <th className="px-6 py-3">Cargo</th>
                    <th className="px-6 py-3">Filas</th>
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


                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(u.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}

                </tbody>
              </table>

            </div>
          )}

        </div>
      </div>
      <div className="mt-12">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Users size={20} className="text-blue-500" /> Configuração de Filas
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nome da Nova Fila</label>
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white"
                placeholder="Ex: VENDAS"
                value={newQueueName}
                onChange={e => setNewQueueName(e.target.value)}
              />
              <button onClick={handleSaveQueue} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                Add
              </button>
            </div>
          </div>

          {}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
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

  );
};

export default AgentManager;