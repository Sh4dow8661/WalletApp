import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { registrarServiceWorker } from "./lib/pwa.ts";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el elemento #root");

// El service worker se registra al arrancar: precachea el shell para que la app
// abra sin red y avisa cuando hay una versión nueva (§9).
registrarServiceWorker();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
