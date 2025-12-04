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
          PawScheduler Help
        </h1>

        {/* SECTION TEMPLATE */}
        <Section id="profile" title="Profile Setup">
          <p>Your profile controls your business info and branding.</p>
          <ul>
            <li>Add business name, phone, email, and location.</li>
            <li>Upload a logo to brand your booking page & emails.</li>
            <li>
              Set your time zone so reminders and appointments show correctly.
            </li>
          </ul>
        </Section>

        <Section id="schedule" title="Working Hours">
          <ul>
            <li>Choose which days you work and your grooming hours.</li>
            <li>
              Available appointment times on the booking page follow this
              schedule.
            </li>
            <li>Update anytime — changes apply immediately.</li>
          </ul>
        </Section>

        <Section id="vacation" title="Vacation & Closed Days">
          <ul>
            <li>Add vacation days or days you’re fully unavailable.</li>
            <li>These dates disappear from the public booking calendar.</li>
            <li>Edit or remove days with one click.</li>
          </ul>
        </Section>

        <Section id="slug" title="Your Booking Link (Slug)">
          <p>
            Your <strong>slug</strong> is the unique URL clients use to book
            themselves — no login or account required.
          </p>
          <ul>
            <li>
              If your slug is <code>sally</code>, your link is{" "}
              <code>https://app.pawscheduler.app/book/sally</code>.
            </li>
            <li>Send this link in text messages, emails, or social media.</li>
            <li>
              Clients fill out a short intake form and choose an available time.
            </li>
          </ul>
        </Section>

        <Section id="dog-sizing" title="Dog Sizes & Capacity">
          <ul>
            <li>
              Each pet can be assigned a size (Small, Medium, Large, XL, etc.).
            </li>
            <li>
              Your <strong>daily capacity</strong> determines how many total
              “size units” you can handle in the same time slot.
            </li>
            <li>
              Example: If you allow 3 units, one big dog = 2 units, one small =
              1 unit → system prevents overbooking.
            </li>
            <li>Perfect for booking multiple dogs at once safely.</li>
          </ul>
        </Section>

        <Section id="scheduling" title="Scheduling Clients">
          <ul>
            <li>Create appointments manually from Clients, Pets, or Schedule.</li>
            <li>Select pet, services, start time, and duration.</li>
            <li>
              Quick-rebook button lets you instantly schedule the next visit.
            </li>
            <li>
              Schedule page includes client contact shortcuts + appointment
              status.
            </li>
          </ul>
        </Section>

        <Section id="confirmation" title="Confirmations & No-Shows">
          <ul>
            <li>
              You can manually mark an appointment as{" "}
              <strong>Confirmed</strong>.
            </li>
            <li>
              If email reminders are enabled, clients receive a confirmation
              link — clicking it automatically updates the appointment.
            </li>
            <li>
              Marking an appointment as <strong>No-Show</strong> excludes it
              from unpaid totals and helps you track reliability.
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
      <div className="text-sm text-gray-700 space-y-2">
        {children}
      </div>
    </section>
  );
}
