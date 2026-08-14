import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useState } from 'react';
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

// 🚀 앱 버전 (개선 사항 반영 v1.0.2)
const CURRENT_APP_VERSION = '1.0.2';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const getTodayString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ALLERGY_MAP: { [key: number]: string } = {
  1: '난류', 2: '우유', 3: '메밀', 4: '땅콩', 5: '대두',
  6: '밀', 7: '고등어', 8: '게', 9: '새우', 10: '돼지고기',
  11: '복숭아', 12: '토마토', 13: '아황산류', 14: '호두', 15: '닭고기',
  16: '쇠고기', 17: '오징어', 18: '조개류(굴,전복,홍합 포함)', 19: '잣',
};

const ALLERGY_LIST = Object.entries(ALLERGY_MAP).map(([id, name]) => ({
  id: Number(id),
  name,
}));

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

interface StudentRiskSummary {
  studentName: string;
  dangerItems: { dishName: string; allergies: string[] }[];
}

export default function HomeScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string>('');
  
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [meals, setMeals] = useState<MealItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [studentSummaries, setStudentSummaries] = useState<StudentRiskSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [searchSchoolQuery, setSearchSchoolQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [newStudentName, setNewStudentName] = useState<string>('');
  const [selectedAllergies, setSelectedAllergies] = useState<number[]>([]);

  // 🔔 알림 및 시간 설정 상태 (문자열 직접 입력 방식)
  const [isSettingsModalVisible, setSettingsModalVisible] = useState(false);
  const [isNotificationEnabled, setIsNotificationEnabled] = useState(true);
  const [inputHour, setInputHour] = useState<string>('08');
  const [inputMinute, setInputMinute] = useState<string>('00');

  useEffect(() => {
    checkAppVersionAndUpdate();
    loadProfiles();
    loadNotificationSettings();
    registerNotificationPermission();
  }, []);

  useEffect(() => {
    if (currentProfileId) {
      fetchMealData();
    }
    if (profiles.length > 0) {
      fetchAllStudentsSummary();
    }
  }, [currentProfileId, selectedDate, profiles]);

  const checkAppVersionAndUpdate = async () => {
    try {
      const savedVersion = await AsyncStorage.getItem('app_installed_version');
      if (savedVersion !== CURRENT_APP_VERSION) {
        await AsyncStorage.setItem('app_installed_version', CURRENT_APP_VERSION);
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          if (savedVersion !== null) {
            Alert.alert('🎉 새 버전을 불러옵니다', '최신 기능 및 안정성 업데이트가 적용되었습니다.', [
              { text: '확인', onPress: () => window.location.reload() },
            ]);
          }
        }
      }
    } catch (e) {
      console.error('버전 확인 오류:', e);
    }
  };

  const loadProfiles = async () => {
    try {
      const data = await AsyncStorage.getItem('@profiles');
      if (data) {
        const parsedProfiles: Profile[] = JSON.parse(data);
        setProfiles(parsedProfiles);
        if (parsedProfiles.length > 0) {
          setCurrentProfileId(parsedProfiles[0].id);
        }
      }
    } catch (e) {
      console.error('프로필 로드 실패', e);
    }
  };

  const saveProfiles = async (newProfiles: Profile[]) => {
    try {
      await AsyncStorage.setItem('@profiles', JSON.stringify(newProfiles));
      setProfiles(newProfiles);
    } catch (e) {
      console.error('프로필 저장 실패', e);
    }
  };

  const registerNotificationPermission = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('알림 권한 거부됨');
    }
  };

  const loadNotificationSettings = async () => {
    try {
      const enabled = await AsyncStorage.getItem('notif_enabled');
      const time = await AsyncStorage.getItem('notif_time');
      if (enabled !== null) setIsNotificationEnabled(JSON.parse(enabled));
      if (time !== null) {
        const parsedTime = JSON.parse(time);
        setInputHour(String(parsedTime.hour).padStart(2, '0'));
        setInputMinute(String(parsedTime.minute).padStart(2, '0'));
      }
    } catch (e) {
      console.error('알림 설정 로드 실패:', e);
    }
  };

  const scheduleDailyNotification = async (hour: number, minute: number) => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!isNotificationEnabled) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🥗 오늘의 급식 알레르기 리포트',
        body: '오늘 자녀/학생의 급식 메뉴에 설정된 알레르기 유발 요소를 확인하세요!',
        sound: true,
      },
      trigger: {
        hour,
        minute,
        repeats: true,
      },
    });
  };

  // 💡 알림 설정 저장 (저장 즉시 모달 닫힘 처리)
  const handleSaveSettings = async () => {
    let hourNum = parseInt(inputHour, 10) || 0;
    let minNum = parseInt(inputMinute, 10) || 0;

    if (hourNum < 0) hourNum = 0;
    if (hourNum > 23) hourNum = 23;
    if (minNum < 0) minNum = 0;
    if (minNum > 59) minNum = 59;

    const timeObj = { hour: hourNum, minute: minNum };

    await AsyncStorage.setItem('notif_enabled', JSON.stringify(isNotificationEnabled));
    await AsyncStorage.setItem('notif_time', JSON.stringify(timeObj));

    if (isNotificationEnabled) {
      await scheduleDailyNotification(hourNum, minNum);
      const period = hourNum < 12 ? '오전' : '오후';
      const displayHour = hourNum % 12 === 0 ? 12 : hourNum % 12;
      Alert.alert(
        '설정 완료',
        `매일 ${period} ${displayHour}시 ${minNum.toString().padStart(2, '0')}분에 알림이 울립니다.`
      );
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
      Alert.alert('설정 완료', '알림이 꺼졌습니다.');
    }

    // ✨ 저장 완료 후 창 바로 닫기
    setSettingsModalVisible(false);
  };

  const currentProfile = profiles.find((p) => p.id === currentProfileId);

  const fetchMealData = async () => {
    if (!currentProfile) return;
    setLoading(true);

    const targetYmd = selectedDate.replace(/-/g, '');
    const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=5&ATPT_OFCDC_SC_CODE=${currentProfile.ATPT_OFCDC_SC_CODE}&SD_SCHUL_CODE=${currentProfile.SD_SCHUL_CODE}&MLSV_YMD=${targetYmd}`;

    try {
      const response = await fetch(url);
      const json = await response.json();

      if (json.mealServiceDietInfo?.[1]?.row) {
        const rowData = json.mealServiceDietInfo[1].row;
        let combinedDish = '';
        rowData.forEach((item: any) => {
          combinedDish += item.DDISH_NM + '<br/>';
        });

        const rawDishes = combinedDish
          .split('<br/>')
          .map((d) => d.trim())
          .filter((d) => d.length > 0);

        const parsedMeals: MealItem[] = rawDishes.map((dishStr) => {
          const match = dishStr.match(/\(([\d.]+)\)/g);
          let itemAllergies: string[] = [];
          let isDanger = false;

          if (match) {
            match.forEach((m) => {
              const nums = m.replace(/[()]/g, '').split('.').map(Number);
              nums.forEach((num) => {
                if (ALLERGY_MAP[num]) {
                  if (currentProfile.myAllergies.includes(num)) {
                    isDanger = true;
                    if (!itemAllergies.includes(ALLERGY_MAP[num])) {
                      itemAllergies.push(ALLERGY_MAP[num]);
                    }
                  }
                }
              });
            });
          }
          const cleanName = dishStr.replace(/\([\d.]+\)/g, '').trim();
          return { dishName: cleanName, allergies: itemAllergies, isDanger };
        });

        setMeals(parsedMeals);
      } else {
        setMeals([]);
      }
    } catch (e) {
      console.error('급식 불러오기 오류:', e);
      setMeals([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllStudentsSummary = async () => {
    setSummaryLoading(true);
    const targetYmd = selectedDate.replace(/-/g, '');
    const summaries: StudentRiskSummary[] = [];

    for (const profile of profiles) {
      try {
        const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=5&ATPT_OFCDC_SC_CODE=${profile.ATPT_OFCDC_SC_CODE}&SD_SCHUL_CODE=${profile.SD_SCHUL_CODE}&MLSV_YMD=${targetYmd}`;
        const res = await fetch(url);
        const json = await res.json();

        if (json.mealServiceDietInfo?.[1]?.row) {
          const rowData = json.mealServiceDietInfo[1].row;
          let combinedDish = '';
          rowData.forEach((item: any) => {
            combinedDish += item.DDISH_NM + '<br/>';
          });

          const rawDishes = combinedDish
            .split('<br/>')
            .map((d) => d.trim())
            .filter((d) => d.length > 0);

          const studentDangerItems: { dishName: string; allergies: string[] }[] = [];

          rawDishes.forEach((dishStr) => {
            const match = dishStr.match(/\(([\d.]+)\)/g);
            let itemAllergies: string[] = [];

            if (match) {
              match.forEach((m) => {
                const nums = m.replace(/[()]/g, '').split('.').map(Number);
                nums.forEach((num) => {
                  if (profile.myAllergies.includes(num) && ALLERGY_MAP[num]) {
                    if (!itemAllergies.includes(ALLERGY_MAP[num])) {
                      itemAllergies.push(ALLERGY_MAP[num]);
                    }
                  }
                });
              });
            }

            if (itemAllergies.length > 0) {
              const cleanName = dishStr.replace(/\([\d.]+\)/g, '').trim();
              studentDangerItems.push({
                dishName: cleanName,
                allergies: itemAllergies,
              });
            }
          });

          if (studentDangerItems.length > 0) {
            summaries.push({
              studentName: profile.name,
              dangerItems: studentDangerItems,
            });
          }
        }
      } catch (e) {
        console.error(`${profile.name} 급식 요약 실패`, e);
      }
    }
    setStudentSummaries(summaries);
    setSummaryLoading(false);
  };

  const changeDate = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    setSelectedDate(`${year}-${month}-${day}`);
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

      {/* 2. 날짜 선택 영역 (웹/모바일 보완) */}
      <View style={styles.card}>
        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.dateNavBtn} onPress={() => changeDate(-1)}>
            <Text style={styles.dateNavBtnText}>◀ 이전일</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateText}>📅 {selectedDate}</Text>
            <Text style={styles.dateSubText}>(터치하여 달력 선택)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dateNavBtn} onPress={() => changeDate(1)}>
            <Text style={styles.dateNavBtnText}>다음일 ▶</Text>
          </TouchableOpacity>
        </View>

        {/* ✨ 웹 환경 호환 가능한 달력 선택 처리 */}
        {showDatePicker && (
          Platform.OS === 'web' ? (
            <View style={{ alignItems: 'center', marginTop: 10 }}>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedDate(e.target.value);
                  }
                  setShowDatePicker(false);
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: '16px',
                  borderRadius: '8px',
                  border: '1px solid #bdc3c7',
                  outline: 'none',
                }}
              />
            </View>
          ) : (
            <DateTimePicker
              value={new Date(selectedDate)}
              mode="date"
              display={Platform.OS === 'ios' ? 'calendar' : 'default'}
              onChange={(event, date) => {
                setShowDatePicker(false);
                if (date) {
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  setSelectedDate(`${year}-${month}-${day}`);
                }
              }}
            />
          )
        )}
      </View>

      {/* 3. 선택 학생의 급식 점검 리포트 */}
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

      {/* 4. 위험 메뉴 종합 정리 안내 */}
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

      {/* 모달 1: 알림 설정 (직접 시간/분 입력 및 즉시 닫기) */}
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
                <Text style={styles.timePickerLabel}>알림을 받을 시간 입력 (24시간 형식 / 1분 단위)</Text>
                
                <View style={styles.timeDirectInputRow}>
                  <View style={styles.timeInputBlock}>
                    <Text style={styles.timeInputLabel}>시 (0~23)</Text>
                    <TextInput
                      style={styles.timeNumberInput}
                      keyboardType="number-pad"
                      maxLength={2}
                      value={inputHour}
                      onChangeText={(text) => setInputHour(text.replace(/[^0-9]/g, ''))}
                      placeholder="08"
                    />
                  </View>

                  <Text style={styles.timeColonLarge}>:</Text>

                  <View style={styles.timeInputBlock}>
                    <Text style={styles.timeInputLabel}>분 (0~59)</Text>
                    <TextInput
                      style={styles.timeNumberInput}
                      keyboardType="number-pad"
                      maxLength={2}
                      value={inputMinute}
                      onChangeText={(text) => setInputMinute(text.replace(/[^0-9]/g, ''))}
                      placeholder="00"
                    />
                  </View>
                </View>

                <Text style={styles.selectedTimePreview}>
                  설정 예정: {parseInt(inputHour || '0', 10) < 12 ? '오전' : '오후'}{' '}
                  {parseInt(inputHour || '0', 10) % 12 === 0 ? 12 : parseInt(inputHour || '0', 10) % 12}시{' '}
                  {String(parseInt(inputMinute || '0', 10)).padStart(2, '0')}분
                </Text>
              </View>
            )}

            <View style={{ gap: 8, marginTop: 10 }}>
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

      {/* 모달 2: 학생 프로필 추가 */}
      <Modal visible={isModalOpen} animationType="slide" transparent={false}>
        <ScrollView style={styles.modalContainer}>
          <Text style={styles.modalTitle}>학생 / 자녀 프로필 추가</Text>
          <Text style={styles.label}>1. 학생/자녀 이름</Text>
          <TextInput style={styles.input} placeholder="예: 김이봄" value={newStudentName} onChangeText={setNewStudentName} />

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
                  style={[styles.searchItem, selectedSchool?.SD_SCHUL_CODE === item.SD_SCHUL_CODE && styles.searchItemSelected]}
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
            <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setIsModalOpen(false)}>
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
  datePickerBtn: { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4 },
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

  modalBackdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 },
  settingsModalCard: { backgroundColor: '#fff', padding: 20, borderRadius: 15 },
  settingsModalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#2c3e50' },
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  
  timePickerContainer: { marginBottom: 20, alignItems: 'center' },
  timePickerLabel: { fontSize: 13, fontWeight: 'bold', color: '#555', marginBottom: 15, textAlign: 'center' },
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
  selectedTimePreview: { marginTop: 15, fontSize: 14, color: '#007AFF', fontWeight: '600' },

  saveSettingsBtn: { backgroundColor: '#007AFF', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  saveSettingsBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  closeSettingsBtn: { backgroundColor: '#e0e0e0', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
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
  modalBtn: { flex: 0.48, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#95a5a6' },
  saveBtn: { backgroundColor: '#27ae60' },
  modalBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});