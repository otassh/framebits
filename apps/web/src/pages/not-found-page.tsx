import { ArrowRight } from "lucide-react";
import { AppLink } from "../components/site-ui.js";
export function NotFoundPage(): React.JSX.Element {
  return (
    <main id="main-content" tabIndex={-1} className="page not-found-page">
      <div className="shell not-found-inner">
        <span>404</span>
        <h1>This frame slipped away.</h1>
        <p>The page does not exist, but the registry is right where you left it.</p>
        <AppLink href="/components" className="button button-primary">
          Browse components <ArrowRight size={18} />
        </AppLink>
      </div>
    </main>
  );
}
