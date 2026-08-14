import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useState } from 'react';
import { Button, Modal, Switch, Text, TouchableOpacity, View } from 'react-native';

// 알림 동작 기본 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function HomeScreen() {
  const [isModalVisible, setModalVisible] = useState(false);
  const [isNotificationEnabled, setIsNotificationEnabled] = useState(true);
  const [selectedTime, setSelectedTime] = useState({ hour: 8, minute: 0 }); // 기본 08:00 AM

  // 1. 매일 지정된 시간에 알림 예약 함수
  const scheduleDailyNotification = async (hour: number, minute: number) => {
    // 기존에 예약된 알림 취소
    await Notifications.cancelAllScheduledNotificationsAsync();

    if (!isNotificationEnabled) return;

    // 매일 특정 시간에 울리도록 반복 예약
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🍱 오늘의 급식 알레르기 리포트",
        body: "오늘 급식 메뉴에 설정된 알레르기 유발 요소를 확인하세요!",
      },
      trigger: {
        hour,
        minute,
        repeats: true,
      },
    });
  };

  // 2. 알림 설정 저장
  const handleSaveSettings = async () => {
    await AsyncStorage.setItem('notif_enabled', JSON.stringify(isNotificationEnabled));
    await AsyncStorage.setItem('notif_time', JSON.stringify(selectedTime));
    
    if (isNotificationEnabled) {
      await scheduleDailyNotification(selectedTime.hour, selectedTime.minute);
      alert(`${selectedTime.hour}시 ${selectedTime.minute}분에 매일 알림이 설정되었습니다.`);
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
      alert('알림이 꺼졌습니다.');
    }
    setModalVisible(false);
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      {/* 상단 알림 설정 버튼 */}
      <TouchableOpacity onPress={() => setModalVisible(true)} style={{ backgroundColor: '#FFA500', padding: 10, borderRadius: 20 }}>
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>🔔 알림 설정</Text>
      </TouchableOpacity>

      {/* 알림 설정 팝업 모달 */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 15 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}>🔔 급식 알림 설정</Text>

            {/* ON / OFF 스위치 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 16 }}>알림 받기</Text>
              <Switch value={isNotificationEnabled} onValueChange={setIsNotificationEnabled} />
            </View>

            {/* 시간 선택 (간단한 예시) */}
            {isNotificationEnabled && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 16, marginBottom: 10 }}>알림 시간 지정</Text>
                {/* 실제 구현 시 @react-native-community/datetimepicker 모듈을 사용하면 시계 형태로 선택 가능합니다. */}
                <Text style={{ fontSize: 20, color: '#007AFF', textAlign: 'center' }}>
                  매일 오전 {selectedTime.hour.toString().padStart(2, '0')}:{selectedTime.minute.toString().padStart(2, '0')}
                </Text>
              </View>
            )}

            <Button title="저장하기" onPress={handleSaveSettings} />
            <View style={{ marginTop: 10 }}>
              <Button title="닫기" color="#888" onPress={() => setModalVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// 알레르기 번호 매핑 테이블 (나이스 API 기준 1~19번)
const ALLERGY_MAP: { [key: number]: string } = {
  1: '난류',
  2: '우유',
  3: '메밀',
  4: '땅콩',
  5: '대두',
  6: '밀',
  7: '고등어',
  8: '게',
  9: '새우',
  10: '돼지고기',
  11: '복숭아',
  12: '토마토',
  13: '아황산류',
  14: '호두',
  15: '닭고기',
  16: '쇠고기',
  17: '오징어',
  18: '조개류(굴,전복,홍합 포함)',
  19: '잣',
};

const ALLERGY_LIST = Object.entries(ALLERGY_MAP).map(([id, name]) => ({
  id: Number(id),
  name,
}));

interface Profile {
  id: string;
  name: string;
  schoolName: string;
  ATPT_OFCDC_SC_CODE: string; // 교육청 코드
  SD_SCHUL_CODE: string; // 학교 코드
  myAllergies: number[]; // 알레르기 번호 배열
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
  const [selectedDate, setSelectedDate] = useState<string>('2026-08-20');
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);

  const [meals, setMeals] = useState<MealItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // 전체 학생별 위험 메뉴 종합 요약 데이터
  const [studentSummaries, setStudentSummaries] = useState<StudentRiskSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);

  // 모달 및 학교 검색 상태
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [searchSchoolQuery, setSearchSchoolQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [newStudentName, setNewStudentName] = useState<string>('');
  const [selectedAllergies, setSelectedAllergies] = useState<number[]>([]);

  useEffect(() => {
    loadProfiles();
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

  // 푸시 알림 권한 요청
  const registerNotificationPermission = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      scheduleDailyMorningNotification();
    }
  };

  // 매일 아침 8시 자동 알림 스케줄러
  const scheduleDailyMorningNotification = async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🥗 오늘의 급식 알레르기 점검',
          body: '오늘 자녀/학생의 급식 메뉴에 알레르기 위험 성분이 있는지 미리 확인해보세요!',
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 8,
          minute: 0,
        },
      });
    } catch (e) {
      console.error('알림 스케줄러 설정 오류:', e);
    }
  };

  // 로컬 저장소 프로필 불러오기
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

  // 프로필 저장
  const saveProfiles = async (newProfiles: Profile[]) => {
    try {
      await AsyncStorage.setItem('@profiles', JSON.stringify(newProfiles));
      setProfiles(newProfiles);
    } catch (e) {
      console.error('프로필 저장 실패', e);
    }
  };

  const currentProfile = profiles.find((p) => p.id === currentProfileId);

  // 1. 단일 학생 급식 상세 정보 조회
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

          return {
            dishName: cleanName,
            allergies: itemAllergies,
            isDanger,
          };
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

  // 2. 전체 등록 학생 대상 위험 메뉴 요약 데이터 조회
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
        console.error(`${profile.name} 급식 요약 가져오기 실패`, e);
      }
    }

    setStudentSummaries(summaries);
    setSummaryLoading(false);
  };

  // 🔔 3. 통합 알림 테스트 함수
  const handleTestNotification = async () => {
    if (profiles.length === 0) {
      Alert.alert('알림', '등록된 학생 프로필이 없습니다.');
      return;
    }

    const targetYmd = selectedDate.replace(/-/g, '');
    const dangerStudentNames: string[] = [];

    for (const profile of profiles) {
      try {
        const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=5&ATPT_OFCDC_SC_CODE=${profile.ATPT_OFCDC_SC_CODE}&SD_SCHUL_CODE=${profile.SD_SCHUL_CODE}&MLSV_YMD=${targetYmd}`;
        const res = await fetch(url);
        const json = await res.json();

        if (json.mealServiceDietInfo?.[1]?.row) {
          const rowData = json.mealServiceDietInfo[1].row;
          let combinedDish = '';
          rowData.forEach((item: any) => {
            combinedDish += item.DDISH_NM + ' ';
          });

          const matches = combinedDish.match(/\(([\d.]+)\)/g);
          if (matches) {
            let hasDanger = false;
            matches.forEach((m) => {
              const nums = m.replace(/[()]/g, '').split('.').map(Number);
              nums.forEach((n) => {
                if (profile.myAllergies.includes(n)) {
                  hasDanger = true;
                }
              });
            });

            if (hasDanger && !dangerStudentNames.includes(profile.name)) {
              dangerStudentNames.push(profile.name);
            }
          }
        }
      } catch (e) {
        console.error('알림 테스트 조회 오류:', e);
      }
    }

    let alertTitle = '🥗 [급식 알레르기 점검]';
    let alertBody = '';

    if (dangerStudentNames.length > 0) {
      alertTitle = `⚠️ [알레르기 경고] ${dangerStudentNames.join(', ')}`;
      alertBody = `오늘 급식에 알레르기 성분이 포함된 메뉴가 있습니다! 앱에서 확인 후 주의해주세요.`;
    } else {
      alertTitle = `✅ [안전] 전체 학생 급식 이상 없음`;
      alertBody = `선택하신 날짜의 급식은 등록된 학생 모두 알레르기 위험 요소 없이 안전합니다! 😊`;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: alertTitle,
        body: alertBody,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 3,
      },
    });

    Alert.alert(
      '알림 예약 완료',
      '3초 후 전체 학생 기준 통합 테스트 푸시 알림이 발송됩니다.\n(스마트폰 홈 화면으로 나가서 확인해보세요!)'
    );
  };

  // 날짜 변경 함수
  const changeDate = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  // 🔍 학교 검색 API
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
        Alert.alert(
          '검색 결과 없음',
          `'${query}'에 해당하는 학교가 없습니다.\n\n예: '호명' 또는 '호명초'로 검색해 보세요.`
        );
      }
    } catch (e) {
      Alert.alert('오류', '학교 검색 중 오류가 발생했습니다.');
    }
  };

  // 알레르기 토글
  const toggleAllergy = (id: number) => {
    if (selectedAllergies.includes(id)) {
      setSelectedAllergies(selectedAllergies.filter((a) => a !== id));
    } else {
      setSelectedAllergies([...selectedAllergies, id]);
    }
  };

  // 새 프로필 저장
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
                setSelectedDate(date.toISOString().split('T')[0]);
              }
            }}
          />
        )}
      </View>

      {/* 3. 선택 학생의 급식 점검 리포트 */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.sectionTitle}>📋 {currentProfile?.name || '학생'}의 급식 점검 리포트</Text>
          <TouchableOpacity style={styles.testBtn} onPress={handleTestNotification}>
            <Text style={styles.testBtnText}>🔔 알림 테스트</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#2ecc71" style={{ marginVertical: 30 }} />
        ) : meals.length > 0 ? (
          meals.map((item, index) => (
            <View
              key={index}
              style={[styles.mealCard, item.isDanger ? styles.mealCardDanger : styles.mealCardSafe]}>
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

      {/* 🚨 4. 위험 메뉴 종합 정리 안내 (맨 하단 위치) */}
      <View style={[styles.card, styles.summaryCard]}>
        <Text style={styles.summaryTitle}>🚨 위험 메뉴 종합 정리 안내</Text>
        <Text style={styles.summarySubTitle}>
          선택일({selectedDate}) 기준, 위험 성분이 감지된 전체 학생 목록입니다.
        </Text>

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
            <Text style={styles.safeSummaryText}>
              ✅ 등록된 모든 학생의 급식에 알레르기 위험 요소가 없습니다.
            </Text>
          </View>
        )}
      </View>

      {/* 모달: 프로필 추가 */}
      <Modal visible={isModalOpen} animationType="slide" transparent={false}>
        <ScrollView style={styles.modalContainer}>
          <Text style={styles.modalTitle}>학생 / 자녀 프로필 추가</Text>

          {/* 1. 학생 이름 */}
          <Text style={styles.label}>1. 학생/자녀 이름</Text>
          <TextInput
            style={styles.input}
            placeholder="예: 김이봄"
            value={newStudentName}
            onChangeText={setNewStudentName}
          />

          {/* 2. 학교 검색 */}
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

          {/* 검색 결과 */}
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

          {/* 3. 보유 알레르기 선택 */}
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

          {/* 버튼 영역 */}
          <View style={styles.modalBtnRow}>
            <TouchableOpacity
              style={[styles.modalBtn, styles.cancelBtn]}
              onPress={() => setIsModalOpen(false)}>
              <Text style={styles.modalBtnText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, styles.saveBtn]}
              onPress={handleSaveProfile}>
              <Text style={styles.modalBtnText}>저장하기</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e4e8',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  card: {
    backgroundColor: '#ffffff',
    marginHorizontal: 15,
    marginTop: 15,
    padding: 15,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  addBtn: {
    backgroundColor: '#27ae60',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  profileList: {
    flexDirection: 'row',
  },
  profileChip: {
    backgroundColor: '#eef2f5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  profileChipSelected: {
    backgroundColor: '#27ae60',
  },
  profileChipText: {
    color: '#7f8c8d',
    fontSize: 13,
  },
  profileChipTextSelected: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateNavBtn: {
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  dateNavBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
  datePickerBtn: {
    alignItems: 'center',
  },
  dateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  dateSubText: {
    fontSize: 11,
    color: '#7f8c8d',
  },

  /* 리포트 카드 스타일 */
  testBtn: {
    backgroundColor: '#f39c12',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  testBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  mealCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  mealCardSafe: {
    backgroundColor: '#f2f9f4',
  },
  mealCardDanger: {
    backgroundColor: '#fdf2f2',
  },
  mealInfo: {
    flex: 1,
    paddingRight: 10,
  },
  dishName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  dangerAllergyText: {
    fontSize: 12,
    color: '#e74c3c',
    marginTop: 4,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeSafe: {
    backgroundColor: '#a3e4d7',
  },
  badgeDanger: {
    backgroundColor: '#f5b7b1',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  emptyBox: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: '#95a5a6',
    fontSize: 14,
  },

  /* 종합 요약 카드 스타일 */
  summaryCard: {
    borderLeftWidth: 5,
    borderLeftColor: '#e74c3c',
    backgroundColor: '#fff9f9',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#c0392b',
    marginBottom: 4,
  },
  summarySubTitle: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 10,
  },
  summaryContainer: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f5c6cb',
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  summaryStudentName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginRight: 6,
  },
  summaryItemList: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summaryItemText: {
    fontSize: 14,
    color: '#c0392b',
    fontWeight: '600',
  },
  summaryAllergyText: {
    fontSize: 13,
    color: '#e74c3c',
    fontWeight: 'normal',
  },
  safeSummaryBox: {
    backgroundColor: '#e8f8f5',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  safeSummaryText: {
    color: '#27ae60',
    fontSize: 13,
    fontWeight: 'bold',
  },

  /* 모달 스타일 */
  modalContainer: {
    flex: 1,
    padding: 20,
    paddingTop: 50,
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#34495e',
    marginTop: 15,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#bdc3c7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchBtn: {
    backgroundColor: '#3498db',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  searchBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  searchResultsBox: {
    maxHeight: 150,
    borderWidth: 1,
    borderColor: '#e1e4e8',
    borderRadius: 8,
    marginTop: 5,
  },
  searchItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f1f1',
  },
  searchItemSelected: {
    backgroundColor: '#e8f8f5',
  },
  schoolNameText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  schoolAddrText: {
    fontSize: 11,
    color: '#7f8c8d',
  },
  selectedSchoolBadge: {
    marginTop: 8,
    color: '#27ae60',
    fontWeight: 'bold',
  },
  allergyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
  },
  allergyChip: {
    borderWidth: 1,
    borderColor: '#bdc3c7',
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
    margin: 4,
  },
  allergyChipSelected: {
    backgroundColor: '#e74c3c',
    borderColor: '#e74c3c',
  },
  allergyChipText: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  allergyChipTextSelected: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
    marginBottom: 50,
  },
  modalBtn: {
    flex: 0.48,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: '#95a5a6',
  },
  saveBtn: {
    backgroundColor: '#27ae60',
  },
  modalBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});