import { useState } from "react";

export default function Help() {
  const sections = [
    { id: "profile", label: "Profile Setup" },
    { id: "schedule", label: "Working Hours" },
    { id: "vacation", label: "Vacation & Closed Days" },
    { id: "slug", label: "Your Booking Link (Slug)" },
    { id: "dog-sizing", label: "Dog Sizes & Capacity" },
    { id: "scheduling", label: "Scheduling Clients" },
    { id: "confirmation", label: "Confirmations & No-Shows" },
    { id: "contact", label: "Contact Support" } // 👈 NEW
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
              <strong>Pro Tip:</strong> Add a friendly greeting in your business description.  
              Example: “Please arrive 5 minutes early and ensure your pet has gone potty.”
            </li>
          </ul>
        </Section>

        {/* WORKING HOURS */}
        <Section id="schedule" title="Working Hours">
          <ul>
            <li>Set which days of the week you groom and the hours you’re available.</li>
            <li>Appointment slots on your booking link adjust instantly based on these hours.</li>
            <li>
              <strong>Breaks:</strong> Add midday breaks (e.g., lunch) to prevent clients from scheduling over them.
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
            <li>Add dates where you’re completely unavailable — these disappear from the booking calendar.</li>
            <li>Perfect for vacations, vet appointments, family events, or catching up.</li>
            <li>Edit or delete blocked days anytime.</li>
            <li>
              <strong>Pro Tip:</strong> Block “prep days” after holidays or before big grooming weeks.
            </li>
          </ul>
        </Section>

        {/* SLUG */}
        <Section id="slug" title="Your Booking Link (Slug)">
          <p>Your personalized booking link — clients use this to book themselves.</p>
          <ul>
            <li>
              Example: If your slug is <code>sally</code> →  
              <code>https://app.pawscheduler.app/book/sally</code>
            </li>
            <li>No client account required — they just click and book.</li>
            <li>Share on Instagram, Google Business, texts, or printed materials.</li>
            <li>
              <strong>Pro Tip:</strong> Keep your slug short and memorable.
            </li>
          </ul>
        </Section>

        {/* DOG SIZES */}
        <Section id="dog-sizing" title="Dog Sizes & Capacity">
          <ul>
            <li>Assign pets a size: Small, Medium, Large, XL, or custom.</li>
            <li>PawScheduler uses <strong>capacity units</strong> to prevent overbooking.</li>
            <li>
              Example setup:
              <ul className="list-disc ml-6 mt-1">
                <li>Small = 1 unit</li>
                <li>Medium = 1 unit</li>
                <li>Large = 2 units</li>
                <li>XL = 3 units</li>
              </ul>
            </li>
            <li>
              If your daily capacity is 3 units:  
              – One XL fills the day  
              – One large + one small fits  
              – Three small dogs also fits
            </li>
            <li>
              <strong>Pro Tip:</strong> Ideal for multi-dog households — the system checks capacity automatically.
            </li>
          </ul>
        </Section>

        {/* SCHEDULING */}
        <Section id="scheduling" title="Scheduling Clients">
          <ul>
            <li>
              Create appointments from <strong>Clients</strong>, <strong>Pets</strong>, or the
              <strong> Schedule</strong> page.
            </li>
            <li>Set pet, services, start time, duration, and notes.</li>
            <li>
              <strong>Quick Rebook:</strong> One tap to schedule their next visit.
            </li>
            <li>
              Schedule page includes:
              <ul className="list-disc ml-6 mt-1">
                <li>Tap to call or text</li>
                <li>Status indicators</li>
                <li>Search bar</li>
              </ul>
            </li>
            <li>
              <strong>Pro Tip:</strong> Add behavior tags (“Bites”, “Anxious”, “Matting Risk”) to trigger Smart Alerts.
            </li>
          </ul>
        </Section>

        {/* CONFIRMATION */}
        <Section id="confirmation" title="Confirmations & No-Shows">
          <ul>
            <li>Mark appointments as confirmed manually or via client email confirmations.</li>
            <li>Reminder emails include: time, details, your branding, and a confirmation link.</li>
            <li>No-shows are tracked separately for reporting & payment tracking.</li>
            <li>
              <strong>Best Practice:</strong> After two no-shows, many groomers require deposits.
            </li>
          </ul>
        </Section>

        {/* CONTACT SUPPORT */}
        <Section id="contact" title="Contact Support">
          <ContactForm />
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

/* Contact Form Component */
function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("sending");

    const res = await fetch("/.netlify/functions/contactSupport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message })
    });

    if (res.ok) {
      setStatus("success");
      setName("");
      setEmail("");
      setMessage("");
    } else {
      setStatus("error");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div>
        <label className="block text-sm font-medium mb-1">Your Name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Your Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Message</label>
        <textarea
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows="4"
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <button
        type="submit"
        className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700"
      >
        Send Message
      </button>

      {status === "sending" && (
        <p className="text-gray-500 text-sm mt-2">Sending...</p>
      )}
      {status === "success" && (
        <p className="text-green-600 text-sm mt-2">
          Message sent! We'll get back to you soon.
        </p>
      )}
      {status === "error" && (
        <p className="text-red-600 text-sm mt-2">
          Something went wrong. Please try again.
        </p>
      )}
    </form>
  );
}
