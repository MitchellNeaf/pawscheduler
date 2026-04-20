// src/pages/Help.jsx
import { useEffect, useMemo, useState } from "react";

const SECTIONS = [
  { id: "quickstart",    label: "Quick Start",              icon: "🚀", badge: "Start here" },
  { id: "profile",       label: "Profile Setup",            icon: "👤" },
  { id: "schedule",      label: "Working Hours",            icon: "🕒" },
  { id: "vacation",      label: "Vacation & Closed Days",   icon: "🏖️" },
  { id: "slug",          label: "Booking Link",             icon: "🔗" },
  { id: "dog-sizing",    label: "Dog Sizes & Capacity",     icon: "🐶" },
  { id: "pricing",       label: "Service Pricing",          icon: "💲" },
  { id: "clients",       label: "Clients & Pets",           icon: "🐾" },
  { id: "intake",        label: "Intake Form",              icon: "📋" },
  { id: "waiver",        label: "Grooming Waiver",          icon: "✍️" },
  { id: "scheduling",    label: "Scheduling Appointments",  icon: "📆" },
  { id: "multipet",      label: "Multi-Pet Bookings",       icon: "🐕‍🦺" },
  { id: "reminders",     label: "Reminders & Alerts",       icon: "🔔" },
  { id: "vaccines",      label: "Vaccine Tracking",         icon: "💉" },
  { id: "confirmation",  label: "Confirmations & No-Shows", icon: "✅" },
  { id: "revenue",       label: "Revenue & Unpaid",         icon: "💰" },
  { id: "darkmode",      label: "Dark Mode",                icon: "🌙" },
  { id: "contact",       label: "Contact Support",          icon: "💬" },
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
            <BulletList items={[
              { title: "Business name", text: "What shows on your booking page, emails, and waiver. Use your real business name." },
              { title: "Logo", text: "Upload a logo and it shows on your booking page, intake form, waiver, and reminder emails. Adds professionalism immediately. Square images work best." },
              { title: "Time zone", text: "Set this first — incorrect timezone means appointment times will be off in reminders and the nightly reminder function.", tone: "warn" },
              { title: "Booking slug", text: 'Your public booking URL. Example: slug "sally" → app.pawscheduler.app/book/sally. Keep it short and easy to remember.' },
              { title: "Service pricing", text: "Set once, auto-fills every appointment. Organized by service and dog size (S/M, Large, XL)." },
              { title: "Max dogs at once", text: "Found in the SMS Bot tab. Controls how many dogs can be booked at the same time slot." },
            ]} />
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

          {/* ── VACATION ── */}
          <Section id="vacation" title="Vacation & Closed Days" subtitle="Blocks specific dates from appearing on your booking calendar.">
            <BulletList items={[
              { title: "Block full days", text: "The entire day disappears from your booking calendar. Clients can't book on those dates." },
              { title: "Block partial days", text: "Block just a window of time (e.g. 8am–12pm) if you're only partially unavailable." },
              { title: "Edit anytime", text: "Delete or modify vacation days whenever your plans change." },
              { title: "Pro tip", text: 'Block a "recovery day" after holidays if you tend to get slammed. Future you will thank present you.', tone: "tip" },
            ]} />
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
          <Section id="dog-sizing" title="Dog Sizes & Capacity" subtitle="A simple system that prevents overbooking automatically.">
            <div className="space-y-4 text-sm text-gray-700">
              <p>Each pet is assigned a size which converts to a capacity unit. Your schedule checks these units against your max capacity to prevent overbooking.</p>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-xl border bg-white p-4">
                  <p className="font-semibold text-gray-900 mb-2">Size → Capacity units</p>
                  <ul className="space-y-1">
                    {[["Small / Medium", "1 unit"], ["Large", "2 units"], ["XL", "3 units"]].map(([size, unit]) => (
                      <li key={size} className="flex justify-between text-sm">
                        <span>{size}</span>
                        <span className="font-semibold text-emerald-700">{unit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border bg-emerald-50 p-4">
                  <p className="font-semibold text-emerald-900 mb-2">Example with max capacity = 3</p>
                  <ul className="space-y-1 text-emerald-900/90">
                    <li>✓ One XL dog fills the slot</li>
                    <li>✓ One Large + one Small fits</li>
                    <li>✓ Three Small/Medium dogs fits</li>
                    <li>✗ Two Large dogs = 4 units, blocked</li>
                  </ul>
                </div>
              </div>
              <Callout type="info" title="Set max capacity in Profile → SMS Bot tab.">
                This controls how many dogs can occupy the same time slot. Great for mobile groomers who can handle one dog at a time vs. home groomers with a full setup.
              </Callout>
            </div>
          </Section>

          {/* ── PRICING ── */}
          <Section id="pricing" title="Service Pricing" subtitle="Set your rates once — they auto-fill every time you create an appointment.">
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

          {/* ── INTAKE FORM ── */}
          <Section id="intake" title="Client Intake Form" subtitle="A public form new clients fill out before their first appointment — automatically creates their profile.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">What it captures</p>
                <div className="grid md:grid-cols-2 gap-2">
                  {["Full name, phone, email", "Home address", "Emergency contact name & phone", "Dog name and breed", "Dog size", "Behavioral tags (Bites, Anxious, etc.)", "Additional notes about the dog"].map((item) => (
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
                  <li>If they have an email on file → sends them an email with a button link</li>
                  <li>If no email → copies the link to your clipboard so you can text it manually</li>
                </ol>
              </div>
              <Callout type="info" title="Intake forms auto-create or update records.">
                When a client submits the intake form, PawScheduler matches them by phone number. If found, their record is updated. If not, a new client and pet are created automatically — no manual data entry needed. Multiple dogs can be added on one intake form.
              </Callout>
              <Callout type="tip" title="Send the intake before their first appointment.">
                This eliminates the back-and-forth of collecting basic info. Your intake form link is: <strong>app.pawscheduler.app/intake/your-slug</strong>
              </Callout>
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

          {/* ── REMINDERS ── */}
          <Section id="reminders" title="Reminders & Alerts" subtitle="Automated reminders so you spend less time chasing clients.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
                <p className="font-semibold text-gray-900">Appointment reminders (SMS)</p>
                <BulletList items={[
                  { title: "Nightly automatic", text: "Every night, PawScheduler sends SMS reminders to clients whose pets have appointments the next day — but only if the client has a phone and sms_opt_in = true." },
                  { title: "Manual reminder button", text: 'On the Schedule list view, each appointment card has a "💬 Remind" button. Tap it to send an immediate SMS reminder anytime.' },
                  { title: "Opt-in required", text: "Clients must have SMS opted in. Set this from the Clients page → Edit SMS button next to each client.", tone: "warn" },
                ]} />
              </div>
              <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
                <p className="font-semibold text-gray-900">Sending intake & waiver links</p>
                <BulletList items={[
                  { title: "📧 Email Waiver / Send Intake", text: "If the client has an email, tapping these buttons sends a branded email with a link directly to that client's form." },
                  { title: "📱 SMS Waiver", text: "If the client has a phone and is SMS opted in, sends the waiver link via text." },
                  { title: "📋 Copy Link", text: "If no email or SMS, copies the link to your clipboard so you can paste it anywhere." },
                ]} />
              </div>
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

          {/* ── CONFIRMATIONS ── */}
          <Section id="confirmation" title="Confirmations & No-Shows" subtitle="Track who's confirmed and who flaked — without extra admin work.">
            <div className="space-y-4 text-sm text-gray-700">
              <BulletList items={[
                { title: "Confirmed toggle", text: "On each appointment card in List view, tap Confirmed to mark it. The grid view shows green for confirmed, amber for unconfirmed." },
                { title: "No-show toggle", text: "Mark no-shows directly from the appointment card. No-shows are tracked separately and excluded from unpaid totals." },
                { title: "Paid toggle", text: "Mark appointments as paid from the list view or grid view. Unpaid past appointments appear on the Unpaid page." },
                { title: "Day summary bar", text: "At the top of the Schedule page, a summary shows total appointments, confirmed count, today's revenue, and any vaccine alerts or unpaid amounts.", tone: "tip" },
                { title: "Best practice", text: "After 2 no-shows, many groomers require a deposit before booking. PawScheduler tracks the history so you can see the pattern.", tone: "warn" },
              ]} />
            </div>
          </Section>

          {/* ── REVENUE ── */}
          <Section id="revenue" title="Revenue & Unpaid Appointments" subtitle="Track what you've earned and who still owes you.">
            <div className="space-y-4 text-sm text-gray-700">
              <div className="rounded-xl border bg-gray-50 p-4 space-y-2">
                <p className="font-semibold text-gray-900">Revenue page</p>
                <BulletList items={[
                  { title: "Quick filters", text: "This Week, This Month, Last Month, This Year, All Time — or pick a custom date range." },
                  { title: "Stats", text: "Total revenue, appointment count, average per appointment, and unpaid count." },
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