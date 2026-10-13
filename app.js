// ==========================================
// 1. 基本設定
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbwdOJ2Cve8l2c5WAq65KyyvnpXarwo9N3oDoLhhAFRiRzAMKWh5Q6-nTTXu1W0MWFPABA/exec"; // <-- ⚠️ 請記得替換為你的 GAS 網址！
const TRIGGER_RADIUS_KM = 500.0; // ⚠️ 測試用語音建議先設為 500.0，確認有聲音後再改回 2.0

let questionsData = [];
let watchId = null;

const dataStatusEl = document.getElementById('data-status');
const gpsStatusEl = document.getElementById('gps-status');
const startBtn = document.getElementById('start-btn');
const chimeSound = document.getElementById('chime-sound');
const countdownSound = document.getElementById('countdown-sound');

// ==========================================
// 2. 初始化與讀取題庫
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  fetchData();
});

async function fetchData() {
  try {
    const response = await fetch(API_URL);
    const result = await response.json();

    if (result.status === "success" && result.data.length > 0) {
      questionsData = result.data;
      questionsData.forEach(q => q.hasTriggered = false);

      dataStatusEl.textContent = `載入成功 (${questionsData.length} 題)`;
      dataStatusEl.className = 'status-text success';
      startBtn.disabled = false;
    } else {
      throw new Error("無法解析資料或資料為空");
    }
  } catch (error) {
    dataStatusEl.textContent = "載入失敗";
    dataStatusEl.className = 'status-text error';
  }
}

// ==========================================
// 3. 核心：綁定按鈕與解除音效限制 (Unlock Audio)
// ==========================================
startBtn.addEventListener('click', async () => {
  // 當按下啟動時，立即「解鎖」語音引擎
  if ('speechSynthesis' in window) {
    const unlockUtterance = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(unlockUtterance);
  }

  // 立即「解鎖」HTML 音效檔 (播放並瞬間暫停)
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

  // 解鎖完成後，開始 GPS 追蹤
  startGPS();
});

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
        
        // 觸發時將畫面狀態改為明顯的提示，方便我們除錯確認有確實觸發
        startBtn.textContent = `正在播報：${poi.name}`;
        startBtn.style.backgroundColor = "#E91E63"; // 變成粉紅色
        
        triggerDramaSequence(poi); 
      }
    }
  }
}

// ==========================================
// 5. 沉浸式廣播劇流程 (語音與音效)
// ==========================================
async function triggerDramaSequence(poi) {
  console.log(`[觸發] 抵達 ${poi.name}`);

  // 1. 播放提示音
  try { if (chimeSound) await chimeSound.play(); } catch(e) { console.log("無提示音效"); }
  await new Promise(r => setTimeout(r, 2000)); // 等待 2 秒

  // 2. 語音唸題目
  const questionText = `各位乘客請注意，我們即將抵達：${poi.name}。請聽題：${poi.question}。選項 A：${poi.optionA}。選項 B：${poi.optionB}。選項 C：${poi.optionC}。請在倒數結束前，討論出你們的答案。`;
  await speakText(questionText);

  // 3. 播放懸疑倒數音樂
  try { if (countdownSound) await countdownSound.play(); } catch(e) { console.log("無倒數音效"); }
  await new Promise(r => setTimeout(r, 15000)); // 等待 15 秒倒數

  // 4. 語音揭曉解答
  const answerText = `時間到！解答揭曉。${poi.answer}`;
  await speakText(answerText);
  
  // 播報完畢，恢復按鈕狀態
  startBtn.textContent = "系統運作中";
  startBtn.style.backgroundColor = "#4CAF50";
}

// 將文字轉語音包裝成 Promise
function speakText(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      console.log("瀏覽器不支援語音");
      resolve();
      return;
    }
    
    window.speechSynthesis.cancel(); 

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-TW'; 
    utterance.rate = 0.95;    
    
    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
      console.log("語音發生錯誤：", e);
      resolve();
    };
    
    window.speechSynthesis.speak(utterance);
  });
}