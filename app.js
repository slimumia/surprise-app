// ==========================================
// 1. 基本設定
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbwdOJ2Cve8l2c5WAq65KyyvnpXarwo9N3oDoLhhAFRiRzAMKWh5Q6-nTTXu1W0MWFPABA/exec"; 
const TRIGGER_RADIUS_KM = 2.0; 

let questionsData = [];
let watchId = null;
let wakeLock = null; 

const dataStatusEl = document.getElementById('data-status');
const gpsStatusEl = document.getElementById('gps-status');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn'); 
const chimeSound = document.getElementById('chime-sound');
const countdownSound = document.getElementById('countdown-sound');

// ==========================================
// 2. 初始化、讀取題庫與歷史進度
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  fetchData();
});

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
// 3. 綁定按鈕 (啟動與重置)
// ==========================================
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
  } catch (e) {
    console.log("音效解鎖通知：", e);
  }

  requestWakeLock();
  startGPS();
});

resetBtn.addEventListener('click', () => {
  const confirmReset = confirm("確定要重置所有播報進度嗎？這將會讓所有景點都能再次觸發。");
  if (confirmReset) {
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
    } catch (err) {
      console.log(`喚醒鎖定錯誤: ${err.name}, ${err.message}`);
    }
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
  for (let i = 0; i < questionsData.length; i++) {
    const poi = questionsData[i];
    if (!poi.hasTriggered) {
      const distance = calculateDistance(currentLat, currentLng, poi.lat, poi.lng);
      if (distance <= TRIGGER_RADIUS_KM) {
        poi.hasTriggered = true; 
        
        const triggeredHistory = JSON.parse(localStorage.getItem('triggered_pois')) || [];
        triggeredHistory.push(poi.name);
        localStorage.setItem('triggered_pois', JSON.stringify(triggeredHistory));
        
        startBtn.textContent = `正在播報：${poi.name}`;
        startBtn.style.backgroundColor = "#E91E63"; 
        
        triggerDramaSequence(poi); 
      }
    }
  }
}

// ==========================================
// 5. 沉浸式廣播劇流程
// ==========================================
async function triggerDramaSequence(poi) {
  try { if (chimeSound) await chimeSound.play(); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000)); 

  const questionText = `${poi.question}。選項 ：${poi.optionA}。選項 ：${poi.optionB}。選項 ：${poi.optionC}。`;
  await speakText(questionText);

  try { if (countdownSound) await countdownSound.play(); } catch(e) {}
  await new Promise(r => setTimeout(r, 15000)); 

  const answerText = `${poi.answer}`;
  await speakText(answerText);
  
  startBtn.textContent = "系統運作中";
  startBtn.style.backgroundColor = "#4CAF50";
}

function speakText(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    
    window.speechSynthesis.cancel(); 

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-TW'; 
    utterance.rate = 0.95;    
    
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    
    window.speechSynthesis.speak(utterance);
  });
}