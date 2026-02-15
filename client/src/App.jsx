import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Routes, Route, NavLink, Navigate, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { TenantProvider, useTenant } from './context/TenantContext';
import Login from './pages/Login';


const FlowList = lazy(() => import('./pages/FlowList'));
const FlowEditor = lazy(() => import('./pages/FlowEditor'));
const VariableManager = lazy(() => import('./pages/VariableManager'));
const TemplateManager = lazy(() => import('./pages/TemplateManager'));
const ChatSimulator = lazy(() => import('./pages/ChatSimulator'));
const AgentManager = lazy(() => import('./pages/AgentManager'));
const AgentWorkspace = lazy(() => import('./pages/AgentWorkspace'));
const ScheduleManager = lazy(() => import('./pages/ScheduleManager'));
const MonitoringDashboard = lazy(() => import('./pages/MonitoringDashboard'));
const SystemLogs = lazy(() => import('./pages/SystemLogs'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'));


import {
  LayoutDashboard, Workflow, Users, FileText, Database,
  CalendarClock, MessageSquare, Headset, LogOut, Bot,
  Activity, ScrollText, Moon, Sun, Bell, Menu, X, Building2
} from 'lucide-react';

const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-full">
    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
  </div>
);


const TenantIndexRedirect = () => {
  const { tenantId } = useParams();
  return <Navigate to={`/tenant/${tenantId}/monitor`} replace />;
};

const AppContent = () => {
  const { user, logout } = useAuth();
  const { tenant } = useTenant();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  const NavItem = ({ to, icon: Icon, label }) => (
    <NavLink
      to={to}
      onClick={() => setSidebarOpen(false)}
      className={({ isActive }) => `
        flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
        ${isActive
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
      `}
    >
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  );

  return (
    <div className={`flex h-screen w-full bg-gray-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors duration-300`}>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
  fixed lg:static inset-y-0 left-0 z-50 w-64
  bg-white dark:bg-slate-900
  border-r border-gray-200 dark:border-slate-800
  flex flex-col transition-transform duration-300 ease-in-out
  ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 w-fit'}
`}>
        <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Bot className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">FluxAdmin</h1>
            <p className="text-[10px] text-slate-500 font-medium tracking-wide">Em desenvolvimento</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-slate-800/50">
          <div className="flex items-center w-fit gap-3 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-slate-800/50 p-3 rounded-xl border border-gray-200 dark:border-slate-700/50">
              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user.name}</div>
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{user.role}</div>

            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {user.role === 'AGENT' && (
            <NavItem to="/agent" icon={Headset} label="Meu Atendimento" />
          )}

          {user.role === 'SUPER_ADMIN' && (
            <>
              <div className="px-3 mt-4 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Administração</div>
              <NavItem to="/super-admin" icon={LayoutDashboard} label="Dashboard Geral" onClick={() => {
                const raw = localStorage.getItem("selectedTenant");

                if (!raw) return;

                const tenant = JSON.parse(raw);

                if (tenant?.id !== "super_admin") {
                  localStorage.removeItem("selectedTenant");
                }
              }} />
              <NavItem to="/admin" icon={Building2} label="Tenants" />
              <NavItem to="/system-logs" icon={ScrollText} label="Logs Globais" />

              {}
              {tenant && tenant.id !== 'super_admin' && (
                <>
                  <div className="px-3 mt-6 mb-2 text-[10px] font-bold text-blue-500 uppercase tracking-wider">
                    {tenant.name}
                  </div>
                  <NavItem to={`/tenant/${tenant.id}/monitor`} icon={Activity} label="Monitoramento" />
                  <NavItem to={`/tenant/${tenant.id}/flows`} icon={Workflow} label="Fluxos" />
                  <NavItem to={`/tenant/${tenant.id}/users`} icon={Users} label="Equipe" />
                  <NavItem to={`/tenant/${tenant.id}/templates`} icon={FileText} label="Templates" />
                  <NavItem to={`/tenant/${tenant.id}/variables`} icon={Database} label="Variáveis" />
                </>
              )}
            </>
          )}

          {(user.role === 'ADMIN' || user.role === 'MANAGER') && (
            <>
              <div className="px-3 mt-4 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Operação</div>
              <NavItem to="/monitor" icon={Activity} label="Monitoramento" />
              <NavItem to="/system-logs" icon={ScrollText} label="Logs de Auditoria" />

              <div className="px-3 mt-6 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fluxos</div>
              <NavItem to="/flows" icon={Workflow} label="Fluxos de Conversa" />
              <NavItem to="/templates" icon={FileText} label="Templates (HSM)" />
              <NavItem to="/variables" icon={Database} label="Variáveis" />
            </>
          )}

          {user.role === 'ADMIN' && (
            <>
              <div className="px-3 mt-6 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sistema</div>
              <NavItem to="/users" icon={Users} label="Gestão de Equipe" />
              <NavItem to="/schedules" icon={CalendarClock} label="Expediente" />
              <NavItem to="/simulator" icon={MessageSquare} label="Simulador Bot" />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={logout}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
          >
            <LogOut size={16} /> Sair do Sistema
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-4 lg:px-8 shadow-sm z-20">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
            <Menu size={24} />
          </button>

          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2.5 rounded-full text-slate-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2.5 rounded-full text-slate-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors relative"
              >
                <Bell size={20} />
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-12 w-80 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-50 p-4 text-sm text-gray-500">
                  Nenhuma notificação nova.
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-slate-900 p-4 lg:p-8 relative scroll-smooth">
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/" element={user.role === 'AGENT' ? <Navigate to="/agent" /> : user.role === 'SUPER_ADMIN' ? <Navigate to="/super-admin" /> : <Navigate to="/monitor" />} />
              <Route path="/super-admin" element={<SuperAdminDashboard />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/monitor" element={<MonitoringDashboard />} />
              <Route path="/system-logs" element={<SystemLogs />} />
              <Route path="/flows" element={<FlowList />} />
              <Route path="/editor/:id" element={<FlowEditor />} />
              <Route path="/agent" element={<AgentWorkspace />} />
              <Route path="/users" element={<AgentManager />} />
              <Route path="/templates" element={<TemplateManager />} />
              <Route path="/variables" element={<VariableManager />} />
              <Route path="/schedules" element={<ScheduleManager />} />
              <Route path="/simulator" element={<ChatSimulator />} />

              {}
              <Route path="/tenant/:tenantId">
                <Route index element={<TenantIndexRedirect />} />
                <Route path="monitor" element={<MonitoringDashboard />} />
                <Route path="flows" element={<FlowList />} />
                <Route path="editor/:id" element={<FlowEditor />} />
                <Route path="users" element={<AgentManager />} />
                <Route path="templates" element={<TemplateManager />} />
                <Route path="variables" element={<VariableManager />} />
                <Route path="schedules" element={<ScheduleManager />} />
              </Route>

              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
};

const App = () => {
  return (
    <TenantProvider>
      <AppContent />
    </TenantProvider>
  );
};

export default App;