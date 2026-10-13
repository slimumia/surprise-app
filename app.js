// ==========================================
// 1. 基本設定
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbwdOJ2Cve8l2c5WAq65KyyvnpXarwo9N3oDoLhhAFRiRzAMKWh5Q6-nTTXu1W0MWFPABA/exec"; 
const TRIGGER_RADIUS_KM = 2.0; 

let questionsData = [];
let watchId = null;
let wakeLock = null; 
let isBroadcasting = false; 
let bestVoice = null; // 用來儲存鎖定的最佳語音

const dataStatusEl = document.getElementById('data-status');
const gpsStatusEl = document.getElementById('gps-status');
const nearestStatusEl = document.getElementById('nearest-status'); 
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn'); 
const testBtn = document.getElementById('test-btn'); 
const chimeSound = document.getElementById('chime-sound');
const countdownSound = document.getElementById('countdown-sound');

// ==========================================
// 2. 初始化、自動鎖定最佳語音與讀取題庫
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initVoices(); 
  fetchData();
});

// 💡 語音鎖定邏輯：強制尋找最自然的聲音
function initVoices() {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return;

  // 尋找台灣中文語音
  const twVoices = voices.filter(v => v.lang.includes('zh-TW') || v.lang.includes('zh_TW'));
  
  if (twVoices.length > 0) {
    // 直接鎖定「亭亭 (Ting-Ting)」、Siri 或 Premium 等高音質關鍵字
    bestVoice = twVoices.find(v => 
      v.name.includes('Ting-Ting') || 
      v.name.includes('Siri') || 
      v.name.includes('Premium') ||
      v.name.includes('Enhanced')
    ) || twVoices[0]; // 若真的找不到，才退回預設聲音
  }
}

// 確保 iOS 延遲載入語音時能重新鎖定
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = initVoices;
}

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

      dataStatusEl.textContent = `成功 (剩 ${remainingCount} 題)`;
      dataStatusEl.className = 'status-text success';
      
      startBtn.disabled = false;
      if (testBtn) testBtn.style.display = 'inline-block'; 
      
      if (triggeredHistory.length > 0) {
        resetBtn.style.display = 'inline-block';
      } else {
        resetBtn.style.display = 'none';
      }
    } else {
      throw new Error("無法解析資料");
    }
  } catch (error) {
    dataStatusEl.textContent = "載入失敗";
    dataStatusEl.className = 'status-text error';
  }
}

// ==========================================
// 3. 綁定按鈕 (啟動、測試與重置)
// ==========================================
if (testBtn) {
  testBtn.addEventListener('click', async () => {
    if (isBroadcasting || questionsData.length === 0) return;
    
    // 點擊瞬間強制更新語音清單並解鎖
    if ('speechSynthesis' in window) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
      setTimeout(initVoices, 100); 
    }

    try {
      if (chimeSound) { await chimeSound.play(); chimeSound.pause(); chimeSound.currentTime = 0; }
      if (countdownSound) { await countdownSound.play(); countdownSound.pause(); countdownSound.currentTime = 0; }
    } catch (e) {}

    const testPoi = questionsData.find(q => !q.hasTriggered) || questionsData[0];
    startBtn.textContent = `測試播報中...`;
    startBtn.style.backgroundColor = "#E91E63"; 
    testBtn.disabled = true; 

    await triggerDramaSequence(testPoi);

    testBtn.disabled = false;
  });
}

startBtn.addEventListener('click', async () => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    setTimeout(initVoices, 100);
  }

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

  let minDistance = Infinity; 

  for (let i = 0; i < questionsData.length; i++) {
    const poi = questionsData[i];
    if (!poi.hasTriggered) {
      const distance = calculateDistance(currentLat, currentLng, poi.lat, poi.lng);
      
      if (distance < minDistance) {
        minDistance = distance;
      }

      if (distance <= TRIGGER_RADIUS_KM) {
        poi.hasTriggered = true; 
        
        const triggeredHistory = JSON.parse(localStorage.getItem('triggered_pois')) || [];
        triggeredHistory.push(poi.name);
        localStorage.setItem('triggered_pois', JSON.stringify(triggeredHistory));
        
        startBtn.textContent = `正在播報：${poi.name}`;
        startBtn.style.backgroundColor = "#E91E63"; 
        
        triggerDramaSequence(poi); 
        return; 
      }
    }
  }

  if (nearestStatusEl) {
    if (minDistance !== Infinity) {
      nearestStatusEl.textContent = `約 ${minDistance.toFixed(1)} 公里`;
      nearestStatusEl.className = 'status-text success';
    } else {
      nearestStatusEl.textContent = "全部探索完畢！";
      nearestStatusEl.className = 'status-text success';
    }
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
    
    // 💡 套用鎖定的最佳語音與參數
    if (bestVoice) {
      utterance.voice = bestVoice;
    }
    utterance.lang = 'zh-TW'; 
    utterance.rate = 0.92;  // 放慢語速提升說故事感
    utterance.pitch = 1.05; // 微調音調
    
    window.speechUtterances.push(utterance);

    utterance.onend = () => resolve();
    utterance.onerror = (e) => resolve();
    
    window.speechSynthesis.speak(utterance);
  });
}