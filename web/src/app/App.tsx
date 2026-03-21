import { useEffect, useState } from "react";
import { AuthCard } from "../features/auth/AuthCard";
import { Workspace } from "../features/chat/Workspace";
import { loadSession, saveSession } from "../lib/session";
import type { AuthResponse } from "../lib/types";

export function App() {
  const [session, setSession] = useState<AuthResponse | null>(() => loadSession());

  useEffect(() => {
    saveSession(session);
  }, [session]);

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      {session ? (
        <Workspace session={session} onSessionChange={setSession} />
      ) : (
        <AuthCard onAuthenticated={setSession} />
      )}
    </div>
  );
}

