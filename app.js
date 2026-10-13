// ==========================================
// 1. 基本設定
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbwdOJ2Cve8l2c5WAq65KyyvnpXarwo9N3oDoLhhAFRiRzAMKWh5Q6-nTTXu1W0MWFPABA/exec"; // <-- 請記得替換！
const TRIGGER_RADIUS_KM = 2.0; // 設定觸發半徑為 2 公里

let questionsData = [];
let watchId = null; // 用來儲存 GPS 追蹤的 ID

// 取得畫面上的元素
const dataStatusEl = document.getElementById('data-status');
const gpsStatusEl = document.getElementById('gps-status');
const startBtn = document.getElementById('start-btn');

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
      
      // 為每個景點新增一個標記，防止重複觸發
      questionsData.forEach(q => q.hasTriggered = false);

      dataStatusEl.textContent = `載入成功 (${questionsData.length} 題)`;
      dataStatusEl.className = 'status-text success';
      startBtn.disabled = false;
    } else {
      throw new Error("無法解析資料或資料為空");
    }
  } catch (error) {
    console.error("讀取資料失敗:", error);
    dataStatusEl.textContent = "載入失敗";
    dataStatusEl.className = 'status-text error';
  }
}

// ==========================================
// 3. GPS 追蹤與距離計算
// ==========================================

// Haversine 公式：計算兩個經緯度之間的直線距離（單位：公里）
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // 地球半徑 (公里)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 開始追蹤 GPS 位置
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

  // 使用 watchPosition 持續監聽位置
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const currentLat = position.coords.latitude;
      const currentLng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      gpsStatusEl.textContent = `定位成功 (精度: ${Math.round(accuracy)}m)`;
      gpsStatusEl.className = 'status-text success';

      // 檢查是否進入任何景點範圍
      checkTriggers(currentLat, currentLng);
    },
    (error) => {
      console.error("GPS 錯誤:", error);
      gpsStatusEl.textContent = `定位失敗 (${error.message})`;
      gpsStatusEl.className = 'status-text error';
      startBtn.disabled = false; // 失敗時允許重新啟動
      startBtn.textContent = "重新啟動";
    },
    {
      enableHighAccuracy: true, // 要求高精度定位
      maximumAge: 10000,        // 接受 10 秒內的快取位置
      timeout: 10000            // 10 秒定位逾時
    }
  );
}

// 檢查目前位置是否在題庫景點範圍內
function checkTriggers(currentLat, currentLng) {
  for (let i = 0; i < questionsData.length; i++) {
    const poi = questionsData[i];
    
    // 如果這個景點還沒被觸發過
    if (!poi.hasTriggered) {
      const distance = calculateDistance(currentLat, currentLng, poi.lat, poi.lng);
      
      // 如果距離小於設定半徑 (2公里)
      if (distance <= TRIGGER_RADIUS_KM) {
        poi.hasTriggered = true; // 標記為已觸發，避免重複
        triggerEvent(poi, distance);
      }
    }
  }
}

// 觸發事件 (目前先用 alert 顯示，第四階段再加入語音)
function triggerEvent(poi, distance) {
  const distStr = distance.toFixed(2);
  console.log(`[觸發] 距離 ${poi.name} 約 ${distStr} 公里！`);
  alert(`【驚喜觸發】\n你距離「${poi.name}」只有 ${distStr} 公里！\n\n即將進入第四階段的廣播劇環節。`);
}

// 綁定啟動按鈕
startBtn.addEventListener('click', () => {
  startGPS();
});