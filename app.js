// ==========================================
// 1. 基本設定
// ==========================================
// 這是你專屬的 Google Apps Script API 網址
const API_URL = "https://script.google.com/macros/s/AKfycbwdOJ2Cve8l2c5WAq65KyyvnpXarwo9N3oDoLhhAFRiRzAMKWh5Q6-nTTXu1W0MWFPABA/exec"; 
const TRIGGER_RADIUS_KM = 2.0; // 觸發半徑 (公里)

let questionsData = [];
let watchId = null;
let wakeLock = null; 
let isBroadcasting = false; // 播報鎖定，防止多個景點同時觸發
let bestVoice = null;       // 儲存篩選出的高品質語音

// 取得畫面元素
const dataStatusEl = document.getElementById('data-status');
const gpsStatusEl = document.getElementById('gps-status');
const voiceStatusEl = document.getElementById('voice-status'); // 顯示語音引擎名稱
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn'); 
const testBtn = document.getElementById('test-btn'); 
const chimeSound = document.getElementById('chime-sound');
const countdownSound = document.getElementById('countdown-sound');

// ==========================================
// 2. 初始化、語音載入與讀取題庫
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initVoices(); // 初始化語音引擎
  fetchData();  // 讀取題庫資料
});

// 高品質語音自動篩選器
function initVoices() {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return;

  // 尋找台灣中文語音
  const twVoices = voices.filter(v => v.lang.includes('zh-TW') || v.lang.includes('zh_TW'));
  
  if (twVoices.length > 0) {
    // 優先挑選帶有高音質關鍵字的語音
    const premiumKeywords = ['Premium', 'Enhanced', 'Google', 'Siri'];
    bestVoice = twVoices.find(v => premiumKeywords.some(kw => v.name.includes(kw))) || twVoices[0];
  } else {
    // 找不到台灣腔，退而求其次找任何中文語音
    const cnVoices = voices.filter(v => v.lang.includes('zh'));
    bestVoice = cnVoices.length > 0 ? cnVoices[0] : null;
  }
  
  // 將抓取到的語音名稱顯示在畫面上 (如果 HTML 中有這個元素)
  if (voiceStatusEl) {
    if (bestVoice) {
      voiceStatusEl.textContent = bestVoice.name;
      voiceStatusEl.className = 'status-text success';
    } else {
      voiceStatusEl.textContent = "系統預設";
      voiceStatusEl.className = 'status-text waiting';
    }
  }
}

// 確保語音列表載入完成後再次觸發篩選
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = initVoices;
}

// 讀取題庫並核對記憶進度
async function fetchData() {
  try {
    const response = await fetch(API_URL);
    const result = await response.json();

    if (result.status === "success" && result.data.length > 0) {
      const triggeredHistory = JSON.parse(localStorage.getItem('triggered_pois')) || [];
      
      questionsData = result.data;
      questionsData.forEach(q => {
        q.hasTriggered = triggeredHistory.includes(q.name);
      });

      const remainingCount = questionsData.filter(q => !q.hasTriggered).length;

      dataStatusEl.textContent = `載入成功 (共 ${questionsData.length} 題，剩餘 ${remainingCount} 題)`;
      dataStatusEl.className = 'status-text success';
      startBtn.disabled = false;
      
      if (testBtn) testBtn.style.display = 'inline-block'; 
      
      if (triggeredHistory.length > 0) {
        resetBtn.style.display = 'inline-block';
      } else {
        resetBtn.style.display = 'none';
      }
    } else {
      throw new Error("無法解析資料或資料為空");
    }
  } catch (error) {
    console.error(error);
    dataStatusEl.textContent = "載入失敗，請檢查網路或 API";
    dataStatusEl.className = 'status-text error';
  }
}

// ==========================================
// 3. 綁定按鈕 (啟動、測試與重置)
// ==========================================

// 測試按鈕邏輯：免 GPS 直接測試廣播劇流程
if (testBtn) {
  testBtn.addEventListener('click', async () => {
    if (isBroadcasting || questionsData.length === 0) return;
    
    // 解鎖語音與音效
    if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    try {
      if (chimeSound) { await chimeSound.play(); chimeSound.pause(); chimeSound.currentTime = 0; }
      if (countdownSound) { await countdownSound.play(); countdownSound.pause(); countdownSound.currentTime = 0; }
    } catch (e) {}

    const testPoi = questionsData[0];
    startBtn.textContent = `測試播報中：${testPoi.name}`;
    startBtn.style.backgroundColor = "#E91E63"; 
    testBtn.disabled = true; 

    await triggerDramaSequence(testPoi);

    testBtn.disabled = false;
  });
}

// 正式啟動 GPS 按鈕邏輯
startBtn.addEventListener('click', async () => {
  if ('speechSynthesis' in window) {
    const unlockUtterance = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(unlockUtterance);
  }

  try {
    if (chimeSound) {
      await chimeSound.play();
      chimeSound.pause();
      chimeSound.currentTime = 0;
    }
    if (countdownSound) {
      await countdownSound.play();
      countdownSound.pause();
      countdownSound.currentTime = 0;
    }
  } catch (e) {}

  requestWakeLock();
  startGPS();
});

// 重置進度按鈕
resetBtn.addEventListener('click', () => {
  const confirmReset = confirm("確定要重置所有播報進度嗎？這將會讓所有景點都能再次觸發。");
  if (confirmReset) {
    localStorage.removeItem('triggered_pois'); 
    alert("進度已重置！");
    location.reload(); 
  }
});

// 螢幕長亮設定
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
// 4. GPS 追蹤與距離計算
// ==========================================
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function startGPS() {
  if (!navigator.geolocation) {
    gpsStatusEl.textContent = "瀏覽器不支援 GPS";
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

      gpsStatusEl.textContent = `定位成功 (精度: ${Math.round(accuracy)}m)`;
      gpsStatusEl.className = 'status-text success';

      checkTriggers(currentLat, currentLng);
    },
    (error) => {
      gpsStatusEl.textContent = `定位失敗 (${error.message})`;
      gpsStatusEl.className = 'status-text error';
      startBtn.disabled = false;
      startBtn.textContent = "重新啟動";
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
  );
}

function checkTriggers(currentLat, currentLng) {
  if (isBroadcasting) return; // 若正在播報，則暫停觸發新景點

  for (let i = 0; i < questionsData.length; i++) {
    const poi = questionsData[i];
    if (!poi.hasTriggered) {
      const distance = calculateDistance(currentLat, currentLng, poi.lat, poi.lng);
      if (distance <= TRIGGER_RADIUS_KM) {
        poi.hasTriggered = true; 
        
        // 記錄進度
        const triggeredHistory = JSON.parse(localStorage.getItem('triggered_pois')) || [];
        triggeredHistory.push(poi.name);
        localStorage.setItem('triggered_pois', JSON.stringify(triggeredHistory));
        
        startBtn.textContent = `正在播報：${poi.name}`;
        startBtn.style.backgroundColor = "#E91E63"; 
        
        triggerDramaSequence(poi); 
        break; // 確保一次只觸發一個
      }
    }
  }
}

// ==========================================
// 5. 沉浸式廣播劇流程
// ==========================================
async function triggerDramaSequence(poi) {
  isBroadcasting = true; // 上鎖

  try { if (chimeSound) await chimeSound.play(); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000)); 

  // 自動過濾資料庫開頭的 A. B. C.
  const cleanOptA = String(poi.optionA || '').replace(/^[A-Cabc][.、\s]+/i, '');
  const cleanOptB = String(poi.optionB || '').replace(/^[A-Cabc][.、\s]+/i, '');
  const cleanOptC = String(poi.optionC || '').replace(/^[A-Cabc][.、\s]+/i, '');

  const questionText = `${poi.question}。選項 A：${cleanOptA}。選項 B：${cleanOptB}。選項 C：${cleanOptC}。`;
  await speakText(questionText);

  // 15 秒討論時間
  try { if (countdownSound) await countdownSound.play(); } catch(e) {}
  await new Promise(r => setTimeout(r, 15000)); 

  const cleanAnswer = String(poi.answer || '').replace(/^答案是\s*[A-Cabc][.、\s]*/i, '答案是：');
  
  const answerText = `${cleanAnswer}`;
  await speakText(answerText);
  
  startBtn.textContent = "系統運作中";
  startBtn.style.backgroundColor = "#4CAF50";
  
  isBroadcasting = false; // 解鎖
}

// 解決語音被系統提早回收中斷的保護機制
window.speechUtterances = [];

function speakText(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    
    window.speechSynthesis.cancel(); 

    const utterance = new SpeechSynthesisUtterance(text);
    
    // 套用高品質語音與細節微調
    if (bestVoice) {
      utterance.voice = bestVoice;
    }
    utterance.lang = 'zh-TW'; 
    utterance.rate = 0.92;  // 稍微放慢語速，增加沉浸感
    utterance.pitch = 1.05; // 稍微拉高音調
    
    window.speechUtterances.push(utterance);

    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
      console.log("語音發生錯誤或被中斷：", e);
      resolve();
    };
    
    window.speechSynthesis.speak(utterance);
  });
}