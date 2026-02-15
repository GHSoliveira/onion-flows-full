
// Sempre incluir /api na URL base
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const BASE_URL = `${API_BASE}/api`;

const getTenantId = () => {
    try {
        const savedTenant = localStorage.getItem('selectedTenant');
        if (savedTenant) {
            const parsed = JSON.parse(savedTenant);
            if (parsed.id && parsed.id !== 'super_admin') {
                return parsed.id;
            }
        }
    } catch (e) {
        console.error('Erro ao ler tenant do localStorage:', e);
    }
    return null;
};


export const apiRequest = async (endpoint, options = {}) => {
    const token = localStorage.getItem('token');

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
    };

    // Garantir que endpoint começa com /
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    let url = `${BASE_URL}${normalizedEndpoint}`;


    const isLoginEndpoint = normalizedEndpoint.includes('/auth/login');


    if (!isLoginEndpoint) {
        const tenantId = getTenantId();
        const hasTenantParam = /[?&]tenantId=/.test(normalizedEndpoint);
        if (tenantId && !hasTenantParam) {
            const separator = normalizedEndpoint.includes('?') ? '&' : '?';
            url = `${url}${separator}tenantId=${tenantId}`;
        }
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers,
        });

        if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
            return null;
        }

        return response;
    } catch (error) {
        console.error("Erro API:", error.message);
        throw error;
    }
};

export const postJSON = async (endpoint, body) => {
    const res = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
    });

    if (!res) return null;
    return res.json();
};



export const getJSON = async (endpoint) => {
    const res = await apiRequest(endpoint);
    return res.json();
};



export const putJSON = async (endpoint, body) => {
    const res = await apiRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify(body)
    });
    return res.json();
};

export const deleteJSON = async (endpoint) => {
    const res = await apiRequest(endpoint, {
        method: 'DELETE'
    });
    return res.json();
};
