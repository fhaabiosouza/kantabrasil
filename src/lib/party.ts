import { z } from "zod";
import { extractYouTubeId } from "./youtube";

export const FREE_PLAY_LIMIT = 3;

export const guestSongSchema = z.object({
  singer_name: z.string().trim().min(1, "Informe seu nome").max(60, "Nome muito longo"),
  youtube_url: z.string().trim().max(300).refine((v) => !!extractYouTubeId(v), "Link do YouTube inválido"),
  instagram_handle: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v.replace(/^@+/, ""))
    .refine((v) => v === "" || /^[A-Za-z0-9._]{1,30}$/.test(v), "@Instagram inválido")
    .transform((v) => (v === "" ? null : v)),
});

export type GuestSong = z.infer<typeof guestSongSchema>;

export async function fetchSongTitle(url: string): Promise<string> {
  try {
    const r = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    const j = await r.json();
    if (typeof j.title === "string" && j.title) return j.title.slice(0, 200);
  } catch { /* ignore */ }
  return "Música";
}
