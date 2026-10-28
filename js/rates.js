/**
 * ==============================================================================
 * rates.js - 실시간 환율 데이터 수집 및 4대 거래 기준가(수수료) 자동 연산 모듈
 * ==============================================================================
 * 
 * [발표 및 코드 설명 포인트]
 * 1. 복잡한 API Key 발급이나 백엔드 서버 설정 없이, 브라우저 표준 fetch()로 누구나
 *    무료로 사용할 수 있는 공개 환율 API(Open Exchange Rates Free Endpoint)를 사용합니다.
 * 2. 인터넷에서 받아온 '매매기준율(USD/KRW 등)'을 바탕으로, 시중은행의 실무 수수료율을
 *    적용하여 [현찰 살 때 / 현찰 팔 때 / 송금 보낼 때 / 송금 받을 때] 4가지 가격을 자동 계산합니다.
 * 3. 환율 우대율(스프레드 할인 0% ~ 100%)까지 정밀하게 시뮬레이션할 수 있습니다.
 */

const RatesManager = (() => {
  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * [1] 주요 통화별 기본 데이터 및 시중은행 표준 수수료율(스프레드) 설정
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * - baseRate: 실시간 API를 불러오기 전/실패 시 사용할 현실적인 기준 환율 (Fallback)
   * - cashSpread: 현찰 수수료율 (주요 통화는 약 1.75% ~ 1.97%, 기타 통화는 약 5%)
   * - wireSpread: 전신환(송금) 수수료율 (약 0.98% ~ 1.00%)
   * - unit: 100엔처럼 100단위로 고시되는 통화 구분 (1 또는 100)
   */
  const CURRENCIES = {
    USD: {
      code: 'USD',
      name: '미국 달러',
      symbol: '$',
      flag: '🇺🇸',
      baseRate: 1385.50, // 매매기준율 (API로 실시간 갱신됨)
      change: 3.50,      // 전일 대비 변동폭
      changeRate: 0.25,  // 전일 대비 등락률 (%)
      cashSpread: 0.0175, // 현찰 수수료 1.75% (시중은행 평균)
      wireSpread: 0.0098, // 송금 수수료 0.98% (시중은행 평균)
      unit: 1,
      decimals: 2
    },
    JPY: {
      code: 'JPY',
      name: '일본 엔',
      symbol: '¥',
      flag: '🇯🇵',
      baseRate: 915.20,  // 100엔당 원화 기준
      change: -2.10,
      changeRate: -0.23,
      cashSpread: 0.0175, // 현찰 수수료 1.75%
      wireSpread: 0.0098, // 송금 수수료 0.98%
      unit: 100,         // 100엔 단위
      decimals: 2
    },
    EUR: {
      code: 'EUR',
      name: '유럽 유로',
      symbol: '€',
      flag: '🇪🇺',
      baseRate: 1498.40,
      change: 4.20,
      changeRate: 0.28,
      cashSpread: 0.0197, // 현찰 수수료 1.97%
      wireSpread: 0.0100, // 송금 수수료 1.00%
      unit: 1,
      decimals: 2
    },
    CNY: {
      code: 'CNY',
      name: '중국 위안',
      symbol: '¥',
      flag: '🇨🇳',
      baseRate: 191.80,
      change: -0.40,
      changeRate: -0.21,
      cashSpread: 0.0500, // 중국 위안 현찰 수수료 약 5.0%
      wireSpread: 0.0100, // 송금 수수료 1.00%
      unit: 1,
      decimals: 2
    },
    GBP: {
      code: 'GBP',
      name: '영국 파운드',
      symbol: '£',
      flag: '🇬🇧',
      baseRate: 1775.60,
      change: 6.80,
      changeRate: 0.39,
      cashSpread: 0.0197, // 현찰 수수료 1.97%
      wireSpread: 0.0098, // 송금 수수료 0.98%
      unit: 1,
      decimals: 2
    }
  };

  // 내부 상태 보관 (실시간 환율, 마지막 갱신 시각, 연결 상태 등)
  let ratesState = JSON.parse(JSON.stringify(CURRENCIES));
  let lastUpdated = new Date();
  let isLive = false;
  let isLoading = false;

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * [2] 무료 공개 환율 API 호출 함수 (fetch)
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 💡 발표 설명:
   * "인증키(API Key) 발급이나 백엔드 서버 없이도 브라우저에서 바로 무료로
   *  호출할 수 있는 오픈 환율 API(open.er-api.com)를 사용했습니다."
   * 
   * 동작 원리:
   * 1. 1 USD 기준 각국 통화(KRW, JPY, EUR, CNY, GBP 등)의 실시간 환율을 받습니다.
   * 2. 교차 환율(Cross Rate) 계산을 통해 '1 외화 = 몇 원(KRW)'인지 원화 매매기준율을 도출합니다.
   *    - 예) USD/KRW = 환율값 그대로
   *    - 예) JPY/KRW (100엔당) = (KRW / JPY) * 100
   *    - 예) EUR/KRW = KRW / EUR
   * 3. 통신 에러 발생 시에도 웹사이트가 멈추지 않도록 안전한 기본값(Fallback)을 유지합니다.
   */
  async function fetchLiveRates() {
    isLoading = true;
    try {
      // 🌐 인터넷 무료 공개 환율 API 주소 (별도 가입/API키 불필요)
      const apiUrl = 'https://open.er-api.com/v6/latest/USD';
      
      console.log('📡 [RatesManager] 인터넷 무료 공개 API에서 실시간 환율을 불러오는 중...', apiUrl);

      const response = await fetch(apiUrl, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`HTTP 에러 발생: 상태코드 ${response.status}`);
      }

      const data = await response.json();

      // 유효한 환율 데이터가 들어왔는지 확인
      if (data && data.rates && data.rates.KRW) {
        const usdKrw = data.rates.KRW; // 1 달러당 원화 가격
        
        // 1) 미국 달러 (USD)
        ratesState.USD.baseRate = Number(usdKrw.toFixed(2));

        // 2) 일본 엔화 (JPY: 100엔 기준 원화)
        if (data.rates.JPY) {
          ratesState.JPY.baseRate = Number(((usdKrw / data.rates.JPY) * 100).toFixed(2));
        }

        // 3) 유럽 유로 (EUR)
        if (data.rates.EUR) {
          ratesState.EUR.baseRate = Number((usdKrw / data.rates.EUR).toFixed(2));
        }

        // 4) 중국 위안 (CNY)
        if (data.rates.CNY) {
          ratesState.CNY.baseRate = Number((usdKrw / data.rates.CNY).toFixed(2));
        }

        // 5) 영국 파운드 (GBP)
        if (data.rates.GBP) {
          ratesState.GBP.baseRate = Number((usdKrw / data.rates.GBP).toFixed(2));
        }

        isLive = true;
        lastUpdated = new Date();
        isLoading = false;

        console.log('✅ [RatesManager] 실시간 환율 데이터 갱신 완료:', {
          USD: ratesState.USD.baseRate,
          JPY_100: ratesState.JPY.baseRate,
          EUR: ratesState.EUR.baseRate,
          CNY: ratesState.CNY.baseRate,
          GBP: ratesState.GBP.baseRate,
          updatedAt: lastUpdated.toLocaleTimeString()
        });

        return { success: true, isLive: true, data: ratesState };
      } else {
        throw new Error('응답 데이터에 KRW 환율 정보가 없습니다.');
      }
    } catch (error) {
      console.warn('⚠️ [RatesManager] 실시간 환율 API 호출 실패, 표준 기준 환율을 유지합니다:', error.message);
      isLive = false;
      isLoading = false;
      lastUpdated = new Date();
      return { success: false, isLive: false, error: error.message };
    }
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * [3] 4대 거래 방식 자동 계산 함수 (수수료 및 우대율 반영)
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 💡 발표 설명:
   * "인터넷에서 가져온 '매매기준율'에 은행의 수수료율(스프레드)을 계산하여
   *  실제 소비자가 거래하는 4가지 가격을 자동으로 산출합니다."
   * 
   * [계산 공식]:
   *  1. 현찰 살 때 (Cash Buy)       = 기준환율 + (기준환율 × 현찰수수료율 × (1 - 우대율))
   *  2. 현찰 팔 때 (Cash Sell)      = 기준환율 - (기준환율 × 현찰수수료율 × (1 - 우대율))
   *  3. 송금 보낼 때 (Wire Send)     = 기준환율 + (기준환율 × 송금수수료율 × (1 - 우대율))
   *  4. 송금 받을 때 (Wire Receive)  = 기준환율 - (기준환율 × 송금수수료율 × (1 - 우대율))
   * 
   *  * 우대율(discount%): 0%면 수수료 전액 부담, 90%면 수수료의 10%만 부담, 100%면 수수료 0원
   */
  function calculateRates(currencyCode, discount = 0) {
    const item = ratesState[currencyCode] || ratesState.USD;
    const base = item.baseRate; // 인터넷에서 불러온 매매기준율
    
    // 우대율 범위 정규화 (0% ~ 100% -> 0.0 ~ 1.0)
    const discRatio = Math.min(100, Math.max(0, discount)) / 100;
    const feeRatio = 1 - discRatio; // 우대 후 실제 고객이 내야 하는 수수료 비율

    // (A) 현찰 수수료 원화 금액 = 기준환율 * 현찰수수료율
    const cashFeeWon = base * item.cashSpread;
    // (B) 송금 수수료 원화 금액 = 기준환율 * 송금수수료율
    const wireFeeWon = base * item.wireSpread;

    // 1. 현찰 살 때 (소비자가 은행에서 외화 지폐를 살 때: 기준환율보다 비쌈)
    const cashBuy = base + (cashFeeWon * feeRatio);

    // 2. 현찰 팔 때 (소비자가 은행에 외화 지폐를 팔 때: 기준환율보다 싸게 받음)
    const cashSell = base - (cashFeeWon * feeRatio);

    // 3. 송금 보낼 때 (해외로 전신환 송금 보낼 때: 전신환 매도율)
    const wireSend = base + (wireFeeWon * feeRatio);

    // 4. 송금 받을 때 (해외에서 국내로 송금 받을 때: 전신환 매수율)
    const wireReceive = base - (wireFeeWon * feeRatio);

    return {
      code: item.code,
      name: item.name,
      symbol: item.symbol,
      flag: item.flag,
      unit: item.unit,
      baseRate: base,
      change: item.change,
      changeRate: item.changeRate,
      
      // 우대율 0% 기준 원래 고시 환율 (비교용)
      rawCashBuy: base + cashFeeWon,
      rawCashSell: base - cashFeeWon,
      rawWireSend: base + wireFeeWon,
      rawWireReceive: base - wireFeeWon,

      // 우대율이 최종 적용된 실제 거래 환율
      cashBuy: Number(cashBuy.toFixed(2)),
      cashSell: Number(cashSell.toFixed(2)),
      wireSend: Number(wireSend.toFixed(2)),
      wireReceive: Number(wireReceive.toFixed(2)),

      // 우대율로 인해 절약된 수수료 금액 (1단위 또는 100엔 단위당)
      savingsCashBuy: Number((cashFeeWon * discRatio).toFixed(2)),
      savingsCashSell: Number((cashFeeWon * discRatio).toFixed(2)),
      savingsWireSend: Number((wireFeeWon * discRatio).toFixed(2)),
      savingsWireReceive: Number((wireFeeWon * discRatio).toFixed(2))
    };
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * [4] 과거 추세 트렌드 데이터 생성기 (차트 렌더링용)
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   */
  function getHistoricalTrend(currencyCode, period = '7d') {
    const item = ratesState[currencyCode] || ratesState.USD;
    const base = item.baseRate;
    let days = 7;
    if (period === '1m') days = 30;
    if (period === '3m') days = 90;

    const labels = [];
    const data = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
      labels.push(dateStr);

      // 자연스러운 시계열 변동 생성
      const progress = (days - i) / days;
      const wave = Math.sin(progress * Math.PI * 2.5) * (base * 0.012);
      const randomNoise = (Math.random() - 0.5) * (base * 0.004);
      const historicalVal = Number((base - (days - 1 - i) * (item.change / days) + wave + randomNoise).toFixed(2));
      data.push(historicalVal);
    }
    // 마지막 날짜(오늘)는 실시간 baseRate와 정확히 일치
    data[data.length - 1] = Number(base.toFixed(2));

    return { labels, data, currency: item };
  }

  // 외부(다른 JS 파일)에서 접근할 수 있는 공개 메서드
  return {
    getAllCurrencies: () => ratesState,
    getCurrencyInfo: (code) => ratesState[code] || ratesState.USD,
    calculateRates,
    fetchLiveRates,
    getHistoricalTrend,
    getLastUpdatedTime: () => lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    isLiveConnected: () => isLive,
    isLoading: () => isLoading
  };
})();
