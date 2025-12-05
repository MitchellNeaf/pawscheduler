// src/pages/Help.jsx
export default function Help() {
  const sections = [
    { id: "profile", label: "Profile Setup" },
    { id: "schedule", label: "Working Hours" },
    { id: "vacation", label: "Vacation & Closed Days" },
    { id: "slug", label: "Your Booking Link (Slug)" },
    { id: "dog-sizing", label: "Dog Sizes & Capacity" },
    { id: "scheduling", label: "Scheduling Clients" },
    { id: "confirmation", label: "Confirmations & No-Shows" },
  ];

  return (
    <div className="flex h-[calc(100vh-80px)] bg-gray-50">
      {/* LEFT SIDEBAR */}
      <aside className="w-64 border-r bg-white p-5 sticky top-[80px] h-[calc(100vh-80px)] overflow-y-auto">
        <h2 className="text-xs font-semibold uppercase text-gray-400 mb-3 tracking-wide">
          Help Center
        </h2>

        <ul className="space-y-1">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto p-8 space-y-10">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          PawScheduler Help & Setup Guide
        </h1>

        {/* PROFILE */}
        <Section id="profile" title="Profile Setup">
          <p>Your profile controls your business identity and how your clients see you.</p>
          <ul>
            <li>
              <strong>Business Info:</strong> Add your name, business name, phone, and email.  
              This appears in confirmations, receipts, and reminders.
            </li>
            <li>
              <strong>Logo Upload:</strong> Your logo appears on your booking page and all automated emails.
            </li>
            <li>
              <strong>Time Zone:</strong> Critical for correct appointment times and reminder emails.
            </li>
            <li>
              <strong>Pro Tip:</strong> Add a friendly greeting or instruction in your business description.  
              Example: “Please arrive 5 minutes early and ensure your pet has gone potty.”
            </li>
          </ul>
        </Section>

        {/* WORKING HOURS */}
        <Section id="schedule" title="Working Hours">
          <ul>
            <li>
              Set which days of the week you groom and the hours you’re available.
            </li>
            <li>
              Appointment slots on your booking link adjust instantly based on these hours.
            </li>
            <li>
              <strong>Breaks:</strong> Add mid-day breaks (e.g., lunch) to prevent clients from scheduling over them.
            </li>
            <li>
              <strong>Pro Tip:</strong> Many groomers add a buffer (15–30 minutes) at the start or end of their day to reduce stress.
            </li>
            <li>
              <strong>Common Mistake:</strong> Forgetting to adjust hours during holiday seasons — update anytime.
            </li>
          </ul>
        </Section>

        {/* VACATION */}
        <Section id="vacation" title="Vacation & Closed Days">
          <ul>
            <li>
              Add dates where you’re completely unavailable — these vanish from the client booking calendar.
            </li>
            <li>
              Perfect for: vacations, vet appointments, family events, or days you’re overbooked.
            </li>
            <li>
              Delete or edit blocked days at any time.
            </li>
            <li>
              <strong>Pro Tip:</strong> Block “prep days” after holidays or before shows when grooming demand spikes.
            </li>
          </ul>
        </Section>

        {/* SLUG */}
        <Section id="slug" title="Your Booking Link (Slug)">
          <p>
            Your <strong>slug</strong> is your personalized booking link — your clients use it to book themselves.
          </p>
          <ul>
            <li>
              Example: If your slug is <code>sally</code> →  
              <code>https://app.pawscheduler.app/book/sally</code>.
            </li>
            <li>
              No client account required — they simply click and book.
            </li>
            <li>
              Share your link in your Instagram bio, text messages, Google Business page, or printed signs.
            </li>
            <li>
              <strong>Pro Tip:</strong> Keep your slug short and memorable — like your business name.
            </li>
          </ul>
        </Section>

        {/* DOG SIZES */}
        <Section id="dog-sizing" title="Dog Sizes & Capacity">
          <ul>
            <li>You can assign each pet a size: Small, Medium, Large, XL, or custom.</li>
            <li>
              PawScheduler uses <strong>capacity units</strong> to prevent overbooking.
            </li>
            <li>
              Example setup:
              <ul className="list-disc ml-6 mt-1">
                <li>Small = 1 unit</li>
                <li>Medium = 1 units</li>
                <li>Large = 2 units</li>
                <li>XL = 3 units</li>
              </ul>
            </li>
            <li>
              If your daily capacity is 3 units:  
              – One XL dog fills your whole slot  
              – One large + one small is allowed  
              – Three small dogs also fits
            </li>
            <li>
              <strong>Pro Tip:</strong> Perfect for households with multiple dogs — the system intelligently checks capacity.
            </li>
          </ul>
        </Section>

        {/* SCHEDULING */}
        <Section id="scheduling" title="Scheduling Clients">
          <ul>
            <li>
              Create appointments from: <strong>Clients</strong>, <strong>Pets</strong>, or the <strong>Schedule</strong> page.
            </li>
            <li>
              Set: pet, services, start time, duration, and internal notes.
            </li>
            <li>
              <strong>Quick Rebook:</strong> One tap to schedule their next appointment (4–8 weeks recommended).
            </li>
            <li>
              Schedule page includes:
              <ul className="list-disc ml-6 mt-1">
                <li>Tap to call or text the client</li>
                <li>Appointment status indicators</li>
                <li>Search bar for fast lookup</li>
              </ul>
            </li>
            <li>
              <strong>Pro Tip:</strong> Add behavior tags (“Bites”, “Anxious”, “Matting Risk”) to trigger Smart Alerts during rebooking.
            </li>
          </ul>
        </Section>

        {/* CONFIRMATIONS */}
        <Section id="confirmation" title="Confirmations & No-Shows">
          <ul>
            <li>
              Toggle an appointment as <strong>Confirmed</strong> manually or let clients confirm through email reminders.
            </li>
            <li>
              When email reminders are enabled, clients receive:
              <ul className="list-disc ml-6 mt-1">
                <li>A confirmation link</li>
                <li>Your business info</li>
                <li>Appointment time/details</li>
              </ul>
            </li>
            <li>
              Marking an appointment as <strong>No-Show</strong> removes it from unpaid totals and helps track client reliability.
            </li>
            <li>
              <strong>Best Practice:</strong> After two no-shows, many groomers require deposits — use the notes field to track policies.
            </li>
          </ul>
        </Section>
      </main>
    </div>
  );
}

/* Reusable Section Component */
function Section({ id, title, children }) {
  return (
    <section
      id={id}
      className="scroll-mt-24 bg-white p-6 rounded-lg shadow-sm border"
    >
      <h2 className="text-xl font-semibold text-gray-800 mb-3">{title}</h2>
      <div className="text-sm text-gray-700 space-y-2">{children}</div>
    </section>
  );
}
