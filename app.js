// ==========================================
// 1. 基本設定
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbwdOJ2Cve8l2c5WAq65KyyvnpXarwo9N3oDoLhhAFRiRzAMKWh5Q6-nTTXu1W0MWFPABA/exec"; 
const TRIGGER_RADIUS_KM = 2.0; 
const FACT_COOLDOWN_MS = 3 * 60 * 1000; // 💡 冷知識冷卻時間：預設 3 分鐘 (可自行修改)

let poisData = [];
let factsData = [];
let watchId = null;
let wakeLock = null; 
let isBroadcasting = false; 
let bestVoice = null; 
let lastBroadcastTime = 0; // 💡 記錄上一次說話的時間，用於冷卻計算

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

function initVoices() {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return;
  const twVoices = voices.filter(v => v.lang.includes('zh-TW') || v.lang.includes('zh_TW'));
  if (twVoices.length > 0) {
    bestVoice = twVoices.find(v => 
      v.name.includes('Ting-Ting') || v.name.includes('Siri') || 
      v.name.includes('Premium') || v.name.includes('Enhanced')
    ) || twVoices[0]; 
  }
}

if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = initVoices;
}

async function fetchData() {
  try {
    const response = await fetch(API_URL);
    const result = await response.json();

    if (result.status === "success") {
      const triggeredPois = JSON.parse(localStorage.getItem('triggered_pois')) || [];
      const triggeredFacts = JSON.parse(localStorage.getItem('triggered_facts')) || [];
      
      poisData = result.data.pois || [];
      factsData = result.data.facts || [];

      poisData.forEach(q => q.hasTriggered = triggeredPois.includes(q.name));
      factsData.forEach(q => q.hasTriggered = triggeredFacts.includes(q.name));

      const remainPois = poisData.filter(q => !q.hasTriggered).length;
      const remainFacts = factsData.filter(q => !q.hasTriggered).length;

      dataStatusEl.textContent = `成功 (景點 ${remainPois} / 冷知識 ${remainFacts})`;
      dataStatusEl.className = 'status-text success';
      
      startBtn.disabled = false;
      if (testBtn) testBtn.style.display = 'inline-block'; 
      
      if (triggeredPois.length > 0 || triggeredFacts.length > 0) {
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
    if (isBroadcasting) return;
    
    if ('speechSynthesis' in window) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
      setTimeout(initVoices, 100); 
    }
    try {
      if (chimeSound) { await chimeSound.play(); chimeSound.pause(); chimeSound.currentTime = 0; }
      if (countdownSound) { await countdownSound.play(); countdownSound.pause(); countdownSound.currentTime = 0; }
    } catch (e) {}

    // 測試時隨機挑選一題主線景點
    const testPoi = poisData.find(q => !q.hasTriggered) || poisData[0];
    if(testPoi) {
      startBtn.textContent = `測試播報中...`;
      startBtn.style.backgroundColor = "#E91E63"; 
      testBtn.disabled = true; 
      await triggerDramaSequence(testPoi, 'poi');
      testBtn.disabled = false;
    }
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

  // 系統啟動時，假裝剛剛有說過話，讓冷卻時間開始倒數，避免一上車就直接念冷知識
  lastBroadcastTime = Date.now();

  requestWakeLock();
  startGPS();
});

resetBtn.addEventListener('click', () => {
  if (confirm("確定要重置所有播報進度嗎？所有故事將能再次觸發。")) {
    localStorage.removeItem('triggered_pois'); 
    localStorage.removeItem('triggered_facts'); 
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
// 4. GPS 追蹤與雙軌觸發計算 
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
  let triggeredItem = null;
  let triggerType = '';

  // 💡 優先級 1：檢查是否進入主線景點範圍 (2公里內)
  for (let i = 0; i < poisData.length; i++) {
    const poi = poisData[i];
    if (!poi.hasTriggered) {
      const distance = calculateDistance(currentLat, currentLng, poi.lat, poi.lng);
      if (distance < minDistance) minDistance = distance;

      if (distance <= TRIGGER_RADIUS_KM) {
        triggeredItem = poi;
        triggerType = 'poi';
        break; 
      }
    }
  }

  // 💡 優先級 2：如果沒有觸發主線，且過了冷卻時間，檢查是否在冷知識範圍內
  if (!triggeredItem && (Date.now() - lastBroadcastTime > FACT_COOLDOWN_MS)) {
    for (let i = 0; i < factsData.length; i++) {
      const fact = factsData[i];
      if (!fact.hasTriggered) {
        const distance = calculateDistance(currentLat, currentLng, fact.lat, fact.lng);
        // 冷知識使用獨立的觸發半徑
        if (distance <= fact.radius) {
          triggeredItem = fact;
          triggerType = 'fact';
          break; 
        }
      }
    }
  }

  // 如果有成功觸發，執行對應流程
  if (triggeredItem) {
    triggeredItem.hasTriggered = true; 
    
    // 儲存進度
    const storageKey = triggerType === 'poi' ? 'triggered_pois' : 'triggered_facts';
    const history = JSON.parse(localStorage.getItem(storageKey)) || [];
    history.push(triggeredItem.name);
    localStorage.setItem(storageKey, JSON.stringify(history));
    
    startBtn.textContent = triggerType === 'poi' ? `景點：${triggeredItem.name}` : `冷知識：${triggeredItem.name}`;
    startBtn.style.backgroundColor = triggerType === 'poi' ? "#E91E63" : "#9C27B0"; // 冷知識用紫色按鈕區分
    
    lastBroadcastTime = Date.now(); // 刷新說話時間，重新計算冷卻
    triggerDramaSequence(triggeredItem, triggerType); 
    return;
  }

  // 更新 UI 距離預告 (僅顯示與主線景點的距離)
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
// 5. 沉浸式廣播劇流程 (支援雙模式)
// ==========================================
async function triggerDramaSequence(dataObj, type) {
  isBroadcasting = true; 

  try { if (chimeSound) await chimeSound.play(); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000)); 

  // 根據不同類型組合朗讀文本
  if (type === 'poi') {
    const cleanOptA = String(dataObj.optionA || '').replace(/^[A-Cabc][.、\s]+/i, '');
    const cleanOptB = String(dataObj.optionB || '').replace(/^[A-Cabc][.、\s]+/i, '');
    const cleanOptC = String(dataObj.optionC || '').replace(/^[A-Cabc][.、\s]+/i, '');
    const questionText = `${dataObj.question}。選項 A：${cleanOptA}。選項 B：${cleanOptB}。選項 C：${cleanOptC}。`;
    await speakText(questionText);
  } else {
    // 冷知識破冰問句
    await speakText(dataObj.question);
  }

  // 15 秒懸疑討論時間
  try { if (countdownSound) await countdownSound.play(); } catch(e) {}
  await new Promise(r => setTimeout(r, 15000)); 

  // 解答文本
  const cleanAnswer = String(dataObj.answer || '').replace(/^答案是\s*[A-Cabc][.、\s]*/i, '答案是：');
  await speakText(cleanAnswer);
  
  startBtn.textContent = "系統運作中";
  startBtn.style.backgroundColor = "#4CAF50";
  
  isBroadcasting = false; 
}

window.speechUtterances = [];

function speakText(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) { resolve(); return; }
    
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (bestVoice) utterance.voice = bestVoice;
    utterance.lang = 'zh-TW'; 
    utterance.rate = 0.92;  
    utterance.pitch = 1.05; 
    
    window.speechUtterances.push(utterance);
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}