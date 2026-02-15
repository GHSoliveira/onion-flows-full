import adapter from '../../db/DatabaseAdapter.js';
import { MAX_LOGS } from '../config/constants.js';

let io = null;

export const setIo = (socketIo) => {
  io = socketIo;
};

export const getIo = () => io;

export const createLog = async (type, message, userId = 'system') => {
  const logMessage = typeof message === 'object' ? JSON.stringify(message) : String(message || '');

  const newLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
    type,
    message: logMessage,
    userId
  };

  try {
    let systemLogs = await adapter.getCollection('systemLogs');
    if (!systemLogs) systemLogs = [];

    systemLogs.unshift(newLog);
    if (systemLogs.length > MAX_LOGS) {
      systemLogs = systemLogs.slice(0, MAX_LOGS);
    }

    await adapter.saveCollection('systemLogs', systemLogs);
    console.log(`[LOG] ${type}: ${logMessage}`);

    if (io) {
      io.emit('new_log', newLog);
    }
  } catch (error) {
    console.error('Erro ao criar log:', error);
  }
};
