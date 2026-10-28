/**
 * chart.js
 * 외화 시세 대시보드, 상단 티커, Chart.js 기반 트렌드 그래프, 4대 거래 기준표 관리
 */

const ChartManager = (() => {
  let chartInstance = null;
  let activeCurrency = 'USD';
  let activePeriod = '7d';

  function init() {
    setupPeriodTabs();
    renderMarketCards();
    renderAllRatesTable();
    renderTicker();
    renderChart();
  }

  function setupPeriodTabs() {
    const tabs = document.querySelectorAll('#chartPeriodTabs .period-btn');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activePeriod = btn.dataset.period;
        renderChart();
      });
    });
  }

  /**
   * 상단 실시간 시세 티커 렌더링
   */
  function renderTicker() {
    const tickerContainer = document.getElementById('currencyTicker');
    if (!tickerContainer) return;

    const all = RatesManager.getAllCurrencies();
    const codes = Object.keys(all);

    tickerContainer.innerHTML = codes.map(code => {
      const cur = all[code];
      const isPositive = cur.change > 0;
      const isNegative = cur.change < 0;
      const changeClass = isPositive ? 'up' : isNegative ? 'down' : 'neutral';
      const arrow = isPositive ? '▲' : isNegative ? '▼' : '-';
      const unitText = cur.unit === 100 ? ' (100엔)' : '';

      return `
        <div class="ticker-card ${code === activeCurrency ? 'active' : ''}" data-currency="${code}">
          <span class="ticker-flag">${cur.flag}</span>
          <div class="ticker-info">
            <span class="ticker-code">${cur.code}${unitText}</span>
            <span class="ticker-rate">${cur.baseRate.toFixed(2)} 원</span>
            <span class="ticker-change ${changeClass}">
              ${arrow} ${Math.abs(cur.change).toFixed(2)} (${isPositive ? '+' : ''}${cur.changeRate}%)
            </span>
          </div>
        </div>
      `;
    }).join('');

    // 티커 클릭 시 해당 통화로 전환
    tickerContainer.querySelectorAll('.ticker-card').forEach(card => {
      card.addEventListener('click', () => {
        const code = card.dataset.currency;
        if (window.Converter) {
          Converter.setForeignCurrency(code);
        }
      });
    });
  }

  /**
   * 시세 탭 내 요약 카드 그리드 렌더링
   */
  function renderMarketCards() {
    const listEl = document.getElementById('marketCardsList');
    if (!listEl) return;

    const all = RatesManager.getAllCurrencies();
    const codes = ['USD', 'JPY', 'EUR', 'CNY'];

    listEl.innerHTML = codes.map(code => {
      const cur = all[code] || all.USD;
      const isPositive = cur.change > 0;
      const isNegative = cur.change < 0;
      const changeClass = isPositive ? 'change-up' : isNegative ? 'change-down' : 'change-neutral';
      const arrow = isPositive ? '▲' : isNegative ? '▼' : '-';
      const unitText = cur.unit === 100 ? ' (100엔)' : '';

      return `
        <div class="market-summary-card" data-currency="${code}">
          <div class="market-card-top">
            <div class="market-currency-title">
              <span>${cur.flag}</span>
              <span>${cur.name}${unitText}</span>
            </div>
            <span class="market-card-change ${changeClass}">
              ${arrow} ${Math.abs(cur.change).toFixed(2)}
            </span>
          </div>
          <div class="market-card-rate">${cur.baseRate.toFixed(2)} 원</div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.market-summary-card').forEach(card => {
      card.addEventListener('click', () => {
        const code = card.dataset.currency;
        switchCurrency(code);
        if (window.Converter) {
          Converter.setForeignCurrency(code);
        }
      });
    });
  }

  /**
   * 전 통화 4대 거래 기준가 비교 테이블 렌더링
   */
  function renderAllRatesTable() {
    const tbody = document.getElementById('ratesTableBody');
    if (!tbody) return;

    const all = RatesManager.getAllCurrencies();
    const codes = Object.keys(all);

    tbody.innerHTML = codes.map(code => {
      const cur = all[code];
      const rates = RatesManager.calculateRates(code, 0); // 기본 고시 기준 0%
      const unitText = cur.unit === 100 ? ' (100엔)' : '';

      return `
        <tr>
          <td><strong>${cur.flag} ${cur.name}</strong> <small style="color:var(--text-muted)">(${cur.code}${unitText})</small></td>
          <td style="color:var(--primary); font-weight:800;">${rates.baseRate.toFixed(2)}</td>
          <td style="color:var(--tag-buy-text);">${rates.cashBuy.toFixed(2)}</td>
          <td style="color:var(--tag-sell-text);">${rates.cashSell.toFixed(2)}</td>
          <td style="color:var(--tag-wire-text);">${rates.wireSend.toFixed(2)}</td>
          <td style="color:var(--tag-recv-text);">${rates.wireReceive.toFixed(2)}</td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Chart.js 트렌드 그래프 렌더링
   */
  function renderChart() {
    const canvas = document.getElementById('rateTrendChart');
    if (!canvas) return;

    const trendData = RatesManager.getHistoricalTrend(activeCurrency, activePeriod);
    const titleEl = document.getElementById('chartCurrencyTitle');
    if (titleEl) {
      const unitText = trendData.currency.unit === 100 ? ' (100엔)' : '';
      titleEl.textContent = `${trendData.currency.flag} ${trendData.currency.name}${unitText} 환율 동향`;
    }

    const isDarkMode = document.body.classList.contains('dark-theme');
    const primaryColor = isDarkMode ? '#3B82F6' : '#2563EB';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDarkMode ? '#94A3B8' : '#64748B';

    if (chartInstance) {
      chartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, isDarkMode ? 'rgba(59, 130, 246, 0.35)' : 'rgba(37, 99, 235, 0.25)');
    gradient.addColorStop(1, isDarkMode ? 'rgba(59, 130, 246, 0.0)' : 'rgba(37, 99, 235, 0.0)');

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trendData.labels,
        datasets: [{
          label: `${trendData.currency.code} 매매기준율 (KRW)`,
          data: trendData.data,
          borderColor: primaryColor,
          borderWidth: 2.5,
          backgroundColor: gradient,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: primaryColor
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDarkMode ? '#1E293B' : '#0F172A',
            titleColor: '#FFFFFF',
            bodyColor: '#FFFFFF',
            padding: 10,
            displayColors: false,
            callbacks: {
              label: (context) => `매매기준율: ${context.parsed.y.toLocaleString()} 원`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { family: 'Pretendard', size: 11 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: 'JetBrains Mono', size: 11 },
              callback: (value) => value.toLocaleString()
            }
          }
        }
      }
    });
  }

  function switchCurrency(code) {
    activeCurrency = code;
    renderTicker();
    renderChart();
  }

  function updateTheme() {
    renderChart();
  }

  function refreshAll() {
    renderTicker();
    renderMarketCards();
    renderAllRatesTable();
    renderChart();
  }

  return {
    init,
    switchCurrency,
    updateTheme,
    refreshAll
  };
})();
