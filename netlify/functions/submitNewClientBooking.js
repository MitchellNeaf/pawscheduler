/**
 * submitNewClientBooking.js — Netlify function
 *
 * Creates a client + pet record for someone who isn't an existing client
 * yet, so they can then proceed through the normal booking flow as if
 * they'd just logged in — gated behind groomer.allow_new_clients.
 *
 * Appointment creation itself is NOT handled here — the frontend takes
 * the returned client/pet and continues into the existing, already-
 * tested slot-picker flow, which enforces its own safety rule: a new
 * client's first booking always requires approval, regardless of the
 * groomer's normal auto-confirm setting.
 *
 * POST body:
 *   {
 *     slug: string,
 *     client: { full_name, phone, email, sms_opt_in },
 *     pet: { name, breed, size_category }
 *   }
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizePhone(input) {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let slug, clientData, petData;
  try {
    ({ slug, client: clientData, pet: petData } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!slug || !clientData?.full_name || !clientData?.phone || !petData?.name) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  const normalizedPhone = normalizePhone(clientData.phone);
  if (!normalizedPhone) {
    return { statusCode: 400, body: JSON.stringify({ error: "Please enter a valid US phone number." }) };
  }

  try {
    const { data: groomer, error: groomerErr } = await supabase
      .from("groomers")
      .select("id, allow_new_clients")
      .eq("slug", slug)
      .single();

    if (groomerErr || !groomer) {
      return { statusCode: 404, body: JSON.stringify({ error: "Groomer not found." }) };
    }

    // Server-side gate — never trust this was actually checked client-side
    if (!groomer.allow_new_clients) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "This groomer isn't accepting new client bookings online right now. Please contact them directly." }),
      };
    }

    // Find or create the client — someone claiming to be "new" might
    // actually already exist, so reuse their record rather than duplicate.
    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("groomer_id", groomer.id)
      .eq("phone", normalizedPhone)
      .maybeSingle();

    let clientId = existingClient?.id;

    if (!clientId) {
      const { data: newClient, error: clientErr } = await supabase
        .from("clients")
        .insert({
          groomer_id: groomer.id,
          full_name: clientData.full_name.trim(),
          phone: normalizedPhone,
          email: clientData.email?.trim() || null,
          sms_opt_in: clientData.sms_opt_in === true,
        })
        .select("id, full_name, phone, email")
        .single();

      if (clientErr) {
        console.error("Failed to create client:", clientErr.message);
        return { statusCode: 500, body: JSON.stringify({ error: "Could not create your client record. Please try again." }) };
      }
      clientId = newClient.id;
    }

    // Find or create the pet
    const { data: existingPet } = await supabase
      .from("pets")
      .select("id, name, size_category")
      .eq("client_id", clientId)
      .eq("groomer_id", groomer.id)
      .ilike("name", petData.name.trim())
      .maybeSingle();

    let pet = existingPet;

    if (!pet) {
      const { data: newPet, error: petErr } = await supabase
        .from("pets")
        .insert({
          groomer_id: groomer.id,
          client_id: clientId,
          name: petData.name.trim(),
          breed: petData.breed?.trim() || null,
          size_category: petData.size_category || 1,
        })
        .select("id, name, size_category")
        .single();

      if (petErr) {
        console.error("Failed to create pet:", petErr.message);
        return { statusCode: 500, body: JSON.stringify({ error: "Could not create your pet's profile. Please try again." }) };
      }
      pet = newPet;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        client: { id: clientId, full_name: clientData.full_name.trim(), phone: normalizedPhone, email: clientData.email || null },
        pet,
      }),
    };
  } catch (err) {
    console.error("submitNewClientBooking fatal error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Something went wrong." }) };
  }
};