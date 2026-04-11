import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.49.4/cors";

function md5(str: string): string {
  // Use Web Crypto API for MD5-like hash
  // Robokassa requires MD5 specifically
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  let h0 = 0x67452301;
  let h1 = 0xEFCDAB89;
  let h2 = 0x98BADCFE;
  let h3 = 0x10325476;

  function leftRotate(x: number, c: number) {
    return (x << c) | (x >>> (32 - c));
  }

  const k = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);
  }

  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  // Pre-processing: adding padding bits
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[msgLen] = 0x80;

  // Append length in bits as 64-bit little-endian
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLen & 0xFFFFFFFF, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true);

  // Process each 64-byte chunk
  for (let offset = 0; offset < paddedLen; offset += 64) {
    const m = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      m[j] = view.getUint32(offset + j * 4, true);
    }

    let a = h0, b = h1, c = h2, d = h3;

    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const temp = d;
      d = c;
      c = b;
      b = (b + leftRotate((a + f + k[i] + m[g]) | 0, s[i])) | 0;
      a = temp;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
  }

  function toHex(n: number) {
    const bytes = [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
    return bytes.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { course_id, user_id, email } = await req.json();

    if (!course_id) {
      return new Response(JSON.stringify({ error: "course_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get course info
    const { data: course, error: courseErr } = await supabaseAdmin
      .from("courses")
      .select("id, title, price, organization_id")
      .eq("id", course_id)
      .single();

    if (courseErr || !course) {
      return new Response(JSON.stringify({ error: "Course not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!course.price || course.price <= 0) {
      return new Response(JSON.stringify({ error: "Course is free" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get payment settings for the organization
    const { data: settings, error: settingsErr } = await supabaseAdmin
      .rpc("get_decrypted_payment_settings", { p_organization_id: course.organization_id });

    if (settingsErr || !settings || settings.length === 0 || !settings[0].merchant_login) {
      return new Response(JSON.stringify({ error: "Payment not configured for this organization" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ps = settings[0];

    // Create payment record
    const { data: payment, error: payErr } = await supabaseAdmin
      .from("course_payments")
      .insert({
        organization_id: course.organization_id,
        course_id: course.id,
        user_id: user_id || null,
        amount: course.price,
        status: "pending",
        email: email || null,
      })
      .select("id")
      .single();

    if (payErr || !payment) {
      console.error("Payment insert error:", payErr);
      return new Response(JSON.stringify({ error: "Failed to create payment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate InvId from payment id (use last 8 chars of UUID as number)
    const invId = parseInt(payment.id.replace(/-/g, "").slice(0, 8), 16);

    // Update payment with invId
    await supabaseAdmin
      .from("course_payments")
      .update({ robokassa_inv_id: invId })
      .eq("id", payment.id);

    const outSum = Number(course.price).toFixed(2);
    const merchantLogin = ps.merchant_login;
    const password1 = ps.password1;

    // SignatureValue = MD5(MerchantLogin:OutSum:InvId:Password1)
    const signatureString = `${merchantLogin}:${outSum}:${invId}:${password1}`;
    const signatureValue = md5(signatureString);

    const isTest = ps.is_test_mode;
    const baseUrl = "https://auth.robokassa.ru/Merchant/Index.aspx";

    const params = new URLSearchParams({
      MerchantLogin: merchantLogin,
      OutSum: outSum,
      InvId: String(invId),
      Description: `Оплата курса: ${course.title}`,
      SignatureValue: signatureValue,
      Culture: "ru",
      Encoding: "utf-8",
    });

    if (isTest) {
      params.set("IsTest", "1");
    }

    if (email) {
      params.set("Email", email);
    }

    // Pass user_id and course_id as Shp parameters
    if (user_id) {
      params.set("Shp_user_id", user_id);
    }
    params.set("Shp_course_id", course_id);
    params.set("Shp_payment_id", payment.id);

    // Recalculate signature with Shp params (alphabetically sorted)
    const shpParams: string[] = [];
    if (user_id) shpParams.push(`Shp_course_id=${course_id}`);
    else shpParams.push(`Shp_course_id=${course_id}`);
    shpParams.push(`Shp_payment_id=${payment.id}`);
    if (user_id) shpParams.push(`Shp_user_id=${user_id}`);
    shpParams.sort();

    const signWithShp = `${merchantLogin}:${outSum}:${invId}:${password1}:${shpParams.join(":")}`;
    const signatureWithShp = md5(signWithShp);
    params.set("SignatureValue", signatureWithShp);

    const paymentUrl = `${baseUrl}?${params.toString()}`;

    return new Response(JSON.stringify({ url: paymentUrl, payment_id: payment.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("robokassa-init error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
