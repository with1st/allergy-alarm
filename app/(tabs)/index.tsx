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
  View
} from 'react-native';

// 푸시 알림 동작 기본 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// 오늘 날짜 YYYY-MM-DD 포맷 가져오기
const getTodayString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 알레르기 번호 매핑 테이블 (나이스 API 기준 1~19번)
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
  // === 기본 앱 상태 관리 ===
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string>('');
  
  // 🌟 오늘 날짜로 기본 설정
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [meals, setMeals] = useState<MealItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [studentSummaries, setStudentSummaries] = useState<StudentRiskSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);

  // === 프로필 추가 모달 및 검색 상태 ===
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [searchSchoolQuery, setSearchSchoolQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [newStudentName, setNewStudentName] = useState<string>('');
  const [selectedAllergies, setSelectedAllergies] = useState<number[]>([]);

  // === 🔔 알림 설정 관련 상태 ===
  const [isSettingsModalVisible, setSettingsModalVisible] = useState(false);
  const [isNotificationEnabled, setIsNotificationEnabled] = useState(true);
  const [selectedTime, setSelectedTime] = useState({ hour: 8, minute: 0 }); // 기본 오전 8시

  // 초기 데이터 로드
  useEffect(() => {
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

  // === 데이터 로드 및 저장 로직 ===
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

  // === 알림 권한 및 스케줄링 ===
  const registerNotificationPermission = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('알림 권한이 거부되었습니다.');
    }
  };

  const loadNotificationSettings = async () => {
    try {
      const enabled = await AsyncStorage.getItem('notif_enabled');
      const time = await AsyncStorage.getItem('notif_time');
      if (enabled !== null) setIsNotificationEnabled(JSON.parse(enabled));
      if (time !== null) setSelectedTime(JSON.parse(time));
    } catch (e) {
      console.error('알림 설정 로드 실패:', e);
    }
  };

  const scheduleDailyNotification = async (hour: number, minute: number) => {
    await Notifications.cancelAllScheduledNotificationsAsync();

    if (!isNotificationEnabled) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🥗 오늘의 급식 알레르기 리포트",
        body: "오늘 자녀/학생의 급식 메뉴에 설정된 알레르기 유발 요소를 확인하세요!",
        sound: true,
      },
      trigger: {
        hour,
        minute,
        repeats: true,
      },
    });
  };

  const handleSaveSettings = async () => {
    await AsyncStorage.setItem('notif_enabled', JSON.stringify(isNotificationEnabled));
    await AsyncStorage.setItem('notif_time', JSON.stringify(selectedTime));
    
    if (isNotificationEnabled) {
      await scheduleDailyNotification(selectedTime.hour, selectedTime.minute);
      const period = selectedTime.hour < 12 ? '오전' : '오후';
      const displayHour = selectedTime.hour % 12 === 0 ? 12 : selectedTime.hour % 12;
      Alert.alert('설정 완료', `매일 ${period} ${displayHour}시 ${selectedTime.minute.toString().padStart(2, '0')}분에 알림이 울립니다.`);
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
      Alert.alert('설정 완료', '알림이 꺼졌습니다.');
    }
    setSettingsModalVisible(false);
  };

  // 시간 조정 함수 (+/-)
  const adjustHour = (delta: number) => {
    setSelectedTime((prev) => {
      let newHour = (prev.hour + delta) % 24;
      if (newHour < 0) newHour += 24;
      return { ...prev, hour: newHour };
    });
  };

  const adjustMinute = (delta: number) => {
    setSelectedTime((prev) => {
      let newMin = (prev.minute + delta) % 60;
      if (newMin < 0) newMin += 60;
      return { ...prev, minute: newMin };
    });
  };

  const currentProfile = profiles.find((p) => p.id === currentProfileId);

  // === 급식 데이터 조회 로직 ===
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

  // 날짜 변경 함수
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
          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateText}>📅 {selectedDate}</Text>
            <Text style={styles.dateSubText}>(터치하여 달력 선택)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dateNavBtn} onPress={() => changeDate(1)}>
            <Text style={styles.dateNavBtnText}>다음일 ▶</Text>
          </TouchableOpacity>
        </View>

        {showDatePicker && (
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

      {/* === 모달 1: 알림 시간 설정 팝업 (개선 버전) === */}
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
                <Text style={styles.timePickerLabel}>알림을 받을 시간 설정</Text>
                
                {/* 시/분 조정 컨트롤러 */}
                <View style={styles.timeControlsRow}>
                  {/* 시 조정 */}
                  <View style={styles.timeBlock}>
                    <Text style={styles.timeBlockLabel}>시 (Hour)</Text>
                    <View style={styles.counterRow}>
                      <TouchableOpacity style={styles.timeBtn} onPress={() => adjustHour(-1)}>
                        <Text style={styles.timeBtnText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.timeDisplay}>
                        {selectedTime.hour.toString().padStart(2, '0')}
                      </Text>
                      <TouchableOpacity style={styles.timeBtn} onPress={() => adjustHour(1)}>
                        <Text style={styles.timeBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={styles.timeColon}>:</Text>

                  {/* 분 조정 */}
                  <View style={styles.timeBlock}>
                    <Text style={styles.timeBlockLabel}>분 (Minute)</Text>
                    <View style={styles.counterRow}>
                      <TouchableOpacity style={styles.timeBtn} onPress={() => adjustMinute(-5)}>
                        <Text style={styles.timeBtnText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.timeDisplay}>
                        {selectedTime.minute.toString().padStart(2, '0')}
                      </Text>
                      <TouchableOpacity style={styles.timeBtn} onPress={() => adjustMinute(5)}>
                        <Text style={styles.timeBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <Text style={styles.selectedTimePreview}>
                  현재 설정: 매일 {selectedTime.hour < 12 ? '오전' : '오후'}{' '}
                  {selectedTime.hour % 12 === 0 ? 12 : selectedTime.hour % 12}시{' '}
                  {selectedTime.minute.toString().padStart(2, '0')}분
                </Text>
              </View>
            )}

            <View style={{ gap: 8, marginTop: 10 }}>
              <TouchableOpacity style={styles.saveSettingsBtn} onPress={handleSaveSettings}>
                <Text style={styles.saveSettingsBtnText}>저장하기</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeSettingsBtn} onPress={() => setSettingsModalVisible(false)}>
                <Text style={styles.closeSettingsBtnText}>닫기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* === 모달 2: 학생 프로필 추가 === */}
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

// === 스타일 시트 ===
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f8' },
  header: { paddingTop: 50, paddingBottom: 15, backgroundColor: '#ffffff', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e1e4e8' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50' },
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
  datePickerBtn: { alignItems: 'center' },
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

  // 알림 설정 모달 스타일
  modalBackdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 },
  settingsModalCard: { backgroundColor: '#fff', padding: 20, borderRadius: 15 },
  settingsModalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#2c3e50' },
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  
  timePickerContainer: { marginBottom: 20, alignItems: 'center' },
  timePickerLabel: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 15 },
  timeControlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15 },
  timeBlock: { alignItems: 'center' },
  timeBlockLabel: { fontSize: 12, color: '#888', marginBottom: 6 },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeBtn: { backgroundColor: '#007AFF', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  timeBtnText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  timeDisplay: { fontSize: 22, fontWeight: 'bold', color: '#2c3e50', minWidth: 32, textAlign: 'center' },
  timeColon: { fontSize: 24, fontWeight: 'bold', color: '#333', marginTop: 15 },
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