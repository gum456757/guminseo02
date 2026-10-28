/**
 * ==============================================================================
 * app.js - 메인 오케스트레이터 및 실시간 환율 UI 동기화 모듈
 * ==============================================================================
 * 
 * [발표 및 코드 설명 포인트]
 * 1. 웹페이지가 로드되거나 사용자가 환율 계산기 창을 열 때, "실시간 환율 불러오는 중..."
 *    로딩 상태를 화면에 시각적으로 보여준 뒤, 인터넷에서 가져온 최신 데이터를 즉시 반영합니다.
 * 2. 수동 새로고침 버튼 및 10분 주기 자동 동기화 타이머가 구현되어 있습니다.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Lucide 아이콘 초기 렌더링
  if (window.lucide) {
    lucide.createIcons();
  }

  // 1. 각 서브 모듈 초기화
  Converter.init();
  Calculator.init();
  ChartManager.init();

  // 2. 테마 설정 (라이트/다크)
  setupThemeToggle();

  // 3. 하단 환율 아코디언 토글 이벤트
  setupCurrencyAccordion();

  // 4. 일반 계산기 -> 환율 계산기 연동 브릿지 버튼
  setupBridgeButtons();

  // 5. 환율 수동 새로고침 버튼
  setupRefreshButton();

  // 6. 🌐 웹사이트 시작 시 실시간 환율 즉시 동기화 실행
  await fetchAndUpdateRates(true);

  // 7. 주기적 환율 갱신 (10분마다 인터넷에서 최신 환율 자동 갱신)
  setInterval(async () => {
    await fetchAndUpdateRates(false);
  }, 10 * 60 * 1000);
});

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * [핵심 함수] 인터넷에서 실시간 환율을 가져와 전체 화면을 업데이트하는 함수
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 💡 발표 설명:
 * "이 함수가 실행되면 화면에 '데이터를 불러오는 중...' 로딩 애니메이션이
 *  표시되고, API 통신이 완료되면 4가지 거래 가격과 차트가 실시간 금액으로 갱신됩니다."
 * 
 * @param {boolean} showVisualLoading - 화면에 로딩 인디케이터/펄스 효과를 보여줄지 여부
 */
async function fetchAndUpdateRates(showVisualLoading = true) {
  const statusBadge = document.getElementById('rateStatusBadge');
  const statusText = document.getElementById('rateStatusText');
  const refreshBtn = document.getElementById('refreshRatesBtn');
  const currencyContent = document.getElementById('currencyExpandContent');

  // [단계 1] 로딩 시작 UI 표시 ("데이터를 불러오는 중...")
  if (showVisualLoading) {
    if (statusBadge) statusBadge.classList.add('loading-pulse');
    if (statusText) statusText.textContent = '🌐 실시간 환율 데이터 불러오는 중...';
    if (refreshBtn) refreshBtn.classList.add('spinning');
    if (currencyContent) currencyContent.classList.add('rates-loading');
  }

  // 로딩 느낌을 사용자가 기분 좋게 인지할 수 있도록 최소 400ms 비동기 대기
  const [result] = await Promise.all([
    RatesManager.fetchLiveRates(),
    new Promise(resolve => setTimeout(resolve, showVisualLoading ? 450 : 0))
  ]);

  // [단계 2] 최신 환율 데이터를 바탕으로 모든 화면 컴포넌트 일괄 갱신
  updateRateBadge();
  if (window.Converter) Converter.refresh();
  if (window.ChartManager) ChartManager.refreshAll();

  // [단계 3] 로딩 UI 해제 및 완료 알림
  if (showVisualLoading) {
    if (statusBadge) statusBadge.classList.remove('loading-pulse');
    if (refreshBtn) refreshBtn.classList.remove('spinning');
    if (currencyContent) {
      currencyContent.classList.remove('rates-loading');
      currencyContent.classList.add('rates-updated-flash');
      setTimeout(() => currencyContent.classList.remove('rates-updated-flash'), 800);
    }
  }

  return result;
}

/**
 * 상단 헤더의 환율 상태 배지 및 최근 갱신 시각 업데이트
 */
function updateRateBadge() {
  const timeEl = document.getElementById('rateUpdateTime');
  const statusTextEl = document.getElementById('rateStatusText');
  const statusDot = document.querySelector('#rateStatusBadge .status-dot');

  if (timeEl) {
    timeEl.textContent = RatesManager.getLastUpdatedTime();
  }

  if (statusTextEl) {
    if (RatesManager.isLiveConnected()) {
      statusTextEl.textContent = '실시간 글로벌 환율 연동';
      if (statusDot) {
        statusDot.className = 'status-dot live';
        statusDot.title = '인터넷 무료 오픈 환율 API 정상 연결됨';
      }
    } else {
      statusTextEl.textContent = '표준 기준 환율 적용 (오프라인)';
      if (statusDot) {
        statusDot.className = 'status-dot offline';
        statusDot.title = '네트워크 오프라인 기본값 적용 중';
      }
    }
  }
}

/**
 * 하단 환율 아코디언 열기/닫기 제어
 */
let hasLoadedOnOpen = false;
function setupCurrencyAccordion() {
  const triggerBtn = document.getElementById('currencyExpandBtn');
  const section = document.getElementById('currencyAccordion');

  if (!triggerBtn || !section) return;

  triggerBtn.addEventListener('click', async () => {
    const isOpen = section.classList.contains('open');
    if (isOpen) {
      section.classList.remove('open');
      triggerBtn.setAttribute('aria-expanded', 'false');
    } else {
      section.classList.add('open');
      triggerBtn.setAttribute('aria-expanded', 'true');
      
      // 처음 열 때 최신 실시간 환율을 상쾌하게 다시 동기화
      if (!hasLoadedOnOpen) {
        hasLoadedOnOpen = true;
        await fetchAndUpdateRates(true);
      }

      if (window.ChartManager) {
        setTimeout(() => ChartManager.refreshAll(), 80);
      }
      setTimeout(() => {
        section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
    if (window.lucide) lucide.createIcons();
  });
}

function openCurrencyAccordion() {
  const section = document.getElementById('currencyAccordion');
  const triggerBtn = document.getElementById('currencyExpandBtn');
  if (section && !section.classList.contains('open')) {
    section.classList.add('open');
    if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'true');
    if (window.ChartManager) {
      setTimeout(() => ChartManager.refreshAll(), 60);
    }
    if (window.lucide) lucide.createIcons();
  }
}

/**
 * 일반 계산기 -> 환율 계산기 브릿지 연동
 */
function setupBridgeButtons() {
  const sendToConverterBtn = document.getElementById('sendToConverterBtn');
  const sendToForeignBtn = document.getElementById('sendToForeignBtn');

  if (sendToConverterBtn) {
    sendToConverterBtn.addEventListener('click', () => {
      const val = Calculator.getCurrentValue();
      if (val >= 0) {
        openCurrencyAccordion();
        Converter.setKrwAmount(val);
        
        const target = document.getElementById('krwBox');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlightConverterBox('krwBox');
        }
      }
    });
  }

  if (sendToForeignBtn) {
    sendToForeignBtn.addEventListener('click', () => {
      const val = Calculator.getCurrentValue();
      if (val >= 0) {
        openCurrencyAccordion();
        Converter.setForeignAmount(val);

        const target = document.getElementById('foreignBox');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlightConverterBox('foreignBox');
        }
      }
    });
  }
}

function highlightConverterBox(boxId) {
  const box = document.getElementById(boxId);
  if (box) {
    box.style.transition = 'all 0.3s ease';
    box.style.borderColor = 'var(--primary)';
    box.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.3)';
    setTimeout(() => {
      box.style.borderColor = '';
      box.style.boxShadow = '';
    }, 1200);
  }
}

/**
 * 테마 토글 (라이트 / 다크 모드)
 */
function setupThemeToggle() {
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (!toggleBtn) return;

  const savedTheme = localStorage.getItem('theme_preference');
  if (savedTheme === 'dark') {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
  }

  toggleBtn.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark-theme');
    if (isDark) {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
      localStorage.setItem('theme_preference', 'light');
    } else {
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
      localStorage.setItem('theme_preference', 'dark');
    }

    if (window.lucide) lucide.createIcons();
    if (window.ChartManager) ChartManager.updateTheme();
  });
}

/**
 * 수동 환율 새로고침 버튼 핸들러
 */
function setupRefreshButton() {
  const btn = document.getElementById('refreshRatesBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    await fetchAndUpdateRates(true);
  });
}

// 전역 공개 헬퍼
window.AppRates = {
  refresh: () => fetchAndUpdateRates(true)
};
