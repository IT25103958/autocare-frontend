import axios from 'axios';

// The one place the API address lives. By default the browser calls /api on the
// address the site was opened from, and Next forwards it to the backend (see the
// rewrite in next.config.ts) — so the site works the same on localhost and through
// a public link. Set NEXT_PUBLIC_API_BASE_URL only when the backend has its own
// public address.
export const API_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL || ''}/api`;

// Signed-in requests: attaches the token and handles account-level responses.
const api = axios.create({
    baseURL: API_URL,
});

// Signed-out pages (login, register, password reset): same address, never sends a token.
export const publicApi = axios.create({
    baseURL: API_URL,
});

// Add a request interceptor
api.interceptors.request.use(
    (config) => {
        // Grab the token from Local Storage before the request leaves the browser
        const token = localStorage.getItem('jwtToken');

        // If a token exists, attach it to the Authorization header
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Account-level responses from the backend's JWT filter:
//  - ACCOUNT_DISABLED: the account was deactivated -> sign out.
//  - PASSWORD_CHANGE_REQUIRED: a temporary password is still in use.
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const code = error?.response?.data;
        if (typeof window !== 'undefined') {
            if (error?.response?.status === 401 && code === 'ACCOUNT_DISABLED') {
                localStorage.removeItem('authUser');
                localStorage.removeItem('jwtToken');
                document.cookie = 'jwtToken=; path=/; max-age=0; SameSite=Strict';
                document.cookie = 'userRole=; path=/; max-age=0; SameSite=Strict';
                window.location.href = '/login';
            } else if (error?.response?.status === 403 && code === 'PASSWORD_CHANGE_REQUIRED'
                && window.location.pathname !== '/change-password') {
                window.location.href = '/change-password';
            }
        }
        return Promise.reject(error);
    }
);

export default api;