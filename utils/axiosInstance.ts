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

// Clears the saved session (localStorage + the cookies proxy.ts reads).
export function clearStoredSession() {
    localStorage.removeItem('authUser');
    localStorage.removeItem('jwtToken');
    document.cookie = 'jwtToken=; path=/; max-age=0; SameSite=Strict';
    document.cookie = 'userRole=; path=/; max-age=0; SameSite=Strict';
}

// Pages anyone can open; an expired session there just signs the visitor out quietly.
const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot-password'];

// Account-level responses from the backend's JWT filter:
//  - SESSION_EXPIRED / LOGIN_REQUIRED (401): the token is too old (24 h) or was
//    signed before the server restarted -> sign in again, then come back here.
//  - ACCOUNT_DISABLED (401): the account was deactivated -> sign out.
//  - PASSWORD_CHANGE_REQUIRED (403): a temporary password is still in use.
// Full-page navigation is deliberate: it also resets every page's in-memory state.
/* eslint-disable @next/next/no-location-assign-relative-destination -- runs outside React (no router), and a full reload is wanted */
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status;
        const code = error?.response?.data;
        if (typeof window !== 'undefined') {
            const path = window.location.pathname;
            if (status === 401 && code === 'ACCOUNT_DISABLED') {
                clearStoredSession();
                window.location.href = '/login?disabled=1';
            } else if (status === 401 && (code === 'SESSION_EXPIRED' || code === 'LOGIN_REQUIRED')) {
                clearStoredSession();
                if (!PUBLIC_PATHS.includes(path)) {
                    window.location.href = `/login?expired=1&redirect=${encodeURIComponent(path + window.location.search)}`;
                }
            } else if (status === 403 && code === 'PASSWORD_CHANGE_REQUIRED' && path !== '/change-password') {
                window.location.href = '/change-password';
            }
        }
        return Promise.reject(error);
    }
);
/* eslint-enable @next/next/no-location-assign-relative-destination */

export default api;