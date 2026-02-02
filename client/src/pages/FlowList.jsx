import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getJSON, postJSON, deleteJSON } from '../services/api';
import {
  Plus,
  Search,
  Workflow,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';

const FlowList = () => {
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const fetchFlows = async () => {
    try {
      setLoading(true);
      const data = await getJSON('/flows');
      if (Array.isArray(data)) {
        setFlows(data);
      }
    } catch (error) {
      console.error("Erro ao buscar fluxos:", error);
      toast.error("Erro ao carregar fluxos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlows();
  }, []);

  const handleCreateFlow = async () => {
    const name = prompt("Nome do novo fluxo (ex: Atendimento Inicial):");
    if (!name || name.trim() === "") return;

    try {
      // Usa o helper postJSON (já trata headers e token)
      const newFlow = await postJSON('/flows', { name });

      if (newFlow && newFlow.id) {
        toast.success("Fluxo criado!");
        navigate(`/editor/${newFlow.id}`);
      }
    } catch (error) {
      toast.error("Erro ao criar fluxo.");
    }
  };

  const handleDeleteFlow = async (id, name) => {
    if (!window.confirm(`Deseja realmente excluir o fluxo "${name}"?`)) return;

    try {
      await deleteJSON(`/flows/${id}`);
      setFlows(prev => prev.filter(f => f.id !== id));
      toast.success("Fluxo excluído.");
    } catch (error) {
      toast.error("Erro ao excluir.");
    }
  };

  const filteredFlows = flows.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.id.includes(searchTerm)
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <main className="p-6 max-w-7xl mx-auto space-y-6">

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Workflow className="w-8 h-8 text-blue-600" /> Fluxos de Conversa
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Gerencie os roteiros automatizados do chatbot.</p>
        </div>
        <button
          onClick={handleCreateFlow}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm"
        >
          <Plus size={18} /> Novo Fluxo
        </button>
      </div>

      {/* Barra de Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar fluxo por nome ou ID..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
        />
      </div>

      {/* Tabela */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 uppercase font-medium">
            <tr>
              <th className="px-6 py-3">Nome</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">ID</th>
              <th className="px-6 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredFlows.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                  Nenhum fluxo encontrado.
                </td>
              </tr>
            ) : (
              filteredFlows.map(flow => (
                <tr key={flow.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                    {flow.name}
                  </td>
                  <td className="px-6 py-4">
                    {flow.published ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                        <CheckCircle2 size={12} /> Publicado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                        <AlertCircle size={12} /> Rascunho
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                    {flow.id}
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    <button
                      onClick={() => navigate(`/editor/${flow.id}`)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteFlow(flow.id, flow.name)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
};

export default FlowList;