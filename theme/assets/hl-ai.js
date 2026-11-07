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
