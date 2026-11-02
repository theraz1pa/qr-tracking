import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";

export type PasswordMode = "invite" | "recovery" | "change";

const TITLES: Record<PasswordMode, string> = {
  invite: "Willkommen – bitte Passwort festlegen",
  recovery: "Neues Passwort festlegen",
  change: "Passwort ändern",
};

const MIN_LENGTH = 8;

export default function SetPassword({ mode, onDone }: { mode: PasswordMode; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(`Das Passwort muss mindestens ${MIN_LENGTH} Zeichen lang sein.`);
      return;
    }
    if (password !== confirmation) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else onDone();
  }

  return (
    <div className="center-page">
      <form className="card auth-card stack" onSubmit={submit}>
        <img className="auth-logo" src="/logo-dunkel.svg" alt="therapie1" />
        <h1>{TITLES[mode]}</h1>
        {error && <p className="error">{error}</p>}
        <div className="field">
          <label htmlFor="new-password">Neues Passwort</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="confirm-password">Passwort wiederholen</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </div>
        <button className="btn primary" disabled={busy}>
          {busy ? "Speichern …" : "Passwort speichern"}
        </button>
        {mode === "change" && (
          <button type="button" className="btn-link" onClick={onDone}>
            Abbrechen
          </button>
        )}
      </form>
    </div>
  );
}
