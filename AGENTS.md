<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Paywall play counting lives in DB functions (consume_play, play_queue_item); never let clients update profiles directly — keeps the free limit tamper-proof.
- Guest view is the "/" route with ?room=<host uuid>; guests are anonymous and may only INSERT pending rows into queue.
