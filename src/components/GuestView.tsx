import { useState } from "react";
import { toast } from "sonner";
import { AudioLines, CheckCircle2, Instagram, Send, Share2, User, Youtube } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchSongTitle, guestSongSchema } from "@/lib/party";

export function GuestView({ room }: { room: string }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [ig, setIg] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = guestSongSchema.safeParse({ singer_name: name, youtube_url: url, instagram_handle: ig });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
    setBusy(true);
    const song_title = await fetchSongTitle(parsed.data.youtube_url);
    const { error } = await supabase.from("queue").insert({ ...parsed.data, song_title, room_id: room });
    setBusy(false);
    if (error) return toast.error("Não foi possível entrar na fila. Confira o QR Code da festa.");
    setSent(song_title);
  }

  async function share() {
    const text = `Vou cantar "${sent}" no Kanta Brasil! 🎤`;
    const data = { title: "Kanta Brasil", text, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(`${text} ${data.url}`); toast.success("Link copiado!"); }
    } catch { /* cancelled */ }
  }

  const field = "w-full rounded-xl border border-input bg-glass py-3 pl-10 pr-3 text-base outline-none focus:ring-2 focus:ring-ring";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-8">
      <header className="flex items-center gap-3">
        <div className="btn-neon rounded-xl p-2"><AudioLines className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-bold"><span className="neon-text">Kanta Brasil</span></h1>
          <p className="text-sm text-muted-foreground">Escolha sua música e entre na fila!</p>
        </div>
      </header>

      {sent ? (
        <section className="glass space-y-5 p-6 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-accent" />
          <div>
            <h2 className="text-2xl font-bold"><span className="neon-text">Sua música está na fila!</span></h2>
            <p className="mt-2 text-sm text-muted-foreground">"{sent}"</p>
            <p className="mt-1 text-sm text-muted-foreground">Fique de olho na tela — já já é sua vez. 🎤</p>
          </div>
          <button onClick={share} className="btn-neon flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold">
            <Share2 className="h-5 w-5" />Compartilhar
          </button>
          <button onClick={() => { setSent(null); setUrl(""); }} className="text-sm text-muted-foreground">Pedir outra música</button>
        </section>
      ) : (
        <form onSubmit={submit} className="glass space-y-4 p-6">
          <div className="relative"><User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu Nome" maxLength={60} className={field} /></div>
          <div className="relative"><Youtube className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link do YouTube" inputMode="url" className={field} /></div>
          <div className="relative"><Instagram className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={ig} onChange={(e) => setIg(e.target.value)} placeholder="@Instagram (opcional)" maxLength={40} className={field} /></div>
          <button disabled={busy} className="btn-neon flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold disabled:opacity-60">
            <Send className="h-5 w-5" />{busy ? "Enviando..." : "Enviar"}
          </button>
        </form>
      )}
    </main>
  );
}
