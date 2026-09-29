// 경보 시스템 알림을 띄우기 위한 최소 서비스 워커 (안드로이드 Chrome은 페이지에서 직접 알림을 못 띄운다).
// 캐싱 등은 하지 않는다.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// 알림을 누르면 열려 있는 앱 탭으로 돌아간다
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients[0]
      return client ? client.focus() : self.clients.openWindow('/')
    }),
  )
})
