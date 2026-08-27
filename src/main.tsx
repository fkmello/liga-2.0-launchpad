import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// === Reset manual via ?reset-cache=1 ===
// Acesse https://<dominio>/?reset-cache=1 para forçar limpeza total
// (service workers, caches, flags locais). Único caminho que executa
// um reload automático.
(async () => {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has("reset-cache")) return;

  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {}
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}
  try {
    localStorage.removeItem("__sw_reloaded__");
    localStorage.removeItem("__app_version__");
    localStorage.removeItem("__app_build__");
    sessionStorage.removeItem("__sw_reloaded__");
  } catch {}

  window.location.replace(`/?cache-cleared=${Date.now()}`);
  throw new Error("reset-cache: reloading");
})().catch(() => {});

// === Limpeza silenciosa de SW/caches no preview e iframe ===
// Não recarrega a página — apenas garante que nenhum SW antigo
// fique interceptando requests dentro do preview do Lovable.
(() => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const host = window.location.hostname;
  const isPreviewHost =
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    (host.includes("lovable.app") && host.includes("preview"));

  if (isInIframe || isPreviewHost) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
    if ("caches" in window) {
      caches
        .keys()
        .then((keys) => keys.forEach((k) => caches.delete(k)))
        .catch(() => {});
    }
  }
  // Em produção NÃO escutamos mais 'controllerchange' para não disparar
  // reloads automáticos. O kill-switch /sw.js continua ativo e desregistra
  // a si mesmo na próxima visita; o usuário recarrega manualmente uma vez
  // (ou usa ?reset-cache=1) e fica limpo.
})();

createRoot(document.getElementById("root")!).render(<App />);
