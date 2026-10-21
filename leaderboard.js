// Optional leaderboard: GitHub sign-in through Supabase, seasons, and a ranking by
// perfect-throw rate. Does nothing until config.js has a Supabase URL and anon key.
// The game only announces finished throws (the `sphere:throw` event); everything else lives here.
(() => {
  const cfg = window.SPHERE_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  const TOP = 20;

  let sb = null, user = null, season = null, open = false, timer = null;

  // ---------- UI ----------
  const style = document.createElement('style');
  style.textContent = `
    #lb {
      position: fixed; z-index: 20; pointer-events: auto;
      top: calc(72px + env(safe-area-inset-top, 0px));
      right: max(16px, env(safe-area-inset-right, 0px));
      bottom: calc(16px + env(safe-area-inset-bottom, 0px));
      width: min(380px, calc(100vw - 32px)); box-sizing: border-box;
      overflow-y: auto; overscroll-behavior: contain;
      background: var(--bg); color: var(--fg);
      border: 1px solid var(--socket); border-radius: 14px;
      padding: 18px; display: flex; flex-direction: column; gap: 16px;
      box-shadow: 0 12px 40px rgba(0,0,0,.25);
      font-family: var(--font-body); user-select: text; -webkit-user-select: text;
    }
    #lb header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    #lb h2 { margin: 0; font: 700 18px var(--font-display); }
    #lb h3 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); font-weight: 700; }
    #lb .x { background: none; border: 0; color: var(--muted); font-size: 22px; line-height: 1; cursor: pointer; padding: 2px 6px; }
    #lb .x:focus-visible, #lb button:focus-visible { outline: 2px solid var(--sphere); outline-offset: 2px; }
    #lb .meta { font: 13px var(--font-data); color: var(--muted); font-variant-numeric: tabular-nums; }
    #lb .bar { height: 6px; border-radius: 3px; background: var(--socket); overflow: hidden; margin-top: 8px; }
    #lb .bar i { display: block; height: 100%; background: var(--sphere); }
    #lb .me { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 10px; background: var(--bg-deep); }
    #lb .me p { margin: 0; font-size: 13px; line-height: 1.4; flex: 1; min-width: 0; }
    #lb .gh {
      font: 500 13px var(--font-data); color: var(--bg); background: var(--fg);
      border: 0; border-radius: 999px; padding: 9px 14px; cursor: pointer; white-space: nowrap;
    }
    #lb .link { background: none; border: 0; padding: 0; color: var(--muted); font: inherit; font-size: 12px; text-decoration: underline; cursor: pointer; }
    #lb ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    #lb li {
      display: grid; grid-template-columns: 2.2em 22px minmax(0, 1fr) auto auto; align-items: center; gap: 8px;
      padding: 7px 4px; border-bottom: 1px solid var(--socket); font-size: 14px;
    }
    #lb li:last-child { border-bottom: 0; }
    #lb li.mine { background: var(--bg-deep); border-radius: 6px; }
    #lb li .rank, #lb li .rate, #lb li .count { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
    #lb li .rank { color: var(--muted); text-align: right; }
    #lb li .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #lb li .rate { font-weight: 500; text-align: right; }
    #lb li .count { color: var(--muted); font-size: 12px; text-align: right; min-width: 4.5em; }
    #lb img.av { width: 22px; height: 22px; border-radius: 50%; background: var(--socket); }
    #lb .me img.av { width: 32px; height: 32px; }
    #lb .empty, #lb .note { font-size: 13px; color: var(--muted); margin: 0; line-height: 1.45; }
    #lb .winners { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
    #lb .winners div { display: flex; gap: 8px; flex-wrap: wrap; }
    #lb .winners b { font-family: var(--font-data); font-weight: 500; min-width: 5.5em; color: var(--muted); }
    #lb .status { font: 12px var(--font-data); color: var(--strain); min-height: 1em; margin: 0; }
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'lb-open'; btn.className = 'toggle'; btn.type = 'button';
  btn.textContent = 'LEADERBOARD';
  btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'lb');
  document.querySelector('.toggles')?.appendChild(btn);

  const panel = document.createElement('aside');
  panel.id = 'lb'; panel.hidden = true; panel.setAttribute('aria-label', 'Leaderboard');
  panel.innerHTML = `
    <header><h2 id="lb-title">Leaderboard</h2><button class="x" type="button" aria-label="Close leaderboard">×</button></header>
    <section><div class="meta" id="lb-season">Loading…</div><div class="bar"><i id="lb-bar" style="width:0%"></i></div></section>
    <section class="me" id="lb-me"></section>
    <section><h3>This season</h3><ol id="lb-rows"></ol></section>
    <p class="note">Rating is your share of throws with a Perfect corner, adjusted for how many throws you've made, so a few lucky throws can't top the board.</p>
    <section><h3>Past seasons</h3><div class="winners" id="lb-winners"></div></section>
    <p class="status" id="lb-status" aria-live="polite"></p>`;
  document.body.appendChild(panel);
  const $ = id => panel.querySelector('#' + id);

  // open just below the top bar, whose height depends on how its buttons wrap
  function place() {
    const bar = document.querySelector('.hud.top');
    if (bar) panel.style.top = `${Math.round(bar.getBoundingClientRect().bottom + 10)}px`;
  }
  addEventListener('resize', () => { if (open) place(); });

  function setOpen(v) {
    open = v; panel.hidden = !v; btn.setAttribute('aria-expanded', String(v));
    if (v) place();
    clearInterval(timer);
    if (v) { refresh(); timer = setInterval(refresh, 30000); }
  }
  btn.addEventListener('click', () => setOpen(!open));
  panel.querySelector('.x').addEventListener('click', () => setOpen(false));
  addEventListener('keydown', e => { if (e.key === 'Escape' && open) setOpen(false); });

  const status = msg => { $('lb-status').textContent = msg || ''; };
  const pct = r => `${Math.round((r || 0) * 100)}%`;
  const num = n => Number(n || 0).toLocaleString('en-US');
  function avatar(url) {
    const img = document.createElement('img');
    img.className = 'av'; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    if (typeof url === 'string' && url.startsWith('https://')) img.src = url;
    return img;
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------- rendering ----------
  function renderSeason() {
    if (!season) { $('lb-title').textContent = 'Leaderboard'; $('lb-season').textContent = 'No season yet. The first throw starts one.'; $('lb-bar').style.width = '0%'; return; }
    $('lb-title').textContent = `Season ${season.number}`;
    const daysLeft = Math.ceil((new Date(season.ends_at) - Date.now()) / 86400000);
    const over = daysLeft <= 0 || season.counted_throws >= season.throw_target;
    $('lb-season').textContent = over
      ? `Season ${season.number} is over. The next throw starts season ${season.number + 1}.`
      : `${num(season.counted_throws)} of ${num(season.throw_target)} throws · ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'} at most`;
    $('lb-bar').style.width = `${Math.min(100, (season.counted_throws / season.throw_target) * 100)}%`;
  }

  function renderMe(mine, rank) {
    const box = $('lb-me'); box.replaceChildren();
    if (!user) {
      box.append(el('p', null, 'Sign in with GitHub to put your throws on the leaderboard. Playing without signing in stays anonymous.'));
      const b = el('button', 'gh', 'Sign in with GitHub'); b.type = 'button';
      b.addEventListener('click', signIn);
      box.append(b);
      return;
    }
    const md = user.user_metadata || {};
    box.append(avatar(md.avatar_url));
    const p = el('p');
    p.append(el('strong', null, '@' + (md.user_name || md.preferred_username || 'you')), document.createElement('br'));
    p.append(mine
      ? `#${rank} · ${pct(mine.rating)} · ${mine.perfect_throws} perfect of ${mine.throws} throws`
      : 'No throws this season yet. Free a sphere to join.');
    p.append(document.createElement('br'));
    const out = el('button', 'link', 'Sign out'); out.type = 'button';
    out.addEventListener('click', () => sb.auth.signOut());
    p.append(out);
    box.append(p);
  }

  function renderRows(rows) {
    const ol = $('lb-rows'); ol.replaceChildren();
    if (!rows.length) { ol.append(el('li', 'empty', 'No throws yet this season.')); return; }
    rows.forEach((r, i) => {
      const li = el('li', user && r.user_id === user.id ? 'mine' : null);
      li.append(el('span', 'rank', String(i + 1)), avatar(r.avatar_url), el('span', 'name', r.username),
        el('span', 'rate', pct(r.rating)), el('span', 'count', `${r.perfect_throws}/${r.throws}`));
      li.title = `${r.perfect_throws} perfect throws of ${r.throws}, ${r.perfects} perfect corners`;
      ol.append(li);
    });
  }

  function renderWinners(list) {
    const box = $('lb-winners'); box.replaceChildren();
    if (!list.length) { box.append(el('p', 'empty', 'No finished seasons yet.')); return; }
    const bySeason = new Map();
    list.forEach(w => { if (!bySeason.has(w.season_number)) bySeason.set(w.season_number, []); bySeason.get(w.season_number).push(w); });
    [...bySeason].slice(0, 5).forEach(([n, ws]) => {
      const row = el('div');
      row.append(el('b', null, `Season ${n}`));
      ws.sort((a, b) => a.place - b.place).forEach(w => row.append(el('span', null, `${w.place}. ${w.username} ${pct(w.rating)}`)));
      box.append(row);
    });
  }

  // ---------- data ----------
  async function refresh() {
    try {
      const s = await sb.from('seasons').select('*').is('ended_at', null).order('number', { ascending: false }).limit(1);
      if (s.error) throw s.error;
      season = s.data[0] || null;
      renderSeason();

      let rows = [], mine = null, rank = null;
      if (season) {
        const r = await sb.from('leaderboard').select('*').eq('season_id', season.id)
          .order('rating', { ascending: false }).order('perfects', { ascending: false }).limit(TOP);
        if (r.error) throw r.error;
        rows = r.data;
        if (user) {
          const m = await sb.from('leaderboard').select('*').eq('season_id', season.id).eq('user_id', user.id).maybeSingle();
          if (m.error) throw m.error;
          mine = m.data;
          if (mine) {
            const above = await sb.from('leaderboard').select('user_id', { count: 'exact', head: true })
              .eq('season_id', season.id).gt('rating', mine.rating);
            rank = (above.count || 0) + 1;
          }
        }
      }
      renderRows(rows);
      renderMe(mine, rank);

      const w = await sb.from('season_winners').select('*').order('season_number', { ascending: false }).order('place').limit(15);
      if (w.error) throw w.error;
      renderWinners(w.data);
      status('');
    } catch (err) {
      if (!season) $('lb-season').textContent = "Couldn't reach the leaderboard right now.";
      status(`Couldn't load the leaderboard: ${err.message || err}`);
    }
  }

  async function signIn() {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) status(`Sign-in failed: ${error.message}`);
  }

  window.addEventListener('sphere:throw', async e => {
    if (!sb || !user) return;
    const d = e.detail;
    const { error } = await sb.rpc('submit_throw', {
      p_resistance: d.resistance, p_held_ms: d.heldMs, p_corners: d.corners,
      p_perfects: d.perfects, p_best_miss: d.bestMiss,
    });
    if (error) status(`Throw not saved: ${error.message}`);
    else if (open) refresh();
  });

  // ---------- start ----------
  const lib = document.createElement('script');
  lib.src = LIB;
  lib.onerror = () => { btn.disabled = true; btn.title = "The leaderboard couldn't load. Check your connection."; };
  lib.onload = () => {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
    });
    sb.auth.onAuthStateChange((event, session) => {
      user = session?.user ?? null;
      btn.textContent = user ? 'LEADERBOARD ●' : 'LEADERBOARD';
      if (event === 'SIGNED_IN' && location.search.includes('code=')) history.replaceState(null, '', location.pathname);
      if (open) refresh(); else renderMe(null, null);
    });
  };
  document.head.appendChild(lib);
})();
