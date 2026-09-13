#!/usr/bin/env node

const TARGET_COURSE_ID = "7630559a-6caf-42e7-97f9-1cd0e4598c39";
const TARGET_USER_IDENTIFIER = "license_edu";
const EXPECTED_SUPABASE_ORIGIN = "https://atxwvjxbqjgkbjlhsdch.supabase.co";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const execute = process.argv.includes("--execute");
const revoke = process.argv.includes("--revoke");
const expiryArgument = process.argv.find((argument) => argument.startsWith("--expires-at="));
const expiresAt = expiryArgument?.slice("--expires-at=".length);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function validateExpiry(value) {
  if (!value) return "--expires-at=<ISO timestamp> is required for a grant";
  const expiryMs = Date.parse(value);
  const nowMs = Date.now();
  if (!Number.isFinite(expiryMs)) return "--expires-at must be a valid ISO timestamp";
  if (expiryMs <= nowMs) return "--expires-at must be in the future";
  if (expiryMs > nowMs + 30 * 24 * 60 * 60 * 1000) {
    return "--expires-at must be within the next 30 days";
  }
  return null;
}

const expiryError = revoke ? null : validateExpiry(expiresAt);
if (expiryError) {
  fail(expiryError);
} else {
  const action = revoke
    ? "admin_revoke_course_review_grant"
    : "admin_upsert_course_review_grant";
  const requestBody = revoke
    ? {
        p_course_id: TARGET_COURSE_ID,
        p_user_identifier: TARGET_USER_IDENTIFIER,
      }
    : {
        p_course_id: TARGET_COURSE_ID,
        p_user_identifier: TARGET_USER_IDENTIFIER,
        p_expires_at: new Date(expiresAt).toISOString(),
      };

  if (!execute) {
    console.log(JSON.stringify({
      status: "DRY_RUN_ONLY",
      action,
      request: requestBody,
      note: "No network request was made. Repeat with --execute and an authenticated admin token after release approval.",
    }, null, 2));
  } else {
    const supabaseUrl = process.env.SINTAGMA_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const publicKey = process.env.SINTAGMA_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const adminAccessToken = process.env.SINTAGMA_ADMIN_ACCESS_TOKEN;

    if (!supabaseUrl || !publicKey || !adminAccessToken) {
      fail("SINTAGMA_SUPABASE_URL, SINTAGMA_SUPABASE_ANON_KEY and SINTAGMA_ADMIN_ACCESS_TOKEN are required for --execute");
    } else {
      let parsedSupabaseUrl;
      try {
        parsedSupabaseUrl = new URL(supabaseUrl);
      } catch {
        fail("SINTAGMA_SUPABASE_URL is invalid");
      }

      if (
        !parsedSupabaseUrl
        || parsedSupabaseUrl.origin !== EXPECTED_SUPABASE_ORIGIN
        || parsedSupabaseUrl.username
        || parsedSupabaseUrl.password
        || parsedSupabaseUrl.pathname !== "/"
        || parsedSupabaseUrl.search
        || parsedSupabaseUrl.hash
      ) {
        fail(`SINTAGMA_SUPABASE_URL must be exactly ${EXPECTED_SUPABASE_ORIGIN}`);
      } else {
      const response = await fetch(
        `${EXPECTED_SUPABASE_ORIGIN}/rest/v1/rpc/${action}`,
        {
          method: "POST",
          headers: {
            apikey: publicKey,
            Authorization: `Bearer ${adminAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
      );

      const responseText = await response.text();
      if (!response.ok) {
        fail(`Reviewer access RPC failed with HTTP ${response.status}: ${responseText}`);
      } else {
        let result;
        try {
          result = JSON.parse(responseText);
        } catch {
          fail("Reviewer access RPC returned a non-JSON response");
        }

        if (!result || typeof result !== "object" || Array.isArray(result)) {
          fail("Reviewer access RPC must return one non-null JSON object");
        } else {
          const commonResponseIsValid = result.course_id === TARGET_COURSE_ID
            && UUID_PATTERN.test(result.user_id || "");
          const modeResponseIsValid = revoke
            ? Number.isFinite(Date.parse(result.revoked_at))
            : Date.parse(result.expires_at) === Date.parse(requestBody.p_expires_at)
              && result.revoked_at === null;
          if (!commonResponseIsValid || !modeResponseIsValid) {
            fail("Reviewer access RPC response failed exact course/user/lifecycle verification");
          } else {
            console.log(JSON.stringify({
              status: revoke ? "REVOKE_VERIFIED" : "GRANT_VERIFIED",
              action,
              result,
            }, null, 2));
          }
        }
      }
      }
    }
  }
}
