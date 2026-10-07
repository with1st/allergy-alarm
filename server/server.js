const express = require('express');
const webpush = require('web-push');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'YOUR_PUBLIC_VAPID_KEY';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || 'YOUR_PRIVATE_VAPID_KEY';

webpush.setVapidDetails(
  'mailto:example@yourdomain.com',
  publicVapidKey,
  privateVapidKey
);

// 다중 기기 알림 저장소
let userSubscriptions = [];

// 구독 등록 & 설정 업데이트 (/subscribe 및 /set-time 모두 수용)
const handleSave = (req, res) => {
  // body가 바로 subscription 형태일 수도 있고 { subscription, time, ... } 형태일 수도 있음
  let subscription = req.body.subscription || req.body;
  const { enabled, time, title, body } = req.body;

  // endpoint가 유효한지 검증
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: '유효한 푸시 구독 정보가 필요합니다.' });
  }

  const endpoint = subscription.endpoint;
  const index = userSubscriptions.findIndex(item => item.subscription.endpoint === endpoint);

  const setting = {
    subscription: {
      endpoint: subscription.endpoint,
      keys: subscription.keys
    },
    enabled: enabled !== undefined ? enabled : (index !== -1 ? userSubscriptions[index].enabled : true),
    time: time || (index !== -1 ? userSubscriptions[index].time : '08:00'),
    title: title || (index !== -1 ? userSubscriptions[index].title : '⚠️ [급식 닥터] 알레르기 주의 식단 안내'),
    body: body || (index !== -1 ? userSubscriptions[index].body : '오늘의 급식 식단을 확인하세요.')
  };

  if (index !== -1) {
    userSubscriptions[index] = setting;
  } else {
    userSubscriptions.push(setting);
  }

  console.log(`[설정 저장 완료] 등록 기기 수: ${userSubscriptions.length} | 설정 시간: ${setting.time} | 사용 여부: ${setting.enabled}`);
  res.status(200).json({ success: true, count: userSubscriptions.length });
};

app.post('/subscribe', handleSave);
app.post('/set-time', handleSave);

// 즉시 테스트 알림 발송 엔드포인트
app.post('/test-notification', async (req, res) => {
  const { title, body } = req.body;
  const payload = JSON.stringify({
    title: title || '⚠️ [급식 닥터] 테스트 알림',
    body: body || '테스트 알림이 정상적으로 수신되었습니다.',
    url: '/'
  });

  const promises = userSubscriptions.map(item =>
    webpush.sendNotification(item.subscription, payload).catch(err => {
      console.error('테스트 발송 실패:', err.statusCode);
    })
  );

  await Promise.all(promises);
  res.status(200).json({ success: true, message: '발송 시도 완료' });
});

// 1분마다 KST 시각 체크 후 예약 알림 전송
setInterval(() => {
  if (userSubscriptions.length === 0) return;

  const now = new Date();
  const kstHours = String((now.getUTCHours() + 9) % 24).padStart(2, '0');
  const kstMinutes = String(now.getUTCMinutes()).padStart(2, '0');
  const currentTimeStr = `${kstHours}:${kstMinutes}`;

  const targets = userSubscriptions.filter(
    item => item.enabled && item.time === currentTimeStr
  );

  if (targets.length > 0) {
    console.log(`[스케줄 발송] ${currentTimeStr} 대상 기기: ${targets.length}대`);
  }

  targets.forEach(item => {
    const payload = JSON.stringify({
      title: item.title,
      body: item.body,
      url: '/'
    });

    webpush.sendNotification(item.subscription, payload)
      .catch(err => {
        if (err.statusCode === 404 || err.statusCode === 410) {
          userSubscriptions = userSubscriptions.filter(
            sub => sub.subscription.endpoint !== item.subscription.endpoint
          );
        }
      });
  });
}, 60 * 1000);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
