
const BASE_URL = 'http://localhost:3001/api';
const FALLBACK_URL = 'http://localhost:3001/api';


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

    let url = `${BASE_URL}${endpoint}`;


    const isLoginEndpoint = endpoint.includes('/auth/login');


    if (!isLoginEndpoint) {
        const tenantId = getTenantId();
        if (tenantId) {
            const separator = endpoint.includes('?') ? '&' : '?';
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