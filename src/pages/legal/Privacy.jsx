export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
      <p>Last updated: {new Date().getFullYear()}</p>

      <h2 className="text-xl font-semibold">Information We Collect</h2>
      <p>
        We collect account information (name, email, business details),
        appointment and client data, and device usage information.
      </p>

      <h2 className="text-xl font-semibold">How We Use Data</h2>
      <ul className="list-disc ml-6">
        <li>Provide and improve the Service</li>
        <li>Send confirmations and reminders</li>
        <li>Process payments</li>
        <li>Provide customer support</li>
      </ul>

      <h2 className="text-xl font-semibold">Data Sharing</h2>
      <p>
        We share data only with trusted partners needed to operate the Service
        (hosting, payment processors, email delivery). We do not sell personal
        data.
      </p>

      <h2 className="text-xl font-semibold">Your Rights</h2>
      <p>
        You may request access, correction, export, or deletion of your data at
        any time.
      </p>

      <h2 className="text-xl font-semibold">Security</h2>
      <p>
        We take reasonable steps to protect your information but cannot
        guarantee absolute security.
      </p>
    </div>
  );
}
