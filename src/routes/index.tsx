import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, MicOff, Music, Play, Timer, Volume2, Youtube, AudioLines, Sparkles, LogOut, SkipForward, Instagram } from "lucide-react";
import { extractYouTubeId } from "@/lib/youtube";
import { FREE_PLAY_LIMIT } from "@/lib/party";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { GuestView } from "@/components/GuestView";
import { PartyPanel, VipModal, type QueueItem } from "@/components/PartyPanel";

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): { room?: string } =>
    typeof s.room === "string" && /^[0-9a-f-]{36}$/i.test(s.room) ? { room: s.room } : {},
  head: () => ({
    meta: [
      { title: "Kanta Brasil — Karaokê com Modo Festa" },
      { name: "description", content: "Karaokê com fila por QR Code, sincronia de microfone para Bluetooth e reverb de palco." },
      { property: "og:title", content: "Kanta Brasil — Karaokê com Modo Festa" },
      { property: "og:description", content: "Peça sua música pelo celular e cante com o YouTube na caixa Bluetooth." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { room } = Route.useSearch();
  return room ? <GuestView room={room} /> : <Index />;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady?: () => void }
}

const STORAGE_KEY = "karaoke-mixer-settings";

let ytPromise: Promise<any> | null = null;
function loadYT(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytPromise;
}

/** Synthetic hall impulse response: white noise with exponential decay. */
function createHallIR(ctx: BaseAudioContext, seconds = 2.8, decay = 3): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function Slider({ icon: Icon, label, value, max, unit, onChange }: {
  icon: typeof Mic; label: string; value: number; max: number; unit: string; onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4 text-accent" />{label}</span>
        <span className="font-mono text-foreground">{value}{unit}</span>
      </div>
      <input type="range" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="range-neon" />
    </label>
  );
}

type AudioGraph = {
  ctx: AudioContext; stream: MediaStream; src: MediaStreamAudioSourceNode; gain: GainNode; delay: DelayNode;
  wet: GainNode; analyser: AnalyserNode; raf: number;
};

function Index() {
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [musicVol, setMusicVol] = useState(70);
  const [micVol, setMicVol] = useState(80);
  const [delayMs, setDelayMs] = useState(200);
  const [reverb, setReverb] = useState(25);
  const [deviceId, setDeviceId] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const playerRef = useRef<any>(null);
  const playerHost = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audio = useRef<AudioGraph | null>(null);
  const settings = useRef({ micVol, delayMs, reverb, musicVol });
  settings.current = { micVol, delayMs, reverb, musicVol };

  // ---- Party mode ----
  const { session, ready } = useSession();
  const userId = session?.user.id ?? null;
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [playCount, setPlayCount] = useState(0);
  const [plan, setPlan] = useState("free");
  const [vip, setVip] = useState(false);
  const current = queue.find((q) => q.status === "playing") ?? null;
  
  // ---- Score System ----
  const [score, setScore] = useState<number | null>(null);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const scoreData = useRef({ totalVol: 0, samples: 0 });
  
  const nextRef = useRef<() => void>(() => {});
  const handleSongEndRef = useRef<() => void>(() => {});

  async function loadQueue() {
    const { data } = await supabase.from("queue").select("*").order("created_at");
    setQueue(data ?? []);
  }
  async function loadProfile() {
    if (!userId) return;
    const { data } = await supabase.from("profiles").select("play_count, plan_tier").eq("id", userId).maybeSingle();
    if (data) { setPlayCount(data.play_count); setPlan(data.plan_tier); }
  }

  useEffect(() => {
    if (!userId) { setQueue([]); return; }
    loadQueue(); loadProfile();
    const ch = supabase
      .channel(`queue-${userId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `room_id=eq.${userId}` }, () => loadQueue())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function blockPlayer() {
    playerRef.current?.pauseVideo?.();
    setVip(true);
  }

  async function playItem(item: QueueItem) {
    const id = extractYouTubeId(item.youtube_url);
    if (!id) { toast.error("Link inválido na fila."); await supabase.from("queue").delete().eq("id", item.id); return; }
    const { data: ok } = await supabase.rpc("play_queue_item", { _id: item.id });
    if (!ok) { blockPlayer(); return; }
    setVideoId(id);
    playerRef.current?.loadVideoById?.(id);
    await Promise.all([loadQueue(), loadProfile()]);
  }

  async function playNext() {
    const next = queue.find((q) => q.status === "pending");
    if (next) await playItem(next);
    else if (current) { await supabase.from("queue").delete().eq("id", current.id); loadQueue(); }
  }
  nextRef.current = () => { void playNext(); };

  // Logic triggered when YouTube video ends
  handleSongEndRef.current = () => {
    // Calculate a fun score based slightly on mic activity volume and random factor
    let finalScore = Math.floor(Math.random() * 16) + 85; // Base 85-100 se não cantou
    if (scoreData.current.samples > 50) {
      const avgVol = scoreData.current.totalVol / scoreData.current.samples;
      const bonus = Math.min(15, (avgVol / 100) * 15);
      finalScore = Math.floor(70 + bonus + Math.random() * 15);
      finalScore = Math.min(100, Math.max(0, finalScore)); // Trava em 100 max
    }

    setScore(finalScore);
    setShowScoreModal(true);
    scoreData.current = { totalVol: 0, samples: 0 }; // Reseta as métricas

    // Aguarda 5 segundos, fecha a nota e avança na fila
    setTimeout(() => {
      setShowScoreModal(false);
      nextRef.current(); 
    }, 5000);
  };

  async function removeItem(id: string) {
    await supabase.from("queue").delete().eq("id", id);
    loadQueue();
  }

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Você saiu.");
  }

  // Load saved settings
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (typeof s.musicVol === "number") setMusicVol(s.musicVol);
      if (typeof s.micVol === "number") setMicVol(s.micVol);
      if (typeof s.delayMs === "number") setDelayMs(s.delayMs);
      if (typeof s.reverb === "number") setReverb(s.reverb);
      if (typeof s.deviceId === "string") setDeviceId(s.deviceId);
    } catch { /* ignore */ }
    setLoaded(true);
    refreshDevices();
    const md = navigator.mediaDevices;
    md?.addEventListener?.("devicechange", refreshDevices);
    return () => md?.removeEventListener?.("devicechange", refreshDevices);
  }, []);

  // Save settings
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ musicVol, micVol, delayMs, reverb, deviceId }));
  }, [loaded, musicVol, micVol, delayMs, reverb, deviceId]);

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(all.filter((d) => d.kind === "audioinput"));
  }

  // YouTube player
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    loadYT().then((YT) => {
      if (cancelled || !playerHost.current) return;
      if (playerRef.current) { playerRef.current.loadVideoById(videoId); return; }
      const el = document.createElement("div");
      playerHost.current.appendChild(el);
      playerRef.current = new YT.Player(el, {
        videoId, width: "100%", height: "100%",
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: (e: any) => e.target.setVolume(settings.current.musicVol),
          onStateChange: (e: any) => { if (e.data === 0) handleSongEndRef.current(); },
          onError: () => toast.error("Não foi possível reproduzir este vídeo."),
        },
      });
    });
    return () => { cancelled = true; };
  }, [videoId]);

  useEffect(() => { playerRef.current?.setVolume?.(musicVol); }, [musicVol]);
  useEffect(() => { const a = audio.current; if (a) a.gain.gain.setTargetAtTime(micVol / 100, a.ctx.currentTime, 0.02); }, [micVol]);
  useEffect(() => { const a = audio.current; if (a) a.delay.delayTime.setTargetAtTime(delayMs / 1000, a.ctx.currentTime, 0.02); }, [delayMs]);
  useEffect(() => { const a = audio.current; if (a) a.wet.gain.setTargetAtTime(reverb / 100, a.ctx.currentTime, 0.05); }, [reverb]);
  useEffect(() => () => stopMic(), []);

  async function loadVideo() {
    const id = extractYouTubeId(url);
    if (!id) { toast.error("Link do YouTube inválido."); return; }
    if (!userId) { toast.error("Entre na sua conta para tocar músicas."); return; }
    const { data: ok } = await supabase.rpc("consume_play");
    if (!ok) { blockPlayer(); return; }
    if (current) await supabase.from("queue").delete().eq("id", current.id);
    setVideoId(id);
    playerRef.current?.loadVideoById?.(id);
    loadQueue(); loadProfile();
  }

  async function getStream(id: string) {
    const base = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: id ? { ...base, deviceId: { exact: id } } : base });
    } catch (err: any) {
      if (id && (err?.name === "OverconstrainedError" || err?.name === "NotFoundError")) {
        toast.warning("Microfone salvo não encontrado. Usando o padrão.");
        setDeviceId("");
        return navigator.mediaDevices.getUserMedia({ audio: base });
      }
      throw err;
    }
  }

  async function startMic(id = deviceId) {
    if (!navigator.mediaDevices?.getUserMedia) { toast.error("Seu navegador não suporta captura de áudio."); return; }
    try {
      const stream = await getStream(id);
      const s = settings.current;
      const ctx = new AudioContext({ latencyHint: "interactive" });
      await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain(); gain.gain.value = s.micVol / 100;
      const delay = ctx.createDelay(1.0); delay.delayTime.value = s.delayMs / 1000;
      const convolver = ctx.createConvolver(); convolver.buffer = createHallIR(ctx);
      const wet = ctx.createGain(); wet.gain.value = s.reverb / 100;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
      src.connect(analyser);
      src.connect(gain).connect(delay);
      delay.connect(ctx.destination); // dry
      delay.connect(convolver).connect(wet).connect(ctx.destination); // wet
      audio.current = { ctx, stream, src, gain, delay, wet, analyser, raf: 0 };
      setMicOn(true);
      refreshDevices();
      draw();
      return true;
    } catch (err: any) {
      const name = err?.name;
      toast.error(name === "NotAllowedError" ? "Permissão de microfone negada. Libere nas configurações do navegador."
        : name === "NotFoundError" ? "Nenhum microfone encontrado." : "Erro ao acessar o microfone.");
    }
  }

  function stopMic() {
    const a = audio.current; if (!a) return;
    cancelAnimationFrame(a.raf);
    a.stream.getTracks().forEach((t) => t.stop());
    a.ctx.close();
    audio.current = null;
    setMicOn(false);
    const c = canvasRef.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
  }

  async function changeDevice(id: string) {
    setDeviceId(id);
    if (audio.current) { stopMic(); await startMic(id); }
  }

  function draw() {
    const a = audio.current, c = canvasRef.current; if (!a || !c) return;
    const g = c.getContext("2d")!;
    const data = new Uint8Array(a.analyser.frequencyBinCount);
    const css = getComputedStyle(document.documentElement);
    const c1 = css.getPropertyValue("--neon").trim(), c2 = css.getPropertyValue("--neon-2").trim();
    
    const loop = () => {
      if (audio.current !== a) return;
      const w = (c.width = c.clientWidth * devicePixelRatio), h = (c.height = c.clientHeight * devicePixelRatio);
      a.analyser.getByteFrequencyData(data);
      g.clearRect(0, 0, w, h);
      const grad = g.createLinearGradient(0, h, 0, 0); grad.addColorStop(0, c1); grad.addColorStop(1, c2);
      g.fillStyle = grad;
      const n = 48, bw = w / n;
      
      let frameSum = 0; // Acumulador de volume para a nota
      
      for (let i = 0; i < n; i++) {
        const rawVal = data[Math.floor((i / n) * data.length * 0.7)] ?? 0;
        frameSum += rawVal;
        
        const v = rawVal / 255;
        const bh = Math.max(2, v * h);
        g.fillRect(i * bw + 2, h - bh, bw - 4, bh);
      }
      
      // Regista os níveis de voz para o cálculo do Score no fim da música
      const frameAvg = frameSum / n;
      if (frameAvg > 10) { 
        scoreData.current.totalVol += frameAvg;
        scoreData.current.samples += 1;
      }
      
      a.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  const limitLabel = plan === "free" ? `${Math.min(playCount, FREE_PLAY_LIMIT)}/${FREE_PLAY_LIMIT} músicas grátis` : "VIP ilimitado";

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      {vip && <VipModal onClose={() => setVip(false)} />}
      
      {/* SCORE MODAL - Janela de Pontuação */}
      {showScoreModal && score !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="glass flex flex-col items-center justify-center space-y-4 rounded-3xl p-12 text-center shadow-2xl animate-in zoom-in-95 duration-500">
            <Sparkles className="h-16 w-16 text-accent animate-pulse" />
            <h2 className="text-3xl font-bold">Pontuação Final</h2>
            <div className="neon-text text-9xl font-black">{score}</div>
            <p className="text-xl font-medium text-muted-foreground">
              {score >= 95 ? "Nasceu uma estrela! 🌟" : score >= 80 ? "Mandou muito bem! 🎤" : "O que vale é a intenção! 😂"}
            </p>
            <p className="mt-4 animate-pulse text-sm text-accent">Preparando a próxima música...</p>
          </div>
        </div>
      )}

      <header className="mb-8 flex flex-wrap items-center gap-3">
        <div className="btn-neon rounded-xl p-2"><AudioLines className="h-6 w-6" /></div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight"><span className="neon-text">Kanta Brasil</span></h1>
          <p className="text-sm text-muted-foreground">Sincronize sua voz com o YouTube na caixa Bluetooth.</p>
        </div>
        {ready && (userId ? (
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground">{limitLabel}</span>
            <button onClick={signOut} aria-label="Sair" className="rounded-xl border border-border p-2 text-muted-foreground"><LogOut className="h-4 w-4" /></button>
          </div>
        ) : (
          <Link to="/auth" className="btn-neon rounded-xl px-4 py-2 text-sm font-semibold">Entrar / Criar conta</Link>
        ))}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
        <section className="glass space-y-4 p-5">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); loadVideo(); }}>
            <div className="relative flex-1">
              <Youtube className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Cole o link do YouTube (youtube.com ou youtu.be)"
                className="w-full rounded-xl border border-input bg-glass py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <button type="submit" className="btn-neon flex items-center gap-2 rounded-xl px-4 text-sm font-semibold"><Play className="h-4 w-4" />Carregar</button>
          </form>
          <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-background/60">
            <div ref={playerHost} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
            {!videoId && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground"><Music className="h-10 w-10" /><span className="text-sm">Nenhum vídeo carregado</span></div>}
            {current && videoId && (
              <div className="pointer-events-none absolute bottom-12 left-4 right-4 flex items-center gap-3 rounded-xl border border-border bg-background/75 px-4 py-2 backdrop-blur">
                <Mic className="h-5 w-5 shrink-0 text-accent" />
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold"><span className="neon-text">{current.singer_name}</span></p>
                  {current.instagram_handle && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Instagram className="h-3 w-3" />@{current.instagram_handle}</p>}
                </div>
              </div>
            )}
          </div>
          {userId && queue.some((q) => q.status === "pending") && (
            <button onClick={() => void playNext()} className="flex items-center gap-2 text-sm text-accent"><SkipForward className="h-4 w-4" />Próxima da fila</button>
          )}
        </section>
        {userId && <PartyPanel userId={userId} queue={queue} onPlay={(q) => void playItem(q)} onRemove={(id) => void removeItem(id)} />}
        </div>


        <section className="glass flex flex-col gap-6 p-5">
          <label className="block space-y-2">
            <span className="flex items-center gap-2 text-sm text-muted-foreground"><Mic className="h-4 w-4 text-accent" />Microfone</span>
            <select value={deviceId} onChange={(e) => changeDevice(e.target.value)}
              className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
              <option value="">Padrão do sistema</option>
              {devices.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Microfone ${i + 1}`}</option>
              ))}
            </select>
            {devices.every((d) => !d.label) && <span className="text-xs text-muted-foreground">Ative o microfone uma vez para ver os nomes dos dispositivos.</span>}
          </label>
          <button onClick={micOn ? stopMic : () => startMic()}
            className={micOn ? "flex items-center justify-center gap-2 rounded-xl border border-destructive py-3 font-semibold text-destructive" : "btn-neon flex items-center justify-center gap-2 rounded-xl py-3 font-semibold"}>
            {micOn ? <><MicOff className="h-5 w-5" />Desativar Microfone</> : <><Mic className="h-5 w-5" />Ativar Microfone</>}
          </button>
          <canvas ref={canvasRef} className="h-24 w-full rounded-xl border border-border bg-background/50" />
          <Slider icon={Volume2} label="Volume da Música" value={musicVol} max={100} unit="%" onChange={setMusicVol} />
          <Slider icon={Mic} label="Volume do Microfone" value={micVol} max={100} unit="%" onChange={setMicVol} />
          <Slider icon={Timer} label="Delay do Microfone" value={delayMs} max={1000} unit="ms" onChange={setDelayMs} />
          <Slider icon={Sparkles} label="Efeito de Salão (Reverb)" value={reverb} max={100} unit="%" onChange={setReverb} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Dica: o Bluetooth atrasa a música. Aumente o delay até sua voz sair junto com ela na caixa (normalmente 150–300ms). Seus ajustes ficam salvos automaticamente.
          </p>
        </section>
      </div>
    </main>
  );
}