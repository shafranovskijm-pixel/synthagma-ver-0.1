import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvitationRequest {
  email: string;
  courseName: string;
  courseId: string;
  organizationName: string;
  registrationToken?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured. Please add it in project settings.");
    }

    const { email, courseName, courseId, organizationName, registrationToken }: InvitationRequest = await req.json();

    console.log("Sending invitation to:", email, "for course:", courseName);

    const baseUrl = req.headers.get("origin") || "https://your-app.lovable.app";
    
    let inviteLink: string;
    if (registrationToken) {
      inviteLink = `${baseUrl}/join/${registrationToken}?course=${courseId}`;
    } else {
      inviteLink = `${baseUrl}/login?redirect=/course/${courseId}`;
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Обучение <onboarding@resend.dev>",
        to: [email],
        subject: `Приглашение на курс: ${courseName}`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:30px;border-radius:12px 12px 0 0;text-align:center}.content{background:#f9fafb;padding:30px;border-radius:0 0 12px 12px}.button{display:inline-block;background:#6366f1;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;margin:20px 0}.footer{text-align:center;margin-top:20px;color:#666;font-size:14px}</style></head><body><div class="container"><div class="header"><h1>📚 Приглашение на курс</h1></div><div class="content"><p>Здравствуйте!</p><p>Вас приглашают на курс <strong>"${courseName}"</strong> от компании <strong>${organizationName}</strong>.</p><p>Чтобы начать обучение, нажмите на кнопку ниже:</p><p style="text-align:center"><a href="${inviteLink}" class="button">Перейти к курсу</a></p><p>Или скопируйте эту ссылку в браузер:</p><p style="word-break:break-all;background:#e5e7eb;padding:10px;border-radius:4px;font-size:12px">${inviteLink}</p></div><div class="footer"><p>Это автоматическое сообщение. Пожалуйста, не отвечайте на него.</p></div></div></body></html>`,
      }),
    });

    const result = await emailResponse.json();
    
    if (!emailResponse.ok) {
      console.error("Resend API error:", result);
      throw new Error(result.message || "Failed to send email");
    }

    console.log("Invitation email sent successfully:", result);

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending invitation:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
