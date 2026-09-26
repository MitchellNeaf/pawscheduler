// src/pages/WhatsNew.jsx
//
// "What's New" changelog page — logged-in customers only.
// Add a new entry to the top of RELEASES each time you ship something
// worth telling groomers about, then deploy. No DB, no migration.

const RELEASES = [
  {
    date: "2026-09-26",
    title: "Daycare with drop-off & pick-up times",
    items: [
      "New: mark any service as daycare (Profile → Services) with one flat price per day, and set how many daycare dogs you take at the same time (Profile → Schedule).",
      "Clients choose a drop-off and pick-up time on your booking page — only times with room are shown, so you're never overbooked.",
      "Daycare dogs have their own limit and never take up your grooming slots.",
      "Daycare requests show both drop-off and pick-up times when you review them, and clients see both in their emails.",
      "Daycare shows with a 🐕 badge on your Schedule, and route planning leaves daycare dogs out since they come to you.",
    ],
  },
  {
    date: "2026-09-25",
    title: "Scheduling fixes & smarter routes",
    items: [
      "Optimize Route now keeps timed appointments in time order and fits flexible ones in around them — with arrival estimates and a heads-up if a stop might run late.",
      "Days with 10 or more stops can now be route-optimized.",
      "Changing the date while booking or editing an appointment now shows that day's own hours and breaks.",
      "Your booking page no longer offers times that have already passed today.",
      "The AI booking bot now uses your time zone, so evening texts like \"book me tomorrow\" land on the right day.",
      "Cancellation emails from your booking page and the AI bot now reach you reliably.",
    ],
  },
  {
    date: "2026-09-23",
    title: "Smarter route planning + flexible appointments",
    items: [
      "Map view now remembers your optimized route for the day — reopen it and pick up where you left off, with a running \"Arrived — Next Stop\" tracker.",
      "New: mark an appointment as flexible timing instead of a fixed time, for days where you're deciding the order as you go.",
      "Route optimization limit raised on Growth (15 free per month) — unlimited on Pro.",
    ],
  },
  {
    date: "2026-09-15",
    title: "Report Cards",
    items: [
      "Send clients a quick before/after photo, mood tag, and note after every groom — delivered by text and email, no login required on their end.",
      "Available on Growth and Pro.",
    ],
  },
  {
    date: "2026-09-10",
    title: "Service areas & map view",
    items: [
      "See your clients on a map, color-coded by the day of the week you visit their area.",
      "Set a home base and get an optimized driving order for the day — just tap Directions to hand off to Google Maps.",
      "Available on Growth and Pro.",
    ],
  },
  {
    date: "2026-09-05",
    title: "Pricing update & Basic tier improvements",
    items: [
      "Basic plan price lowered to $19.99/mo.",
      "Custom intake form questions now available on Basic, not just Growth+.",
      "Grooming waivers confirmed available on every plan, including Free.",
      "Free accounts now get email appointment reminders (up to 25/month).",
    ],
  },
  {
    date: "2026-08-28",
    title: "Multi-pet appointments, cleaned up",
    items: [
      "Booking two pets from the same client for the same visit now shows as one combined card instead of two separate-looking bookings.",
      "Check-in, check-out, payment, and delete now apply to the whole group at once.",
    ],
  },
  {
    date: "2026-08-20",
    title: "Fewer missed reminders",
    items: [
      "Fixed a bug where a small number of clients could get a duplicate reminder text, or one missing its confirmation link.",
      "Your SMS inbox now shows client names correctly instead of a bare phone number after an automated reminder.",
    ],
  },
];

export default function WhatsNew() {
  return (
    <main className="min-h-screen bg-[var(--bg)] py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-[var(--text-1)]">What's New</h1>
          <p className="text-sm text-[var(--text-3)]">
            Recent updates to PawScheduler
          </p>
        </div>

        <div className="space-y-5">
          {RELEASES.map((release, i) => (
            <div key={i} className="card">
              <div className="card-body space-y-2.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">
                  {new Date(release.date + "T00:00:00").toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                </span>
                <h2 className="font-bold text-lg text-[var(--text-1)] leading-snug">
                  {release.title}
                </h2>
                <ul className="list-disc list-outside pl-5 space-y-1.5">
                  {release.items.map((item, j) => (
                    <li key={j} className="text-sm text-[var(--text-2)] leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-[var(--text-3)] text-center pt-2">
          Have a feature request? Reach out any time — most of what's on this page started as someone asking for it.
        </p>
      </div>
    </main>
  );
}