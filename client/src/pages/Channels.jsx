import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { Bot, Save, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTenant } from '../context/TenantContext';

const defaultTelegram = {
  enabled: false,
  botToken: '',
  flowId: '',
  usePolling: true,
  webhookUrl: '',
  webhookSecret: ''
};

const defaultWhatsApp = {
  enabled: false,
  accessToken: '',
  phoneNumberId: '',
  wabaId: '',
  flowId: '',
  webhookVerifyToken: '',
  appSecret: ''
};

const Channels = () => {
  const { tenant, loading: tenantLoading } = useTenant();
  const { tenantId: routeTenantId } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [telegram, setTelegram] = useState(defaultTelegram);
  const [whatsapp, setWhatsapp] = useState(defaultWhatsApp);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [agentVars, setAgentVars] = useState([]);
  const [newVar, setNewVar] = useState('');
  const [webhookResult, setWebhookResult] = useState(null);

  const tenantId = routeTenantId || (tenant && tenant.id !== 'super_admin' ? tenant.id : null);
  const baseEndpoint = tenantId ? `/channels?tenantId=${tenantId}` : '/channels';
  const saveEndpoint = tenantId ? `/channels/telegram?tenantId=${tenantId}` : '/channels/telegram';
  const saveWhatsAppEndpoint = tenantId ? `/channels/whatsapp?tenantId=${tenantId}` : '/channels/whatsapp';
  const settingsEndpoint = tenantId ? `/tenants/${tenantId}/settings` : null;
  const webhookEndpoint = tenantId ? `/channels/telegram/webhook?tenantId=${tenantId}` : '/channels/telegram/webhook';

  const loadConfig = async () => {
    try {
      setLoading(true);
      const res = await apiRequest(baseEndpoint);
      if (res && res.ok) {
        const data = await res.json();
        setTelegram({
          ...defaultTelegram,
          ...(data.telegram || {})
        });
        setWhatsapp({
          ...defaultWhatsApp,
          ...(data.whatsapp || {})
        });
        const telegramUpdated = data?.telegram?.updatedAt ? new Date(data.telegram.updatedAt) : null;
        const whatsappUpdated = data?.whatsapp?.updatedAt ? new Date(data.whatsapp.updatedAt) : null;
        const latest = telegramUpdated && whatsappUpdated
          ? new Date(Math.max(telegramUpdated.getTime(), whatsappUpdated.getTime()))
          : (telegramUpdated || whatsappUpdated);
        setLastSavedAt(latest ? latest.toISOString() : null);
      }
      if (settingsEndpoint) {
        const settingsRes = await apiRequest(settingsEndpoint);
        if (settingsRes && settingsRes.ok) {
          const settings = await settingsRes.json();
          setAgentVars(settings.agentViewVars || []);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar canais:', error);
      toast.error('Falha ao carregar canais');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantLoading && !routeTenantId) return;
    if (!tenantId) return;
    loadConfig();
  }, [tenantId, tenantLoading, routeTenantId]);

  const handleSave = async () => {
    try {
      setSaving(true);
      if (!tenantId) {
        toast.error('Selecione um tenant antes de salvar.');
        return;
      }
      const res = await apiRequest(saveEndpoint, {
        method: 'PUT',
        body: JSON.stringify(telegram)
      });
      if (res && res.ok) {
        const data = await res.json();
        setTelegram({
          ...defaultTelegram,
          ...(data.telegram || {})
        });
        setLastSavedAt(data?.telegram?.updatedAt || null);
        toast.success('Canal Telegram atualizado');
      } else {
        toast.error('Falha ao salvar');
      }
    } catch (error) {
      console.error('Erro ao salvar canais:', error);
      toast.error('Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWhatsApp = async () => {
    try {
      setSaving(true);
      if (!tenantId) {
        toast.error('Selecione um tenant antes de salvar.');
        return;
      }
      const res = await apiRequest(saveWhatsAppEndpoint, {
        method: 'PUT',
        body: JSON.stringify(whatsapp)
      });
      if (res && res.ok) {
        const data = await res.json();
        setWhatsapp({
          ...defaultWhatsApp,
          ...(data.whatsapp || {})
        });
        setLastSavedAt(data?.whatsapp?.updatedAt || null);
        toast.success('Canal WhatsApp atualizado');
      } else {
        toast.error('Falha ao salvar');
      }
    } catch (error) {
      console.error('Erro ao salvar WhatsApp:', error);
      toast.error('Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleAddVar = () => {
    const value = newVar.trim();
    if (!value) return;
    if (agentVars.includes(value)) {
      setNewVar('');
      return;
    }
    setAgentVars([...agentVars, value]);
    setNewVar('');
  };

  const handleRemoveVar = (value) => {
    setAgentVars(agentVars.filter((v) => v !== value));
  };

  const handleSaveSettings = async () => {
    if (!settingsEndpoint) {
      toast.error('Selecione um tenant antes de salvar.');
      return;
    }
    try {
      setSavingSettings(true);
      const res = await apiRequest(settingsEndpoint, {
        method: 'PUT',
        body: JSON.stringify({ agentViewVars: agentVars })
      });
      if (res && res.ok) {
        const settings = await res.json();
        setAgentVars(settings.agentViewVars || []);
        toast.success('Configura��o salva');
      } else {
        toast.error('Falha ao salvar');
      }
    } catch (error) {
      console.error('Erro ao salvar configura��es:', error);
      toast.error('Falha ao salvar');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleWebhook = async () => {
    if (!telegram.webhookUrl) {
      toast.error('Informe a Webhook URL.');
      return;
    }
    try {
      setSaving(true);
      const res = await apiRequest(webhookEndpoint, { method: 'POST' });
      if (res && res.ok) {
        const data = await res.json();
        setWebhookResult(data);
        toast.success('Webhook configurado');
      } else {
        toast.error('Falha ao configurar webhook');
      }
    } catch (error) {
      console.error(error);
      toast.error('Falha ao configurar webhook');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="content min-h-screen bg-gray-50 dark:bg-gray-900 p-3 sm:p-4 lg:p-6 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
          <MessageSquare size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">Canais de Atendimento</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Configure bots e integra��es por tenant.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 flex-1 min-h-0">
        <div className="lg:col-span-7 flex flex-col gap-6 overflow-y-auto lg:pr-2">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-gray-700">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                <Bot size={18} />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Telegram</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Token do BotFather e fluxo publicado.</p>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-blue-600"
                  checked={telegram.enabled}
                  onChange={(e) => setTelegram({ ...telegram, enabled: e.target.checked })}
                />
                Ativo
              </label>
            </div>

            {loading ? (
              <div className="text-sm text-gray-400">Carregando...</div>
            ) : (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Bot Token</label>
                  <input
                    type="password"
                    className="mt-2 w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={telegram.botToken || ''}
                    onChange={(e) => setTelegram({ ...telegram, botToken: e.target.value })}
                    placeholder="123456:ABC..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Flow ID</label>
                    <input
                      className="mt-2 w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      value={telegram.flowId || ''}
                      onChange={(e) => setTelegram({ ...telegram, flowId: e.target.value })}
                      placeholder="flow_123..."
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-6 md:mt-0">
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-blue-600"
                        checked={telegram.usePolling}
                        onChange={(e) => setTelegram({ ...telegram, usePolling: e.target.checked })}
                      />
                      Usar Polling
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                      Webhook URL (opcional)
                    </label>
                    <input
                      className="mt-2 w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      value={telegram.webhookUrl || ''}
                      onChange={(e) => setTelegram({ ...telegram, webhookUrl: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                      Webhook Secret
                    </label>
                    <input
                      className="mt-2 w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      value={telegram.webhookSecret || ''}
                      onChange={(e) => setTelegram({ ...telegram, webhookSecret: e.target.value })}
                      placeholder="segredo opcional"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <span className="text-[10px] text-gray-400">Webhook aplica no bot configurado acima.</span>
                  <button
                    type="button"
                    onClick={handleWebhook}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    Ativar Webhook
                  </button>
                </div>
                {webhookResult && (
                  <div className="text-[11px] text-gray-500">
                    {webhookResult.ok ? 'Webhook configurado.' : 'Falha ao configurar webhook.'}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 w-full sm:w-auto justify-center"
              >
                <Save size={16} />
                {saving ? 'Salvando...' : 'Salvar Telegram'}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-gray-700">
              <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                <MessageSquare size={18} />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">WhatsApp</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cloud API (mensagens inbound).</p>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-emerald-600"
                  checked={whatsapp.enabled}
                  onChange={(e) => setWhatsapp({ ...whatsapp, enabled: e.target.checked })}
                />
                Ativo
              </label>
            </div>

            {loading ? (
              <div className="text-sm text-gray-400">Carregando...</div>
            ) : (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Access Token</label>
                  <input
                    type="password"
                    className="mt-2 w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={whatsapp.accessToken || ''}
                    onChange={(e) => setWhatsapp({ ...whatsapp, accessToken: e.target.value })}
                    placeholder="EAAG..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Phone Number ID</label>
                    <input
                      className="mt-2 w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={whatsapp.phoneNumberId || ''}
                      onChange={(e) => setWhatsapp({ ...whatsapp, phoneNumberId: e.target.value })}
                      placeholder="1234567890"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">WABA ID (opcional)</label>
                    <input
                      className="mt-2 w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={whatsapp.wabaId || ''}
                      onChange={(e) => setWhatsapp({ ...whatsapp, wabaId: e.target.value })}
                      placeholder="9876543210"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Flow ID</label>
                  <input
                    className="mt-2 w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={whatsapp.flowId || ''}
                    onChange={(e) => setWhatsapp({ ...whatsapp, flowId: e.target.value })}
                    placeholder="flow_123..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Webhook Verify Token</label>
                    <input
                      className="mt-2 w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={whatsapp.webhookVerifyToken || ''}
                      onChange={(e) => setWhatsapp({ ...whatsapp, webhookVerifyToken: e.target.value })}
                      placeholder="defina_no_meta"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">App Secret (opcional)</label>
                    <input
                      type="password"
                      className="mt-2 w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={whatsapp.appSecret || ''}
                      onChange={(e) => setWhatsapp({ ...whatsapp, appSecret: e.target.value })}
                      placeholder="app_secret"
                    />
                  </div>
                </div>

                <div className="text-[11px] text-gray-500">
                  Configure o webhook no painel da Meta apontando para `/api/whatsapp/webhook?tenantId=...`.
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveWhatsApp}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 w-full sm:w-auto justify-center"
              >
                <Save size={16} />
                {saving ? 'Salvando...' : 'Salvar WhatsApp'}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Canais configurados</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">Telegram</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {telegram.enabled ? 'Ativo' : 'Inativo'} � {telegram.botToken ? 'Token definido' : 'Sem token'}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${telegram.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {telegram.enabled ? 'ON' : 'OFF'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">WhatsApp</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {whatsapp.enabled ? 'Ativo' : 'Inativo'} � {whatsapp.phoneNumberId ? 'N�mero definido' : 'Sem n�mero'}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${whatsapp.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {whatsapp.enabled ? 'ON' : 'OFF'}
                </span>
              </div>
              <div className="text-xs text-gray-400">
                �ltima atualiza��o: {lastSavedAt ? new Date(lastSavedAt).toLocaleString('pt-BR') : '�'}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Vari�veis no atendimento</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Defina quais vari�veis do fluxo ser�o exibidas para o agente.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white"
                value={newVar}
                onChange={(e) => setNewVar(e.target.value)}
                placeholder="Ex: cpf, nome_cliente, plano"
              />
              <button
                type="button"
                onClick={handleAddVar}
                className="px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold w-full sm:w-auto"
              >
                Adicionar
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {agentVars.length === 0 ? (
                <span className="text-xs text-gray-400">Sem vari�veis configuradas.</span>
              ) : (
                agentVars.map((value) => (
                  <span key={value} className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs">
                    {value}
                    <button
                      type="button"
                      onClick={() => handleRemoveVar(value)}
                      className="text-blue-700 hover:text-blue-900"
                    >
                      �
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 w-full sm:w-auto justify-center"
              >
                <Save size={16} />
                {savingSettings ? 'Salvando...' : 'Salvar Vari�veis'}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Outros canais</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Estrutura pronta para adicionar Instagram e outros canais.
            </p>
            <div className="mt-4 text-xs text-gray-400">
              Em breve.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Channels;
