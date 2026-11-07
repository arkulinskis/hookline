/* Smoke test (tools/ui_test.py runs it at 1280 px and at 390 px): every page address opens without errors, is not
   empty and doesn't scroll sideways, signed out, then as a new member (the studio with typing + the live check,
   example posts loaded on Insights, a post's carousel, every Lab and Voice tab), then as admin (every Admin tab).
   Python/JS errors are caught by ui_test.py from the browser log. Resolves to {ok, log}. */
(async function () {
  const log = [], bad = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, what, ms) {
    const end = Date.now() + (ms || 20000);
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
    throw new Error('timed out waiting for: ' + what);
  }
  const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.message || e)));
  function type(input, value) {
    input.focus(); input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function button(re, root) { return $$((root || '') + ' button').find((b) => re.test(b.textContent) && b.offsetParent !== null); }
  async function open(hash, expect, landed) {
    if (location.hash !== hash) window.UI_READY = false;
    location.hash = hash;
    await until(() => window.UI_READY && (landed ? landed() : location.hash === hash), hash, 30000);
    await sleep(800);
    const main = $('.ui-main');
    const text = main ? main.innerText.trim() : '';
    const w = document.documentElement.scrollWidth, vw = screen.width <= 500 ? screen.width : window.innerWidth;
    const problems = [];
    if (text.length < 40) problems.push('empty page');
    if (expect && !new RegExp(expect.source, 'i').test(text)) problems.push('missing ' + expect);
    if (w > vw + 1) {
      const wide = $$('body *').filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > vw + 1; })
        .slice(0, 3).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ').slice(0, 2).join('.'));
      problems.push('scrolls sideways (' + w + ' > ' + vw + ') ' + wide.join(' '));
    }
    if (errs.length) problems.push('errors: ' + errs.splice(0).join(' / '));
    if (problems.length) bad.push(hash + ': ' + problems.join('; '));
    log.push((problems.length ? 'BAD  ' : 'ok   ') + hash);
  }
  async function signUp(name, email, password) {
    location.hash = '#auth/signup';
    await until(() => window.UI_READY && $$('.au-card input').length >= 3, 'sign-up form');
    await sleep(400);
    const inputs = $$('.au-card input[type=text], .au-card input[type=email], .au-card input[type=password]');
    type(inputs[0], name); type(inputs[1], email); type(inputs[2], password);
    const tick = $('.au-card input[type=checkbox]'); if (tick && !tick.checked) tick.click();
    button(/Create account/, '.au-card .anvil-role-btn-block').click();
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      if (location.hash.indexOf('#studio') === 0 && window.UI_READY) return true;
      const msg = $('.au-card .anvil-role-msg-error');
      if (msg && msg.offsetParent !== null && msg.textContent.trim()) { log.push('sign-up said: ' + msg.textContent.trim()); return false; }
      await sleep(200);
    }
    log.push('sign-up: still on ' + location.hash);
    return false;
  }
  async function signIn(email, password) {
    location.hash = '#auth';
    await until(() => window.UI_READY && $$('.au-card input[type=password]').length, 'sign-in form');
    await sleep(400);
    type($('.au-card input[type=email]'), email); type($('.au-card input[type=password]'), password);
    button(/Sign in/, '.au-card .anvil-role-btn-block').click();
    await until(() => location.hash.indexOf('#studio') === 0 && window.UI_READY, 'signed in as ' + email, 30000);
  }
  async function signOut() {
    $('.anvil-role-avatar button').click();
    await sleep(300);
    button(/Sign out/, '.ui-menu').click();
    await until(() => {  // the account button goes once sign-out has finished
      const a = $('.anvil-role-avatar button');
      return location.hash === '#landing' && window.UI_READY && (!a || a.offsetParent === null);
    }, 'signed out');
  }
  try {
    // ---- signed out
    await open('#landing', /finish reading/);
    const demo = $('.anvil-role-lp-text');
    if (demo) { type(demo, 'In today\'s fast-paced world, synergy is a game-changer. Let that sink in. https://example.com'); await sleep(500); }
    if (!/Sounds templated|Link in the post/.test(($('.lp-studio') || {}).innerText || '')) bad.push('#landing: the live check didn\'t react to typing');
    await open('#auth', /Sign in/);
    await open('#auth/signup', /Create account/);

    // ---- a new member
    const ok = await signUp('Smoke Tester', 'smoke' + Date.now() + '@example.com', 'Hl-' + Math.random().toString(36).slice(2) + '-Kq7');
    if (!ok) throw new Error('sign-up failed');
    await open('#studio/new', /Write a post/);
    const ta = $('.anvil-role-st-text');
    type(ta, 'I almost quit writing on LinkedIn.\n\nThen I wrote one post a week for a year.\n\nWhat would you write about?');
    await sleep(600);
    if (!/Ready to go|Nearly there|Needs work/.test(($('.st-side') || {}).innerText || '')) bad.push('#studio: the post check didn\'t update');
    if (!/almost quit/.test(($('.fp-box') || {}).innerText || '')) bad.push('#studio: the feed preview didn\'t update');
    button(/^\s*Save\s*$/, '.st-acts').click();
    await until(() => /^#studio\/./.test(location.hash) && !/new/.test(location.hash), 'saved post address', 20000);
    const postHash = location.hash;
    await open('#posts', /Drafts/);
    await open('#calendar', /Drafts to place/);
    await open('#calendar/2026-01', /January/);
    await open('#insights', /Bring your numbers|Impressions over time/);
    const ex = button(/Load example posts/);
    if (ex) {
      ex.click();
      try { await until(() => /Impressions over time/.test($('.ui-main').innerText), 'example insights', 30000); }
      catch (e) { log.push('insights text: ' + $('.ui-main').innerText.slice(0, 400).replace(/\s+/g, ' ')); throw e; }
      await sleep(600);
    }
    await open('#insights', /Impressions over time/);
    if (!$('.in-chart-box svg')) bad.push('#insights: no line chart');
    await open('#ideas', /Answer one question/);
    for (const t of ['hooks', 'repurpose', 'comments', 'clean']) await open('#lab/' + t, /Lab/);
    for (const t of ['voice', 'rhythm', 'ai', 'linkedin']) await open('#voice/' + t, /Voice/);
    await open('#carousel/' + postHash.split('/')[1], /Carousel/);
    if (!$('.cr-prev canvas') || !$('.cr-prev canvas').width) bad.push('#carousel: the slide wasn\'t drawn');
    await open(postHash, /Edit your post/);
    await open('#profile', /Your name/);
    await open('#landing', /Open the studio/);
    await signOut();

    // ---- admin (ADMIN_EMAILS in Accounts.py): sign up the first time, sign in after that
    const adminPw = 'Hl-smoke-adm-93Kx-7q';
    if (!(await signUp('Admin Tester', 'arkulinskis@gmail.com', adminPw))) await signIn('arkulinskis@gmail.com', adminPw);
    for (const t of ['overview', 'linkedin', 'feedback', 'users', 'demo']) await open('#admin/' + t, /Admin/);
    await signOut();
    log.push(bad.length ? 'PROBLEMS: ' + bad.join(' | ') : 'PASSED');
    return { ok: !bad.length, log: log };
  } catch (e) {
    log.push(String(e && e.message || e));
    if (bad.length) log.push('PROBLEMS: ' + bad.join(' | '));
    return { ok: false, log: log };
  }
})();
