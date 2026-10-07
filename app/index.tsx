import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions
} from 'react-native';

const CURRENT_APP_VERSION = '1.0.1';
const VAPID_PUBLIC_KEY = 'BIMm5K3reoqNavT0h6W4vRHNWIUs0Dl9r6gPKxeD15gVwm58TIt2v_U4CH1Q0E_4h1QZGbfkhEX9eDJafd1_ivY';

// base64 문자열을 Uint8Array로 변환하는 헬퍼 함수
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

interface AllergyItem {
  id: number;
  name: string;
}

const ALLERGY_LIST: AllergyItem[] = [
  { id: 1, name: '난류(계란)' },
  { id: 2, name: '우유' },
  { id: 3, name: '메밀' },
  { id: 4, name: '땅콩' },
  { id: 5, name: '대두(콩)' },
  { id: 6, name: '밀' },
  { id: 7, name: '고등어' },
  { id: 8, name: '게' },
  { id: 9, name: '새우' },
  { id: 10, name: '돼지고기' },
  { id: 11, name: '복숭아' },
  { id: 12, name: '토마토' },
  { id: 13, name: '아황산류' },
  { id: 14, name: '호두' },
  { id: 15, name: '닭고기' },
  { id: 16, name: '쇠고기' },
  { id: 17, name: '오징어' },
  { id: 18, name: '조개류' },
  { id: 19, name: '잣' },
];
// 대표 비상 약물 프리셋 목록
const EMERGENCY_MED_PRESETS = [
  '경구용 항히스타민제',
  '벤토린 흡입기',
  '에피네프린 자가투여주사기 (젝스트 등)',
  '스테로이드 연고/제재',
];

export const AGE_GROUPS = [
  { id: 'grade1_2', label: '초등 1~2학년', targetCal: 530 },
  { id: 'grade3_4', label: '초등 3~4학년', targetCal: 620 },
  { id: 'grade5_6', label: '초등 5~6학년', targetCal: 720 },
  { id: 'middle',    label: '중학생',        targetCal: 830 },
  { id: 'high',      label: '고등학생',      targetCal: 900 },
  { id: 'adult',     label: '교직원 / 성인', targetCal: 750 },
];

// 🏫 1끼 기준 연령별 권장 영양소 (열량, 탄수화물, 단백질, 지방, 칼슘, 철분, 비타민A, 비타민C)
export const NUTRITION_STANDARDS: Record<string, { cal: number; carb: number; protein: number; fat: number; calcium: number; iron: number; vitA: number; vitC: number }> = {
  grade1_2: { cal: 530, carb: 80, protein: 20, fat: 15, calcium: 230, iron: 3.5, vitA: 180, vitC: 25 },
  grade3_4: { cal: 620, carb: 93, protein: 25, fat: 18, calcium: 260, iron: 4.0, vitA: 210, vitC: 30 },
  grade5_6: { cal: 720, carb: 108, protein: 30, fat: 21, calcium: 300, iron: 4.5, vitA: 240, vitC: 35 },
  middle:    { cal: 830, carb: 125, protein: 38, fat: 24, calcium: 330, iron: 5.0, vitA: 280, vitC: 40 },
  high:      { cal: 900, carb: 135, protein: 42, fat: 26, calcium: 350, iron: 5.5, vitA: 300, vitC: 45 },
  adult:     { cal: 750, carb: 112, protein: 32, fat: 22, calcium: 270, iron: 4.0, vitA: 250, vitC: 35 },
};

// 나이스 NTR_INFO 텍스트에서 8대 영양소 추출 함수
export const parseNutritionInfo = (rawText?: string) => {
  const result = { cal: 0, carb: 0, protein: 0, fat: 0, calcium: 0, iron: 0, vitA: 0, vitC: 0 };
  if (!rawText) return result;

  const lines = rawText.split(/<br\s*\/?>|\n/);
  lines.forEach((line) => {
    const text = line.trim();
    const extractNum = (str: string) => {
      const matched = str.match(/[\d.]+/);
      return matched ? parseFloat(matched[0]) : 0;
    };

    if (text.includes('탄수화물')) result.carb = extractNum(text.split(':')[1] || text);
    if (text.includes('단백질')) result.protein = extractNum(text.split(':')[1] || text);
    if (text.includes('지방')) result.fat = extractNum(text.split(':')[1] || text);
    if (text.includes('칼슘')) result.calcium = extractNum(text.split(':')[1] || text);
    if (text.includes('철분')) result.iron = extractNum(text.split(':')[1] || text);
    if (text.includes('비타민A')) result.vitA = extractNum(text.split(':')[1] || text);
    if (text.includes('비타민C')) result.vitC = extractNum(text.split(':')[1] || text);
  });
  return result;
};

interface Profile {
  id: string;
  name: string;
  schoolName: string;
  ATPT_OFCDC_SC_CODE: string;
  SD_SCHUL_CODE: string;
  myAllergies: number[];
  standardSymptoms?: string[]; 
  customSymptomNote?: string;
  emergencyMedication?: string;
  medicationLocation?: string;
  medicationPresets?: string[]; // 👈 추가: 체크 선택한 비상 약물 목록
  customMedication?: string;    // 👈 추가: 직접 입력한 기타 비상 약물    
  ageGroup?: string;
}

interface MealItem {
  dishName: string;
  allergies: string[];
  isDanger: boolean;
}

interface StudentSummary {
  studentName: string;
  dangerItems: MealItem[];
}

const STANDARD_SYMPTOMS = [
  // 피부/점막
  '피부 가려움/두드러기',
  '입술/얼굴/혀 부종',
  '눈 충혈/가려움',
  
  // 호흡기 (응급)
  '기침/호흡곤란',
  '목 쉼/쌕쌕거림',
  
  // 소화기
  '복통/구토/설사',
  
  // 신경/순환기 (아나필락시스 위험)
  '어지러움/두통',
  '식은땀/창백함',
  '의식 저하/혼미',
];

export default function Index() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const webDateInputRef = useRef<HTMLInputElement>(null);

  const [meals, setMeals] = useState<MealItem[]>([]);
  const [nutritionData, setNutritionData] = useState<{ ntr: string; cal: string }>({ ntr: '', cal: '' });
  // 🔄 식판 플립 애니메이션
  const [isTrayFlipped, setIsTrayFlipped] = useState(false);
  const trayFlipAnim = useRef(new Animated.Value(0)).current;

  const handleToggleTrayFlip = () => {
    Animated.spring(trayFlipAnim, {
      toValue: isTrayFlipped ? 0 : 180,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setIsTrayFlipped(!isTrayFlipped);
  };

  const trayFrontRotate = trayFlipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });
  const trayBackRotate = trayFlipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });
  const [loading, setLoading] = useState<boolean>(false);

  const [studentSummaries, setStudentSummaries] = useState<StudentSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);

  // 프로필 생성 모달 관련
  // 프로필 수정 상태 추가 (null이면 신규 등록, string이면 해당 프로필 수정)
const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

// 프로필 수정 모달 열기 함수
const handleEditProfile = (profile: Profile) => {
  setEditingProfileId(profile.id);
  setNewStudentName(profile.name);
  setSelectedSchool({
    SCHUL_NM: profile.schoolName,
    ATPT_OFCDC_SC_CODE: profile.ATPT_OFCDC_SC_CODE,
    SD_SCHUL_CODE: profile.SD_SCHUL_CODE,
  });
  setSelectedAllergies(profile.myAllergies || []);
  setSelectedSymptoms(profile.standardSymptoms || []);
  setCustomSymptomNote(profile.customSymptomNote || '');
  setSelectedMedicationPresets(profile.medicationPresets || []);
  setCustomMedication(profile.customMedication || '');
  setMedicationLocation(profile.medicationLocation || '');
  setSelectedAgeGroup(profile.ageGroup || 'grade3_4');

  // 상세 모달을 닫고 생성/수정 모달 열기
  setIsDetailModalOpen(false);
  setIsModalOpen(true);
};
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [isProfileManageModalOpen, setIsProfileManageModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<string[]>([]);
  const [isAllSummaryModalOpen, setIsAllSummaryModalOpen] = useState(false);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<string>('grade3_4');
  
  const [newStudentName, setNewStudentName] = useState('');
  const [searchSchoolQuery, setSearchSchoolQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [selectedAllergies, setSelectedAllergies] = useState<number[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [customSymptomNote, setCustomSymptomNote] = useState<string>('');
  const [selectedMedicationPresets, setSelectedMedicationPresets] = useState<string[]>([]);
  const [customMedication, setCustomMedication] = useState<string>('');
  const [medicationLocation, setMedicationLocation] = useState<string>('');

  // 🥜 알레르기 번호 -> 한글 이름 변환 맵핑
  const ALLERGY_NAMES: { [key: string]: string } = {
    '1': '난류', '2': '우유', '3': '메밀', '4': '땅콩', '5': '대두',
    '6': '밀', '7': '고등어', '8': '게', '9': '새우', '10': '돼지고기',
    '11': '복숭아', '12': '토마토', '13': '아황산류', '14': '호두',
    '15': '닭고기', '16': '쇠고기', '17': '오징어', '18': '조개류', '19': '잣'
  };

  const formatAllergyNames = (allergies: any[]) => {
    if (!allergies || !Array.isArray(allergies) || allergies.length === 0) return '등록된 알레르기 없음';
    return allergies
      .map((item) => ALLERGY_NAMES[String(item)] || String(item))
      .join(', ');
  };

  // 🍱 식판 메뉴 자동 분류 함수 (밥, 국, 반찬 6칸)
function categorizeMealsToTray(mealItems: any[]) {
  let rice: any = null;
  let soup: any = null;
  const sides: any[] = [];

  mealItems.forEach((item) => {
    const cleanName = (item.dishName || '').replace(/\*/g, '').trim();
    // 밥 판별
    if (!rice && /([밥죽]|덮밥|비빔밥|볶음밥|라이스|국수|스파게티|파스타|면)/.test(cleanName)) {
      rice = item;
    // 국/찌개 판별
    } else if (!soup && /(국|찌개|탕|스프|수프|사발|개장|미역국|어묵국)/.test(cleanName)) {
      soup = item;
    // 그 외 반찬
    } else {
      sides.push(item);
    }
  });

  // 키워드 미매칭 시 순차 보충
  if (!rice && sides.length > 0) rice = sides.shift();
  if (!soup && sides.length > 0) soup = sides.shift();

  // 상단 반찬 6칸 고정 배열 생성
  const topSides = Array.from({ length: 6 }, (_, i) => sides[i] || null);

  return { rice, soup, topSides };
}

// 🍱 식판 뷰 전용 컴포넌트
function MealTrayView({ meals }: { meals: any[] }) {
  const { rice, soup, topSides } = categorizeMealsToTray(meals);

  const renderTrayCell = (item: any, isCircle: boolean = false, minHeight: number = 75) => {
    if (!item) {
      return (
        <View
          style={{
            flex: 1,
            minHeight,
            backgroundColor: '#f1f3f5',
            borderRadius: isCircle ? 999 : 12,
            borderWidth: 1.5,
            borderColor: '#dee2e6',
            borderStyle: 'dashed',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 11, color: '#adb5bd' }}>빈 칸</Text>
        </View>
      );
    }

    return (
      <View
        style={{
          flex: 1,
          minHeight,
          backgroundColor: item.isDanger ? '#fff0f0' : '#ffffff',
          borderRadius: isCircle ? 999 : 12,
          borderWidth: 2,
          borderColor: item.isDanger ? '#ff6b6b' : '#ced4da',
          padding: 8,
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
          elevation: 1,
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: 5,
            right: 6,
            backgroundColor: item.isDanger ? '#ff4d4f' : '#52c41a',
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderRadius: 4,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>
            {item.isDanger ? '위험' : '안전'}
          </Text>
        </View>

        <Text
          style={{
            fontSize: 12,
            fontWeight: 'bold',
            color: item.isDanger ? '#cf1322' : '#333',
            textAlign: 'center',
            marginTop: 2,
          }}
          numberOfLines={2}
        >
          {item.dishName?.replace(/\*/g, '')}
        </Text>

        {item.isDanger && item.allergies?.length > 0 && (
          <Text
            style={{
              fontSize: 10,
              color: '#ff4d4f',
              textAlign: 'center',
              marginTop: 4,
              lineHeight: 12,
            }}
            numberOfLines={3}
          >
            ⚠️️ {item.allergies.join(', ')}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View
      style={{
        backgroundColor: '#e9ecef',
        borderRadius: 24,
        padding: 12,
        borderWidth: 3,
        borderColor: '#ced4da',
        gap: 10,
        marginVertical: 6,
      }}
    >
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {topSides.slice(0, 3).map((item, idx) => (
            <View key={idx} style={{ flex: 1 }}>{renderTrayCell(item, false, 75)}</View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {topSides.slice(3, 6).map((item, idx) => (
            <View key={idx + 3} style={{ flex: 1 }}>{renderTrayCell(item, false, 75)}</View>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 4 }}>
        <View style={{ flex: 1.15 }}>
          {renderTrayCell(rice, false, 110)}
        </View>
        <View style={{ flex: 1 }}>
          {renderTrayCell(soup, true, 110)}
        </View>
      </View>
    </View>
  );
}

// 약물 체크박스 칩 토글 함수
  const toggleMedicationPreset = (med: string) => {
    if (selectedMedicationPresets.includes(med)) {
      setSelectedMedicationPresets(selectedMedicationPresets.filter((m) => m !== med));
    } else {
      setSelectedMedicationPresets([...selectedMedicationPresets, med]);
    }
}; 
   const toggleSymptom = (symptom: string) => {
    if (selectedSymptoms.includes(symptom)) {
      setSelectedSymptoms(selectedSymptoms.filter((s) => s !== symptom));
    } else {
      setSelectedSymptoms([...selectedSymptoms, symptom]);
    }
  };
  // 프로필 상세 보기 모달 관련 State
   const [detailProfile, setDetailProfile] = useState<Profile | null>(null);
   const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
   const [isProfileListModalOpen, setIsProfileListModalOpen] = useState<boolean>(false);

   const handleOpenDetail = (profile: Profile) => {
     setIsProfileListModalOpen(false); // 👈 1. 목록 모달 닫기 추가
     setDetailProfile(profile);
     setIsDetailModalOpen(true);       // 2. 상세 모달 열기
};

  // 프로필 삭제 함수
  const handleDeleteProfile = async (idToDelete: string) => {
    if (!confirm('이 프로필을 삭제하시겠습니까?')) return;

    // 1. 화면 및 저장소(localStorage)에서 해당 프로필 제거
    const updatedProfiles = profiles.filter((profile: any) => profile.id !== idToDelete);
    setProfiles(updatedProfiles);
    localStorage.setItem('profiles', JSON.stringify(updatedProfiles));

    // 삭제 후 선택된 프로필 처리 (삭제된 프로필을 보고 있었다면 첫 번째 프로필로 변경)
    if (currentProfileId === idToDelete) {
      setCurrentProfileId(updatedProfiles.length > 0 ? updatedProfiles[0].id : '');
    }

    // 2. 백엔드 서버에 프로필 삭제 요청
    try {
      await fetch('https://allergy-alarm.onrender.com/delete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idToDelete }),
      });
    } catch (error) {
      console.error('프로필 삭제 요청 중 오류 발생:', error);
    }
  };

  // 알림 설정 모달 관련
  const [isSettingsModalVisible, setSettingsModalVisible] = useState(false);
  const [isNotificationEnabled, setIsNotificationEnabled] = useState(false);
  const [inputHour, setInputHour] = useState('07');
  const [inputMinute, setInputMinute] = useState('40');

  useEffect(() => {
    // 📱 iOS Safari 자동 줌인 및 핀치 줌 방지 스크립트
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      // 1. Viewport 메타 태그 동적 주입 / 갱신
      let meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'viewport');
        document.head.appendChild(meta);
      }
      meta.setAttribute(
        'content',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
      );

      // 2. 인풋 터치 시 자동 줌인 방지 (16px 강제 및 제스처 잠금)
      const styleId = 'prevent-ios-zoom';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          html, body {
            touch-action: pan-x pan-y;
            -webkit-text-size-adjust: 100%;
          }
          input, textarea, select {
            font-size: 16px !important;
          }
        `;
        document.head.appendChild(style);
      }
    }

    // 웹 실행 시 브라우저 로드 완료 후 serviceWorker 안전 등록
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(
        (registration) => {
          console.log('ServiceWorker registration successful: ', registration.scope);
        },
        (err) => {
          console.log('ServiceWorker registration failed: ', err);
        }
      );
    }

    loadProfiles();
    loadNotificationSettings();
  }, []);

  useEffect(() => {
    if (currentProfileId) {
      fetchMealData();
    }
    if (profiles.length > 0) {
      fetchAllStudentsSummary();
    }
  }, [currentProfileId, selectedDate, profiles]);

  const loadProfiles = async () => {
    try {
      const saved = await AsyncStorage.getItem('@profiles');
      if (saved) {
        const parsed: Profile[] = JSON.parse(saved);
        setProfiles(parsed);
        if (parsed.length > 0) {
          setCurrentProfileId(parsed[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const saveProfiles = async (newProfiles: Profile[]) => {
    try {
      await AsyncStorage.setItem('@profiles', JSON.stringify(newProfiles));
      setProfiles(newProfiles);
    } catch (e) {
      console.error(e);
    }
  };

  const loadNotificationSettings = async () => {
    try {
      const enabled = await AsyncStorage.getItem('@notif_enabled');
      const time = await AsyncStorage.getItem('@notif_time');
      if (enabled !== null) setIsNotificationEnabled(JSON.parse(enabled));
      if (time) {
        const [h, m] = time.split(':');
        setInputHour(h);
        setInputMinute(m);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const h = String(parseInt(inputHour || '0', 10)).padStart(2, '0');
      const m = String(parseInt(inputMinute || '0', 10)).padStart(2, '0');
      const timeStr = `${h}:${m}`;

      await AsyncStorage.setItem('@notif_enabled', JSON.stringify(isNotificationEnabled));
      await AsyncStorage.setItem('@notif_time', timeStr);

      // 1. 등록된 모든 학생의 오늘 알레르기 위험 요약 생성
      const riskSummaries: string[] = [];
      (profiles || []).forEach((prof: any) => {
        const userAllergies = prof?.myAllergies || prof?.allergies || [];
        if (!userAllergies || userAllergies.length === 0) return;

        // 화면 식판과 동일한 방식: isDanger 메뉴 추출
        const dangerDishes: string[] = [];
        (meals || []).forEach((m: any) => {
          if (m?.isDanger) {
            dangerDishes.push(m?.dishName || m?.dish || '메뉴');
          }
        });

        if (dangerDishes.length > 0) {
          const uniqueDishes = Array.from(new Set(dangerDishes));
          riskSummaries.push(`${prof?.name || '학생'}(${uniqueDishes.slice(0, 2).join(', ')})`);
        }
      });

      // 2. 위험 학생 유무에 따른 제목 및 본문 확정
      let dynamicTitle = '';
      let dynamicBody = '';

      if (riskSummaries.length > 0) {
        dynamicTitle = '⚠️ [급식 닥터] 오늘 알레르기 주의 식단 감지!';
        dynamicBody = `${riskSummaries.join(' / ')} 학생의 주의 식단이 있습니다. 앱에서 확인하세요.`;
      } else {
        dynamicTitle = '✅ [급식 닥터] 오늘의 안심 식단 안내';
        dynamicBody = '오늘은 등록된 학생 전원 알레르기 안심 식단입니다.';
      }

      // 3. 앱 화면 즉시 닫기 (딜레이 방지)
      setSettingsModalVisible(false);
      Alert.alert('알림 설정', `매일 ${timeStr}에 급식 알림이 설정되었습니다.`);

      // 4. Render 서버로 시간과 함께 '맞춤 문구'를 백그라운드 전송
      if (Platform.OS === 'web') {
        subscribeToPush().catch(() => {});
        fetch('https://allergy-alarm.onrender.com/set-time', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: isNotificationEnabled,
            time: timeStr,
            title: dynamicTitle,
            body: dynamicBody,
          }),
        }).catch((e) => console.log('서버 동기화 에러:', e));
      }
    } catch (e) {
      Alert.alert('오류', '알림 설정을 저장하는데 실패했습니다.');
    }
  };

  const subscribeToPush = async () => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        }
        await fetch('https://allergy-alarm.onrender.com/subscribe', {
          method: 'POST',
          body: JSON.stringify(subscription),
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        console.error('Push 구독 실패:', e);
      }
    }
  };

  const triggerTestNotification = async () => {
    try {
     // 1. 등록된 모든 학생에 대해 오늘 식단 대조 및 위험 요약 생성
    const riskSummaries: string[] = [];
    (profiles || []).forEach((prof: any) => {
      const userAllergies = prof?.myAllergies || prof?.allergies || [];
      if (!userAllergies || userAllergies.length === 0) return;

      // 화면 식판과 동일한 방식: isDanger 메뉴 추출
      const dangerDishes: string[] = [];
      (meals || []).forEach((m: any) => {
        if (m?.isDanger) {
          dangerDishes.push(m?.dishName || m?.dish || '메뉴');
        }
      });

      if (dangerDishes.length > 0) {
        const uniqueDishes = Array.from(new Set(dangerDishes));
        riskSummaries.push(`${prof?.name || '학생'}(${uniqueDishes.slice(0, 2).join(', ')})`);
      }
    });

      // 2. 위험 학생 유무에 따른 알림 문구 분기
      let notifTitle = '';
      let notifBody = '';

      if (riskSummaries.length > 0) {
        notifTitle = '⚠️ [급식 닥터] 오늘 알레르기 주의 식단 감지!';
        notifBody = `${riskSummaries.join(' / ')} 학생의 주의 식단이 있습니다. 앱에서 확인하세요.`;
      } else {
        notifTitle = '✅ [급식 닥터] 오늘의 안심 식단 안내';
        notifBody = '오늘은 등록된 학생 전원 알레르기 안심 식단입니다.';
      }

      // 3. 알림 발송 (웹 / 앱)
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          const perm = await (window as any).Notification.requestPermission();
          if (perm === 'granted') {
            new (window as any).Notification(notifTitle, { body: notifBody });
          } else {
            Alert.alert('권한 필요', '브라우저 알림 권한을 허용해 주세요.');
          }
        } else {
          Alert.alert(notifTitle, notifBody);
        }
      } else {
        Alert.alert(notifTitle, notifBody);
      }
    } catch (error) {
      console.log('알림 에러:', error);
      Alert.alert('안내', '알림 확인 중 오류가 발생했습니다.');
    }
  };

  const currentProfile = profiles.find((p) => p.id === currentProfileId);

  const parseMealInfo = (rawMealStr: string, userAllergies: number[]) => {
    const lines = rawMealStr.split('<br/>');
    return lines
      .map((line) => {
        const cleanLine = line.trim();
        if (!cleanLine) return null;

        const match = cleanLine.match(/^(.*?)\s*\(([\d\.]+)\)$/);
        let dishName = cleanLine;
        let allergyNums: number[] = [];

        if (match) {
          dishName = match[1].trim();
          allergyNums = match[2]
            .split('.')
            .map((n) => parseInt(n, 10))
            .filter((n) => !isNaN(n));
        }

        const allergies = allergyNums
          .map((id) => ALLERGY_LIST.find((a) => a.id === id)?.name)
          .filter(Boolean) as string[];

        const isDanger = allergyNums.some((id) => userAllergies.includes(id));

        return { dishName, allergies, isDanger };
      })
      .filter(Boolean) as MealItem[];
  };

  const fetchMealData = async () => {
    if (!currentProfile) return;
    setLoading(true);
    try {
      const ymd = selectedDate.replace(/-/g, '');
      const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=10&ATPT_OFCDC_SC_CODE=${currentProfile.ATPT_OFCDC_SC_CODE}&SD_SCHUL_CODE=${currentProfile.SD_SCHUL_CODE}&MLSV_YMD=${ymd}`;

      const res = await fetch(url);
      const json = await res.json();

     if (json.mealServiceDietInfo?.[1]?.row?.[0]) {
        const row = json.mealServiceDietInfo[1].row[0];
        const rawMeal = row.DDISH_NM;
        const parsed = parseMealInfo(rawMeal, currentProfile.myAllergies);
        setMeals(parsed);
        // 📊 영양 정보 및 칼로리 저장
        setNutritionData({
          ntr: row.NTR_INFO || '',
          cal: row.CAL_INFO || '',
        });
      } else {
        setMeals([]);
        setNutritionData({ ntr: '', cal: '' });
      }
    } catch (e) {
      console.error(e);
      setMeals([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllStudentsSummary = async () => {
    setSummaryLoading(true);
    const summaries: StudentSummary[] = [];

    try {
      const ymd = selectedDate.replace(/-/g, '');
      for (const p of profiles) {
        const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=10&ATPT_OFCDC_SC_CODE=${p.ATPT_OFCDC_SC_CODE}&SD_SCHUL_CODE=${p.SD_SCHUL_CODE}&MLSV_YMD=${ymd}`;
        const res = await fetch(url);
        const json = await res.json();

        if (json.mealServiceDietInfo?.[1]?.row?.[0]) {
          const rawMeal = json.mealServiceDietInfo[1].row[0].DDISH_NM;
          const parsed = parseMealInfo(rawMeal, p.myAllergies);
          const dangerItems = parsed.filter((item) => item.isDanger);

          if (dangerItems.length > 0) {
            summaries.push({ studentName: p.name, dangerItems });
          }
        }
      }
      setStudentSummaries(summaries);
    } catch (e) {
      console.error(e);
    } finally {
      setSummaryLoading(false);
    }
  };

  const changeDate = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    setSelectedDate(`${year}-${month}-${day}`);
  };

  const handleDatePickerClick = () => {
    if (Platform.OS === 'web') {
      if (webDateInputRef.current) {
        if ('showPicker' in webDateInputRef.current) {
          webDateInputRef.current.showPicker();
        } else {
          (webDateInputRef.current as any)?.click();
        }
      }
    } else {
      setTempDate(new Date(selectedDate));
      setShowDatePicker(true);
    }
  };

  const confirmDateChange = () => {
    const year = tempDate.getFullYear();
    const month = String(tempDate.getMonth() + 1).padStart(2, '0');
    const day = String(tempDate.getDate()).padStart(2, '0');
    setSelectedDate(`${year}-${month}-${day}`);
    setShowDatePicker(false);
  };

  const searchSchool = async () => {
    const query = searchSchoolQuery.trim();
    if (!query) {
      Alert.alert('안내', '학교 이름을 입력해 주세요.');
      return;
    }

    try {
      const url = `https://open.neis.go.kr/hub/schoolInfo?Type=json&pIndex=1&pSize=20&SCHUL_NM=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.schoolInfo?.[1]?.row) {
        setSearchResults(json.schoolInfo[1].row);
      } else {
        setSearchResults([]);
        Alert.alert('결과 없음', `'${query}'에 해당하는 학교가 없습니다.`);
      }
    } catch (e) {
      Alert.alert('오류', '학교 검색 중 오류가 발생했습니다.');
    }
  };

  const toggleAllergy = (id: number) => {
    if (selectedAllergies.includes(id)) {
      setSelectedAllergies(selectedAllergies.filter((a) => a !== id));
    } else {
      setSelectedAllergies([...selectedAllergies, id]);
    }
  };

  const handleSaveProfile = () => {
  if (!newStudentName.trim() || !selectedSchool) {
    Alert.alert('입력 오류', '학생 이름과 학교를 모두 지정해 주세요.');
    return;
  }

  if (editingProfileId) {
    // 1. 기존 프로필 수정 로직
    const updatedProfiles = profiles.map((p) => {
      if (p.id === editingProfileId) {
        return {
          ...p,
          name: newStudentName.trim(),
          schoolName: selectedSchool.SCHUL_NM,
          ATPT_OFCDC_SC_CODE: selectedSchool.ATPT_OFCDC_SC_CODE,
          SD_SCHUL_CODE: selectedSchool.SD_SCHUL_CODE,
          myAllergies: selectedAllergies,
          standardSymptoms: selectedSymptoms,
          customSymptomNote: customSymptomNote,
          medicationPresets: selectedMedicationPresets,
          customMedication: customMedication,
          medicationLocation: medicationLocation,
          ageGroup: selectedAgeGroup,
        };
      }
      return p;
    });

    saveProfiles(updatedProfiles);
  } else {
    // 2. 신규 프로필 등록 로직
    const newProfile: Profile = {
      id: Date.now().toString(),
      name: newStudentName.trim(),
      schoolName: selectedSchool.SCHUL_NM,
      ATPT_OFCDC_SC_CODE: selectedSchool.ATPT_OFCDC_SC_CODE,
      SD_SCHUL_CODE: selectedSchool.SD_SCHUL_CODE,
      myAllergies: selectedAllergies,
      standardSymptoms: selectedSymptoms,
      customSymptomNote: customSymptomNote,
      medicationPresets: selectedMedicationPresets,
      customMedication: customMedication,
      medicationLocation: medicationLocation,
      ageGroup: selectedAgeGroup,
    };

    const updated = [...profiles, newProfile];
    saveProfiles(updated);
    setCurrentProfileId(newProfile.id);
  }

  // 저장 완료 후 State 초기화 및 모달 닫기
  setEditingProfileId(null);
  setNewStudentName('');
  setSelectedSchool(null);
  setSearchSchoolQuery('');
  setSearchResults([]);
  setSelectedAllergies([]);
  setSelectedSymptoms([]);
  setCustomSymptomNote('');
  setSelectedMedicationPresets([]);
  setCustomMedication('');
  setMedicationLocation('');
  setIsModalOpen(false);
};

  return (
    <ScrollView 
  style={[styles.container, { maxWidth: 768, width: '100%', alignSelf: 'center' }]} 
  contentContainerStyle={{ paddingBottom: 50 }}
>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🧑‍⚕️️ 급식 닥터 (알러지 & 영양)</Text>
        <Text style={styles.versionText}>v{CURRENT_APP_VERSION}</Text>
      </View>

      {/* 1. 프로필 선택 영역 */}
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#2c3e50', flexShrink: 1 }} numberOfLines={1}>
  👤 학생/자녀 프로필 선택
</Text>
        
       {/* 우측 상단: 프로필 관리 & 요약정리 버튼 */}
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: '#4a90e2' }]}
            onPress={() => setIsProfileManageModalOpen(true)}
          >
            <Text style={styles.addBtnText}>⚙️ 프로필 관리</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: '#e74c3c' }]}
            onPress={() => setIsAllSummaryModalOpen(true)}
          >
            <Text style={styles.addBtnText}>📋 요약정리</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 가로 스크롤 프로필 목록 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.profileList}>
        {profiles.map((p) => {
            const isSelected = p.id === currentProfileId;
            return (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.profileChip,
                  isSelected && styles.profileChipSelected,
                  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
                ]}
                onPress={() => {
                  setCurrentProfileId(p.id);
                }}
              >
                <Text style={[styles.profileChipText, isSelected && styles.profileChipTextSelected]}>
                  {p.name} ({p.schoolName})
                </Text>
              </TouchableOpacity>
            );
          })}
      </ScrollView>
    </View>

          {/* 2. 날짜 선택 영역 */}
          <View style={styles.card}>
            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateNavBtn} onPress={() => changeDate(-1)}>
                <Text style={styles.dateNavBtnText}>◀ 이전일</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.datePickerBtn} onPress={handleDatePickerClick}>
                <Text style={styles.dateText}>📅 {selectedDate}</Text>
                <Text style={styles.dateSubText}>(터치하여 달력 선택)</Text>

                {Platform.OS === 'web' && (
                  <input
                    ref={webDateInputRef}
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      if (e.target.value) {
                        setSelectedDate(e.target.value);
                      }
                    }}
                    style={{
                      position: 'absolute',
                      opacity: 0,
                      width: '100%',
                      height: '100%',
                      top: 0,
                      left: 0,
                      cursor: 'pointer',
                    }}
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.dateNavBtn} onPress={() => changeDate(1)}>
                <Text style={styles.dateNavBtnText}>다음일 ▶</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 모바일(iOS/Android) 전용 달력 모달 */}
          {Platform.OS !== 'web' && (
            <Modal visible={showDatePicker} transparent={true} animationType="fade">
              <View style={styles.modalBackdrop}>
                <View style={styles.calendarModalCard}>
                  <Text style={styles.calendarTitle}>📅 날짜 선택</Text>

                  <View style={{ alignItems: 'center', marginVertical: 10 }}>
                    <DateTimePicker
                      value={tempDate}
                      mode="date"
                      display="inline"
                      onChange={(event, date) => {
                        if (date) setTempDate(date);
                      }}
                      style={{ width: 300, height: 320 }}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
                    <TouchableOpacity
                      style={[styles.modalBtn, { backgroundColor: '#e0e0e0', flex: 1 }]}
                      onPress={() => setShowDatePicker(false)}>
                      <Text style={{ color: '#333', fontWeight: 'bold' }}>취소</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalBtn, { backgroundColor: '#007AFF', flex: 1 }]}
                      onPress={confirmDateChange}>
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>선택 완료</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          )}

          {/* 3. 급식 리포트 */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionTitle}>📋 {currentProfile?.name || '학생'}의 급식 점검 리포트</Text>
              <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsModalVisible(true)}>
                <Text style={styles.settingsBtnText}>🔔 알림 설정</Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color="#2ecc71" style={{ marginVertical: 30 }} />
            ) : meals.length > 0 ? (
            <TouchableOpacity activeOpacity={0.95} onPress={handleToggleTrayFlip}>
            <View style={{ position: 'relative' }}>
              {/* 상단 안내 라벨 */}
              <View style={{ alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: '#3498db', fontWeight: 'bold' }}>
                  {isTrayFlipped ? '🔄 식판 메뉴로 돌아가기' : '✨ 식판을 터치하면 상세 영양 리포트가 열려요'}
                </Text>
              </View>

              {/* 앞면: 식판 */}
              <Animated.View
                style={{
                  transform: [{ perspective: 1000 }, { rotateY: trayFrontRotate }],
                  backfaceVisibility: 'hidden',
                }}
              >
                <MealTrayView meals={meals} />
              </Animated.View>

              {/* 뒷면: 8대 맞춤 영양 리포트 */}
              <Animated.View
                style={{
                  position: 'absolute',
                  top: 26,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  transform: [{ perspective: 1000 }, { rotateY: trayBackRotate }],
                  backfaceVisibility: 'hidden',
                  backgroundColor: '#ffffff',
                  borderRadius: 16,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: '#e9ecef',
                  justifyContent: 'space-between',
                  elevation: 4,
                  shadowColor: '#000',
                  shadowOpacity: 0.08,
                  shadowRadius: 6,
                }}
              >
                {(() => {
                  const currentProf = (profiles || []).find((p: any) => p.id === currentProfileId);
                  const userGroupKey = currentProf?.ageGroup || 'grade3_4';
                  const standard = NUTRITION_STANDARDS[userGroupKey] || NUTRITION_STANDARDS.grade3_4;
                  const groupLabel = AGE_GROUPS.find((g: any) => g.id === userGroupKey)?.label || '초등 3~4학년';

                  const parsedNtr = parseNutritionInfo(nutritionData?.ntr);
                  const currentCalNum = parseFloat((nutritionData?.cal || '0').replace(/[^\d.]/g, '')) || 0;

                  // 부족 영양소 진단
                  const shortages: string[] = [];
                  if (currentCalNum > 0 && currentCalNum < standard.cal * 0.8) shortages.push('열량');
                  if (parsedNtr.protein > 0 && parsedNtr.protein < standard.protein * 0.8) shortages.push('단백질');
                  if (parsedNtr.calcium > 0 && parsedNtr.calcium < standard.calcium * 0.8) shortages.push('칼슘');
                  if (parsedNtr.iron > 0 && parsedNtr.iron < standard.iron * 0.8) shortages.push('철분');
                  if (parsedNtr.vitC > 0 && parsedNtr.vitC < standard.vitC * 0.8) shortages.push('비타민C');

                  const nutrients = [
                    { name: '열량', current: currentCalNum, target: standard.cal, unit: 'kcal', color: '#ff922b' },
                    { name: '탄수화물', current: parsedNtr.carb, target: standard.carb, unit: 'g', color: '#fab005' },
                    { name: '단백질', current: parsedNtr.protein, target: standard.protein, unit: 'g', color: '#51cf66' },
                    { name: '지방', current: parsedNtr.fat, target: standard.fat, unit: 'g', color: '#ff6b6b' },
                    { name: '칼슘(무기질)', current: parsedNtr.calcium, target: standard.calcium, unit: 'mg', color: '#339af0' },
                    { name: '철분(무기질)', current: parsedNtr.iron, target: standard.iron, unit: 'mg', color: '#845ef7' },
                    { name: '비타민A', current: parsedNtr.vitA, target: standard.vitA, unit: 'R.E', color: '#20c997' },
                    { name: '비타민C', current: parsedNtr.vitC, target: standard.vitC, unit: 'mg', color: '#f783ac' },
                  ];

                  return (
                    <View style={{ flex: 1, justifyContent: 'space-between' }}>
                      {/* 헤더 */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f3f5', paddingBottom: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#2c3e50' }}>
                          📊 {currentProf?.name || '학생'} 8대 영양소 분석
                        </Text>
                        <View style={{ backgroundColor: '#e7f5ff', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 }}>
                          <Text style={{ fontSize: 11, color: '#1971c2', fontWeight: 'bold' }}>{groupLabel}</Text>
                        </View>
                      </View>

                      {/* 8대 영양소 2열(그리드) 배치 */}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6, marginVertical: 4 }}>
                        {nutrients.map((item, idx) => {
                          const percent = item.target > 0 && item.current > 0 ? Math.min(Math.round((item.current / item.target) * 100), 150) : 0;
                          return (
                            <View key={idx} style={{ width: '48%', backgroundColor: '#f8f9fa', padding: 6, borderRadius: 8, borderWidth: 1, borderColor: '#edf2f7' }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#495057' }}>{item.name}</Text>
                                <Text style={{ fontSize: 9, fontWeight: 'bold', color: item.color }}>{percent}%</Text>
                              </View>
                              <View style={{ height: 4, backgroundColor: '#e9ecef', borderRadius: 2, overflow: 'hidden', marginBottom: 3 }}>
                                <View style={{ height: '100%', width: `${Math.min(percent, 100)}%`, backgroundColor: item.color, borderRadius: 2 }} />
                              </View>
                              <Text style={{ fontSize: 9, color: '#868e96', textAlign: 'right' }}>
                                {item.current > 0 ? `${Math.round(item.current)}${item.unit}` : '-'} / {item.target}{item.unit}
                              </Text>
                            </View>
                          );
                        })}
                      </View>

                      {/* 맞춤 피드백 안내 카드 */}
                      <View style={{ backgroundColor: '#fff9db', padding: 7, borderRadius: 8, borderWidth: 1, borderColor: '#ffe066' }}>
                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#f08c00', marginBottom: 1 }}>
                          💡 권장 섭취 보충 팁
                        </Text>
                        <Text style={{ fontSize: 10, color: '#495057', lineHeight: 14 }}>
                          {shortages.length > 0
                            ? `오늘 급식은 권장량 대비 [${shortages.join(', ')}]이 조금 적어요. 저녁이나 간식(우유, 과일 등)으로 보충해 주세요!`
                            : '8대 성장기 필수 영양소가 고르게 충족된 균형 식단입니다!'}
                        </Text>
                      </View>
                    </View>
                  );
                })()}
              </Animated.View>
            </View>
          </TouchableOpacity>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>해당 날짜에는 등록된 급식 정보가 없습니다.</Text>
              </View>
            )}
            {/* 📄 선택된 학생 상세 정보 카드 (식판 바로 아래 상시 노출) */}
        {(() => {
          const targetProf: any = (profiles || []).find((p: any) => p.id === currentProfileId);
          if (!targetProf) return null;

          const allergyArr = targetProf.myAllergies || targetProf.allergies || [];
          const allergiesList = Array.isArray(allergyArr) && allergyArr.length > 0 
            ? allergyArr.join(', ') 
            : '등록된 알레르기 없음';

          const symptomsArr = targetProf.symptoms || [];
          const symptomsList = Array.isArray(symptomsArr) && symptomsArr.length > 0 
            ? symptomsArr.join(', ') 
            : (targetProf.symptomText || '등록된 증상 없음');

          const medsArr = targetProf.medications || [];
          const medsList = Array.isArray(medsArr) && medsArr.length > 0 
            ? medsArr.join(', ') 
            : (targetProf.medicationText || '등록된 비상 약물 없음');

          return (
            <View
              style={{
                marginTop: 14,
                padding: 16,
                backgroundColor: '#ffffff',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#e9ecef',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 2,
                elevation: 1,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2c3e50', marginBottom: 12 }}>
                🧑 {targetProf.name} 학생 정보 ({targetProf.schoolName || '학교'})
              </Text>

              <View style={{ gap: 10 }}>
                <View>
                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#e67e22' }}>⚠️ 보유 알레르기</Text>
                <Text style={{ fontSize: 13, color: '#333', marginTop: 3 }}>
                  {formatAllergyNames(targetProf.myAllergies || targetProf.allergies)}
                </Text>
              </View>

                <View>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#e74c3c' }}>🚨 주요 나타나는 증상</Text>
                  <Text style={{ fontSize: 13, color: '#333', marginTop: 3 }}>
                    {symptomsList}
                  </Text>
                </View>

                {targetProf.memo ? (
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#34495e' }}>📝 학생별 특이 반응 / 메모</Text>
                    <View style={{ backgroundColor: '#f8f9fa', padding: 10, borderRadius: 8, marginTop: 4 }}>
                      <Text style={{ fontSize: 13, color: '#495057' }}>{targetProf.memo}</Text>
                    </View>
                  </View>
                ) : null}

                <View style={{ backgroundColor: '#fff9db', padding: 12, borderRadius: 10, marginTop: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#d9480f' }}>💊 긴급/비상 약물 및 보관 위치</Text>
                  <Text style={{ fontSize: 12, color: '#333', marginTop: 4 }}>
                    • 약물: {medsList}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#333', marginTop: 2 }}>
                    • 위치: {targetProf.medLocation || '등록된 보관 위치 없음'}
                  </Text>
                </View>
              </View>
            </View>
          );
        })()}
          </View>

{/* ⚙️ 1. 프로필 관리 선택 모달 (수정 / 추가 / 삭제 분기) */}
      <Modal
        visible={isProfileManageModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsProfileManageModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.settingsModalCard, { padding: 22 }]}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginBottom: 8, textAlign: 'center' }}>
              ⚙️ 프로필 관리
            </Text>
            <Text style={{ fontSize: 13, color: '#7f8c8d', marginBottom: 20, textAlign: 'center' }}>
              수행하실 작업을 선택해 주세요.
            </Text>

            {/* 기존 프로필 수정 버튼 */}
            <TouchableOpacity
              style={{
                backgroundColor: '#4a90e2',
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: 'center',
                marginBottom: 10,
              }}
              onPress={() => {
                setIsProfileManageModalOpen(false);
                setIsProfileListModalOpen(true);
              }}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: 'bold' }}>
                ✏️ 기존 프로필 수정하기
              </Text>
            </TouchableOpacity>

            {/* 새 프로필 추가 버튼 */}
            <TouchableOpacity
              style={{
                backgroundColor: '#2ecc71',
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: 'center',
                marginBottom: 10,
              }}
              onPress={() => {
                setIsProfileManageModalOpen(false);
                setSelectedAgeGroup('grade3_4');
                setIsModalOpen(true);
              }}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: 'bold' }}>
                ➕ 새 프로필 추가하기
              </Text>
            </TouchableOpacity>

            {/* 현재 선택된 학생 삭제 버튼 */}
            <TouchableOpacity
              style={{
                backgroundColor: '#fff0f0',
                borderWidth: 1,
                borderColor: '#ffc9c9',
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: 'center',
                marginBottom: 14,
              }}
             onPress={() => {
                setIsProfileManageModalOpen(false);
                setSelectedDeleteIds([]);
                setIsDeleteModalOpen(true);
              }}
            >
              <Text style={{ color: '#e03131', fontSize: 15, fontWeight: 'bold' }}>
                🗑️ 기본 프로필 삭제하기
              </Text>
            </TouchableOpacity>

            {/* 닫기 버튼 */}
            <TouchableOpacity
              style={{ paddingVertical: 10, alignItems: 'center' }}
              onPress={() => setIsProfileManageModalOpen(false)}
            >
              <Text style={{ color: '#95a5a6', fontSize: 14 }}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

{/* 🗑️ 삭제할 프로필 선택 모달 (다중 선택 및 일괄 삭제) */}
      <Modal
        visible={isDeleteModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsDeleteModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.settingsModalCard, { maxHeight: '80%', padding: 22 }]}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#c0392b', marginBottom: 6, textAlign: 'center' }}>
              🗑️ 삭제할 프로필 선택
            </Text>
            <Text style={{ fontSize: 13, color: '#7f8c8d', marginBottom: 16, textAlign: 'center' }}>
              삭제할 학생을 한 명 또는 여러 명 선택해 주세요.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300, marginBottom: 16 }}>
              {profiles.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#95a5a6', paddingVertical: 20 }}>
                  등록된 프로필이 없습니다.
                </Text>
              ) : (
                profiles.map((p: any) => {
                  const isChecked = selectedDeleteIds.includes(p.id);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 12,
                        backgroundColor: isChecked ? '#ffe3e3' : '#f8f9fa',
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: isChecked ? '#fa5252' : '#e9ecef',
                        marginBottom: 8,
                      }}
                      onPress={() => {
                        if (isChecked) {
                          setSelectedDeleteIds(selectedDeleteIds.filter((id) => id !== p.id));
                        } else {
                          setSelectedDeleteIds([...selectedDeleteIds, p.id]);
                        }
                      }}
                    >
                      <View>
                        <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#2c3e50' }}>
                          {p.name}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#7f8c8d', marginTop: 2 }}>
                          {p.schoolName || '학교 정보 없음'}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 18, fontWeight: 'bold', color: isChecked ? '#e03131' : '#adb5bd' }}>
                        {isChecked ? '☑️' : '⬜'}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#868e96',
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                }}
                onPress={() => setIsDeleteModalOpen(false)}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>취소</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 2,
                  backgroundColor: selectedDeleteIds.length > 0 ? '#e03131' : '#ffa8a8',
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                }}
                disabled={selectedDeleteIds.length === 0}
                onPress={async () => {
                  if (selectedDeleteIds.length === 0) return;
                  if (confirm(`선택한 ${selectedDeleteIds.length}명의 프로필을 삭제하시겠습니까?`)) {
                    // 1. 선택된 학생들을 한 번에 제외
                    const updated = profiles.filter((p: any) => !selectedDeleteIds.includes(p.id));
                    setProfiles(updated);

                    // 2. 스토리지(AsyncStorage / localStorage)에 한 번에 영구 저장
                    try {
                      if (typeof AsyncStorage !== 'undefined') {
                        await AsyncStorage.setItem('@profiles', JSON.stringify(updated));
                      } else if (typeof localStorage !== 'undefined') {
                        localStorage.setItem('student_profiles', JSON.stringify(updated));
                      }
                    } catch (e) {
                      console.error(e);
                    }

                    // 3. 만약 현재 선택되어 보던 학생이 삭제 목록에 포함되어 있다면 남은 첫 번째 학생으로 변경
                    if (selectedDeleteIds.includes(currentProfileId)) {
                      if (updated.length > 0) {
                        setCurrentProfileId(updated[0].id);
                      } else {
                        setCurrentProfileId('');
                      }
                    }

                    // 4. 모달 닫기 및 선택 초기화
                    setSelectedDeleteIds([]);
                    setIsDeleteModalOpen(false);
                  }
                }}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>
                  {selectedDeleteIds.length > 0 ? `${selectedDeleteIds.length}명 삭제하기` : '삭제할 대상 선택'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 📋 2. 등록 학생 전체 선택 날짜 알레르기 요약 모달 */}
      <Modal
        visible={isAllSummaryModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsAllSummaryModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.settingsModalCard, { maxHeight: '80%', padding: 20 }]}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginBottom: 4 }}>
              📋 {selectedDate || '선택 날짜'} 학생 위험 급식 요약
            </Text>
            <Text style={{ fontSize: 12, color: '#7f8c8d', marginBottom: 14 }}>
              선택하신 날짜({selectedDate || '해당일'}) 급식을 기준으로 등록된 학생들의 위험 메뉴를 확인합니다.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              {(() => {
                // 식판과 동일한 알레르기 판별 함수 (번호 & 이름 양방향 매칭)
                const isAllergyMatch = (dishAllergies: any[], userAllergies: any[]) => {
                  if (!Array.isArray(dishAllergies) || !Array.isArray(userAllergies)) return false;
                  return dishAllergies.some((dishItem: any) => {
                    const dishStr = String(dishItem).trim();
                    return userAllergies.some((userItem: any) => {
                      const userStr = String(userItem).trim();
                      const userName = (typeof ALLERGY_NAMES !== 'undefined' ? ALLERGY_NAMES[userStr] : '') || userStr;
                      return (
                        dishStr === userStr ||
                        dishStr.includes(userName) ||
                        dishStr.includes(userStr)
                      );
                    });
                  });
                };

                const dangerReports = (profiles || [])
                  .map((prof: any) => {
                    const userAllergies = prof?.myAllergies || prof?.allergies || [];
                    const dangerDishes = ((meals as any) || []).filter((dish: any) => {
                      const dishAllergies = dish?.allergies || [];
                      return isAllergyMatch(dishAllergies, userAllergies);
                    });
                    return { profile: prof, dangerDishes };
                  })
                  .filter((r: any) => r.dangerDishes.length > 0);

                if (dangerReports.length === 0) {
                  return (
                    <View style={{ paddingVertical: 36, alignItems: 'center' }}>
                      <Text style={{ fontSize: 16, color: '#2ecc71', fontWeight: 'bold' }}>
                        ✅ 선택한 날짜에는 모든 학생이 안전합니다!
                      </Text>
                      <Text style={{ fontSize: 13, color: '#95a5a6', marginTop: 6, textAlign: 'center' }}>
                        {selectedDate || '해당 날짜'} 급식 식단에 등록된 학생들의{'\n'}알레르기 유발 식품이 없습니다.
                      </Text>
                    </View>
                  );
                }

                return dangerReports.map((report: any, idx: number) => (
                  <View
                    key={idx}
                    style={{
                      backgroundColor: '#fff5f5',
                      borderLeftWidth: 4,
                      borderLeftColor: '#e74c3c',
                      padding: 12,
                      borderRadius: 8,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#c0392b' }}>
                      👤 {report.profile.name} ({report.profile.schoolName || '학교'})
                    </Text>
                    <View style={{ marginTop: 6, gap: 4 }}>
                      {report.dangerDishes.map((dish: any, dIdx: number) => (
                        <Text key={dIdx} style={{ fontSize: 13, color: '#333' }}>
                          • <Text style={{ fontWeight: 'bold' }}>{dish.dishName?.replace(/\*/g, '')}</Text>
                          <Text style={{ color: '#e74c3c', fontSize: 12 }}>
                            {' '}(유발: {Array.isArray(dish.allergies) ? dish.allergies.join(', ') : ''})
                          </Text>
                        </Text>
                      ))}
                    </View>
                  </View>
                ));
              })()}
            </ScrollView>

            <TouchableOpacity
              style={{
                backgroundColor: '#3498db',
                paddingVertical: 12,
                borderRadius: 8,
                alignItems: 'center',
                marginTop: 14,
              }}
              onPress={() => setIsAllSummaryModalOpen(false)}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

            {/* 모달 1: 알림 설정 */}
          <Modal visible={isSettingsModalVisible} animationType="fade" transparent={true}>
            <View style={styles.modalBackdrop}>
              <View style={styles.settingsModalCard}>
                <Text style={styles.settingsModalTitle}>🔔 매일 급식 알림 설정</Text>

                <View style={styles.settingsRow}>
                  <Text style={{ fontSize: 16, color: '#333', fontWeight: '600' }}>알림 받기 (ON / OFF)</Text>
                  <Switch value={isNotificationEnabled} onValueChange={setIsNotificationEnabled} />
                </View>

                {isNotificationEnabled && (
                  <View style={styles.timePickerContainer}>
                    <Text style={styles.timePickerLabel}>알림을 받을 시간 (24시간 형식 / 예: 00시 40분)</Text>

                    <View style={styles.timeDirectInputRow}>
                      <View style={styles.timeInputBlock}>
                        <Text style={styles.timeInputLabel}>시 (00~23)</Text>
                        <TextInput
                          style={styles.timeNumberInput}
                          keyboardType="number-pad"
                          maxLength={2}
                          value={inputHour}
                          onChangeText={(text) => setInputHour(text.replace(/[^0-9]/g, ''))}
                          placeholder="00"
                        />
                      </View>

                      <Text style={styles.timeColonLarge}>:</Text>

                      <View style={styles.timeInputBlock}>
                        <Text style={styles.timeInputLabel}>분 (00~59)</Text>
                        <TextInput
                          style={styles.timeNumberInput}
                          keyboardType="number-pad"
                          maxLength={2}
                          value={inputMinute}
                          onChangeText={(text) => setInputMinute(text.replace(/[^0-9]/g, ''))}
                          placeholder="40"
                        />
                      </View>
                    </View>

                    <Text style={styles.selectedTimePreview}>
                      설정 예정: {parseInt(inputHour || '0', 10) < 12 ? '오전' : '오후'}{' '}
                      {parseInt(inputHour || '0', 10) % 12 === 0 ? 12 : parseInt(inputHour || '0', 10) % 12}시{' '}
                      {String(parseInt(inputMinute || '0', 10)).padStart(2, '0')}분
                    </Text>

                    <TouchableOpacity style={styles.testNotifBtn} onPress={triggerTestNotification}>
                      <Text style={styles.testNotifBtnText}>🧪 테스트 알림 확인하기</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity style={styles.saveSettingsBtn} onPress={handleSaveSettings}>
                    <Text style={styles.saveSettingsBtnText}>저장하기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.closeSettingsBtn} onPress={() => setSettingsModalVisible(false)}>
                    <Text style={styles.closeSettingsBtnText}>취소</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* 모달 2: 프로필 추가 */}
          <Modal visible={isModalOpen} animationType="slide" transparent={false}>
            <ScrollView style={styles.modalContainer}>
              <Text style={styles.modalTitle}>학생 / 자녀 프로필 추가</Text>

              <Text style={styles.label}>1. 학생/자녀 이름</Text>
              <TextInput
                style={styles.input}
                placeholder="예: 김도형"
                value={newStudentName}
                onChangeText={setNewStudentName}
              />

              <Text style={styles.label}>2. 학교 검색</Text>
              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="학교명 입력 (예: 호명초)"
                  value={searchSchoolQuery}
                  onChangeText={setSearchSchoolQuery}
                />
                <TouchableOpacity style={styles.searchBtn} onPress={searchSchool}>
                  <Text style={styles.searchBtnText}>검색</Text>
                </TouchableOpacity>
              </View>

              {searchResults.length > 0 && (
                <View style={styles.searchResultsBox}>
                  {searchResults.map((item) => (
                    <TouchableOpacity
                      key={item.SD_SCHUL_CODE}
                      style={[
                        styles.searchItem,
                        selectedSchool?.SD_SCHUL_CODE === item.SD_SCHUL_CODE && styles.searchItemSelected,
                      ]}
                      onPress={() => {
  setSelectedSchool(item);
  setSearchResults([]);
  setSearchSchoolQuery(item.SCHUL_NM || '');
}}>
                      <Text style={styles.schoolNameText}>{item.SCHUL_NM}</Text>
                      <Text style={styles.schoolAddrText}>{item.ORG_RDNMA || item.LCTN_SC_NM}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {selectedSchool && (
                <Text style={styles.selectedSchoolBadge}>선택된 학교: {selectedSchool.SCHUL_NM}</Text>
              )}

{/* 3. 학년 / 연령 구분 선택 */}
            <Text style={[styles.label, { marginTop: 16 }]}>
              3. 학년 / 연령 구분 (영양 권장량 기준)
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
              {AGE_GROUPS.map((group) => {
                const isSelected = selectedAgeGroup === group.id;
                return (
                  <TouchableOpacity
                    key={group.id}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 18,
                      backgroundColor: isSelected ? '#3498db' : '#f1f3f5',
                      borderWidth: 1,
                      borderColor: isSelected ? '#2980b9' : '#dee2e6',
                    }}
                    onPress={() => setSelectedAgeGroup(group.id)}
                  >
                    <Text
                      style={{
                        color: isSelected ? '#ffffff' : '#495057',
                        fontWeight: isSelected ? 'bold' : 'normal',
                        fontSize: 13,
                      }}
                    >
                      {group.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

              <Text style={styles.label}>4. 보유 알레르기 선택 (다중 선택 가능)</Text>
              <View style={styles.allergyGrid}>
                {ALLERGY_LIST.map((item) => {
                  const isChecked = selectedAllergies.includes(item.id);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.allergyChip, isChecked && styles.allergyChipSelected]}
                      onPress={() => toggleAllergy(item.id)}>
                      <Text style={[styles.allergyChipText, isChecked && styles.allergyChipTextSelected]}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

{/* 5. 알레르기 주요 증상 선택 */}
        <Text style={[styles.label, { marginTop: 15 }]}>5. 주요 증상 선택 (다중 선택 가능)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {STANDARD_SYMPTOMS.map((symptom) => {
            const isSelected = selectedSymptoms.includes(symptom);
            return (
              <TouchableOpacity
                key={symptom}
                onPress={() => toggleSymptom(symptom)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 15,
                  backgroundColor: isSelected ? '#ff6b6b' : '#f0f0f0',
                  marginRight: 6,
                  marginBottom: 6,
                }}
              >
                <Text style={{ color: isSelected ? '#fff' : '#333', fontSize: 13 }}>
                  {isSelected ? '✓ ' : ''}{symptom}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 6. 학생별 특이 반응 / 메모 */}
        <Text style={[styles.label, { marginTop: 10 }]}>6. 학생별 특이 반응 / 상세 메모</Text>
        <TextInput
          style={{
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 8,
            padding: 10,
            fontSize: 14,
            minHeight: 60,
            backgroundColor: '#fff',
            marginBottom: 15,
          }}
          placeholder="예: 익힌 계란은 먹을 수 있으나 날계란은 가려움증 유발"
          multiline
          value={customSymptomNote}
          onChangeText={setCustomSymptomNote}
        />
{/* 7. 긴급/비상 약물 (체크박스 칩 + 직접 입력) */}
      <Text style={[styles.label, { marginTop: 10 }]}>7. 긴급/비상 약물 (선택)</Text>
      
      {/* 자주 쓰는 비상 약물 Preset 칩 선택 영역 */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {EMERGENCY_MED_PRESETS.map((med) => {
          const isSelected = selectedMedicationPresets.includes(med);
          return (
            <TouchableOpacity
              key={med}
              onPress={() => toggleMedicationPreset(med)}
              style={{
                backgroundColor: isSelected ? '#d9534f' : '#f8f9fa',
                borderColor: isSelected ? '#d9534f' : '#ccc',
                borderWidth: 1,
                borderRadius: 20,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Text style={{ fontSize: 13, color: isSelected ? '#fff' : '#333', fontWeight: isSelected ? 'bold' : 'normal' }}>
                {isSelected ? '✓ ' : '+ '}{med}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 기타 비상 약물 직접 입력 */}
      <TextInput
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          borderRadius: 8,
          padding: 10,
          fontSize: 14,
          backgroundColor: '#fff',
          marginBottom: 15,
        }}
        placeholder="기타 처방 약물 직접 입력 (예: 펜믹스, 특정 연고 등)"
        value={customMedication}
        onChangeText={setCustomMedication}
      />

      {/* 8. 약물 보관 위치 입력 */}
      <Text style={[styles.label, { marginTop: 10 }]}>8. 약물 보관 위치 (선택)</Text>
      <TextInput
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          borderRadius: 8,
          padding: 10,
          fontSize: 14,
          backgroundColor: '#fff',
          marginBottom: 15,
        }}
        placeholder="예: 보건실 2번 수납장, 책상 첫 번째 서랍, 가방 앞주머니"
        value={medicationLocation}
        onChangeText={setMedicationLocation}
      />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn, { marginRight: 10 }]} onPress={() => setIsModalOpen(false)}>
                  <Text style={styles.modalBtnText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.saveBtn]} onPress={handleSaveProfile}>
                  <Text style={styles.modalBtnText}>저장하기</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Modal>
          {/* 프로필 상세 보기 모달 */}
      <Modal visible={isDetailModalOpen} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', width: '100%', maxWidth: 500, borderRadius: 12, padding: 20, maxHeight: '80%' }}>
            <ScrollView>
              <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 4, color: '#333' }}>
                👦 {detailProfile?.name} 학생 정보
              </Text>
              <Text style={{ fontSize: 14, color: '#666', marginBottom: 15 }}>
                {detailProfile?.schoolName}
              </Text>

              <View style={{ height: 1, backgroundColor: '#eee', marginVertical: 10 }} />

              {/* 1. 보유 알레르기 */}
              <Text style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 6 }}>⚠️ 보유 알레르기</Text>
              <Text style={{ fontSize: 14, color: '#444', marginBottom: 15 }}>
                {detailProfile?.myAllergies && detailProfile.myAllergies.length > 0
                  ? ALLERGY_LIST.filter(a => detailProfile.myAllergies.includes(a.id)).map(a => a.name).join(', ')
                  : '선택된 알레르기 없음'}
              </Text>

              {/* 2. 주요 증상 */}
              <Text style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 6 }}>🚨 주요 나타나는 증상</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 15 }}>
                {detailProfile?.standardSymptoms && detailProfile.standardSymptoms.length > 0 ? (
                  detailProfile.standardSymptoms.map(symptom => (
                    <View key={symptom} style={{ backgroundColor: '#ffe3e3', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ color: '#d63031', fontSize: 12, fontWeight: 'bold' }}>{symptom}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ fontSize: 14, color: '#888' }}>등록된 증상 없음</Text>
                )}
              </View>

              {/* 3. 특이사항 메모 */}
              <Text style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 6 }}>📝 학생별 특이 반응 / 메모</Text>
              <View style={{ backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8, marginBottom: 15 }}>
                <Text style={{ fontSize: 14, color: '#333' }}>
                  {detailProfile?.customSymptomNote || '입력된 특이사항이 없습니다.'}
                </Text>
              </View>
              {/* 4. 비상 약물 및 보관 위치 */}
      <Text style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 6, marginTop: 15 }}>
        💊 긴급/비상 약물 및 보관 위치
      </Text>
      <View style={{ backgroundColor: '#fff3cd', padding: 12, borderRadius: 8, marginBottom: 15 }}>
        <Text style={{ fontSize: 14, color: '#856404', fontWeight: 'bold', marginBottom: 6 }}>
          약물:
        </Text>
        
        {/* 선택한 약물 프리셋 목록 칩 표시 */}
        {detailProfile?.medicationPresets && detailProfile.medicationPresets.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {detailProfile.medicationPresets.map((med) => (
              <View key={med} style={{ backgroundColor: '#ffeeba', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: '#ffe8a1' }}>
                <Text style={{ fontSize: 12, color: '#856404', fontWeight: 'bold' }}>• {med}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 직접 입력한 기타 약물 표시 */}
        {detailProfile?.customMedication ? (
          <Text style={{ fontSize: 13, color: '#856404', marginBottom: 4 }}>
            기타: {detailProfile.customMedication}
          </Text>
        ) : null}

        {/* 선택된 약물도, 직접 입력도 없는 경우 */}
        {!detailProfile?.medicationPresets?.length && !detailProfile?.customMedication && (
          <Text style={{ fontSize: 13, color: '#856404', marginBottom: 4 }}>
            등록된 비상 약물 없음
          </Text>
        )}

        {/* 보관 위치 표시 */}
        <Text style={{ fontSize: 13, color: '#856404', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#ffe8a1' }}>
          위치: {detailProfile?.medicationLocation || '등록된 보관 위치 없음'}
        </Text>
      </View>
            </ScrollView>
{/* 상세 보기 모달 하단 버튼 영역 */}
          <View style={{ marginTop: 15 }}>
            <TouchableOpacity
              onPress={() => setIsDetailModalOpen(false)}
              style={{
                backgroundColor: '#4a90e2',
                paddingVertical: 12,
                borderRadius: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>닫기</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
      {/* 1. 프로필 수정 대상 선택 모달 */}
    <Modal visible={isProfileListModalOpen} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{ backgroundColor: '#fff', width: '100%', maxWidth: 500, borderRadius: 12, padding: 20, maxHeight: '80%' }}>
          
          {/* 타이틀 */}
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#333' }}>
            ✏️ 수정할 프로필 선택
          </Text>

          <ScrollView>
            {profiles.length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#888', marginVertical: 20 }}>
                등록된 학생이 없습니다.
              </Text>
            ) : (
              profiles.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => {
                    setIsProfileListModalOpen(false); // 목록 창 닫기
                    handleEditProfile(p);             // 즉시 수정 화면 열기
                  }}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: '#eee',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333' }}>{p.name}</Text>
                    <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{p.schoolName}</Text>
                  </View>

                  {/* 수정하기 뱃지 버튼 */}
                  <View style={{ backgroundColor: '#f0ad4e', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                    <Text style={{ fontSize: 13, color: '#fff', fontWeight: 'bold' }}>
                      ✏️ 수정하기
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          {/* 닫기 버튼 */}
          <TouchableOpacity
            onPress={() => setIsProfileListModalOpen(false)}
            style={{
              backgroundColor: '#6c757d',
              padding: 12,
              borderRadius: 8,
              alignItems: 'center',
              marginTop: 15,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>닫기</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
      {/* 🚨 위험 메뉴 종합 정리 모달 */}
      <Modal visible={isSummaryModalOpen} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', width: '100%', maxWidth: 500, borderRadius: 12, padding: 20, maxHeight: '80%' }}>
            
            {/* 헤더 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#d63031' }}>
                🚨 위험 메뉴 종합 정리 안내
              </Text>
              <TouchableOpacity onPress={() => setIsSummaryModalOpen(false)}>
                <Text style={{ fontSize: 18, color: '#999', fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: '#666', marginBottom: 15 }}>
              선택일({selectedDate}) 기준, 위험 성분이 감지된 전체 학생 목록입니다.
            </Text>

            {/* 내용 스크롤 영역 */}
            <ScrollView style={{ backgroundColor: '#fff5f5', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#ffe3e3' }}>
              {summaryLoading ? (
                <ActivityIndicator size="small" color="#e74c3c" style={{ marginVertical: 10 }} />
              ) : studentSummaries.length > 0 ? (
                studentSummaries.map((summary, idx) => (
                  <View key={idx} style={{ marginBottom: 10, flexDirection: 'row', flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#333' }}>
                      • {summary.studentName} :{' '}
                    </Text>
                    {summary.dangerItems.map((item, itemIdx) => (
                      <Text key={itemIdx} style={{ fontSize: 14, color: '#d63031', fontWeight: 'bold' }}>
                        *{item.dishName}
                        <Text style={{ fontSize: 12, color: '#e74c3c', fontWeight: 'normal' }}>
                          ({item.allergies.join(', ')})
                        </Text>
                        {itemIdx < summary.dangerItems.length - 1 ? ', ' : ''}
                      </Text>
                    ))}
                  </View>
                ))
              ) : (
                <Text style={{ fontSize: 13, color: '#888', textAlign: 'center', paddingVertical: 10 }}>
                  ✅ 등록된 모든 학생의 급식에 알레르기 위험 요소가 없습니다.
                </Text>
              )}
            </ScrollView>

            {/* 닫기 버튼 */}
            <TouchableOpacity
              onPress={() => setIsSummaryModalOpen(false)}
              style={{
                backgroundColor: '#4a90e2',
                padding: 12,
                borderRadius: 8,
                alignItems: 'center',
                marginTop: 15,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>닫기</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>
      {/* 앱 정보 푸터 */}
        <View style={{ marginTop: 30, paddingVertical: 20, borderTopWidth: 1, borderTopColor: '#eee', alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#666', marginBottom: 4 }}>
            학생 알레르기 & 영양 관리 시스템 v1.0.1
          </Text>
          <Text style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>
            기획 및 개발: 김도형, 나승호
          </Text>
          <Text style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
            문의/피드백: bluepow@gbe.kr
          </Text>
          <Text style={{ fontSize: 11, color: '#bbb' }}>
            © 2026. All rights reserved.
          </Text>
        </View>
        </ScrollView>
        );
}

        const styles = StyleSheet.create({
          container: {flex: 1, backgroundColor: '#f4f6f8' },
        header: {paddingTop: 50, paddingBottom: 12, backgroundColor: '#ffffff', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e1e4e8' },
        headerTitle: {fontSize: 20, fontWeight: 'bold', color: '#2c3e50' },
        versionText: {fontSize: 11, color: '#95a5a6', marginTop: 2 },
        card: {backgroundColor: '#ffffff', marginHorizontal: 15, marginTop: 15, padding: 15, borderRadius: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
        cardHeaderRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
        sectionTitle: {fontSize: 16, fontWeight: 'bold', color: '#2c3e50' },

        addBtn: {backgroundColor: '#27ae60', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
        addBtnText: {color: '#fff', fontSize: 12, fontWeight: 'bold' },

        profileList: {flexDirection: 'row' },
        profileChip: {backgroundColor: '#eef2f5', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
        profileChipSelected: {backgroundColor: '#27ae60' },
        profileChipText: {color: '#7f8c8d', fontSize: 13 },
        profileChipTextSelected: {color: '#ffffff', fontWeight: 'bold' },

        dateRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        dateNavBtn: {backgroundColor: '#e0e0e0', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
        dateNavBtnText: {fontSize: 13, fontWeight: 'bold', color: '#333' },
        datePickerBtn: {alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, position: 'relative' },
        dateText: {fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
        dateSubText: {fontSize: 11, color: '#7f8c8d' },

        settingsBtn: {backgroundColor: '#FFA500', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
        settingsBtnText: {color: '#fff', fontSize: 13, fontWeight: 'bold' },

        mealCard: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 8 },
        mealCardSafe: {backgroundColor: '#f2f9f4' },
        mealCardDanger: {backgroundColor: '#fdf2f2' },
        mealInfo: {flex: 1, paddingRight: 10 },
        dishName: {fontSize: 15, fontWeight: 'bold', color: '#2c3e50' },
        dangerAllergyText: {fontSize: 12, color: '#e74c3c', marginTop: 4, fontWeight: '600' },
        badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
        badgeSafe: {backgroundColor: '#a3e4d7' },
        badgeDanger: {backgroundColor: '#f5b7b1' },
        badgeText: {fontSize: 12, fontWeight: 'bold', color: '#2c3e50' },
        emptyBox: {paddingVertical: 30, alignItems: 'center' },
        emptyText: {color: '#95a5a6', fontSize: 14 },

        summaryCard: {borderLeftWidth: 5, borderLeftColor: '#e74c3c', backgroundColor: '#fff9f9' },
        summaryTitle: {fontSize: 16, fontWeight: 'bold', color: '#c0392b', marginBottom: 4 },
        summarySubTitle: {fontSize: 12, color: '#7f8c8d', marginBottom: 10 },
        summaryContainer: {backgroundColor: '#ffffff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#f5c6cb' },
        summaryRow: {flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
        summaryStudentName: {fontSize: 14, fontWeight: 'bold', color: '#2c3e50', marginRight: 6 },
        summaryItemList: {flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
        summaryItemText: {fontSize: 14, color: '#c0392b', fontWeight: '600' },
        summaryAllergyText: {fontSize: 13, color: '#e74c3c', fontWeight: 'normal' },
        safeSummaryBox: {backgroundColor: '#e8f8f5', padding: 10, borderRadius: 8, alignItems: 'center' },
        safeSummaryText: {color: '#27ae60', fontSize: 13, fontWeight: 'bold' },

        modalBackdrop: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 },
        settingsModalCard: {width: '100%', maxWidth: 340, backgroundColor: '#fff', padding: 20, borderRadius: 15 },
        settingsModalTitle: {fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#2c3e50' },
        settingsRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },

        calendarModalCard: {width: '100%', maxWidth: 340, backgroundColor: '#fff', padding: 20, borderRadius: 15, alignItems: 'center' },
        calendarTitle: {fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginBottom: 10 },

        timePickerContainer: {marginBottom: 20, alignItems: 'center' },
        timePickerLabel: {fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 15, textAlign: 'center' },
        timeDirectInputRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
        timeInputBlock: {alignItems: 'center' },
        timeInputLabel: {fontSize: 11, color: '#888', marginBottom: 4 },
        timeNumberInput: {
          borderWidth: 1,
        borderColor: '#007AFF',
        borderRadius: 8,
        width: 65,
        height: 48,
        textAlign: 'center',
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2c3e50',
        backgroundColor: '#f8fafc',
  },
        timeColonLarge: {fontSize: 24, fontWeight: 'bold', color: '#333', marginTop: 15 },
        selectedTimePreview: {marginTop: 12, fontSize: 13, color: '#007AFF', fontWeight: '600' },

        testNotifBtn: {marginTop: 15, backgroundColor: '#eef2f5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
        testNotifBtnText: {fontSize: 12, color: '#555', fontWeight: '600' },

        saveSettingsBtn: {backgroundColor: '#007AFF', paddingVertical: 12, borderRadius: 8, alignItems: 'center', flex: 1 },
        saveSettingsBtnText: {color: '#fff', fontWeight: 'bold', fontSize: 15 },
        closeSettingsBtn: {backgroundColor: '#e0e0e0', paddingVertical: 12, borderRadius: 8, alignItems: 'center', flex: 1 },
        closeSettingsBtnText: {color: '#444', fontWeight: 'bold', fontSize: 15 },

        modalContainer: {flex: 1, padding: 20, paddingTop: 50, backgroundColor: '#fff' },
        modalTitle: {fontSize: 20, fontWeight: 'bold', color: '#2c3e50', marginBottom: 20, textAlign: 'center' },
        label: {fontSize: 14, fontWeight: 'bold', color: '#34495e', marginTop: 15, marginBottom: 8 },
        input: {borderWidth: 1, borderColor: '#bdc3c7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
        searchRow: {flexDirection: 'row', alignItems: 'center' },
        searchBtn: {backgroundColor: '#3498db', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 8, marginLeft: 8 },
        searchBtnText: {color: '#fff', fontWeight: 'bold' },
        searchResultsBox: {maxHeight: 150, borderWidth: 1, borderColor: '#e1e4e8', borderRadius: 8, marginTop: 5 },
        searchItem: {padding: 10, borderBottomWidth: 1, borderBottomColor: '#f1f1f1' },
        searchItemSelected: {backgroundColor: '#e8f8f5' },
        schoolNameText: {fontSize: 14, fontWeight: 'bold' },
        schoolAddrText: {fontSize: 11, color: '#7f8c8d' },
        selectedSchoolBadge: {marginTop: 8, color: '#27ae60', fontWeight: 'bold' },
        allergyGrid: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 5 },
        allergyChip: {borderWidth: 1, borderColor: '#bdc3c7', borderRadius: 15, paddingHorizontal: 10, paddingVertical: 6, margin: 4 },
        allergyChipSelected: {backgroundColor: '#e74c3c', borderColor: '#e74c3c' },
        allergyChipText: {fontSize: 12, color: '#7f8c8d' },
        allergyChipTextSelected: {color: '#ffffff', fontWeight: 'bold' },
        modalBtnRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 30, marginBottom: 50 },
        modalBtn: {paddingVertical: 12, borderRadius: 8, alignItems: 'center', flex: 1 },
        cancelBtn: {backgroundColor: '#95a5a6' },
        saveBtn: {backgroundColor: '#27ae60' },
        modalBtnText: {color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
