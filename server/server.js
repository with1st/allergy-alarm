const express = require('express');
const webpush = require('web-push');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
app.use(cors());
app.use(express.json());

const publicVapidKey = 'BIMm5K3reoqNavT0h6W4vRHNWIUs0Dl9r6gPKxeD15gVwm58TIt2v_U4CH1Q0E_4h1QZGbfkhEX9eDJafd1_ivY';
const privateVapidKey = 'f7RH78HkYLeZ7rZMOqHnkeJ08LoYEvURgidZOZqp2JA';

webpush.setVapidDetails(
  'mailto:example@yourdomain.org',
  publicVapidKey,
  privateVapidKey
);

let subscriptions = [];
let userNotifSettings = {
  enabled: false,
  time: '07:40',
};

// 구독 등록 API
app.post('/subscribe', (req, res) => {
  const subscription = req.body;
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

// 테스트 알림 API
app.post('/send-notification', (req, res) => {
  const { title, body, delay } = req.body;
  const payload = JSON.stringify({ title, body });

  console.log(`⏰ ${delay / 1000}초 뒤 알림 전송 예약...`);
  setTimeout(() => {
    sendPushToAll(payload);
  }, delay || 0);

  res.status(200).json({ message: '알림 전송 예약됨' });
});

// 푸시 일괄 발송 및 만료된 구독 자동 삭제 함수
function sendPushToAll(payload) {
  subscriptions.forEach((sub, index) => {
    webpush.sendNotification(sub, payload).catch(err => {
      console.error(`❌ [구독 ${index}] 발송 실패:`, err.message);
      if (err.statusCode === 410 || err.statusCode === 404) {
        subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
      }
    });
  });
}

// 매 분 00초마다 실행되는 정밀 스케줄러 (한국 시간 기준)
cron.schedule('* * * * *', () => {
  if (!userNotifSettings.enabled) return;

  const now = new Date();
  const koreanTime = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(now);

  const [hour, minute] = koreanTime.split(':');
  const currentTime = `${hour.trim()}:${minute.trim()}`;

  if (currentTime === userNotifSettings.time) {
    console.log(`🔔 설정한 시각(${currentTime})이 되어 급식 알림을 발송합니다!`);
    const payload = JSON.stringify({
      title: '🥗 오늘의 급식 알레르기 안내',
      body: '오늘 학생들의 급식에 알레르기 유발 메뉴가 있는지 확인하세요!',
    });

    sendPushToAll(payload);
  }
}, {
  timezone: "Asia/Seoul"
});

app.listen(5000, () => {
  console.log('🚀 Server running on port 5000');
});