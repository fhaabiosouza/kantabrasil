CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  play_count int NOT NULL DEFAULT 0,
  plan_tier text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.profiles (id) VALUES (NEW.id) ON CONFLICT DO NOTHING; RETURN NEW; END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  youtube_url text NOT NULL CHECK (char_length(youtube_url) BETWEEN 5 AND 300),
  singer_name text NOT NULL CHECK (char_length(btrim(singer_name)) BETWEEN 1 AND 60),
  instagram_handle text CHECK (instagram_handle IS NULL OR char_length(instagram_handle) <= 40),
  song_title text NOT NULL DEFAULT 'Música' CHECK (char_length(song_title) <= 200),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','playing')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.queue TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue TO authenticated;
GRANT ALL ON public.queue TO service_role;
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guests add pending songs" ON public.queue FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = room_id));
CREATE POLICY "host reads own queue" ON public.queue FOR SELECT TO authenticated USING (auth.uid() = room_id);
CREATE POLICY "host deletes own queue" ON public.queue FOR DELETE TO authenticated USING (auth.uid() = room_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue;

-- profiles existence check for anon inserts needs a definer helper (anon can't read profiles)
CREATE OR REPLACE FUNCTION public.room_exists(_room uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _room) $$;
DROP POLICY "guests add pending songs" ON public.queue;
CREATE POLICY "guests add pending songs" ON public.queue FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending' AND public.room_exists(room_id));

-- Paywall: consume one play (free tier max 3). Returns false when blocked.
CREATE OR REPLACE FUNCTION public.consume_play() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p.plan_tier = 'free' AND p.play_count >= 3 THEN RETURN false; END IF;
  UPDATE public.profiles SET play_count = play_count + 1 WHERE id = p.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.consume_play() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_play() TO authenticated;

-- Start a queued song: checks paywall, marks it playing.
CREATE OR REPLACE FUNCTION public.play_queue_item(_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.queue WHERE id = _id AND room_id = auth.uid()) THEN RETURN false; END IF;
  IF NOT public.consume_play() THEN RETURN false; END IF;
  DELETE FROM public.queue WHERE room_id = auth.uid() AND status = 'playing';
  UPDATE public.queue SET status = 'playing' WHERE id = _id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.play_queue_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.play_queue_item(uuid) TO authenticated;