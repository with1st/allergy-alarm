const express = require('express');
const webpush = require('web-push');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
app.use(cors());
app.use(express.json());

// npx web-push generate-vapid-keys 명령어로 발급받은 실제 키 입력
const PUBLIC_VAPID_KEY = 'BLkV4_9CRvZa0dz5y3ZDrvaTUG7kIr4qEoVFgrmDqUQ1HbQFzvPqla3eG-MXoEaUrX6epsK4jGWi2VG3tSubnxA';
const PRIVATE_VAPID_KEY = 'CZ69sOljKlW9ebNFe_K7dPW4lKjt86NAB_nuDtwmI7Y';

webpush.setVapidDetails(
  'mailto:your-email@example.com',
  PUBLIC_VAPID_KEY,
  PRIVATE_VAPID_KEY
);

let subscriptions = [];

app.post('/subscribe', (req, res) => {
  const { subscription, targetHour, targetMinute } = req.body;
  subscriptions = subscriptions.filter(
    (item) => item.subscription.endpoint !== subscription.endpoint
  );
  subscriptions.push({
    subscription,
    targetHour: parseInt(targetHour),
    targetMinute: parseInt(targetMinute),
  });
  res.status(201).json({ message: '알림 구독 성공' });
});

cron.schedule('* * * * *', () => {
  const now = new Date();
  const kstHours = (now.getUTCHours() + 9) % 24;
  const kstMinutes = now.getUTCMinutes();

  subscriptions.forEach(({ subscription, targetHour, targetMinute }) => {
    if (targetHour === kstHours && targetMinute === kstMinutes) {
      const payload = JSON.stringify({
        title: '🥗 오늘의 급식 알레르기 리포트',
        body: '오늘 자녀/학생의 급식 메뉴에 설정된 알레르기 유발 요소를 확인해 보세요!',
      });

      webpush.sendNotification(subscription, payload).catch((err) => {
        console.error('푸시 전송 실패:', err);
      });
    }
  });
});

app.listen(5000, () => console.log('Web Push Server running on port 5000'));