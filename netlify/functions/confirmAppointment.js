const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  const { id } = event.queryStringParameters;

  if (!id) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: `
        <html><body style="font-family:Arial;padding:40px;">
          <h2>❌ Missing Appointment ID</h2>
          <p>We couldn't process your confirmation because no appointment ID was provided.</p>
        </body></html>
      `
    };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error } = await supabase
    .from("appointments")
    .update({ confirmed: true })
    .eq("id", id);

  if (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: `
        <html><body style="font-family:Arial;padding:40px;">
          <h2>❌ Could Not Confirm Appointment</h2>
          <p>Something went wrong while confirming your appointment. Please contact your groomer.</p>
        </body></html>
      `
    };
  }

  // SUCCESS PAGE (nicely styled)
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: `
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; background:#f7f7f7;">
          <div style="max-width:600px;margin:auto;background:#ffffff;padding:30px;border-radius:12px;box-shadow:0 4px 10px rgba(0,0,0,0.1);">
            
            <h2 style="color:#2E7D32; font-size:26px; margin-top:0;">
              ✅ Appointment Confirmed
            </h2>

            <p style="font-size:17px; line-height:1.6; margin-bottom:25px;">
              Thank you! Your grooming appointment has been successfully confirmed.  
            </p>

            <p style="font-size:15px; color:#555;">
              If you need to make any changes, please contact your groomer directly.
            </p>

            <hr style="margin:30px 0; border:none; border-top:1px solid #ddd;" />

            <p style="font-size:14px; color:#777;">
              You may now close this window.
            </p>

          </div>
        </body>
      </html>
    `
  };
};
