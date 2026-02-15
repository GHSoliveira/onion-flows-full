import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { useTenant } from '../context/TenantContext';
import { Building2, Users, Workflow, MessageSquare, Activity, CreditCard, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function SuperAdminDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const { switchTenant } = useTenant();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await apiRequest('/super-admin/dashboard');
      if (res && res.ok) {
        const data = await res.json();
        setMetrics(data);
      } else {
        toast.error('Erro ao carregar dashboard');
      }
    } catch (error) {
      toast.error('Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleAccessTenant = async (tenantId) => {
    const tenant = metrics?.billing?.find(t => t.tenantId === tenantId);
    if (tenant) {
      await switchTenant(tenantId);
      navigate(`/tenant/${tenantId}/monitor`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Erro ao carregar dashboard do super admin. Verifique se o endpoint está funcionando.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto dark:bg-slate-900">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Dashboard Geral</h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8">Visão geral de todos os tenants</p>

      {}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          icon={Building2}
          label="Total de Tenants"
          value={metrics.tenants?.total || 0}
          subtext={`${metrics.tenants?.ativos || 0} ativos`}
          color="blue"
        />
        <MetricCard
          icon={Users}
          label="Total de Usuários"
          value={metrics.usuarios?.total || 0}
          subtext="Em todos os tenants"
          color="green"
        />
        <MetricCard
          icon={Workflow}
          label="Total de Flows"
          value={metrics.flows?.total || 0}
          subtext="Fluxos criados"
          color="purple"
        />
        <MetricCard
          icon={MessageSquare}
          label="Chats Ativos"
          value={metrics.chats?.total || 0}
          subtext="Conversas em andamento"
          color="orange"
        />
      </div>

      {}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{metrics.tenants?.ativos || 0}</div>
          <div className="text-sm text-green-700 dark:text-green-300">Tenants Ativos</div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{metrics.tenants?.trial || 0}</div>
          <div className="text-sm text-yellow-700 dark:text-yellow-300">Em Trial</div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{metrics.tenants?.suspensos || 0}</div>
          <div className="text-sm text-red-700 dark:text-red-300">Suspensos</div>
        </div>
      </div>

      {}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <CreditCard size={20} />
            Billing Overview
          </h2>
          <div className="space-y-3">
            {metrics.billing?.map((tenant) => (
              <div key={tenant.tenantId} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <div>
                  <div className="font-medium text-slate-800 dark:text-white">{tenant.name}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">{tenant.plan}</div>
                </div>
                <div className={`px-2 py-1 rounded text-xs font-medium ${
                  tenant.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                  tenant.status === 'trial' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}>
                  {tenant.status}
                </div>
              </div>
            ))}
          </div>
        </div>

        {}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <ArrowRight size={20} />
            Acessar Tenants
          </h2>
          <div className="space-y-3">
            {metrics.billing?.map((tenant) => (
              <div key={tenant.tenantId} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <div>
                  <div className="font-medium text-slate-800 dark:text-white">{tenant.name}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {metrics.usuarios?.porTenant?.find(u => u.tenantId === tenant.tenantId)?.count || 0} usuários
                  </div>
                </div>
                <button
                  onClick={() => handleAccessTenant(tenant.tenantId)}
                  className="px-3 py-1 bg-blue-500 dark:bg-blue-600 text-white rounded text-sm hover:bg-blue-600 dark:hover:bg-blue-500 transition-colors"
                >
                  Acessar
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {}
      <div className="mt-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
          <Activity size={20} />
          Métricas por Tenant
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <th className="pb-3 font-medium">Tenant</th>
                <th className="pb-3 font-medium">Usuários</th>
                <th className="pb-3 font-medium">Flows</th>
                <th className="pb-3 font-medium">Chats</th>
                <th className="pb-3 font-medium">Plano</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {metrics.billing?.map((tenant) => {
                const usuarios = metrics.usuarios?.porTenant?.find(u => u.tenantId === tenant.tenantId)?.count || 0;
                const flows = metrics.flows?.porTenant?.find(f => f.tenantId === tenant.tenantId)?.count || 0;
                const chats = metrics.chats?.porTenant?.find(c => c.tenantId === tenant.tenantId)?.count || 0;

                return (
                  <tr key={tenant.tenantId} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="py-3 font-medium text-slate-800 dark:text-white">{tenant.name}</td>
                    <td className="py-3 text-slate-600 dark:text-slate-300">{usuarios}</td>
                    <td className="py-3 text-slate-600 dark:text-slate-300">{flows}</td>
                    <td className="py-3 text-slate-600 dark:text-slate-300">{chats}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        tenant.plan === 'enterprise' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                        tenant.plan === 'professional' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                        tenant.plan === 'starter' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                        'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}>
                        {tenant.plan}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, subtext, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
      <div className={`w-12 h-12 rounded-lg ${colorClasses[color]} flex items-center justify-center mb-4`}>
        <Icon size={24} />
      </div>
      <div className="text-3xl font-bold text-slate-800 dark:text-white">{value}</div>
      <div className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</div>
      {subtext && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtext}</div>}
    </div>
  );
}
