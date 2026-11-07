/* hl-media.js: Hookline's drawing engines, moved unchanged from the JavaScript version.
   - Carousel: slides drawn on a 1080x1350 canvas (render), the PDF made with jsPDF (pdfFile), slides from a post (fromPost).
   - Insights: LinkedIn's analytics export (XLSX/CSV) read in the browser with SheetJS (parseWorkbook/readFile: only the
     numbers reach the server), and the impressions line chart (SVG at the container's real width) with its hover.
   Python reaches it through window.HLC / window.HLI (client_code/hl.py, Components/SlideCanvas, Components/LineChart). */
(function () {
  'use strict';
  var HL = window.HL = window.HL || {};
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
    return HL.loadScript((document.querySelector('meta[name=hl-jspdf]') || {}).content || '_/theme/jspdf.umd.min.js', 'jspdf').then(function (lib) {
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

  window.HLC = {
    THEMES: THEMES,
    fromPost: function (text) { return JSON.stringify(fromPost(text)); },
    render: function (canvas, slideJson, i, n, theme, handle) {
      var go = function () { render(canvas, JSON.parse(slideJson), i, n, THEMES[theme] || THEMES.navy, handle); };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
    },
    pdf: function (postJson, carJson, meName) { return pdfFile(JSON.parse(postJson), JSON.parse(carJson), { name: meName }); },
    download: function (file) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    }
  };
  HL.carouselPdf = function (post, me) { return pdfFile(post, fromPostOrSaved(post), me); };   // also for tests
})();

(function () {
  'use strict';
  var HL = window.HL = window.HL || {};
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
    return HL.loadScript((document.querySelector('meta[name=hl-xlsx]') || {}).content || '_/theme/xlsx.full.min.js', 'XLSX').then(function (XLSX) {
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

  /* The hover on the line chart: a cross line, a dot and a tip with the day's numbers. */
  function wire(box, daily) {
    var svg = box.querySelector('svg'), tip = box.querySelector('[data-tip]'), cross = box.querySelector('[data-cross]'), dot = box.querySelector('[data-dot]');
    if (!svg) return;
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

  window.HLI = {
    /* the first File of an <input type=file> or a drop event's DataTransfer (Python can't index a FileList) */
    first: function (x) { var f = x && (x.files || (x.dataTransfer && x.dataTransfer.files)); return f && f.length ? f[0] : null; },
    fileName: function (f) { return f ? f.name : ''; },
    readFile: function (file) { return readFile(file).then(function (sum) { return JSON.stringify(sum); }); },
    chart: function (box, dailyJson, postDaysJson, width) {
      var daily = JSON.parse(dailyJson);
      box.innerHTML = lineChart(daily, JSON.parse(postDaysJson), width);
      var c = box.querySelector('[data-line]'); if (c) wire(c, daily);
    }
  };
  HL.parseWorkbook = parseWorkbook;   // for the tests
})();
