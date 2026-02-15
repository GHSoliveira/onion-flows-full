import adapter from '../../db/DatabaseAdapter.js';
import { MAX_LOGS } from '../config/constants.js';

let io = null;
let logMaintenanceRunning = false;
let writesSinceMaintenance = 0;
let hasInitializedLogIndex = false;

export const setIo = (socketIo) => {
  io = socketIo;
};

export const getIo = () => io;

const runLogMaintenance = async (collection) => {
  if (logMaintenanceRunning) return;
  logMaintenanceRunning = true;

  try {
    const total = await collection.countDocuments();
    const overflow = total - MAX_LOGS;
    if (overflow <= 0) return;

    const oldLogs = await collection
      .find({}, { projection: { id: 1 } })
      .sort({ timestamp: 1 })
      .limit(overflow)
      .toArray();

    if (!oldLogs.length) return;
    const ids = oldLogs.map((l) => l.id).filter(Boolean);
    if (ids.length) {
      await collection.deleteMany({ id: { $in: ids } });
    }
  } catch (error) {
    console.error('Erro na manutencao de logs:', error.message || error);
  } finally {
    logMaintenanceRunning = false;
  }
};

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
    if (!adapter.db) await adapter.init();
    const collection = adapter.db.collection('systemLogs');

    if (!hasInitializedLogIndex) {
      hasInitializedLogIndex = true;
      collection.createIndex({ timestamp: -1 }).catch(() => {});
      collection.createIndex({ id: 1 }, { unique: true }).catch(() => {});
    }

    await collection.insertOne(newLog);
    console.log(`[LOG] ${type}: ${logMessage}`);

    if (io) {
      io.emit('new_log', newLog);
    }

    writesSinceMaintenance += 1;
    if (writesSinceMaintenance >= 50) {
      writesSinceMaintenance = 0;
      runLogMaintenance(collection).catch(() => {});
    }
  } catch (error) {
    console.error('Erro ao criar log:', error);
  }
};
