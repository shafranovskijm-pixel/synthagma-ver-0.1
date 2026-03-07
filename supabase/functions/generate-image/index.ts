import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateWithLovableAI(prompt: string, imageUrl: string | undefined, model: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const isEditing = !!imageUrl;
  const messageContent = isEditing
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageUrl } },
      ]
    : `Generate an image: ${prompt}. Make it high quality, clean, and suitable for an educational course.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: messageContent }],
      modalities: ["image", "text"],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw { status: 429, message: "Превышен лимит запросов, попробуйте позже" };
    if (response.status === 402) throw { status: 402, message: "Недостаточно средств для генерации" };
    const text = await response.text();
    console.error("AI gateway error:", response.status, text);
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const data = await response.json();
  const generatedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!generatedImageUrl) throw new Error("No image generated");
  return generatedImageUrl;
}

async function generateWithGigaChat(prompt: string, keySlot?: string) {
  // GigaChat uses its own auth flow to get an access token, then calls the image generation endpoint
  const envKey = keySlot === "KEY_2" ? "GIGACHAT_AUTH_KEY_2" : keySlot === "KEY_3" ? "GIGACHAT_AUTH_KEY_3" : "GIGACHAT_AUTH_KEY";
  const authKey = Deno.env.get(envKey);
  if (!authKey) throw new Error(`${envKey} is not configured`);

  // Step 1: Get access token
  const tokenRes = await fetch("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${authKey}`,
      RqUID: crypto.randomUUID(),
    },
    body: "scope=GIGACHAT_API_PERS",
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("GigaChat auth error:", tokenRes.status, text);
    throw new Error(`GigaChat auth error: ${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // Step 2: Ask GigaChat to generate an image via chat completions
  const chatRes = await fetch("https://gigachat.devices.sberbank.ru/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      model: "GigaChat",
      messages: [
        {
          role: "user",
          content: `Нарисуй изображение: ${prompt}. Сделай качественно, чисто, подходящее для образовательного курса.`,
        },
      ],
      function_call: "auto",
    }),
  });

  if (!chatRes.ok) {
    const text = await chatRes.text();
    console.error("GigaChat generation error:", chatRes.status, text);
    throw new Error(`GigaChat generation error: ${chatRes.status}`);
  }

  const chatData = await chatRes.json();
  const content = chatData.choices?.[0]?.message?.content || "";

  // Extract image file_id from the response (format: <img src="file_id" .../>)
  const fileIdMatch = content.match(/<img\s+src="([^"]+)"/);
  if (!fileIdMatch) {
    console.error("GigaChat response has no image:", content);
    throw new Error("GigaChat не сгенерировал изображение");
  }

  const fileId = fileIdMatch[1];

  // Step 3: Download the image by file_id
  const imageRes = await fetch(`https://gigachat.devices.sberbank.ru/api/v1/files/${fileId}/content`, {
    headers: {
      Accept: "application/jpg",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!imageRes.ok) {
    throw new Error(`GigaChat image download error: ${imageRes.status}`);
  }

  const imageBytes = new Uint8Array(await imageRes.arrayBuffer());
  // Return as base64 data URL — use chunked encoding to avoid stack overflow on large images
  let binary = "";
  for (let i = 0; i < imageBytes.length; i++) {
    binary += String.fromCharCode(imageBytes[i]);
  }
  const base64 = btoa(binary);
  return `data:image/jpeg;base64,${base64}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, imageUrl, provider, model, gigachat_key } = await req.json();
    if (!prompt) throw new Error("Prompt is required");

    const selectedProvider = provider || "lovable_ai";
    console.log(`Generating image with provider: ${selectedProvider}, prompt: ${prompt}`);

    let generatedImageUrl: string;

    if (selectedProvider === "gigachat") {
      generatedImageUrl = await generateWithGigaChat(prompt, gigachat_key);
    } else {
      generatedImageUrl = await generateWithLovableAI(prompt, imageUrl, model);
    }

    // Convert base64 to binary and upload to storage
    const base64Data = generatedImageUrl.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const ext = selectedProvider === "gigachat" ? "jpg" : "png";
    const fileName = `block-images/ai-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("course-files")
      .upload(fileName, binaryData, {
        contentType: `image/${ext === "jpg" ? "jpeg" : "png"}`,
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/course-files/${fileName}`;

    return new Response(JSON.stringify({ url: publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-image error:", e);
    const status = e?.status || 500;
    const message = e?.message || (e instanceof Error ? e.message : "Unknown error");
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
