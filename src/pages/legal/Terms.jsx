export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold mb-4">Terms of Service</h1>
      <p>Last updated: {new Date().getFullYear()}</p>

      <p>
        Welcome to PawScheduler. By accessing or using our website, mobile
        interfaces, or services (“Service”), you agree to be bound by these
        Terms. If you do not agree, do not use the Service.
      </p>

      <h2 className="text-xl font-semibold">1. Eligibility</h2>
      <p>You must be at least 18 years old to use PawScheduler.</p>

      <h2 className="text-xl font-semibold">2. Your Account</h2>
      <p>
        You are responsible for maintaining the confidentiality of your login
        information and all activity under your account.
      </p>

      <h2 className="text-xl font-semibold">3. Acceptable Use</h2>
      <p>
        You may not misuse the service, attempt to access unauthorized data, or
        use PawScheduler for unlawful purposes.
      </p>

      <h2 className="text-xl font-semibold">4. Appointments & Client Data</h2>
      <p>
        You are solely responsible for appointments, grooming outcomes, pricing,
        and interactions with your customers. PawScheduler provides scheduling
        tools but does not mediate disputes.
      </p>

      <h2 className="text-xl font-semibold">5. Payments & Subscriptions</h2>
      <p>
        Paid plans are billed in advance and are non-refundable except where
        required by law.
      </p>

      <h2 className="text-xl font-semibold">6. Service Availability</h2>
      <p>
        We do not guarantee uninterrupted access or error-free operation.
      </p>

      <h2 className="text-xl font-semibold">7. Intellectual Property</h2>
      <p>
        PawScheduler retains all rights to its software, branding, and content.
      </p>

      <h2 className="text-xl font-semibold">8. Limitation of Liability</h2>
      <p>
        PawScheduler is not liable for lost revenue, missed appointments,
        overbooking, or customer actions.
      </p>

      <h2 className="text-xl font-semibold">9. Termination</h2>
      <p>
        We may suspend or terminate accounts that violate these Terms.
      </p>

      <h2 className="text-xl font-semibold">10. Changes to Terms</h2>
      <p>
        We may update these Terms. Continued use of the Service means acceptance.
      </p>
    </div>
  );
}
