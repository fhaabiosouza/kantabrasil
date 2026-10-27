import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Crown, ListMusic, Play, QrCode, Trash2, X } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export type QueueItem = Tables<"queue">;

export function PartyPanel({ userId, queue, onPlay, onRemove }: {
  userId: string; queue: QueueItem[]; onPlay: (q: QueueItem) => void; onRemove: (id: string) => void;
}) {
  const [showQr, setShowQr] = useState(false);
  const pending = queue.filter((q) => q.status === "pending");
  const roomUrl = typeof window !== "undefined" ? `${window.location.origin}/?room=${userId}` : "";

  return (
    <section className="glass space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold"><ListMusic className="h-5 w-5 text-accent" />Próximas músicas</h2>
        <button onClick={() => setShowQr(true)} className="btn-neon flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <QrCode className="h-4 w-4" />Gerar QR Code da Festa
        </button>
      </div>
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">Fila vazia. Mostre o QR Code para os convidados pedirem músicas.</p>
      ) : (
        <ol className="space-y-2">
          {pending.map((q, i) => (
            <li key={q.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
              <span className="font-mono text-sm text-accent">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{q.song_title}</p>
                <p className="truncate text-xs text-muted-foreground">{q.singer_name}{q.instagram_handle ? ` · @${q.instagram_handle}` : ""}</p>
              </div>
              <button aria-label="Tocar" onClick={() => onPlay(q)} className="rounded-lg p-2 text-accent"><Play className="h-4 w-4" /></button>
              <button aria-label="Remover" onClick={() => onRemove(q.id)} className="rounded-lg p-2 text-muted-foreground"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ol>
      )}

      {showQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur" onClick={() => setShowQr(false)}>
          <div className="glass relative space-y-4 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <button aria-label="Fechar" onClick={() => setShowQr(false)} className="absolute right-3 top-3 text-muted-foreground"><X className="h-5 w-5" /></button>
            <h3 className="text-xl font-bold"><span className="neon-text">Aponte a câmera e peça sua música!</span></h3>
            <div className="mx-auto w-fit rounded-2xl bg-foreground p-4"><QRCodeSVG value={roomUrl} size={240} /></div>
            <p className="break-all font-mono text-xs text-muted-foreground">{roomUrl}</p>
          </div>
        </div>
      )}
    </section>
  );
}

export function VipModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur">
      <div className="glass relative w-full max-w-md space-y-5 p-6 text-center">
        <button aria-label="Fechar" onClick={onClose} className="absolute right-3 top-3 text-muted-foreground"><X className="h-5 w-5" /></button>
        <Crown className="mx-auto h-14 w-14 text-accent" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">VIP Premium</p>
          <h2 className="mt-1 text-2xl font-bold"><span className="neon-text">A festa não pode parar!</span></h2>
          <p className="mt-2 text-sm text-muted-foreground">Desbloqueie a Fila por QR Code e Músicas Ilimitadas.</p>
        </div>
        <div className="mx-auto flex aspect-square w-48 items-center justify-center rounded-2xl border-2 border-dashed border-border text-sm text-muted-foreground">
          QR Code PIX em breve
        </div>
        <p className="text-xs text-muted-foreground">Seu plano grátis inclui 3 músicas.</p>
      </div>
    </div>
  );
}
