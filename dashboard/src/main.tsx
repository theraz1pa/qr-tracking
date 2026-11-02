import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const root = createRoot(document.getElementById("root")!);

// Dynamischer Import, damit fehlende Env-Vars als Meldung statt als weiße Seite erscheinen.
import("./App")
  .then(({ default: App }) =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
  .catch((err: unknown) =>
    root.render(
      <div className="center-page">
        <div className="card auth-card stack">
          <h1>Konfigurationsfehler</h1>
          <p className="error">{err instanceof Error ? err.message : String(err)}</p>
        </div>
      </div>,
    ),
  );
