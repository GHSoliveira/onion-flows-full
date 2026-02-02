import React from 'react';
import Login from './pages/Login';
import FlowList from './pages/FlowList';
import VariableManager from './pages/VariableManager';
import TemplateManager from './pages/TemplateManager';
import ChatSimulator from './pages/ChatSimulator';
import AgentManager from './pages/AgentManager';
import ScheduleManager from './pages/ScheduleManager';
import SystemLogs from './pages/SystemLogs';
import MonitoringDashboard from './pages/MonitoringDashboard';

const FlowEditor = React.lazy(() => import('./pages/FlowEditor'));
const AgentWorkspace = React.lazy(() => import('./pages/AgentWorkspace'));

export {
  Login,
  FlowList,
  VariableManager,
  TemplateManager,
  ChatSimulator,
  AgentManager,
  ScheduleManager,
  SystemLogs,
  MonitoringDashboard,
  FlowEditor,
  AgentWorkspace,
};
