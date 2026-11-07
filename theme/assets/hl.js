/* hl.js: Hookline's shared engine (window.HL), moved unchanged from the JavaScript version: icons, the post checker
   (HL.check), hook scoring, the feed preview with the "see more" fold, Unicode clean-up, hook formulas, post structures,
   idea prompts and voice statistics. Python reaches it through client_code/hl.py (HL.py: JSON text in and out).
   The first block brings back the few date/name helpers of the old window.UI that the engine uses. */
(function () {
  'use strict';
  var UI = window.UI = window.UI || {};
  UI.initials = UI.initials || function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };
  UI.fmtDate = UI.fmtDate || function (iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  UI.fmtDateTime = UI.fmtDateTime || function (iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };
  UI.ago = UI.ago || function (iso) {
    if (!iso) return '';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    var steps = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']], n = s / 60;
    for (var i = 0; i < steps.length; i++) {
      if (n < steps[i][0]) { n = Math.floor(n); return UI.plural(n, steps[i][1]) + ' ago'; }
      n = n / steps[i][0];
    }
    return '';
  };
})();

(function () {
  'use strict';
  var HL = window.HL = window.HL || {};
  var esc = UI.esc;

  var more = {
    pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    hook: '<circle cx="14" cy="4.5" r="1.8"/><path d="M14 6.5v8.5a4.5 4.5 0 0 1-9 0v-2l2.5 2"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    wand: '<path d="m4 20 11-11M14 4v3M19 9h-3M18 5l-2 2"/>',
    send: '<path d="M21 3 3 10.5l7 2.5 2.5 7z"/><path d="m21 3-11 10"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2.5 2.5 0 0 1 5 0v4M12 10v7"/>',
    feather: '<path d="M20 4c-8 0-14 6-14 14v2"/><path d="M20 4c0 7-5 12-12 12"/><path d="M14 10H9"/>',
    flame: '<path d="M12 21c-4 0-7-2.7-7-6.5 0-4 4-6 3.5-10.5C12 6 14 9 14 11c1-1 1.5-2.5 1.5-3.5C18 9.5 19 12 19 14.5 19 18.3 16 21 12 21z"/>',
    recycle: '<path d="M7 19H4l2.5-4.3M17 19h3l-2.5-4.3M12 4l1.5 2.6M9 7l3-3 3 3"/><path d="M6.5 14.7 9 10M17.5 14.7 15 10M7 19h10"/>',
    comment: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/><path d="M8 11h8M8 14h5"/>',
    broom: '<path d="M19 3 9 13"/><path d="M5 21c4-1 7-3 8-6l-4-4c-3 1-5 4-6 8z"/>',
    slides: '<rect x="3" y="5" width="13" height="15" rx="2"/><path d="M19 7v11M22 9v7"/>',
    up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'
  };
  Object.keys(more).forEach(function (k) { UI.ICONS[k] = more[k]; });

  /* ------------------------------------------------------------------ small helpers */
  HL.FOLD = { desktop: 210, mobile: 140 };   // about where LinkedIn cuts with "see more" (third-party measurements)
  HL.LIMIT = 3000;
  HL.STATUS = { idea: 'Idea', draft: 'Draft', scheduled: 'Scheduled', posted: 'Posted' };
  HL.FORMATS = { text: ['Text', 'feather'], image: ['Image', 'image'], carousel: ['Carousel (PDF)', 'slides'], video: ['Video', 'play'], poll: ['Poll', 'chart'], article: ['Link / article', 'link'] };
  HL.hook = function (text) { return String(text || '').trim().split(/\n/)[0].trim(); };
  HL.pillar = function (ws, id) { return (ws.profile.pillars || []).filter(function (p) { return p.id === id; })[0] || null; };
  HL.pillarChip = function (ws, id) {
    var p = HL.pillar(ws, id);
    return p ? '<span class="hl-chip" style="--pc:' + esc(p.color) + '"><i></i>' + esc(p.name) + '</span>' : '';
  };
  HL.fmtNum = function (n) { n = +n || 0; return n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k' : Math.round(n).toLocaleString(); };
  HL.engagements = function (m) { m = m || {}; return m.engagements || ((m.reactions || 0) + (m.comments || 0) + (m.reposts || 0)); };
  HL.rate = function (m) { m = m || {}; return m.impressions ? 100 * HL.engagements(m) / m.impressions : null; };
  HL.when = function (p) { return p.status === 'posted' ? p.posted_at : p.scheduled_at; };
  HL.localInput = function (iso) {   // ISO -> value for <input type=datetime-local>
    if (!iso) return '';
    var d = new Date(iso), z = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes());
  };
  HL.fromLocal = function (v) { return v ? new Date(v).toISOString() : null; };
  HL.dayKey = function (d) { d = new Date(d); var z = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };
  HL.due = function (ws) {
    var now = Date.now();
    return ws.posts.filter(function (p) { return p.status === 'scheduled' && p.scheduled_at && new Date(p.scheduled_at).getTime() <= now + 15 * 60000; });
  };
  HL.load = function () { return UI.api('get_workspace').then(function (ws) { HL.ws = ws; return ws; }); };
  HL.copy = function (text, msg) {
    var done = function () { UI.toast(msg || 'Copied', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(done, function () { prompt('Copy this:', text); });
    prompt('Copy this:', text); return Promise.resolve();
  };
  /* The no-API route: copy the post, then open LinkedIn's share box (it may or may not pre-fill the text). */
  HL.openLinkedIn = function (text) {
    HL.copy(text, 'Copied. Paste it into LinkedIn (Ctrl+V).');
    window.open('https://www.linkedin.com/feed/?shareActive=true&text=' + encodeURIComponent(text), '_blank', 'noopener');
  };
  HL.loadScript = function (src, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = function () { res(window[globalName]); }; s.onerror = rej; document.head.appendChild(s);
    });
  };

  /* ------------------------------------------------------------------ text analysis */
  var STYLED = /[\u{1D400}-\u{1D7FF}]/u;
  HL.plain = function (s) {   // mathematical bold/italic "fonts" -> normal letters (NFKC does exactly this)
    return String(s || '').normalize('NFKC').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  };
  HL.sentences = function (s) { return String(s || '').split(/(?<=[.!?])\s+|\n+/).map(function (x) { return x.trim(); }).filter(function (x) { return /[a-zA-ZÀ-ÿ]/.test(x); }); };
  HL.words = function (s) { return (String(s || '').match(/[A-Za-zÀ-ÿ0-9'’-]+/g) || []); };
  function syllables(w) {
    w = w.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    var m = w.match(/[aeiouy]{1,2}/g); return m ? m.length : 1;
  }
  HL.grade = function (s) {   // Flesch-Kincaid grade (English)
    var w = HL.words(s), sn = Math.max(1, HL.sentences(s).length);
    if (w.length < 12) return null;
    var syl = w.reduce(function (a, x) { return a + syllables(x); }, 0);
    return Math.max(0, Math.round((0.39 * w.length / sn + 11.8 * syl / w.length - 15.59) * 10) / 10);
  };
  HL.CLICHES = ["in today's fast-paced world", "let that sink in", "here's the thing", "game-changer", "game changer", "delve", "tapestry",
    "navigate the complexities", "in today's digital age", "i'm humbled", "humbled and honored", "excited to announce", "thrilled to announce",
    "buckle up", "a thread", "🧵", "unlock the power", "unleash", "synergy", "rockstar", "ninja", "crushing it", "10x your", "paradigm shift",
    "ever-evolving landscape", "the landscape of", "embark on", "in the realm of", "a testament to", "foster a culture", "seamless", "cutting-edge",
    "deep dive", "it's worth noting", "at the end of the day", "move the needle", "think outside the box", "low-hanging fruit", "circle back",
    "elevate your", "supercharge", "harness the power", "the secret sauce", "nobody talks about", "read that again", "this is huge"];
  HL.BAIT = [/\bcomment ["'“]?\w+["'”]? (below|if|and)\b/i, /\blike (this|if)\b/i, /\btag (someone|a friend|3)\b/i, /\bshare (this|if)\b/i, /\bfollow me for more\b/i, /\bagree\?\s*$/im, /\b(type|drop) ["'“]?(yes|1|🔥)/i];
  var EMOJI = /\p{Extended_Pictographic}/gu;

  /* Visible text before LinkedIn's "see more", roughly: 3 lines of feed text or the character limit. */
  HL.foldCut = function (text, mode) {
    var limit = HL.FOLD[mode || 'desktop'], perLine = mode === 'mobile' ? 44 : 68, lines = String(text || '').split('\n'), used = 0, vis = 0, out = [];
    for (var i = 0; i < lines.length && vis < 3; i++) {
      var L = lines[i], rows = Math.max(1, Math.ceil(L.length / perLine));
      if (vis + rows > 3) { var keep = (3 - vis) * perLine; out.push(L.slice(0, keep)); used += keep; vis = 3; break; }
      out.push(L); used += L.length + 1; vis += rows;
      if (used >= limit) break;
    }
    var shown = out.join('\n');
    if (shown.length > limit) shown = shown.slice(0, limit);
    return { shown: shown.replace(/\s+$/, ''), cut: shown.replace(/\s+$/, '').length < String(text || '').trim().length };
  };

  HL.hookScore = function (line) {
    var s = String(line || '').trim(), score = 50, why = [];
    if (!s) return { score: 0, why: ['Write a first line.'] };
    var L = s.length;
    if (L <= 60) { score += 14; why.push('Short: it lands before anyone scrolls.'); }
    else if (L <= 110) { score += 8; }
    else if (L > HL.FOLD.mobile) { score -= 18; why.push('Longer than ~140 characters: phones cut it.'); }
    if (/\d/.test(s)) { score += 8; why.push('A number makes it concrete.'); }
    if (/\b(I|my|me|we)\b/i.test(s) && /\b(was|did|made|lost|quit|failed|spent|learned|got|said|stopped|almost)\b/i.test(s)) { score += 8; why.push('A personal moment invites people in.'); }
    if (/\b(but|instead|not|stop|wrong|unpopular|never|myth|mistake)\b/i.test(s)) { score += 8; why.push('Tension or contrast creates curiosity.'); }
    if (/\?$/.test(s)) { score += 4; }
    if (/:$/.test(s)) { score += 4; why.push('A colon promises what comes next.'); }
    if (/^(i'?m (so )?(excited|thrilled|happy|proud)|happy (monday|friday)|in today'?s|as a\b|hello|hi everyone)/i.test(s)) { score -= 20; why.push('A generic opener: say the interesting part first.'); }
    var cl = HL.CLICHES.filter(function (c) { return s.toLowerCase().indexOf(c) >= 0; });
    if (cl.length) { score -= 15; why.push('Sounds like a template ("' + cl[0] + '").'); }
    if (STYLED.test(s)) { score -= 15; why.push('Fancy Unicode letters: screen readers stumble.'); }
    if ((s.match(EMOJI) || []).length > 2) { score -= 6; why.push('Too many emoji for a first line.'); }
    if (/^[A-Z\s\d!?]{16,}$/.test(s)) { score -= 8; why.push('All caps reads as shouting.'); }
    return { score: Math.max(0, Math.min(100, score)), why: why };
  };

  /* The post checker: {score, items: [{level: bad|warn|tip|good, title, text, fix}]} */
  HL.check = function (text, firstComment) {
    var t = String(text || ''), items = [], add = function (level, title, txt, fix) { items.push({ level: level, title: title, text: txt || '', fix: fix || null }); };
    if (!t.trim()) return { score: 0, items: [], chars: 0 };
    var chars = t.length, hook = HL.hook(t), low = t.toLowerCase();
    if (chars > HL.LIMIT) add('bad', 'Over 3,000 characters', 'LinkedIn won\'t accept it. Cut ' + (chars - HL.LIMIT) + ' characters.');
    if (STYLED.test(t)) add('bad', 'Fancy Unicode letters', 'Bold/italic "fonts" are maths symbols: screen readers read them letter by letter and search can\'t find them.', 'plain');
    var hs = HL.hookScore(hook);
    var fd = HL.foldCut(t, 'mobile');
    if (hook.length > HL.FOLD.mobile) add('warn', 'Your hook is cut on phones', 'The first line is ' + hook.length + ' characters; phones show about 140 before "see more".');
    else if (hs.score >= 70) add('good', 'Strong first line', hs.why[0] || 'Short and specific.');
    else add('tip', 'The first line could pull harder', (hs.why.filter(function (w) { return /generic|template|cut/i.test(w); })[0]) || 'Try a number, a tension, or the most surprising part first.');
    if (fd.cut && fd.shown.split('\n').length >= 3 && !/\n/.test(fd.shown.slice(0, Math.min(fd.shown.length, hook.length + 2)))) add('tip', 'Leave a gap after the hook', 'A blank line after the first line makes people tap "see more".');
    var links = t.match(/https?:\/\/\S+/g) || [];
    if (links.length) add('warn', 'Link in the post', 'Posts with outside links tend to reach fewer people. Move it to the first comment and say "link in the comments".', 'link');
    var tags = t.match(/(^|\s)#[\wÀ-ÿ]+/g) || [];
    if (tags.length > 5) add('warn', tags.length + ' hashtags', 'LinkedIn says hashtags are "nice to have". Keep 0 to 3 that people actually follow.');
    else if (tags.length) add('good', tags.length + ' hashtag' + (tags.length > 1 ? 's' : ''), 'A light touch.');
    var paras = t.split(/\n\s*\n/);
    var longP = paras.filter(function (p) { return p.length > 300; }).length;
    if (longP) add('tip', longP + ' long paragraph' + (longP > 1 ? 's' : ''), 'On a phone, 300+ characters is a wall. Break it into 1 or 2 sentence paragraphs.');
    var em = (t.match(EMOJI) || []).length, emLines = t.split('\n').filter(function (l) { return /^\s*\p{Extended_Pictographic}/u.test(l); }).length;
    if (em > 10 || emLines > 6) add('tip', em + ' emoji', 'Emoji bullets everywhere can read as automated. Keep the ones that carry meaning.');
    var cl = HL.CLICHES.filter(function (c) { return low.indexOf(c) >= 0; });
    if (cl.length) add('warn', 'Sounds templated', 'People skim past: "' + cl.slice(0, 4).join('", "') + '". Say it the way you would out loud.');
    var bait = HL.BAIT.filter(function (r) { return r.test(t); }).length;
    if (bait) add('warn', 'Engagement bait', 'Asking for likes, tags or "comment YES" is something LinkedIn says it shows less. Ask a real question instead.');
    var dashes = (t.match(/—/g) || []).length;
    if (dashes > 3) add('tip', dashes + ' em dashes', 'Lots of em dashes is a tell many readers associate with AI writing. Try full stops.');
    var caps = (t.match(/\b[A-Z]{4,}\b/g) || []).filter(function (w) { return !/^(USA|NASA|HTML|SaaS|CEO|CTO|API|KPI|ROI|UX|UI)$/.test(w); }).length;
    if (caps > 3) add('tip', 'Shouting', caps + ' words in capitals. Emphasis works best once.');
    var grade = HL.grade(t);
    if (grade != null && grade > 12) add('warn', 'Hard to read (grade ' + grade + ')', 'Shorter sentences and everyday words. Aim for grade 8 or below.');
    else if (grade != null && grade > 9) add('tip', 'Reading level: grade ' + grade, 'Clear enough. Grade 8 or below reads faster on a phone.');
    else if (grade != null) add('good', 'Easy to read (grade ' + grade + ')', 'Short sentences, plain words.');
    var mentions = (t.match(/(^|\s)@\w/g) || []).length;
    if (mentions > 5) add('warn', mentions + ' people tagged', 'Tag only people who are part of the story; mass tags annoy and can hurt reach.');
    var lastLine = t.trim().split('\n').pop();
    if (/\?\s*$/.test(lastLine)) add('good', 'Ends with a question', 'It gives readers an easy way in.');
    else if (chars > 200) add('tip', 'No question at the end', 'One specific question people can answer in a line starts the comments.');
    var I = (low.match(/\b(i|my|me|i'm|i've)\b/g) || []).length, you = (low.match(/\b(you|your|you're)\b/g) || []).length;
    if (I > 10 && I > you * 4) add('tip', 'Lots of "I"', 'A line about what this means for the reader makes it theirs too.');
    if (chars < 120 && chars > 0) add('tip', 'Very short', 'Short can work. Make sure it says one clear thing.');
    if (firstComment && /https?:\/\//.test(firstComment) && !links.length) add('good', 'Link is in the first comment', 'Post it as a comment right after publishing.');
    var score = 100;
    items.forEach(function (i) { score -= { bad: 28, warn: 11, tip: 3, good: 0 }[i.level]; });
    var order = { bad: 0, warn: 1, tip: 2, good: 3 };
    items.sort(function (a, b) { return order[a.level] - order[b.level]; });
    return { score: Math.max(0, Math.min(100, score)), items: items, chars: chars, words: HL.words(t).length, grade: grade, hook: hs };
  };
  HL.checksHtml = function (c) {
    return '<ul class="hl-checks">' + c.items.map(function (i) {
      return '<li class="' + i.level + '"><i class="dot"></i><div><b>' + esc(i.title) + '</b><span>' + esc(i.text) + '</span></div>' +
        (i.fix === 'plain' ? '<button class="ui-btn sm" data-fix="plain">' + UI.icon('broom') + 'Fix</button>' : i.fix === 'link' ? '<button class="ui-btn sm" data-fix="link">Move</button>' : '') + '</li>';
    }).join('') + '</ul>';
  };
  HL.scoreRing = function (v) {
    var col = v >= 80 ? 'var(--c-good)' : v >= 55 ? 'var(--c-gold)' : 'var(--c-bad)';
    return '<div class="hl-score" style="--v:' + v + ';--sc:' + col + '" aria-label="Post score ' + v + ' of 100"><b>' + v + '</b></div>';
  };

  /* ------------------------------------------------------------------ the feed preview */
  HL.feedCard = function (text, o) {
    o = o || {};
    var mode = o.mode || 'desktop', t = String(text || ''), body;
    if (!t.trim()) body = '<span class="faint">Your post shows up here, cut where LinkedIn cuts it.</span>';
    else if (o.expanded) {
      var f = HL.foldCut(t, mode);
      body = f.cut ? esc(f.shown) + '<span class="fold" data-l="see more · ' + mode + '"></span>' + esc(t.trim().slice(f.shown.length).replace(/^\s+/, '')) : esc(t.trim());
    } else {
      var g = HL.foldCut(t, mode);
      body = esc(g.shown) + (g.cut ? '<span class="more" data-expand>…see more</span>' : '');
    }
    var fmt = o.format && o.format !== 'text' ? '<div class="hl-feed-media">' + esc((HL.FORMATS[o.format] || [o.format])[0]) + '</div>' : '';
    return '<div class="hl-feed ' + mode + '"><div class="hl-feed-head"><span class="hl-feed-av">' + esc(UI.initials(o.name || 'You')) + '</span><div><b>' + esc(o.name || 'You') + '</b>' +
      '<span>' + esc(o.headline || 'Your headline') + '</span><span>Now · 🌐</span></div></div><div class="hl-feed-text">' + body + '</div>' + fmt +
      '<div class="hl-feed-bar" aria-hidden="true"><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div></div>';
  };

  /* ------------------------------------------------------------------ writing help without AI */
  HL.FORMULAS = [
    ['story', 'I spent [time] doing [thing] wrong. Here\'s what fixed it.'], ['list', '[Number] things I wish I knew before [milestone]:'],
    ['opinion', 'Unpopular opinion: [belief].'], ['contrast', 'Most [people] [do X]. The best ones [do Y].'], ['result', '[Result] in [time]. No [common tactic].'],
    ['howto', 'Stop [common habit]. Do this instead:'], ['story', 'The worst advice I got about [topic]:'], ['story', 'A [client/colleague] asked me "[question]". My answer surprised them.'],
    ['story', '[Number] years ago I [failure]. Today [result].'], ['howto', 'The [number]-step [checklist] I use every [week]:'], ['opinion', 'I was wrong about [topic].'],
    ['contrast', '[Thing] isn\'t a [category] problem. It\'s a [other] problem.'], ['opinion', 'You don\'t need [common assumption] to [goal].'], ['story', 'We almost [disaster]. One [small thing] saved it.'],
    ['howto', 'The question I ask in every [meeting]:'], ['result', '[Tool/habit] costs $0 and saves me [time] a week.'], ['list', '[Number] [mistakes] I see in every [thing I review]:'],
    ['story', 'The day [event], I changed how I [do thing].'], ['contrast', '[Common belief]? The data says otherwise.'], ['howto', 'If you [situation], read this before you [action].']
  ];
  HL.STRUCTURES = {
    story: { name: 'Story', parts: ['Hook: the moment, in one line', 'Set the scene in two sentences', 'What went wrong (or what was at stake)', 'The turn: what you did or realised', 'The lesson, in plain words', 'A question for the reader'] },
    list: { name: 'List', parts: ['Hook: the number and the promise', 'One line on why it matters', '1. …', '2. …', '3. …', 'The one you\'d start with', 'A question'] },
    opinion: { name: 'Opinion', parts: ['Your claim, said plainly', 'What most people believe instead', 'Why you see it differently (evidence or a story)', 'Where you could be wrong', 'A question that invites both sides'] },
    howto: { name: 'How-to', parts: ['Hook: the result people get', 'Step 1', 'Step 2', 'Step 3', 'The mistake to avoid', 'What changes when you do it'] },
    case: { name: 'Before / after', parts: ['Hook: the result with a number', 'Before: the situation', 'What we changed', 'After: what happened (numbers)', 'What I\'d tell anyone trying this'] },
    behind: { name: 'Behind the scenes', parts: ['Hook: something people don\'t usually see', 'What a normal day/week looks like', 'The part that surprises people', 'Why you do it this way', 'Question'] }
  };
  HL.structureText = function (key) { return HL.STRUCTURES[key].parts.map(function (p) { return '[' + p + ']'; }).join('\n\n'); };
  HL.PROMPTS = {
    story: ['A moment this month you\'ll remember in a year', 'The first time you got paid for your work', 'A conversation that changed your mind', 'A time you almost quit', 'Something a customer said that stuck with you'],
    lesson: ['A mistake that cost you time or money, and what it taught you', 'Something you\'d tell yourself on day one', 'A rule you follow that you learned the hard way', 'What a failure taught you that a success didn\'t', 'Advice you ignored and later understood'],
    opinion: ['Common advice in your field you disagree with', 'A trend you think is overrated', 'Something everyone does that you stopped doing', 'A belief you changed this year', 'What your industry gets wrong about customers'],
    howto: ['A checklist you use before a big task', 'The tool or habit that saves you an hour a week', 'How you’d learn your job from scratch today', 'The 3 questions you ask at the start of every project', 'How you prepare for a hard conversation'],
    behind: ['What a normal Tuesday looks like for you', 'A part of your work nobody sees', 'How you decide what to say no to', 'What’s on your desk right now and why', 'How you plan your week'],
    numbers: ['A number from your work that surprised you', 'Before/after numbers from a recent project', 'How long something really takes', 'What you’d do with 10x the budget, and with 10% of it', 'A metric you stopped tracking and why']
  };
  HL.KINDS = { story: 'Story', lesson: 'Lesson', opinion: 'Opinion', howto: 'How-to', behind: 'Behind the scenes', numbers: 'Numbers' };
  HL.COMMENT_FRAMES = [
    ['Add a data point', 'In our case, [number/result] when we [did similar thing]. The part that mattered most was [detail].'],
    ['Share a related moment', 'This happened to me with [situation]. What helped was [specific thing].'],
    ['Ask a sharp question', 'Curious: how did you handle [specific part of their post]? That’s where I usually get stuck.'],
    ['Respectfully add a "but"', 'Agree on [point]. Where I’ve seen it break is [situation]: then [alternative] worked better.'],
    ['Sum up and extend', 'The line that stuck: "[quote]". I’d add [your addition].']
  ];

  /* ------------------------------------------------------------------ voice statistics (from pasted past posts) */
  HL.voiceStats = function (samples) {
    var posts = (samples || []).filter(function (s) { return s && s.trim(); });
    if (!posts.length) return null;
    var all = posts.join('\n\n'), sents = HL.sentences(all), words = HL.words(all);
    var avg = function (f) { return posts.reduce(function (a, p) { return a + f(p); }, 0) / posts.length; };
    return {
      posts: posts.length,
      chars: Math.round(avg(function (p) { return p.length; })),
      sentence_words: Math.round(10 * words.length / Math.max(1, sents.length)) / 10,
      paragraph_lines: Math.round(10 * avg(function (p) { var ps = p.split(/\n\s*\n/); return p.split('\n').filter(Boolean).length / Math.max(1, ps.length); })) / 10,
      emoji: Math.round(10 * avg(function (p) { return (p.match(EMOJI) || []).length; })) / 10,
      hashtags: Math.round(10 * avg(function (p) { return (p.match(/(^|\s)#[\wÀ-ÿ]+/g) || []).length; })) / 10,
      questions: Math.round(100 * posts.filter(function (p) { return /\?\s*$/.test(p.trim()); }).length / posts.length),
      lists: Math.round(100 * posts.filter(function (p) { return /^\s*(\d+[.)]|[-•→✅])\s/m.test(p); }).length / posts.length),
      first_person: Math.round(100 * (all.toLowerCase().match(/\b(i|my|me)\b/g) || []).length / Math.max(1, words.length)) / 1,
      grade: HL.grade(all) || 0,
      hook_chars: Math.round(avg(function (p) { return HL.hook(p).length; }))
    };
  };
  HL.voiceSummary = function (st) {
    if (!st) return '';
    var bits = [];
    bits.push(st.chars < 600 ? 'short posts (~' + st.chars + ' characters)' : st.chars > 1400 ? 'long posts (~' + st.chars + ' characters)' : 'medium-length posts (~' + st.chars + ' characters)');
    bits.push(st.sentence_words <= 12 ? 'punchy sentences (' + st.sentence_words + ' words)' : 'flowing sentences (' + st.sentence_words + ' words)');
    bits.push(st.emoji < 1 ? 'almost no emoji' : st.emoji + ' emoji per post');
    bits.push(st.hashtags < 0.5 ? 'no hashtags' : st.hashtags + ' hashtags per post');
    if (st.questions >= 50) bits.push('usually ending on a question');
    if (st.lists >= 40) bits.push('often using lists');
    bits.push('first lines of ~' + st.hook_chars + ' characters');
    return 'You write ' + bits.join(', ') + '.';
  };
})();

/* JSON bridge for Python (client_code/hl.py): plain text in, JSON text out, so Python gets real dicts. */
(function () {
  'use strict';
  var HL = window.HL;
  HL.py = {
    consts: function () {
      return JSON.stringify({ FOLD: HL.FOLD, LIMIT: HL.LIMIT, STATUS: HL.STATUS, FORMATS: HL.FORMATS, FORMULAS: HL.FORMULAS,
        STRUCTURES: HL.STRUCTURES, PROMPTS: HL.PROMPTS, KINDS: HL.KINDS, COMMENT_FRAMES: HL.COMMENT_FRAMES });
    },
    check: function (text, fc) { return JSON.stringify(HL.check(text, fc)); },
    hookScore: function (line) { return JSON.stringify(HL.hookScore(line)); },
    foldCut: function (text, mode) { return JSON.stringify(HL.foldCut(text, mode)); },
    voiceStats: function (samplesJson) { return JSON.stringify(HL.voiceStats(JSON.parse(samplesJson)) || null); },
    voiceSummary: function (statsJson) { return HL.voiceSummary(JSON.parse(statsJson)); },
    sentences: function (text) { return JSON.stringify(HL.sentences(text)); },
    fancyCount: function (text) { var n = 0; for (var ch of String(text || '')) if (/[\u{1D400}-\u{1D7FF}]/u.test(ch)) n++; return n; },
    localInput: function (iso) { return HL.localInput(iso); },
    fromLocal: function (v) { return HL.fromLocal(v); },
    dayKey: function (iso) { return HL.dayKey(iso); },
    fmtDate: function (iso, optsJson) { return UI.fmtDate(iso, optsJson ? JSON.parse(optsJson) : undefined); },
    fmtDateTime: function (iso) { return UI.fmtDateTime(iso); },
    ago: function (iso) { return UI.ago(iso); },
    /* the feed preview card (the engine's own markup) into a box; "…see more" opens it */
    feed: function (box, text, optsJson, onExpand) {
      box.innerHTML = HL.feedCard(text, JSON.parse(optsJson || '{}'));
      var more = box.querySelector('[data-expand]');
      if (more && onExpand) {
        more.setAttribute('role', 'button'); more.setAttribute('tabindex', '0');
        more.addEventListener('click', function () { onExpand(); });
        more.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onExpand(); } });
      }
    }
  };
})();
