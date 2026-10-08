import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.js";
import "./styles.css";
import "./design-refresh.css";
import "./pages.css";
import "./hero-background.css";
import "./github-stars.css";
import "./footer.css";

const root = document.querySelector<HTMLDivElement>("#root");

if (root === null) {
  throw new Error("Framebits web root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
