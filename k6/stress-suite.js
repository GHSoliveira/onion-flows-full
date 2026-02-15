import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const API = `${BASE_URL.replace(/\/$/, '')}/api`;

const TENANT_ID = __ENV.TENANT_ID || '';

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || '1m'
};

const withTenant = (url) => {
  if (!TENANT_ID) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}tenantId=${TENANT_ID}`;
};

const authHeaders = (token) => ({
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }
});

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randId = () => `load_${__VU}_${__ITER}_${Date.now()}_${Math.random().toString(16).slice(2,6)}`;

const endpoints = {
  health: () => http.get(`${BASE_URL}/health`),
  tenantCurrent: (token) => http.get(`${API}/tenant/current`, authHeaders(token)),
  flows: (token) => http.get(withTenant(`${API}/flows?limit=50&page=1`), authHeaders(token)),
  users: (token) => http.get(withTenant(`${API}/users?limit=50&page=1`), authHeaders(token)),
  queues: (token) => http.get(withTenant(`${API}/queues`), authHeaders(token)),
  templates: (token) => http.get(withTenant(`${API}/templates`), authHeaders(token)),
  variables: (token) => http.get(withTenant(`${API}/variables`), authHeaders(token)),
  schedules: (token) => http.get(withTenant(`${API}/schedules`), authHeaders(token)),
  logs: (token) => http.get(`${API}/logs?limit=50&page=1`, authHeaders(token)),
  channels: (token) => http.get(withTenant(`${API}/channels`), authHeaders(token)),
  monitoring: (token) => http.get(`${API}/super-admin/monitoring`, authHeaders(token)),
  webVitals: (token) => http.get(`${API}/super-admin/web-vitals?days=7`, authHeaders(token))
};

export function setup() {
  const token = __ENV.TOKEN || '';
  if (!token) {
    throw new Error('Defina TOKEN para autenticar.');
  }
  return { token };
}

export default function (data) {
  const token = data.token;

  // 1) Create chat and send message (write load)
  const cpf = randId();
  const initRes = http.post(
    withTenant(`${API}/chats/init`),
    JSON.stringify({ customerCpf: cpf }),
    authHeaders(token)
  );
  check(initRes, { 'init 200': (r) => r.status === 200 });

  const chatId = initRes.json('id');
  if (chatId) {
    const msgRes = http.post(
      withTenant(`${API}/chats/${chatId}/messages`),
      JSON.stringify({ sender: 'user', text: `load msg ${randId()}` }),
      authHeaders(token)
    );
    check(msgRes, { 'message 200': (r) => r.status === 200 });
  }

  // 2) Mixed reads
  const readFns = [
    endpoints.health,
    () => endpoints.tenantCurrent(token),
    () => endpoints.flows(token),
    () => endpoints.users(token),
    () => endpoints.queues(token),
    () => endpoints.templates(token),
    () => endpoints.variables(token),
    () => endpoints.schedules(token),
    () => endpoints.logs(token),
    () => endpoints.channels(token),
    () => endpoints.monitoring(token),
    () => endpoints.webVitals(token)
  ];

  // fire 3 random reads per iteration
  for (let i = 0; i < 3; i++) {
    const res = pick(readFns)();
    check(res, { 'read 200': (r) => r.status === 200 });
  }

  sleep(0.2);
}
