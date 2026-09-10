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
    tag: 'meal-allergy-alert', // 동일 태그 지정으로 알림 중복 방지
    renotify: true,            // 덮어쓸 때 진동/소리 재발생
    vibrate: [200, 100, 200],  // 모바일 진동 패턴 (200ms 진동 - 100ms 쉬고 - 200ms 진동)
    requireInteraction: true,  // 사용자가 닫기 전까지 팝업 유지
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 이미 열려 있는 탭이 있다면 해당 탭으로 포커스
      for (const client of clientList) {
        if (client.url.includes('/') && 'focus' in client) {
          return client.focus();
        }
      }
      // 열려 있는 탭이 없으면 새 창으로 웹앱 열기
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});