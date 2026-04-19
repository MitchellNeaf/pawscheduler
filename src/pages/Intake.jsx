// src/pages/Intake.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabase";

const SIZE_OPTIONS = [
  { value: 1, label: "Small / Medium (under 40 lbs)" },
  { value: 2, label: "Large (40–80 lbs)" },
  { value: 3, label: "XL (80+ lbs)" },
];

const TAG_OPTIONS = [
  "Bites", "Anxious", "Aggressive", "Senior",
  "Matting", "Arthritis", "Blind", "Deaf", "Allergies",
];

const labelCls = "block text-sm font-semibold text-[var(--text-2)] mb-1.5";
const inputCls = "w-full border border-[var(--border-med)] rounded-xl px-3 py-2.5 text-sm bg-[var(--surface)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition";
const sectionCls = "space-y-4";

export default function IntakePage() {
  const { slug } = useParams();

  const [groomer, setGroomer] = useState(null);
  const [pageError, setPageError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Client fields
  const [fullName, setFullName]   = useState("");
  const [phone, setPhone]         = useState("");
  const [email, setEmail]         = useState("");
  const [street, setStreet]       = useState("");
  const [city, setCity]           = useState("");
  const [state, setState]         = useState("");
  const [zip, setZip]             = useState("");

  // Emergency contact
  const [emergName, setEmergName] = useState("");
  const [emergPhone, setEmergPhone] = useState("");

  // Pet fields
  const [petName, setPetName]     = useState("");
  const [petBreed, setPetBreed]   = useState("");
  const [petSize, setPetSize]     = useState(1);
  const [petTags, setPetTags]     = useState([]);
  const [petNotes, setPetNotes]   = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("groomers")
        .select("id, full_name, slug, logo_url")
        .eq("slug", slug)
        .single();

      if (error || !data) {
        setPageError("Intake form not found.");
      } else {
        setGroomer(data);
      }
      setLoading(false);
    })();
  }, [slug]);

  const toggleTag = (tag) => {
    setPetTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    setSubmitError("");

    if (!fullName.trim()) { setSubmitError("Please enter your full name."); return; }
    if (!phone.trim())    { setSubmitError("Please enter your phone number."); return; }
    if (!petName.trim())  { setSubmitError("Please enter your pet's name."); return; }

    setSubmitting(true);

    try {
      const res = await fetch("/.netlify/functions/submitIntake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          client: { full_name: fullName, phone, email, street, city, state, zip },
          emergency: { name: emergName, phone: emergPhone },
          pet: {
            name: petName, breed: petBreed,
            slot_weight: petSize, tags: petTags, notes: petNotes,
          },
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setSubmitError(json.error || "Something went wrong. Please try again.");
      } else {
        setSubmitted(true);
      }
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <p className="text-[var(--text-3)]">Loading…</p>
      </main>
    );
  }

  if (pageError) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <p className="text-red-600 font-semibold">{pageError}</p>
      </main>
    );
  }

  // ── Success ───────────────────────────────────────────
  if (submitted) {
    return (
      <main className="min-h-screen bg-[var(--bg)] py-10 px-4">
        <div className="max-w-lg mx-auto text-center space-y-4">
          {groomer.logo_url && (
            <img src={groomer.logo_url} alt="Logo"
              className="w-16 h-16 rounded-full object-cover mx-auto ring-2 ring-[var(--border)] shadow-md" />
          )}
          <div className="text-5xl">🐾</div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">You're all set!</h1>
          <p className="text-[var(--text-2)]">
            Thanks <strong>{fullName.split(" ")[0]}</strong>! Your info and{" "}
            <strong>{petName}</strong>'s profile have been saved.{" "}
            {groomer.full_name} will be in touch to confirm your appointment.
          </p>
          <p className="text-sm text-[var(--text-3)]">
            You can close this page.
          </p>
        </div>
      </main>
    );
  }

  // ── Main form ─────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[var(--bg)] py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          {groomer.logo_url && (
            <img src={groomer.logo_url} alt="Logo"
              className="w-16 h-16 rounded-full object-cover mx-auto ring-2 ring-[var(--border)] shadow-md mb-3" />
          )}
          <h1 className="text-2xl font-bold text-[var(--text-1)]">New Client Intake</h1>
          <p className="text-sm text-[var(--text-3)]">
            {groomer.full_name} · Please fill out before your first appointment
          </p>
        </div>

        {/* ── SECTION 1: Your Info ── */}
        <div className="card">
          <div className="card-body space-y-4">
            <h2 className="font-bold text-[var(--text-1)] text-base">Your Information</h2>

            <div className={sectionCls}>
              <div>
                <label className={labelCls}>Full name <span className="text-red-500">*</span></label>
                <input className={inputCls} placeholder="e.g. Jane Smith"
                  value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Phone <span className="text-red-500">*</span></label>
                  <input className={inputCls} placeholder="814-555-1234"
                    value={phone} onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel" autoComplete="tel" />
                </div>
                <div>
                  <label className={labelCls}>Email <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input className={inputCls} placeholder="you@email.com" type="email"
                    value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
              </div>

              <div>
                <label className={labelCls}>Street address <span className="text-gray-400 font-normal">(optional)</span></label>
                <input className={inputCls} placeholder="123 Main St"
                  value={street} onChange={(e) => setStreet(e.target.value)} autoComplete="street-address" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className={labelCls}>City</label>
                  <input className={inputCls} placeholder="Altoona"
                    value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
                </div>
                <div>
                  <label className={labelCls}>State</label>
                  <input className={inputCls} placeholder="PA"
                    value={state} onChange={(e) => setState(e.target.value)} autoComplete="address-level1" maxLength={2} />
                </div>
                <div>
                  <label className={labelCls}>ZIP</label>
                  <input className={inputCls} placeholder="16601"
                    value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" autoComplete="postal-code" maxLength={5} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 2: Emergency Contact ── */}
        <div className="card">
          <div className="card-body space-y-4">
            <h2 className="font-bold text-[var(--text-1)] text-base">
              Emergency Contact
              <span className="ml-2 text-sm font-normal text-[var(--text-3)]">optional</span>
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Name</label>
                <input className={inputCls} placeholder="John Smith"
                  value={emergName} onChange={(e) => setEmergName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input className={inputCls} placeholder="814-555-9999"
                  value={emergPhone} onChange={(e) => setEmergPhone(e.target.value)} inputMode="tel" />
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 3: Pet Info ── */}
        <div className="card">
          <div className="card-body space-y-4">
            <h2 className="font-bold text-[var(--text-1)] text-base">Your Pet</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Dog's name <span className="text-red-500">*</span></label>
                <input className={inputCls} placeholder="e.g. Buddy"
                  value={petName} onChange={(e) => setPetName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Breed <span className="text-gray-400 font-normal">(optional)</span></label>
                <input className={inputCls} placeholder="e.g. Golden Retriever"
                  value={petBreed} onChange={(e) => setPetBreed(e.target.value)} />
              </div>
            </div>

            {/* Size */}
            <div>
              <label className={labelCls}>Size</label>
              <div className="grid grid-cols-3 gap-2">
                {SIZE_OPTIONS.map(({ value, label }) => (
                  <button key={value} type="button"
                    onClick={() => setPetSize(value)}
                    className={`py-2 px-2 rounded-xl border text-xs font-semibold transition-colors text-center
                      ${petSize === value
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "bg-[var(--surface)] border-[var(--border-med)] text-[var(--text-2)] hover:border-emerald-400"
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className={labelCls}>Behavioral notes <span className="text-gray-400 font-normal">(select all that apply)</span></label>
              <div className="flex flex-wrap gap-2">
                {TAG_OPTIONS.map((tag) => (
                  <button key={tag} type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors
                      ${petTags.includes(tag)
                        ? "bg-amber-500 border-amber-500 text-white"
                        : "bg-[var(--surface)] border-[var(--border-med)] text-[var(--text-2)] hover:border-amber-400"
                      }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={labelCls}>Additional notes <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea className={`${inputCls} resize-none`} rows={3}
                placeholder="Anything else we should know about your dog — medical conditions, fears, preferred handling, etc."
                value={petNotes} onChange={(e) => setPetNotes(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Error */}
        {submitError && (
          <p className="text-sm text-red-600 font-medium bg-red-50 rounded-xl px-4 py-3">
            {submitError}
          </p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3.5 rounded-xl font-bold text-sm transition
            bg-emerald-600 text-white border-2 border-emerald-600
            hover:bg-emerald-700 disabled:bg-gray-100 disabled:text-gray-400
            disabled:border-gray-200 disabled:cursor-not-allowed"
        >
          {submitting ? "Submitting…" : "Submit Intake Form"}
        </button>

        <p className="text-xs text-[var(--text-3)] text-center pb-4">
          Your information is shared only with {groomer.full_name} and is never sold or shared with third parties.
        </p>

      </div>
    </main>
  );
}