import { useEffect, useMemo, useRef, useState } from "react";

const SECTIONS = [
  { id: "profile", label: "Profile Setup", icon: "👤" },
  { id: "schedule", label: "Working Hours", icon: "🕒" },
  { id: "vacation", label: "Vacation & Closed Days", icon: "🏖️" },
  { id: "slug", label: "Your Booking Link (Slug)", icon: "🔗" },
  { id: "dog-sizing", label: "Dog Sizes & Capacity", icon: "🐶" },
  { id: "scheduling", label: "Scheduling Clients", icon: "📆" },
  { id: "confirmation", label: "Confirmations & No-Shows", icon: "✅" },
  { id: "contact", label: "Contact Support", icon: "💬" },
];

export default function Help() {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) => s.label.toLowerCase().includes(q));
  }, [query]);

  // Track active section on scroll (nice UX + highlights left nav)
  useEffect(() => {
    const ids = SECTIONS.map((s) => s.id);
    const els = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    if (!els.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        // pick the most visible intersecting entry
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))[0];

        if (visible?.target?.id) setActiveId(visible.target.id);
      },
      {
        root: null,
        // pushes detection slightly earlier so nav updates before you're fully inside a section
        rootMargin: "-20% 0px -70% 0px",
        threshold: [0.05, 0.1, 0.2, 0.35, 0.5, 0.75],
      }
    );

    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const jumpTo = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileNavOpen(false);
  };

  return (
    <div className="bg-gray-50">
      {/* MOBILE TOP BAR */}
      <div className="md:hidden sticky top-[80px] z-20 bg-white border-b">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="px-3 py-2 rounded-lg border bg-white text-sm"
          >
            {mobileNavOpen ? "Close" : "Sections"}
          </button>

          <div className="flex-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help…"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {mobileNavOpen && (
          <div className="px-4 pb-4">
            <div className="rounded-xl border bg-white overflow-hidden">
              {filteredSections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jumpTo(s.id)}
                  className={`w-full text-left px-4 py-3 text-sm border-b last:border-b-0 flex items-center gap-2 ${
                    activeId === s.id
                      ? "bg-emerald-50 text-emerald-800"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <span className="w-5">{s.icon}</span>
                  <span className="font-medium">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex">
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden md:block w-72 border-r bg-white sticky top-[80px] h-[calc(100vh-80px)] overflow-y-auto">
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase text-gray-400 tracking-wide">
                Help Center
              </h2>
              <span className="text-[11px] text-gray-400">PawScheduler</span>
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4"
            />

            <nav className="space-y-1">
              {filteredSections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jumpTo(s.id)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm transition flex items-center gap-2 ${
                    activeId === s.id
                      ? "bg-emerald-50 text-emerald-800"
                      : "text-gray-700 hover:bg-emerald-50 hover:text-emerald-700"
                  }`}
                >
                  <span className="w-5">{s.icon}</span>
                  <span className="font-medium">{s.label}</span>
                </button>
              ))}
            </nav>

            <div className="mt-6 rounded-xl border bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-800">
                Quick Start
              </div>
              <ol className="mt-2 text-sm text-gray-700 space-y-1 list-decimal ml-4">
                <li>Set profile + timezone</li>
                <li>Set working hours</li>
                <li>Share booking link</li>
              </ol>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">
          <header className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              PawScheduler Help & Setup Guide
            </h1>
            <p className="text-gray-600">
              Everything you need to get set up fast (and avoid the common gotchas).
            </p>
          </header>

          {/* PROFILE */}
          <Section
            id="profile"
            title="Profile Setup"
            subtitle="Controls how clients see your business and what shows in emails."
            bullets={[
              {
                title: "Business info",
                text:
                  "Name, business name, phone, email — used in confirmations and reminders.",
              },
              {
                title: "Logo",
                text:
                  "Shows on your booking page and automated emails (adds trust immediately).",
              },
              {
                title: "Time zone",
                text:
                  "Make this correct first. Wrong timezone = wrong appointment times.",
                tone: "warn",
              },
              {
                title: "Pro tip",
                text:
                  "Add a short client note like: “Please arrive 5 minutes early and ensure your pet has gone potty.”",
              },
            ]}
          />

          {/* HOURS */}
          <Section
            id="schedule"
            title="Working Hours"
            subtitle="Your booking link uses these hours to show availability."
            bullets={[
              { title: "Set weekly availability", text: "Choose days and start/end times." },
              {
                title: "Breaks",
                text:
                  "Add lunch/buffers so clients can’t book over them.",
              },
              {
                title: "Stress reducer",
                text:
                  "Add a 15–30 min buffer at the start/end of day to stay on schedule.",
              },
              {
                title: "Common mistake",
                text:
                  "Forgetting to adjust for holiday weeks. Update hours anytime.",
                tone: "warn",
              },
            ]}
          />

          {/* VACATION */}
          <Section
            id="vacation"
            title="Vacation & Closed Days"
            subtitle="Blocks entire days so they disappear from your booking calendar."
            bullets={[
              { title: "Block days off", text: "Vacations, appointments, family events." },
              { title: "Edit anytime", text: "Delete or change blocked days whenever needed." },
              {
                title: "Pro tip",
                text:
                  "Block a “prep day” after holidays if you tend to get slammed.",
              },
            ]}
          />

          {/* SLUG */}
          <Section
            id="slug"
            title="Your Booking Link (Slug)"
            subtitle="This is the link you share with clients to self-book."
            custom={
              <div className="space-y-3">
                <p className="text-sm text-gray-700">
                  Example: slug <code className="px-1 py-0.5 rounded bg-gray-100">sally</code>
                  {" "}→{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100">
                    https://app.pawscheduler.app/book/sally
                  </code>
                </p>
                <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
                  <div className="font-semibold text-gray-900 mb-1">Where to share it</div>
                  <div className="flex flex-wrap gap-2">
                    <span className="pill">Instagram bio</span>
                    <span className="pill">Google Business</span>
                    <span className="pill">Text message</span>
                    <span className="pill">Printed card</span>
                  </div>
                </div>
                <p className="text-sm text-gray-700">
                  <strong>Pro tip:</strong> Keep it short and memorable.
                </p>
              </div>
            }
          />

          {/* CAPACITY */}
          <Section
            id="dog-sizing"
            title="Dog Sizes & Capacity"
            subtitle="Prevents overbooking by using simple capacity units."
            custom={
              <div className="space-y-3 text-sm text-gray-700">
                <p>
                  Assign pets a size. PawScheduler converts size to <strong>capacity units</strong>.
                </p>

                <div className="grid md:grid-cols-2 gap-3">
                  <div className="rounded-xl border bg-white p-4">
                    <div className="font-semibold text-gray-900 mb-2">Example units</div>
                    <ul className="list-disc ml-5 space-y-1">
                      <li>Small = 1</li>
                      <li>Medium = 1</li>
                      <li>Large = 2</li>
                      <li>XL = 3</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border bg-emerald-50 p-4">
                    <div className="font-semibold text-emerald-900 mb-2">
                      If your day capacity = 3
                    </div>
                    <ul className="list-disc ml-5 space-y-1 text-emerald-900/90">
                      <li>One XL fills the day</li>
                      <li>One Large + one Small fits</li>
                      <li>Three Smalls fits</li>
                    </ul>
                  </div>
                </div>

                <p>
                  <strong>Pro tip:</strong> Great for multi-dog households — capacity is checked automatically.
                </p>
              </div>
            }
          />

          {/* SCHEDULING */}
          <Section
            id="scheduling"
            title="Scheduling Clients"
            subtitle="Add appointments fast from wherever you are in the app."
            bullets={[
              {
                title: "Create appointments from anywhere",
                text:
                  "Clients, Pets, or the Schedule page — whichever is fastest.",
              },
              {
                title: "Set the essentials",
                text:
                  "Pet, services, start time, duration, and notes.",
              },
              {
                title: "Quick rebook",
                text:
                  "Rebook in one tap after checkout (helps repeat business).",
              },
              {
                title: "Smart alerts",
                text:
                  "Use tags like “Bites” or “Anxious” so you see warnings when rebooking.",
              },
            ]}
          />

          {/* CONFIRMATIONS */}
          <Section
            id="confirmation"
            title="Confirmations & No-Shows"
            subtitle="Track who confirmed and who flakes—without extra admin work."
            bullets={[
              {
                title: "Confirmations",
                text:
                  "Mark confirmed manually (and later via client email confirmations).",
              },
              {
                title: "Reminders",
                text:
                  "Emails include time, details, and your branding.",
              },
              {
                title: "No-shows",
                text:
                  "Tracked separately for reporting and revenue tracking.",
              },
              {
                title: "Best practice",
                text:
                  "After 2 no-shows, many groomers require deposits.",
                tone: "warn",
              },
            ]}
          />

          {/* CONTACT */}
          <Section
            id="contact"
            title="Contact Support"
            subtitle="Send a message and include as much detail as possible."
            custom={<ContactForm />}
          />

          <div className="pb-10" />
        </main>
      </div>
    </div>
  );
}

function Section({ id, title, subtitle, bullets, custom }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 md:px-6 py-4 border-b bg-gradient-to-b from-white to-gray-50">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
        </div>

        <div className="p-5 md:p-6">
          {custom ? (
            custom
          ) : (
            <ul className="space-y-3">
              {(bullets || []).map((b, idx) => (
                <li key={idx} className="flex gap-3">
                  <div
                    className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center text-xs ${
                      b.tone === "warn"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                    aria-hidden="true"
                  >
                    {b.tone === "warn" ? "!" : "✓"}
                  </div>
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold text-gray-900">{b.title}:</span>{" "}
                    {b.text}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle");

  const [errorMsg, setErrorMsg] = useState("");

  const canSubmit =
    name.trim().length >= 2 &&
    email.trim().length >= 5 &&
    message.trim().length >= 10 &&
    status !== "sending";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setStatus("sending");

    try {
      const res = await fetch("/.netlify/functions/contactSupport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
          page: "/help",
          created_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Request failed");
      }

      setStatus("success");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        "Something went wrong sending your message. Please try again (or email pawscheduler@gmail.com)."
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Your Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded-xl px-3 py-2"
            placeholder="Sally Groomer"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Your Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-xl px-3 py-2"
            placeholder="you@company.com"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Message</label>
        <textarea
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          className="w-full border rounded-xl px-3 py-2"
          placeholder="What were you trying to do? What happened? Any screenshots?"
        />
        <div className="mt-1 text-xs text-gray-500">
          Tip: include the client/pet name (if relevant) and what device you’re on.
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className={`px-4 py-2 rounded-xl text-white ${
            canSubmit ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-300"
          }`}
        >
          {status === "sending" ? "Sending…" : "Send Message"}
        </button>

        {status === "success" && (
          <span className="text-sm text-emerald-700">✅ Sent! We’ll reply soon.</span>
        )}
        {status === "error" && (
          <span className="text-sm text-red-600">❌ Failed to send.</span>
        )}
      </div>

      {errorMsg && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
          {errorMsg}
        </div>
      )}
    </form>
  );
}

/* Small utility pill class (uses Tailwind) */
