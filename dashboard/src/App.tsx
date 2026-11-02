import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { authLinkError, authLinkType, supabase } from "./lib/supabase";
import Login from "./pages/Login";
import SetPassword from "./pages/SetPassword";
import type { PasswordMode } from "./pages/SetPassword";
import Stats from "./pages/Stats";
import ManageCodes from "./pages/ManageCodes";

type View = "stats" | "codes";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [passwordMode, setPasswordMode] = useState<PasswordMode | null>(authLinkType);
  const [view, setView] = useState<View>("stats");

  // Daten erst laden, wenn Supabase die Sitzung gemeldet hat. Sonst fragt das Dashboard
  // direkt nach einem Token-Refresh mit einem noch nicht gültigen Token an.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") setPasswordMode("recovery");
    });
    // Notbremse: Bleibt das Event aus, startet das Dashboard trotzdem.
    const fallback = setTimeout(() => {
      void supabase.auth.getSession().then(({ data: current }) => {
        setSession(current.session);
        setAuthReady(true);
      });
    }, 8000);
    return () => {
      clearTimeout(fallback);
      data.subscription.unsubscribe();
    };
  }, []);

  if (!authReady) {
    return (
      <div className="center-page">
        <p className="muted">Lädt …</p>
      </div>
    );
  }

  if (!session) return <Login initialError={authLinkError} />;

  if (passwordMode) {
    return <SetPassword mode={passwordMode} onDone={() => setPasswordMode(null)} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/logo-hell.svg" alt="therapie1" />
          <span>QR-Scans</span>
        </div>
        <nav className="tabs">
          <button className={view === "stats" ? "tab active" : "tab"} onClick={() => setView("stats")}>
            Statistik
          </button>
          <button className={view === "codes" ? "tab active" : "tab"} onClick={() => setView("codes")}>
            QR-Codes verwalten
          </button>
        </nav>
        <div className="user">
          <span className="muted hide-mobile">{session.user.email}</span>
          <button className="btn-link" onClick={() => setPasswordMode("change")}>
            Passwort ändern
          </button>
          <button className="btn-link" onClick={() => void supabase.auth.signOut()}>
            Abmelden
          </button>
        </div>
      </header>
      <main className="container">{view === "stats" ? <Stats /> : <ManageCodes />}</main>
    </div>
  );
}
