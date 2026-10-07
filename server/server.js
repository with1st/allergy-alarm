const express = require('express');
const webpush = require('web-push');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// VAPID 키 설정 (사용 중이신 기존 키를 그대로 넣어주세요)
const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BIMm5K3reoqNavT0h6W4vRHNWIUs0Dl9r6gPKxeD15gVwm58TIt2v_U4CH1Q0E_4h1QZGbfkhEX9eDJafd1_ivY';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || 'f7RH78HkYLeZ7rZMOqHnkeJ08LoYEvURgidZOZqp2JA';

webpush.setVapidDetails(
  'mailto:example@yourdomain.com',
  publicVapidKey,
  privateVapidKey
);

// 다중 사용자 구독 및 알림 설정 목록
// 각 항목 형태: { subscription, time: '08:00', enabled: true, title: '...', body: '...' }
let userSubscriptions = [];

// 1. 기기 구독 등록 및 설정 저장 (/subscribe 또는 /set-time 통합 지원)
app.post('/set-time', (req, res) => {
  const { subscription, enabled, time, title, body } = req.body;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'subscription 정보가 필요합니다.' });
  }

  // 기존에 등록된 기기인지 확인
  const index = userSubscriptions.findIndex(
    item => item.subscription.endpoint === subscription.endpoint
  );

  const newSetting = {
    subscription,
    enabled: enabled !== undefined ? enabled : true,
    time: time || '08:00',
    title: title || '⚠️ [급식 닥터] 알레르기 주의 식단 안내',
    body: body || '오늘의 알레르기 주의 식단을 확인하세요.'
  };

  if (index !== -1) {
    // 이미 존재하는 기기는 해당 기기의 설정만 갱신
    userSubscriptions[index] = newSetting;
  } else {
    // 새로운 기기는 목록에 추가
    userSubscriptions.push(newSetting);
  }

  console.log(`[설정 저장] 총 등록 기기 수: ${userSubscriptions.length}, 설정 시간: ${newSetting.time}`);
  res.status(200).json({ success: true, count: userSubscriptions.length });
});

// 2. 1분마다 현재 시간(KST)을 체크하여 각 사용자별로 알림 발송
setInterval(() => {
  if (userSubscriptions.length === 0) return;

  // 한국 표준시 (KST, UTC+9) 구하기
  const now = new Date();
  const kstHours = String((now.getUTCHours() + 9) % 24).padStart(2, '0');
  const kstMinutes = String(now.getUTCMinutes()).padStart(2, '0');
  const currentTimeStr = `${kstHours}:${kstMinutes}`;

  // 현재 시간이 알림 시간과 일치하고 활성화된 사용자만 추출
  const targets = userSubscriptions.filter(
    item => item.enabled && item.time === currentTimeStr
  );

  if (targets.length > 0) {
    console.log(`[알림 발송] ${currentTimeStr} 대상 기기 수: ${targets.length}`);
  }

  targets.forEach(item => {
    const payload = JSON.stringify({
      title: item.title,
      body: item.body,
      url: '/'
    });

    webpush.sendNotification(item.subscription, payload)
      .catch(err => {
        console.error('발송 실패 (만료된 구독 삭제 처리):', err.statusCode);
        // 만료된 구독(410 Gone 또는 404)은 배열에서 제거
        if (err.statusCode === 404 || err.statusCode === 410) {
          userSubscriptions = userSubscriptions.filter(
            sub => sub.subscription.endpoint !== item.subscription.endpoint
          );
        }
      });
  });
}, 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
