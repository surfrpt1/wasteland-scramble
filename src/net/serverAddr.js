// Shared server-address resolution for the multiplayer backend.
// Priority:
//   1. Explicit URL (e.g. set in the registry from a query param / config).
//   2. VITE_SERVER_URL compile-time var (client on Pages + server on Railway).
//   3. Local dev (Vite on a random port): the node server on :3001.
//   4. Deployed single Railway service: the same origin that served the page.
export function resolveServerAddr(explicit) {
    if (explicit) return explicit;
    if (import.meta.env?.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
    const host = location.hostname;
    const local = host === 'localhost' || host === '127.0.0.1';
    const stdPort = location.port === '' || location.port === '80' || location.port === '443';
    if (local && !stdPort) {
        return `${location.protocol}//${host}:3001`;
    }
    return location.origin;
}
