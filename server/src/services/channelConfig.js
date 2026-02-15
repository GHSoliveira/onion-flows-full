import adapter from '../../db/DatabaseAdapter.js';

const CACHE_TTL_MS = 10000;
let cacheByTenant = new Map();
let cacheAll = null;
let cacheAllAt = 0;

const isFresh = (timestamp) => timestamp && Date.now() - timestamp < CACHE_TTL_MS;

const setCacheEntry = (tenantId, config) => {
  if (!tenantId) return;
  cacheByTenant.set(tenantId, { value: config, at: Date.now() });
  cacheAll = null;
  cacheAllAt = 0;
};

const normalize = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

export const getChannelConfig = async (tenantId) => {
  if (!tenantId) return null;
  const cached = cacheByTenant.get(tenantId);
  if (cached && isFresh(cached.at)) return cached.value || null;

  const all = await adapter.getCollection('channelConfigs');
  const config = all.find((c) => c.tenantId === tenantId) || null;
  setCacheEntry(tenantId, config);
  return config;
};

export const getTelegramConfig = async (tenantId) => {
  const config = await getChannelConfig(tenantId);
  if (!config || !config.telegram) return null;
  return {
    ...config.telegram,
    botToken: normalize(config.telegram.botToken),
    flowId: normalize(config.telegram.flowId),
    webhookUrl: normalize(config.telegram.webhookUrl),
    webhookSecret: normalize(config.telegram.webhookSecret),
    usePolling: config.telegram.usePolling !== false
  };
};

export const getWhatsAppConfig = async (tenantId) => {
  const config = await getChannelConfig(tenantId);
  if (!config || !config.whatsapp) return null;
  return {
    ...config.whatsapp,
    accessToken: normalize(config.whatsapp.accessToken),
    phoneNumberId: normalize(config.whatsapp.phoneNumberId),
    wabaId: normalize(config.whatsapp.wabaId),
    flowId: normalize(config.whatsapp.flowId),
    webhookVerifyToken: normalize(config.whatsapp.webhookVerifyToken),
    appSecret: normalize(config.whatsapp.appSecret),
    enabled: Boolean(config.whatsapp.enabled),
    updatedAt: config.whatsapp.updatedAt
  };
};

export const getAllTelegramConfigs = async () => {
  if (cacheAll && isFresh(cacheAllAt)) {
    return cacheAll.telegram;
  }

  const all = await adapter.getCollection('channelConfigs');
  const telegram = all
    .filter((config) => config.telegram && config.telegram.enabled)
    .map((config) => ({
      tenantId: config.tenantId,
      telegram: {
        ...config.telegram,
        botToken: normalize(config.telegram.botToken),
        flowId: normalize(config.telegram.flowId),
        webhookUrl: normalize(config.telegram.webhookUrl),
        webhookSecret: normalize(config.telegram.webhookSecret),
        usePolling: config.telegram.usePolling !== false
      }
    }))
    .filter((entry) => entry.telegram.botToken);

  const whatsapp = all
    .filter((config) => config.whatsapp && config.whatsapp.enabled)
    .map((config) => ({
      tenantId: config.tenantId,
      whatsapp: {
        ...config.whatsapp,
        accessToken: normalize(config.whatsapp.accessToken),
        phoneNumberId: normalize(config.whatsapp.phoneNumberId),
        wabaId: normalize(config.whatsapp.wabaId),
        flowId: normalize(config.whatsapp.flowId),
        webhookVerifyToken: normalize(config.whatsapp.webhookVerifyToken),
        appSecret: normalize(config.whatsapp.appSecret),
        enabled: Boolean(config.whatsapp.enabled),
        updatedAt: config.whatsapp.updatedAt
      }
    }))
    .filter((entry) => entry.whatsapp.accessToken && entry.whatsapp.phoneNumberId);

  cacheAll = { telegram, whatsapp };
  cacheAllAt = Date.now();
  return telegram;
};

export const getAllWhatsAppConfigs = async () => {
  if (cacheAll && isFresh(cacheAllAt)) {
    return cacheAll.whatsapp;
  }

  const all = await adapter.getCollection('channelConfigs');
  const telegram = all
    .filter((config) => config.telegram && config.telegram.enabled)
    .map((config) => ({
      tenantId: config.tenantId,
      telegram: {
        ...config.telegram,
        botToken: normalize(config.telegram.botToken),
        flowId: normalize(config.telegram.flowId),
        webhookUrl: normalize(config.telegram.webhookUrl),
        webhookSecret: normalize(config.telegram.webhookSecret),
        usePolling: config.telegram.usePolling !== false
      }
    }))
    .filter((entry) => entry.telegram.botToken);

  const whatsapp = all
    .filter((config) => config.whatsapp && config.whatsapp.enabled)
    .map((config) => ({
      tenantId: config.tenantId,
      whatsapp: {
        ...config.whatsapp,
        accessToken: normalize(config.whatsapp.accessToken),
        phoneNumberId: normalize(config.whatsapp.phoneNumberId),
        wabaId: normalize(config.whatsapp.wabaId),
        flowId: normalize(config.whatsapp.flowId),
        webhookVerifyToken: normalize(config.whatsapp.webhookVerifyToken),
        appSecret: normalize(config.whatsapp.appSecret),
        enabled: Boolean(config.whatsapp.enabled),
        updatedAt: config.whatsapp.updatedAt
      }
    }))
    .filter((entry) => entry.whatsapp.accessToken && entry.whatsapp.phoneNumberId);

  cacheAll = { telegram, whatsapp };
  cacheAllAt = Date.now();
  return whatsapp;
};

export const saveTelegramConfig = async (tenantId, telegramConfig) => {
  const all = await adapter.getCollection('channelConfigs');
  const now = new Date().toISOString();
  const index = all.findIndex((config) => config.tenantId === tenantId);
  const payload = {
    enabled: Boolean(telegramConfig.enabled),
    botToken: normalize(telegramConfig.botToken),
    flowId: normalize(telegramConfig.flowId),
    webhookUrl: normalize(telegramConfig.webhookUrl),
    webhookSecret: normalize(telegramConfig.webhookSecret),
    usePolling: telegramConfig.usePolling !== false,
    updatedAt: now
  };

  if (index === -1) {
    all.push({
      id: `channels_${tenantId}`,
      tenantId,
      telegram: payload,
      createdAt: now,
      updatedAt: now
    });
  } else {
    all[index] = {
      ...all[index],
      tenantId,
      telegram: {
        ...all[index].telegram,
        ...payload
      },
      updatedAt: now
    };
  }

  await adapter.saveCollection('channelConfigs', all);
  setCacheEntry(tenantId, all.find((config) => config.tenantId === tenantId) || null);
  return payload;
};

export const saveWhatsAppConfig = async (tenantId, whatsappConfig) => {
  const all = await adapter.getCollection('channelConfigs');
  const now = new Date().toISOString();
  const index = all.findIndex((config) => config.tenantId === tenantId);
  const payload = {
    enabled: Boolean(whatsappConfig.enabled),
    accessToken: normalize(whatsappConfig.accessToken),
    phoneNumberId: normalize(whatsappConfig.phoneNumberId),
    wabaId: normalize(whatsappConfig.wabaId),
    flowId: normalize(whatsappConfig.flowId),
    webhookVerifyToken: normalize(whatsappConfig.webhookVerifyToken),
    appSecret: normalize(whatsappConfig.appSecret),
    updatedAt: now
  };

  if (index === -1) {
    all.push({
      id: `channels_${tenantId}`,
      tenantId,
      telegram: null,
      whatsapp: payload,
      createdAt: now,
      updatedAt: now
    });
  } else {
    all[index] = {
      ...all[index],
      tenantId,
      whatsapp: {
        ...all[index].whatsapp,
        ...payload
      },
      updatedAt: now
    };
  }

  await adapter.saveCollection('channelConfigs', all);
  setCacheEntry(tenantId, all.find((config) => config.tenantId === tenantId) || null);
  return payload;
};
