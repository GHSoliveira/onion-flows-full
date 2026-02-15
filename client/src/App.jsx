import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Routes, Route, NavLink, Navigate, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { TenantProvider, useTenant } from './context/TenantContext';
import { apiRequest } from './services/api';
import { socketService } from './services/socket';
import Login from './pages/Login';
import {
  LayoutDashboard, Workflow, Users, FileText, Database,
  CalendarClock, MessageSquare, Headset, LogOut, Bot,
  Activity, ScrollText, Moon, Sun, Bell, Menu, X, Building2
} from 'lucide-react';


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
const Channels = lazy(() => import('./pages/Channels'));

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
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);
  const lastQueueCountRef = useRef(0);

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

  const addNotification = (data) => {
    const entry = {
      id: `n_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      title: data.title,
      message: data.message,
      type: data.type,
      action: data.action || null,
      createdAt: new Date().toISOString(),
      read: false
    };
    setNotifications(prev => [entry, ...prev].slice(0, 50));
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (token) socketService.connect(token);

    const onQueueUpdate = (payload) => {
      if (user.role !== 'AGENT') return;
      const chat = payload?.chat || payload;
      const queueName = chat?.queue || chat?.transferredTo || 'Fila';
      addNotification({
        type: 'queue',
        title: 'Novo cliente na fila',
        message: `Chegou um cliente na fila ${queueName}.`,
        action: '/agent'
      });
    };

    const onNewLog = (payload) => {
      if (user.role === 'AGENT') return;
      const log = payload?.log || payload;
      const type = String(log?.type || '');
      if (type !== 'ERROR') return;
      addNotification({
        type: 'error',
        title: 'Erro crítico detectado',
        message: log?.message ? String(log.message).slice(0, 140) : 'Verifique os logs do sistema.',
        action: '/system-logs'
      });
    };

    socketService.on('queue_update', onQueueUpdate);
    socketService.on('new_log', onNewLog);

    return () => {
      socketService.off('queue_update', onQueueUpdate);
      socketService.off('new_log', onNewLog);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const prefetches = [];

    if (user.role === 'SUPER_ADMIN') {
      prefetches.push(
        () => import('./pages/SuperAdminDashboard'),
        () => import('./pages/AdminPanel'),
        () => import('./pages/SystemLogs'),
        () => import('./pages/MonitoringDashboard')
      );
    } else if (user.role === 'ADMIN' || user.role === 'MANAGER') {
      prefetches.push(
        () => import('./pages/MonitoringDashboard'),
        () => import('./pages/FlowList'),
        () => import('./pages/TemplateManager'),
        () => import('./pages/VariableManager'),
        () => import('./pages/Channels'),
        () => import('./pages/AgentManager'),
        () => import('./pages/ScheduleManager')
      );
    } else if (user.role === 'AGENT') {
      prefetches.push(
        () => import('./pages/AgentWorkspace'),
        () => import('./pages/ChatSimulator')
      );
    }

    const run = () => {
      prefetches.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          // ignore prefetch errors
        }
      });
    };

    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }

    const timer = setTimeout(run, 1500);
    return () => clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'SUPER_ADMIN') return;

    let active = true;
    const checkQueues = async () => {
      try {
        if (user.role === 'AGENT') {
          const res = await apiRequest('/chats/my-queues');
          if (res && res.ok && active) {
            const data = await res.json();
            const waiting = Array.isArray(data?.waiting) ? data.waiting.length : 0;
            if (waiting > lastQueueCountRef.current) {
              addNotification({
                type: 'queue',
                title: 'Clientes aguardando',
                message: `${waiting} cliente(s) aguardando na fila.`,
                action: '/agent'
              });
            }
            lastQueueCountRef.current = waiting;
          }
          return;
        }

        const res = await apiRequest('/chats?limit=200&page=1');
        if (res && res.ok && active) {
          const chatPayload = await res.json();
          const chatList = Array.isArray(chatPayload) ? chatPayload : (chatPayload?.items || []);
          const waiting = Array.isArray(chatList) ? chatList.filter(c => c.status === 'waiting').length : 0;
          if (waiting > lastQueueCountRef.current) {
            addNotification({
              type: 'queue',
              title: 'Fila com pendências',
              message: `${waiting} atendimento(s) aguardando agente.`,
              action: '/monitor'
            });
          }
          lastQueueCountRef.current = waiting;
        }
      } catch (e) {}
    };

    checkQueues();
    const interval = setInterval(checkQueues, 20000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user, tenant]);

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
            <img src="/Onion_logo_root.png" width={"30px"} alt="Onion Flows" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">Onion Flows</h1>
            <p className="text-[10px] text-slate-500 font-medium tracking-wide">Em desenvolvimento</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-slate-800/50">
          <div className="flex items-center w-full gap-3 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-slate-800/50 p-3 rounded-xl border border-gray-200 dark:border-slate-700/50 min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user.name}</div>
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider shrink-0">{user.role}</div>

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

              { }
              {tenant && tenant.id !== 'super_admin' && (
                <>
                  <div className="px-3 mt-6 mb-2 text-[10px] font-bold text-blue-500 uppercase tracking-wider">
                    {tenant.name}
                  </div>
                  <NavItem to={`/tenant/${tenant.id}/monitor`} icon={Activity} label="Monitoramento" />
                  <NavItem to={`/tenant/${tenant.id}/flows`} icon={Workflow} label="Fluxos" />
                  <NavItem to={`/tenant/${tenant.id}/users`} icon={Users} label="Equipe" />
                  <NavItem to={`/tenant/${tenant.id}/templates`} icon={FileText} label="Templates" />
                  <NavItem to={`/tenant/${tenant.id}/schedules`} icon={CalendarClock} label="Expediente" />
                  <NavItem to={`/tenant/${tenant.id}/variables`} icon={Database} label="Variáveis" />
                  <NavItem to={`/tenant/${tenant.id}/channels`} icon={Bot} label="Canais" />
                </>
              )}
            </>
          )}

          {(user.role === 'ADMIN' || user.role === 'MANAGER') && (
            <>
              <div className="px-3 mt-4 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Operação</div>
              <NavItem to="/monitor" icon={Activity} label="Monitoramento" />
              <NavItem to="/channels" icon={Bot} label="Canais" />

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
                onClick={() => {
                  const next = !showNotifications;
                  setShowNotifications(next);
                  if (next) markAllRead();
                }}
                className="p-2.5 rounded-full text-slate-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors relative"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-12 w-80 max-w-[90vw] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-50 p-3 text-sm text-gray-600 dark:text-gray-300">
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center text-xs text-gray-500">Nenhuma notificação nova.</div>
                  ) : (
                    <div className="space-y-2 max-h-[360px] overflow-y-auto">
                      {notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => {
                            if (n.action) navigate(n.action);
                            setShowNotifications(false);
                          }}
                          className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                            n.read ? 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700' : 'bg-blue-50/60 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-semibold text-gray-800 dark:text-gray-100">{n.title}</div>
                            <div className="text-[10px] text-gray-400 whitespace-nowrap">
                              {new Date(n.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{n.message}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-slate-900 p-3 sm:p-4 lg:p-8 relative scroll-smooth">
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
              <Route path="/channels" element={<Channels />} />

              { }
              <Route path="/tenant/:tenantId">
                <Route index element={<TenantIndexRedirect />} />
                <Route path="monitor" element={<MonitoringDashboard />} />
                <Route path="flows" element={<FlowList />} />
                <Route path="editor/:id" element={<FlowEditor />} />
                <Route path="users" element={<AgentManager />} />
                <Route path="templates" element={<TemplateManager />} />
                <Route path="variables" element={<VariableManager />} />
                <Route path="schedules" element={<ScheduleManager />} />
                <Route path="channels" element={<Channels />} />
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

