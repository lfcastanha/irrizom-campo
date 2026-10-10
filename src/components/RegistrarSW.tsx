'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker e guarda no celular todos os arquivos que o app usou,
 * para que ele abra mesmo sem sinal na obra.
 */
export default function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        const urls = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin));
        urls.push(location.pathname, '/', '/login');
        reg.active?.postMessage({ tipo: 'precache', urls: Array.from(new Set(urls)) });
      })
      .catch(() => {});
  }, []);
  return null;
}
