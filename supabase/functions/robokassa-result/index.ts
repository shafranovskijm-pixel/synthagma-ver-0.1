import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

function md5(str: string): string {
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

  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[msgLen] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLen & 0xFFFFFFFF, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    const m = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      m[j] = view.getUint32(offset + j * 4, true);
    }

    let a = h0, b = h1, c = h2, d = h3;

    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const temp = d; d = c; c = b;
      b = (b + leftRotate((a + f + k[i] + m[g]) | 0, s[i])) | 0;
      a = temp;
    }

    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
  }

  function toHex(n: number) {
    const bytes = [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
    return bytes.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3);
}

Deno.serve(async (req) => {
  // This is a webhook from Robokassa — no CORS needed, but handle both GET and POST
  try {
    let params: URLSearchParams;

    if (req.method === "POST") {
      const body = await req.text();
      params = new URLSearchParams(body);
    } else if (req.method === "GET") {
      params = new URL(req.url).searchParams;
    } else {
      return new Response("Method not allowed", { status: 405 });
    }

    const outSum = params.get("OutSum");
    const invId = params.get("InvId");
    const signatureValue = params.get("SignatureValue");
    const paymentId = params.get("Shp_payment_id");
    const courseId = params.get("Shp_course_id");
    const userId = params.get("Shp_user_id");

    if (!outSum || !invId || !signatureValue) {
      console.error("Missing required params:", { outSum, invId, signatureValue });
      return new Response("BAD REQUEST", { status: 400 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find payment to get organization_id
    let orgId: string | null = null;

    if (paymentId) {
      const { data: payment } = await supabaseAdmin
        .from("course_payments")
        .select("organization_id")
        .eq("id", paymentId)
        .single();
      orgId = payment?.organization_id || null;
    }

    if (!orgId && courseId) {
      const { data: course } = await supabaseAdmin
        .from("courses")
        .select("organization_id")
        .eq("id", courseId)
        .single();
      orgId = course?.organization_id || null;
    }

    if (!orgId) {
      console.error("Could not determine organization");
      return new Response("BAD REQUEST", { status: 400 });
    }

    // Get decrypted password2 for verification
    const { data: settings } = await supabaseAdmin
      .rpc("get_decrypted_payment_settings", { p_organization_id: orgId });

    if (!settings || settings.length === 0) {
      console.error("No payment settings for org:", orgId);
      return new Response("BAD REQUEST", { status: 400 });
    }

    const password2 = settings[0].password2;

    // Build Shp params string (alphabetically sorted)
    const shpParams: string[] = [];
    if (courseId) shpParams.push(`Shp_course_id=${courseId}`);
    if (paymentId) shpParams.push(`Shp_payment_id=${paymentId}`);
    if (userId) shpParams.push(`Shp_user_id=${userId}`);
    shpParams.sort();

    // Verify signature: MD5(OutSum:InvId:Password2:Shp_params)
    const signString = shpParams.length > 0
      ? `${outSum}:${invId}:${password2}:${shpParams.join(":")}`
      : `${outSum}:${invId}:${password2}`;
    
    const expectedSignature = md5(signString);

    if (signatureValue.toLowerCase() !== expectedSignature.toLowerCase()) {
      console.error("Signature mismatch:", {
        received: signatureValue,
        expected: expectedSignature,
        signString,
      });
      return new Response("BAD SIGN", { status: 400 });
    }

    // Signature valid — update payment
    if (paymentId) {
      await supabaseAdmin
        .from("course_payments")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          robokassa_inv_id: parseInt(invId),
        })
        .eq("id", paymentId);
    }

    // Auto-enroll user if user_id and course_id are present
    if (userId && courseId) {
      // Check if already enrolled
      const { data: existing } = await supabaseAdmin
        .from("enrollments")
        .select("id")
        .eq("user_id", userId)
        .eq("course_id", courseId)
        .maybeSingle();

      if (!existing) {
        await supabaseAdmin
          .from("enrollments")
          .insert({
            user_id: userId,
            course_id: courseId,
            status: "active",
            progress: 0,
          });
      }
    }

    // Robokassa requires response "OK{InvId}"
    return new Response(`OK${invId}`, {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (err) {
    console.error("robokassa-result error:", err);
    return new Response("INTERNAL ERROR", { status: 500 });
  }
});
