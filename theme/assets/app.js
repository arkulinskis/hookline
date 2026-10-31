/* core.js: the shared front-end engine (window.UI). Same in every app made from APP_MAKER/template;
   app-specific things live in web/app.js (brand, nav, footer) and web/pages/*.html (the pages).

   Pages:   UI.page(name, {title, nav, icon, auth, order, chrome}, mount)
              auth: null (anyone) | 'guest' (signed-out only) | 'user' | 'admin'
              nav: label for the header / phone tab bar (omit to keep it out of the menus)
              mount(view, ctx) draws into `view`; ctx = {args, me, go, api}. Return a Promise (the page
              is "ready" when it resolves) or {ready, destroy}. URLs are #name/arg1/arg2.
   Server:  UI.api(fn, ...args) -> Promise of the server function's return value. A reply of
              {ok: false, error} rejects with that message (shown as a toast unless you .catch it).
            UI.apiQuiet(fn, ...args) is the same without Anvil's loading spinner.
   Auth:    UI.auth('login'|'signup'|'reset'|'logout', {...}) -> Promise of {ok, me, message}
   Helpers: UI.esc, UI.icon, UI.toast, UI.modal, UI.confirm, UI.busy, UI.formData, UI.fmtDate, UI.ago,
            UI.store, UI.setTheme, UI.feedback, UI.go, UI.refresh
   Tests:   window.UI_READY is true when the current page has finished loading. */
(function () {
  'use strict';
  if (window.UI && window.UI.__v) return;
  var UI = window.UI = { __v: 1, pages: {}, me: null, config: { name: 'App', key: 'app', home: 'home', landing: 'landing' } };
  window.UI_READY = false;

  UI.configure = function (cfg) { Object.keys(cfg).forEach(function (k) { UI.config[k] = cfg[k]; }); };

  /* ------------------------------------------------------------------ small helpers */
  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
  UI.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };
  UI.fmtDate = function (iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  UI.fmtDateTime = function (iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };
  UI.ago = function (iso) {
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
  UI.store = {
    get: function (k, dflt) { try { var v = localStorage.getItem(UI.config.key + '.' + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
    set: function (k, v) { try { localStorage.setItem(UI.config.key + '.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  UI.formData = function (form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  };
  /* Disable a button while a Promise runs; returns the Promise. */
  UI.busy = function (btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy');
    var done = function () { btn.disabled = false; btn.classList.remove('is-busy'); };
    promise.then(done, done);
    return promise;
  };

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.7c2.2.6 3.5 2.4 3.5 5.3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8V5M9 5.5 7.5 4M15 5.5 16.5 4M7 13H3M21 13h-4M7.5 18l-3 2M16.5 18l3 2M7.5 9.5l-3-2M16.5 9.5l3-2"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
  };
  UI.ICONS = ICONS;
  UI.icon = function (name, cls) {
    return '<svg class="ui-ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.sparkle) + '</svg>';
  };

  /* ------------------------------------------------------------------ toasts, modals */
  UI.toast = function (msg, kind) {
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.innerHTML = (kind === 'error' ? UI.icon('info') : kind === 'ok' ? UI.icon('check') : '') + '<span>' + UI.esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, kind === 'error' ? 6500 : 3200);
  };
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<button class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' + html + '</div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('ui-modal-open');
    function key(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (!wrap.parentNode) return;
      wrap.remove(); document.removeEventListener('keydown', key);
      if (!document.querySelector('.ui-modal-wrap')) document.documentElement.classList.remove('ui-modal-open');
      if (opts.onclose) opts.onclose();
      if (prev && prev.focus) prev.focus();
    }
    document.addEventListener('keydown', key);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    var first = wrap.querySelector('input, textarea, select');
    setTimeout(function () { (first || wrap.querySelector('.ui-modal')).focus && (first || wrap.querySelector('.ui-modal')).focus(); }, 30);
    return { el: wrap.querySelector('.ui-modal'), close: close };
  };
  UI.confirm = function (o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    return new Promise(function (resolve) {
      var answered = false;
      var m = UI.modal('<h2>' + UI.esc(o.title || 'Are you sure?') + '</h2>' + (o.text ? '<p class="muted">' + UI.esc(o.text) + '</p>' : '') +
        '<div class="ui-row end" style="margin-top:20px"><button class="ui-btn ghost" data-close>' + UI.esc(o.cancel || 'Cancel') + '</button>' +
        '<button class="ui-btn ' + (o.danger ? 'danger solid' : 'primary') + '" data-ok>' + UI.esc(o.ok || 'OK') + '</button></div>',
      { onclose: function () { if (!answered) resolve(false); } });
      m.el.querySelector('[data-ok]').onclick = function () { answered = true; m.close(); resolve(true); };
    });
  };

  /* ------------------------------------------------------------------ theme */
  UI.theme = function () { return UI.store.get('theme', 'auto'); };
  UI.applyTheme = function (t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('ui-dark', !!dark);
  };
  UI.setTheme = function (t) { UI.store.set('theme', t); UI.applyTheme(t); };
  UI.applyTheme(UI.theme());
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { UI.applyTheme(UI.theme()); }); } catch (e) {}
  }

  /* ------------------------------------------------------------------ server bridge */
  var bridge = null;
  function send(kind, payload) {
    if (!bridge) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = bridge(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(out).then(function (r) {
      r = typeof r === 'string' ? JSON.parse(r) : (r || {});
      if (r.error) {
        var err = new Error(r.error); err.uiApi = true; err.denied = !!r.denied;
        if (r.detail) console.error(kind, payload && payload.fn, r.detail);
        if (r.reload) setTimeout(function () { location.reload(); }, 2500);
        throw err;
      }
      return r.result;
    });
  }
  function apiCall(quiet, fn, args) {
    return send('call', { fn: fn, args: args, quiet: quiet }).then(function (res) {
      if (res && typeof res === 'object' && res.ok === false) {
        var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
        throw err;
      }
      return res;
    });
  }
  UI.api = function (fn) { return apiCall(false, fn, Array.prototype.slice.call(arguments, 1)); };
  /* UI.upload(fn, file, ...args): the server function gets the File as Anvil Media first, then args.
     (Main.py turns the browser File into Media with anvil.js.to_media; locally the harness posts it.) */
  UI.upload = function (fn, file) {
    UI._file = file;
    return send('upload', { fn: fn, args: Array.prototype.slice.call(arguments, 2) }).then(function (res) {
      UI._file = null;
      if (res && typeof res === 'object' && res.ok === false) { var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res; throw err; }
      return res;
    }, function (e) { UI._file = null; throw e; });
  };
  UI.apiQuiet = function (fn) { return apiCall(true, fn, Array.prototype.slice.call(arguments, 1)); };
  /* Errors nobody caught become a toast, so a failed action is never silent. */
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* Sign in / up / out. On success it navigates: to where the visitor was heading (UI.after) or home
     after signing in, to the landing page after signing out. */
  UI.auth = function (kind, payload) {
    return send(kind, payload || {}).then(function (r) {
      if (r && r.ok === false) { var err = new Error(r.error); err.uiApi = true; err.expected = true; throw err; }
      if (r && 'me' in r && (r.me || kind === 'logout')) {
        UI.me = r.me || null;
        var target = r.me ? (UI.after || '#' + UI.config.home) : '#' + UI.config.landing;
        UI.after = null;
        if (location.hash === target) route(); else location.hash = target;
      }
      return r;
    });
  };
  /* Update the signed-in user's details (e.g. a new name) and redraw the header, without reloading the page. */
  UI.setMe = function (me) {
    UI.me = me || null;
    if (shellRoot) renderChrome(current.name);
  };

  /* ------------------------------------------------------------------ pages and routing */
  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  UI.allowed = function (p) {
    if (!p) return false;
    if (p.auth === 'user') return !!UI.me;
    if (p.auth === 'admin') return !!(UI.me && UI.me.is_admin);
    if (p.auth === 'guest') return !UI.me;
    return true;
  };
  UI.navPages = function () {
    return Object.keys(UI.pages).map(function (k) { return UI.pages[k]; })
      .filter(function (p) { return p.nav && UI.allowed(p) && (!p.when || p.when()); })
      .sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  };
  UI.parseHash = function () {
    var h = (location.hash || '').replace(/^#!?\/?/, '');
    var parts = h.split('?')[0].split('/').filter(function (x) { return x !== ''; }).map(decodeURIComponent);
    return { name: parts[0] || '', args: parts.slice(1) };
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function (name) {
    var h = UI.hashFor.apply(null, arguments);
    if (location.hash === h) route(); else location.hash = h;
  };
  UI.refresh = function () { route(); };
  UI.after = null;  // where to go after signing in

  var shellRoot = null, view = null, current = { name: null, destroy: null }, routeSeq = 0;

  function defaultPage() { return UI.me ? UI.config.home : UI.config.landing; }

  function route() {
    var r = UI.parseHash(), name = r.name || defaultPage(), p = UI.pages[name];
    if (!p) { name = defaultPage(); p = UI.pages[name]; r.args = []; }
    if (p.auth === 'guest' && UI.me) { p = UI.pages[UI.config.home]; name = UI.config.home; r.args = []; }
    if ((p.auth === 'user' || p.auth === 'admin') && !UI.me) {
      UI.after = location.hash && location.hash !== '#' ? location.hash : null;
      p = UI.pages.auth; name = 'auth'; r.args = [];
    }
    if (p.auth === 'admin' && !(UI.me && UI.me.is_admin)) {
      UI.toast('That page is for admins only.', 'error');
      p = UI.pages[UI.config.home]; name = UI.config.home; r.args = [];
    }
    var seq = ++routeSeq;
    window.UI_READY = false;
    if (current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
    current = { name: name, args: r.args, destroy: null };
    if (shellRoot) {
      shellRoot.className = 'ui ui-shell page-' + name + (UI.me ? ' signed-in' : ' signed-out') + (p.chrome === false ? ' no-chrome' : '');
      renderChrome(name);
    }
    // A fresh element for every page, so listeners a page adds to `view` never pile up.
    var fresh = view.cloneNode(false);
    view.parentNode.replaceChild(fresh, view);
    view = fresh;
    window.scrollTo(0, 0);
    document.title = (p.title ? (typeof p.title === 'function' ? p.title(r.args) : p.title) + ' · ' : '') + UI.config.name;
    var ctx = { name: name, args: r.args, me: UI.me, go: UI.go, api: UI.api, page: p };
    var out;
    try { out = p.mount(view, ctx); } catch (e) { console.error(e); out = Promise.reject(e); }
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    if (out && out.destroy) current.destroy = out.destroy;
    Promise.resolve(ready).then(function () { if (seq === routeSeq) window.UI_READY = true; },
      function (e) {
        if (seq !== routeSeq) return;
        console.error(e);
        if (!view.innerHTML) view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('info') +
          '<h3>This page didn\'t load</h3><p class="muted">' + UI.esc(e && e.message || 'Something went wrong.') + '</p>' +
          '<button class="ui-btn" onclick="UI.refresh()">Try again</button></div></div>';
        window.UI_READY = true;
      });
  }
  UI.current = function () { return current; };

  /* The shell's parts come from web/app.js: UI.shell = {header(me, active), footer(me), tabbar(me, active)} */
  function renderChrome(active) {
    var S = UI.shell || {};
    var hd = shellRoot.querySelector('[data-ui-header]'), ft = shellRoot.querySelector('[data-ui-footer]'), tb = shellRoot.querySelector('[data-ui-tabbar]');
    if (hd) hd.innerHTML = S.header ? S.header(UI.me, active) : '';
    if (ft) ft.innerHTML = S.footer ? S.footer(UI.me, active) : '';
    if (tb) tb.innerHTML = S.tabbar ? S.tabbar(UI.me, active) : '';
  }
  UI.renderChrome = function () { if (shellRoot) renderChrome(current.name); };

  /* Called by client_code/Main.py (and by the local harness) once the page is up. */
  UI.start = function (node, bridgeFn, bootJson) {
    bridge = bridgeFn;
    var boot = typeof bootJson === 'string' ? JSON.parse(bootJson || '{}') : (bootJson || {});
    UI.me = boot.me || null;
    var host = node && node.matches && node.matches('[data-ui-app]') ? node : (node && node.querySelector('[data-ui-app]')) || node || document.body;
    host.innerHTML = '<div class="ui ui-shell">' +
      '<header class="ui-header" data-ui-header></header>' +
      '<main class="ui-main" data-ui-view></main>' +
      '<footer class="ui-footer" data-ui-footer></footer>' +
      '<nav class="ui-tabbar" data-ui-tabbar aria-label="Main"></nav></div>';
    shellRoot = host.firstChild;
    view = host.querySelector('[data-ui-view]');
    if (UI.shell && UI.shell.wire) UI.shell.wire(shellRoot);
    window.addEventListener('hashchange', route);
    route();
  };

  /* ------------------------------------------------------------------ feedback form (footer + menu) */
  UI.feedback = function (kind) {
    var kinds = [['bug', 'Something\'s broken', 'bug'], ['idea', 'An idea', 'bulb'], ['question', 'A question', 'info'], ['other', 'Something else', 'chat']];
    var m = UI.modal('<h2>Send feedback</h2><p class="muted">Found a bug or have an idea? It goes straight to the people who make ' + UI.esc(UI.config.name) + '.</p>' +
      '<form class="ui-stack" data-fb>' +
      '<div class="ui-choices">' + kinds.map(function (k) {
        return '<label class="ui-choice"><input type="radio" name="kind" value="' + k[0] + '"' + ((kind || 'bug') === k[0] ? ' checked' : '') + '>' +
          '<span>' + UI.icon(k[2]) + UI.esc(k[1]) + '</span></label>';
      }).join('') + '</div>' +
      '<label class="ui-field"><span>What happened, or what would you like?</span><textarea name="message" rows="5" required minlength="5" placeholder="The more detail, the better."></textarea></label>' +
      (UI.me ? '' : '<label class="ui-field"><span>Your email <em>(optional, if you\'d like a reply)</em></span><input type="email" name="email" autocomplete="email"></label>') +
      '<p class="ui-hint">We also send the page you were on, your screen size and browser, to help us fix bugs.</p>' +
      '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">' + UI.icon('arrow') + 'Send</button></div></form>');
    var form = m.el.querySelector('[data-fb]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(form);
      var ctx = { page: location.hash || '#', screen: innerWidth + 'x' + innerHeight, browser: navigator.userAgent.slice(0, 280), theme: UI.theme() };
      UI.busy(form.querySelector('[type=submit]'), UI.api('submit_feedback', v.kind, v.message, v.email || null, ctx)).then(function () {
        m.close(); UI.toast('Thank you! Your message was sent.', 'ok');
      });
    });
    return m;
  };

  /* Shared clicks: [data-go="page/arg"], [data-feedback], [data-theme-set] anywhere in the app. */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go],[data-feedback],[data-theme-set]');
    if (!el) return;
    if (el.hasAttribute('data-go')) { e.preventDefault(); UI.go.apply(null, el.getAttribute('data-go').split('/')); }
    else if (el.hasAttribute('data-feedback')) { e.preventDefault(); UI.feedback(el.getAttribute('data-feedback') || null); }
    else if (el.hasAttribute('data-theme-set')) { e.preventDefault(); UI.setTheme(el.getAttribute('data-theme-set')); if (UI.shell && UI.shell.onTheme) UI.shell.onTheme(); }
  });
})();


/* app.js: this app's identity and frame: name, header, footer, phone tab bar.
   Pages live in web/pages/*.html. The engine (window.UI) is web/core.js. */
(function () {
  'use strict';
  UI.configure({
    name: 'Hookline',
    key: 'hookline',          // prefix for this app's browser storage
    tagline: 'A free LinkedIn writing studio. Your voice, your posts, posted by you.',   // footer line
    home: 'studio',              // first page after signing in
    landing: 'landing'           // first page for visitors who aren't signed in
  });

  var esc = UI.esc;

  function brand() {
    return '<a class="ui-brand" href="#" data-go="' + (UI.me ? UI.config.home : UI.config.landing) + '" aria-label="' + esc(UI.config.name) + ' home">' +
      '<img src="_/theme/icon.svg" alt="" width="32" height="32"><span>' + esc(UI.config.name) + '</span></a>';
  }

  function themeSwitch() {
    var t = UI.theme();
    return '<div class="ui-seg" role="group" aria-label="Appearance">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
      return '<button type="button" data-theme-set="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function userMenu(me) {
    return '<div class="ui-menu" data-menu hidden>' +
      '<div class="ui-menu-head"><strong>' + esc(me.name) + '</strong><span class="muted small">' + esc(me.email) + '</span></div>' +
      '<a href="#profile" data-go="profile">' + UI.icon('user') + 'Your profile</a>' +
      '<a href="#voice" data-go="voice">' + UI.icon('sliders') + 'Voice & settings</a>' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<div class="ui-menu-block"><span class="small muted">Appearance</span>' + themeSwitch() + '</div>' +
      '<button type="button" data-feedback>' + UI.icon('chat') + 'Send feedback</button>' +
      '<button type="button" data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms</button>' +
      '<button type="button" data-signout>' + UI.icon('logout') + 'Sign out</button></div>';
  }

  UI.shell = {
    header: function (me, active) {
      var nav = UI.navPages();
      return '<div class="ui-header-in">' + brand() +
        (me ? '<nav class="ui-nav" aria-label="Main">' + nav.map(function (p) {
          return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
        }).join('') + '</nav>' : '') +
        '<div class="ui-header-right">' +
        (me ? '<button type="button" class="ui-avatar-btn" data-menu-toggle aria-label="Your account" aria-haspopup="true">' + esc(UI.initials(me.name)) + '</button>' + userMenu(me)
          : (active === 'auth' ? '' : '<a class="ui-btn ghost" href="#auth" data-go="auth">Sign in</a><a class="ui-btn primary" href="#auth/signup" data-go="auth/signup">Get started</a>')) +
        '</div></div>';
    },
    footer: function (me) {
      return '<div class="ui-footer-in"><div class="ui-footer-brand">' + brand() + '<p class="muted small">' + esc(UI.config.tagline) + '</p></div>' +
        '<div class="ui-footer-links">' +
        '<a href="#landing" data-go="landing">About</a>' +
        '<button type="button" data-feedback>Send feedback</button>' +
        '<button type="button" data-lk-open="overview">Privacy &amp; Terms</button>' +
        '</div><p class="ui-footer-legal small muted">© ' + new Date().getFullYear() + ' ' + esc(UI.config.name) + '</p></div>';
    },
    tabbar: function (me, active) {
      var nav = UI.navPages();
      if (!me || nav.length < 2) return '';
      var rest = nav.slice(4).map(function (p) { return p.name; });
      return nav.slice(0, 4).map(function (p) {
        return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
      }).join('') + '<a href="#" data-more class="' + (rest.indexOf(active) >= 0 || active === 'profile' ? 'on' : '') + '">' + UI.icon('more') + '<span>More</span></a>';
    },
    wire: function (root) {
      root.addEventListener('click', function (e) {
        if (e.target.closest('[data-more]')) {
          e.preventDefault();
          var nav = UI.navPages().slice(4);
          var m = UI.modal('<h2>More</h2><div class="ui-stack">' + nav.map(function (p) {
            return '<a class="ui-btn block" style="justify-content:flex-start" href="#' + p.name + '" data-go="' + p.name + '">' + UI.icon(p.icon) + esc(p.nav === 'Voice' ? 'Voice & settings' : p.nav) + '</a>';
          }).join('') + '<a class="ui-btn block" style="justify-content:flex-start" href="#profile" data-go="profile">' + UI.icon('user') + 'Your profile</a>' +
            (UI.me && UI.me.is_admin ? '<a class="ui-btn block" style="justify-content:flex-start" href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') + '</div>');
          m.el.addEventListener('click', function (ev) { if (ev.target.closest('[data-go]')) m.close(); });
          return;
        }
        var t = e.target.closest('[data-menu-toggle]');
        var menu = root.querySelector('[data-menu]');
        if (t && menu) { menu.hidden = !menu.hidden; t.setAttribute('aria-expanded', String(!menu.hidden)); return; }
        if (e.target.closest('[data-signout]')) { UI.auth('logout').then(function () { UI.toast('Signed out. See you soon!'); }); }
        if (menu && !menu.hidden && !e.target.closest('[data-menu] .ui-seg')) menu.hidden = true;
      });
      document.addEventListener('keydown', function (e) {
        var menu = root.querySelector('[data-menu]');
        if (e.key === 'Escape' && menu) menu.hidden = true;
      });
    },
    onTheme: function () {  // redraw the menu's Auto/Light/Dark buttons and keep the menu open
      var menu = document.querySelector('[data-menu]'), open = menu && !menu.hidden;
      UI.renderChrome();
      if (open) document.querySelector('[data-menu]').hidden = false;
    }
  };
})();


/* ===== _ai.html ===== */
(function () {
  'use strict';
  var HL = window.HL = window.HL || {}, esc = UI.esc;   // _ai loads before _hl (alphabetical)
  var API = 'https://api.anthropic.com/v1/messages', VERSION = '2026-10-21';
  var MODELS = [
    ['claude-opus-5-5', 'Claude Opus 5.5', 'Best writing. About $4 / $20 per million tokens in/out.'],
    ['claude-sonnet-5-5', 'Claude Sonnet 5.5', 'Fast and strong. About $2 / $10 per million tokens.'],
    ['claude-haiku-5-5', 'Claude Haiku 5.5', 'Cheapest and quickest. About $0.10 / $0.50 per million tokens.']
  ];
  var KEY = 'hookline.ai';

  var ai = HL.ai = {
    MODELS: MODELS,
    get: function () { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } },
    set: function (v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} },
    clear: function () { try { localStorage.removeItem(KEY); } catch (e) {} },
    has: function () { return !!(ai.get().key); },
    model: function () { var m = ai.get().model; return MODELS.some(function (x) { return x[0] === m; }) ? m : MODELS[0][0]; },
    modelName: function () { var m = ai.model(); return MODELS.filter(function (x) { return x[0] === m; })[0][1]; },
    /* A friendly "no key yet" box for pages that offer AI. */
    nudge: function (what) {
      return '<div class="hl-empty-ai">' + UI.icon('key') + '<span><b>Add your own Claude API key</b> to ' + esc(what || 'let AI help') + '. It stays in this browser and costs you cents. ' +
        'Everything else works without it.</span><a class="ui-btn sm" href="#voice/ai" data-go="voice/ai">Add key</a></div>';
    }
  };

  function friendly(status, body) {
    var msg = body && body.error && body.error.message || '';
    if (status === 401) return 'That API key didn\'t work. Check it in Voice & settings → AI.';
    if (status === 402) return 'Your Anthropic account needs credit (Billing in the Claude Console).';
    if (status === 403) return 'This key isn\'t allowed to use that model. Try another model in Voice & settings → AI.';
    if (status === 404) return 'That model isn\'t available to your key. Pick another one in Voice & settings → AI.';
    if (status === 413) return 'That\'s too much text in one go. Try a shorter piece.';
    if (status === 429) return 'Anthropic is rate-limiting this key. Wait a minute and try again.';
    if (status === 529 || status >= 500) return 'Anthropic is busy right now. Try again in a moment.';
    return msg ? 'Anthropic said: ' + msg : 'The AI request failed (HTTP ' + status + ').';
  }

  function headers(withFallback) {
    var h = { 'content-type': 'application/json', 'x-api-key': ai.get().key || '', 'anthropic-version': VERSION,
              'anthropic-dangerous-direct-browser-access': 'true' };
    if (withFallback) h['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    return h;
  }
  function usesFallback(model) { return model === 'claude-opus-5-5' || model === 'claude-sonnet-5-5'; }

  /* One request. o: {system, prompt | messages, max_tokens, effort, schema, stream, onText}. Resolves with the text
     (or the parsed JSON when a schema is given). Retries once without the fallback beta if the API rejects it. */
  ai.call = function (o, _noFallback) {
    if (!ai.has()) return Promise.reject(Object.assign(new Error('Add your Claude API key first (Voice & settings → AI).'), { uiApi: true }));
    var model = ai.model(), fb = usesFallback(model) && !_noFallback;
    var body = { model: model, max_tokens: o.max_tokens || (o.stream ? 8000 : 4000), system: o.system,
                 messages: o.messages || [{ role: 'user', content: o.prompt }],
                 output_config: { effort: o.effort || 'medium' } };
    if (fb) body.fallbacks = 'default';
    if (o.schema) body.output_config.format = { type: 'json_schema', schema: o.schema };
    if (o.stream) body.stream = true;
    return fetch(API, { method: 'POST', headers: headers(fb), body: JSON.stringify(body) }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return null; }).then(function (b) {
          var m = b && b.error && b.error.message || '';
          if (fb && res.status === 400 && /fallback|beta/i.test(m)) return ai.call(o, true);
          throw Object.assign(new Error(friendly(res.status, b)), { uiApi: true, status: res.status });
        });
      }
      return o.stream ? readStream(res, o.onText) : res.json().then(finish(o));
    }, function () { throw Object.assign(new Error('Couldn\'t reach Anthropic. Check your connection (or an ad blocker).'), { uiApi: true }); });
  };
  function finish(o) {
    return function (msg) {
      if (msg.stop_reason === 'refusal') throw Object.assign(new Error('Claude declined to write this one. Try rephrasing.'), { uiApi: true });
      var text = (msg.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
      if (!o.schema) return text;
      try { return JSON.parse(text); } catch (e) { throw Object.assign(new Error('The AI answer was cut off. Try again.'), { uiApi: true }); }
    };
  }
  /* Server-Sent Events over fetch: text_delta pieces go to onText as they arrive. */
  function readStream(res, onText) {
    var reader = res.body.getReader(), dec = new TextDecoder(), buf = '', text = '', stop = null, err = null;
    function handle(evt) {
      var data = evt.split('\n').filter(function (l) { return l.indexOf('data:') === 0; }).map(function (l) { return l.slice(5).trim(); }).join('');
      if (!data) return;
      var d; try { d = JSON.parse(data); } catch (e) { return; }
      if (d.type === 'content_block_delta' && d.delta && d.delta.type === 'text_delta') { text += d.delta.text; if (onText) onText(text, d.delta.text); }
      else if (d.type === 'message_delta' && d.delta) stop = d.delta.stop_reason || stop;
      else if (d.type === 'error') err = d.error && d.error.message || 'The stream stopped.';
    }
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) {
          if (buf.trim()) handle(buf);
          if (err) throw Object.assign(new Error('Anthropic: ' + err), { uiApi: true });
          if (stop === 'refusal' && !text) throw Object.assign(new Error('Claude declined to write this one. Try rephrasing.'), { uiApi: true });
          return text;
        }
        buf += dec.decode(r.value, { stream: true });
        var parts = buf.split(/\r?\n\r?\n/); buf = parts.pop();
        parts.forEach(handle);
        return pump();
      });
    }
    return pump();
  }

  ai.test = function () {
    return ai.call({ system: 'Reply with one short friendly sentence.', prompt: 'Say hello to a LinkedIn writer in five words.', max_tokens: 400, effort: 'low' });
  };

  /* ------------------------------------------------------------------ prompts */
  ai.system = function (ws, me) {
    var p = ws && ws.profile || {}, v = p.voice || {}, card = v.card || {}, st = v.stats || {};
    var lines = [
      'You are Hookline, a LinkedIn writing partner for ' + ((me && me.name) || 'the user') + '.',
      'You write in their voice, about their real experience. You never invent facts, numbers, clients, quotes or stories. When a specific detail is needed and you don\'t have it, write a short placeholder in square brackets, like [the client\'s industry], so they can fill it in.',
      v.about ? 'About them: ' + v.about : '', v.audience ? 'Their audience: ' + v.audience : '',
      card.summary ? 'Their voice: ' + card.summary : '', st.chars ? HL.voiceSummary(st) : '',
      (card.traits || []).length ? 'Traits: ' + card.traits.join('; ') : '', (card['do'] || []).length ? 'They do: ' + card['do'].join('; ') : '',
      (card.dont || []).length ? 'They avoid: ' + card.dont.join('; ') : '',
      (v.banned || []).length ? 'Never use these words or phrases: ' + v.banned.join(', ') + '.' : '',
      v.language && v.language !== 'English' ? 'Write in ' + v.language + '.' : '',
      'LinkedIn craft rules:',
      '- The first line is the hook. Keep it under 140 characters, concrete and specific, then a blank line.',
      '- Short paragraphs of one or two sentences. Plain words. Grade 8 reading level or simpler.',
      '- Plain text only: no markdown, no bold or italic Unicode letters, no headings.',
      '- No links in the body (they go in the first comment). At most 3 hashtags, and only if asked.',
      '- No engagement bait ("comment YES", "like if", "tag someone"). End with one real question when it fits.',
      '- Avoid clichés and AI tells: ' + HL.CLICHES.slice(0, 24).join(', ') + '. Use em dashes sparingly or not at all.',
      '- Under 3,000 characters. Most posts work best between 600 and 1,800.'
    ];
    return lines.filter(Boolean).join('\n');
  };

  var S = {
    hooks: { type: 'object', additionalProperties: false, required: ['hooks'], properties: { hooks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'angle'], properties: { text: { type: 'string' }, angle: { type: 'string' } } } } } },
    angles: { type: 'object', additionalProperties: false, required: ['angles'], properties: { angles: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'hook', 'outline'], properties: { title: { type: 'string' }, hook: { type: 'string' }, outline: { type: 'string' } } } } } },
    comments: { type: 'object', additionalProperties: false, required: ['comments'], properties: { comments: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'text'], properties: { kind: { type: 'string' }, text: { type: 'string' } } } } } },
    voice: { type: 'object', additionalProperties: false, required: ['summary', 'traits', 'do', 'dont', 'moves'], properties: { summary: { type: 'string' }, traits: { type: 'array', items: { type: 'string' } }, 'do': { type: 'array', items: { type: 'string' } }, dont: { type: 'array', items: { type: 'string' } }, moves: { type: 'array', items: { type: 'string' } } } },
    ideas: { type: 'object', additionalProperties: false, required: ['ideas'], properties: { ideas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'kind', 'pillar'], properties: { text: { type: 'string' }, kind: { type: 'string' }, pillar: { type: 'string' } } } } } },
    slides: { type: 'object', additionalProperties: false, required: ['slides'], properties: { slides: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'body'], properties: { title: { type: 'string' }, body: { type: 'string' } } } } } }
  };

  ai.draft = function (ws, me, idea, structure, onText) {
    var st = structure && HL.STRUCTURES[structure];
    return ai.call({ system: ai.system(ws, me), stream: true, onText: onText, effort: 'medium',
      prompt: 'Write a LinkedIn post from this idea:\n\n"' + idea + '"\n\n' + (st ? 'Use this shape: ' + st.parts.join(' → ') + '.\n' : '') +
              'Return only the post text, ready to paste.' });
  };
  ai.rewrite = function (ws, me, text, mode, onText) {
    var how = { voice: 'Rewrite it so it sounds like them (see their voice). Keep every fact.', shorter: 'Make it about 40% shorter. Keep the hook and the point.',
      story: 'Turn it into a short story: a moment, what happened, what changed, the lesson.', clearer: 'Make it clearer and simpler: shorter sentences, plainer words, one idea per paragraph.',
      question: 'Keep the post, and end it with one specific question readers can answer in a line.', hook: 'Keep the body, but write a much stronger first line.' }[mode] || mode;
    return ai.call({ system: ai.system(ws, me), stream: true, onText: onText, effort: 'medium',
      prompt: how + '\n\nThe post:\n"""\n' + text + '\n"""\n\nReturn only the new post text.' });
  };
  ai.hooks = function (ws, me, text) {
    return ai.call({ system: ai.system(ws, me), schema: S.hooks, effort: 'low',
      prompt: 'Write 6 different first lines (hooks) for this post. Each under 120 characters, each a different angle (story, number, contrast, question, bold claim, specific moment). Don\'t invent facts.\n\n"""\n' + text + '\n"""' }).then(function (r) { return r.hooks; });
  };
  ai.repurpose = function (ws, me, source) {
    return ai.call({ system: ai.system(ws, me), schema: S.angles, effort: 'medium',
      prompt: 'Here is something I wrote or said (article, newsletter, talk transcript). Find 4 distinct LinkedIn post angles in it. For each: a short title, a hook line, and a 3-5 line outline using only what\'s in the source.\n\n"""\n' + source.slice(0, 40000) + '\n"""' }).then(function (r) { return r.angles; });
  };
  ai.comments = function (ws, me, post) {
    return ai.call({ system: ai.system(ws, me) + '\nNow you\'re helping write a thoughtful comment on someone else\'s post. 1-3 sentences, specific to the post, adds something. No flattery, no "Great post!", no self-promotion.', schema: S.comments, effort: 'low',
      prompt: 'Write 3 comments with different approaches (add a data point or experience, ask a sharp question, offer a respectful counterpoint). Use [placeholders] for any personal detail.\n\nTheir post:\n"""\n' + post + '\n"""' }).then(function (r) { return r.comments; });
  };
  ai.voiceCard = function (samples) {
    return ai.call({ system: 'You analyse writing style precisely and briefly.', schema: S.voice, effort: 'medium',
      prompt: 'These are LinkedIn posts by one person. Describe their writing voice so another writer could imitate it: a 2-sentence summary, 4-6 traits, 3-5 things they do, 3-5 things they avoid, and 3-5 signature moves (how they open, structure, close).\n\n' +
              samples.slice(0, 20).map(function (s, i) { return '--- Post ' + (i + 1) + ' ---\n' + s; }).join('\n\n') }).then(function (r) { return r; });
  };
  ai.ideas = function (ws, me) {
    var p = ws.profile, top = ws.posts.filter(function (x) { return x.status === 'posted'; }).sort(function (a, b) { return (b.metrics.impressions || 0) - (a.metrics.impressions || 0); }).slice(0, 5);
    return ai.call({ system: ai.system(ws, me), schema: S.ideas, effort: 'medium',
      prompt: 'Suggest 10 post ideas for me. Each is a one-line prompt I can answer from my own experience (not a finished post). Spread them across my content pillars: ' +
              (p.pillars || []).map(function (x) { return x.id + ' (' + x.name + ')'; }).join(', ') + '. kind is one of: story, lesson, opinion, howto, behind, numbers. pillar is one of the pillar ids.' +
              (top.length ? '\n\nMy best posts so far started with:\n' + top.map(function (x) { return '- ' + HL.hook(x.text); }).join('\n') : '') }).then(function (r) { return r.ideas; });
  };
  ai.slides = function (ws, me, text) {
    return ai.call({ system: ai.system(ws, me), schema: S.slides, effort: 'low',
      prompt: 'Turn this post into a LinkedIn carousel of 6-9 slides. Slide 1 is the cover (a strong title, body one short line). Middle slides: one idea each, title up to 8 words, body up to 30 words. Last slide: a takeaway and a question. Only use what is in the post.\n\n"""\n' + text + '\n"""' }).then(function (r) { return r.slides; });
  };
})();

/* ===== _hl.html ===== */
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

/* ===== admin.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['overview', 'Overview', 'grid'], ['linkedin', 'LinkedIn', 'linkedin'], ['feedback', 'Feedback', 'inbox'], ['users', 'Users', 'users'], ['demo', 'Demo data', 'database']];

  UI.page('admin', { title: 'Admin', auth: 'admin' }, function (view, ctx) {
    var tab = TABS.some(function (t) { return t[0] === ctx.args[0]; }) ? ctx.args[0] : 'overview';
    var fbFilter = 'new';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><h1>Admin</h1><p class="muted">Only admins see this page.</p></div></div>' +
      '<nav class="ui-tabs">' + TABS.map(function (t) {
        return '<a href="#admin/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>';
      }).join('') + '</nav><div data-body><div class="ui-skel"></div></div></div>';
    var body = view.querySelector('[data-body]');

    function overview() {
      return UI.api('admin_overview').then(function (d) {
        var stat = function (n, label, go) { return '<a class="ui-card ui-stat" href="#admin/' + go + '" style="text-decoration:none;color:inherit"><b>' + n + '</b><span>' + label + '</span></a>'; };
        body.innerHTML = '<div class="ad-stats">' + stat(d.users, 'people signed up', 'users') + stat(d.admins, UI.plural(d.admins, 'admin').replace(/^\d+ /, ''), 'users') +
          stat(d.feedback_new, 'new feedback', 'feedback') + stat(d.posts, 'posts (' + d.posted + ' posted)', 'overview') + stat(d.ideas, 'ideas', 'overview') +
          stat(d.linkedin, 'LinkedIn connections', 'linkedin') + '</div>' +
          '<p class="muted small" style="margin-top:18px">Demo data is <b>' + esc(d.demo.state) + '</b> (' + d.demo.counts.users + ' demo people). Manage it in the Demo data tab.</p>';
      });
    }

    function feedback() {
      return UI.api('list_feedback', null).then(function (d) {
        var items = d.items.filter(function (i) { return fbFilter === 'all' || i.status === fbFilter; });
        body.innerHTML = '<div class="ui-row" style="margin-bottom:16px"><div class="ui-seg">' + [['new', 'New'], ['read', 'Read'], ['done', 'Done'], ['all', 'All']].map(function (f) {
          var n = f[0] === 'all' ? d.items.length : d.counts[f[0]];
          return '<button data-filter="' + f[0] + '" class="' + (fbFilter === f[0] ? 'on' : '') + '">' + f[1] + ' (' + n + ')</button>';
        }).join('') + '</div></div>' +
          (items.length ? '<div class="ad-fb">' + items.map(function (i) {
            var c = i.context || {};
            return '<div class="ui-item" data-id="' + esc(i.id) + '"><div class="meta"><span class="ui-badge ' + (i.kind === 'bug' ? 'bad' : i.kind === 'idea' ? 'brand' : '') + '">' + esc(i.kind_label) + '</span>' +
              '<b>' + esc(i.name) + '</b>' + (i.email ? '<a href="mailto:' + esc(i.email) + '">' + esc(i.email) + '</a>' : '') + '<span>' + esc(UI.fmtDateTime(i.created)) + '</span></div>' +
              '<p class="msg">' + esc(i.message) + '</p>' +
              '<div class="ctx">' + esc([c.page, c.screen, c.theme, c.browser].filter(Boolean).join(' · ')) + '</div>' +
              '<textarea data-note placeholder="Private note (only admins see it)">' + esc(i.note) + '</textarea>' +
              '<div class="ui-row" style="margin-top:10px">' + ['new', 'read', 'done'].map(function (s) {
                return '<button class="ui-btn sm' + (i.status === s ? ' primary' : '') + '" data-status="' + s + '">' + s[0].toUpperCase() + s.slice(1) + '</button>';
              }).join('') + '<span class="ui-spacer"></span><button class="ui-btn sm danger" data-del-fb>' + UI.icon('trash') + 'Delete</button></div></div>';
          }).join('') + '</div>'
            : '<div class="ui-empty">' + UI.icon('inbox') + '<h3>No ' + (fbFilter === 'all' ? '' : fbFilter + ' ') + 'messages</h3><p>Messages from the "Send feedback" form show up here.</p></div>');
      });
    }

    function users(query) {
      return UI.api('list_users', query || null).then(function (d) {
        body.innerHTML = '<form class="ui-row" data-search style="margin-bottom:14px"><input type="search" name="q" placeholder="Search by name or email" value="' + esc(query || '') + '" style="max-width:360px">' +
          '<button class="ui-btn" type="submit">' + UI.icon('search') + 'Search</button><span class="muted small">' + UI.plural(d.total, 'person', 'people') + '</span></form>' +
          '<table class="ad-users"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Admin</th><th>Active</th></tr></thead><tbody>' +
          d.users.map(function (u) {
            return '<tr data-id="' + esc(u.id) + '"><td><b>' + esc(u.name) + '</b></td><td class="email">' + esc(u.email) + '</td><td class="joined muted">' + esc(UI.fmtDate(u.joined)) + '</td>' +
              '<td><label class="ui-check"><input type="checkbox" data-admin' + (u.is_admin ? ' checked' : '') + '> Admin</label></td>' +
              '<td><label class="ui-check"><input type="checkbox" data-enabled' + (u.enabled ? ' checked' : '') + '> Active</label></td></tr>';
          }).join('') + '</tbody></table>';
      });
    }

    function demo() {
      return UI.api('admin_overview').then(function (d) {
        var c = d.demo.counts;
        body.innerHTML = '<div class="ui-card ui-narrow" style="margin:0"><h3>Demo data</h3>' +
          '<p class="muted">Example people and content, so the app never looks empty for the first visitors. Demo rows are flagged, so removing them never touches real data. Once removed, it stays removed until you load it again.</p>' +
          '<p>Status: <b>' + esc(d.demo.state) + '</b> · ' + Object.keys(c).map(function (k) { return c[k] + ' ' + esc(k); }).join(', ') + '</p>' +
          '<div class="ui-row"><button class="ui-btn primary" data-demo="load">' + UI.icon('refresh') + (d.demo.state === 'loaded' ? 'Reload demo data' : 'Load demo data') + '</button>' +
          '<button class="ui-btn danger" data-demo="remove">' + UI.icon('trash') + 'Remove demo data</button></div></div>';
      });
    }

    function linkedin() {
      return UI.api('li_admin').then(function (d) {
        body.innerHTML = '<div class="ui-card ui-narrow" style="margin:0"><h3>One-click posting</h3>' +
          '<p>Status: <b>' + (d.configured ? 'switched on' : 'not set up') + '</b> · ' + UI.plural(d.connections, 'person', 'people') + ' connected</p>' +
          '<ol class="small" style="padding-left:18px"><li>At linkedin.com/developers, create an app (it needs a LinkedIn Page; your company page works).</li>' +
          '<li>Products tab: add <b>Sign In with LinkedIn using OpenID Connect</b> and <b>Share on LinkedIn</b>.</li>' +
          '<li>Auth tab: add this redirect URL: <code>' + esc(d.redirect_uri) + '</code></li>' +
          '<li>In the Anvil editor → App Secrets: <code>linkedin_client_id</code> and <code>linkedin_client_secret</code> from the Auth tab.</li></ol>' +
          '<p class="small muted">Until then, everyone posts with Copy and open LinkedIn. Hookline never posts on a timer (LinkedIn\'s API terms forbid automated posting).</p>' +
          '<form class="ui-row" data-liv style="margin-top:12px"><label class="ui-field" style="flex:1"><span>LinkedIn-Version header (YYYYMM)</span><input type="text" name="v" value="' + esc(d.version) + '" maxlength="6"></label>' +
          '<button class="ui-btn" type="submit" style="align-self:flex-end">Save</button></form><p class="small muted">LinkedIn retires each monthly API version after about a year. If posting starts failing with HTTP 426, set a recent month here.</p></div>';
      });
    }
    var DRAW = { overview: overview, linkedin: linkedin, feedback: feedback, users: users, demo: demo };

    view.addEventListener('click', function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) { fbFilter = f.getAttribute('data-filter'); feedback(); return; }
      var st = e.target.closest('[data-status]');
      if (st) {
        var card = st.closest('[data-id]');
        UI.api('set_feedback_status', card.getAttribute('data-id'), st.getAttribute('data-status'), card.querySelector('[data-note]').value).then(function () { UI.toast('Saved', 'ok'); feedback(); });
        return;
      }
      var del = e.target.closest('[data-del-fb]');
      if (del) {
        UI.confirm({ title: 'Delete this message?', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_feedback', del.closest('[data-id]').getAttribute('data-id')).then(feedback);
        });
        return;
      }
      var dm = e.target.closest('[data-demo]');
      if (dm) {
        var load = dm.getAttribute('data-demo') === 'load';
        UI.confirm({ title: load ? 'Load the demo data?' : 'Remove the demo data?', text: load ? 'Demo people and content are added (any old demo rows are replaced).' : 'Every demo row is deleted. Real data stays.', ok: load ? 'Load' : 'Remove', danger: !load })
          .then(function (yes) { if (yes) UI.busy(dm, UI.api(load ? 'demo_load' : 'demo_remove')).then(function () { UI.toast('Done', 'ok'); demo(); }); });
      }
    });
    view.addEventListener('change', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      var id = row.getAttribute('data-id'), box = e.target;
      var fn = box.hasAttribute('data-admin') ? 'set_admin' : box.hasAttribute('data-enabled') ? 'set_enabled' : null;
      if (fn) UI.api(fn, id, box.checked).then(function () { UI.toast('Saved', 'ok'); }, function (err) { box.checked = !box.checked; UI.toast(err.message, 'error'); });
    });
    view.addEventListener('submit', function (e) {
      if (e.target.matches('[data-search]')) { e.preventDefault(); users(UI.formData(e.target).q); }
      if (e.target.matches('[data-liv]')) { e.preventDefault(); UI.api('li_set_version', UI.formData(e.target).v).then(function () { UI.toast('Saved', 'ok'); }); }
    });
    return DRAW[tab]();
  });
})();

/* ===== auth.html ===== */
(function () {
  var esc = UI.esc;
  function pw(name, auto) {
    return '<div class="au-pw"><input type="password" name="' + name + '" autocomplete="' + auto + '" required minlength="8">' +
      '<button type="button" data-show>Show</button></div>';
  }
  UI.page('auth', { title: 'Sign in', auth: 'guest' }, function (view, ctx) {
    var mode = ['signup', 'reset'].indexOf(ctx.args[0]) >= 0 ? ctx.args[0] : 'login';
    function draw(msg, isErr) {
      var heading = { login: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' }[mode];
      var sub = { login: 'Sign in to continue to ' + esc(UI.config.name) + '.', signup: 'It\'s free and takes a few seconds.',
        reset: 'We\'ll email you a link to choose a new password.' }[mode];
      view.innerHTML = '<div class="au-wrap"><div class="ui-card au-card">' +
        '<h1>' + heading + '</h1><p class="muted">' + sub + '</p>' +
        (mode !== 'reset' ? '<div class="ui-seg" role="tablist"><button type="button" data-mode="login" class="' + (mode === 'login' ? 'on' : '') + '">Sign in</button>' +
          '<button type="button" data-mode="signup" class="' + (mode === 'signup' ? 'on' : '') + '">Create account</button></div>' : '<div style="height:14px"></div>') +
        '<form class="ui-stack" data-form="' + mode + '" novalidate>' +
        (mode === 'signup' ? '<label class="ui-field"><span>Your name</span><input type="text" name="name" autocomplete="name" required maxlength="60"></label>' : '') +
        '<label class="ui-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>' +
        (mode === 'login' ? '<label class="ui-field"><span>Password</span>' + pw('password', 'current-password') + '</label>' : '') +
        (mode === 'signup' ? '<label class="ui-field"><span>Password <em>(at least 8 characters)</em></span>' + pw('password', 'new-password') + '</label>' +
          (window.LegalKit ? '<div>' + LegalKit.consentField() + '</div>' : '') : '') +
        '<div data-msg role="alert"' + (msg ? ' class="' + (isErr ? 'ui-error' : 'ui-note') + '">' + esc(msg) : ' hidden>') + '</div>' +
        '<button class="ui-btn primary block" type="submit">' + { login: 'Sign in', signup: 'Create account', reset: 'Send the link' }[mode] + '</button></form>' +
        '<div class="au-links">' + (mode === 'login' ? '<a data-mode="reset">Forgot your password?</a>' : '<a data-mode="login">' + UI.icon('back') + ' Back to sign in</a>') +
        '<a href="#landing" data-go="landing">About ' + esc(UI.config.name) + '</a></div></div></div>';
      var first = view.querySelector('input');
      if (first && !msg) first.focus();
    }
    view.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mode]');
      if (m) { e.preventDefault(); mode = m.getAttribute('data-mode'); history.replaceState(null, '', '#auth' + (mode === 'login' ? '' : '/' + mode)); draw(); return; }
      var s = e.target.closest('[data-show]');
      if (s) { var i = s.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; s.textContent = i.type === 'password' ? 'Show' : 'Hide'; }
    });
    view.addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target, v = UI.formData(form);
      var problem = !/^\S+@\S+\.\S+$/.test(v.email || '') ? 'Please enter a valid email address.'
        : mode !== 'reset' && (v.password || '').length < (mode === 'signup' ? 8 : 1) ? (mode === 'signup' ? 'Please choose a password of at least 8 characters.' : 'Please enter your password.')
        : mode === 'signup' && (v.name || '').trim().length < 2 ? 'Please tell us your name.' : null;
      if (problem) { say(problem, true); return; }
      if (mode === 'signup' && window.LegalKit && !LegalKit.consentChecked(form)) return;  // the kit shows its own message
      UI.busy(form.querySelector('[type=submit]'), UI.auth(mode, v)).then(function (r) {
        if (mode === 'reset' || (r && !r.me)) { mode = 'login'; draw(r && r.message, false); restore({ email: v.email }); }
        else UI.toast(mode === 'signup' ? 'Welcome to ' + UI.config.name + '!' : 'Welcome back!', 'ok');
      }, function (err) { say(err.message, true); });
    });
    function say(msg, isErr) {
      var box = view.querySelector('[data-msg]');
      box.className = isErr ? 'ui-error' : 'ui-note'; box.textContent = msg; box.hidden = false;
    }
    function restore(v) {
      ['name', 'email'].forEach(function (k) { var i = view.querySelector('[name=' + k + ']'); if (i && v[k]) i.value = v[k]; });
    }
    draw();
  });
})();

/* ===== calendar.html ===== */
(function () {
  var esc = UI.esc;
  var DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  UI.page('calendar', { title: 'Calendar', nav: 'Calendar', icon: 'calendar', auth: 'user', order: 30 }, function (view, ctx) {
    var ws = null, month = null, dragId = null;
    var m0 = (ctx.args[0] || '').match(/^(\d{4})-(\d{2})$/);
    month = m0 ? new Date(+m0[1], +m0[2] - 1, 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:520px"></div></div>';

    function byDay() {
      var map = {};
      ws.posts.forEach(function (p) { var w = HL.when(p); if (!w || (p.status !== 'scheduled' && p.status !== 'posted')) return; (map[HL.dayKey(w)] = map[HL.dayKey(w)] || []).push(p); });
      return map;
    }
    function bestTimes() {
      var posted = ws.posts.filter(function (p) { return p.status === 'posted' && p.metrics && p.metrics.impressions; });
      if (posted.length < 8) return null;
      var days = {}, hours = {};
      posted.forEach(function (p) {
        var d = new Date(p.posted_at), dk = (d.getDay() + 6) % 7, hk = d.getHours();
        (days[dk] = days[dk] || []).push(p.metrics.impressions); (hours[hk] = hours[hk] || []).push(p.metrics.impressions);
      });
      var avg = function (a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; };
      var d = Object.keys(days).filter(function (k) { return days[k].length >= 2; }).map(function (k) { return [DOW[k], avg(days[k]), days[k].length]; }).sort(function (a, b) { return b[1] - a[1]; });
      var h = Object.keys(hours).filter(function (k) { return hours[k].length >= 2; }).map(function (k) { return [k + ':00', avg(hours[k]), hours[k].length]; }).sort(function (a, b) { return b[1] - a[1]; });
      return { days: d.slice(0, 3), hours: h.slice(0, 3), n: posted.length };
    }
    function draw() {
      var map = byDay(), start = new Date(month), y = month.getFullYear(), mo = month.getMonth();
      start.setDate(1 - ((start.getDay() + 6) % 7));
      var cells = '', today = HL.dayKey(new Date()), target = ws.profile.cadence || 3, monthPosts = [];
      for (var w = 0; w < 6; w++) {
        var wkStart = new Date(start.getTime() + w * 7 * 864e5);
        if (w >= 4 && wkStart.getMonth() !== mo) break;
        var count = 0, days = '';
        for (var d = 0; d < 7; d++) {
          var day = new Date(wkStart.getTime() + d * 864e5), key = HL.dayKey(day), items = map[key] || [];
          count += items.length;
          if (day.getMonth() === mo) monthPosts = monthPosts.concat(items);
          days += '<div class="cl-day' + (day.getMonth() !== mo ? ' other' : '') + (key === today ? ' today' : '') + '" data-day="' + key + '"><span class="n">' + day.getDate() + '</span>' +
            '<button class="add" data-newon="' + key + '" aria-label="New post on ' + esc(day.toDateString()) + '">' + UI.icon('plus') + '</button>' +
            items.sort(function (a, b) { return new Date(HL.when(a)) - new Date(HL.when(b)); }).map(function (p) {
              var pl = HL.pillar(ws, p.pillar);
              return '<a class="cl-item ' + (p.status === 'posted' ? 'posted' : 'sched') + '" style="--pc:' + esc(pl ? pl.color : 'var(--c-brand)') + '" href="#studio/' + esc(p.id) + '" data-go="studio/' + esc(p.id) + '" draggable="' + (p.status === 'scheduled') + '" data-drag="' + esc(p.id) + '" title="' + esc(HL.hook(p.text)) + '">' +
                (p.status === 'posted' ? '✓ ' : esc(new Date(p.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) + ' ') + esc(HL.hook(p.text)) + '</a>';
            }).join('') + '</div>';
        }
        var dots = ''; for (var k = 0; k < Math.max(target, count); k++) dots += '<i class="' + (k < count ? 'on' : '') + '"></i>';
        cells += '<div class="cl-wk" title="' + count + ' of ' + target + ' this week"><b>' + count + '</b><span class="dots">' + dots + '</span></div>' + days;
      }
      var pillars = ws.profile.pillars || [], total = monthPosts.length || 1;
      var drafts = ws.posts.filter(function (p) { return p.status === 'draft'; }).slice(0, 12), bt = bestTimes();
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Your rhythm</div><h1>Calendar</h1><p class="muted">Target: ' + target + ' posts a week · <a href="#voice/rhythm" data-go="voice/rhythm">change</a></p></div>' +
        '<a class="ui-btn primary" href="#studio/new" data-go="studio/new">' + UI.icon('plus') + 'New post</a></div>' +
        '<div class="cl-wrap"><div><div class="cl-head"><button class="ui-btn icon" data-mv="-1" aria-label="Previous month">' + UI.icon('back') + '</button><h2>' + esc(month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })) + '</h2>' +
        '<button class="ui-btn icon" data-mv="1" aria-label="Next month">' + UI.icon('arrow') + '</button><button class="ui-btn sm" data-mv="0">Today</button></div>' +
        '<div class="cl-grid"><div class="cl-dow">Wk</div>' + DOW.map(function (d) { return '<div class="cl-dow">' + d + '</div>'; }).join('') + cells + '</div></div>' +
        '<aside class="cl-side"><div class="ui-card"><h3>Drafts to place</h3>' + (drafts.length ? '<p class="small muted">Drag one onto a day, or press the clock.</p>' + drafts.map(function (p) {
          return '<div class="cl-draft" draggable="true" data-drag="' + esc(p.id) + '"><button class="ui-btn ghost icon sm" data-pick="' + esc(p.id) + '" aria-label="Schedule">' + UI.icon('clock') + '</button>' + esc(HL.hook(p.text).slice(0, 80) || '(empty)') + '</div>';
        }).join('') : '<p class="small muted">No drafts. <a href="#ideas" data-go="ideas">Turn an idea into one.</a></p>') + '</div>' +
        '<div class="ui-card"><h3>Pillar mix this month</h3>' + (monthPosts.length ? '<div class="cl-mix">' + pillars.map(function (p) {
          var n = monthPosts.filter(function (x) { return x.pillar === p.id; }).length; return '<i style="width:' + (100 * n / total) + '%;background:' + esc(p.color) + '"></i>'; }).join('') + '</div>' : '<p class="small muted">Nothing this month yet.</p>') +
          pillars.map(function (p) { var n = monthPosts.filter(function (x) { return x.pillar === p.id; }).length, pct = Math.round(100 * n / total);
            return '<div class="cl-mix-row"><span><span class="ps-dot" style="background:' + esc(p.color) + ';display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px"></span>' + esc(p.name) + '</span><span>' + (monthPosts.length ? pct + '% · ' : '') + 'goal ' + p.target + '%</span></div>'; }).join('') + '</div>' +
        '<div class="ui-card"><h3>Your best times</h3>' + (bt ? '<div class="cl-times">' + bt.days.map(function (d) { return '<div><span>' + d[0] + '</span><span class="muted">' + HL.fmtNum(d[1]) + ' avg views</span></div>'; }).join('') +
          bt.hours.map(function (h) { return '<div><span>' + h[0] + '</span><span class="muted">' + HL.fmtNum(h[1]) + ' avg views</span></div>'; }).join('') + '</div><p class="small faint" style="margin:8px 0 0">From your ' + bt.n + ' posts with results. Patterns firm up after a few months.</p>'
          : '<p class="small muted">After 8 posts with results logged, Hookline shows which days and hours work for <i>your</i> audience. Until then, post when your audience is at work, and stay consistent.</p>') + '</div></aside></div></div>';
    }
    function schedule(id, dayKey, time) {
      var p = ws.posts.filter(function (x) { return x.id === id; })[0]; if (!p) return;
      var at = new Date(dayKey + 'T' + (time || '08:30') + ':00');
      UI.api('save_post', Object.assign({}, p, { status: 'scheduled', scheduled_at: at.toISOString() })).then(function (r) {
        ws.posts = ws.posts.map(function (x) { return x.id === id ? r.post : x; }); UI.toast('Scheduled for ' + UI.fmtDateTime(r.post.scheduled_at), 'ok'); draw();
      });
    }
    view.addEventListener('click', function (e) {
      var mv = e.target.closest('[data-mv]');
      if (mv) { var n = +mv.getAttribute('data-mv'); month = n ? new Date(month.getFullYear(), month.getMonth() + n, 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1); draw(); return; }
      var nw = e.target.closest('[data-newon]');
      if (nw) { var dk = nw.getAttribute('data-newon'); var m = UI.modal('<h2>' + esc(new Date(dk + 'T12:00').toDateString()) + '</h2><div class="ui-stack"><a class="ui-btn primary block" href="#studio/new" data-go="studio/new">' + UI.icon('pen') + 'Write a new post</a>' +
        (ws.posts.some(function (p) { return p.status === 'draft'; }) ? '<p class="small muted">Or schedule a draft for this day at 8:30:</p>' + ws.posts.filter(function (p) { return p.status === 'draft'; }).slice(0, 8).map(function (p) { return '<button class="ui-btn block" style="justify-content:flex-start" data-put="' + esc(p.id) + '">' + esc(HL.hook(p.text).slice(0, 60) || '(empty)') + '</button>'; }).join('') : '') + '</div>');
        m.el.addEventListener('click', function (ev) { var b = ev.target.closest('[data-put]'); if (b) { m.close(); schedule(b.getAttribute('data-put'), dk); } else if (ev.target.closest('[data-go]')) m.close(); });
        return; }
      var pk = e.target.closest('[data-pick]');
      if (pk) { e.preventDefault(); var id = pk.getAttribute('data-pick');
        var mm = UI.modal('<h2>Schedule</h2><label class="ui-field"><span>Date and time</span><input type="datetime-local" data-w></label><div class="ui-row end" style="margin-top:14px"><button class="ui-btn primary" data-ok>Schedule</button></div>');
        mm.el.querySelector('[data-ok]').onclick = function () { var v = mm.el.querySelector('[data-w]').value; if (!v) return; mm.close(); schedule(id, v.slice(0, 10), v.slice(11, 16)); }; }
    });
    view.addEventListener('dragstart', function (e) { var d = e.target.closest && e.target.closest('[data-drag]'); if (d) { dragId = d.getAttribute('data-drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) {} } });
    view.addEventListener('dragover', function (e) { var d = e.target.closest('.cl-day'); if (d && dragId) { e.preventDefault(); view.querySelectorAll('.cl-day.over').forEach(function (x) { if (x !== d) x.classList.remove('over'); }); d.classList.add('over'); } });
    view.addEventListener('drop', function (e) {
      var d = e.target.closest('.cl-day'); if (!d || !dragId) return; e.preventDefault();
      var p = ws.posts.filter(function (x) { return x.id === dragId; })[0], time = p && p.scheduled_at ? HL.localInput(p.scheduled_at).slice(11, 16) : '08:30';
      schedule(dragId, d.getAttribute('data-day'), time); dragId = null;
    });
    view.addEventListener('dragend', function () { dragId = null; view.querySelectorAll('.cl-day.over').forEach(function (x) { x.classList.remove('over'); }); });
    return HL.load().then(function (w) { ws = w; draw(); });
  });
})();

/* ===== carousel.html ===== */
(function () {
  var esc = UI.esc;
  var THEMES = {
    navy: { name: 'Navy & gold', bg: '#1e3a5f', ink: '#ffffff', sub: '#c9d6e6', accent: '#c9a227', title: '"DM Serif Display", Georgia, serif' },
    paper: { name: 'Paper', bg: '#f6f1e7', ink: '#1d1a16', sub: '#5e564b', accent: '#b8501a', title: '"DM Serif Display", Georgia, serif' },
    bold: { name: 'Bold', bg: '#0f0f10', ink: '#ffffff', sub: '#b9b9bd', accent: '#ffd23f', title: '"DM Sans", system-ui, sans-serif' },
    fresh: { name: 'Fresh', bg: '#e9f4ef', ink: '#10261c', sub: '#3f5d50', accent: '#1f7a52', title: '"DM Sans", system-ui, sans-serif' }
  };
  function fromPost(text) {
    var paras = text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean), slides = [];
    if (!paras.length) return [];
    slides.push({ title: HL.hook(text).slice(0, 120), body: '' });
    paras.slice(1).forEach(function (p) {
      var lines = p.split('\n'), first = lines[0].replace(/^(\d+[.)]|[-•→✅])\s*/, '');
      if (lines.length > 1) slides.push({ title: first.slice(0, 120), body: lines.slice(1).join('\n').slice(0, 500) });
      else if (p.length < 90) slides.push({ title: first, body: '' });
      else { var s = HL.sentences(p); slides.push({ title: s[0].slice(0, 120), body: s.slice(1).join(' ').slice(0, 500) }); }
    });
    return slides.slice(0, 12);
  }
  function wrap(ctx, text, maxW) {
    var out = [];
    String(text || '').split('\n').forEach(function (para) {
      var words = para.split(/\s+/), line = '';
      words.forEach(function (w) { var test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test; });
      out.push(line);
    });
    return out;
  }
  function render(canvas, slide, i, n, th, handle) {
    var c = canvas.getContext('2d'), W = 1080, H = 1350, P = 96;
    canvas.width = W; canvas.height = H;
    c.fillStyle = th.bg; c.fillRect(0, 0, W, H);
    c.fillStyle = th.accent; c.fillRect(P, P, 120, 10);
    c.fillStyle = th.sub; c.font = '600 30px "DM Sans", sans-serif'; c.textBaseline = 'alphabetic';
    c.fillText(i === 0 ? '' : (i + 1) + ' / ' + n, P, H - P + 10);
    if (handle) { c.textAlign = 'right'; c.fillText(handle, W - P, H - P + 10); c.textAlign = 'left'; }
    var big = i === 0 || !slide.body, size = big ? 92 : 70;
    c.font = (th.title.indexOf('Serif') >= 0 ? '400 ' : '700 ') + size + 'px ' + th.title; c.fillStyle = th.ink;
    var tl = wrap(c, slide.title, W - 2 * P);
    while (tl.length * size * 1.12 > (big ? 760 : 520) && size > 40) { size -= 6; c.font = (th.title.indexOf('Serif') >= 0 ? '400 ' : '700 ') + size + 'px ' + th.title; tl = wrap(c, slide.title, W - 2 * P); }
    var y = big ? Math.max(P + 200, (H - tl.length * size * 1.12) / 2) : P + 160;
    tl.forEach(function (l) { c.fillText(l, P, y); y += size * 1.12; });
    if (slide.body) {
      y += 40; var bs = 42; c.font = '400 ' + bs + 'px "DM Sans", sans-serif'; c.fillStyle = th.sub;
      var bl = wrap(c, slide.body, W - 2 * P);
      while (y + bl.length * bs * 1.4 > H - P - 80 && bs > 26) { bs -= 3; c.font = '400 ' + bs + 'px "DM Sans", sans-serif'; bl = wrap(c, slide.body, W - 2 * P); }
      bl.forEach(function (l) { c.fillText(l, P, y); y += bs * 1.4; });
    }
    if (i === 0 && n > 1) { c.fillStyle = th.accent; c.font = '600 34px "DM Sans", sans-serif'; c.fillText('Swipe →', P, H - P + 10); }
  }

  /* The carousel as a PDF File (jsPDF), for download or for posting as a LinkedIn document. */
  function pdfFile(post, car, me) {
    return HL.loadScript('_/theme/jspdf.umd.min.js', 'jspdf').then(function (lib) {
      var doc = new lib.jsPDF({ unit: 'px', format: [1080, 1350], orientation: 'portrait', hotfixes: ['px_scaling'] }), cv = document.createElement('canvas');
      car.slides.forEach(function (s, i) {
        render(cv, s, i, car.slides.length, THEMES[car.theme] || THEMES.navy, car.handle || me.name);
        if (i) doc.addPage([1080, 1350], 'portrait');
        doc.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 1080, 1350);
      });
      var name = (HL.hook(post.text).replace(/[^\w\- ]+/g, '').trim().slice(0, 40).replace(/\s+/g, '-').toLowerCase() || 'carousel') + '.pdf';
      return new File([doc.output('blob')], name, { type: 'application/pdf' });
    });
  }
  function fromPostOrSaved(post) {
    return post.carousel && post.carousel.slides && post.carousel.slides.length ? post.carousel : { theme: 'navy', handle: '', slides: fromPost(post.text) };
  }
  HL.carouselPdf = function (post, me) { return pdfFile(post, fromPostOrSaved(post), me); };   // also used by the flow test
  /* Post the carousel through LinkedIn's official Documents API (asks first). Resolves with the posted post, or null. */
  HL.postCarousel = function (post, me, car) {
    car = car || fromPostOrSaved(post);
    return UI.confirm({ title: 'Post with the carousel?', text: 'Hookline makes the ' + car.slides.length + '-slide PDF and posts it on LinkedIn as a document, with your post text above it. This publishes right away.', ok: 'Post now' }).then(function (yes) {
      if (!yes) return null;
      UI.toast('Making the PDF and uploading it to LinkedIn…');
      return pdfFile(post, car, me).then(function (file) { return UI.upload('li_post_document', file, post.id, HL.hook(post.text).slice(0, 120)); })
        .then(function (r) { UI.toast('Posted on LinkedIn, with the carousel.', 'ok'); if (post.first_comment) HL.copy(post.first_comment, 'First comment copied: paste it under your post.'); return r.post; });
    });
  };

  UI.page('carousel', { title: 'Carousel', auth: 'user' }, function (view, ctx) {
    var ws = null, post = null, car = null, cur = 0;
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:420px"></div></div>';
    function draw() {
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow"><a href="#studio/' + esc(post.id) + '" data-go="studio/' + esc(post.id) + '">← Back to the post</a></div><h1>Carousel</h1>' +
        '<p class="muted">A PDF of square-ish slides (1080×1350). On LinkedIn: Start a post → Add a document → upload it, then paste your text.</p></div>' +
        '<div class="ui-row"><button class="ui-btn" data-regen>' + UI.icon(HL.ai.has() ? 'sparkle' : 'refresh') + (HL.ai.has() ? 'Slides with AI' : 'Rebuild from post') + '</button><button class="ui-btn' + (canPost() ? '' : ' gold') + '" data-pdf>' + UI.icon('download') + 'Download PDF</button>' +
        (canPost() ? '<button class="ui-btn gold" data-lipost>' + UI.icon('send') + 'Post on LinkedIn</button>' : post.status === 'posted' ? '<span class="ui-badge good">' + UI.icon('check') + 'Posted</span>' : '') + '</div></div>' +
        '<div class="cr-grid"><div><div class="cr-themes" role="group" aria-label="Theme">' + Object.keys(THEMES).map(function (k) { return '<button data-theme="' + k + '" class="' + (car.theme === k ? 'on' : '') + '"><i style="background:' + THEMES[k].bg + ';box-shadow:inset 0 0 0 4px ' + THEMES[k].accent + '"></i>' + THEMES[k].name + '</button>'; }).join('') + '</div>' +
        '<label class="ui-field" style="margin-bottom:12px"><span>Name on every slide <em>(optional)</em></span><input type="text" data-handle value="' + esc(car.handle || '') + '" placeholder="' + esc(ctx.me.name) + '" maxlength="60"></label>' +
        '<div class="cr-slides">' + car.slides.map(function (s, i) {
          return '<div class="cr-slide' + (i === cur ? ' on' : '') + '" data-i="' + i + '"><div class="hd"><b>' + (i === 0 ? 'Cover' : 'Slide ' + (i + 1)) + '</b><span class="ui-spacer"></span>' +
            '<button class="ui-btn ghost icon sm" data-mv="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>' + UI.icon('up') + '</button><button class="ui-btn ghost icon sm" data-mv="1" aria-label="Move down"' + (i === car.slides.length - 1 ? ' disabled' : '') + '>' + UI.icon('down') + '</button>' +
            '<button class="ui-btn ghost icon sm" data-rm aria-label="Delete slide">' + UI.icon('trash') + '</button></div>' +
            '<input type="text" data-t value="' + esc(s.title) + '" maxlength="140" aria-label="Slide title"><textarea data-b maxlength="600" placeholder="Body (optional)" aria-label="Slide text">' + esc(s.body) + '</textarea></div>';
        }).join('') + '</div><button class="ui-btn sm" data-add style="margin-top:10px"' + (car.slides.length >= 20 ? ' disabled' : '') + '>' + UI.icon('plus') + 'Add slide</button></div>' +
        '<div class="cr-prev"><canvas data-canvas aria-label="Slide preview" role="img"></canvas><div class="cr-nav"><button class="ui-btn icon sm" data-prev aria-label="Previous slide">' + UI.icon('back') + '</button><span>' + (cur + 1) + ' / ' + car.slides.length + '</span><button class="ui-btn icon sm" data-next aria-label="Next slide">' + UI.icon('arrow') + '</button></div></div></div></div>';
      preview();
    }
    function preview() {
      var cv = view.querySelector('[data-canvas]'); if (!cv || !car.slides.length) return;
      var go = function () { render(cv, car.slides[cur], cur, car.slides.length, THEMES[car.theme] || THEMES.navy, car.handle || ctx.me.name); };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
      var nav = view.querySelector('.cr-nav span'); if (nav) nav.textContent = (cur + 1) + ' / ' + car.slides.length;
      view.querySelectorAll('.cr-slide').forEach(function (el) { el.classList.toggle('on', +el.getAttribute('data-i') === cur); });
    }
    var st = null;
    function persist() { clearTimeout(st); st = setTimeout(function () { UI.apiQuiet('save_post', Object.assign({}, post, { carousel: car, format: 'carousel' })).then(function (r) { post = r.post; }).catch(function () {}); }, 900); }
    function canPost() { return ws.linkedin && ws.linkedin.connected && post.status !== 'posted'; }
    function pdf(btn) {
      UI.busy(btn, pdfFile(post, car, ctx.me).then(function (file) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
      })).then(function () { UI.toast('PDF downloaded. Upload it as a document on LinkedIn.', 'ok'); }, function () { UI.toast('Couldn\'t make the PDF.', 'error'); });
    }
    view.addEventListener('input', function (e) {
      var row = e.target.closest('[data-i]');
      if (e.target.matches('[data-handle]')) { car.handle = e.target.value; preview(); persist(); return; }
      if (!row) return;
      var i = +row.getAttribute('data-i');
      if (e.target.matches('[data-t]')) car.slides[i].title = e.target.value;
      if (e.target.matches('[data-b]')) car.slides[i].body = e.target.value;
      cur = i; preview(); persist();
    });
    view.addEventListener('focusin', function (e) { var row = e.target.closest('[data-i]'); if (row && +row.getAttribute('data-i') !== cur) { cur = +row.getAttribute('data-i'); preview(); } });
    view.addEventListener('click', function (e) {
      var t = e.target;
      var th = t.closest('[data-theme]'); if (th) { car.theme = th.getAttribute('data-theme'); view.querySelectorAll('[data-theme]').forEach(function (b) { b.classList.toggle('on', b === th); }); preview(); persist(); return; }
      if (t.closest('[data-prev]')) { cur = Math.max(0, cur - 1); preview(); return; }
      if (t.closest('[data-next]')) { cur = Math.min(car.slides.length - 1, cur + 1); preview(); return; }
      if (t.closest('[data-add]')) { car.slides.push({ title: 'New slide', body: '' }); cur = car.slides.length - 1; draw(); persist(); return; }
      var pd = t.closest('[data-pdf]'); if (pd) { pdf(pd); return; }
      var lp = t.closest('[data-lipost]');
      if (lp) { clearTimeout(st); UI.busy(lp, UI.api('save_post', Object.assign({}, post, { carousel: car, format: 'carousel' })).then(function (r) { post = r.post; return HL.postCarousel(post, ctx.me, car); }))
        .then(function (p2) { if (p2) { post = p2; draw(); } }); return; }
      var rg = t.closest('[data-regen]');
      if (rg) {
        UI.confirm({ title: 'Replace these slides?', text: HL.ai.has() ? 'The AI writes new slides from your post.' : 'Slides are rebuilt from your post\'s paragraphs.', ok: 'Replace' }).then(function (y) {
          if (!y) return;
          (HL.ai.has() ? UI.busy(rg, HL.ai.slides(ws, ctx.me, post.text)) : Promise.resolve(fromPost(post.text))).then(function (sl) { car.slides = sl.slice(0, 20); cur = 0; draw(); persist(); }, function (err) { UI.toast(err.message, 'error'); });
        });
        return;
      }
      var row = t.closest('[data-i]'); if (!row) return;
      var i = +row.getAttribute('data-i');
      var mv = t.closest('[data-mv]'); if (mv) { var j = i + (+mv.getAttribute('data-mv')); car.slides.splice(j, 0, car.slides.splice(i, 1)[0]); cur = j; draw(); persist(); return; }
      if (t.closest('[data-rm]')) { if (car.slides.length <= 1) return; car.slides.splice(i, 1); cur = Math.min(cur, car.slides.length - 1); draw(); persist(); }
    });
    return HL.load().then(function (w) {
      ws = w; post = ws.posts.filter(function (p) { return p.id === ctx.args[0]; })[0];
      if (!post) { view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('slides') + '<h3>Pick a post first</h3><p>Open a post in the studio and press Carousel.</p><a class="ui-btn primary" href="#posts" data-go="posts">Your posts</a></div></div>'; return; }
      car = post.carousel && post.carousel.slides && post.carousel.slides.length ? JSON.parse(JSON.stringify(post.carousel)) : { theme: 'navy', handle: '', slides: fromPost(post.text) };
      if (!car.slides.length) car.slides = [{ title: HL.hook(post.text) || 'Title', body: '' }];
      draw();
    });
  });
})();

/* ===== ideas.html ===== */
(function () {
  var esc = UI.esc;
  var DRAFT_SHAPE = { story: 'story', lesson: 'story', opinion: 'opinion', howto: 'howto', behind: 'behind', numbers: 'case' };
  UI.page('ideas', { title: 'Ideas', nav: 'Ideas', icon: 'bulb', auth: 'user', order: 55 }, function (view, ctx) {
    var ws = null, kind = 'story', pi = 0, filter = 'open';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:420px"></div></div>';
    function prompts() { return HL.PROMPTS[kind]; }
    function draw() {
      var list = ws.ideas.filter(function (i) { return filter === 'all' || (filter === 'open' ? !i.used : i.used); });
      var opts = '<option value="">Any pillar</option>' + (ws.profile.pillars || []).map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('');
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Idea bank</div><h1>Ideas</h1><p class="muted">Your best posts come from your own week. Catch ideas the moment they show up.</p></div></div>' +
        '<div class="id-grid"><div><form class="id-capture" data-cap><input type="text" name="text" placeholder="An idea, in a line" maxlength="600" aria-label="New idea"><select name="pillar" aria-label="Pillar">' + opts + '</select><button class="ui-btn primary" type="submit">' + UI.icon('plus') + 'Add</button></form>' +
        '<div class="ui-row" style="margin-bottom:12px"><div class="ui-seg">' + [['open', 'To write'], ['used', 'Used'], ['all', 'All']].map(function (f) { return '<button data-filter="' + f[0] + '" class="' + (filter === f[0] ? 'on' : '') + '">' + f[1] + '</button>'; }).join('') + '</div>' +
        '<span class="ui-spacer"></span><button class="ui-btn sm" data-aiideas>' + UI.icon('sparkle') + 'Suggest 10 ideas</button></div>' +
        (list.length ? '<div class="id-list">' + list.map(function (i) {
          return '<div class="id-item' + (i.used ? ' used' : '') + '" data-id="' + esc(i.id) + '"><div class="grow"><div class="meta">' + (i.kind && HL.KINDS[i.kind] ? '<span class="ui-badge gold">' + esc(HL.KINDS[i.kind]) + '</span>' : '') + HL.pillarChip(ws, i.pillar) +
            (i.example ? '<span class="ui-badge">Example</span>' : '') + '<span>' + esc(UI.ago(i.created)) + '</span></div><p>' + esc(i.text) + '</p></div>' +
            '<div class="id-acts"><button class="ui-btn sm primary" data-draft>' + UI.icon('pen') + 'Draft it</button><button class="ui-btn ghost icon sm" data-used aria-label="' + (i.used ? 'Mark as not used' : 'Mark as used') + '">' + UI.icon(i.used ? 'refresh' : 'check') + '</button>' +
            '<button class="ui-btn ghost icon sm" data-del aria-label="Delete idea">' + UI.icon('trash') + '</button></div></div>';
        }).join('') + '</div>' : '<div class="ui-empty">' + UI.icon('bulb') + '<h3>' + (filter === 'used' ? 'No used ideas yet' : 'No ideas waiting') + '</h3><p>Answer a question on the right, or add one above.</p></div>') + '</div>' +
        '<aside class="id-side"><div class="id-prompt"><div class="eyebrow">Answer one question</div><h3>' + esc(prompts()[pi % prompts().length]) + '</h3>' +
        '<form data-ans><textarea name="a" rows="3" placeholder="A few words is enough. It\'s saved as an idea."></textarea><div class="ui-row" style="margin-top:10px"><button type="button" class="ui-btn ghost sm" data-skip>' + UI.icon('refresh') + 'Another</button><span class="ui-spacer"></span><button class="ui-btn gold sm" type="submit">' + UI.icon('plus') + 'Save idea</button></div></form>' +
        '<div class="id-kinds">' + Object.keys(HL.KINDS).map(function (k) { return '<button data-kind="' + k + '" class="' + (k === kind ? 'on' : '') + '">' + HL.KINDS[k] + '</button>'; }).join('') + '</div></div>' +
        '<div class="ui-card"><h3 style="font-size:.95rem">Why your own life?</h3><p class="small muted" style="margin:0">Hookline doesn\'t hand you a library of other people\'s viral posts. Readers can tell, and LinkedIn\'s feed now favours real expertise and substance. Your moments, mistakes and numbers are what nobody else can post.</p></div></aside></div></div>';
    }
    function reload() { return HL.load().then(function (w) { ws = w; draw(); }); }
    function draft(i) {
      var shape = DRAFT_SHAPE[i.kind] || 'story';
      if (HL.ai.has()) {
        var m = UI.modal('<h2>Drafting…</h2><p class="muted small">' + esc(i.text) + '</p><div class="hl-ai-out" data-out>…</div><div class="ui-row end" style="margin-top:12px" data-done hidden><button class="ui-btn ghost" data-skel>Use a blank structure instead</button><button class="ui-btn primary" data-use>' + UI.icon('pen') + 'Edit in the studio</button></div>', { wide: true });
        var out = m.el.querySelector('[data-out]'), text = '';
        HL.ai.draft(ws, ctx.me, i.text, shape, function (t) { out.textContent = t; out.scrollTop = out.scrollHeight; }).then(function (t) { text = HL.plain(t.trim()); out.textContent = text; m.el.querySelector('[data-done]').hidden = false; }, function (e) { out.textContent = e.message; m.el.querySelector('[data-done]').hidden = false; });
        m.el.addEventListener('click', function (e) {
          if (e.target.closest('[data-use]')) { m.close(); UI.store.set('seed', { text: text, pillar: i.pillar, idea: i.id }); UI.go('studio', 'new'); }
          if (e.target.closest('[data-skel]')) { m.close(); UI.store.set('seed', { text: '[' + i.text + ']\n\n' + HL.structureText(shape), pillar: i.pillar, idea: i.id }); UI.go('studio', 'new'); }
        });
        return;
      }
      UI.store.set('seed', { text: '[' + i.text + ']\n\n' + HL.structureText(shape), pillar: i.pillar, idea: i.id });
      UI.go('studio', 'new');
    }
    view.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, btn = f.querySelector('[type=submit]');
      if (f.matches('[data-cap]')) {
        var v = UI.formData(f); if (!v.text.trim()) return;
        UI.busy(btn, UI.api('save_idea', v.text, '', v.pillar)).then(function () { UI.toast('Saved', 'ok'); reload(); });
      }
      if (f.matches('[data-ans]')) {
        var a = f.a.value.trim(); if (!a) { UI.toast('Write a few words first.', 'error'); return; }
        var q = prompts()[pi % prompts().length];
        UI.busy(btn, UI.api('save_idea', q + ': ' + a, kind, '')).then(function () { pi++; UI.toast('Saved as an idea', 'ok'); reload(); });
      }
    });
    view.addEventListener('click', function (e) {
      var t = e.target;
      var f = t.closest('[data-filter]'); if (f) { filter = f.getAttribute('data-filter'); draw(); return; }
      var k = t.closest('[data-kind]'); if (k) { kind = k.getAttribute('data-kind'); pi = 0; draw(); return; }
      if (t.closest('[data-skip]')) { pi++; draw(); return; }
      var ai = t.closest('[data-aiideas]');
      if (ai) {
        if (!HL.ai.has()) { UI.modal('<h2>Idea suggestions</h2>' + HL.ai.nudge('get 10 ideas from your pillars and best posts') + '<p class="small muted" style="margin-top:12px">No key? The question card on the right works without one.</p>'); return; }
        UI.busy(ai, HL.ai.ideas(ws, ctx.me).then(function (ideas) {
          return UI.api('save_ideas', ideas.map(function (x) { return { text: x.text, kind: HL.KINDS[x.kind] ? x.kind : '', pillar: x.pillar }; }));
        })).then(function (r) { UI.toast(UI.plural(r.ideas.length, 'idea') + ' added', 'ok'); reload(); }, function (err) { UI.toast(err.message, 'error'); });
        return;
      }
      var row = t.closest('[data-id]'); if (!row) return;
      var idea = ws.ideas.filter(function (x) { return x.id === row.getAttribute('data-id'); })[0];
      if (t.closest('[data-draft]')) { draft(idea); return; }
      if (t.closest('[data-used]')) { UI.api('set_idea_used', idea.id, !idea.used).then(reload); return; }
      if (t.closest('[data-del]')) UI.api('delete_idea', idea.id).then(function () { UI.toast('Deleted'); reload(); });
    });
    return reload();
  });
})();

/* ===== insights.html ===== */
(function () {
  var esc = UI.esc;
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function avg(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : 0; }

  /* ---------------- reading LinkedIn's export (XLSX or CSV) */
  function cellDate(v) {
    if (v instanceof Date) return HL.dayKey(v);
    var s = String(v || '').trim(), m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
    return null;
  }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }
  /* Find tables by their header names, wherever they sit in a sheet (LinkedIn's TOP POSTS sheet has two side by side). */
  function tables(rows) {
    var out = [];
    rows.forEach(function (r, ri) {
      (r || []).forEach(function (c, ci) {
        var h = String(c || '').toLowerCase().trim();
        if (h === 'date' || h === 'post url' || h === 'post publish date') out.push({ row: ri, col: ci, head: h });
      });
    });
    return out;
  }
  function parseWorkbook(XLSX, wb) {
    var res = { daily: [], top: [], followers: [], demographics: [], followers_total: 0, source: 'LinkedIn export' };
    var topMap = {};
    wb.SheetNames.forEach(function (name) {
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' }), low = name.toLowerCase();
      rows.forEach(function (r) {   // "Total followers on 10/3/2026:" | 812  -> the last number in that row
        if (!/total followers/i.test((r || []).join(' '))) return;
        var nums = (r || []).filter(function (x) { return typeof x === 'number' || /^[\d,]+$/.test(String(x).trim()); });
        if (nums.length) res.followers_total = num(nums[nums.length - 1]);
      });
      tables(rows).forEach(function (t) {
        var head = rows[t.row].map(function (x) { return String(x || '').toLowerCase().trim(); });
        var find = function (re, from) { for (var i = from || t.col; i < head.length && i < t.col + 4; i++) if (re.test(head[i])) return i; return -1; };
        if (t.head === 'date') {
          var iImp = find(/impression/), iEng = find(/engagement/), iNew = find(/new followers/);
          for (var r = t.row + 1; r < rows.length; r++) {
            var d = cellDate(rows[r][t.col]); if (!d) continue;
            if (iImp >= 0 || iEng >= 0) res.daily.push({ date: d, impressions: num(rows[r][iImp]), engagements: num(rows[r][iEng]) });
            else if (iNew >= 0) res.followers.push({ date: d, 'new': num(rows[r][iNew]) });
          }
        }
        if (t.head === 'post url') {
          var iDate = find(/publish date|date/, t.col + 1), iI = find(/impression/, t.col + 1), iE = find(/engagement/, t.col + 1);
          for (var k = t.row + 1; k < rows.length; k++) {
            var url = String(rows[k][t.col] || '').trim(); if (!/^https:\/\//.test(url)) continue;
            var o = topMap[url] = topMap[url] || { url: url, date: cellDate(rows[k][iDate]) || '', impressions: 0, engagements: 0 };
            if (iI >= 0) o.impressions = Math.max(o.impressions, num(rows[k][iI]));
            if (iE >= 0) o.engagements = Math.max(o.engagements, num(rows[k][iE]));
          }
        }
      });
      if (/demograph/.test(low)) {
        rows.forEach(function (r) { if (r && r.length >= 3 && r[0] && r[1] && /\d/.test(String(r[2]))) { var p = num(r[2]); if (p <= 1 && p > 0) p *= 100; if (p > 0) res.demographics.push({ category: String(r[0]).slice(0, 40), value: String(r[1]).slice(0, 80), pct: p }); } });
      }
    });
    res.top = Object.keys(topMap).map(function (k) { return topMap[k]; });
    return res;
  }
  function readFile(file) {
    return HL.loadScript('_/theme/xlsx.full.min.js', 'XLSX').then(function (XLSX) {
      return file.arrayBuffer().then(function (buf) { return parseWorkbook(XLSX, XLSX.read(buf, { type: 'array', cellDates: true })); });
    });
  }

  /* ---------------- charts */
  function lineChart(daily, postDays, W) {
    if (!daily.length) return '<p class="muted small">No daily numbers yet: import your LinkedIn analytics export.</p>';
    W = Math.max(300, Math.round(W || 760)); var H = W < 500 ? 200 : 220, L = 44, R = 8, T = 10, B = 26, max = Math.max.apply(null, daily.map(function (d) { return d.impressions; }).concat([10]));
    var step = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / step) * step;
    var x = function (i) { return L + (W - L - R) * (daily.length < 2 ? 0.5 : i / (daily.length - 1)); }, y = function (v) { return T + (H - T - B) * (1 - v / top); };
    var pts = daily.map(function (d, i) { return x(i).toFixed(1) + ',' + y(d.impressions).toFixed(1); });
    var grid = '', ticks = 4;
    for (var g = 0; g <= ticks; g++) { var v = top * g / ticks; grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/>'; }
    var labels = ''; for (var g2 = 0; g2 <= ticks; g2++) labels += '<text x="' + (L - 8) + '" y="' + (y(top * g2 / ticks) + 4).toFixed(1) + '" text-anchor="end">' + HL.fmtNum(top * g2 / ticks) + '</text>';
    var xl = ''; [0, Math.floor(daily.length / 2), daily.length - 1].forEach(function (i) { xl += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === daily.length - 1 ? 'end' : 'middle') + '">' + esc(UI.fmtDate(daily[i].date, { day: 'numeric', month: 'short' })) + '</text>'; });
    var mk = daily.map(function (d, i) { return postDays[d.date] ? '<circle class="mk" r="5" cx="' + x(i).toFixed(1) + '" cy="' + y(d.impressions).toFixed(1) + '"/>' : ''; }).join('');
    return '<div class="in-chart" data-line data-w="' + W + '" data-h="' + H + '"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Impressions per day for ' + daily.length + ' days">' +
      '<g class="grid">' + grid + '</g><path class="area" d="M' + x(0) + ',' + y(0) + ' L' + pts.join(' L') + ' L' + x(daily.length - 1) + ',' + y(0) + 'Z"/>' +
      '<polyline class="line" points="' + pts.join(' ') + '"/>' + mk + '<g class="axis">' + labels + xl + '</g><line class="cross" data-cross x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '" visibility="hidden"/><circle class="dot" data-dot r="5" visibility="hidden"/></svg>' +
      '<div class="in-tip" data-tip hidden></div></div><div class="in-legend"><span><i style="background:var(--c-brand)"></i>Impressions per day</span><span><i style="background:var(--c-accent)"></i>Days you posted</span></div>';
  }
  function bars(rows, unit) {
    if (!rows.length) return '<p class="muted small">Not enough posts with results yet.</p>';
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1])), best = rows.reduce(function (b, r) { return r[1] > b ? r[1] : b; }, 0);
    return '<div class="in-bars">' + rows.map(function (r) {
      return '<div class="in-bar' + (r[1] === best && rows.length > 1 ? ' top' : '') + '" title="' + esc(r[0]) + ': ' + Math.round(r[1]).toLocaleString() + ' ' + unit + ' from ' + UI.plural(r[2], 'post') + '"><span class="t">' + r[0] + '</span>' +
        '<span class="tr"><i style="width:' + (100 * r[1] / max).toFixed(1) + '%"></i></span><span class="v">' + HL.fmtNum(r[1]) + ' <small>· ' + r[2] + '</small></span></div>';
    }).join('') + '</div>';
  }
  function groupAvg(posts, keyFn, labelFn) {
    var g = {};
    posts.forEach(function (p) { var k = keyFn(p); if (k == null || k === '') return; (g[k] = g[k] || []).push(p.metrics.impressions); });
    return Object.keys(g).map(function (k) { return [labelFn(k), avg(g[k]), g[k].length]; }).sort(function (a, b) { return b[1] - a[1]; });
  }
  function findings(ws, posts) {
    var out = [];
    if (posts.length < 5) return ['Log results for at least 5 posts and Hookline starts spotting patterns.'];
    var fm = groupAvg(posts, function (p) { return p.format; }, function (k) { return HL.FORMATS[k][0]; }).filter(function (r) { return r[2] >= 2; });
    if (fm.length >= 2) out.push('<b>' + esc(fm[0][0]) + '</b> posts get ' + (fm[0][1] / fm[fm.length - 1][1]).toFixed(1) + '× the views of ' + esc(fm[fm.length - 1][0].toLowerCase()) + ' posts for you.');
    var pl = groupAvg(posts, function (p) { return p.pillar; }, function (k) { var x = HL.pillar(ws, k); return x ? x.name : k; }).filter(function (r) { return r[2] >= 2; });
    if (pl.length >= 2) out.push('Your <b>' + esc(pl[0][0]) + '</b> posts do best (' + HL.fmtNum(pl[0][1]) + ' views on average).');
    var short = posts.filter(function (p) { return HL.hook(p.text).length <= 60; }), long = posts.filter(function (p) { return HL.hook(p.text).length > 60; });
    if (short.length >= 3 && long.length >= 3) { var a = avg(short.map(function (p) { return p.metrics.impressions; })), b = avg(long.map(function (p) { return p.metrics.impressions; }));
      out.push(a > b ? 'Short first lines (under 60 characters) get <b>' + Math.round(100 * (a / b - 1)) + '% more views</b> than longer ones.' : 'Longer first lines are doing fine for you: your audience reads past the hook.'); }
    var withLink = posts.filter(function (p) { return /https?:\/\//.test(p.text); }), noLink = posts.filter(function (p) { return !/https?:\/\//.test(p.text); });
    if (withLink.length >= 2 && noLink.length >= 3) { var l1 = avg(withLink.map(function (p) { return p.metrics.impressions; })), l2 = avg(noLink.map(function (p) { return p.metrics.impressions; }));
      if (l1 < l2) out.push('Posts with a link in the text got <b>' + Math.round(100 * (1 - l1 / l2)) + '% fewer views</b>. Keep links in the first comment.'); }
    var q = posts.filter(function (p) { return /\?\s*$/.test(p.text.trim()); }), nq = posts.filter(function (p) { return !/\?\s*$/.test(p.text.trim()); });
    if (q.length >= 3 && nq.length >= 3) { var c1 = avg(q.map(function (p) { return p.metrics.comments || 0; })), c2 = avg(nq.map(function (p) { return p.metrics.comments || 0; }));
      if (c2 > 0 || c1 > 0) out.push(c1 >= c2 ? 'Ending with a question brings <b>' + (c2 ? (c1 / c2).toFixed(1) + '×' : 'more') + ' comments</b>.' : 'Your posts without a closing question get more comments. Your audience comments anyway.'); }
    var wd = groupAvg(posts, function (p) { return new Date(p.posted_at).getDay(); }, function (k) { return DOW[k]; }).filter(function (r) { return r[2] >= 2; });
    if (wd.length >= 3) out.push('<b>' + wd[0][0] + '</b> is your strongest day so far.');
    return out.length ? out : ['Keep logging results: no clear pattern yet, which usually means consistency matters more than tactics right now.'];
  }

  UI.page('insights', { title: 'Insights', nav: 'Insights', icon: 'chart', auth: 'user', order: 50 }, function (view, ctx) {
    var ws = null;
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:460px"></div></div>';
    function importBox() {
      return '<label class="in-drop" data-drop><input type="file" accept=".xlsx,.xls,.csv" data-file>' + UI.icon('upload') + ' <b>Drop your LinkedIn analytics export</b><br><span class="small muted">XLSX or CSV. It\'s read in your browser; only the numbers are saved.</span></label>';
    }
    function draw() {
      var an = ws.analytics, posted = ws.posts.filter(function (p) { return p.status === 'posted'; });
      var withM = posted.filter(function (p) { return p.metrics && p.metrics.impressions; });
      var has = an || withM.length;
      var head = '<div class="ui-page-head"><div><div class="eyebrow">What\'s working</div><h1>Insights</h1><p class="muted">From your own numbers: no scraping, no browser extension.</p></div><div class="ui-row">' +
        (ws.has_examples ? '<button class="ui-btn" data-rmex>' + UI.icon('trash') + 'Remove examples</button>' : '') + '<button class="ui-btn" data-imp>' + UI.icon('upload') + 'Import export</button></div></div>';
      if (!has) {
        view.innerHTML = '<div class="ui-wrap">' + head + '<div class="in-grid"><div class="ui-card in-card"><h3>Bring your numbers</h3><p class="sub">LinkedIn lets you download your own analytics. Hookline reads that file.</p>' +
          '<ol class="in-steps"><li>On LinkedIn, open your profile → <b>Analytics</b> (Post impressions).</li><li>Choose the date range (up to 365 days) and press <b>Export</b>.</li><li>Drop the .xlsx file here.</li></ol><div style="margin-top:16px">' + importBox() + '</div>' +
          '<p class="small muted" style="margin-top:14px">You can also log results per post: open a posted post → Results.</p></div>' +
          '<div class="ui-card in-card"><h3>Just looking?</h3><p class="sub">Load 24 example posts with realistic results (a fictional UX designer) to see what Insights shows. Remove them in one click.</p>' +
          '<button class="ui-btn primary" data-ex>' + UI.icon('sparkle') + 'Load example posts</button></div></div></div>';
        return;
      }
      var now = Date.now(), last30 = posted.filter(function (p) { return now - new Date(p.posted_at).getTime() < 30 * 864e5; });
      var avgImp = avg(withM.slice().sort(function (a, b) { return new Date(b.posted_at) - new Date(a.posted_at); }).slice(0, 20).map(function (p) { return p.metrics.impressions; }));
      var rates = withM.map(function (p) { return HL.rate(p.metrics); }).filter(function (r) { return r != null; });
      var fol = an && an.followers ? an.followers.slice(-30).reduce(function (s, d) { return s + d['new']; }, 0) : null;
      var target = Math.round((ws.profile.cadence || 3) * 30 / 7);
      var postDays = {}; posted.forEach(function (p) { postDays[HL.dayKey(p.posted_at)] = 1; });
      var top = withM.slice().sort(function (a, b) { return b.metrics.impressions - a.metrics.impressions; }).slice(0, 8);
      view.innerHTML = '<div class="ui-wrap">' + head +
        (an && an.example || ws.has_examples ? '<div class="hl-due">' + UI.icon('info') + '<span>You\'re looking at <b>example data</b> (a fictional UX designer). Remove it when you\'re ready for your own.</span></div>' : '') +
        '<div class="in-kpis"><div class="ui-card in-kpi"><b class="num">' + last30.length + '<span style="font-size:1rem;color:var(--c-faint)"> / ' + target + '</span></b><span>posts in 30 days</span><small>Your target: ' + ws.profile.cadence + ' a week</small></div>' +
        '<div class="ui-card in-kpi"><b class="num">' + HL.fmtNum(avgImp) + '</b><span>views per post</span><small>Last ' + Math.min(20, withM.length) + ' posts with results</small></div>' +
        '<div class="ui-card in-kpi"><b class="num">' + (rates.length ? avg(rates).toFixed(1) + '%' : '–') + '</b><span>engagement rate</span><small>Reactions, comments, reposts ÷ views</small></div>' +
        '<div class="ui-card in-kpi"><b class="num">' + (fol != null ? '+' + fol : an && an.followers_total ? HL.fmtNum(an.followers_total) : '–') + '</b><span>' + (fol != null ? 'new followers, 30 days' : 'followers') + '</span><small>' + (an && an.followers_total ? HL.fmtNum(an.followers_total) + ' total' : 'From your export') + '</small></div></div>' +
        '<div class="in-grid"><div class="ui-card in-card wide"><h3>Impressions over time</h3><p class="sub">' + (an ? 'From your LinkedIn export, imported ' + esc(UI.ago(an.imported)) : 'Import your export to see daily numbers') + '</p>' + lineChart(an ? an.daily.slice(-90) : [], postDays, (view.querySelector('.ui-wrap') || view).clientWidth - 76) + '</div>' +
        '<div class="ui-card in-card"><h3>What\'s working for you</h3><p class="sub">Patterns in your ' + UI.plural(withM.length, 'post') + ' with results</p><ul class="in-find">' + findings(ws, withM).map(function (f) { return '<li>' + UI.icon('zap') + '<span>' + f + '</span></li>'; }).join('') + '</ul></div>' +
        '<div class="ui-card in-card"><h3>Views by format</h3><p class="sub">Average per post · number of posts</p>' + bars(groupAvg(withM, function (p) { return p.format; }, function (k) { return esc(HL.FORMATS[k][0]); }), 'views') + '</div>' +
        '<div class="ui-card in-card"><h3>Views by pillar</h3><p class="sub">Average per post · number of posts</p>' + bars(groupAvg(withM, function (p) { return p.pillar; }, function (k) { var x = HL.pillar(ws, k); return esc(x ? x.name : k); }), 'views') + '</div>' +
        '<div class="ui-card in-card"><h3>Views by weekday</h3><p class="sub">Average per post · number of posts</p>' + bars(groupAvg(withM, function (p) { return new Date(p.posted_at).getDay(); }, function (k) { return DOW[k]; }), 'views') + '</div>' +
        '<div class="ui-card in-card wide"><h3>Top posts</h3><p class="sub">Read the first lines: they\'re your best hooks so far</p><table class="in-top"><thead><tr><th>First line</th><th class="hide-s">Posted</th><th class="n">Views</th><th class="n">Rate</th></tr></thead><tbody>' +
          top.map(function (p) { return '<tr><td><a href="#studio/' + esc(p.id) + '" data-go="studio/' + esc(p.id) + '">' + esc(HL.hook(p.text).slice(0, 110)) + '</a></td><td class="hide-s">' + esc(UI.fmtDate(p.posted_at)) + '</td><td class="n">' + HL.fmtNum(p.metrics.impressions) + '</td><td class="n">' + (HL.rate(p.metrics) != null ? HL.rate(p.metrics).toFixed(1) + '%' : '–') + '</td></tr>'; }).join('') +
          '</tbody></table></div>' +
        (an && an.demographics && an.demographics.length ? '<div class="ui-card in-card wide"><h3>Who sees your posts</h3><p class="sub">From your export</p>' + bars(an.demographics.slice(0, 8).map(function (d) { return [esc(d.value), d.pct, esc(d.category)]; }), '%').replace(/<small>· ([^<]*)<\/small>/g, '<small>%</small>') + '</div>' : '') +
        '<div class="ui-card in-card wide"><h3>Update your numbers</h3><p class="sub">Export again whenever you like; Hookline matches posts by their link.</p>' + importBox() + '</div></div></div>';
      wireLine();
    }
    function wireLine() {
      var box = view.querySelector('[data-line]'); if (!box || !ws.analytics) return;
      var daily = ws.analytics.daily.slice(-90), svg = box.querySelector('svg'), tip = box.querySelector('[data-tip]'), cross = box.querySelector('[data-cross]'), dot = box.querySelector('[data-dot]');
      var max = Math.max.apply(null, daily.map(function (d) { return d.impressions; }).concat([10])), step = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / step) * step;
      var W = +box.getAttribute('data-w'), H = +box.getAttribute('data-h');
      function at(ev) {
        var r = svg.getBoundingClientRect(), fx = (ev.clientX - r.left) / r.width * W, i = Math.round((fx - 44) / (W - 52) * (daily.length - 1));
        i = Math.max(0, Math.min(daily.length - 1, i));
        var x = 44 + (W - 52) * (daily.length < 2 ? 0.5 : i / (daily.length - 1)), y = 10 + (H - 36) * (1 - daily[i].impressions / top);
        cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
        dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('visibility', 'visible');
        tip.hidden = false; tip.style.left = (x / W * r.width) + 'px'; tip.style.top = (y / H * r.height) + 'px';
        tip.innerHTML = '<b>' + esc(UI.fmtDate(daily[i].date)) + '</b><br>' + daily[i].impressions.toLocaleString() + ' impressions · ' + daily[i].engagements.toLocaleString() + ' engagements';
      }
      svg.addEventListener('mousemove', at);
      svg.addEventListener('mouseleave', function () { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); });
    }
    function importFile(file) {
      if (!file) return;
      UI.toast('Reading ' + file.name + '…');
      readFile(file).then(function (sum) {
        if (!sum.daily.length && !sum.top.length) { UI.toast('That file had no dates with impressions, or post links. Use LinkedIn\'s Analytics → Export.', 'error'); return; }
        return UI.api('import_analytics', sum).then(function (r) {
          UI.toast('Imported ' + UI.plural(sum.daily.length, 'day') + ' and ' + UI.plural(sum.top.length, 'post') + (r.matched ? ' (' + r.matched + ' matched your posts)' : ''), 'ok');
          return reload();
        });
      }, function () { UI.toast('Couldn\'t read that file. Is it the .xlsx from LinkedIn?', 'error'); });
    }
    function reload() { return HL.load().then(function (w) { ws = w; draw(); }); }
    view.addEventListener('change', function (e) { if (e.target.matches('[data-file]')) importFile(e.target.files[0]); });
    view.addEventListener('dragover', function (e) { var d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.add('over'); } });
    view.addEventListener('dragleave', function (e) { var d = e.target.closest('[data-drop]'); if (d) d.classList.remove('over'); });
    view.addEventListener('drop', function (e) { var d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.remove('over'); importFile(e.dataTransfer.files[0]); } });
    view.addEventListener('click', function (e) {
      if (e.target.closest('[data-imp]')) { var f = view.querySelector('[data-file]'); if (f) f.click(); return; }
      var ex = e.target.closest('[data-ex]'); if (ex) { UI.busy(ex, UI.api('add_examples')).then(function () { UI.toast('Example posts loaded', 'ok'); return reload(); }); return; }
      if (e.target.closest('[data-rmex]')) UI.confirm({ title: 'Remove the example posts?', text: 'Your own posts, ideas and imports stay.', ok: 'Remove', danger: true }).then(function (y) {
        if (y) UI.api('remove_examples').then(function () { UI.toast('Examples removed'); return reload(); });
      });
    });
    HL.parseWorkbook = parseWorkbook;   // for the tests
    return reload();
  });
})();

/* ===== lab.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['hooks', 'Hooks', 'hook'], ['repurpose', 'Repurpose', 'recycle'], ['comments', 'Comments', 'comment'], ['clean', 'Clean-up', 'broom']];
  UI.page('lab', { title: 'Lab', nav: 'Lab', icon: 'wand', auth: 'user', order: 60 }, function (view, ctx) {
    var tab = TABS.some(function (t) { return t[0] === ctx.args[0]; }) ? ctx.args[0] : 'hooks', ws = null;
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:380px"></div></div>';
    function frame() {
      return '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Writing tools</div><h1>Lab</h1></div><span class="ui-badge ' + (HL.ai.has() ? 'gold' : '') + '">' + UI.icon('sparkle') + (HL.ai.has() ? 'AI on · ' + esc(HL.ai.modelName()) : 'AI off · built-in coach') + '</span></div>' +
        '<nav class="ui-tabs">' + TABS.map(function (t) { return '<a href="#lab/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>'; }).join('') + '</nav><div data-body></div></div>';
    }
    function hookItem(line, tag) {
      var s = HL.hookScore(line), f = HL.foldCut(line, 'mobile');
      return '<div class="lb-item"><p>' + esc(line) + '</p><div class="meta"><span class="lb-sc">' + s.score + '</span><span>' + esc(tag) + '</span><span>' + line.length + ' characters</span><span class="ui-spacer"></span>' +
        '<button class="ui-btn sm ghost" data-copy="' + esc(line) + '">' + UI.icon('copy') + 'Copy</button><button class="ui-btn sm" data-start="' + esc(line) + '">' + UI.icon('pen') + 'Start a post</button></div>' +
        '<div class="lb-fold">' + (f.cut ? 'On a phone: <b>' + esc(f.shown) + '…</b>' : 'Fits before "see more" on a phone.') + (s.why.length ? ' · ' + esc(s.why[0]) : '') + '</div></div>';
    }
    function hooks(body) {
      var topic = UI.store.get('hookTopic', '');
      body.innerHTML = '<div class="lb-two"><div><form class="ui-stack" data-hf><label class="ui-field"><span>What\'s the post about?</span><input type="text" name="t" value="' + esc(topic) + '" placeholder="e.g. firing a client, pricing my first course"></label>' +
        '<label class="ui-field"><span>Or test your own first line</span><input type="text" name="own" placeholder="Paste a hook to score it"></label><div class="ui-row"><button class="ui-btn primary" type="submit">' + UI.icon('hook') + 'Get hooks</button>' +
        '<button class="ui-btn" type="button" data-aihooks>' + UI.icon('sparkle') + 'AI hooks</button></div></form>' +
        '<div class="ui-card" style="margin-top:18px"><h3 style="font-size:.95rem">What makes a hook work</h3><p class="small muted" style="margin:0">It\'s short enough to finish before "see more" (about 140 characters on a phone), specific (a number, a moment, a name), and it opens a loop: a tension, a surprise, or a promise the post keeps. Score is a rule-of-thumb, not a prediction.</p></div></div>' +
        '<div class="lb-out" data-out></div></div>';
      fill();
    }
    function fill() {
      var f = view.querySelector('[data-hf]'); if (!f) return;
      var t = f.t.value.trim(), own = f.own.value.trim(), out = view.querySelector('[data-out]');
      UI.store.set('hookTopic', t);
      var list = HL.FORMULAS.map(function (x) { return [t ? x[1].replace(/\[(topic|thing)\]/, t) : x[1], x[0]]; })
        .sort(function (a, b) { return HL.hookScore(b[0].replace(/\[[^\]]+\]/g, 'xxxx')).score - HL.hookScore(a[0].replace(/\[[^\]]+\]/g, 'xxxx')).score; });
      out.innerHTML = (own ? hookItem(own, 'yours') : '') + list.slice(0, 12).map(function (x) { return hookItem(x[0], x[1] + ' formula'); }).join('');
    }
    function repurpose(body) {
      body.innerHTML = '<div class="lb-two"><form class="ui-stack" data-rf><label class="ui-field"><span>Paste a blog post, newsletter, talk transcript or notes</span><textarea name="src" rows="14" placeholder="The longer the better: Hookline finds the post-sized ideas inside.">' + esc(UI.store.get('repSrc', '')) + '</textarea></label>' +
        '<button class="ui-btn primary" type="submit">' + UI.icon('recycle') + 'Find post angles</button></form><div class="lb-out" data-out></div></div>';
    }
    function keySentences(src) {
      return HL.sentences(src).map(function (s) {
        var sc = 0; if (/\d/.test(s)) sc += 3; if (/\b(I|we|my)\b/.test(s)) sc += 1; if (/\b(but|instead|never|always|mistake|wrong|learned|surpris)/i.test(s)) sc += 3; if (s.length > 40 && s.length < 180) sc += 2; if (/\?$/.test(s)) sc += 1;
        return [s, sc];
      }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6).map(function (x) { return x[0]; });
    }
    function comments(body) {
      body.innerHTML = '<div class="lb-two"><form class="ui-stack" data-cf><label class="ui-field"><span>Paste the post you want to comment on</span><textarea name="post" rows="10" placeholder="Their post text"></textarea></label>' +
        '<button class="ui-btn primary" type="submit">' + UI.icon('comment') + 'Help me comment</button><p class="small muted">Hookline only drafts: you read, edit and post the comment yourself. Automated comments break LinkedIn\'s rules and are shown to fewer people.</p></form>' +
        '<div class="lb-out" data-out>' + HL.COMMENT_FRAMES.map(function (c) { return '<div class="lb-item"><div class="meta"><b>' + esc(c[0]) + '</b></div><p style="margin-top:6px">' + esc(c[1]) + '</p><div class="meta"><span class="ui-spacer"></span><button class="ui-btn sm ghost" data-copy="' + esc(c[1]) + '">' + UI.icon('copy') + 'Copy</button></div></div>'; }).join('') + '</div></div>';
    }
    function clean(body) {
      body.innerHTML = '<div class="lb-two"><label class="ui-field"><span>Paste text with 𝗳𝗮𝗻𝗰𝘆 𝘭𝘦𝘵𝘵𝘦𝘳𝘴 or messy spacing</span><textarea data-ct rows="12" placeholder="𝗧𝗵𝗶𝘀 𝗹𝗼𝗼𝗸𝘀 𝗯𝗼𝗹𝗱, but screen readers read it letter by letter."></textarea></label>' +
        '<div><label class="ui-field"><span>Clean version</span><textarea data-co rows="12" readonly></textarea></label><div class="ui-row" style="margin-top:10px"><button class="ui-btn primary" data-copyclean>' + UI.icon('copy') + 'Copy</button><span class="small muted" data-cs></span></div>' +
        '<p class="small muted" style="margin-top:12px">LinkedIn has no real bold. The "bold" generators swap letters for maths symbols, which screen readers announce one by one and LinkedIn search can\'t match. Use a short first line and white space for emphasis instead.</p></div></div>';
    }
    function draw() { view.innerHTML = frame(); var b = view.querySelector('[data-body]'); ({ hooks: hooks, repurpose: repurpose, comments: comments, clean: clean })[tab](b); }
    view.addEventListener('input', function (e) {
      if (e.target.closest('[data-hf]')) fill();
      if (e.target.matches('[data-ct]')) { var c = HL.plain(e.target.value); view.querySelector('[data-co]').value = c; var n = 0; for (var ch of e.target.value) if (/[\u{1D400}-\u{1D7FF}]/u.test(ch)) n++; view.querySelector('[data-cs]').textContent = n ? n + ' fancy letters fixed' : ''; }
    });
    view.addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target, out = view.querySelector('[data-out]'), btn = f.querySelector('[type=submit]');
      if (f.matches('[data-hf]')) { fill(); return; }
      if (f.matches('[data-rf]')) {
        var src = f.src.value.trim(); UI.store.set('repSrc', src.slice(0, 20000));
        if (src.length < 200) { UI.toast('Paste a longer piece (at least a few paragraphs).', 'error'); return; }
        if (!HL.ai.has()) {
          out.innerHTML = HL.ai.nudge('turn this into 4 post angles') + '<p class="small muted" style="margin:12px 0 4px">Meanwhile, the strongest sentences in it (numbers, tension, lessons): each could open a post.</p>' +
            keySentences(src).map(function (s) { return hookItem(s, 'from your text'); }).join('');
          return;
        }
        out.innerHTML = '<div class="ui-skel" style="height:240px"></div>';
        UI.busy(btn, HL.ai.repurpose(ws, ctx.me, src)).then(function (angles) {
          out.innerHTML = angles.map(function (a) {
            return '<div class="lb-item"><div class="meta"><b>' + esc(a.title) + '</b></div><p style="margin-top:8px;font-weight:600">' + esc(a.hook) + '</p><p class="small muted">' + esc(a.outline) + '</p>' +
              '<div class="meta"><span class="ui-spacer"></span><button class="ui-btn sm" data-start="' + esc(a.hook + '\n\n' + a.outline) + '">' + UI.icon('pen') + 'Draft it</button></div></div>';
          }).join('');
        }, function (err) { out.innerHTML = '<div class="ui-error">' + esc(err.message) + '</div>'; });
      }
      if (f.matches('[data-cf]')) {
        var post = f.post.value.trim(); if (post.length < 40) { UI.toast('Paste their post first.', 'error'); return; }
        if (!HL.ai.has()) { out.innerHTML = HL.ai.nudge('draft three comments for this post') + out.innerHTML; return; }
        out.innerHTML = '<div class="ui-skel" style="height:200px"></div>';
        UI.busy(btn, HL.ai.comments(ws, ctx.me, post)).then(function (cs) {
          out.innerHTML = cs.map(function (c) { return '<div class="lb-item"><div class="meta"><b>' + esc(c.kind) + '</b><span>' + c.text.length + ' characters</span></div><p style="margin-top:6px">' + esc(c.text) + '</p><div class="meta"><span class="ui-spacer"></span><button class="ui-btn sm ghost" data-copy="' + esc(c.text) + '">' + UI.icon('copy') + 'Copy</button></div></div>'; }).join('') +
            '<p class="small muted">Fill in any [brackets] with your own detail before posting.</p>';
        }, function (err) { out.innerHTML = '<div class="ui-error">' + esc(err.message) + '</div>'; });
      }
    });
    view.addEventListener('click', function (e) {
      var c = e.target.closest('[data-copy]'); if (c) { HL.copy(c.getAttribute('data-copy')); return; }
      var s = e.target.closest('[data-start]'); if (s) { UI.store.set('seed', { text: s.getAttribute('data-start') + '\n\n' }); UI.go('studio', 'new'); return; }
      if (e.target.closest('[data-copyclean]')) { HL.copy(view.querySelector('[data-co]').value, 'Clean text copied'); return; }
      var ah = e.target.closest('[data-aihooks]');
      if (ah) {
        var out = view.querySelector('[data-out]'), t = view.querySelector('[data-hf]').t.value.trim();
        if (!HL.ai.has()) { out.innerHTML = HL.ai.nudge('write hooks with AI') + out.innerHTML; return; }
        if (!t) { UI.toast('Say what the post is about first.', 'error'); return; }
        UI.busy(ah, HL.ai.hooks(ws, ctx.me, 'A post about: ' + t)).then(function (hs) { out.innerHTML = hs.map(function (h) { return hookItem(h.text, h.angle); }).join('') + out.innerHTML; }, function (err) { UI.toast(err.message, 'error'); });
      }
    });
    return HL.load().then(function (w) { ws = w; draw(); });
  });
})();

/* ===== landing.html ===== */
(function () {
  var COPY = {
    eyebrow: 'Free LinkedIn writing studio',
    title: 'Write posts people <em>finish reading</em>.',
    lead: 'Hookline helps you write LinkedIn posts in your own voice: a hook that survives the “see more” fold, checks that catch what readers skip, a calm calendar and honest analytics. Free. No extension. Nothing posts without you.',
    cta: 'Start writing, free',
    proof: ['No paid plan', 'No browser extension', 'You press Post. Always.'],
    stepsTitle: 'How it works',
    stepsLead: 'From a stray thought to a post you\'re proud of.',
    steps: [['Catch the idea', 'Answer one guided question about your week, or jot a line in the idea bank. Your experience is the one thing nobody can copy.'],
            ['Write it well', 'The hook lab, a live preview cut where LinkedIn cuts it, and a post check for readability, links, hashtags and AI-sounding phrases.'],
            ['Post and learn', 'Post with one official click (or copy and open LinkedIn), then import LinkedIn\'s own analytics export to see what works for you.']],
    featuresTitle: 'Everything you need, nothing that risks your account',
    features: [['hook', 'Hook lab', '20 proven hook shapes, scored, and previewed at the phone fold, so your first line lands.'],
               ['check', 'Post check', 'Reading level, long paragraphs, links in the body, hashtag walls, engagement bait, AI clichés and fake-bold Unicode, with one-click fixes.'],
               ['feather', 'Your voice', 'Paste your best posts: Hookline measures your style, and with AI it writes a voice card so drafts sound like you.'],
               ['calendar', 'Calm calendar', 'Drag drafts onto days, see your weekly rhythm and pillar mix. Reminders when it\'s time: it never posts by itself.'],
               ['chart', 'Honest insights', 'Import LinkedIn\'s own analytics file: views over time, best formats, pillars and days, top hooks. No scraping.'],
               ['slides', 'Carousel maker', 'Turn a post into a PDF carousel in four themes, ready to upload as a document post.'],
               ['bulb', 'Idea bank', 'Guided questions by kind (stories, lessons, opinions, how-tos, numbers) turn your week into ideas.'],
               ['comment', 'Comment helper', 'Three thoughtful drafts for someone else\'s post. You edit and post it yourself.'],
               ['sparkle', 'AI with your own key', 'Bring a Claude API key and get drafts, rewrites and hooks for cents. It stays in your browser. No key? Everything else still works.']],
    faq: [['Is it really free?', 'Yes, every feature. The AI is optional and runs on your own Anthropic key, so you pay Anthropic directly, usually well under a cent per post. That\'s how Hookline stays free for everyone.'],
          ['Will this get my LinkedIn account restricted?', 'Hookline uses only LinkedIn\'s official API, and only when you press Post now. No browser extension, no stored LinkedIn password, no scraping, no auto-comments or auto-DMs: the things LinkedIn\'s User Agreement forbids.'],
          ['Can it post on a schedule?', 'It reminds you at the time you pick, and you post with one click. LinkedIn\'s API terms don\'t allow tools to automate posting, so Hookline doesn\'t.'],
          ['Where do the analytics come from?', 'From you: LinkedIn lets you export your own analytics as a spreadsheet. Drop it into Insights, or log a post\'s numbers by hand.'],
          ['Does it write in French?', 'The AI writes in whatever language you set in your voice. The post checks (reading level, clichés) are tuned for English for now.'],
          ['Where is my key stored?', 'Only in your browser. Requests go straight from your browser to Anthropic; Hookline\'s server never sees the key or your AI prompts.']],
    bandTitle: 'Your next post starts with one line.',
    bandLead: 'Make the first line count. It takes a minute to start.'
  };

  var SAMPLE = 'I almost didn\'t post this.\n\nFor two years I wrote LinkedIn posts in my head and never pressed Publish.\n\nWhat changed wasn\'t confidence. It was a system: one idea a day, a hook I\'d stop for, and a fixed day to post.\n\nWhat\'s the post you keep not writing?';
  function heroArt() {
    return '<div class="lp-art"><div class="lp-try"><div class="lp-try-h"><b>Try the fold</b><div class="ui-seg" role="group" aria-label="Preview size"><button type="button" data-lpmode="mobile" class="on">Phone</button><button type="button" data-lpmode="desktop">Desktop</button></div></div>' +
      '<label class="ui-field"><span class="small muted" style="font-weight:500">Type or paste a post. See where “see more” cuts it.</span><textarea data-lptext rows="4">' + UI.esc(SAMPLE) + '</textarea></label>' +
      '<div data-lpprev></div><div class="lp-try-score" data-lpscore></div></div></div>';
  }
  function wireHero(view) {
    var ta = view.querySelector('[data-lptext]'), mode = 'mobile';
    if (!ta) return;
    function upd() {
      view.querySelector('[data-lpprev]').innerHTML = HL.feedCard(ta.value, { name: 'You', headline: 'Your headline', mode: mode });
      var c = HL.check(ta.value), h = HL.hookScore(HL.hook(ta.value));
      view.querySelector('[data-lpscore]').innerHTML = ta.value.trim() ? HL.scoreRing(c.score) + '<span><b style="color:var(--c-ink)">Post score ' + c.score + '</b> · hook ' + h.score + '/100. ' + UI.esc((c.items.filter(function (i) { return i.level !== 'good'; })[0] || { title: 'Nothing to fix.' }).title) + '</span>' : '';
    }
    ta.addEventListener('input', upd);
    view.addEventListener('click', function (e) {
      var m = e.target.closest('[data-lpmode]'); if (m) { mode = m.getAttribute('data-lpmode'); view.querySelectorAll('[data-lpmode]').forEach(function (b) { b.classList.toggle('on', b === m); }); upd(); }
      if (e.target.closest('.lp-try [data-expand]')) { view.querySelector('[data-lpprev]').innerHTML = HL.feedCard(ta.value, { name: 'You', headline: 'Your headline', mode: mode, expanded: true }); }
    });
    upd();
  }

  UI.page('landing', { title: 'Welcome' }, function (view, ctx) {
    var me = ctx.me, C = COPY, esc = UI.esc;
    var primary = me ? '<a class="ui-btn primary lg" href="#studio" data-go="studio">Open the studio ' + UI.icon('arrow') + '</a>'
      : '<a class="ui-btn primary lg" href="#auth/signup" data-go="auth/signup">' + esc(C.cta) + ' ' + UI.icon('arrow') + '</a>' +
        '<a class="ui-btn lg" href="#auth" data-go="auth">I have an account</a>';
    view.innerHTML =
      '<section class="lp-hero"><div class="ui-wrap"><div>' +
        '<div class="eyebrow">' + esc(C.eyebrow) + '</div><h1>' + C.title + '</h1><p class="lp-lead">' + esc(C.lead) + '</p>' +
        '<div class="lp-cta">' + primary + '</div>' +
        '<div class="lp-proof">' + C.proof.map(function (p) { return '<span>' + UI.icon('check') + esc(p) + '</span>'; }).join('') + '</div>' +
      '</div>' + heroArt() + '</div></section>' +
      '<section class="lp-section" id="how"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.stepsTitle) + '</h2><p>' + esc(C.stepsLead) + '</p></div>' +
        '<div class="lp-steps">' + C.steps.map(function (s) { return '<div class="ui-card lp-step"><h3>' + esc(s[0]) + '</h3><p class="muted">' + esc(s[1]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.featuresTitle) + '</h2></div>' +
        '<div class="ui-grid">' + C.features.map(function (f) { return '<div class="ui-card lp-feature">' + UI.icon(f[0]) + '<h3>' + esc(f[1]) + '</h3><p>' + esc(f[2]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>What Hookline will never do</h2><p>The shortcuts that get LinkedIn accounts restricted, or make your writing sound like everyone else\'s.</p></div><div class="lp-not">' +
        [['Scrape LinkedIn', 'no extension reading your feed'], ['Post on a timer', 'you press the button, every time'], ['Comment or DM for you', 'automated comments are shown less'],
         ['Hand you viral templates', 'your stories, not someone else\'s'], ['Store your LinkedIn password', 'official sign-in only'], ['Sell your data or show ads', 'no ads, no trackers']].map(function (x) {
          return '<div>' + UI.icon('x') + '<span>' + esc(x[0]) + '<small>' + esc(x[1]) + '</small></span></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Questions</h2></div><div class="lp-faq">' +
        C.faq.map(function (q) { return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-band"><div><h2>' + esc(C.bandTitle) + '</h2><p>' + esc(C.bandLead) + '</p></div>' +
        (me ? '<a class="ui-btn lg" href="#studio" data-go="studio">Open the studio</a>' : '<a class="ui-btn lg" href="#auth/signup" data-go="auth/signup">' + esc(C.cta) + '</a>') +
      '</div></div></section>';
    wireHero(view);
  });
})();

/* ===== posts.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('posts', { title: 'Posts', nav: 'Posts', icon: 'list', auth: 'user', order: 20 }, function (view, ctx) {
    var ws = null, pillar = '', q = '';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:400px"></div></div>';
    function card(p) {
      var m = p.metrics || {}, when = HL.when(p);
      return '<a class="ps-card' + (p.example ? ' example' : '') + '" href="#studio/' + esc(p.id) + '" data-go="studio/' + esc(p.id) + '">' +
        '<div class="meta">' + HL.pillarChip(ws, p.pillar) + '<span>' + UI.icon(HL.FORMATS[p.format][1]) + '</span>' + (p.example ? '<span class="ui-badge">Example</span>' : '') +
        (when ? '<span>' + esc(p.status === 'posted' ? UI.fmtDate(when) : UI.fmtDateTime(when)) + '</span>' : '<span>edited ' + esc(UI.ago(p.updated)) + '</span>') + '</div>' +
        '<div class="h">' + esc(HL.hook(p.text) || '(empty)') + '</div>' +
        (p.status === 'posted' ? (m.impressions ? '<div class="nums"><span><b class="num">' + HL.fmtNum(m.impressions) + '</b> views</span><span><b class="num">' + HL.fmtNum(HL.engagements(m)) + '</b> engaged</span>' +
          (HL.rate(m) != null ? '<span><b class="num">' + HL.rate(m).toFixed(1) + '%</b></span>' : '') + '</div>' : '<div class="nums"><span>No results logged yet</span></div>')
          : '<div class="meta">' + p.text.length + ' characters · score ' + HL.check(p.text, p.first_comment).score + '</div>') + '</a>';
    }
    function draw() {
      var list = ws.posts.filter(function (p) { return (!pillar || p.pillar === pillar) && (!q || p.text.toLowerCase().indexOf(q) >= 0); });
      var cols = [['draft', 'Drafts', list.filter(function (p) { return p.status === 'draft'; })],
                  ['scheduled', 'Scheduled', list.filter(function (p) { return p.status === 'scheduled'; }).sort(function (a, b) { return new Date(a.scheduled_at) - new Date(b.scheduled_at); })],
                  ['posted', 'Posted', list.filter(function (p) { return p.status === 'posted'; }).sort(function (a, b) { return new Date(b.posted_at) - new Date(a.posted_at); })]];
      var due = HL.due(ws);
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Your posts</div><h1>Posts</h1><p class="muted">' + UI.plural(ws.posts.length, 'post') + ' · ' + UI.plural(ws.ideas.filter(function (i) { return !i.used; }).length, 'idea') + ' waiting in <a href="#ideas" data-go="ideas">Ideas</a></p></div>' +
        '<a class="ui-btn primary" href="#studio/new" data-go="studio/new">' + UI.icon('plus') + 'New post</a></div>' +
        (due.length ? '<div class="hl-due">' + UI.icon('bell') + '<span><b>Due now:</b> “' + esc(HL.hook(due[0].text).slice(0, 80)) + '”</span><span class="ui-spacer"></span><a class="ui-btn sm gold" href="#studio/' + esc(due[0].id) + '" data-go="studio/' + esc(due[0].id) + '">' + UI.icon('send') + 'Post it</a></div>' : '') +
        '<div class="ps-tools"><input type="search" data-q placeholder="Search your posts" value="' + esc(q) + '" aria-label="Search posts"><div class="ui-seg" role="group" aria-label="Pillar"><button data-p="" class="' + (pillar ? '' : 'on') + '">All</button>' +
        (ws.profile.pillars || []).map(function (x) { return '<button data-p="' + esc(x.id) + '" class="' + (pillar === x.id ? 'on' : '') + '"><span class="ps-dot" style="background:' + esc(x.color) + '"></span>' + esc(x.name) + '</button>'; }).join('') + '</div></div>' +
        '<div class="ps-cols">' + cols.map(function (c) {
          return '<section class="ps-col"><h2>' + c[1] + ' <span>' + c[2].length + '</span></h2><div class="ps-list">' +
            (c[2].length ? c[2].slice(0, c[0] === 'posted' ? 40 : 100).map(card).join('') : '<div class="ui-empty" style="padding:28px 16px">' +
              (c[0] === 'draft' ? '<p>No drafts. <a href="#ideas" data-go="ideas">Pick an idea</a> or start fresh.</p>' : c[0] === 'scheduled' ? '<p>Nothing scheduled. A rhythm of ' + ws.profile.cadence + ' a week is your target.</p>' : '<p>Posts you publish land here with their results.</p>') + '</div>') +
            '</div></section>';
        }).join('') + '</div></div>';
    }
    view.addEventListener('input', function (e) { if (e.target.matches('[data-q]')) { q = e.target.value.toLowerCase(); var pos = e.target.selectionStart; draw(); var s = view.querySelector('[data-q]'); s.focus(); s.setSelectionRange(pos, pos); } });
    view.addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (b) { pillar = b.getAttribute('data-p'); draw(); } });
    return HL.load().then(function (w) { ws = w; draw(); });
  });
})();

/* ===== profile.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('profile', { title: 'Your profile', auth: 'user' }, function (view, ctx) {
    var me = ctx.me;
    view.innerHTML = '<div class="ui-wrap ui-narrow"><div class="pf-head"><span class="ui-avatar">' + esc(UI.initials(me.name)) + '</span>' +
      '<div><h1>' + esc(me.name) + '</h1><div class="muted">' + esc(me.email) + (me.joined ? ' · member since ' + esc(UI.fmtDate(me.joined, { month: 'long', year: 'numeric' })) : '') + '</div></div></div>' +
      '<div class="pf-grid"><form class="ui-card ui-stack" data-name><h3>Your name</h3><label class="ui-field"><span>Shown to other people</span>' +
      '<input type="text" name="name" value="' + esc(me.name) + '" maxlength="60" required></label><button class="ui-btn primary" type="submit">Save</button></form>' +
      '<div class="ui-card ui-stack"><h3>Appearance</h3><p class="muted small">Follow your device, or pick one.</p><div data-theme-box></div>' +
      '<h3 style="margin-top:22px">Password</h3><p class="muted small">We\'ll email you a link to choose a new one.</p>' +
      '<button class="ui-btn" data-reset>' + UI.icon('mail') + 'Email me a reset link</button></div></div>' +
      '<div class="ui-card" style="margin-top:16px"><div class="pf-links">' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<button data-feedback>' + UI.icon('chat') + 'Send feedback</button>' +
      '<button data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms, and your data</button>' +
      '<button data-signout-here>' + UI.icon('logout') + 'Sign out</button></div></div></div>';
    function themeBox() {
      var t = UI.theme();
      view.querySelector('[data-theme-box]').innerHTML = '<div class="ui-seg">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
        return '<button type="button" data-theme-pick="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }
    themeBox();
    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-theme-pick]');
      if (t) { UI.setTheme(t.getAttribute('data-theme-pick')); themeBox(); UI.renderChrome(); return; }
      if (e.target.closest('[data-reset]')) {
        UI.busy(e.target.closest('[data-reset]'), UI.auth('reset', { email: me.email })).then(function (r) { UI.toast(r.message, 'ok'); });
      }
      if (e.target.closest('[data-signout-here]')) UI.auth('logout');
    });
    view.querySelector('[data-name]').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(e.target);
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('update_profile', v.name)).then(function (r) {
        UI.setMe(r.me); ctx.me = r.me; UI.toast('Saved', 'ok');
        view.querySelector('.pf-head h1').textContent = r.me.name;
      });
    });
  });
})();

/* ===== studio.html ===== */
(function () {
  var esc = UI.esc;

  UI.page('studio', { title: 'Write', nav: 'Write', icon: 'pen', auth: 'user', order: 10 }, function (view, ctx) {
    var ws = null, post = null, saveTimer = null, saving = null, dirty = false, mode = 'desktop', expanded = false;
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:460px"></div></div>';

    function blank() { return { id: null, text: '', first_comment: '', pillar: '', format: 'text', status: 'draft', scheduled_at: null, notes: '', metrics: {} }; }
    function ta() { return view.querySelector('.st-text'); }
    function headline() { var v = ws.profile.voice || {}; return (v.about || 'Your headline').split(/[.\n]/)[0].slice(0, 70); }

    function draw() {
      var p = ws.profile, due = HL.due(ws).filter(function (d) { return d.id !== post.id; });
      var li = ws.linkedin || {};
      view.innerHTML = '<div class="ui-wrap">' +
        (due.length ? '<div class="hl-due">' + UI.icon('bell') + '<span><b>' + UI.plural(due.length, 'post') + ' due now:</b> “' + esc(HL.hook(due[0].text).slice(0, 70)) + '”</span><span class="ui-spacer"></span><a class="ui-btn sm" href="#studio/' + esc(due[0].id) + '" data-go="studio/' + esc(due[0].id) + '">Open it</a></div>' : '') +
        '<div class="ui-page-head"><div><div class="eyebrow">' + (post.id ? esc(HL.STATUS[post.status]) : 'New post') + '</div><h1>' + (post.id ? 'Edit your post' : 'Write a post') + '</h1></div>' +
        '<div class="ui-row"><button class="ui-btn" data-new>' + UI.icon('plus') + 'New</button></div></div>' +
        '<div class="st-grid"><section class="ui-card st-main">' +
          '<div class="st-top"><select data-f="pillar" aria-label="Content pillar"><option value="">No pillar</option>' + (p.pillars || []).map(function (x) { return '<option value="' + esc(x.id) + '"' + (post.pillar === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>' +
          '<select data-f="format" aria-label="Format">' + Object.keys(HL.FORMATS).map(function (k) { return '<option value="' + k + '"' + (post.format === k ? ' selected' : '') + '>' + HL.FORMATS[k][0] + '</option>'; }).join('') + '</select>' +
          (post.status === 'scheduled' ? '<span class="st-when">' + UI.icon('clock') + esc(UI.fmtDateTime(post.scheduled_at)) + '</span>' : post.status === 'posted' ? '<span class="ui-badge good">' + UI.icon('check') + 'Posted ' + esc(UI.fmtDate(post.posted_at)) + '</span>' : '') +
          '<span class="st-save" aria-live="polite">' + (post.id ? 'Saved' : 'Not saved yet') + '</span></div>' +
          '<div class="st-tools"><button class="ui-btn" data-hooklab>' + UI.icon('hook') + 'Hook lab</button><button class="ui-btn" data-struct>' + UI.icon('layers') + 'Structures</button>' +
          '<button class="ui-btn" data-ai>' + UI.icon('sparkle') + (HL.ai.has() ? 'AI' : 'AI (add key)') + '</button><button class="ui-btn" data-carousel>' + UI.icon('slides') + 'Carousel</button></div>' +
          '<textarea class="st-text" data-f="text" aria-label="Your post" placeholder="Start with the line that would make you stop scrolling.\n\nThen tell them why it matters. Short paragraphs. One idea.\n\nEnd with a question they can answer in a line.">' + esc(post.text) + '</textarea>' +
          '<div class="st-meter"><span class="num" data-count></span><div class="st-bar" data-bar><i></i></div><span data-readtime></span></div>' +
          '<div class="st-more"><details' + (post.first_comment ? ' open' : '') + '><summary>' + UI.icon('comment') + 'First comment <span class="faint">for links: post it right after</span></summary><div><textarea data-f="first_comment" rows="2" placeholder="Link and a line of context, e.g. “The full guide is here: https://…”">' + esc(post.first_comment) + '</textarea></div></details>' +
          '<details' + (post.notes ? ' open' : '') + '><summary>' + UI.icon('edit') + 'Notes <span class="faint">only you see these</span></summary><div><textarea data-f="notes" rows="2" placeholder="Sources, who to tag, what to check">' + esc(post.notes) + '</textarea></div></details></div>' +
          '<div class="st-acts"><button class="ui-btn primary" data-save>' + UI.icon('check') + 'Save</button>' +
          '<button class="ui-btn" data-schedule>' + UI.icon('calendar') + (post.status === 'scheduled' ? 'Reschedule' : 'Schedule') + '</button>' +
          (post.status !== 'posted' ? '<button class="ui-btn gold" data-post>' + UI.icon('send') + (li.connected ? 'Post now' : 'Post on LinkedIn') + '</button>' : '<button class="ui-btn" data-metrics>' + UI.icon('chart') + 'Results</button>') +
          '<span class="ui-spacer"></span>' + (post.status !== 'posted' && post.id ? '<button class="ui-btn ghost sm" data-markposted>Mark as posted</button>' : '') +
          (post.id ? '<button class="ui-btn ghost icon" data-del aria-label="Delete post">' + UI.icon('trash') + '</button>' : '') + '</div>' +
        '</section><aside class="st-side">' +
          '<div class="ui-card"><div class="ui-row between" style="margin-bottom:12px"><h3>Preview</h3><div class="ui-seg" role="group" aria-label="Preview size">' +
          '<button type="button" data-mode="desktop" class="' + (mode === 'desktop' ? 'on' : '') + '">' + UI.icon('monitor') + ' Desktop</button><button type="button" data-mode="mobile" class="' + (mode === 'mobile' ? 'on' : '') + '">' + UI.icon('phone') + ' Phone</button></div></div>' +
          '<div data-preview></div><p class="small faint" style="margin:10px 0 0">Dashed line = where “see more” cuts it (about 210 characters on desktop, 140 on phones). Click “…see more” to see it all.</p></div>' +
          '<div class="ui-card"><div class="st-score" data-score></div><div data-checks></div></div>' +
        '</aside></div></div>';
      update();
    }

    function update() {
      var t = post.text, c = HL.check(t, post.first_comment);
      var cnt = view.querySelector('[data-count]'); if (cnt) cnt.textContent = t.length.toLocaleString() + ' / 3,000';
      var bar = view.querySelector('[data-bar]'); if (bar) { bar.classList.toggle('over', t.length > 3000); bar.querySelector('i').style.width = Math.min(100, 100 * t.length / 3000) + '%'; }
      var rt = view.querySelector('[data-readtime]'); if (rt) rt.textContent = c.words ? UI.plural(c.words, 'word') + ' · ~' + Math.max(1, Math.round(c.words / 230 * 60)) + ' s read' : '';
      var pv = view.querySelector('[data-preview]'); if (pv) pv.innerHTML = HL.feedCard(t, { name: ctx.me.name, headline: headline(), mode: mode, expanded: expanded, format: post.format });
      var sc = view.querySelector('[data-score]');
      if (sc) sc.innerHTML = t.trim() ? HL.scoreRing(c.score) + '<div><h3>' + (c.score >= 80 ? 'Ready to go' : c.score >= 55 ? 'Nearly there' : 'Needs work') + '</h3><p>' + UI.plural(c.items.filter(function (i) { return i.level !== 'good'; }).length, 'suggestion') + '. Fixes are optional: it\'s your post.</p></div>'
        : '<div><h3>Post check</h3><p>Write a few lines and Hookline checks the hook, the fold, readability, links, hashtags and AI-sounding phrases.</p></div>';
      var ch = view.querySelector('[data-checks]'); if (ch) ch.innerHTML = t.trim() ? HL.checksHtml(c) : '';
      var g = ta(); if (g) { g.style.height = 'auto'; g.style.height = Math.max(g.scrollHeight + 4, innerWidth < 720 ? 300 : 380) + 'px'; }
    }

    function setSave(s) { var el = view.querySelector('.st-save'); if (el) el.textContent = s; }
    function payload(extra) { return Object.assign({}, post, extra || {}); }
    function save(extra, loud) {
      clearTimeout(saveTimer);
      if (!post.text.trim() && !post.id) return Promise.resolve();
      var body = payload(extra);
      if (!body.status || body.status === 'idea') body.status = 'draft';
      setSave('Saving…');
      var call = (loud ? UI.api : UI.apiQuiet)('save_post', body);
      saving = call.then(function (r) {
        var isNew = !post.id, local = { text: post.text, first_comment: post.first_comment, notes: post.notes, pillar: post.pillar, format: post.format };
        dirty = Object.keys(local).some(function (k) { return (local[k] || '') !== (r.post[k] || ''); });
        post = Object.assign({}, r.post, local);
        setSave(dirty ? 'Editing…' : 'Saved');
        if (isNew) {
          history.replaceState(null, '', location.pathname + location.search + '#studio/' + post.id);
          var seed = UI.store.get('seedIdea', null); if (seed) { UI.store.set('seedIdea', null); UI.apiQuiet('set_idea_used', seed, true).catch(function () {}); }
        }
        var i = ws.posts.map(function (x) { return x.id; }).indexOf(post.id); if (i >= 0) ws.posts[i] = r.post; else ws.posts.unshift(r.post);
        return r;
      }, function (e) { setSave('Not saved'); throw e; });
      return saving;
    }
    function queueSave() { dirty = true; setSave('Editing…'); clearTimeout(saveTimer); saveTimer = setTimeout(function () { save().catch(function () {}); }, 1400); }

    function setText(t, focus) {
      post.text = t; var g = ta(); if (g) g.value = t; update(); queueSave();
      if (focus && g) g.focus();
    }
    function replaceHook(line) {
      var lines = post.text.split('\n');
      if (!post.text.trim()) setText(line + '\n\n', true);
      else { lines[0] = line; setText(lines.join('\n'), true); }
    }

    /* ---------------- hook lab */
    function hookLab() {
      var cur = HL.hook(post.text), hs = HL.hookScore(cur);
      var m = UI.modal('<h2>Hook lab</h2><p class="muted small">The first line is all most people see. Score it, then try other angles. Pick one to replace your first line.</p>' +
        '<div class="ui-card flat tight" style="display:flex;gap:14px;align-items:center;margin-bottom:14px">' + HL.scoreRing(hs.score) + '<div><b>' + esc(cur || 'No first line yet') + '</b><p class="small muted" style="margin:4px 0 0">' + esc(hs.why.join(' ') || 'Clear and simple.') + '</p></div></div>' +
        '<div class="ui-tabs" style="margin-bottom:12px"><button class="on" data-ht="formulas">Formulas</button><button data-ht="ai">' + UI.icon('sparkle') + 'AI hooks</button></div><div data-hbody></div>', { wide: true });
      var body = m.el.querySelector('[data-hbody]');
      function formulas() {
        body.innerHTML = '<label class="ui-field" style="margin-bottom:10px"><span>Your topic, in a few words</span><input type="text" data-topic placeholder="e.g. client onboarding" value="' + esc(UI.store.get('hookTopic', '')) + '"></label><div class="st-hook-list" data-hl></div>';
        function fill() {
          var tp = body.querySelector('[data-topic]').value.trim(); UI.store.set('hookTopic', tp);
          body.querySelector('[data-hl]').innerHTML = HL.FORMULAS.map(function (f) {
            var line = tp ? f[1].replace(/\[(topic|thing)\]/, tp) : f[1], s = HL.hookScore(line.replace(/\[[^\]]+\]/g, 'xxxx'));
            return '<button class="st-hook" data-line="' + esc(line) + '"><span>' + esc(line) + '</span><small><span class="sc">' + s.score + '</span> · ' + esc(f[0]) + ' · fill in the [brackets]</small></button>';
          }).join('');
        }
        body.querySelector('[data-topic]').addEventListener('input', fill); fill();
      }
      function aiHooks() {
        if (!HL.ai.has()) { body.innerHTML = HL.ai.nudge('get six fresh hooks for this post'); return; }
        if (!post.text.trim()) { body.innerHTML = '<p class="muted">Write a draft first: the AI writes hooks for what you\'ve written.</p>'; return; }
        body.innerHTML = '<div class="ui-skel" style="min-height:220px"></div>';
        HL.ai.hooks(ws, ctx.me, post.text).then(function (hooks) {
          body.innerHTML = '<div class="st-hook-list">' + hooks.map(function (h) { var s = HL.hookScore(h.text); return '<button class="st-hook" data-line="' + esc(h.text) + '"><span>' + esc(h.text) + '</span><small><span class="sc">' + s.score + '</span> · ' + esc(h.angle) + ' · ' + h.text.length + ' characters</small></button>'; }).join('') + '</div>' +
            '<p class="small faint" style="margin-top:10px">Written by ' + esc(HL.ai.modelName()) + ' with your key.</p>';
        }, function (e) { body.innerHTML = '<div class="ui-error">' + esc(e.message) + '</div>'; });
      }
      m.el.addEventListener('click', function (e) {
        var t = e.target.closest('[data-ht]');
        if (t) { m.el.querySelectorAll('[data-ht]').forEach(function (x) { x.classList.toggle('on', x === t); }); (t.getAttribute('data-ht') === 'ai' ? aiHooks : formulas)(); return; }
        var l = e.target.closest('[data-line]'); if (l) { replaceHook(l.getAttribute('data-line')); m.close(); UI.toast('First line replaced. Ctrl+Z undoes it.', 'ok'); }
      });
      formulas();
    }

    /* ---------------- structures */
    function structures() {
      var m = UI.modal('<h2>Start from a shape</h2><p class="muted small">A skeleton with prompts in [brackets]. Replace each one with your own words.</p><div class="ui-stack">' +
        Object.keys(HL.STRUCTURES).map(function (k) { var s = HL.STRUCTURES[k]; return '<button class="st-hook" data-s="' + k + '"><b>' + esc(s.name) + '</b><small>' + esc(s.parts.join(' → ')) + '</small></button>'; }).join('') + '</div>');
      m.el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-s]'); if (!b) return;
        var sk = HL.structureText(b.getAttribute('data-s'));
        setText(post.text.trim() ? post.text.replace(/\s+$/, '') + '\n\n' + sk : sk, true); m.close();
      });
    }

    /* ---------------- AI */
    function aiPanel() {
      if (!HL.ai.has()) { UI.modal('<h2>AI writing, with your own key</h2>' + HL.ai.nudge('draft posts, rewrite in your voice and write hooks') + '<p class="muted small" style="margin-top:14px">Why your own key? It keeps Hookline free for everyone, your drafts go straight from your browser to Anthropic, and you only pay for what you use (usually under a cent per post).</p>'); return; }
      var empty = !post.text.trim();
      var acts = empty ? [['draft', 'Draft from an idea', 'feather']] : [['voice', 'In my voice', 'feather'], ['shorter', 'Shorter', 'zap'], ['clearer', 'Clearer', 'eye'], ['story', 'As a story', 'comment'], ['hook', 'Stronger hook', 'hook'], ['question', 'End with a question', 'chat']];
      var m = UI.modal('<h2>' + (empty ? 'Draft a post' : 'Rewrite with AI') + '</h2><p class="muted small">' + esc(HL.ai.modelName()) + ' · your key · it never invents facts: it leaves [brackets] for you.</p>' +
        (empty ? '<label class="ui-field"><span>What\'s the idea?</span><textarea data-idea rows="3" placeholder="The time a client fired me and the one-sentence brief I use now">' + esc(UI.store.get('lastIdea', '')) + '</textarea></label>' +
          '<label class="ui-field" style="margin:10px 0"><span>Shape</span><select data-shape><option value="">Let the AI choose</option>' + Object.keys(HL.STRUCTURES).map(function (k) { return '<option value="' + k + '">' + HL.STRUCTURES[k].name + '</option>'; }).join('') + '</select></label>' : '') +
        '<div class="st-ai-acts">' + acts.map(function (a) { return '<button class="ui-btn" data-act="' + a[0] + '">' + UI.icon(a[2]) + a[1] + '</button>'; }).join('') + '</div>' +
        '<div class="hl-ai-out" data-out hidden></div><div class="ui-row end" data-use hidden style="margin-top:12px"><button class="ui-btn ghost" data-close>Keep mine</button><button class="ui-btn primary" data-accept>' + UI.icon('check') + 'Use this</button></div>', { wide: true });
      var out = m.el.querySelector('[data-out]'), use = m.el.querySelector('[data-use]'), result = '';
      m.el.addEventListener('click', function (e) {
        var a = e.target.closest('[data-act]');
        if (a) {
          var act = a.getAttribute('data-act'); out.hidden = false; out.textContent = '…'; use.hidden = true; result = '';
          var onText = function (full) { out.textContent = full; out.scrollTop = out.scrollHeight; };
          var job = act === 'draft' ? (function () { var idea = m.el.querySelector('[data-idea]').value.trim(); if (!idea) { out.textContent = 'Write the idea first.'; return null; } UI.store.set('lastIdea', idea); return HL.ai.draft(ws, ctx.me, idea, m.el.querySelector('[data-shape]').value, onText); })()
            : HL.ai.rewrite(ws, ctx.me, post.text, act, onText);
          if (!job) return;
          m.el.querySelectorAll('[data-act]').forEach(function (b) { b.disabled = true; });
          job.then(function (txt) { result = HL.plain(txt.trim()); out.textContent = result; use.hidden = false; },
                   function (err) { out.textContent = err.message; })
            .then(function () { m.el.querySelectorAll('[data-act]').forEach(function (b) { b.disabled = false; }); });
          return;
        }
        if (e.target.closest('[data-accept]')) { setText(result, true); m.close(); UI.toast('Done. Ctrl+Z in the editor brings back your version.', 'ok'); }
      });
    }

    /* ---------------- schedule, post, metrics */
    function nextSlots() {
      var out = [], d = new Date(); d.setMinutes(0, 0, 0);
      var taken = {}; ws.posts.forEach(function (p) { if (p.status === 'scheduled' && p.scheduled_at) taken[HL.dayKey(p.scheduled_at)] = 1; });
      for (var i = 1; out.length < 4 && i < 30; i++) {
        var c = new Date(d.getTime() + i * 864e5); c.setHours(8, 30, 0, 0);
        if (c.getDay() === 0 || c.getDay() === 6 || taken[HL.dayKey(c)]) continue;
        out.push(c);
      }
      return out;
    }
    function scheduleModal() {
      if (!post.text.trim()) { UI.toast('Write something first.', 'error'); return; }
      var slots = nextSlots();
      var m = UI.modal('<h2>Schedule it</h2><p class="muted small">Hookline reminds you at that time (by email and in the app). LinkedIn\'s rules don\'t allow tools to post on a timer, so you press the button: it takes 10 seconds.</p>' +
        '<div class="ui-row" style="margin-bottom:12px">' + slots.map(function (s) { return '<button class="ui-btn sm" data-slot="' + HL.localInput(s.toISOString()) + '">' + esc(s.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })) + ' 8:30</button>'; }).join('') + '</div>' +
        '<label class="ui-field"><span>Date and time</span><input type="datetime-local" data-when value="' + esc(HL.localInput(post.scheduled_at) || (slots[0] ? HL.localInput(slots[0].toISOString()) : '')) + '"></label>' +
        '<div class="ui-row end" style="margin-top:16px">' + (post.status === 'scheduled' ? '<button class="ui-btn ghost" data-unsched>Unschedule</button><span class="ui-spacer"></span>' : '') + '<button class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" data-ok>' + UI.icon('calendar') + 'Schedule</button></div>');
      m.el.addEventListener('click', function (e) {
        var s = e.target.closest('[data-slot]'); if (s) { m.el.querySelector('[data-when]').value = s.getAttribute('data-slot'); return; }
        if (e.target.closest('[data-unsched]')) { UI.busy(e.target.closest('[data-unsched]'), save({ status: 'draft', scheduled_at: null }, true)).then(function () { m.close(); UI.toast('Back to drafts'); draw(); }); return; }
        var ok = e.target.closest('[data-ok]');
        if (ok) {
          var v = m.el.querySelector('[data-when]').value; if (!v) { UI.toast('Pick a date and time.', 'error'); return; }
          UI.busy(ok, save({ status: 'scheduled', scheduled_at: HL.fromLocal(v) }, true)).then(function () { m.close(); UI.toast('Scheduled for ' + UI.fmtDateTime(post.scheduled_at) + '. We\'ll remind you.', 'ok'); draw(); });
        }
      });
    }
    function postModal() {
      if (!post.text.trim()) { UI.toast('Write something first.', 'error'); return; }
      var c = HL.check(post.text), li = ws.linkedin || {}, bad = c.items.filter(function (i) { return i.level === 'bad'; });
      var hasSlides = post.format === 'carousel' && post.carousel && post.carousel.slides && post.carousel.slides.length > 0;
      var m = UI.modal('<h2>Post it on LinkedIn</h2>' + (bad.length ? '<div class="ui-error" style="margin-bottom:12px">' + esc(bad[0].title) + ': ' + esc(bad[0].text) + '</div>' : '') +
        '<div style="margin-bottom:14px">' + HL.feedCard(post.text, { name: ctx.me.name, headline: headline(), mode: 'desktop', format: post.format }) + '</div>' +
        (li.connected ? '<p class="small muted">Posts as <b>' + esc(li.name) + '</b> through LinkedIn\'s official API. ' + (hasSlides ? 'With the carousel, your ' + post.carousel.slides.length + ' slides go up as a PDF document under the text.' : post.format !== 'text' ? 'Text only: add your ' + esc(HL.FORMATS[post.format][0].toLowerCase()) + ' on LinkedIn afterwards, or use Copy and open instead.' : '') + '</p>' : '') +
        (post.first_comment ? '<p class="small"><b>Then:</b> add your first comment (we\'ll copy it for you).</p>' : '') +
        '<div class="ui-row end" style="margin-top:14px"><button class="ui-btn" data-copyopen>' + UI.icon('copy') + 'Copy and open LinkedIn</button>' +
        (li.connected && hasSlides ? '<button class="ui-btn gold" data-apicar>' + UI.icon('slides') + 'Post with the carousel</button>' : '') +
        (li.connected ? '<button class="ui-btn ' + (hasSlides ? '' : 'gold') + '" data-api>' + UI.icon('send') + (hasSlides ? 'Post text only' : 'Post now') + '</button>' : '') + '</div>' +
        (!li.connected && li.configured ? '<p class="small faint" style="margin-top:12px">Want one-click posting? <a href="#voice/linkedin" data-go="voice/linkedin">Connect LinkedIn</a> (official, no password shared).</p>' : ''), { wide: true });
      m.el.addEventListener('click', function (e) {
        if (e.target.closest('[data-copyopen]')) {
          save().then(function () {
            HL.openLinkedIn(post.text); m.close();
            setTimeout(markPostedModal, 600);
          });
          return;
        }
        var ac = e.target.closest('[data-apicar]');
        if (ac) { m.close(); save().then(function () { return HL.postCarousel(post, ctx.me); }).then(function (p2) { if (p2) { post = p2; draw(); } }); return; }
        var api = e.target.closest('[data-api]');
        if (api) {
          save().then(function () { return UI.busy(api, UI.api('li_post', post.id)); }).then(function (r) {
            post = r.post; m.close(); UI.toast('Posted on LinkedIn.', 'ok');
            if (post.first_comment) HL.copy(post.first_comment, 'First comment copied: paste it under your post.');
            draw();
          });
        }
      });
    }
    function markPostedModal() {
      var m = UI.modal('<h2>Did you post it?</h2><p class="muted small">Mark it as posted so it counts in your calendar and insights. Paste the link to match it with LinkedIn\'s analytics later.</p>' +
        '<label class="ui-field"><span>Post link <em>(optional)</em></span><input type="url" data-url placeholder="https://www.linkedin.com/feed/update/urn:li:activity:…" value="' + esc(post.url || '') + '"></label>' +
        (post.first_comment ? '<p class="small"><button class="ui-btn sm" data-fc>' + UI.icon('copy') + 'Copy first comment</button></p>' : '') +
        '<div class="ui-row end" style="margin-top:14px"><button class="ui-btn ghost" data-close>Not yet</button><button class="ui-btn primary" data-ok>' + UI.icon('check') + 'Yes, posted</button></div>');
      m.el.addEventListener('click', function (e) {
        if (e.target.closest('[data-fc]')) { HL.copy(post.first_comment, 'First comment copied'); return; }
        var ok = e.target.closest('[data-ok]');
        if (ok) UI.busy(ok, save().then(function () { return UI.api('mark_posted', post.id, m.el.querySelector('[data-url]').value); })).then(function (r) { post = r.post; m.close(); UI.toast('Nice. Log the results in a day or two.', 'ok'); draw(); });
      });
    }
    function metricsModal() {
      var mt = post.metrics || {}, f = ['impressions', 'reactions', 'comments', 'reposts', 'saves', 'clicks'];
      var m = UI.modal('<h2>How did it do?</h2><p class="muted small">Copy the numbers from the post\'s analytics on LinkedIn (or import your analytics export on Insights).</p><form class="ui-grid two" data-m>' +
        f.map(function (k) { return '<label class="ui-field"><span>' + k[0].toUpperCase() + k.slice(1) + '</span><input type="number" min="0" name="' + k + '" value="' + esc(mt[k] == null ? '' : mt[k]) + '"></label>'; }).join('') +
        '<label class="ui-field" style="grid-column:1/-1"><span>Post link</span><input type="url" name="url" value="' + esc(post.url || '') + '"></label>' +
        '<div class="ui-row end" style="grid-column:1/-1"><button class="ui-btn primary" type="submit">Save</button></div></form>');
      m.el.querySelector('[data-m]').addEventListener('submit', function (e) {
        e.preventDefault(); var v = UI.formData(e.target);
        UI.busy(e.target.querySelector('button'), UI.api('save_metrics', post.id, v, v.url)).then(function (r) { post = r.post; m.close(); UI.toast('Saved', 'ok'); });
      });
    }

    /* ---------------- events */
    view.addEventListener('input', function (e) {
      var f = e.target.getAttribute('data-f'); if (!f) return;
      post[f] = e.target.value;
      if (f === 'text' || f === 'first_comment') update();
      queueSave();
    });
    view.addEventListener('change', function (e) { var f = e.target.getAttribute('data-f'); if (f === 'pillar' || f === 'format') { post[f] = e.target.value; update(); queueSave(); } });
    view.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-expand]')) { expanded = true; update(); return; }
      var md = t.closest('[data-mode]'); if (md) { mode = md.getAttribute('data-mode'); expanded = false; view.querySelectorAll('[data-mode]').forEach(function (b) { b.classList.toggle('on', b === md); }); update(); return; }
      var fx = t.closest('[data-fix]');
      if (fx) {
        if (fx.getAttribute('data-fix') === 'plain') setText(HL.plain(post.text));
        if (fx.getAttribute('data-fix') === 'link') {
          var links = post.text.match(/https?:\/\/\S+/g) || [];
          post.first_comment = (post.first_comment ? post.first_comment + '\n' : '') + links.join('\n');
          setText(post.text.replace(/\s*https?:\/\/\S+/g, '').replace(/[ \t]+\n/g, '\n') + (/(link|comment)/i.test(post.text) ? '' : '\n\n(Link in the first comment.)'));
          draw(); UI.toast('Moved to the first comment', 'ok');
        }
        return;
      }
      if (t.closest('[data-hooklab]')) { hookLab(); return; }
      if (t.closest('[data-struct]')) { structures(); return; }
      if (t.closest('[data-ai]')) { aiPanel(); return; }
      if (t.closest('[data-new]')) { save().then(function () { location.hash = '#studio/new'; }); return; }
      var sv = t.closest('[data-save]'); if (sv) { if (!post.text.trim()) { UI.toast('Write something first.', 'error'); return; } UI.busy(sv, save(null, true)).then(function () { UI.toast('Saved', 'ok'); draw(); }); return; }
      if (t.closest('[data-schedule]')) { scheduleModal(); return; }
      if (t.closest('[data-post]')) { postModal(); return; }
      if (t.closest('[data-markposted]')) { markPostedModal(); return; }
      if (t.closest('[data-metrics]')) { metricsModal(); return; }
      if (t.closest('[data-carousel]')) { if (!post.text.trim()) { UI.toast('Write the post first: slides start from it.', 'error'); return; } save(null, true).then(function () { UI.go('carousel', post.id); }); return; }
      if (t.closest('[data-del]')) {
        UI.confirm({ title: 'Delete this post?', text: 'This can\'t be undone.', ok: 'Delete', danger: true }).then(function (y) {
          if (y) UI.api('delete_post', post.id).then(function () { UI.toast('Deleted'); UI.go('posts'); });
        });
      }
    });
    function keys(e) { if ((e.ctrlKey || e.metaKey) && e.key === 's' && view.contains(document.activeElement)) { e.preventDefault(); save(null, true).then(function () { UI.toast('Saved', 'ok'); }); } }
    document.addEventListener('keydown', keys);

    var ready = HL.load().then(function (w) {
      ws = w;
      var id = ctx.args[0];
      if (id && id !== 'new') {
        post = ws.posts.filter(function (p) { return p.id === id; })[0];
        if (!post) { UI.toast('That post isn\'t here anymore.', 'error'); post = blank(); }
      } else if (!id) {
        var latest = ws.posts.filter(function (p) { return p.status === 'draft'; })[0];
        post = latest || blank();
      } else post = blank();
      var seed = UI.store.get('seed', null);
      if (seed && (!id || id === 'new')) { UI.store.set('seed', null); post = blank(); post.text = seed.text || ''; post.pillar = seed.pillar || ''; if (seed.idea) UI.store.set('seedIdea', seed.idea); }
      draw();
      if (post.text && !post.id) queueSave();
    });
    return { ready: ready, destroy: function () { document.removeEventListener('keydown', keys); if (dirty) save().catch(function () {}); } };
  });
})();

/* ===== voice.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['voice', 'Your voice', 'feather'], ['rhythm', 'Pillars & rhythm', 'target'], ['ai', 'AI', 'sparkle'], ['linkedin', 'LinkedIn', 'linkedin']];
  var TONES = [['formal', 'Casual', 'Formal'], ['playful', 'Serious', 'Playful'], ['bold', 'Gentle', 'Bold'], ['warm', 'Cool', 'Warm']];

  UI.page('voice', { title: 'Voice & settings', nav: 'Voice', icon: 'sliders', auth: 'user', order: 70 }, function (view, ctx) {
    var tab = TABS.some(function (t) { return t[0] === ctx.args[0]; }) ? ctx.args[0] : 'voice', ws = null, v = null;
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:420px"></div></div>';
    function frame() {
      return '<div class="ui-wrap vc-sec"><div class="ui-page-head"><div><div class="eyebrow">Make it sound like you</div><h1>Voice & settings</h1></div></div>' +
        '<nav class="ui-tabs">' + TABS.map(function (t) { return '<a href="#voice/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>'; }).join('') + '</nav><div data-body></div></div>';
    }
    function saveVoice(btn, extra) {
      var p = UI.api('save_profile', Object.assign({}, v, extra || {}));
      return (btn ? UI.busy(btn, p) : p).then(function (r) { ws.profile = r.profile; v = JSON.parse(JSON.stringify(r.profile.voice || {})); return r; });
    }
    function drawVoice(body) {
      v.samples = v.samples || []; v.banned = v.banned || []; v.tone = v.tone || {};
      var st = HL.voiceStats(v.samples), card = v.card || {};
      body.innerHTML = '<div class="ui-stack">' +
        '<div class="ui-card"><h3>About you</h3><p class="muted small">Used by the AI (if you add a key) and in the preview headline.</p>' +
        '<label class="ui-field"><span>What you do, in a sentence or two</span><textarea data-v="about" rows="2" maxlength="600" placeholder="Freelance UX designer in Montréal. I help SaaS teams fix onboarding.">' + esc(v.about || '') + '</textarea></label>' +
        '<div class="ui-grid two" style="margin-top:12px"><label class="ui-field"><span>Who you write for</span><input type="text" data-v="audience" maxlength="300" value="' + esc(v.audience || '') + '" placeholder="Founders and product managers"></label>' +
        '<label class="ui-field"><span>Language of your posts</span><input type="text" data-v="language" maxlength="30" value="' + esc(v.language || 'English') + '"></label></div></div>' +
        '<div class="ui-card"><h3>Your past posts</h3><p class="muted small">Paste 5 to 30 posts you\'re proud of. Hookline measures your style here in the browser' + (HL.ai.has() ? ', and the AI writes a voice card from them.' : '. Add an AI key for a written voice card.') + '</p>' +
        '<textarea data-newsample rows="5" placeholder="Paste one post, then press Add. Or paste several separated by a line with ---"></textarea><div class="ui-row" style="margin-top:8px"><button class="ui-btn" data-addsample>' + UI.icon('plus') + 'Add</button><span class="small muted">' + UI.plural(v.samples.length, 'post') + ' saved</span></div>' +
        (v.samples.length ? '<div class="vc-samples">' + v.samples.map(function (s, i) { return '<div class="vc-sample"><span>' + esc(s) + '</span><button class="ui-btn ghost icon sm" data-rms="' + i + '" aria-label="Remove">' + UI.icon('x') + '</button></div>'; }).join('') + '</div>' : '') +
        (st ? '<div class="vc-stats"><div><b>' + st.chars + '</b><span>characters per post</span></div><div><b>' + st.sentence_words + '</b><span>words per sentence</span></div><div><b>' + st.hook_chars + '</b><span>characters in first lines</span></div>' +
          '<div><b>' + st.emoji + '</b><span>emoji per post</span></div><div><b>' + st.hashtags + '</b><span>hashtags per post</span></div><div><b>' + st.questions + '%</b><span>end on a question</span></div><div><b>' + (st.grade || '–') + '</b><span>reading grade</span></div></div>' +
          '<p>' + esc(HL.voiceSummary(st)) + '</p>' : '') +
        (v.samples.length >= 3 ? '<div class="vc-card">' + (card.summary ? '<h3 style="margin-bottom:4px">Your voice card</h3><p>' + esc(card.summary) + '</p>' +
          [['traits', 'Traits'], ['do', 'You do'], ['dont', 'You avoid'], ['moves', 'Signature moves']].map(function (k) { return (card[k[0]] || []).length ? '<b class="small">' + k[1] + '</b><ul>' + card[k[0]].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; }).join('')
          : '<p class="small muted" style="margin:0 0 8px">No voice card yet.</p>') + '<button class="ui-btn sm" data-card>' + UI.icon('sparkle') + (card.summary ? 'Rewrite the voice card' : 'Write my voice card') + '</button></div>' : '') + '</div>' +
        '<div class="ui-card"><h3>Words you never use</h3><p class="muted small">The AI avoids them, and the post check flags them. Comma separated.</p><input type="text" data-banned value="' + esc(v.banned.join(', ')) + '" placeholder="synergy, ninja, crushing it"></div>' +
        '<div class="ui-card"><h3>Tone</h3>' + TONES.map(function (t) { var val = v.tone[t[0]] == null ? 50 : v.tone[t[0]]; return '<div class="vc-range"><span>' + t[1] + '</span><input type="range" min="0" max="100" step="5" data-tone="' + t[0] + '" value="' + val + '" aria-label="' + t[1] + ' to ' + t[2] + '"><span style="text-align:right">' + t[2] + '</span></div>'; }).join('') + '</div>' +
        '<div class="ui-row end"><button class="ui-btn primary" data-savevoice>' + UI.icon('check') + 'Save voice</button></div></div>';
    }
    function drawRhythm(body) {
      var ps = ws.profile.pillars || [], total = ps.reduce(function (s, p) { return s + (+p.target || 0); }, 0);
      body.innerHTML = '<div class="ui-stack"><div class="ui-card"><h3>Content pillars</h3><p class="muted small">The 3 to 5 themes you\'re known for, and roughly how often each should come up. The calendar shows how close you are.</p><div data-pillars>' +
        ps.map(function (p, i) { return '<div class="vc-pillar" data-i="' + i + '"><input type="color" data-pc value="' + esc(p.color) + '" aria-label="Colour"><input type="text" data-pn value="' + esc(p.name) + '" maxlength="30" aria-label="Pillar name"><span class="pct"><input type="number" data-pt min="0" max="100" value="' + p.target + '" aria-label="Target percent">%</span><button class="ui-btn ghost icon sm" data-rmp aria-label="Remove pillar">' + UI.icon('x') + '</button></div>'; }).join('') +
        '</div><div class="ui-row"><button class="ui-btn sm" data-addp' + (ps.length >= 6 ? ' disabled' : '') + '>' + UI.icon('plus') + 'Add pillar</button><span class="small ' + (total === 100 ? 'muted' : '') + '" style="' + (total === 100 ? '' : 'color:var(--c-warn)') + '">Targets add up to ' + total + '%' + (total === 100 ? '' : ' (aim for 100)') + '</span></div></div>' +
        '<div class="ui-card"><h3>Rhythm</h3><label class="ui-field"><span>Posts per week</span><input type="number" min="1" max="14" data-cad value="' + (ws.profile.cadence || 3) + '" style="max-width:120px"></label>' +
        '<p class="small muted">Large studies of LinkedIn posts (Buffer, 2M+ posts) found that posting more often brings more views per post, with diminishing returns. A rhythm you can keep beats a burst.</p>' +
        '<label class="ui-check" style="margin-top:8px"><input type="checkbox" data-rem' + (ws.profile.reminders ? ' checked' : '') + '><span>Email me when a scheduled post is due</span></label></div>' +
        '<div class="ui-row end"><button class="ui-btn primary" data-saverhythm>' + UI.icon('check') + 'Save</button></div></div>';
    }
    function drawAI(body) {
      var a = HL.ai.get();
      body.innerHTML = '<div class="ui-stack"><div class="ui-card"><h3>Your own Claude API key</h3><p class="muted small">Hookline is free because you bring the AI. Your key is saved <b>only in this browser</b> and sent straight to Anthropic: Hookline\'s server never sees it or your drafts. A post costs well under a cent.</p>' +
        '<ol class="small" style="padding-left:18px;margin:8px 0 14px"><li>Go to the Claude Console (console.anthropic.com) → API keys → Create key.</li><li>Add a little credit under Billing (and a monthly limit if you like).</li><li>Paste the key here.</li></ol>' +
        '<label class="ui-field"><span>API key</span><input type="password" data-key value="' + esc(a.key || '') + '" placeholder="sk-ant-…" autocomplete="off" spellcheck="false"></label>' +
        '<div class="vc-models" style="margin-top:14px">' + HL.ai.MODELS.map(function (m) { return '<label class="ui-check"><input type="radio" name="model" value="' + m[0] + '"' + (HL.ai.model() === m[0] ? ' checked' : '') + '><span><b>' + esc(m[1]) + '</b> · <span class="muted">' + esc(m[2]) + '</span></span></label>'; }).join('') + '</div>' +
        '<div class="ui-row" style="margin-top:16px"><button class="ui-btn primary" data-savekey>' + UI.icon('check') + 'Save</button><button class="ui-btn" data-testkey>' + UI.icon('zap') + 'Test it</button>' + (a.key ? '<button class="ui-btn ghost danger" data-forget>Forget key</button>' : '') + '</div><p class="small" data-testout></p></div>' +
        '<div class="ui-card"><h3>What the AI does here</h3><p class="small muted" style="margin:0">Drafts from your ideas, rewrites in your voice, hooks, comment drafts, repurposing and carousel slides, using your voice card and rules (no invented facts: it leaves [brackets] for you). It never posts anything. Without a key, every page still works with the built-in coach.</p></div></div>';
    }
    function drawLinkedIn(body) {
      var li = ws.linkedin || {}, q = (location.hash.split('?')[1] || '');
      var msg = /ok=1/.test(q) ? '<div class="ui-note" style="margin-bottom:12px">' + UI.icon('check') + ' LinkedIn is connected.</div>' : /error=/.test(q) ? '<div class="ui-error" style="margin-bottom:12px">' + esc(decodeURIComponent(q.split('error=')[1] || '')) + '</div>' : '';
      body.innerHTML = msg + '<div class="ui-stack"><div class="ui-card"><h3>Post with one click</h3>' +
        (li.connected ? '<div class="vc-li">' + (li.picture ? '<img src="' + esc(li.picture) + '" alt="">' : '<span class="av">' + UI.icon('user') + '</span>') + '<div><b>' + esc(li.name) + '</b><div class="small muted">Connected · ' + li.days_left + ' days left</div>' +
          '<div class="vc-meter"><i style="width:' + Math.round(100 * li.days_left / 60) + '%;' + (li.days_left < 7 ? 'background:var(--c-warn)' : '') + '"></i></div></div><span class="ui-spacer"></span>' +
          (li.days_left < 14 ? '<button class="ui-btn gold" data-connect>' + UI.icon('refresh') + 'Reconnect</button>' : '') + '<button class="ui-btn ghost" data-disconnect>Disconnect</button></div>' +
          '<p class="small muted" style="margin-top:12px">LinkedIn connections last 60 days; we\'ll remind you before it runs out.</p>'
        : li.configured ? '<p class="muted small">Connect through LinkedIn\'s official sign-in. Hookline gets permission to publish posts <b>only when you press Post now</b>. It can\'t read your messages, connections or feed, and it never posts on its own.</p><button class="ui-btn gold" data-connect>' + UI.icon('linkedin') + 'Connect LinkedIn</button>'
        : '<p class="muted small">One-click posting isn\'t switched on for this Hookline yet. You can still post everything with <b>Copy and open LinkedIn</b>: Hookline copies your post and opens LinkedIn\'s share box.</p>') + '</div>' +
        '<div class="ui-card"><h3>Why no auto-posting and no extension?</h3><p class="small muted" style="margin:0">LinkedIn\'s API terms don\'t allow tools to automate posting, and its User Agreement bans browser add-ons that scrape or act for you. Tools that ignored this have had accounts restricted and extensions shut down. Hookline stays on the official, safe side: you schedule, it reminds you, you press the button.</p></div></div>';
    }
    function draw() { view.innerHTML = frame(); var b = view.querySelector('[data-body]'); ({ voice: drawVoice, rhythm: drawRhythm, ai: drawAI, linkedin: drawLinkedIn })[tab](b); }

    function readPillars() {
      return Array.prototype.map.call(view.querySelectorAll('[data-pillars] [data-i]'), function (row, i) {
        var old = ws.profile.pillars[i] || {};
        return { id: old.id || '', name: row.querySelector('[data-pn]').value, color: row.querySelector('[data-pc]').value, target: +row.querySelector('[data-pt]').value || 0 };
      });
    }
    view.addEventListener('input', function (e) {
      var k = e.target.getAttribute('data-v'); if (k) v[k] = e.target.value;
      var t = e.target.getAttribute('data-tone'); if (t) { v.tone = v.tone || {}; v.tone[t] = +e.target.value; }
      if (e.target.matches('[data-banned]')) v.banned = e.target.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    });
    view.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-addsample]')) {
        var ta = view.querySelector('[data-newsample]'), parts = ta.value.split(/\n-{3,}\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 20; });
        if (!parts.length) { UI.toast('Paste a post first.', 'error'); return; }
        v.samples = (v.samples || []).concat(parts).slice(0, 30);
        v.stats = HL.voiceStats(v.samples) || {};
        saveVoice(t.closest('[data-addsample]')).then(function () { UI.toast(UI.plural(parts.length, 'post') + ' added', 'ok'); draw(); });
        return;
      }
      var rs = t.closest('[data-rms]'); if (rs) { v.samples.splice(+rs.getAttribute('data-rms'), 1); v.stats = HL.voiceStats(v.samples) || {}; saveVoice().then(draw); return; }
      var cb = t.closest('[data-card]');
      if (cb) {
        if (!HL.ai.has()) { UI.modal('<h2>Voice card</h2>' + HL.ai.nudge('write your voice card from your posts')); return; }
        UI.busy(cb, HL.ai.voiceCard(v.samples)).then(function (card) { v.card = card; return saveVoice(); }).then(function () { UI.toast('Voice card written', 'ok'); draw(); }, function (err) { UI.toast(err.message, 'error'); });
        return;
      }
      var sv = t.closest('[data-savevoice]'); if (sv) { v.stats = HL.voiceStats(v.samples) || {}; saveVoice(sv).then(function () { UI.toast('Saved', 'ok'); }); return; }
      if (t.closest('[data-addp]')) { ws.profile.pillars = readPillars().concat([{ id: '', name: 'New pillar', color: '#4a6fa5', target: 0 }]); drawRhythm(view.querySelector('[data-body]')); return; }
      var rp = t.closest('[data-rmp]'); if (rp) { var ps = readPillars(); ps.splice(+rp.closest('[data-i]').getAttribute('data-i'), 1); ws.profile.pillars = ps; drawRhythm(view.querySelector('[data-body]')); return; }
      var sr = t.closest('[data-saverhythm]');
      if (sr) { UI.busy(sr, UI.api('save_profile', null, readPillars(), view.querySelector('[data-cad]').value, view.querySelector('[data-rem]').checked, Intl.DateTimeFormat().resolvedOptions().timeZone || ''))
        .then(function (r) { ws.profile = r.profile; UI.toast('Saved', 'ok'); drawRhythm(view.querySelector('[data-body]')); }); return; }
      if (t.closest('[data-savekey]')) {
        var key = view.querySelector('[data-key]').value.trim(), m = (view.querySelector('input[name=model]:checked') || {}).value;
        if (key && !/^sk-ant-/.test(key)) { UI.toast('That doesn\'t look like an Anthropic key (they start with sk-ant-).', 'error'); return; }
        HL.ai.set({ key: key, model: m }); UI.toast(key ? 'Saved in this browser' : 'Key removed', 'ok'); draw(); return;
      }
      var tk = t.closest('[data-testkey]');
      if (tk) {
        var k2 = view.querySelector('[data-key]').value.trim(), m2 = (view.querySelector('input[name=model]:checked') || {}).value;
        HL.ai.set({ key: k2, model: m2 });
        var out = view.querySelector('[data-testout]'); out.textContent = 'Asking ' + HL.ai.modelName() + '…';
        UI.busy(tk, HL.ai.test()).then(function (txt) { out.innerHTML = '<span style="color:var(--c-good)">✓ It works.</span> ' + esc(txt.trim().slice(0, 120)); }, function (err) { out.innerHTML = '<span style="color:var(--c-bad)">' + esc(err.message) + '</span>'; });
        return;
      }
      if (t.closest('[data-forget]')) { HL.ai.clear(); UI.toast('Key forgotten on this browser'); draw(); return; }
      var cn = t.closest('[data-connect]'); if (cn) { UI.busy(cn, UI.api('li_auth_url')).then(function (r) { location.href = r.url; }); return; }
      if (t.closest('[data-disconnect]')) UI.confirm({ title: 'Disconnect LinkedIn?', text: 'Hookline forgets the connection. You can still copy and post.', ok: 'Disconnect', danger: true }).then(function (y) {
        if (y) UI.api('li_disconnect').then(function (r) { ws.linkedin = r.linkedin; draw(); });
      });
    });
    return HL.load().then(function (w) { ws = w; v = JSON.parse(JSON.stringify(w.profile.voice || {})); draw(); });
  });
})();
