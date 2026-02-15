import adapter from '../../db/DatabaseAdapter.js';
import { createLog } from './logs.js';

let changeStream = null;

const safeStringifyId = (id) => {
  if (!id) return null;
  try {
    return typeof id === 'object' ? JSON.parse(JSON.stringify(id)) : id;
  } catch (err) {
    return String(id);
  }
};

export const startDbChangeLogger = async () => {
  try {
    if (!adapter.db) await adapter.init();
    const db = adapter.db;
    if (!db || typeof db.watch !== 'function') {
      console.warn('[DB] Change streams nÃ£o disponÃ­veis para logging.');
      return;
    }

    const pipeline = [
      { $match: { 'ns.coll': { $ne: 'systemLogs' } } }
    ];

    changeStream = db.watch(pipeline, { fullDocument: 'updateLookup' });

    changeStream.on('change', async (change) => {
      try {
        const { operationType, ns, documentKey, fullDocument, updateDescription } = change || {};
        const payload = {
          collection: ns?.coll || 'unknown',
          operation: operationType || 'unknown',
          documentKey: safeStringifyId(documentKey?._id || documentKey),
          tenantId: fullDocument?.tenantId || null,
          updatedFields: updateDescription?.updatedFields || null,
          removedFields: updateDescription?.removedFields || null,
          document: fullDocument || null
        };

        await createLog(`DB_${String(operationType || 'CHANGE').toUpperCase()}`, payload, 'system');
      } catch (err) {
        console.error('[DB] Erro ao processar change stream:', err);
      }
    });

    changeStream.on('error', (err) => {
      console.error('[DB] Change stream error:', err);
    });

    console.log('âœ… DB change logger ativo');
  } catch (error) {
    console.warn('[DB] Logging via change stream indisponÃ­vel:', error.message || error);
  }
};

export const stopDbChangeLogger = async () => {
  if (changeStream) {
    try {
      await changeStream.close();
    } catch (err) {
      console.error('[DB] Erro ao encerrar change stream:', err);
    } finally {
      changeStream = null;
    }
  }
};
