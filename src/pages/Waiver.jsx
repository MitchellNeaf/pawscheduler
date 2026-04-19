// src/pages/Waiver.jsx
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../supabase";

/* ── Default waiver template ──────────────────────────────
   Groomer can customize this in the future via their profile.
   For now it's a solid standard grooming liability release.
─────────────────────────────────────────────────────────── */
const WAIVER_SECTIONS = [
  {
    title: "General Authorization",
    body: `I authorize the groomer to perform grooming services on my pet(s). I confirm that my pet(s) is/are current on all required vaccinations, including rabies, and I agree to provide proof upon request. I understand that grooming may be stressful for some animals and agree to disclose any known behavioral issues, medical conditions, or physical limitations prior to grooming.`,
  },
  {
    title: "Medical & Emergency Authorization",
    body: `In the event of a medical emergency, I authorize the groomer to seek veterinary care for my pet at my expense. I understand that every effort will be made to contact me first. I release the groomer from financial responsibility for emergency veterinary costs incurred on my behalf.`,
  },
  {
    title: "Matting & Coat Condition",
    body: `I understand that severely matted coats may require shaving for the health and comfort of my pet. Dematting can be painful and stressful, and in some cases the groomer may determine it is not in the animal's best interest to dematt. If shaving is required, I authorize this procedure. I release the groomer from any liability for skin conditions revealed after coat removal, including but not limited to irritation, sores, or pre-existing conditions.`,
  },
  {
    title: "Senior & Special Needs Pets",
    body: `I understand that grooming older, ill, or medically fragile pets carries additional risk. Grooming procedures may expose pre-existing conditions or aggravate existing health issues. I agree that the groomer will exercise reasonable care but cannot be held liable for conditions related to my pet's age or health status.`,
  },
  {
    title: "Accidents & Liability",
    body: `I understand that accidents can occur during grooming. The groomer will exercise all reasonable care. However, I release the groomer from liability for minor nicks, cuts, or abrasions that may occur during grooming, particularly in difficult areas such as pads, ears, and around the face. In the event of a serious injury, the groomer will attempt to contact me immediately.`,
  },
  {
    title: "Aggressive or Difficult Pets",
    body: `I understand that if my pet exhibits aggressive or dangerous behavior, the groomer reserves the right to stop the grooming session and return my pet to me without completing services. A handling fee may apply. I accept full financial responsibility for any injuries caused by my pet to the groomer or staff.`,
  },
  {
    title: "Photography",
    body: `I authorize the groomer to photograph or video my pet before, during, or after grooming for business purposes including social media and marketing. I understand no personally identifiable information will be shared without my consent.`,
  },
  {
    title: "Agreement",
    body: `By signing below, I confirm that I am the legal owner or authorized agent for the pet(s) described, that all information provided is accurate, and that I have read and agree to all terms of this grooming release and waiver.`,
  },
];

export default function WaiverPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("cid") || null;

  const [groomer, setGroomer] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [signerName, setSignerName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Load groomer by slug
  useEffect(() => {
    (async () => {
      const { data, error: gErr } = await supabase
        .from("groomers")
        .select("id, full_name, slug, logo_url")
        .eq("slug", slug)
        .single();

      if (gErr || !data) {
        setError("Waiver page not found.");
      } else {
        setGroomer(data);
      }
      setLoading(false);
    })();
  }, [slug]);

  const handleSign = async () => {
    if (!signerName.trim()) {
      setSubmitError("Please type your full name to sign.");
      return;
    }
    if (!agreed) {
      setSubmitError("Please check the box to confirm you agree.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch("/.netlify/functions/signWaiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, signerName: signerName.trim(), clientId }),
      });

      const json = await res.json();

      if (!res.ok) {
        setSubmitError(json.error || "Something went wrong. Please try again.");
      } else {
        setSigned(true);
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

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <p className="text-red-600 font-semibold">{error}</p>
      </main>
    );
  }

  // ── Success state ──────────────────────────────────────
  if (signed) {
    return (
      <main className="min-h-screen bg-[var(--bg)] py-10 px-4">
        <div className="max-w-lg mx-auto text-center space-y-4">
          {groomer.logo_url && (
            <img src={groomer.logo_url} alt="Logo"
              className="w-16 h-16 rounded-full object-cover mx-auto ring-2 ring-[var(--border)] shadow-md" />
          )}
          <div className="text-5xl">✅</div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Waiver Signed!</h1>
          <p className="text-[var(--text-2)]">
            Thank you, <strong>{signerName}</strong>. Your grooming waiver for{" "}
            <strong>{groomer.full_name}</strong> has been recorded.
          </p>
          <p className="text-sm text-[var(--text-3)]">
            Signed on {new Date().toLocaleDateString("en-US", {
              weekday: "long", year: "numeric", month: "long", day: "numeric",
            })}
          </p>
        </div>
      </main>
    );
  }

  // ── Main waiver page ───────────────────────────────────
  return (
    <main className="min-h-screen bg-[var(--bg)] py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          {groomer.logo_url && (
            <img src={groomer.logo_url} alt="Logo"
              className="w-16 h-16 rounded-full object-cover mx-auto ring-2 ring-[var(--border)] shadow-md mb-3" />
          )}
          <h1 className="text-2xl font-bold text-[var(--text-1)]">
            Grooming Release & Waiver
          </h1>
          <p className="text-sm text-[var(--text-3)]">
            {groomer.full_name} · Please read carefully and sign below
          </p>
        </div>

        {/* Waiver sections */}
        <div className="card space-y-5">
          <div className="card-body space-y-5">
            {WAIVER_SECTIONS.map((section, i) => (
              <div key={i}>
                <h2 className="font-semibold text-sm text-[var(--text-1)] mb-1">
                  {i + 1}. {section.title}
                </h2>
                <p className="text-sm text-[var(--text-2)] leading-relaxed">
                  {section.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Signature section */}
        <div className="card">
          <div className="card-body space-y-4">
            <h2 className="font-bold text-[var(--text-1)]">Sign Below</h2>

            <div>
              <label className="block text-sm font-semibold text-[var(--text-2)] mb-1.5">
                Full name (typed signature)
              </label>
              <input
                type="text"
                placeholder="e.g. Jane Smith"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="w-full border border-[var(--border-med)] rounded-xl px-3 py-2.5 text-sm bg-[var(--surface)] text-[var(--text-1)]"
                autoComplete="name"
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded accent-emerald-500 flex-shrink-0"
              />
              <span className="text-sm text-[var(--text-2)] leading-relaxed">
                I have read and understand the grooming release and waiver above.
                I agree to all terms and confirm I am the legal owner or authorized
                agent for the pet(s) being groomed.
              </span>
            </label>

            {submitError && (
              <p className="text-sm text-red-600 font-medium bg-red-50 rounded-xl px-3 py-2">
                {submitError}
              </p>
            )}

            <button
              onClick={handleSign}
              disabled={submitting || !signerName.trim() || !agreed}
              className="w-full py-3 rounded-xl bg-[var(--brand)] text-white font-bold text-sm
                hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {submitting ? "Signing…" : "✍️ Sign Waiver"}
            </button>

            <p className="text-xs text-[var(--text-3)] text-center">
              Your name and the date/time of signing will be recorded.
              This constitutes a legally binding electronic signature.
            </p>
          </div>
        </div>

      </div>
    </main>
  );
}