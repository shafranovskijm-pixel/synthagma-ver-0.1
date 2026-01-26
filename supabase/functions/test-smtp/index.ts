import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Base64 encode for UTF-8 strings
function base64Encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

// Encode subject for email (RFC 2047)
function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${base64Encode(subject)}?=`;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SMTP_HOST = Deno.env.get("SMTP_HOST");
    const SMTP_PORT = Deno.env.get("SMTP_PORT");
    const SMTP_USER = Deno.env.get("SMTP_USER");
    const SMTP_PASS = Deno.env.get("SMTP_PASS");
    const SMTP_FROM = Deno.env.get("SMTP_FROM");

    console.log("SMTP Config:", { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_FROM });

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
      return new Response(
        JSON.stringify({ error: "SMTP credentials are not fully configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { to } = await req.json();

    if (!to) {
      return new Response(
        JSON.stringify({ error: "Missing 'to' email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Sending test email to:", to);

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body>
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #6366f1;">SMTP работает!</h1>
    <p>Это тестовое письмо для проверки настроек SMTP.</p>
    <p>Если вы видите это сообщение, значит конфигурация корректна.</p>
    <hr style="border: 1px solid #e2e8f0; margin: 20px 0;">
    <p style="color: #64748b; font-size: 12px;">
      Отправлено: ${new Date().toLocaleString('ru-RU')}<br>
      SMTP сервер: ${SMTP_HOST}:${SMTP_PORT}
    </p>
  </div>
</body>
</html>`;

    // Build raw email with proper encoding
    const boundary = "----=_Part_" + Date.now();
    const encodedSubject = encodeSubject("Тестовое письмо - SMTP проверка");
    const encodedHtml = base64Encode(htmlContent);
    
    const rawEmail = [
      `From: ${SMTP_FROM}`,
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      encodedHtml.match(/.{1,76}/g)?.join('\r\n') || encodedHtml,
    ].join('\r\n');

    // Connect via TLS
    const conn = await Deno.connectTls({
      hostname: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10),
    });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    async function readResponse(): Promise<string> {
      const buffer = new Uint8Array(1024);
      const n = await conn.read(buffer);
      if (n === null) return "";
      return decoder.decode(buffer.subarray(0, n));
    }

    async function sendCommand(cmd: string): Promise<string> {
      await conn.write(encoder.encode(cmd + "\r\n"));
      return await readResponse();
    }

    // SMTP handshake
    let response = await readResponse();
    console.log("Server greeting:", response);

    response = await sendCommand(`EHLO localhost`);
    console.log("EHLO response:", response);

    // AUTH LOGIN
    response = await sendCommand(`AUTH LOGIN`);
    console.log("AUTH response:", response);

    response = await sendCommand(btoa(SMTP_USER));
    console.log("User response:", response);

    response = await sendCommand(btoa(SMTP_PASS));
    console.log("Pass response:", response);

    // Extract email from SMTP_FROM (may contain display name)
    const emailMatch = SMTP_FROM.match(/<([^>]+)>/) || [null, SMTP_FROM];
    const fromEmail = emailMatch[1] || SMTP_FROM;

    // MAIL FROM
    response = await sendCommand(`MAIL FROM:<${fromEmail}>`);
    console.log("MAIL FROM response:", response);

    // RCPT TO
    response = await sendCommand(`RCPT TO:<${to}>`);
    console.log("RCPT TO response:", response);

    // DATA
    response = await sendCommand(`DATA`);
    console.log("DATA response:", response);

    // Send email content
    await conn.write(encoder.encode(rawEmail + "\r\n.\r\n"));
    response = await readResponse();
    console.log("Email data response:", response);

    // QUIT
    response = await sendCommand(`QUIT`);
    console.log("QUIT response:", response);

    conn.close();

    console.log("Test email sent successfully to:", to);

    return new Response(
      JSON.stringify({ success: true, message: `Email sent to ${to}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in test-smtp function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
