export const API_URL = import.meta.env.VITE_API_URL;

export async function apiRequest(
    path,
    { method = 'GET', body, token } = {}
) {
    const headers = {};

    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${path}`, {
        method, headers, ...(body !== undefined && { body: JSON.stringify(body) })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Request failed.');
    }

    return data;
}