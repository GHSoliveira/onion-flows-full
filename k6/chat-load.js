import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const API = `${BASE_URL.replace(/\\/$/, '')}/api`;

const USERNAME = __ENV.USERNAME || '';
const PASSWORD = __ENV.PASSWORD || '';
const TOKEN = __ENV.TOKEN || '';
const TENANT_ID = __ENV.TENANT_ID || '';
const QUEUE = __ENV.QUEUE || '';

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '30s'
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

export function setup() {
  if (TOKEN) {
    return { token: TOKEN };
  }

  if (!USERNAME || !PASSWORD) {
    throw new Error('Defina TOKEN ou USERNAME/PASSWORD para autenticar.');
  }

  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const ok = check(res, {
    'login 200': (r) => r.status === 200,
    'login token': (r) => !!r.json('token')
  });

  if (!ok) {
    throw new Error(`Falha no login: ${res.status} ${res.body}`);
  }

  return { token: res.json('token') };
}

export default function (data) {
  const token = data.token;
  const cpf = `load_${__VU}_${__ITER}_${Date.now()}`;

  const initRes = http.post(
    withTenant(`${API}/chats/init`),
    JSON.stringify({ customerCpf: cpf }),
    authHeaders(token)
  );

  check(initRes, {
    'init 200': (r) => r.status === 200,
    'init chatId': (r) => !!r.json('id')
  });

  const chatId = initRes.json('id');
  if (!chatId) return;

  const msgRes = http.post(
    withTenant(`${API}/chats/${chatId}/messages`),
    JSON.stringify({ sender: 'user', text: 'teste carga' }),
    authHeaders(token)
  );

  check(msgRes, {
    'message 200': (r) => r.status === 200
  });

  if (QUEUE) {
    const transferRes = http.post(
      withTenant(`${API}/chats/transfer`),
      JSON.stringify({
        chatId,
        queue: QUEUE,
        reason: 'teste carga',
        continueFlow: true
      }),
      authHeaders(token)
    );
    check(transferRes, {
      'transfer 200': (r) => r.status === 200
    });
  }

  sleep(0.5);
}
