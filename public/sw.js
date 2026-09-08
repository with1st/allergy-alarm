// public/sw.js
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: '급식 알림', body: event.data.text() };
    }
  }

  const title = data.title || '🧪 테스트 푸시 알림';
  const options = {
    body: data.body || '급식 알레르기 안내 메시지입니다.',
    icon: '/icon.png',
    badge: '/icon.png',
    requireInteraction: true, // 사용자가 닫기 전까지 팝업을 계속 유지
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});