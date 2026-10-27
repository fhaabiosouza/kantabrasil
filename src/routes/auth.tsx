import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AudioLines } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Kanta Brasil" },
      { name: "description", content: "Entre ou crie sua conta de anfitrião para abrir o Modo Festa do Kanta Brasil." },
      { property: "og:title", content: "Entrar — Kanta Brasil" },
      { property: "og:description", content: "Crie sua conta de anfitrião e comece a festa de karaokê." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return toast.error("E-mail ou senha incorretos.");
      nav({ to: "/" });
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      setBusy(false);
      if (error) return toast.error(error.message);
      if (data.session) nav({ to: "/" });
      else toast.success("Conta criada! Confirme pelo link enviado ao seu e-mail.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="glass w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-2">
          <div className="btn-neon rounded-xl p-2"><AudioLines className="h-5 w-5" /></div>
          <h1 className="text-xl font-bold"><span className="neon-text">{mode === "in" ? "Entrar" : "Criar conta"}</span></h1>
        </div>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail"
          className="w-full rounded-xl border border-input bg-glass px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha"
          className="w-full rounded-xl border border-input bg-glass px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <button disabled={busy} className="btn-neon w-full rounded-xl py-2.5 font-semibold disabled:opacity-60">
          {busy ? "Aguarde..." : mode === "in" ? "Entrar" : "Criar conta"}
        </button>
        <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="w-full text-sm text-muted-foreground">
          {mode === "in" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
        </button>
      </form>
    </main>
  );
}
