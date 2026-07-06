// src/pages/Help.jsx
import { useEffect, useMemo, useState } from "react";

const SECTIONS = [
  { id: "quickstart",    label: "Quick Start",              icon: "🚀", badge: "Start here" },
  { id: "profile",       label: "Profile Setup",            icon: "👤" },
  { id: "booking-page",  label: "Booking Page & Themes",    icon: "🎨" },
  { id: "booking-toggle",label: "Online Booking Toggle",    icon: "🟢" },
  { id: "schedule",      label: "Working Hours",            icon: "🕒" },
  { id: "vacation",      label: "Time Blocks & Closed Days",icon: "🏖️" },
  { id: "slug",          label: "Booking Link",             icon: "🔗" },
  { id: "dog-sizing",    label: "Dog Sizes & Capacity",     icon: "🐶" },
  { id: "pricing",       label: "Services, Add-ons & Fees", icon: "💲" },
  { id: "default-price", label: "Per-Pet Default Pricing",  icon: "🏷️" },
  { id: "duration",      label: "Service Durations",        icon: "⏱️" },
  { id: "clients",       label: "Clients & Pets",           icon: "🐾" },
  { id: "birthday",      label: "Birthday & Age Tracking",  icon: "🎂" },
  { id: "pet-photos",    label: "Pet Photos",               icon: "📷" },
  { id: "intake",        label: "Intake Form",              icon: "📋" },
  { id: "waiver",        label: "Grooming Waiver",          icon: "✍️" },
  { id: "scheduling",    label: "Scheduling Appointments",  icon: "📆" },
  { id: "recurring",     label: "Recurring Appointments",   icon: "🔁" },
  { id: "calendar-views",label: "Calendar Views",           icon: "📅" },
  { id: "multipet",      label: "Multi-Pet Bookings",       icon: "🐕‍🦺" },
  { id: "sms-inbox",     label: "SMS Inbox (Two-Way)",      icon: "💬" },
  { id: "reminders",     label: "SMS Reminders",            icon: "📱" },
  { id: "confirmations", label: "SMS Confirmations",        icon: "✅" },
  { id: "push-notif",    label: "Push Notifications",       icon: "🔔" },
  { id: "vaccines",      label: "Vaccine Tracking",         icon: "💉" },
  { id: "checkin",       label: "Check In / Check Out",     icon: "🟦" },
  { id: "payment-flow",  label: "Taking Payment",           icon: "💵" },
  { id: "noshow",        label: "No-Shows & Confirmed",     icon: "📌" },
  { id: "revenue",       label: "Revenue & Unpaid",         icon: "💰" },
  { id: "onboarding",    label: "Onboarding Tour",          icon: "🎓" },
  { id: "darkmode",      label: "Dark Mode",                icon: "🌙" },
  { id: "contact",       label: "Contact Support",          icon: "✉️" },
];

export default function Help() {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter(
      (s) => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    const ids = SECTIONS.map((s) => s.id);
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))[0];
        if (visible?.target?.id) setActiveId(visible.target.id);
      },
      { root: null, rootMargin: "-20% 0px -70% 0px", threshold: [0.05, 0.1, 0.2, 0.35, 0.5] }
    );

    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const jumpTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
            className="px-3 py-2 rounded-lg border bg-white text-sm font-medium"
          >
            {mobileNavOpen ? "Close" : "Sections ☰"}
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help…"
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        {mobileNavOpen && (
          <div className="px-4 pb-4">
            <div className="rounded-xl border bg-white overflow-hidden divide-y">
              {filteredSections.map((s) => (
                <button key={s.id} type="button" onClick={() => jumpTo(s.id)}
                  className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${
                    activeId === s.id ? "bg-emerald-50 text-emerald-800" : "hover:bg-gray-50"
                  }`}
                >
                  <span className="w-5">{s.icon}</span>
                  <span className="font-medium">{s.label}</span>
                  {s.badge && (
                    <span className="ml-auto text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                      {s.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex">
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden md:block w-72 border-r bg-white sticky top-[80px] h-[calc(100vh-80px)] overflow-y-auto shrink-0">
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase text-gray-400 tracking-wide">Help Center</h2>
              <span className="text-[11px] text-gray-400">PawScheduler</span>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search… (intake, waiver, reminders…)"
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4"
            />
            <nav className="space-y-0.5">
              {filteredSections.map((s) => (
                <button key={s.id} type="button" onClick={() => jumpTo(s.id)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm transition flex items-center gap-2 ${
                    activeId === s.id
                      ? "bg-emerald-50 text-emerald-800 font-semibold"
                      : "text-gray-700 hover:bg-emerald-50 hover:text-emerald-700"
                  }`}
                >
                  <span className="w-5 text-base">{s.icon}</span>
                  <span>{s.label}</span>
                  {s.badge && (
                    <span className="ml-auto text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                      {s.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 min-w-0">
          <header className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              PawScheduler Help & Setup Guide
            </h1>
            <p className="text-gray-600">
              Everything you need to get up and running — and get the most out of every feature.
            </p>
          </header>

          {/* ── QUICK START ── */}
          <Section id="quickstart" title="🚀 Quick Start — Do These First" subtitle="New to PawScheduler? Follow these steps in order and you'll be ready in under 10 minutes.">
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3">
                {[
                  { step: "1", title: "Set up your profile", desc: "Add your business name, logo, and timezone. Wrong timezone = wrong appointment times.", action: "Go to Profile → Profile tab", warn: true },
                  { step: "2", title: "Set your working hours", desc: "Pick which days you work and your start/end times. Add breaks for lunch or buffer time.", action: "Go to Profile → Schedule tab" },
                  { step: "3", title: "Set your service pricing", desc: "Set your prices once by service and dog size — they auto-fill every time you book.", action: "Go to Profile → Pricing tab" },
                  { step: "4", title: "Add your first client", desc: "Go to Clients → Quick Add. Enter their name and at least one dog.", action: "Go to Clients → Quick Add" },
                  { step: "5", title: "Book your first appointment", desc: "Go to Schedule, tap an open time slot, pick the pet, select services, and save.", action: "Go to Schedule → tap a slot" },
                  { step: "6", title: "Send intake + waiver", desc: "From the Clients page, send the new client an intake form and waiver to sign before their first visit.", action: "Clients page → Send Intake / Send Waiver" },
                ].map(({ step, title, desc, action, warn }) => (
                  <div key={step} className={`rounded-xl border p-4 space-y-1.5 ${warn ? "border-amber-200 bg-amber-50" : "bg-white"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${warn ? "bg-amber-500" : "bg-emerald-500"}`}>
                        {step}
                      </span>
                      <span className="font-semibold text-gray-900 text-sm">{title}</span>
                    </div>
                    <p className="text-sm text-gray-600">{desc}</p>
                    <p className={`text-xs font-semibold ${warn ? "text-amber-700" : "text-emerald-700"}`}>→ {action}</p>
                  </div>
                ))}
              </div>
              <Callout type="info" title="You don't need to use every feature on day one.">
                Start with steps 1–5 and you'll have a working scheduling setup. Add intake forms, waivers, and vaccine tracking as you go.
              </Callout>
            </div>
          </Section>

          {/* ── PROFILE ── */}
          <Section id="profile" title="Profile Setup" subtitle="Controls how clients see your business and what appears in emails and confirmations.">
            <div className="space-y-4 text-sm text-gray-700">
              <BulletList items={[
                { title: "Business name & bio", text: "What shows on your booking page, emails, and waiver. The bio appears below your name on the public booking page." },
                { title: "Logo", text: "Upload a logo and it shows on your booking page, intake form, waiver, and reminder emails. Square images work best." },
                { title: "Time zone", text: "Set this first — incorrect timezone means appointment times will be off in reminders and the nightly reminder function.", tone: "warn" },
                { title: "Booking slug", text: 'Your public booking URL. Example: slug "sally" → app.pawscheduler.app/book/sally. Keep it short and easy to remember.' },
                { title: "Booking approval toggle", text: "Turn this on to require you to manually approve every booking before it's confirmed. Off by default." },
                { title: "Max dogs at once", text: "Found in the SMS Bot tab. Controls how many dogs can be booked at the same time slot." },
              ]} />
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">Profile tabs</p>
                <div className="grid md:grid-cols-2 gap-2 text-sm">
                  {[
                    ["👤 Profile", "Name, bio, logo, slug, timezone, booking approval"],
                    ["🎨 Booking Page", "Theme picker, waiver intro text, booking link copy"],
                    ["🗓 Schedule", "Working hours and break times"],
                    ["💲 Pricing", "Services, add-ons, fees, and per-service durations"],
                    ["🔔 Reminders", "SMS reminder templates and timing rules (Basic+)"],
                    ["💳 Payments", "Stripe Connect for client payments (Pro)"],
                    ["📋 Intake", "Custom intake questions and waiver text (Growth+)"],
                    ["💬 SMS Bot", "AI scheduling bot toggle and limits (Pro)"],
                  ].map(([tab, desc]) => (
                    <div key={tab} className="flex gap-2">
                      <span className="font-semibold text-gray-900 whitespace-nowrap">{tab}:</span>
                      <span className="text-gray-600">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* ── BOOKING PAGE & THEMES ── */}
          <Section id="booking-page" title="🎨 Booking Page & Themes" subtitle="Customize the look of your public booking page that clients see.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">Choosing a theme</p>
                <p>Go to <strong>Profile → Booking Page tab</strong>. You'll see 8 color themes — tap one to preview it, then tap Save Changes.</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {["Forest", "Ocean", "Lavender", "Rose", "Sunrise", "Slate", "Blush", "Mint"].map(t => (
                    <span key={t} className="px-3 py-1 rounded-full bg-white border text-xs font-medium text-gray-700">{t}</span>
                  ))}
                </div>
              </div>
              <BulletList items={[
                { title: "What changes", text: "The gradient header, accent color, and button color on your public booking page all change to match the theme." },
                { title: "Waiver intro text", text: "Also on this tab — add a personal note that appears at the top of your waiver before the standard legal sections. Good for your cancellation policy, late fees, or a welcome message.", tone: "tip" },
                { title: "Booking link", text: "Your full booking URL is shown here with a one-tap Copy button. This is what you share with clients." },
              ]} />
            </div>
          </Section>

          {/* ── ONLINE BOOKING TOGGLE ── */}
          <Section id="booking-toggle" title="🟢 Online Booking Toggle" subtitle="Instantly open or close your booking page without deleting your link or changing any settings.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">How to toggle booking on or off</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Go to <strong>Profile → Booking Page tab</strong></li>
                  <li>At the very top of the tab, there's a large green or red status card</li>
                  <li>Tap the toggle switch — it saves <strong>immediately</strong>, no Save button needed</li>
                  <li>Green = open, Red = closed</li>
                </ol>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="font-semibold text-emerald-900 mb-1">🟢 When booking is open</p>
                  <p className="text-emerald-900/80">Clients can visit your booking link and book appointments normally.</p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="font-semibold text-red-900 mb-1">🔴 When booking is closed</p>
                  <p className="text-red-900/80">Clients see a branded closed page with your business name, a message saying you're not accepting bookings online, and a Call Us button (if you have a business phone saved).</p>
                </div>
              </div>
              <BulletList items={[
                { title: "Saves instantly", text: "No Save button needed — the toggle fires a database update immediately when you tap it." },
                { title: "Closed page is branded", text: "The closed page uses your theme color and logo so it still looks professional. Clients aren't left staring at a 404." },
                { title: "Your link stays the same", text: "Turning booking off doesn't change or break your booking URL. Turn it back on and everything works exactly as before.", tone: "tip" },
                { title: "Common use case", text: "If you get fully booked for a period, flip it off. When you're ready to take new bookings, flip it back on. One tap each way.", tone: "tip" },
              ]} />
            </div>
          </Section>

          {/* ── WORKING HOURS ── */}
          <Section id="schedule" title="Working Hours" subtitle="Your schedule controls which days and times appear as available on the booking page.">
            <div className="space-y-4 text-sm text-gray-700">
              <BulletList items={[
                { title: "Toggle days on/off", text: "Use the toggle switch on each day. Closed days are grayed out and collapsed automatically." },
                { title: "Start and end times", text: "Choose from 15-minute increments (5am–9pm) using a friendly dropdown — no typing required." },
                { title: "Breaks", text: "Add lunch or buffer breaks. Break times are blocked on your booking page so clients can't schedule over them." },
                { title: "Copy day shortcut", text: 'Set one day\'s hours, then tap "Mon", "Tue", etc. to copy those exact hours (and breaks) to another day. Tap "All days" to apply everywhere at once.' },
              ]} />
              <Callout type="tip" title="Add a 15–30 min buffer at the end of the day.">
                It helps you stay on schedule and gives you time to clean up between clients.
              </Callout>
              <Callout type="warn" title="Remember to update hours for holiday weeks.">
                Working hours don't auto-adjust for holidays. Block those days in Vacation & Closed Days instead.
              </Callout>
            </div>
          </Section>

          {/* ── VACATION / TIME BLOCKS ── */}
          <Section id="vacation" title="Time Blocks & Closed Days" subtitle="Block specific dates or times from your schedule — viewable and editable from both calendar and list view.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">Two ways to add a time block</p>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="rounded-xl border bg-white p-3">
                    <p className="font-semibold text-gray-900 mb-1">From Month view</p>
                    <p className="text-gray-600">Tap any day → tap <strong>Add Time Block</strong> → choose All Day or set a time range → add a note (e.g. "Vet appointment") → Save.</p>
                  </div>
                  <div className="rounded-xl border bg-white p-3">
                    <p className="font-semibold text-gray-900 mb-1">From Profile → Schedule</p>
                    <p className="text-gray-600">The VacationSection lets you add closed days or partial blocks from your profile settings. Good for planning ahead.</p>
                  </div>
                </div>
              </div>
              <BulletList items={[
                { title: "All Day blocks", text: "The entire day is blocked — clients can't book, and the day shows as unavailable on your booking page." },
                { title: "Partial time blocks", text: "Set a specific start and end time (e.g. 8am–12pm) to block just part of a day." },
                { title: "Edit a block", text: "In List view on the day of the block, tap Edit on the block card. Change the time range, toggle All Day on/off, or update the note." },
                { title: "Delete a block", text: "Tap Delete on the block card in List view. Removes it immediately — the slot reopens for booking.", tone: "tip" },
                { title: "Recurring weekly breaks", text: "Set in Profile → Schedule tab (like a lunch break every day). These show a 'Recurring' badge in List view — edit them from Profile, not from the Schedule page." },
                { title: "Month view auto-updates", text: "Adding, editing, or deleting a block instantly refreshes the month grid — no page reload needed.", tone: "tip" },
              ]} />
            </div>
          </Section>

          {/* ── SLUG ── */}
          <Section id="slug" title="Your Booking Link" subtitle="Share this link with clients so they can view availability and book online.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-1">How it works</p>
                <p>Your slug is a short word that makes your link unique. Example:</p>
                <p className="mt-2 font-mono text-emerald-700 text-xs bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  app.pawscheduler.app/book/<strong>sally</strong>
                </p>
              </div>
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">Where to share it</p>
                <div className="flex flex-wrap gap-2">
                  {["Instagram bio", "Google Business", "Facebook page", "Text message", "Email signature", "Printed business card"].map((p) => (
                    <span key={p} className="px-3 py-1 rounded-full bg-white border text-xs font-medium text-gray-700">{p}</span>
                  ))}
                </div>
              </div>
              <Callout type="warn" title="Clients need to verify their identity to book.">
                When a client opens your booking link they must enter their name + last 4 digits of their phone number. This prevents random people from booking on your calendar. Make sure their phone number is saved correctly in the system.
              </Callout>
            </div>
          </Section>

          {/* ── DOG SIZING ── */}
          <Section id="dog-sizing" title="Dog Sizes & Capacity" subtitle="PawScheduler uses a 4-tier size system — pricing and booking capacity are tracked separately.">
            <div className="space-y-4 text-sm text-gray-700">
              <p>Each pet has a size category that controls two independent things: <strong>pricing</strong> (which price tier to use) and <strong>capacity</strong> (how many booking slots they occupy). Small and Medium both occupy the same number of slots but can have completely different prices.</p>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-xl border bg-white p-4">
                  <p className="font-semibold text-gray-900 mb-2">4 size tiers</p>
                  <ul className="space-y-1.5">
                    {[
                      ["Small",  "1 slot", "e.g. Chihuahua, Pomeranian"],
                      ["Medium", "1 slot", "e.g. Cocker Spaniel, Shih Tzu"],
                      ["Large",  "2 slots","e.g. Golden Retriever, Labrador"],
                      ["XL",     "3 slots","e.g. Great Dane, Malamute"],
                    ].map(([size, slots, example]) => (
                      <li key={size} className="flex justify-between items-start text-sm gap-2">
                        <div>
                          <span className="font-semibold">{size}</span>
                          <span className="text-gray-400 text-xs ml-1">— {example}</span>
                        </div>
                        <span className="font-semibold text-emerald-700 whitespace-nowrap">{slots}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-gray-500 mt-3">Small and Medium both use 1 booking slot but can have different prices.</p>
                </div>
                <div className="rounded-xl border bg-emerald-50 p-4">
                  <p className="font-semibold text-emerald-900 mb-2">Example with capacity = 2</p>
                  <ul className="space-y-1 text-emerald-900/90 text-sm">
                    <li>✓ One Large dog fills both slots</li>
                    <li>✓ Two Small/Medium dogs fit</li>
                    <li>✓ One Small + one Medium fits</li>
                    <li>✗ One Large + one Small = 3 slots, blocked</li>
                    <li>✗ One XL = 3 slots, blocked</li>
                  </ul>
                </div>
              </div>
              <Callout type="tip" title="Small and Medium are separate for a reason.">
                A groomer might charge $45 for a Cocker Spaniel (Medium) and $30 for a Chihuahua (Small) — same time slot used, different price. Set both in Profile → Pricing.
              </Callout>
              <Callout type="info" title="Set max capacity in Profile → SMS Bot tab.">
                This controls how many dogs can occupy the same time slot. For mobile groomers who do one dog at a time, set this to 1.
              </Callout>
            </div>
          </Section>

          {/* ── PRICING ── */}
          <Section id="pricing" title="💲 Services, Add-ons & Fees" subtitle="Set your rates once — they auto-fill every time you create an appointment.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">How it works</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Go to <strong>Profile → Pricing tab</strong> and set your prices by service and size.</li>
                  <li>Each pet has a size saved on their profile (S/M, Large, XL).</li>
                  <li>When you create an appointment and check services, the amount auto-fills by summing prices for each service at that pet's size.</li>
                  <li>Override anytime — just type a different number in the amount field.</li>
                </ol>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-xl border bg-emerald-50 p-4">
                  <p className="font-semibold text-emerald-900 mb-2">Example</p>
                  <ul className="space-y-1 text-emerald-900/90 text-sm">
                    <li>Full Groom (Large) = $65</li>
                    <li>Nails (Large) = $15</li>
                    <li className="font-bold border-t border-emerald-200 pt-1 mt-1">Auto-total: $80</li>
                  </ul>
                </div>
                <div className="rounded-xl border bg-white p-4">
                  <p className="font-semibold text-gray-900 mb-2">Default prices</p>
                  <ul className="text-xs text-gray-600 space-y-0.5">
                    {[["Bath", "$25 / $40 / $60"], ["Full Groom", "$45 / $65 / $90"], ["Nails", "$15 / $15 / $20"], ["Deshed", "$35 / $55 / $75"], ["Teeth / Anal Glands", "$15 / $15 / $20"]].map(([svc, price]) => (
                      <li key={svc} className="flex justify-between">
                        <span>{svc}</span><span className="font-medium">{price}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <Callout type="warn" title="If pricing auto-fills incorrectly, check the pet's size first.">
                The auto-calculation uses the pet's saved size. Fix the size on their pet profile and the pricing will be correct going forward.
              </Callout>
              <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
                <p className="font-semibold text-gray-900">Add-ons (client-selectable)</p>
                <BulletList items={[
                  { title: "What they are", text: "Flat-fee extras that clients can select on the booking page — like a blueberry facial or bandana. Each has a fixed price regardless of dog size." },
                  { title: "Where to set them", text: "Profile → Pricing tab → Add-ons section. Give each one a name, price, and optional description." },
                  { title: "Booking page", text: "Add-ons appear in purple on the public booking page. Clients check them and the price is added to their total automatically." },
                  { title: "Schedule view", text: "Add-ons appear alongside services when you view or edit an appointment.", tone: "tip" },
                ]} />
              </div>
              <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
                <p className="font-semibold text-gray-900">Fees (groomer-only)</p>
                <BulletList items={[
                  { title: "What they are", text: "Charges you apply manually — like a late cancellation fee or dematting surcharge. Clients never see these on the booking page." },
                  { title: "Where to set them", text: "Profile → Pricing tab → Fees section." },
                  { title: "When to use", text: "Apply fees from inside the appointment modal when you're creating or editing an appointment.", tone: "tip" },
                ]} />
              </div>
            </div>
          </Section>

          {/* ── PER-PET DEFAULT PRICING ── */}
          <Section id="default-price" title="🏷️ Per-Pet Default Pricing" subtitle="Set a fixed default price on any pet's profile — overrides size-based pricing automatically when you book them.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">When to use this</p>
                <p>Some dogs don't fit neatly into size-based pricing. A Wooly Husky might always be priced like a Malamute. A rescue mix might always be $85 regardless of what services you do. Default price lets you set it once and forget it.</p>
              </div>
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">How to set it</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Go to <strong>Clients → View Client → pet card → ✏️ Edit</strong></li>
                  <li>Scroll down to the <strong>Default Price</strong> field (below Default Duration)</li>
                  <li>Enter the dollar amount, e.g. <strong>$90.00</strong></li>
                  <li>Tap <strong>Update Pet</strong> to save</li>
                </ol>
                <p className="text-gray-500 text-xs mt-2">You can also set it when adding a new pet via Clients → Add Pet.</p>
              </div>
              <div className="rounded-xl border bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-900 mb-2">How it works when booking</p>
                <ul className="space-y-1 text-emerald-900/90">
                  <li>✓ Book an appointment for the pet — the Amount field pre-fills with their default price</li>
                  <li>✓ Selecting or deselecting services updates the service list but <strong>does not change the amount</strong></li>
                  <li>✓ You can still override it manually — just type a different number in the Amount field</li>
                </ul>
              </div>
              <BulletList items={[
                { title: "Overrides size pricing", text: "If a pet has a default price set, it takes priority over any service + size calculation." },
                { title: "Services still tracked", text: "You can still check which services were done for record-keeping — they just won't change the price.", tone: "tip" },
                { title: "Still editable per appointment", text: "Default price is just a starting point. Change it anytime on any individual appointment without affecting the pet's default." },
                { title: "Shows on pet card", text: "Pet cards in the client profile show a 💵 chip with the default price so you can see it at a glance without opening edit.", tone: "tip" },
              ]} />
            </div>
          </Section>

          {/* ── SERVICE DURATIONS ── */}
          <Section id="duration" title="⏱️ Service Durations" subtitle="Set how long each service takes — appointment duration auto-fills when you select services.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">How to set durations</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Go to <strong>Profile → Pricing tab</strong></li>
                  <li>Each service card now has a <strong>⏱ Duration</strong> dropdown at the bottom</li>
                  <li>Set the duration for each service (15 min up to 8 hours)</li>
                  <li>Tap <strong>Save Services & Pricing</strong></li>
                </ol>
              </div>
              <div className="rounded-xl border bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-900 mb-2">Auto-calculation example</p>
                <ul className="space-y-1 text-emerald-900/90">
                  <li>Full Groom = 2h duration</li>
                  <li>Nails = 30 min duration</li>
                  <li className="font-bold border-t border-emerald-200 pt-1 mt-1">Select both → Duration auto-fills to 2h 30m ⚡</li>
                </ul>
              </div>
              <BulletList items={[
                { title: "Auto badge", text: "When duration is auto-calculated, a green ⚡ auto badge appears next to the Duration field so you know it was set automatically." },
                { title: "Always editable", text: "The auto-fill is just a starting point — change it manually any time if this particular dog takes longer or shorter." },
                { title: "Stacks correctly", text: "If you select 3 services, the durations for all 3 are summed. Only services with a duration set contribute to the total.", tone: "tip" },
                { title: "Creative grooms", text: "Duration options go up to 8 hours — plenty of room for creative grooms and full-day spa treatments.", tone: "tip" },
                { title: "Per-dog defaults", text: "You can also set default services on a pet's profile — when you book that pet, services pre-fill and the duration auto-calculates from them automatically." },
              ]} />
            </div>
          </Section>

          {/* ── CLIENTS & PETS ── */}
          <Section id="clients" title="Clients & Pets" subtitle="Your client list is the foundation of everything else in PawScheduler.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
                <p className="font-semibold text-gray-900">Adding clients</p>
                <BulletList items={[
                  { title: "Quick Add", text: "Tap the Quick Add button on the Clients page. Enter a name and at least one dog. You can fill in phone, email, and address later." },
                  { title: "Add Pet", text: "Each client card has an ➕ Add Pet button that opens a modal right there — no page navigation needed. Set the dog's name, breed, size, tags, and default services." },
                  { title: "View Client", text: "Opens the full client profile where you can edit their address, emergency contact, and all their pet details." },
                ]} />
              </div>
              <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
                <p className="font-semibold text-gray-900">Pet profiles</p>
                <BulletList items={[
                  { title: "Tags", text: 'Use tags like "Bites", "Anxious", "Senior", or "Matting" — these show as warnings when you open an appointment so you\'re never caught off guard.' },
                  { title: "Default services & duration", text: "Set the services and duration you always do for a specific dog. When you book them next time, everything pre-fills automatically." },
                  { title: "Shot records", text: "Track Rabies, Bordetella, DHPP, and other vaccines with expiration dates. The Schedule page shows vaccine warnings when booking." },
                  { title: "Emergency contact", text: "Stored on the client profile under the address fields. Shows on the client card for quick reference." },
                ]} />
              </div>
              <div className="rounded-xl border bg-gray-50 p-4 space-y-2">
                <p className="font-semibold text-gray-900">Search</p>
                <p>The search bar on the Clients page searches across client name, pet name, phone, email, and address all at once.</p>
              </div>
            </div>
          </Section>

          {/* ── BIRTHDAY & AGE ── */}
          <Section id="birthday" title="🎂 Birthday & Age Tracking" subtitle="Store each pet's birthday and PawScheduler calculates their age automatically.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">How to add a birthday</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Go to <strong>Clients → View Client → pet card → ✏️ Edit</strong></li>
                  <li>Below the Breed field, tap the <strong>Birthday</strong> date picker</li>
                  <li>Select the date from the calendar (optional — leave blank if unknown)</li>
                  <li>Tap <strong>Update Pet</strong> to save</li>
                </ol>
              </div>
              <div className="rounded-xl border bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-900 mb-1">What you see on the pet card</p>
                <p className="text-emerald-900/80">Once a birthday is saved, the pet card shows: <strong>🎂 Jul 4 · 3 yrs 2 mo old</strong></p>
                <p className="text-emerald-900/80 mt-1">The age updates automatically every time you view it — no manual updates needed.</p>
              </div>
              <BulletList items={[
                { title: "Exact age shown", text: "Age is displayed in years and months (e.g. '2 yrs 8 mo old'). For puppies under a year it shows months only (e.g. '7 mo old')." },
                { title: "Always current", text: "Calculated live from today's date — if it's the dog's birthday, you'll see it immediately.", tone: "tip" },
                { title: "Useful for senior dogs", text: "Makes it easy to spot dogs approaching 7+ years when you might want to start using your senior pet waiver language.", tone: "tip" },
                { title: "Approximate is fine", text: "For rescue dogs where the exact birthday isn't known, pick the approximate month and year — even a rough age is useful." },
              ]} />
            </div>
          </Section>

          {/* ── PET PHOTOS ── */}
          <Section id="pet-photos" title="📷 Pet Photos" subtitle="Upload photos for each pet — they show on appointment cards and tap to view full screen.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">How to upload a photo</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Go to <strong>Clients → View Client</strong></li>
                  <li>Find the pet's card and tap <strong>✏️ Edit</strong> (top-right of the card)</li>
                  <li>Tap <strong>Set main photo</strong> or <strong>+ Add photo</strong> in the edit modal</li>
                  <li>Pick a photo from your camera roll or files</li>
                  <li>A preview appears — tap <strong>Update Pet</strong> to save</li>
                </ol>
              </div>
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">Viewing photos full screen</p>
                <ul className="space-y-1.5">
                  <li><strong>From Schedule grid view</strong> — tap the small circle photo on a mini appointment card → the photo opens full screen with a dark backdrop</li>
                  <li><strong>From Schedule list view</strong> — tap the circle photo next to the pet's name → full screen view</li>
                  <li><strong>From the edit modal</strong> — tap the circle photo in the top-right of the appointment modal header → full screen view</li>
                  <li><strong>From the client profile</strong> — tap any pet photo or gallery thumbnail → full screen view</li>
                </ul>
                <p className="text-xs text-gray-500 mt-2">Tap anywhere outside the photo or the ✕ button to close the full screen view.</p>
              </div>
              <BulletList items={[
                { title: "Auto-compressed", text: "Photos are resized and compressed automatically before uploading — a 4MB phone photo becomes ~60-80KB. Saves storage and loads fast." },
                { title: "Multiple photos per pet", text: "Add additional photos using the + Add photo button. The first photo is the 'main' photo shown on appointment cards." },
                { title: "Main vs gallery", text: "The main photo shows on Schedule cards. All photos appear in the gallery on the pet card in the client profile." },
                { title: "Lazy loaded", text: "Photos only load when the card scrolls into view — zero bandwidth cost for off-screen appointments.", tone: "tip" },
                { title: "Separate from the client photo", text: "You can also upload a profile photo for the client themselves (not just the pets) from the client detail page.", tone: "tip" },
              ]} />
            </div>
          </Section>

          {/* ── INTAKE FORM ── */}
          <Section id="intake" title="Client Intake Form" subtitle="A public form new clients fill out before their first appointment — automatically creates their profile.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">What it captures</p>
                <div className="grid md:grid-cols-2 gap-2">
                  {["Full name, phone, email", "Home address", "Emergency contact name & phone", "Dog name and breed", "Dog size", "Behavioral tags (Bites, Anxious, etc.)", "Additional notes about the dog", "Custom questions you've added"].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm">
                      <span className="text-emerald-500">✓</span> {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">How to send it</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Go to the <strong>Clients page</strong></li>
                  <li>Find the client and tap <strong>📋 Send Intake</strong></li>
                  <li>If they have an email on file → sends them a branded email with a button link</li>
                  <li>If no email → copies the link to your clipboard so you can text it manually</li>
                  <li>The link includes their client ID so the form <strong>pre-fills</strong> with their name, phone, address, and all their pets</li>
                </ol>
              </div>
              <Callout type="info" title="Waiver appears automatically after intake.">
                When a client submits the intake form, the grooming waiver appears inline on the same page — no separate link needed. They can sign it right away or skip and sign it later.
              </Callout>
              <BulletList items={[
                { title: "Pre-filled forms", text: "When sent from the Clients page, the form pre-fills all known info — name, phone, address, and pet profiles. Clients just review and confirm.", tone: "tip" },
                { title: "Auto-creates or updates records", text: "PawScheduler matches clients by phone number. If found, their record is updated. If not, a new client and pet are created automatically." },
                { title: "Multiple dogs", text: "Clients can add multiple dogs on one intake form. Each gets its own section." },
                { title: "Custom questions", text: "Go to Profile → Intake tab to add, remove, or reorder questions. Three types: short answer, long answer, and yes/no." },
              ]} />
            </div>
          </Section>

          {/* ── WAIVER ── */}
          <Section id="waiver" title="Grooming Waiver" subtitle="A digital liability waiver clients sign before grooming — stored permanently with a timestamp.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">What's covered in the waiver</p>
                <div className="grid md:grid-cols-2 gap-1.5">
                  {["Grooming authorization", "Medical emergency consent", "Matting & dematting disclosure", "Senior & special needs pets", "Accident & liability release", "Aggressive pet handling", "Photography consent"].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm">
                      <span className="text-emerald-500">✓</span> {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">How to send it</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Go to the <strong>Clients page</strong></li>
                  <li>Find the client — tap <strong>📧 Email Waiver</strong> (if they have email) or <strong>📱 SMS Waiver</strong> (if SMS opted in)</li>
                  <li>Client receives a link, reads the waiver, types their name, checks the box, and taps Sign</li>
                  <li>You receive an email notification confirming they signed</li>
                  <li>The client card shows a green <strong>✅ Waiver Signed</strong> badge</li>
                </ol>
              </div>
              <Callout type="warn" title="Signed status requires the client ID to be in the link.">
                When you send the waiver from the Clients page, the client's ID is automatically embedded in the link. This is how PawScheduler knows which client signed. If you share the link manually without using the send button, the signed badge won't appear.
              </Callout>
            </div>
          </Section>

          {/* ── SCHEDULING ── */}
          <Section id="scheduling" title="Scheduling Appointments" subtitle="Create appointments from the Schedule page, or let clients book themselves.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-white p-4 space-y-3">
                <p className="font-semibold text-gray-900">Option A: You schedule it (Schedule page)</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Go to <strong>Schedule</strong> and pick a date using the arrows or date picker.</li>
                  <li>Switch to <strong>Grid view</strong> and tap an empty slot, or use <strong>List view</strong> and tap a time.</li>
                  <li>Pick the pet from the selector (search by name, client, or tag).</li>
                  <li>The appointment modal opens — services and duration pre-fill from the pet's defaults.</li>
                  <li>Adjust services, duration, amount, and notes as needed. Save.</li>
                </ol>
              </div>
              <div className="rounded-xl border bg-emerald-50 p-4 space-y-3">
                <p className="font-semibold text-emerald-900">Option B: Client self-books</p>
                <p className="text-emerald-900/90">Share your booking link. Clients enter their name + last 4 digits of their phone to check in, then pick a date and time.</p>
                <div className="grid md:grid-cols-2 gap-3 mt-2">
                  <div className="rounded-xl border bg-white p-3">
                    <p className="font-semibold text-gray-900 mb-1">✅ What clients enter</p>
                    <ul className="space-y-1 text-gray-700 text-sm">
                      <li><strong>Name:</strong> exactly as you saved it</li>
                      <li><strong>Last 4 digits:</strong> numbers only, no dashes</li>
                    </ul>
                  </div>
                  <div className="rounded-xl border bg-white p-3">
                    <p className="font-semibold text-gray-900 mb-1">🚫 Common mistakes</p>
                    <ul className="list-disc ml-4 space-y-1 text-gray-700 text-sm">
                      <li>Typing the full phone number</li>
                      <li>Using a nickname ("Mike" vs "Michael")</li>
                      <li>Wrong phone number saved in system</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">List view vs. Grid view</p>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <p className="font-semibold text-sm mb-1">☰ List view</p>
                    <p className="text-gray-600">Full appointment cards with all details, contact buttons, edit/delete/rebook actions, and confirmed/paid/no-show toggles.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-sm mb-1">⊞ Grid view</p>
                    <p className="text-gray-600">Visual time grid showing capacity. Tap open slots to book. Color-coded by confirmation status.</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border bg-white p-4">
                <p className="font-semibold text-gray-900 mb-2">Script to text new clients</p>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 font-mono">
                  "Use this link to book: <strong>[your booking link]</strong>. When it asks, enter your full name and the last 4 digits of your phone number (numbers only, no dashes)."
                </p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-semibold text-amber-900 mb-2">If a client says "it says Not Found"</p>
                <ol className="list-decimal ml-5 space-y-1 text-sm text-amber-900/90">
                  <li>Check spelling — name must match exactly how you saved it (e.g. "Michael" not "Mike").</li>
                  <li>Make sure they're using the last 4 of the phone number you have saved for them.</li>
                  <li>Check they're typing 4 digits only — no dashes or spaces.</li>
                  <li>If they changed phones, update their number in their Client profile first.</li>
                  <li>Still stuck? Just schedule it manually from the Schedule page.</li>
                </ol>
              </div>

              <Callout type="tip" title="Use Rebook 6 weeks to keep clients on a routine.">
                After finishing an appointment, tap the Rebook 6 weeks button to jump to that future week and pick a day. Way faster than starting from scratch.
              </Callout>
            </div>
          </Section>

          {/* ── RECURRING APPOINTMENTS ── */}
          <Section id="recurring" title="🔁 Recurring Appointments" subtitle="Book a series of appointments on a repeating schedule in one action.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">How to set up a recurring appointment</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Go to Schedule → tap a time slot → pick a pet (single pet only).</li>
                  <li>In the appointment modal, scroll down and check <strong>🔁 Make this recurring</strong>.</li>
                  <li>Choose frequency: <strong>Weekly</strong>, <strong>Every 2 weeks</strong>, or <strong>Monthly</strong>.</li>
                  <li>Pick an end date (capped at 6 months out).</li>
                  <li>Set your services, duration, and amount as usual.</li>
                  <li>Tap Save — all appointments in the series are created at once.</li>
                </ol>
              </div>
              <div className="rounded-xl border bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-900 mb-1">What happens after saving</p>
                <p className="text-emerald-900/90">A summary appears telling you how many appointments were created and which dates were skipped (if any slot was already full). For example: <em>"Created 8 appointments. Skipped 1 (slot full): Jul 4."</em></p>
              </div>
              <BulletList items={[
                { title: "Conflict handling", text: "If a generated date already has a full slot at that time, that date is skipped automatically — nothing is double-booked. You'll see which dates were skipped in the summary." },
                { title: "6-month cap", text: "Recurring series are capped at 6 months out, regardless of your chosen end date. This keeps your schedule manageable." },
                { title: "Single pet only", text: "Recurring is only available for single-pet appointments. Multi-pet bookings must be scheduled individually.", tone: "warn" },
                { title: "Each appointment is independent", text: "After creation, each appointment in the series is its own record. Deleting one doesn't affect the others.", tone: "tip" },
                { title: "Requires Basic or higher", text: "Recurring appointments are not available on the Free plan.", tone: "warn" },
              ]} />
            </div>
          </Section>

          {/* ── CALENDAR VIEWS ── */}
          <Section id="calendar-views" title="📅 Calendar Views" subtitle="Three ways to look at your schedule — each useful for different situations.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="grid md:grid-cols-3 gap-3">
                <div className="rounded-xl border bg-white p-4 space-y-2">
                  <p className="font-semibold text-gray-900">☰ List view</p>
                  <p className="text-gray-600">Full appointment cards with all details — services, amount, contact buttons (Call/Text/Inbox), and action buttons (Edit, Rebook, Delete, Remind, Pay).</p>
                  <p className="text-emerald-700 text-xs font-semibold">Best for: managing individual appointments</p>
                </div>
                <div className="rounded-xl border bg-white p-4 space-y-2">
                  <p className="font-semibold text-gray-900">⊞ Grid view</p>
                  <p className="text-gray-600">Visual time-block grid showing capacity at a glance. Color-coded: green = confirmed, amber = unconfirmed, red = full. Tap any open slot to book.</p>
                  <p className="text-emerald-700 text-xs font-semibold">Best for: spotting open slots, booking by time</p>
                </div>
                <div className="rounded-xl border bg-white p-4 space-y-2">
                  <p className="font-semibold text-gray-900">📅 Month view</p>
                  <p className="text-gray-600">Full calendar overview of the month. Each day shows appointment chips. Tap any day to get options: Go to Day, Add Booking, or Add Time Block.</p>
                  <p className="text-emerald-700 text-xs font-semibold">Best for: planning, spotting busy weeks</p>
                </div>
              </div>
              <BulletList items={[
                { title: "Month view — tap a day", text: "Opens a quick action sheet: Go to Day View, Add Booking for that day, or Add Time Block (check All Day or set a time range + optional note)." },
                { title: "Time blocks in list view", text: "Date-specific blocks show as 🚫 cards at the top of the list view with Edit and Delete buttons. Recurring weekly breaks show a 'Recurring' badge instead — edit those in Profile." },
                { title: "Grid view — pet photos", text: "If you've uploaded a pet photo, it appears in the first time slot of their appointment in grid view." },
                { title: "Auto-refresh", text: "Adding, editing, or deleting time blocks instantly refreshes the month grid — no manual reload needed.", tone: "tip" },
              ]} />
            </div>
          </Section>

          {/* ── MULTI-PET ── */}
          <Section id="multipet" title="Multi-Pet Bookings" subtitle="Book multiple dogs from the same household in one action — each pet keeps its own services and price.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">How to book multiple pets</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>On the Schedule grid, tap an open time slot.</li>
                  <li>Pick the first dog from the pet selector.</li>
                  <li>The appointment modal opens — at the bottom, tap <strong>+ Add another dog</strong>.</li>
                  <li>The pet selector opens again — pick the second dog.</li>
                  <li>Each dog gets its own section: duration, services, and amount.</li>
                  <li>A combined total shows at the bottom. Tap Save.</li>
                </ol>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-xl border bg-white p-4">
                  <p className="font-semibold text-gray-900 mb-2">What's shared</p>
                  <ul className="space-y-1 text-gray-600">
                    <li>✓ Date and time</li>
                    <li>✓ Notes</li>
                    <li>✓ Reminder toggle</li>
                  </ul>
                </div>
                <div className="rounded-xl border bg-white p-4">
                  <p className="font-semibold text-gray-900 mb-2">What's per-pet</p>
                  <ul className="space-y-1 text-gray-600">
                    <li>✓ Services</li>
                    <li>✓ Duration</li>
                    <li>✓ Amount</li>
                  </ul>
                </div>
              </div>
              <Callout type="info" title="Each pet still uses its own capacity slot.">
                A Small + Large multi-pet booking uses 3 capacity units (1 + 2), same as if you booked them separately. The benefit is you create it in one action instead of two.
              </Callout>
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">How they display</p>
                <ul className="space-y-1">
                  <li><strong>List view:</strong> Shows "Buddy & Max" with a blue Multi badge and the combined total.</li>
                  <li><strong>Grid view:</strong> Primary pet shows "Buddy +1" to indicate a grouped appointment.</li>
                  <li><strong>SMS reminder:</strong> One message listing all pets — "Buddy & Max have a grooming appointment tomorrow at 10:00."</li>
                </ul>
              </div>
            </div>
          </Section>

          {/* ── SMS INBOX ── */}
          <Section id="sms-inbox" title="💬 SMS Inbox (Two-Way Messaging)" subtitle="Have real conversations with clients through your dedicated business number — without using your personal phone.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">What the inbox is</p>
                <p>The SMS Inbox is a two-way messaging interface built into PawScheduler. Any time a client texts your dedicated business number, it appears here. You can reply directly from the app — no switching to your regular phone's messages.</p>
              </div>
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">How to open a conversation</p>
                <div className="grid md:grid-cols-2 gap-3 mt-1">
                  <div className="rounded-xl border bg-white p-3">
                    <p className="font-semibold text-gray-900 mb-1">From the main nav</p>
                    <p className="text-gray-600">Tap <strong>Messages</strong> in the nav. The inbox opens showing all your conversations. Tap any to open.</p>
                  </div>
                  <div className="rounded-xl border bg-white p-3">
                    <p className="font-semibold text-gray-900 mb-1">From the Schedule</p>
                    <p className="text-gray-600">On any appointment card with a phone number, tap <strong>📥 Inbox</strong>. Opens their conversation directly — no searching needed.</p>
                  </div>
                </div>
              </div>
              <BulletList items={[
                { title: "Unread badge", text: "A green number badge on Messages in the nav shows how many unread messages you have. Conversations with unread messages show a bold green avatar." },
                { title: "New message", text: "Tap the ✏️ button in the inbox to start a new conversation. Search your client list by name or phone and pick who to message." },
                { title: "AI SMS bot", text: "Pro plan users can enable an AI bot that handles the inbox automatically — answering booking questions, checking availability, and scheduling appointments via text. Manage this in Profile → SMS Bot.", tone: "tip" },
                { title: "Inbox link from appointment", text: "On every appointment card in list view, the 📥 Inbox button is next to Call and Text — tap it to jump straight to that client's thread.", tone: "tip" },
                { title: "Requires Growth or higher", text: "Two-way SMS inbox is not available on the Free or Basic plan.", tone: "warn" },
                { title: "Polls automatically", text: "The inbox checks for new messages every 10 seconds while you have it open — no manual refresh needed." },
              ]} />
            </div>
          </Section>

          {/* ── SMS REMINDERS ── */}
          <Section id="reminders" title="📱 SMS Reminders" subtitle="Automated texts sent to clients before their appointments — fully customizable.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
                <p className="font-semibold text-gray-900">How reminders work</p>
                <BulletList items={[
                  { title: "Timing rules", text: "Set how many hours before each appointment to fire a reminder. Go to Profile → Reminders tab. Add multiple rules — e.g. 48 hours before AND 2 hours before." },
                  { title: "Runs automatically", text: "PawScheduler checks every 30 minutes and sends reminders for appointments falling within the window of each rule." },
                  { title: "Opt-in required", text: "The client must have a phone number saved and SMS opted in. Set this from the Clients page.", tone: "warn" },
                  { title: "Manual reminder", text: "On the Schedule list view, tap the 💬 Remind button on any appointment card to send an immediate reminder anytime." },
                ]} />
              </div>
              <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
                <p className="font-semibold text-gray-900">Customizing the reminder message</p>
                <p>Go to <strong>Profile → Reminders tab</strong> and edit the Reminder Message template. Use tokens that get replaced with real data when the message sends:</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["%first_name%", "%pet%", "%date%", "%time%", "%services%", "%confirm_link%", "%business_name%"].map((t) => (
                    <span key={t} className="text-xs font-mono bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-1 rounded-full">{t}</span>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">Tap any token in the Profile SMS editor to insert it at your cursor position.</p>
              </div>
              <Callout type="tip" title="Add %confirm_link% to any reminder to let clients confirm from it too.">
                You don't need a separate confirmation message — just include the confirm link token in your reminder and clients can tap to confirm right from the text.
              </Callout>
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">Sending intake & waiver links</p>
                <BulletList items={[
                  { title: "📧 Email Waiver / Send Intake", text: "If the client has an email, tapping these buttons sends a branded email with a link directly to their form." },
                  { title: "📱 SMS Waiver", text: "If the client has a phone and is SMS opted in, sends the waiver link via text." },
                  { title: "📋 Copy Link", text: "If no email or SMS, copies the link to your clipboard so you can paste it anywhere." },
                ]} />
              </div>
            </div>
          </Section>

          {/* ── SMS CONFIRMATIONS ── */}
          <Section id="confirmations" title="✅ SMS Confirmations" subtitle="Clients confirm their appointment with one tap — no login required.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
                <p className="font-semibold text-gray-900">How it works</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>PawScheduler automatically sends a confirmation request SMS <strong>48 hours before every appointment</strong>.</li>
                  <li>The text includes a unique link (one per appointment).</li>
                  <li>Client taps the link — a page shows their pet name, date, and time.</li>
                  <li>One tap confirms. Your schedule flips to <strong>Confirmed ✅</strong> immediately.</li>
                  <li>The link expires after use — tapping it again shows "Already confirmed."</li>
                </ol>
              </div>
              <BulletList items={[
                { title: "48-hour timing is fixed", text: "The confirmation request always fires 48 hours before — this timing can't be changed. The message wording can be customized." },
                { title: "Customize the message", text: "Go to Profile → Reminders tab → 48hr Confirmation Request card. Edit the wording and use tokens like %first_name%, %pet%, %date%, %time%, %confirm_link%.", tone: "tip" },
                { title: "Confirmed badge", text: "Once confirmed, the appointment card shows a green Confirmed badge in list and grid view." },
                { title: "No login required", text: "Clients confirm directly from the link — they don't need a PawScheduler account or any login." },
                { title: "Manual confirm", text: "You can also tap the Confirmed checkbox on any appointment card yourself if the client calls to confirm verbally." },
              ]} />
              <Callout type="info" title="Want more than one confirmation touchpoint?">
                Add %confirm_link% to any of your timed reminder messages. Clients can confirm from whichever reminder they see first.
              </Callout>
            </div>
          </Section>

          {/* ── PUSH NOTIFICATIONS ── */}
          <Section id="push-notif" title="🔔 Push Notifications" subtitle="Get notified on your phone when clients book, text, confirm, or submit an intake form — even when the app isn't open.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">Enabling push notifications</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Open PawScheduler on your phone</li>
                  <li>A purple banner appears: <em>"Enable push notifications to get alerts when clients book or text you."</em></li>
                  <li>Tap <strong>Enable</strong> — your browser asks for permission</li>
                  <li>Tap <strong>Allow</strong>. Done — you'll receive pushes from now on</li>
                </ol>
              </div>
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">What triggers a push notification</p>
                <div className="grid md:grid-cols-2 gap-2 mt-1">
                  {[
                    ["📅 New booking", "Client books via your public booking page"],
                    ["💬 Inbound SMS", "Client texts your business number"],
                    ["✅ Appointment confirmed", "Client taps a confirm link in an SMS reminder or confirmation request"],
                    ["📋 Intake submitted", "Client submits their intake form"],
                  ].map(([title, desc]) => (
                    <div key={title} className="rounded-xl border bg-white p-3">
                      <p className="font-semibold text-gray-900 text-sm mb-0.5">{title}</p>
                      <p className="text-gray-600 text-xs">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
              <BulletList items={[
                { title: "One-time setup per device", text: "You only need to enable this once per device. Your subscription ID is saved to your account.", tone: "tip" },
                { title: "iOS note", text: "On iPhone, you must add PawScheduler to your Home Screen first (Safari → Share → Add to Home Screen), then open from there. iOS only allows push notifications for apps added to the Home Screen.", tone: "warn" },
                { title: "Confirmation message", text: "When a client confirms, the push says who confirmed and which pet — e.g. 'Jaiden confirmed Fiona's appointment on Tuesday at 2:00 PM.' Tapping it opens the Schedule." },
                { title: "Not getting pushes?", text: "Check that your browser allows notifications for PawScheduler in your device settings. On iOS, make sure you opened from the Home Screen icon, not the browser.", tone: "warn" },
              ]} />
            </div>
          </Section>

          {/* ── VACCINES ── */}
          <Section id="vaccines" title="Vaccine Tracking & Alerts" subtitle="Track vaccine expiration dates and automatically alert clients when they're coming due.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">Adding shot records</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Go to <strong>Clients → View Client → pet card → + Add Shot Record</strong>.</li>
                  <li>Choose the shot type (Rabies, Bordetella, DHPP, Other).</li>
                  <li>Enter the date given and expiration date.</li>
                  <li>Save — the record appears on the pet card and in appointment modals.</li>
                </ol>
              </div>
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">Automatic expiration alerts</p>
                <p>PawScheduler runs a nightly check and sends the client an SMS when their pet's <strong>Rabies or Bordetella</strong> is expiring:</p>
                <div className="grid md:grid-cols-2 gap-3 mt-2">
                  <div className="rounded-xl border bg-amber-50 p-3">
                    <p className="font-semibold text-amber-900">30-day warning</p>
                    <p className="text-amber-900/80 text-xs mt-1">Sent once, 30 days before expiration.</p>
                  </div>
                  <div className="rounded-xl border bg-red-50 p-3">
                    <p className="font-semibold text-red-900">7-day warning</p>
                    <p className="text-red-900/80 text-xs mt-1">⚠️ URGENT alert sent 7 days before expiration.</p>
                  </div>
                </div>
              </div>
              <BulletList items={[
                { title: "Eligibility", text: "Client must have a phone number and sms_opt_in = true to receive vaccine alerts.", tone: "warn" },
                { title: "No duplicates", text: "Each alert is sent only once per expiration. PawScheduler tracks what's already been sent." },
                { title: "Booking warnings", text: "When you open an appointment on the Schedule page, the modal shows a colored warning if the pet's rabies is missing, expired, or expiring soon." },
              ]} />
            </div>
          </Section>

          {/* ── CHECK IN / CHECK OUT ── */}
          <Section id="checkin" title="🟦 Check In / Check Out" subtitle="Track exactly when a dog arrives and leaves — timestamps are recorded on the appointment.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">How it works</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Open the Schedule page in <strong>List view</strong></li>
                  <li>On the appointment card, tap <strong>Check In</strong> when the client arrives — it stamps the current time</li>
                  <li>Tap <strong>Check Out</strong> when the dog is done — another timestamp saved</li>
                  <li>The elapsed time (e.g. <em>1h 45m</em>) shows between the two timestamps</li>
                </ol>
              </div>
              <BulletList items={[
                { title: "Edit the time", text: "Made a mistake? A small time picker appears next to each timestamp after tapping Check In or Check Out — adjust it to the correct time." },
                { title: "Check Out only appears after Check In", text: "The Check Out button is hidden until you've checked in first — keeps the flow logical." },
                { title: "Elapsed time auto-calculated", text: "The time between check-in and check-out is shown automatically — useful for tracking how long different dogs actually take.", tone: "tip" },
                { title: "Payment buttons appear after Check Out", text: "Once a dog is checked out, quick payment buttons appear on the card (Cash, Card, Venmo, Zelle, Cash App, Check) — see Taking Payment below.", tone: "tip" },
              ]} />
            </div>
          </Section>

          {/* ── TAKING PAYMENT ── */}
          <Section id="payment-flow" title="💵 Taking Payment" subtitle="Mark appointments paid and record the payment method in two taps — no editing required.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">Quick payment after checkout</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Tap <strong>Check Out</strong> on the appointment card when the dog is done</li>
                  <li>Payment method buttons appear automatically: Cash, Card, Venmo, Cash App, Zelle, Check</li>
                  <li>Tap the method the client paid with — the appointment is instantly marked paid and the method recorded</li>
                  <li>A green <strong>✅ Paid via Cash</strong> confirmation replaces the buttons</li>
                </ol>
              </div>
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">Recording payment when editing an appointment</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Tap <strong>Edit</strong> on any appointment card</li>
                  <li>Scroll to the <strong>Payment Method</strong> dropdown</li>
                  <li>Select the method — the appointment is auto-marked as paid when you save</li>
                  <li>If applicable, enter the <strong>Tip</strong> amount (shows below payment method)</li>
                </ol>
              </div>
              <BulletList items={[
                { title: "Tip tracking", text: "When you select a payment method in the edit modal, a Tip field appears. Enter the tip amount and it's stored on the appointment and shown on the revenue page.", tone: "tip" },
                { title: "Revenue tracking", text: "All paid amounts (including tips) roll up into your Revenue page stats." },
                { title: "Unpaid page", text: "Any appointment that's past, not marked paid, and not a no-show appears on the Unpaid Appointments page with call/text/email buttons to follow up." },
                { title: "Paid badge in grid view", text: "The mini appointment card in Grid view shows a $ Unpaid or ✓ Paid button that you can tap directly without opening the edit modal.", tone: "tip" },
              ]} />
            </div>
          </Section>

          {/* ── NO-SHOWS & CONFIRMED ── */}
          <Section id="noshow" title="📌 No-Shows & Confirmed" subtitle="Track appointment status at a glance — one-tap toggles directly on each card.">
            <div className="space-y-4 text-sm text-gray-700">
              <BulletList items={[
                { title: "Confirmed toggle", text: "On each appointment card in list view, tap Confirmed to toggle. Grid view shows green for confirmed, amber for unconfirmed. Clients can also confirm via the link in their SMS reminder." },
                { title: "No-show toggle", text: "Mark no-shows directly from the appointment card. No-shows are excluded from revenue totals and don't appear on the Unpaid page." },
                { title: "Paid toggle", text: "A quick toggle on each card. For a full payment method and tip record, use Edit → Payment Method or the quick payment buttons after checkout.", tone: "tip" },
                { title: "Day summary bar", text: "At the top of the Schedule page, a summary bar shows: total appointments, confirmed/unconfirmed count, today's revenue, and any unpaid or vaccine alerts." },
                { title: "After 2 no-shows", text: "Many groomers require a deposit before booking. PawScheduler tracks history so you can see the pattern.", tone: "warn" },
              ]} />
            </div>
          </Section>

          {/* ── REVENUE ── */}
          <Section id="revenue" title="Revenue & Unpaid Appointments" subtitle="Track what you've earned, who still owes you, and how many texts you've sent.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4 space-y-2">
                <p className="font-semibold text-gray-900">Revenue page</p>
                <BulletList items={[
                  { title: "Quick filters", text: "This Week, This Month, Last Month, This Year, All Time — or pick a custom date range." },
                  { title: "Stats", text: "Total revenue, appointment count, average per appointment, and unpaid count." },
                  { title: "SMS usage", text: "Two stat cards show texts sent this month and texts sent all time — useful for tracking your Telnyx usage across reminders, confirmations, and replies.", tone: "tip" },
                  { title: "Monthly trend", text: "A horizontal bar chart showing the last 6 months of paid revenue." },
                  { title: "Revenue by service", text: "See which services earn the most." },
                  { title: "Sortable table", text: "Sort by date, pet, client, or amount. All appointments for the period with paid/unpaid/no-show status." },
                ]} />
              </div>
              <div className="rounded-xl border bg-gray-50 p-4 space-y-2">
                <p className="font-semibold text-gray-900">Unpaid appointments page</p>
                <BulletList items={[
                  { title: "What shows here", text: "Past appointments that are not marked paid and not marked as no-shows. Future appointments never appear here." },
                  { title: "Mark as paid", text: "Tap the green button on any card to mark it paid. It disappears from the list immediately." },
                  { title: "Contact buttons", text: "Call, Text, and Email buttons appear on each card so you can follow up without leaving the page." },
                ]} />
              </div>
            </div>
          </Section>

          {/* ── ONBOARDING TOUR ── */}
          <Section id="onboarding" title="🎓 Onboarding Tour" subtitle="A guided walkthrough that runs automatically when you first log in.">
            <BulletList items={[
              { title: "When it runs", text: "The tour starts automatically 800ms after your first visit to the Schedule page. It never runs again after you complete or skip it." },
              { title: "What it covers", text: "Date navigation, view modes (List/Grid/Month), adding appointments, the Clients page, Profile setup, and your booking link — 8 steps total." },
              { title: "Skip anytime", text: "Tap Skip tour on any step to dismiss. Your progress is saved so you won't see it again." },
              { title: "Replay the tour", text: "If you want to see it again, contact support and we can reset it for your account.", tone: "tip" },
              { title: "Mobile friendly", text: "On mobile, the tour bubble anchors to the bottom of the screen so it doesn't cover the highlighted element." },
            ]} />
          </Section>

          {/* ── DARK MODE ── */}
          <Section id="darkmode" title="Dark Mode" subtitle="Easy on the eyes — especially useful when you're grooming in low light.">
            <BulletList items={[
              { title: "Toggle location", text: 'The dark mode toggle (🌙 / ☀️) is in the top-right corner of the Schedule page header.' },
              { title: "Remembered", text: "Your preference is saved automatically. Dark mode stays on even after you close the app." },
              { title: "System preference", text: "If you haven't set a preference, PawScheduler follows your device's light/dark mode setting." },
              { title: "Full coverage", text: "Dark mode applies to all pages — Schedule, Clients, Revenue, Profile, and the booking/waiver/intake public pages." },
            ]} />
          </Section>

          {/* ── CONTACT ── */}
          <Section id="contact" title="Contact Support" subtitle="Can't find what you're looking for? Send us a message.">
            <ContactForm />
          </Section>

          <div className="pb-10" />
        </main>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function Section({ id, title, subtitle, bullets, custom, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 md:px-6 py-4 border-b bg-gradient-to-b from-white to-gray-50">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
        </div>
        <div className="p-5 md:p-6">
          {children || custom || (bullets && <BulletList items={bullets} />)}
        </div>
      </div>
    </section>
  );
}

function BulletList({ items }) {
  return (
    <ul className="space-y-3">
      {(items || []).map((b, idx) => (
        <li key={idx} className="flex gap-3">
          <div className={`mt-0.5 h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
            b.tone === "warn" ? "bg-amber-100 text-amber-700"
            : b.tone === "tip" ? "bg-blue-100 text-blue-700"
            : "bg-emerald-100 text-emerald-700"
          }`}>
            {b.tone === "warn" ? "!" : b.tone === "tip" ? "★" : "✓"}
          </div>
          <div className="text-sm text-gray-700">
            <span className="font-semibold text-gray-900">{b.title}:</span>{" "}{b.text}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Callout({ type = "info", title, children }) {
  const styles = {
    info:  "bg-blue-50 border-blue-200 text-blue-900",
    warn:  "bg-amber-50 border-amber-200 text-amber-900",
    tip:   "bg-emerald-50 border-emerald-200 text-emerald-900",
    error: "bg-red-50 border-red-200 text-red-900",
  };
  const icons = { info: "ℹ️", warn: "⚠️", tip: "💡", error: "🚫" };

  return (
    <div className={`rounded-xl border p-4 text-sm ${styles[type]}`}>
      <div className="font-semibold mb-1">{icons[type]} {title}</div>
      {children && <div className="opacity-90">{children}</div>}
    </div>
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
          name: name.trim(), email: email.trim(),
          message: message.trim(), page: "/help",
          created_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => ""));
      setStatus("success");
      setName(""); setEmail(""); setMessage("");
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again or email pawscheduler@gmail.com.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Your Name</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Sally Groomer" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Your Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="you@email.com" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Message</label>
        <textarea required value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
          className="w-full border rounded-xl px-3 py-2 text-sm"
          placeholder="What were you trying to do? What happened? What device are you on?" />
        <p className="mt-1 text-xs text-gray-500">Include the client/pet name if relevant — it helps us troubleshoot faster.</p>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={!canSubmit}
          className={`px-4 py-2 rounded-xl text-white text-sm font-semibold ${canSubmit ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-300"}`}>
          {status === "sending" ? "Sending…" : "Send Message"}
        </button>
        {status === "success" && <span className="text-sm text-emerald-700">✅ Sent! We'll reply soon.</span>}
        {status === "error" && <span className="text-sm text-red-600">❌ Failed to send.</span>}
      </div>
      {errorMsg && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{errorMsg}</div>
      )}
    </form>
  );
}