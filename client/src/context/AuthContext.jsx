import { createContext, useState, useContext, useEffect } from 'react';
import { apiRequest } from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem('user');
        try {
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    });

    const login = (userData, userToken) => {
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('token', userToken);
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        window.location.href = '/login';
    };


    useEffect(() => {
        if (!user) return;

        let consecutiveErrors = 0;
        let isMounted = true;
        const maxErrors = 3;

        const beat = setInterval(async () => {
            if (!isMounted) return;

            try {
                await apiRequest('/auth/heartbeat');
                consecutiveErrors = 0;
            } catch (error) {
                consecutiveErrors++;
                if (consecutiveErrors >= maxErrors) {
                    console.warn('Heartbeat falhou múltiplas vezes, parando tentativas');
                    clearInterval(beat);
                }
            }
        }, 15000);

        return () => {
            isMounted = false;
            clearInterval(beat);
        };
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth deve ser usado dentro de um AuthProvider");
    return context;
};