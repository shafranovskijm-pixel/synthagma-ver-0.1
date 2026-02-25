import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function base64Encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${base64Encode(subject)}?=`;
}

function encodeFromHeader(from: string): string {
  const match = from.match(/^(.+?)\s*<(.+)>$/);
  if (match) {
    return `=?UTF-8?B?${base64Encode(match[1].trim())}?= <${match[2].trim()}>`;
  }
  return from;
}

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  from?: string;
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
    const SMTP_FROM = Deno.env.get("SMTP_FROM") || "noreply@sintagma.com.ru";

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      console.error("SMTP credentials are not fully configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { to, subject, html, from }: EmailRequest = await req.json();

    // Rate limiting
    const rl = checkRateLimit(`email:${to}`, { maxRequests: 20, windowSeconds: 60 });
    if (!rl.allowed) {
      return rateLimitResponse(rl, corsHeaders);
    }

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, and html are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Sending email to:", to);
    console.log("Subject:", subject);

    const senderFrom = from ? `${from}` : SMTP_FROM;
    const encodedSubject = encodeSubject(subject);
    const encodedFrom = encodeFromHeader(senderFrom);
    const encodedHtml = base64Encode(html);

    const rawEmail = [
      `From: ${encodedFrom}`,
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      encodedHtml.match(/.{1,76}/g)?.join('\r\n') || encodedHtml,
    ].join('\r\n');

    const conn = await Deno.connectTls({
      hostname: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10),
    });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    async function readResponse(): Promise<string> {
      const buffer = new Uint8Array(4096);
      const n = await conn.read(buffer);
      if (n === null) return "";
      return decoder.decode(buffer.subarray(0, n));
    }

    async function sendCommand(cmd: string): Promise<string> {
      await conn.write(encoder.encode(cmd + "\r\n"));
      return await readResponse();
    }

    let response = await readResponse();
    console.log("Server greeting:", response.substring(0, 50));

    response = await sendCommand("EHLO localhost");
    response = await sendCommand("AUTH LOGIN");
    response = await sendCommand(btoa(SMTP_USER));
    response = await sendCommand(btoa(SMTP_PASS));

    const emailMatch = senderFrom.match(/<([^>]+)>/) || [null, senderFrom];
    const fromEmail = emailMatch[1] || senderFrom;

    response = await sendCommand(`MAIL FROM:<${fromEmail}>`);
    response = await sendCommand(`RCPT TO:<${to}>`);
    response = await sendCommand("DATA");

    await conn.write(encoder.encode(rawEmail + "\r\n.\r\n"));
    response = await readResponse();
    console.log("Email data response:", response.substring(0, 50));

    await sendCommand("QUIT");
    conn.close();

    console.log("Email sent successfully to:", to);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in send-email function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
