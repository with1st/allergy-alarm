const express = require('express');
const webpush = require('web-push');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ⚠️ 위 1단계에서 생성된 키를 그대로 입력하세요
const publicVapidKey = 'BIMm5K3reoqNavT0h6W4vRHNWIUs0Dl9r6gPKxeD15gVwm58TIt2v_U4CH1Q0E_4h1QZGbfkhEX9eDJafd1_ivY';
const privateVapidKey = 'f7RH78HkYLeZ7rZMOqHnkeJ08LoYEvURgidZOZqp2JA';

webpush.setVapidDetails(
  'mailto:example@yourdomain.org',
  publicVapidKey,
  privateVapidKey
);

// 구독 정보 및 알림 설정 저장
let subscriptions = [];
let userNotifSettings = {
  enabled: false,
  time: '07:40',
};

// 구독 등록 API
app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  // 기존 동일 Endpoint 구독 정보 삭제 후 새로 추가 (구독 갱신)
  subscriptions = subscriptions.filter(sub => sub.endpoint !== subscription.endpoint);
  subscriptions.push(subscription);
  console.log(`✅ 새 알림 구독 등록 완료. 현재 구독 수: ${subscriptions.length}`);
  res.status(201).json({});
});

// 알림 시간 설정 API
app.post('/set-time', (req, res) => {
  const { enabled, time } = req.body;
  userNotifSettings.enabled = enabled;
  userNotifSettings.time = time;
  console.log(`⏰ 알림 설정 변경: Enabled=${enabled}, Time=${time}`);
  res.status(200).json({ message: '알림 설정 완료' });
});

// 테스트 알림 즉시/지연 발송 API
app.post('/send-notification', (req, res) => {
  const { title, body, delay } = req.body;
  const payload = JSON.stringify({ title, body });

  console.log(`⏰ ${delay / 1000}초 뒤 알림 전송 예약...`);
  setTimeout(() => {
    subscriptions.forEach((sub, index) => {
      webpush.sendNotification(sub, payload).then(() => {
        console.log(`🚀 [구독 ${index}] 알림 전송 성공!`);
      }).catch(err => {
        console.error(`❌ [구독 ${index}] 알림 전송 실패:`, err.message);
      });
    });
  }, delay || 0);

  res.status(200).json({ message: '알림 전송 예약됨' });
});

// 매분 마다 현재 시각 체크하여 예약된 알림 발송
setInterval(() => {
  if (!userNotifSettings.enabled) return;

  const now = new Date();
  const currentHour = String(now.getHours()).padStart(2, '0');
  const currentMinute = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${currentHour}:${currentMinute}`;

  if (currentTime === userNotifSettings.time) {
    console.log(`🔔 설정한 시각(${currentTime})이 되어 급식 알림을 발송합니다!`);
    const payload = JSON.stringify({
      title: '🥗 오늘의 급식 알레르기 안내',
      body: '오늘 학생들의 급식에 알레르기 유발 메뉴가 있는지 확인하세요!',
    });

    subscriptions.forEach((sub, index) => {
      webpush.sendNotification(sub, payload).catch(err => console.error('발송 실패:', err.message));
    });
  }
}, 60000);

app.listen(5000, () => {
  console.log('🚀 Server running on port 5000');
});