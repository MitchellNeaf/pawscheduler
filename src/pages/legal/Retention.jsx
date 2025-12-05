export default function Retention() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold mb-4">Data Retention Policy</h1>

      <p>
        We retain customer and appointment data for as long as your account is
        active.
      </p>

      <ul className="list-disc ml-6">
        <li>Deleted accounts → data removed within 90 days</li>
        <li>Billing records → retained up to 7 years (legal compliance)</li>
        <li>System logs → retained for security purposes for up to 12 months</li>
      </ul>

      <p>
        You may request deletion of your data at any time by contacting support.
      </p>
    </div>
  );
}
