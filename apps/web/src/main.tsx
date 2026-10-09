import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.js";
import "./demo-utilities.css";
import "./styles.css";
import "./design-refresh.css";
import "./pages.css";
import "./hero-background.css";
import "./github-stars.css";
import "./footer.css";
import "./responsive.css";
import "./component-browser.css";
import "./component-cards.css";

const root = document.querySelector<HTMLDivElement>("#root");

if (root === null) {
  throw new Error("Framebits web root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
