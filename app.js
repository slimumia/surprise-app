// ==========================================
// 1. 基本設定
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbwdOJ2Cve8l2c5WAq65KyyvnpXarwo9N3oDoLhhAFRiRzAMKWh5Q6-nTTXu1W0MWFPABA/exec"; 
const TRIGGER_RADIUS_KM = 2.0; 

let questionsData = [];
let watchId = null;
let wakeLock = null; 
let isBroadcasting = false; 
let availableVoices = []; // 儲存所有可用的中文語音
let bestVoice = null;     

const dataStatusEl = document.getElementById('data-status');
const gpsStatusEl = document.getElementById('gps-status');
const nearestStatusEl = document.getElementById('nearest-status'); // 新增最近距離元素
const voiceSelectEl = document.getElementById('voice-select');     // 新增語音選單元素
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn'); 
const testBtn = document.getElementById('test-btn'); 
const chimeSound = document.getElementById('chime-sound');
const countdownSound = document.getElementById('countdown-sound');

// ==========================================
// 2. 初始化、語音載入與讀取題庫 (含離線備援)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initVoices(); 
  fetchData();
});

// 💡 語音選單邏輯
function initVoices() {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return;

  // 篩選出所有中文語音
  availableVoices = voices.filter(v => v.lang.includes('zh'));
  
  if (availableVoices.length > 0) {
    // 清空並重新生成下拉選單
    voiceSelectEl.innerHTML = '';
    
    // 預設找帶有 Premium/Siri/Google 的聲音，否則選第一個
    const premiumKeywords = ['Premium', 'Enhanced', 'Google', 'Siri'];
    bestVoice = availableVoices.find(v => premiumKeywords.some(kw => v.name.includes(kw))) || availableVoices[0];

    availableVoices.forEach((voice, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = voice.name;
      // 如果是我們預設找出的最佳聲音，就讓它成為選單的預設選項
      if (voice.name === bestVoice.name) option.selected = true;
      voiceSelectEl.appendChild(option);
    });

    // 當使用者手動更改選單時，更新播報語音
    voiceSelectEl.addEventListener('change', (e) => {
      bestVoice = availableVoices[e.target.value];
      console.log("手動切換語音為:", bestVoice.name);
    });
  } else {
    const option = document.createElement('option');
    option.textContent = "系統預設";
    voiceSelectEl.appendChild(option);
  }
}

if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = initVoices;
}

// 💡 離線備援資料庫邏輯
async function fetchData() {
  try {
    const response = await fetch(API_URL);
    const result = await response.json();

    if (result.status === "success" && result.data.length > 0) {
      // 成功抓取後，偷偷存一份在手機裡當備用
      localStorage.setItem('offline_questions_cache', JSON.stringify(result.data));
      processData(result.data, false);
    } else {
      throw new Error("無法解析資料或資料為空");
    }
  } catch (error) {
    console.warn("無法連線至雲端，嘗試啟用離線備援模式...");
    const cachedData = JSON.parse(localStorage.getItem('offline_questions_cache'));
    
    if (cachedData && cachedData.length > 0) {
      processData(cachedData, true); // 啟用離線資料
    } else {
      dataStatusEl.textContent = "載入失敗，且無離線備份";
      dataStatusEl.className = 'status-text error';
    }
  }
}

// 處理資料並顯示在畫面上
function processData(data, isOffline) {
  const triggeredHistory = JSON.parse(localStorage.getItem('triggered_pois')) || [];
  
  questionsData = data;
  questionsData.forEach(q => {
    q.hasTriggered = triggeredHistory.includes(q.name);
  });

  const remainingCount = questionsData.filter(q => !q.hasTriggered).length;

  // 顯示載入狀態與剩餘題數
  const offlineText = isOffline ? " (離線模式)" : "";
  dataStatusEl.textContent = `成功 ${offlineText} (剩 ${remainingCount} 題)`;
  dataStatusEl.className = 'status-text success';
  
  startBtn.disabled = false;
  if (testBtn) testBtn.style.display = 'inline-block'; 
  
  if (triggeredHistory.length > 0) {
    resetBtn.style.display = 'inline-block';
  } else {
    resetBtn.style.display = 'none';
  }
}

// ==========================================
// 3. 綁定按鈕 (啟動、測試與重置)
// ==========================================
if (testBtn) {
  testBtn.addEventListener('click', async () => {
    if (isBroadcasting || questionsData.length === 0) return;
    
    if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    try {
      if (chimeSound) { await chimeSound.play(); chimeSound.pause(); chimeSound.currentTime = 0; }
      if (countdownSound) { await countdownSound.play(); countdownSound.pause(); countdownSound.currentTime = 0; }
    } catch (e) {}

    // 找出一題還沒唸過的來測試
    const testPoi = questionsData.find(q => !q.hasTriggered) || questionsData[0];
    startBtn.textContent = `測試播報中...`;
    startBtn.style.backgroundColor = "#E91E63"; 
    testBtn.disabled = true; 

    await triggerDramaSequence(testPoi);

    testBtn.disabled = false;
  });
}

startBtn.addEventListener('click', async () => {
  if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));

  try {
    if (chimeSound) { await chimeSound.play(); chimeSound.pause(); chimeSound.currentTime = 0; }
    if (countdownSound) { await countdownSound.play(); countdownSound.pause(); countdownSound.currentTime = 0; }
  } catch (e) {}

  requestWakeLock();
  startGPS();
});

resetBtn.addEventListener('click', () => {
  if (confirm("確定要重置所有播報進度嗎？所有景點將能再次觸發。")) {
    localStorage.removeItem('triggered_pois'); 
    alert("進度已重置！");
    location.reload(); 
  }
});

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      });
    } catch (err) {}
  }
}

// ==========================================
// 4. GPS 追蹤與距離計算 (含最近預告)
// ==========================================
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // 回傳公里數
}

function startGPS() {
  if (!navigator.geolocation) {
    gpsStatusEl.textContent = "不支援 GPS";
    gpsStatusEl.className = 'status-text error';
    return;
  }

  gpsStatusEl.textContent = "定位中...";
  gpsStatusEl.className = 'status-text loading';
  startBtn.textContent = "系統運作中";
  startBtn.disabled = true;
  resetBtn.style.display = 'none'; 
  if (testBtn) testBtn.style.display = 'none'; 

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const currentLat = position.coords.latitude;
      const currentLng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      gpsStatusEl.textContent = `成功 (精度: ${Math.round(accuracy)}m)`;
      gpsStatusEl.className = 'status-text success';

      checkTriggers(currentLat, currentLng);
    },
    (error) => {
      gpsStatusEl.textContent = `失敗 (${error.message})`;
      gpsStatusEl.className = 'status-text error';
      startBtn.disabled = false;
      startBtn.textContent = "重新啟動";
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
  );
}

function checkTriggers(currentLat, currentLng) {
  if (isBroadcasting) return;

  let minDistance = Infinity; // 用來記錄最近的未探索景點距離

  for (let i = 0; i < questionsData.length; i++) {
    const poi = questionsData[i];
    if (!poi.hasTriggered) {
      const distance = calculateDistance(currentLat, currentLng, poi.lat, poi.lng);
      
      // 記錄最小距離
      if (distance < minDistance) {
        minDistance = distance;
      }

      // 觸發廣播邏輯
      if (distance <= TRIGGER_RADIUS_KM) {
        poi.hasTriggered = true; 
        
        const triggeredHistory = JSON.parse(localStorage.getItem('triggered_pois')) || [];
        triggeredHistory.push(poi.name);
        localStorage.setItem('triggered_pois', JSON.stringify(triggeredHistory));
        
        startBtn.textContent = `正在播報：${poi.name}`;
        startBtn.style.backgroundColor = "#E91E63"; 
        
        triggerDramaSequence(poi); 
        return; // 確保一次只觸發一個，中斷迴圈
      }
    }
  }

  // 💡 更新 UI 上的最近預告距離
  if (minDistance !== Infinity) {
    nearestStatusEl.textContent = `約 ${minDistance.toFixed(1)} 公里`;
    nearestStatusEl.className = 'status-text success';
  } else {
    nearestStatusEl.textContent = "全部探索完畢！";
    nearestStatusEl.className = 'status-text success';
  }
}

// ==========================================
// 5. 沉浸式廣播劇流程
// ==========================================
async function triggerDramaSequence(poi) {
  isBroadcasting = true; 

  try { if (chimeSound) await chimeSound.play(); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000)); 

  const cleanOptA = String(poi.optionA || '').replace(/^[A-Cabc][.、\s]+/i, '');
  const cleanOptB = String(poi.optionB || '').replace(/^[A-Cabc][.、\s]+/i, '');
  const cleanOptC = String(poi.optionC || '').replace(/^[A-Cabc][.、\s]+/i, '');

  const questionText = `${poi.question}。選項 A：${cleanOptA}。選項 B：${cleanOptB}。選項 C：${cleanOptC}。`;
  await speakText(questionText);

  try { if (countdownSound) await countdownSound.play(); } catch(e) {}
  await new Promise(r => setTimeout(r, 15000)); 

  const cleanAnswer = String(poi.answer || '').replace(/^答案是\s*[A-Cabc][.、\s]*/i, '答案是：');
  await speakText(cleanAnswer);
  
  startBtn.textContent = "系統運作中";
  startBtn.style.backgroundColor = "#4CAF50";
  
  isBroadcasting = false; 
}

window.speechUtterances = [];

function speakText(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    
    window.speechSynthesis.cancel(); 

    const utterance = new SpeechSynthesisUtterance(text);
    
    // 套用使用者在下拉選單中選擇的最佳語音
    if (bestVoice) {
      utterance.voice = bestVoice;
    }
    utterance.lang = 'zh-TW'; 
    utterance.rate = 0.92;  
    utterance.pitch = 1.05; 
    
    window.speechUtterances.push(utterance);

    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
      console.log("語音發生錯誤或被中斷：", e);
      resolve();
    };
    
    window.speechSynthesis.speak(utterance);
  });
}