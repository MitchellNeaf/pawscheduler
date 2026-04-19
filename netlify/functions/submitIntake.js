/**
 * submitIntake.js — Netlify function
 *
 * Handles new client intake form submission.
 *
 * POST body:
 *   {
 *     slug: string,
 *     client: { full_name, phone, email, street, city, state, zip },
 *     emergency: { name, phone },
 *     pet: { name, breed, slot_weight, age_years, notes, tags }
 *   }
 *
 * Flow:
 *   1. Load groomer by slug
 *   2. Match client by phone — update if exists, create if not
 *   3. Match pet by name within client — update if exists, create if not
 *   4. Save emergency contact + extra info to client notes
 *   5. Email groomer notification
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Normalize US phone to E164
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

  let slug, clientData, emergencyData, petData;
  try {
    ({ slug, client: clientData, emergency: emergencyData, pet: petData } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!slug || !clientData?.full_name || !clientData?.phone) {
    return { statusCode: 400, body: JSON.stringify({ error: "slug, client name and phone are required" }) };
  }

  // ── Load groomer ────────────────────────────────────────
  const { data: groomer, error: groomerErr } = await supabase
    .from("groomers")
    .select("id, full_name, business_name, email, slug")
    .eq("slug", slug)
    .single();

  if (groomerErr || !groomer) {
    return { statusCode: 404, body: JSON.stringify({ error: "Groomer not found" }) };
  }

  const normalizedPhone = normalizePhone(clientData.phone);
  if (!normalizedPhone) {
    return { statusCode: 422, body: JSON.stringify({ error: "Invalid phone number. Please use a 10-digit US number." }) };
  }

  // Build emergency contact note
  const emergencyNote = emergencyData?.name
    ? `Emergency contact: ${emergencyData.name}${emergencyData.phone ? ` — ${emergencyData.phone}` : ""}`
    : null;

  // ── Match or create client ──────────────────────────────
  const { data: existingClients } = await supabase
    .from("clients")
    .select("*")
    .eq("groomer_id", groomer.id)
    .eq("phone", normalizedPhone);

  let client;
  const clientPayload = {
    full_name: clientData.full_name.trim(),
    phone:     normalizedPhone,
    email:     clientData.email?.trim() || null,
    street:    clientData.street?.trim() || null,
    city:      clientData.city?.trim() || null,
    state:     clientData.state?.trim() || null,
    zip:       clientData.zip?.trim() || null,
    ...(emergencyNote ? { notes: emergencyNote } : {}),
  };

  if (existingClients?.length > 0) {
    // Update existing client
    const { data: updated, error: updateErr } = await supabase
      .from("clients")
      .update(clientPayload)
      .eq("id", existingClients[0].id)
      .select()
      .single();

    if (updateErr) {
      console.error("Client update error:", updateErr);
      return { statusCode: 500, body: JSON.stringify({ error: "Could not update client record." }) };
    }
    client = updated;
  } else {
    // Create new client
    const { data: created, error: createErr } = await supabase
      .from("clients")
      .insert({ ...clientPayload, groomer_id: groomer.id })
      .select()
      .single();

    if (createErr) {
      console.error("Client create error:", createErr);
      return { statusCode: 500, body: JSON.stringify({ error: "Could not create client record." }) };
    }
    client = created;
  }

  // ── Match or create pet ─────────────────────────────────
  let pet = null;
  if (petData?.name?.trim()) {
    const { data: existingPets } = await supabase
      .from("pets")
      .select("*")
      .eq("client_id", client.id)
      .eq("groomer_id", groomer.id)
      .ilike("name", petData.name.trim());

    const petPayload = {
      name:        petData.name.trim(),
      breed:       petData.breed?.trim() || null,
      slot_weight: petData.slot_weight || 1,
      notes:       petData.notes?.trim() || null,
      tags:        petData.tags?.length ? petData.tags : null,
      client_id:   client.id,
      groomer_id:  groomer.id,
    };

    if (existingPets?.length > 0) {
      // Update existing pet
      const { data: updatedPet } = await supabase
        .from("pets")
        .update(petPayload)
        .eq("id", existingPets[0].id)
        .select()
        .single();
      pet = updatedPet;
    } else {
      // Create new pet
      const { data: createdPet } = await supabase
        .from("pets")
        .insert(petPayload)
        .select()
        .single();
      pet = createdPet;
    }
  }

  // ── Email groomer notification (fire-and-forget) ────────
  const groomerName = groomer.business_name || groomer.full_name || "Groomer";
  const siteUrl = process.env.URL || "https://app.pawscheduler.app";

  if (groomer.email) {
    fetch(`${siteUrl}/.netlify/functions/sendEmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: groomer.email,
        subject: `📋 New intake — ${clientData.full_name.trim()}${pet ? ` & ${pet.name}` : ""}`,
        template: "intake_notification",
        data: {
          groomer_id:      groomer.id,
          groomer_name:    groomerName,
          client_name:     client.full_name,
          client_phone:    client.phone || "—",
          client_email:    client.email || "—",
          client_address:  [client.street, client.city, client.state, client.zip].filter(Boolean).join(", ") || "—",
          emergency_contact: emergencyNote || "—",
          pet_name:        pet?.name || "—",
          pet_breed:       pet?.breed || "—",
          pet_size:        pet?.slot_weight === 3 ? "XL" : pet?.slot_weight === 2 ? "Large" : "Small/Medium",
          pet_tags:        pet?.tags?.join(", ") || "None",
          pet_notes:       pet?.notes || "—",
          is_new_client:   existingClients?.length > 0 ? "Existing client (updated)" : "New client",
        },
      }),
    }).catch(() => {});
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      clientId: client.id,
      petId: pet?.id || null,
      isNewClient: !existingClients?.length,
    }),
  };
};