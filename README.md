# Hookline

A free LinkedIn writing studio, built to beat Taplio on the things that matter without the risks: write posts in your
own voice, get the hook past the "see more" fold, check readability and AI-sounding phrases, plan a calm rhythm, post
through LinkedIn's official API (only when you press the button), and learn from your own analytics export. AI is
optional and runs on each user's own Anthropic API key, straight from their browser. Built on [Anvil](https://anvil.works).

- **App repo:** github.com/arkulinskis/hookline (branch `master`). Anvil pulls `master`.
- **Live:** https://hookline.anvil.app

## What it does

**For members** (everything is private to its owner):
- **Write** (`#studio[/id]`, home): editor with autosave; live feed preview (desktop/phone) cut where "see more" cuts
  (~210 / ~140 characters, 3 lines); **post check** with a 0-100 score: Unicode "bold" (one-click fix), hook length at
  the phone fold, gap after the hook, links in the body (one click moves them to the first comment), hashtag walls,
  long paragraphs, emoji walls, AI clichés, engagement bait, em-dash overuse, shouting, reading grade, "lots of I",
  closing question; **hook lab** (20 formulas filled with your topic and scored, or 6 AI hooks); **structures**
  (story, list, opinion, how-to, before/after, behind the scenes); **AI** (draft from idea, in my voice, shorter,
  clearer, as a story, stronger hook, end with a question); first comment; notes; pillar; format; schedule (reminder,
  never auto-posts); **post** (official "Post now" when LinkedIn is connected, else copy and open LinkedIn's share
  box), mark as posted with the link, log results, carousel, delete.
- **Posts** (`#posts`): drafts, scheduled and posted columns, pillar filter, search, due-now banner, results on cards.
- **Calendar** (`#calendar[/YYYY-MM]`): month grid, drag drafts (or scheduled posts) onto days, weekly count vs your
  target, pillar mix vs targets, best days and hours from your own results (after 8 posts).
- **Ideas** (`#ideas`): quick capture, guided questions by kind (story, lesson, opinion, how-to, behind the scenes,
  numbers), AI suggestions from your pillars and top posts, "Draft it" (AI or a structure) into the studio.
- **Insights** (`#insights`): import LinkedIn's analytics export (XLSX/CSV, parsed in the browser with SheetJS; only a
  summary is saved; posts matched by activity id), KPIs, impressions over time with post-day markers and a hover
  tooltip, "what's working" findings (format, pillar, hook length, links, questions, weekday), averages by format,
  pillar, weekday, top posts, audience; load/remove 24 example posts.
- **Lab** (`#lab/...`): hooks (scored, previewed at the phone fold), repurpose (AI angles, or the strongest sentences
  without a key), comment helper (AI drafts or 5 frameworks; you post it), Unicode clean-up.
- **Carousel** (`#carousel/<post id>`): slides from the post (or AI), 4 themes, 1080x1350 canvas, PDF via jsPDF.
  With LinkedIn connected, **Post on LinkedIn** (here, or "Post with the carousel" in the studio's post dialog) makes the
  PDF in the browser, uploads it, and publishes a document post through LinkedIn's official Documents + Posts APIs.
- **Voice & settings** (`#voice/...`): about, audience, language, pasted past posts → style statistics and an AI
  voice card, banned words, tone; pillars with target mix, posts per week, reminder emails; AI key + model (Claude
  Opus 5.5 default, Sonnet 5.5, Haiku 5.5; key kept in this browser only; test button); LinkedIn connect/disconnect
  with the 60-day countdown.

**Never:** scraping, a browser extension, auto-posting on a timer, auto-comments/DMs, viral-post libraries, storing a
LinkedIn password.

**For everyone:** a landing page with a live fold tester, sign-up with email and password or Google, a feedback form ("Send
feedback" in the footer and menu), and the Privacy & Terms page (footer link, `#legal`).

**For admins** (`#admin`; arkulinskis@gmail.com becomes an admin on first sign-in):
- **Overview:** people, posts (posted), ideas, LinkedIn connections, new feedback.
- **LinkedIn:** setup steps with the exact redirect URL, status, number connected, and the LinkedIn-Version header (YYYYMM).
- **Feedback inbox**, **Users**, **Demo data** (a demo person with the examples; "Remove" deletes every example row).

## Setting it up in Anvil (once)

1. In the Anvil editor: **Create app → Clone from GitHub**, and paste `https://github.com/arkulinskis/hookline`.
2. **Users** service: email + password and "Continue with Google", sign-up allowed (already set in `anvil.yaml`; check it).
3. **Email** service (reminders) and **App Secrets** service: check they're there.
4. Open the app in the editor. If it shows a **Schema Mismatch** alert, choose **"The schema of the source code is correct"** so Anvil creates the tables.
5. **Scheduled Tasks**: `send_reminders` every 15 minutes is in `anvil.yaml` (needs a paid Anvil plan; without one, reminders still show in the app as a "due now" banner).
6. **Run** it and sign up with **arkulinskis@gmail.com** straight away (that account becomes the admin).
7. **Publish**. Optional one-click posting: follow Admin → LinkedIn (a LinkedIn developer app with "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn", the redirect URL, and App Secrets `linkedin_client_id` / `linkedin_client_secret`).

<!-- libraries:start -->
## Libraries and outside services

What this project uses besides its own code. Generated by `APP_MAKER/tools/libraries.py`; to change it, edit `APP_MAKER/libraries/catalog.py` and re-run the script.

| Name | How it gets in | Used here for |
|---|---|---|
| [jsPDF](https://github.com/parallax/jsPDF) | Copied into the app | turns carousel slides into a PDF to upload to LinkedIn as a document post |
| [SheetJS (xlsx)](https://sheetjs.com) | Copied into the app | reads your LinkedIn analytics export in the browser, so only the numbers are saved |
| [Claude API](https://docs.anthropic.com) | Outside web service | drafts, rewrites, hooks and voice cards, called from your browser with your own key |
| [YouTube embeds](https://developers.google.com/youtube/player_parameters) | Outside web service | Plays a YouTube video inside the page (the privacy-friendlier youtube-nocookie address). |
| [Google Fonts](https://fonts.google.com) | Loaded from a CDN | DM Sans, DM Serif Display |

**Built into the browser:** Canvas 2D, localStorage, Clipboard, File downloads (Blob).

**Anvil platform:** Anvil, Anvil Data Tables, Anvil Google service, Anvil JS bridge (anvil.js), Anvil Users, Anvil HTTP, Anvil Email, Anvil Secrets.

**Build and test tools (not shipped):** Node.js, PyYAML, Headless Chrome (DevTools Protocol).

<!-- libraries:end -->

## Working on it

Native Anvil Forms (branch `forms`): this folder is the Anvil app (git layout); pushing is the deploy. Code map: `APP_MAP.md`.

```
python tools/check.py                            # Anvil's validator, JS syntax, asset hashes, server tests -> ALL CHECKS PASSED
python -I tools/ui_test.py                       # smoke test in the Anvil App Server (Docker): every page, signed out / member / admin
git push origin forms                            # deploy the branch (master only after the user approves)
```

## Project layout

```
client_code/    startup.py, router.py (addresses), state.py, auth.py, hl.py (Python side of the engines), legal.py
  Layouts/Shell   header (seven pages), account menu, footer, phone tab bar (4 + More)
  Pages/          Landing, Auth, Studio, Posts, Calendar, Insights, Ideas, Lab, Voice, Carousel, Profile, Admin
  Dialogs/        HookLab, Structures, AiWrite, AiNudge, Schedule, PostIt, MarkPosted, Metrics, DayPick, PickTime, DraftIdea, More
  Items/          list rows (PostCard, IdeaRow, Check, CalWeek/CalDay/CalPost, LabCard, SlideEdit, Bar, ...)
  Components/     FeedPreview, ScoreRing, AiNudge, DropFile
server_code/    common.py, Accounts.py, Feedback.py, Admin.py, DemoData.py (examples), legal_server.py, seo_routes.py,
                Studio.py (workspace, posts, ideas, voice, reminders task), LinkedIn.py (OAuth, Post now, admin), Insights.py (imports)
theme/assets/   app.css, icons.css, app-kit.js; engines: hl.js (post check, fold, formulas, voice stats), hl-ai.js (bring-your-own-key
                Claude from the browser), hl-media.js (carousel canvas + PDF, analytics reader + line chart); xlsx.full.min.js, jspdf.umd.min.js
tools/          check.py, assets.py, build_icons.py, make_icons.py, ui_test.py + ui/smoke.js, live/drive.mjs, testing/ (server tests)
```
