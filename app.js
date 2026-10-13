// ==========================================
// 1. 基本設定
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbwdOJ2Cve8l2c5WAq65KyyvnpXarwo9N3oDoLhhAFRiRzAMKWh5Q6-nTTXu1W0MWFPABA/exec"; // <-- 請記得替換為你的 GAS 網址！
const TRIGGER_RADIUS_KM = 2.0; // 觸發半徑 2 公里

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
// 3. GPS 追蹤與距離計算
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

  // 為了解除 iOS/Android 的音效自動播放限制，先偷偷播放一段空白聲音
  chimeSound.play().then(() => { chimeSound.pause(); chimeSound.currentTime = 0; }).catch(() => {});

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
        triggerDramaSequence(poi); // 呼叫廣播劇流程
      }
    }
  }
}

// ==========================================
// 4. 沉浸式廣播劇流程 (語音與音效)
// ==========================================
async function triggerDramaSequence(poi) {
  console.log(`[觸發] 抵達 ${poi.name}`);

  // 1. 播放提示音
  try { await chimeSound.play(); } catch(e) { console.log("無提示音效"); }
  await new Promise(r => setTimeout(r, 2000)); // 等待 2 秒

  // 2. 語音唸題目
  const questionText = `各位乘客請注意，我們即將抵達：${poi.name}。請聽題：${poi.question}。選項 A：${poi.optionA}。選項 B：${poi.optionB}。選項 C：${poi.optionC}。請在倒數結束前，討論出你們的答案。`;
  await speakText(questionText);

  // 3. 播放懸疑倒數音樂
  try { await countdownSound.play(); } catch(e) { console.log("無倒數音效"); }
  await new Promise(r => setTimeout(r, 15000)); // 等待 15 秒倒數

  // 4. 語音揭曉解答
  const answerText = `時間到！解答揭曉。${poi.answer}`;
  await speakText(answerText);
}

// 將文字轉語音包裝成 Promise，確保語音唸完才進行下一步
function speakText(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      console.log("不支援語音");
      resolve();
      return;
    }
    
    // 停止正在播放的語音
    window.speechSynthesis.cancel(); 

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-TW'; // 設定為台灣中文
    utterance.rate = 0.95;    // 語速微調慢一點點，更像廣播
    
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    
    window.speechSynthesis.speak(utterance);
  });
}

// 綁定啟動按鈕
startBtn.addEventListener('click', () => {
  startGPS();
});