self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { /* Display a safe fallback. */ }
  const url = typeof data.url === "string" && /^\/events\/[0-9a-f-]+$/i.test(data.url) ? data.url : "/notifications";
  event.waitUntil(self.registration.showNotification(data.title || "보드라운지", {
    body: data.body || "새 알림이 도착했습니다.",
    icon: "/boardlounge-icon-512-v3.png",
    tag: data.tag || "boardlounge-notification",
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url;
  const target = new URL(typeof path === "string" && /^\/events\/[0-9a-f-]+$/i.test(path) ? path : "/notifications", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && "navigate" in client) {
        const navigated = await client.navigate(target);
        if (navigated) return navigated.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
