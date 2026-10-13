// ==========================================
// 1. 基本設定
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbwdOJ2Cve8l2c5WAq65KyyvnpXarwo9N3oDoLhhAFRiRzAMKWh5Q6-nTTXu1W0MWFPABA/exec"; 
const TRIGGER_RADIUS_KM = 2.0; 

let questionsData = [];
let watchId = null;
let wakeLock = null; 
let isBroadcasting = false; // 💡 新增：播報鎖定，防止多個景點同時觸發互相干擾

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
      // 💡 讀取記憶進度功能
      const triggeredHistory = JSON.parse(localStorage.getItem('triggered_pois')) || [];
      
      questionsData = result.data;
      questionsData.forEach(q => {
        q.hasTriggered = triggeredHistory.includes(q.name);
      });

      const remainingCount = questionsData.filter(q => !q.hasTriggered).length;

      dataStatusEl.textContent = `載入成功 (共 ${questionsData.length} 題，剩餘 ${remainingCount} 題)`;
      dataStatusEl.className = 'status-text success';
      startBtn.disabled = false;
      
      // 顯示重置按鈕
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

// 💡 重置進度功能
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
  // 💡 如果目前正在播報中，先不觸發新的景點，避免聲音與計時器重疊
  if (isBroadcasting) return;

  for (let i = 0; i < questionsData.length; i++) {
    const poi = questionsData[i];
    if (!poi.hasTriggered) {
      const distance = calculateDistance(currentLat, currentLng, poi.lat, poi.lng);
      if (distance <= TRIGGER_RADIUS_KM) {
        poi.hasTriggered = true; 
        
        // 💡 儲存進度到 LocalStorage
        const triggeredHistory = JSON.parse(localStorage.getItem('triggered_pois')) || [];
        triggeredHistory.push(poi.name);
        localStorage.setItem('triggered_pois', JSON.stringify(triggeredHistory));
        
        startBtn.textContent = `正在播報：${poi.name}`;
        startBtn.style.backgroundColor = "#E91E63"; 
        
        triggerDramaSequence(poi); 
        break; // 💡 觸發一個景點後立刻跳出迴圈，確保一次只處理一個
      }
    }
  }
}

// ==========================================
// 5. 沉浸式廣播劇流程
// ==========================================
async function triggerDramaSequence(poi) {
  isBroadcasting = true; // 上鎖：開始播報

  try { if (chimeSound) await chimeSound.play(); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000)); 

  // 💡 解決重複唸 A, B, C 的問題
  // 使用 replace 自動切除資料庫字串開頭的 "A.", "B.", "C." 與多餘空白
  // 這樣即使試算表裡有寫 "A. 答案"，也能轉成乾淨的 "答案" 給語音唸
  const cleanOptA = poi.optionA.replace(/^[A-Cabc][.、\s]+/i, '');
  const cleanOptB = poi.optionB.replace(/^[A-Cabc][.、\s]+/i, '');
  const cleanOptC = poi.optionC.replace(/^[A-Cabc][.、\s]+/i, '');

  const questionText = `${poi.question}。選項 A：${cleanOptA}。選項 B：${cleanOptB}。選項 C：${cleanOptC}。`;
  await speakText(questionText);

  try { if (countdownSound) await countdownSound.play(); } catch(e) {}
  await new Promise(r => setTimeout(r, 15000)); 

  // 解答部分同樣過濾掉可能存在的 "A.", "B.", "C." 前綴 (依你的資料庫習慣可自由選擇是否保留此行)
  const cleanAnswer = poi.answer.replace(/^答案是\s*[A-Cabc][.、\s]*/i, '答案是：');
  
  const answerText = `${cleanAnswer}`;
  await speakText(answerText);
  
  startBtn.textContent = "系統運作中";
  startBtn.style.backgroundColor = "#4CAF50";
  
  isBroadcasting = false; // 解鎖：播報結束
}