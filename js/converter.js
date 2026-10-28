/**
 * ==============================================================================
 * converter.js - 실시간 환율 기반 4대 거래 변환 및 우대율 계산기 모듈
 * ==============================================================================
 * 
 * [발표 및 코드 설명 포인트]
 * 1. 실시간으로 가져온 매매기준율과 수수료(스프레드)를 바탕으로,
 *    [현찰 살 때, 현찰 팔 때, 송금 보낼 때, 송금 받을 때] 4가지 거래 가격을 실시간 연동합니다.
 * 2. 원화(KRW)와 외화(USD, JPY 등) 사이의 실시간 양방향 자동 계산을 제공합니다.
 * 3. 한국어 금액 단위(만, 억, 조) 읽기 및 우대율(수수료 감면 혜택) 시뮬레이션을 수행합니다.
 */

const Converter = (() => {
  let activeCurrency = 'USD';    // 현재 선택된 통화 (기본값: 미국 USD)
  let activeMode = 'cashBuy';     // 현재 선택된 거래 모드 ('cashBuy', 'cashSell', 'wireSend', 'wireReceive', 'baseRate')
  let spreadDiscount = 0;         // 환율 우대율 (0% ~ 100%)
  let lastChangedField = 'krw';   // 마지막으로 사용자가 입력한 입력창 ('krw' 또는 'foreign')

  // DOM 엘리먼트 캐싱
  let krwInput = null;
  let foreignInput = null;
  let krwSpelling = null;
  let foreignSpelling = null;
  let appliedRatePill = null;
  let sumTradeType = null;
  let sumRateComparison = null;
  let sumSavings = null;
  let spreadValueBadge = null;
  let spreadSavingsText = null;

  function init() {
    krwInput = document.getElementById('krwInput');
    foreignInput = document.getElementById('foreignInput');
    krwSpelling = document.getElementById('krwSpelling');
    foreignSpelling = document.getElementById('foreignSpelling');
    appliedRatePill = document.getElementById('appliedRatePill');
    sumTradeType = document.getElementById('sumTradeType');
    sumRateComparison = document.getElementById('sumRateComparison');
    sumSavings = document.getElementById('sumSavings');
    spreadValueBadge = document.getElementById('spreadValueBadge');
    spreadSavingsText = document.getElementById('spreadSavingsText');

    setupEventListeners();
    updateUIForCurrency();
    updateConversion();
  }

  function setupEventListeners() {
    // 1. 통화 선택 탭/칩 클릭 이벤트 (USD, JPY, EUR, CNY, GBP)
    const chips = document.querySelectorAll('#currencyChips .chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-selected', 'false');
        });
        chip.classList.add('active');
        chip.setAttribute('aria-selected', 'true');
        activeCurrency = chip.dataset.currency;
        
        updateUIForCurrency();
        updateConversion();

        // 우측 시세 차트도 함께 동기화
        if (window.ChartManager) {
          ChartManager.switchCurrency(activeCurrency);
        }
      });
    });

    // 2. 4가지 거래 모드 카드 클릭 이벤트 (현찰 살때/팔때, 송금 보낼때/받을때)
    const modeCards = document.querySelectorAll('#tradeModeGrid .trade-mode-card');
    modeCards.forEach(card => {
      card.addEventListener('click', () => {
        modeCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        activeMode = card.dataset.mode;
        updateConversion();
      });
    });

    // 매매기준율(수수료 0%) 바로 계산 버튼
    const toggleBaseRateBtn = document.getElementById('toggleBaseRateBtn');
    if (toggleBaseRateBtn) {
      toggleBaseRateBtn.addEventListener('click', () => {
        modeCards.forEach(c => c.classList.remove('active'));
        activeMode = 'baseRate';
        updateConversion();
      });
    }

    // 3. 우대율(스프레드 할인) 슬라이더 및 프리셋(30%, 50%, 80%, 90%) 버튼
    const spreadSlider = document.getElementById('spreadSlider');
    const presetBtns = document.querySelectorAll('.spread-preset-btns .preset-btn');

    if (spreadSlider) {
      spreadSlider.addEventListener('input', (e) => {
        setDiscount(parseInt(e.target.value, 10));
      });
    }

    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.val, 10);
        setDiscount(val);
      });
    });

    // 4. 원화(KRW) 금액 입력 리스너
    krwInput.addEventListener('input', (e) => {
      const raw = e.target.value.replace(/[^0-9]/g, '');
      if (raw === '') {
        krwInput.value = '';
        foreignInput.value = '';
        krwSpelling.textContent = '0 원';
        foreignSpelling.textContent = '-';
        return;
      }
      const num = parseInt(raw, 10);
      krwInput.value = num.toLocaleString('ko-KR');
      lastChangedField = 'krw';
      updateConversion();
    });

    // 5. 외화(Foreign) 금액 입력 리스너
    foreignInput.addEventListener('input', (e) => {
      let raw = e.target.value.replace(/[^0-9.]/g, '');
      const parts = raw.split('.');
      if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
      
      foreignInput.value = raw;
      lastChangedField = 'foreign';
      updateConversion();
    });

    // 6. 통화 방향 스왑 버튼 (원화 ⇄ 외화 포커스 전환)
    const swapBtn = document.getElementById('swapDirectionBtn');
    if (swapBtn) {
      swapBtn.addEventListener('click', () => {
        if (lastChangedField === 'krw') {
          lastChangedField = 'foreign';
          foreignInput.focus();
        } else {
          lastChangedField = 'krw';
          krwInput.focus();
        }
        updateConversion();
      });
    }

    // 7. 빠른 금액 추가 버튼 (원화: +10만, +50만, +100만...)
    const quickBtns = document.querySelectorAll('.krw-box .quick-btn[data-add]');
    quickBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const addVal = parseInt(btn.dataset.add, 10);
        const current = parseInt(krwInput.value.replace(/,/g, '') || '0', 10);
        const next = current + addVal;
        krwInput.value = next.toLocaleString('ko-KR');
        lastChangedField = 'krw';
        updateConversion();
      });
    });

    const clearKrwBtn = document.getElementById('clearKrwBtn');
    if (clearKrwBtn) {
      clearKrwBtn.addEventListener('click', () => {
        krwInput.value = '';
        foreignInput.value = '';
        krwSpelling.textContent = '0 원';
        foreignSpelling.textContent = '-';
      });
    }
  }

  function setDiscount(val) {
    spreadDiscount = val;
    const spreadSlider = document.getElementById('spreadSlider');
    if (spreadSlider) spreadSlider.value = val;
    
    if (spreadValueBadge) spreadValueBadge.textContent = `우대 ${val}%`;

    const presetBtns = document.querySelectorAll('.spread-preset-btns .preset-btn');
    presetBtns.forEach(btn => {
      if (parseInt(btn.dataset.val, 10) === val) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    updateConversion();
  }

  /**
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * [UI 갱신] 통화 변경 시 4대 거래 가격 카드 및 단위 표시 갱신
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   */
  function updateUIForCurrency() {
    const cur = RatesManager.getCurrencyInfo(activeCurrency);
    const rates = RatesManager.calculateRates(activeCurrency, spreadDiscount);

    // 국기 & 통화명 레이블
    const flagEl = document.getElementById('foreignFlag');
    const labelEl = document.getElementById('foreignCurrencyLabel');
    const unitEl = document.getElementById('foreignCurrencyUnit');

    if (flagEl) flagEl.textContent = cur.flag;
    if (labelEl) labelEl.textContent = `${cur.name} (${cur.code})`;
    if (unitEl) unitEl.textContent = `${cur.code} (${cur.symbol})`;

    // 외화 빠른 금액 버튼 프리셋 (JPY는 1,000엔 단위, USD는 100달러 단위)
    const fQuickContainer = document.getElementById('foreignQuickAdd');
    if (fQuickContainer) {
      if (cur.code === 'JPY') {
        fQuickContainer.innerHTML = `
          <button class="quick-btn" data-fadd="1000">+1,000</button>
          <button class="quick-btn" data-fadd="5000">+5,000</button>
          <button class="quick-btn" data-fadd="10000">+10,000</button>
          <button class="quick-btn" data-fadd="50000">+50,000</button>
          <button class="quick-btn" data-fadd="100000">+100,000</button>
          <button class="quick-btn clear-btn" id="clearForeignBtn">초기화</button>
        `;
      } else {
        fQuickContainer.innerHTML = `
          <button class="quick-btn" data-fadd="10">+10</button>
          <button class="quick-btn" data-fadd="50">+50</button>
          <button class="quick-btn" data-fadd="100">+100</button>
          <button class="quick-btn" data-fadd="500">+500</button>
          <button class="quick-btn" data-fadd="1000">+1,000</button>
          <button class="quick-btn clear-btn" id="clearForeignBtn">초기화</button>
        `;
      }

      // 새로 생성된 빠른 버튼들에 클릭 이벤트 바인딩
      fQuickContainer.querySelectorAll('.quick-btn[data-fadd]').forEach(btn => {
        btn.addEventListener('click', () => {
          const addVal = parseFloat(btn.dataset.fadd);
          const current = parseFloat(foreignInput.value.replace(/,/g, '') || '0');
          const next = current + addVal;
          foreignInput.value = Number(next.toFixed(2)).toString();
          lastChangedField = 'foreign';
          updateConversion();
        });
      });

      const cBtn = document.getElementById('clearForeignBtn');
      if (cBtn) {
        cBtn.addEventListener('click', () => {
          krwInput.value = '';
          foreignInput.value = '';
          krwSpelling.textContent = '0 원';
          foreignSpelling.textContent = '-';
        });
      }
    }

    // 4가지 모드 카드 내 가격 텍스트 업데이트 (실시간 환율 + 수수료 반영)
    const unitText = cur.unit === 100 ? ' (100엔당)' : '';
    const buyEl = document.getElementById('rateDisplay_cashBuy');
    const sellEl = document.getElementById('rateDisplay_cashSell');
    const wireSendEl = document.getElementById('rateDisplay_wireSend');
    const wireRecvEl = document.getElementById('rateDisplay_wireReceive');

    if (buyEl) buyEl.textContent = `${rates.cashBuy.toFixed(2)} 원${unitText}`;
    if (sellEl) sellEl.textContent = `${rates.cashSell.toFixed(2)} 원${unitText}`;
    if (wireSendEl) wireSendEl.textContent = `${rates.wireSend.toFixed(2)} 원${unitText}`;
    if (wireRecvEl) wireRecvEl.textContent = `${rates.wireReceive.toFixed(2)} 원${unitText}`;

    // 매매기준율 및 전일대비 변동 정보
    const baseRateEl = document.getElementById('baseRateText');
    const changeEl = document.getElementById('rateChangeText');
    if (baseRateEl) baseRateEl.textContent = `${rates.baseRate.toFixed(2)} 원${unitText}`;
    if (changeEl) {
      const sign = rates.change > 0 ? '▲' : rates.change < 0 ? '▼' : '-';
      changeEl.textContent = `${sign} ${Math.abs(rates.change).toFixed(2)} (${rates.changeRate > 0 ? '+' : ''}${rates.changeRate}%)`;
      changeEl.className = rates.change > 0 ? 'change-up' : rates.change < 0 ? 'change-down' : 'change-neutral';
    }
  }

  /**
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * [양방향 환율 변환] 실시간 환율과 수수료율을 반영하여 금액 환산
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   */
  function updateConversion() {
    const cur = RatesManager.getCurrencyInfo(activeCurrency);
    const rates = RatesManager.calculateRates(activeCurrency, spreadDiscount);

    // 현재 선택된 모드의 실제 적용 단가 결정
    let appliedRate = rates.cashBuy;
    let modeName = '현찰 살 때';
    let unitSavings = rates.savingsCashBuy;

    if (activeMode === 'cashSell') {
      appliedRate = rates.cashSell;
      modeName = '현찰 팔 때';
      unitSavings = rates.savingsCashSell;
    } else if (activeMode === 'wireSend') {
      appliedRate = rates.wireSend;
      modeName = '송금 보낼 때';
      unitSavings = rates.savingsWireSend;
    } else if (activeMode === 'wireReceive') {
      appliedRate = rates.wireReceive;
      modeName = '송금 받을 때';
      unitSavings = rates.savingsWireReceive;
    } else if (activeMode === 'baseRate') {
      appliedRate = rates.baseRate;
      modeName = '매매기준율';
      unitSavings = 0;
    }

    // 1외화당 실제 원화 가격 (100엔 단위 등 통화 unit 반영)
    const ratePerUnit = appliedRate / cur.unit;

    // 상단 적용 환율 알림 배지
    if (appliedRatePill) {
      const unitLabel = cur.unit === 100 ? '100' : '1';
      appliedRatePill.innerHTML = `적용 환율: ${unitLabel} ${cur.code} = <strong>${appliedRate.toFixed(2)} 원</strong> (${modeName})`;
    }

    let krwAmount = 0;
    let foreignAmount = 0;

    // 원화를 외화로 변환 or 외화를 원화로 변환
    if (lastChangedField === 'krw') {
      krwAmount = parseFloat(krwInput.value.replace(/,/g, '') || '0');
      if (krwAmount > 0 && ratePerUnit > 0) {
        foreignAmount = krwAmount / ratePerUnit;
        foreignInput.value = foreignAmount.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      } else if (krwInput.value === '') {
        foreignInput.value = '';
      }
    } else {
      foreignAmount = parseFloat(foreignInput.value.replace(/,/g, '') || '0');
      if (foreignAmount > 0 && ratePerUnit > 0) {
        krwAmount = foreignAmount * ratePerUnit;
        krwInput.value = Math.round(krwAmount).toLocaleString('ko-KR');
      } else if (foreignInput.value === '') {
        krwInput.value = '';
      }
    }

    // 한글 금액 표기 (예: "1,250,000원 -> 125만 원")
    if (krwSpelling) {
      krwSpelling.textContent = krwAmount > 0 ? numberToKorean(Math.round(krwAmount)) + ' 원' : '0 원';
    }
    if (foreignSpelling) {
      foreignSpelling.textContent = foreignAmount > 0 
        ? `${foreignAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${cur.code} (${cur.name})`
        : '-';
    }

    // 우대 절약 혜택 금액 산출
    const totalSavingsWon = Math.round(foreignAmount * (unitSavings / cur.unit));
    
    if (sumTradeType) {
      sumTradeType.textContent = `${modeName} (${cur.name} ${cur.unit === 100 ? '100단위' : '1단위'})`;
    }
    if (sumRateComparison) {
      sumRateComparison.textContent = `기준 ${rates.baseRate.toFixed(2)}원 ➔ 적용 ${appliedRate.toFixed(2)}원 (우대 ${spreadDiscount}%)`;
    }
    if (sumSavings) {
      if (spreadDiscount > 0 && totalSavingsWon > 0) {
        sumSavings.textContent = `약 ${totalSavingsWon.toLocaleString('ko-KR')} 원 절약! (우대율 ${spreadDiscount}%)`;
        sumSavings.className = 'val positive';
      } else {
        sumSavings.textContent = spreadDiscount > 0 ? `우대율 ${spreadDiscount}% 적용 중` : `우대율 0% (기본 고시 환율 적용)`;
        sumSavings.className = 'val';
      }
    }

    if (spreadSavingsText) {
      if (spreadDiscount > 0 && totalSavingsWon > 0) {
        spreadSavingsText.innerHTML = `🎉 우대율 <strong>${spreadDiscount}%</strong> 적용으로 일반 고시 대비 <strong>약 ${totalSavingsWon.toLocaleString('ko-KR')}원</strong>을 아꼈습니다!`;
      } else {
        spreadSavingsText.textContent = `우대율 슬라이더나 버튼(50%, 80%, 90%)을 눌러 수수료 절감 효과를 확인하세요.`;
      }
    }
  }

  /**
   * 한국어 숫자 단위 변환 (억, 만, 원 등)
   */
  function numberToKorean(number) {
    if (isNaN(number) || number === 0) return '0';
    const units = ['', '만', '억', '조', '경'];
    let result = '';
    let temp = Math.floor(number);
    let unitIdx = 0;

    while (temp > 0) {
      const part = temp % 10000;
      if (part > 0) {
        const partStr = part.toLocaleString('ko-KR');
        result = `${partStr}${units[unitIdx]} ` + result;
      }
      temp = Math.floor(temp / 10000);
      unitIdx++;
    }

    return result.trim();
  }

  return {
    init,
    setForeignCurrency: (code) => {
      activeCurrency = code;
      const chip = document.querySelector(`#currencyChips .chip[data-currency="${code}"]`);
      if (chip) chip.click();
    },
    setKrwAmount: (val) => {
      if (krwInput) {
        krwInput.value = Math.round(val).toLocaleString('ko-KR');
        lastChangedField = 'krw';
        updateConversion();
      }
    },
    setForeignAmount: (val) => {
      if (foreignInput) {
        foreignInput.value = Number(val.toFixed(2)).toString();
        lastChangedField = 'foreign';
        updateConversion();
      }
    },
    refresh: () => {
      updateUIForCurrency();
      updateConversion();
    }
  };
})();
