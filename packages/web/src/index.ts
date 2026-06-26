// @island/web — the React + Vite client. Entry is index.html → src/main.tsx; this
// barrel exposes the typed API client and the views for reuse/testing. The client
// renders prose, prices, and choices from projected DTOs only — never authoritative.
export { api } from './api/client';
export { App } from './App';
export { DailyLife } from './views/DailyLife';
export { Money } from './views/Money';
