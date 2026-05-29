self.addEventListener("push", (event) => {
  event.waitUntil(showGenericMessageNotification());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL("/", self.location.origin).toString();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => client.url.startsWith(self.location.origin));
      if (existingClient) {
        existingClient.postMessage({ type: "NOTIFICATION_CLICKED" });
        return existingClient.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

async function showGenericMessageNotification() {
  try {
    if (await hasVisibleNorthMessengerClient()) {
      return;
    }
    await self.registration.showNotification("North Messenger", {
      body: "Новое сообщение",
      icon: "/icon-192.png",
      badge: "/favicon-32.png",
      tag: "north-messenger-new-message",
      renotify: true,
      silent: false,
      data: {
        url: "/",
      },
    });
  } catch (err) {
    console.error("[push-sw] showNotification failed:", err);
  }
}

async function hasVisibleNorthMessengerClient() {
  try {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    return clients.some(
      (client) =>
        client.url.startsWith(self.location.origin) &&
        (client.visibilityState === "visible" || client.focused === true)
    );
  } catch {
    return false;
  }
}
