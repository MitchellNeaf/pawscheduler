const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  const { id } = event.queryStringParameters;

  if (!id) {
    return {
      statusCode: 400,
      body: "Missing appointment ID."
    };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // mark confirmed
  const { error } = await supabase
    .from("appointments")
    .update({ confirmed: true })
    .eq("id", id);

  if (error) {
    return {
      statusCode: 500,
      body: "Failed to confirm appointment."
    };
  }

  // return success page
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    body: `
      <html>
        <body style="font-family: Arial; padding: 40px;">
          <h2>✅ Appointment Confirmed</h2>
          <p>Your appointment has been confirmed successfully.</p>
        </body>
      </html>
    `
  };
};
