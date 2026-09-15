"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

export default function MurderPreferenceGate({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    let running = false;
    async function check() {
      if (running) return;
      running = true;
      try {
        const { data, error } = await supabase.rpc("murder_preferences_enabled");
        if (active) setEnabled(!error && data === true);
      } catch { if (active) setEnabled(false); }
      finally { running = false; }
    }
    function visible() { if (document.visibilityState === "visible") void check(); }
    void check();
    const timer = window.setInterval(visible, 15000);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, [supabase]);
  return enabled ? children : null;
}
