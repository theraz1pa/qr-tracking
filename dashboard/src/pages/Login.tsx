import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";

export default function Login({ initialError }: { initialError: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);

  async function signIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError(error.message === "Invalid login credentials" ? "E-Mail oder Passwort ist falsch." : error.message);
    }
  }

  async function sendResetLink() {
    if (!email.trim()) {
      setError("Bitte zuerst die E-Mail-Adresse eingeben.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setInfo("Falls ein Konto existiert, wurde ein Link zum Zurücksetzen per E-Mail verschickt.");
  }

  return (
    <div className="center-page">
      <form className="card auth-card stack" onSubmit={signIn}>
        <div className="auth-header">
          <img className="auth-logo" src="/logo-dunkel.svg" alt="therapie1" />
          <p className="muted">QR-Scans · Anmeldung für Mitarbeiter</p>
        </div>
        {error && <p className="error">{error}</p>}
        {info && <p className="info">{info}</p>}
        <div className="field">
          <label htmlFor="email">E-Mail</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Passwort</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn primary" disabled={busy}>
          {busy ? "Bitte warten …" : "Anmelden"}
        </button>
        <button type="button" className="btn-link" onClick={sendResetLink} disabled={busy}>
          Passwort vergessen?
        </button>
      </form>
    </div>
  );
}
