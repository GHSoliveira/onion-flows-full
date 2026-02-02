// API Simplificado - direto no backend
const BASE_URL = 'http://localhost:3001/api'; // Bypass proxy
const FALLBACK_URL = 'http://localhost:3001/api';

// Helper para obter tenantId do localStorage
const getTenantId = () => {
    try {
        const savedTenant = localStorage.getItem('selectedTenant');
        if (savedTenant) {
            const parsed = JSON.parse(savedTenant);
            // Não enviar tenantId se for 'super_admin' (acesso global)
            if (parsed.id && parsed.id !== 'super_admin') {
                return parsed.id;
            }
        }
    } catch (e) {
        console.error('Erro ao ler tenant do localStorage:', e);
    }
    return null;
};

// API Simplificado - sem complexidade
export const apiRequest = async (endpoint, options = {}) => {
    const token = localStorage.getItem('token');
    
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
    };

    let url = `${BASE_URL}${endpoint}`;
    
    // Não adicionar tenantId para rotas de auth/login
    const isLoginEndpoint = endpoint.includes('/auth/login');
    
    // Adicionar tenantId se existir tenant selecionado E não for login
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
    // Adicione esta verificação para evitar erro se res for null (401)
    if (!res) return null; 
    return res.json();
};

// --- HELPERS PARA FACILITAR O USO (JSON) ---

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