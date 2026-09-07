import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import webpush from "npm:web-push@3.6.7";
import { timingSafeEqual } from "node:crypto";

const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const hosts = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const { data: config, error: configError } = await db.from("push_settings").select("worker_secret,public_key,private_key").eq("id", true).single();
  if (configError) return new Response("Unavailable", { status: 503 });
  const supplied = new TextEncoder().encode(request.headers.get("x-push-secret") ?? "");
  const expected = new TextEncoder().encode(config.worker_secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response("Unauthorized", { status: 401 });

  try {
    if (!config.public_key) {
      const keys = webpush.generateVAPIDKeys();
      const { error } = await db.from("push_settings").update({ public_key: keys.publicKey, private_key: keys.privateKey }).eq("id", true).is("public_key", null);
      if (error) throw new Error("Key initialization failed");
      const { data, error: reloadError } = await db.from("push_settings").select("public_key,private_key").eq("id", true).single();
      if (reloadError || !data?.public_key) throw new Error("Key reload failed");
      config.public_key = data.public_key;
      config.private_key = data.private_key;
    }
    const { data: jobs, error } = await db.rpc("claim_participant_push");
    if (error) throw new Error("Queue claim failed");
    let sent = 0;
    await Promise.all(jobs.map(async (job) => {
      try {
        const url = new URL(job.endpoint);
        if (url.protocol !== "https:" || !hosts.has(url.hostname) || url.port || url.username || url.password) throw new Error("Invalid endpoint");
        const link = /^\/events\/[0-9a-f-]+$/i.test(job.link) ? job.link : "/notifications";
        await webpush.sendNotification({ endpoint: job.endpoint, keys: job.keys }, JSON.stringify({
          title: job.title, body: job.message, url: link, tag: job.id,
        }), {
          vapidDetails: { subject: Deno.env.get("SUPABASE_URL"), publicKey: config.public_key, privateKey: config.private_key },
          TTL: 3600, urgency: "normal", timeout: 10000,
        });
        const { error: ackError } = await db.from("push_deliveries").update({ sent_at: new Date().toISOString(), last_error: null }).eq("id", job.id);
        if (ackError) throw new Error("Delivery acknowledgement failed");
        sent++;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await db.from("push_subscriptions").delete().eq("id", job.subscriptionId);
        } else {
          // Do not log private subscription URLs, keys, or participant details.
          await db.from("push_deliveries").update({ last_error: error.statusCode ? `Push service ${error.statusCode}` : "Delivery failed; retry scheduled" }).eq("id", job.id);
        }
      }
    }));
    return Response.json({ claimed: jobs.length, sent });
  } catch {
    return new Response("Push processing failed", { status: 500 });
  }
});
