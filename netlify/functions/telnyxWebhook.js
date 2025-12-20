const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  const body = JSON.parse(event.body || "{}");
  const text = body?.data?.payload?.text?.toUpperCase();
  const from = body?.data?.payload?.from?.phone_number;

  if (!text || !from) {
    return { statusCode: 200, body: "Ignored" };
  }

  if (text.includes("STOP")) {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await supabase
      .from("clients")
      .update({ sms_opt_in: false })
      .eq("phone", from);
  }

  return { statusCode: 200, body: "OK" };
};
