import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import {
  FileText,
  Plus,
  Trash2,
  Save,
  MessageSquare,
  MousePointer2,
  X,
  LayoutTemplate
} from 'lucide-react';
import toast from 'react-hot-toast';

const TemplateManager = () => {
  const [templates, setTemplates] = useState([]);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [buttons, setButtons] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/templates');
      if (res && res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error("Erro ao carregar templates:", error);
      toast.error("Falha ao carregar modelos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleAddButton = () => {
    setButtons([...buttons, { id: `btn_${Date.now()}`, label: '' }]);
  };

  const handleRemoveButton = (id) => {
    setButtons(buttons.filter(b => b.id !== id));
  };

  const updateButtonLabel = (index, value) => {
    const newBtns = [...buttons];
    newBtns[index].label = value;
    setButtons(newBtns);
  };

  const handleSave = async () => {
    if (!name.trim() || !text.trim()) return toast.error("Preencha o nome e a mensagem.");

    if (buttons.some(b => !b.label.trim())) return toast.error("Preencha o texto de todos os botões.");

    try {
      const res = await apiRequest('/templates', {
        method: 'POST',
        body: JSON.stringify({ name, text, buttons })
      });

      if (res && res.ok) {
        setName(''); setText(''); setButtons([]);
        fetchTemplates();
        toast.success("Modelo salvo com sucesso!");
      }
    } catch (error) {
      toast.error("Erro ao salvar.");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este modelo?")) return;
    try {
      await apiRequest(`/templates/${id}`, { method: 'DELETE' });
      fetchTemplates();
      toast.success("Modelo removido");
    } catch (e) {
      toast.error("Erro ao excluir");
    }
  };

  return (
    <main className="content h-screen bg-gray-50 dark:bg-gray-900 p-6 flex flex-col overflow-hidden">

      {}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-pink-100 dark:bg-pink-900/30 rounded-lg text-pink-600 dark:text-pink-400">
          <LayoutTemplate size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">Modelos de Mensagem (HSM)</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Crie mensagens padronizadas com botões interativos.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">

        {}
        <div className="lg:col-span-5 flex flex-col gap-6 overflow-y-auto pr-2">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100 dark:border-gray-700">
              <Plus className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Novo Modelo</h2>
            </div>

            <div className="space-y-5">
              {}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Identificador Interno</label>
                <input
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  placeholder="Ex: Menu Principal"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              {}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Corpo da Mensagem</label>
                <div className="relative">
                  <textarea
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none h-32 dark:text-white"
                    placeholder="Olá {nome}, como podemos ajudar hoje?"
                    value={text}
                    onChange={e => setText(e.target.value)}
                  />
                  <MessageSquare size={16} className="absolute bottom-3 right-3 text-gray-400" />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-100 dark:border-blue-800/30">
                  <span className="font-bold text-blue-600">DICA:</span> Use <code>{`{variavel}`}</code> para personalizar o texto dinamicamente.
                </div>
              </div>

              {}
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-3">
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">BOTÕES ({buttons.length})</label>
                  <button
                    onClick={handleAddButton}
                    className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    <Plus size={14} /> Adicionar
                  </button>
                </div>

                {buttons.length === 0 ? (
                  <div className="text-center py-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                    <MousePointer2 className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                    <span className="text-xs text-gray-400">Nenhum botão configurado</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {buttons.map((btn, index) => (
                      <div key={btn.id} className="flex gap-2 items-center">
                        <div className="flex-1 relative">
                          <MousePointer2 size={14} className="absolute left-3 top-3 text-gray-400" />
                          <input
                            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md text-sm focus:border-blue-500 outline-none dark:text-white"
                            placeholder={`Opção ${index + 1}`}
                            value={btn.label}
                            onChange={e => updateButtonLabel(index, e.target.value)}
                          />
                        </div>
                        <button
                          onClick={() => handleRemoveButton(btn.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleSave}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm"
              >
                <Save size={18} /> Salvar Modelo
              </button>
            </div>
          </div>
        </div>

        {}
        <div className="lg:col-span-7 flex flex-col min-h-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Modelos Disponíveis</h3>
            <span className="text-xs text-gray-500 bg-white dark:bg-gray-700 px-2 py-1 rounded border border-gray-200 dark:border-gray-600">
              Total: {templates.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {loading ? (
              <div className="flex justify-center p-10"><div className="w-8 h-8 border-4 border-blue-500 rounded-full animate-spin border-t-transparent"></div></div>
            ) : templates.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3 opacity-60">
                <FileText size={48} />
                <p>Nenhum modelo criado ainda.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map(t => (
                  <div key={t.id} className="group relative bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:shadow-md transition-all hover:border-blue-300 dark:hover:border-blue-700">

                    {}
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-start bg-white dark:bg-gray-800">
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white text-sm">{t.name}</h4>
                        <span className="text-[10px] text-gray-400 font-mono">ID: {t.id}</span>
                      </div>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {}
                    <div className="p-4 space-y-3">
                      <div className="bg-white dark:bg-gray-600 p-3 rounded-lg rounded-tl-sm text-sm text-gray-700 dark:text-gray-200 shadow-sm border border-gray-100 dark:border-gray-500 relative">
                        {t.text}
                        {}
                        <div className="absolute -left-1.5 top-0 w-3 h-3 bg-white dark:bg-gray-600 border-l border-b border-gray-100 dark:border-gray-500 transform rotate-45"></div>
                      </div>

                      {t.buttons && t.buttons.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {t.buttons.map((b, i) => (
                            <span key={i} className="px-3 py-1 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 text-xs font-medium rounded-full shadow-sm">
                              {b.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  );
};

export default TemplateManager;