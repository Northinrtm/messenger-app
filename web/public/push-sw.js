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
        return existingClient.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

async function showGenericMessageNotification() {
  if (await hasVisibleNorthMessengerClient()) {
    return;
  }

  await self.registration.showNotification("North Messenger", {
    body: "\u041d\u043e\u0432\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435",
    icon: "/icon-192.png",
    badge: "/favicon-32.png",
    tag: "north-messenger-new-message",
    renotify: true,
    data: {
      url: "/",
    },
  });
}

async function hasVisibleNorthMessengerClient() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return clients.some(
    (client) =>
      client.url.startsWith(self.location.origin) &&
      (client.visibilityState === "visible" || client.focused === true)
  );
}
