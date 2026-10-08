import axios from 'axios';
import { supabase } from './supabase';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || '/api';
let redirectingToLogin = false;

// NOTE: no global Content-Type. Axios 1.x auto-sets:
//   - application/json for plain object bodies
//   - multipart/form-data; boundary=… for FormData (browser sets the boundary)
//   - text/plain for strings
// A hardcoded global Content-Type breaks FormData uploads because the boundary
// is missing and fastify-multipart silently fails to parse the body.
const client = axios.create({
  baseURL: API_BASE_URL,
});

// Attach Supabase JWT token to every request
client.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// Handle 401 responses — redirect to login
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isOnLoginPage = window.location.pathname === '/login';
      if (!isOnLoginPage && !redirectingToLogin) {
        // Avoid redirect loops when multiple requests fail with 401 simultaneously.
        redirectingToLogin = true;
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default client;
