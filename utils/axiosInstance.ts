import axios from 'axios';

// Create a custom instance of Axios
const api = axios.create({
    baseURL: 'http://localhost:8080/api',
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

export default api;