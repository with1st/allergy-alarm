import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const CURRENT_APP_VERSION = '1.0.4';
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

interface Profile {
  id: string;
  name: string;
  schoolName: string;
  ATPT_OFCDC_SC_CODE: string;
  SD_SCHUL_CODE: string;
  myAllergies: number[];
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

export default function Index() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const webDateInputRef = useRef<HTMLInputElement>(null);

  const [meals, setMeals] = useState<MealItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [studentSummaries, setStudentSummaries] = useState<StudentSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);

  // 프로필 생성 모달 관련
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [searchSchoolQuery, setSearchSchoolQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [selectedAllergies, setSelectedAllergies] = useState<number[]>([]);

  // 알림 설정 모달 관련
  const [isSettingsModalVisible, setSettingsModalVisible] = useState(false);
  const [isNotificationEnabled, setIsNotificationEnabled] = useState(false);
  const [inputHour, setInputHour] = useState('07');
  const [inputMinute, setInputMinute] = useState('40');

  useEffect(() => {
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

      if (Platform.OS === 'web') {
        await subscribeToPush();

        // 백엔드 서버로 설정된 알림 시간 전송
        await fetch('https://allergy-alarm.onrender.com/set-time', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: isNotificationEnabled,
            time: timeStr,
          }),
        });
      }

      Alert.alert('알림 설정', `매일 ${timeStr}에 급식 알림이 설정되었습니다.`);
      setSettingsModalVisible(false);
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
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if ('Notification' in window) {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          // 서버 발송 전 구독 정보 최신화
          await subscribeToPush();
          try {
            const res = await fetch('https://allergy-alarm.onrender.com/send-notification', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: '🧪 테스트 푸시 알림',
                body: '3초 후 전송된 급식 알레르기 서버 푸시 테스트입니다!',
                delay: 3000,
              }),
            });

            if (res.ok) {
              Alert.alert('요청 완료', '3초 후 실제 푸시 알림이 발송됩니다.');
            } else {
              setTimeout(() => {
                new Notification('🧪 테스트 알림 (로컬)', {
                  body: '급식 알레르기 체커 테스트 알림입니다.',
                });
              }, 3000);
              Alert.alert('안내', '백엔드 서버 미응답으로 로컬 알림이 3초 뒤 동작합니다.');
            }
          } catch (e) {
            setTimeout(() => {
              new Notification('🧪 테스트 알림 (로컬)', {
                body: '급식 알레르기 체커 테스트 알림입니다.',
              });
            }, 3000);
            Alert.alert('안내', '로컬 테스트 알림이 3초 뒤에 표시됩니다.');
          }
        } else {
          Alert.alert('권한 필요', '브라우저 알림 권한을 허용해 주세요.');
        }
      } else {
        Alert.alert('알림 미지원', '이 브라우저는 웹 알림을 지원하지 않습니다.');
      }
    } else {
      Alert.alert('테스트 알림', '3초 후 테스트 알림이 발송됩니다.');
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
        const rawMeal = json.mealServiceDietInfo[1].row[0].DDISH_NM;
        const parsed = parseMealInfo(rawMeal, currentProfile.myAllergies);
        setMeals(parsed);
      } else {
        setMeals([]);
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
          webDateInputRef.current.click();
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
    const newProfile: Profile = {
      id: Date.now().toString(),
      name: newStudentName.trim(),
      schoolName: selectedSchool.SCHUL_NM,
      ATPT_OFCDC_SC_CODE: selectedSchool.ATPT_OFCDC_SC_CODE,
      SD_SCHUL_CODE: selectedSchool.SD_SCHUL_CODE,
      myAllergies: selectedAllergies,
    };
    const updated = [...profiles, newProfile];
    saveProfiles(updated);
    setCurrentProfileId(newProfile.id);

    setIsModalOpen(false);
    setNewStudentName('');
    setSelectedSchool(null);
    setSearchSchoolQuery('');
    setSearchResults([]);
    setSelectedAllergies([]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 50 }}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🥗 급식 알레르기 체커</Text>
        <Text style={styles.versionText}>v{CURRENT_APP_VERSION}</Text>
      </View>

      {/* 1. 프로필 선택 영역 */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.sectionTitle}>👤 학생/자녀 프로필 선택</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setIsModalOpen(true)}>
            <Text style={styles.addBtnText}>+ 프로필 추가</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.profileList}>
          {profiles.map((p) => {
            const isSelected = p.id === currentProfileId;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.profileChip, isSelected && styles.profileChipSelected]}
                onPress={() => setCurrentProfileId(p.id)}>
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
          meals.map((item, index) => (
            <View key={index} style={[styles.mealCard, item.isDanger ? styles.mealCardDanger : styles.mealCardSafe]}>
              <View style={styles.mealInfo}>
                <Text style={styles.dishName}>*{item.dishName}</Text>
                {item.isDanger && (
                  <Text style={styles.dangerAllergyText}>
                    ⚠️ 알레르기 유발 요소: {item.allergies.join(', ')}
                  </Text>
                )}
              </View>
              <View style={[styles.badge, item.isDanger ? styles.badgeDanger : styles.badgeSafe]}>
                <Text style={styles.badgeText}>{item.isDanger ? '위험' : '안전'}</Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>해당 날짜에는 등록된 급식 정보가 없습니다.</Text>
          </View>
        )}
      </View>

      {/* 4. 위험 메뉴 종합 안내 */}
      <View style={[styles.card, styles.summaryCard]}>
        <Text style={styles.summaryTitle}>🚨 위험 메뉴 종합 정리 안내</Text>
        <Text style={styles.summarySubTitle}>선택일({selectedDate}) 기준, 위험 성분이 감지된 전체 학생 목록입니다.</Text>

        {summaryLoading ? (
          <ActivityIndicator size="small" color="#e74c3c" style={{ marginVertical: 10 }} />
        ) : studentSummaries.length > 0 ? (
          <View style={styles.summaryContainer}>
            {studentSummaries.map((summary, idx) => (
              <View key={idx} style={styles.summaryRow}>
                <Text style={styles.summaryStudentName}>• {summary.studentName} :</Text>
                <View style={styles.summaryItemList}>
                  {summary.dangerItems.map((item, itemIdx) => (
                    <Text key={itemIdx} style={styles.summaryItemText}>
                      {item.dishName}
                      <Text style={styles.summaryAllergyText}>({item.allergies.join(', ')})</Text>
                      {itemIdx < summary.dangerItems.length - 1 ? ', ' : ''}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.safeSummaryBox}>
            <Text style={styles.safeSummaryText}>✅ 등록된 모든 학생의 급식에 알레르기 위험 요소가 없습니다.</Text>
          </View>
        )}
      </View>

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
            placeholder="예: 김이봄"
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
                  onPress={() => setSelectedSchool(item)}>
                  <Text style={styles.schoolNameText}>{item.SCHUL_NM}</Text>
                  <Text style={styles.schoolAddrText}>{item.ORG_RDNMA || item.LCTN_SC_NM}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {selectedSchool && (
            <Text style={styles.selectedSchoolBadge}>선택된 학교: {selectedSchool.SCHUL_NM}</Text>
          )}

          <Text style={styles.label}>3. 보유 알레르기 선택 (다중 선택 가능)</Text>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f8' },
  header: { paddingTop: 50, paddingBottom: 12, backgroundColor: '#ffffff', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e1e4e8' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50' },
  versionText: { fontSize: 11, color: '#95a5a6', marginTop: 2 },
  card: { backgroundColor: '#ffffff', marginHorizontal: 15, marginTop: 15, padding: 15, borderRadius: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50' },

  addBtn: { backgroundColor: '#27ae60', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  profileList: { flexDirection: 'row' },
  profileChip: { backgroundColor: '#eef2f5', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  profileChipSelected: { backgroundColor: '#27ae60' },
  profileChipText: { color: '#7f8c8d', fontSize: 13 },
  profileChipTextSelected: { color: '#ffffff', fontWeight: 'bold' },

  dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateNavBtn: { backgroundColor: '#e0e0e0', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  dateNavBtnText: { fontSize: 13, fontWeight: 'bold', color: '#333' },
  datePickerBtn: { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, position: 'relative' },
  dateText: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
  dateSubText: { fontSize: 11, color: '#7f8c8d' },

  settingsBtn: { backgroundColor: '#FFA500', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  settingsBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },

  mealCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 8 },
  mealCardSafe: { backgroundColor: '#f2f9f4' },
  mealCardDanger: { backgroundColor: '#fdf2f2' },
  mealInfo: { flex: 1, paddingRight: 10 },
  dishName: { fontSize: 15, fontWeight: 'bold', color: '#2c3e50' },
  dangerAllergyText: { fontSize: 12, color: '#e74c3c', marginTop: 4, fontWeight: '600' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeSafe: { backgroundColor: '#a3e4d7' },
  badgeDanger: { backgroundColor: '#f5b7b1' },
  badgeText: { fontSize: 12, fontWeight: 'bold', color: '#2c3e50' },
  emptyBox: { paddingVertical: 30, alignItems: 'center' },
  emptyText: { color: '#95a5a6', fontSize: 14 },

  summaryCard: { borderLeftWidth: 5, borderLeftColor: '#e74c3c', backgroundColor: '#fff9f9' },
  summaryTitle: { fontSize: 16, fontWeight: 'bold', color: '#c0392b', marginBottom: 4 },
  summarySubTitle: { fontSize: 12, color: '#7f8c8d', marginBottom: 10 },
  summaryContainer: { backgroundColor: '#ffffff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#f5c6cb' },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  summaryStudentName: { fontSize: 14, fontWeight: 'bold', color: '#2c3e50', marginRight: 6 },
  summaryItemList: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  summaryItemText: { fontSize: 14, color: '#c0392b', fontWeight: '600' },
  summaryAllergyText: { fontSize: 13, color: '#e74c3c', fontWeight: 'normal' },
  safeSummaryBox: { backgroundColor: '#e8f8f5', padding: 10, borderRadius: 8, alignItems: 'center' },
  safeSummaryText: { color: '#27ae60', fontSize: 13, fontWeight: 'bold' },

  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 },
  settingsModalCard: { width: '100%', maxWidth: 340, backgroundColor: '#fff', padding: 20, borderRadius: 15 },
  settingsModalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#2c3e50' },
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },

  calendarModalCard: { width: '100%', maxWidth: 340, backgroundColor: '#fff', padding: 20, borderRadius: 15, alignItems: 'center' },
  calendarTitle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginBottom: 10 },

  timePickerContainer: { marginBottom: 20, alignItems: 'center' },
  timePickerLabel: { fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 15, textAlign: 'center' },
  timeDirectInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  timeInputBlock: { alignItems: 'center' },
  timeInputLabel: { fontSize: 11, color: '#888', marginBottom: 4 },
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
  timeColonLarge: { fontSize: 24, fontWeight: 'bold', color: '#333', marginTop: 15 },
  selectedTimePreview: { marginTop: 12, fontSize: 13, color: '#007AFF', fontWeight: '600' },

  testNotifBtn: { marginTop: 15, backgroundColor: '#eef2f5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  testNotifBtnText: { fontSize: 12, color: '#555', fontWeight: '600' },

  saveSettingsBtn: { backgroundColor: '#007AFF', paddingVertical: 12, borderRadius: 8, alignItems: 'center', flex: 1 },
  saveSettingsBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  closeSettingsBtn: { backgroundColor: '#e0e0e0', paddingVertical: 12, borderRadius: 8, alignItems: 'center', flex: 1 },
  closeSettingsBtnText: { color: '#444', fontWeight: 'bold', fontSize: 15 },

  modalContainer: { flex: 1, padding: 20, paddingTop: 50, backgroundColor: '#fff' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50', marginBottom: 20, textAlign: 'center' },
  label: { fontSize: 14, fontWeight: 'bold', color: '#34495e', marginTop: 15, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#bdc3c7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchBtn: { backgroundColor: '#3498db', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 8, marginLeft: 8 },
  searchBtnText: { color: '#fff', fontWeight: 'bold' },
  searchResultsBox: { maxHeight: 150, borderWidth: 1, borderColor: '#e1e4e8', borderRadius: 8, marginTop: 5 },
  searchItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#f1f1f1' },
  searchItemSelected: { backgroundColor: '#e8f8f5' },
  schoolNameText: { fontSize: 14, fontWeight: 'bold' },
  schoolAddrText: { fontSize: 11, color: '#7f8c8d' },
  selectedSchoolBadge: { marginTop: 8, color: '#27ae60', fontWeight: 'bold' },
  allergyGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 5 },
  allergyChip: { borderWidth: 1, borderColor: '#bdc3c7', borderRadius: 15, paddingHorizontal: 10, paddingVertical: 6, margin: 4 },
  allergyChipSelected: { backgroundColor: '#e74c3c', borderColor: '#e74c3c' },
  allergyChipText: { fontSize: 12, color: '#7f8c8d' },
  allergyChipTextSelected: { color: '#ffffff', fontWeight: 'bold' },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30, marginBottom: 50 },
  modalBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', flex: 1 },
  cancelBtn: { backgroundColor: '#95a5a6' },
  saveBtn: { backgroundColor: '#27ae60' },
  modalBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});