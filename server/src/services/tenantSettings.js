import adapter from '../../db/DatabaseAdapter.js';

const normalizeList = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => String(item || '').trim())
    .filter((item) => item.length);
};

export const getTenantSettings = async (tenantId) => {
  if (!tenantId) return null;
  const all = await adapter.getCollection('tenantSettings');
  return all.find((settings) => settings.tenantId === tenantId) || null;
};

export const saveTenantSettings = async (tenantId, payload) => {
  if (!tenantId) return null;
  const all = await adapter.getCollection('tenantSettings');
  const now = new Date().toISOString();
  const index = all.findIndex((settings) => settings.tenantId === tenantId);
  const next = {
    agentViewVars: normalizeList(payload?.agentViewVars || []),
    updatedAt: now
  };

  if (index === -1) {
    all.push({
      id: `settings_${tenantId}`,
      tenantId,
      ...next,
      createdAt: now
    });
  } else {
    all[index] = {
      ...all[index],
      ...next,
      updatedAt: now
    };
  }

  await adapter.saveCollection('tenantSettings', all);
  return all.find((settings) => settings.tenantId === tenantId) || null;
};
