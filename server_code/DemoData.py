"""Example content. Hookline workspaces are private, so examples live inside each person's own workspace:
Insights -> "Load example posts" (Studio.add_examples) fills it with 24 past posts, metrics and an analytics export,
all flagged is_demo=True and removable in one click. The admin's Demo data tab manages a demo person (Maya) with
the same examples, and "Remove demo data" deletes every example row in every workspace.

Everything here is fictional: a freelance UX designer in Montréal.
"""
import datetime as dt
import random

from anvil.tables import app_tables

from . import common as C

DEMO_USERS = [("Maya Chen", "maya.demo@example.com")]
DEMO_TABLES = ["posts", "ideas", "imports", "profiles"]

# (pillar, format, text, first comment, base impressions)
EXAMPLES = [
    ("expertise", "carousel", "Your onboarding has 7 screens.\nYour users read 1.\n\nI tested 12 onboarding flows with 40 people last month. The ones that worked had three things in common:\n\n1. They asked one question, not five.\n2. They showed the product doing the job before asking for anything.\n3. They let people skip, and made skipping feel safe.\n\nThe carousel has the screens, before and after.\n\nWhich of the three does yours do?", "", 9400),
    ("story", "text", "A client fired me in 2021.\n\nNot politely. A one-line email on a Friday.\n\nI spent the weekend angry, then I re-read my own project brief. It was vague. I'd promised \"a fresh look\" and delivered exactly that: a fresh look at the wrong problem.\n\nNow every project starts with one sentence we both sign: what will be different for the user when we're done.\n\nIt's the cheapest insurance I've ever bought.", "", 14200),
    ("opinion", "text", "Unpopular opinion: most design systems are too big.\n\n400 components. 3 people know where anything is. Every new screen still gets a custom button.\n\nStart with 12 parts you actually use every week. Write down why each exists. Grow it only when the third team asks for the same thing.\n\nSmall and used beats complete and ignored.", "", 11800),
    ("expertise", "image", "The fastest usability test I know takes 5 minutes and costs a coffee.\n\nPrint your screen. Find someone who's never seen it. Ask: \"What would you do first?\"\n\nDon't explain. Don't help. Just watch where their finger goes.\n\nI've caught more problems this way than with any tool.", "", 7600),
    ("offer", "text", "I have two spots open in January for UX audits.\n\nYou get: a recorded walkthrough of your product with real users, a prioritised list of fixes, and one working session with your team.\n\nBest for: SaaS teams of 5 to 50 who know something's off but can't name it.\n\nDM me \"audit\" and I'll send the details.", "", 3900),
    ("story", "text", "My worst design review lasted 11 minutes.\n\nThe VP looked at my beautiful prototype and asked: \"Who asked for this?\"\n\nNobody had. I'd fallen in love with a solution before anyone agreed on the problem.\n\nThese days I bring the problem to the first meeting and nothing else. The solution comes to the second.", "", 16800),
    ("expertise", "carousel", "Empty states are the most ignored screens in your product.\n\nThey're also the first thing every new user sees.\n\nHere's the 4-part formula I use:\n\n→ Say what goes here.\n→ Show an example.\n→ Give one button to start.\n→ Reassure: nothing breaks if they explore.\n\n8 before-and-afters in the carousel.", "", 12100),
    ("opinion", "poll", "Dark patterns aren't a design problem. They're a business model problem.\n\nNo designer wakes up wanting to hide the cancel button. Someone set a retention target and nobody asked how.\n\nIf you want to fix it, fix the metric.\n\nWho decides in your company?", "", 8900),
    ("expertise", "text", "3 words I deleted from every interface this year:\n\n\"Simply\". If it were simple, you wouldn't need to say it.\n\"Oops\". Errors aren't cute when you've lost your work.\n\"Submit\". Say what happens: Send, Save, Book.\n\nSmall words, big trust.", "", 10400),
    ("story", "video", "I recorded myself doing my own client's checkout. It took 4 minutes and 3 sighs.\n\nThe sighs were the brief.\n\n90 seconds of the recording, with the moments that hurt.", "", 6100),
    ("expertise", "text", "How I run a 30-minute user interview (the template I've used 200+ times):\n\n5 min: their day, not your product.\n10 min: the last time they had the problem.\n10 min: what they tried and why it failed.\n5 min: anything I should have asked?\n\nThe last question finds the best stuff, every time.", "", 13300),
    ("offer", "article", "I wrote down everything I know about accessible forms. It's free.\n\n22 pages: labels, errors, keyboard use, and the five mistakes I see most.\n\nLink in the first comment.", "Here it is: https://example.com/accessible-forms-guide", 2700),
    ("opinion", "text", "Your users don't hate change.\n\nThey hate surprise, and losing what they'd just learned.\n\nAnnounce it, explain why, let them switch back for a week. Same redesign, half the angry emails.", "", 9800),
    ("story", "text", "Ten years ago I printed my portfolio and walked into 14 agencies in Old Montréal.\n\n13 said no. One said \"come back Monday.\"\n\nI stayed there four years.\n\nI still think about the 13. Every no made the pitch shorter.", "", 18900),
    ("expertise", "carousel", "Most error messages fail the same 3 tests.\n\nDo they say what happened?\nDo they say why?\nDo they say what to do now?\n\nI rewrote 10 real error messages from apps you use. Swipe through.", "", 11200),
    ("expertise", "image", "A trick for prioritising UX fixes when everything feels urgent:\n\nPlot each issue on two lines. How many people hit it? How bad is it when they do?\n\nTop right first. Bottom left never.\n\nIt turns a 3-hour argument into a 20-minute decision.", "", 8300),
    ("opinion", "text", "AI won't replace designers.\n\nBut it already replaced the part of my job I liked least: making 40 versions of the same banner.\n\nThe part it can't do is sit with a frustrated customer and notice what they don't say.\n\nThat part is getting more valuable, not less.", "", 15400),
    ("story", "text", "The best feedback I ever got came from my 9-year-old niece.\n\nShe tried a banking app I'd worked on and asked: \"Why is the money hiding?\"\n\nThe balance was two taps deep. We moved it to the first screen the next sprint.", "", 13900),
    ("offer", "text", "Next Thursday I'm running a free 45-minute session: \"Fix your signup form in an afternoon\".\n\nBring a screenshot. We'll fix three of them live.\n\nRegister with the link in the comments.", "https://example.com/signup-form-session", 3100),
    ("expertise", "text", "Before you redesign anything, collect 3 numbers:\n\n1. How many people start the task.\n2. How many finish.\n3. How long it takes the ones who finish.\n\nWithout them, \"it feels better\" is the only result you'll have.", "", 7200),
    ("opinion", "text", "\"Make it pop\" is a valid piece of feedback.\n\nIt means: I can't find the important thing.\n\nTranslate it, don't mock it.", "", 12600),
    ("expertise", "carousel", "Good forms ask fewer questions.\n\nI audited 30 signup forms. Average: 9 fields. Needed on day one: 3.\n\nThe rest can wait until people trust you. Field-by-field breakdown in the carousel.", "", 10900),
    ("story", "text", "I said yes to a project I knew was wrong for me.\n\nGood money, interesting client, terrible fit.\n\nSix weeks later we were both unhappy. Saying no early is the kindest thing a freelancer can do, for both sides.", "", 9100),
    ("expertise", "text", "One thing I check on every product: can you use it with a keyboard only?\n\nTab, Enter, Space, arrows. That's it.\n\nIf you get stuck, so do millions of people who can't use a mouse. It takes 10 minutes to find out.", "", 8700),
]
DEMO_IDEAS = [("lesson", "expertise", "What a failed A/B test taught me about asking better questions"),
              ("story", "story", "The day a user cried in a usability test, and what we changed"),
              ("howto", "expertise", "My 5-minute checklist before handing designs to developers"),
              ("opinion", "opinion", "Why I stopped presenting three options to clients")]


def state():
    return C.get_setting("demo", "never")  # "never" | "loaded" | "removed"


def ensure_loaded():
    if state() == "never":
        load()


def examples_for(user, seed=11):
    """24 posted examples over the last 12 weeks, 2 scheduled ones, ideas and an analytics export. Returns the post count."""
    rnd = random.Random(seed)
    now = C.now()
    rows, top = [], []
    days = sorted(rnd.sample(range(3, 86), len(EXAMPLES)), reverse=True)
    for i, (pillar, fmt, text, comment, base) in enumerate(EXAMPLES):
        when = (now - dt.timedelta(days=days[i])).replace(hour=rnd.choice([8, 8, 9, 12, 17]), minute=rnd.choice([0, 15, 30]),
                                                          second=0, microsecond=0)
        imp = int(base * rnd.uniform(0.85, 1.15))
        rate = {"carousel": 0.045, "poll": 0.05, "text": 0.034, "image": 0.03, "video": 0.026, "article": 0.012}[fmt] * rnd.uniform(0.8, 1.2)
        reactions = int(imp * rate * 0.78)
        comments = int(imp * rate * 0.17)
        reposts = int(imp * rate * 0.05)
        url = "https://www.linkedin.com/feed/update/urn:li:activity:" + str(7200000000000000000 + i * 1311111 + seed)
        rows.append(dict(owner=user, text=text, first_comment=comment, pillar=pillar, format=fmt, status="posted", scheduled_at=None,
                         posted_at=when, url=url, li_urn="", metrics={"impressions": imp, "reactions": reactions, "comments": comments,
                                                                      "reposts": reposts, "engagements": reactions + comments + reposts},
                         carousel=None, notes="Example post (fictional).", reminded=True, created=when, updated=when, is_demo=True))
        top.append({"url": url, "date": when.date().isoformat(), "impressions": imp, "engagements": reactions + comments + reposts})
    upcoming = [("Three questions I ask before every redesign.\n\n1. What will people do differently?\n2. How will we know?\n"
                 "3. What are we not changing?\n\nThe third one saves the most money.", 2, "expertise"),
                ("A confession: I still get nervous before every client presentation.\n\nHere's the ritual that helps.", 5, "story")]
    for txt, d, pillar in upcoming:
        when = (now + dt.timedelta(days=d)).replace(hour=8, minute=30, second=0, microsecond=0)
        rows.append(dict(owner=user, text=txt, first_comment="", pillar=pillar, format="text", status="scheduled", scheduled_at=when,
                         posted_at=None, url="", li_urn="", metrics={}, carousel=None, notes="Example post (fictional).",
                         reminded=False, created=now, updated=now, is_demo=True))
    app_tables.posts.add_rows(rows)
    for kind, pillar, text in DEMO_IDEAS:
        app_tables.ideas.add_row(owner=user, text=text, kind=kind, pillar=pillar, used=False, created=now, is_demo=True)
    daily, followers = [], []
    for d in range(90, 0, -1):
        day = (now - dt.timedelta(days=d)).date()
        boost = 0
        for t in top:
            for lag, f in ((0, 0.55), (1, 0.3), (2, 0.1)):
                if t["date"] == (day - dt.timedelta(days=lag)).isoformat():
                    boost += int(t["impressions"] * f)
        imp = rnd.randint(250, 700) + boost
        daily.append({"date": day.isoformat(), "impressions": imp, "engagements": int(imp * rnd.uniform(0.02, 0.04))})
        followers.append({"date": day.isoformat(), "new": rnd.randint(2, 9) + (12 if boost > 5000 else 0)})
    data = {"daily": daily, "top": sorted(top, key=lambda t: -t["impressions"])[:50], "followers": followers,
            "followers_total": 6840, "source": "Example export (fictional)",
            "demographics": [{"category": "Job titles", "value": "Product Designer", "pct": 18.4},
                             {"category": "Job titles", "value": "Product Manager", "pct": 14.1},
                             {"category": "Job titles", "value": "Founder", "pct": 9.7},
                             {"category": "Locations", "value": "Greater Montreal", "pct": 22.3},
                             {"category": "Locations", "value": "Toronto", "pct": 11.8},
                             {"category": "Industries", "value": "Software Development", "pct": 31.5}]}
    app_tables.imports.add_row(owner=user, kind="linkedin_export", data=data, created=now - dt.timedelta(days=1), is_demo=True)
    return len(rows)


def load():
    remove(remember=False)
    for name, email in DEMO_USERS:
        u = app_tables.users.get(email=email) or app_tables.users.add_row(email=email, enabled=False)
        u.update(display_name=name, is_demo=True, signed_up=C.now() - dt.timedelta(days=120))
        app_tables.profiles.add_row(user=u, voice={"about": "Freelance UX designer in Montréal.", "audience": "SaaS founders and product teams"},
                                    pillars=[], cadence=3, reminders=False, timezone="America/Toronto", starter=True, updated=C.now())
        examples_for(u)
    C.set_setting("demo", "loaded")
    return counts()


def remove(remember=True):
    for name in ("posts", "ideas", "imports"):
        for r in getattr(app_tables, name).search(is_demo=True):
            r.delete()
    for u in app_tables.users.search(is_demo=True):
        for p in app_tables.profiles.search(user=u):
            p.delete()
        u.delete()
    if remember:
        C.set_setting("demo", "removed")
    return counts()


def counts():
    out = {"users": len(app_tables.users.search(is_demo=True))}
    for name in ("posts", "ideas", "imports"):
        out[name] = len(getattr(app_tables, name).search(is_demo=True))
    return out
