/**
 * calculator.js
 * 
 * [공학용 계산기 4단계 핵심 알고리즘 아키텍처]
 * 1. 어휘 분석 및 파싱 (Lexical Analysis & Parsing / Tokenizer)
 * 2. 중위 표기법 -> 후위 표기법 변환 (Shunting-yard Algorithm)
 * 3. 스택 기반 연산 평가 (Stack-based RPN Evaluator)
 * 4. 초월함수 및 수치해석 엔진 (Taylor Series & Newton-Raphson Solver)
 */

/* ==========================================================================
   1. 초월함수 및 수치 해석 엔진 (Taylor Series & Numerical Methods)
   ========================================================================== */
const NumericalEngine = (() => {
  const PI = 3.14159265358979323846;
  const E  = 2.71828182845904523536;
  const LN2 = 0.693147180559945309417;
  const LN10 = 2.30258509299404568402;

  /**
   * 팩토리얼 계산 (테일러 급수 계수용)
   */
  function factorial(n) {
    if (n < 0) return NaN;
    if (n === 0 || n === 1) return 1;
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
  }

  /**
   * 테일러 급수 기반 사인 sin(x) 계산
   * sin(x) = x - x^3/3! + x^5/5! - x^7/7! + ...
   * 주기 축소: x mod 2π -> [-π, π]
   */
  function taylorSin(rad, maxTerms = 14) {
    // 1. 주기 축소 [-PI, PI]
    let x = rad % (2 * PI);
    if (x > PI) x -= 2 * PI;
    if (x < -PI) x += 2 * PI;

    // 특수각 대칭성 최적화 [-PI/2, PI/2]
    if (x > PI / 2) x = PI - x;
    else if (x < -PI / 2) x = -PI - x;

    let sum = 0;
    let term = x; // n=0 일 때 첫 번째 항
    const x2 = x * x;

    for (let n = 1; n <= maxTerms; n++) {
      sum += term;
      // 다음 항: term * (-x^2) / ((2n)*(2n+1))
      term = -term * x2 / ((2 * n) * (2 * n + 1));
      if (Math.abs(term) < 1e-17) break;
    }
    return sum;
  }

  /**
   * 테일러 급수 기반 코사인 cos(x) 계산
   * cos(x) = 1 - x^2/2! + x^4/4! - x^6/6! + ...
   */
  function taylorCos(rad, maxTerms = 14) {
    let x = rad % (2 * PI);
    if (x > PI) x -= 2 * PI;
    if (x < -PI) x += 2 * PI;

    let sign = 1;
    if (x > PI / 2) {
      x = PI - x;
      sign = -1;
    } else if (x < -PI / 2) {
      x = -PI - x;
      sign = -1;
    }

    let sum = 0;
    let term = 1; // n=0 일 때 첫 번째 항
    const x2 = x * x;

    for (let n = 1; n <= maxTerms; n++) {
      sum += term;
      term = -term * x2 / ((2 * n - 1) * (2 * n));
      if (Math.abs(term) < 1e-17) break;
    }
    return sign * sum;
  }

  /**
   * 탄젠트 tan(x) = sin(x) / cos(x)
   */
  function taylorTan(rad) {
    const cosVal = taylorCos(rad);
    if (Math.abs(cosVal) < 1e-15) {
      return Infinity;
    }
    return taylorSin(rad) / cosVal;
  }

  /**
   * 테일러 급수 기반 지수함수 exp(x) = e^x
   * e^x = 1 + x + x^2/2! + x^3/3! + ...
   * 범위 축소: x = k * ln(2) + r (r in [-ln2/2, ln2/2])
   */
  function taylorExp(x, maxTerms = 20) {
    if (x === 0) return 1;
    if (x < -700) return 0;
    if (x > 700) return Infinity;

    const k = Math.round(x / LN2);
    const r = x - k * LN2;

    let sum = 0;
    let term = 1;
    for (let n = 1; n <= maxTerms; n++) {
      sum += term;
      term = term * r / n;
      if (Math.abs(term) < 1e-17) break;
    }
    // 2^k * exp(r)
    return Math.pow(2, k) * sum;
  }

  /**
   * 테일러 급수 기반 자연로그 ln(x)
   * x = m * 2^k (1 <= m < 2)
   * ln(m) = 2 * sum [ 1/(2n+1) * ((m-1)/(m+1))^(2n+1) ]
   */
  function taylorLn(x, maxTerms = 24) {
    if (x <= 0) return NaN;
    if (x === 1) return 0;

    // x = m * 2^k 정규화
    let k = 0;
    let m = x;
    while (m >= 2.0) {
      m /= 2.0;
      k++;
    }
    while (m < 1.0) {
      m *= 2.0;
      k--;
    }

    const z = (m - 1) / (m + 1);
    const z2 = z * z;
    let sum = 0;
    let num = z;

    for (let n = 0; n < maxTerms; n++) {
      const term = num / (2 * n + 1);
      sum += term;
      num *= z2;
      if (Math.abs(term) < 1e-17) break;
    }

    return k * LN2 + 2 * sum;
  }

  /**
   * 상용로그 log10(x) = ln(x) / ln(10)
   */
  function taylorLog10(x) {
    return taylorLn(x) / LN10;
  }

  /**
   * 뉴턴-라프슨 (Newton-Raphson) 제곱근 sqrt(x)
   * x_{n+1} = 0.5 * (x_n + S / x_n)
   */
  function newtonSqrt(x) {
    if (x < 0) return NaN;
    if (x === 0) return 0;
    let guess = x > 1 ? x / 2 : 1;
    for (let i = 0; i < 30; i++) {
      const next = 0.5 * (guess + x / guess);
      if (Math.abs(next - guess) < 1e-15) {
        return next;
      }
      guess = next;
    }
    return guess;
  }

  /**
   * 뉴턴-라프슨 (Newton-Raphson) 방정식 실근 Solver: f(x) = 0
   * x_{n+1} = x_n - f(x_n) / f'(x_n)
   * 수치 미분: f'(x) = (f(x+h) - f(x-h)) / (2h)
   */
  function solveNewtonRaphson(evalFn, initialGuess = 1.0, tolerance = 1e-10, maxIter = 60) {
    const h = 1e-7;
    let x = initialGuess;
    const history = [];

    for (let iter = 1; iter <= maxIter; iter++) {
      const fx = evalFn(x);
      if (isNaN(fx) || !isFinite(fx)) {
        return {
          success: false,
          error: `반복 ${iter}회차에서 f(x)가 정의되지 않는 영역에 도달했습니다.`,
          history
        };
      }

      history.push({
        iter,
        x,
        fx,
        error: Math.abs(fx)
      });

      if (Math.abs(fx) <= tolerance) {
        return {
          success: true,
          root: x,
          iterations: iter,
          history
        };
      }

      // 수치 미분 (중앙 차분)
      const fPlus = evalFn(x + h);
      const fMinus = evalFn(x - h);
      const fPrime = (fPlus - fMinus) / (2 * h);

      if (Math.abs(fPrime) < 1e-14) {
        // 미분값이 0에 가까워 접선 기울기 수렴 실패 시 작은 섭동(perturbation) 부여
        x += 0.01;
        continue;
      }

      const nextX = x - fx / fPrime;

      if (Math.abs(nextX - x) <= tolerance && Math.abs(evalFn(nextX)) <= tolerance * 10) {
        history.push({
          iter: iter + 1,
          x: nextX,
          fx: evalFn(nextX),
          error: Math.abs(evalFn(nextX))
        });
        return {
          success: true,
          root: nextX,
          iterations: iter + 1,
          history
        };
      }

      x = nextX;
    }

    return {
      success: false,
      error: `최대 반복 횟수(${maxIter}회) 내에 수렴하지 못했습니다. 초기값을 변경해보세요.`,
      approxRoot: x,
      history
    };
  }

  return {
    PI,
    E,
    factorial,
    sin: taylorSin,
    cos: taylorCos,
    tan: taylorTan,
    exp: taylorExp,
    ln: taylorLn,
    log10: taylorLog10,
    sqrt: newtonSqrt,
    solveNewtonRaphson
  };
})();


/* ==========================================================================
   2. 어휘 분석기 (Lexical Analysis & Tokenizer)
   ========================================================================== */
const Lexer = (() => {
  const TokenType = {
    NUMBER:   'NUMBER',
    OPERATOR: 'OPERATOR',
    FUNCTION: 'FUNCTION',
    LPAREN:   'LPAREN',
    RPAREN:   'RPAREN',
    COMMA:    'COMMA',
    CONSTANT: 'CONSTANT',
    VARIABLE: 'VARIABLE'
  };

  const KNOWN_FUNCS = new Set([
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
    'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp',
    'sqrt', 'cbrt', 'sqr', 'fact', 'abs', 'inv', 'neg'
  ]);

  const KNOWN_CONSTS = {
    'pi': NumericalEngine.PI,
    'π':  NumericalEngine.PI,
    'e':  NumericalEngine.E
  };

  /**
   * 문자열 수식을 구조화된 토큰 리스트로 분리
   */
  function tokenize(inputStr) {
    if (!inputStr || typeof inputStr !== 'string') return [];

    // 전처리: 기호 표준화
    let str = inputStr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/,/g, '') // 천단위 구분 쉼표 제거
      .trim();

    const rawTokens = [];
    let i = 0;
    const len = str.length;

    while (i < len) {
      const ch = str[i];

      // 공백 무시
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // 1. 숫자 (정수, 소수점, 지수 표기법 e.g. 1.23, 1e-5)
      if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < len && /[0-9]/.test(str[i + 1]))) {
        let numStr = '';
        while (i < len && /[0-9.]/.test(str[i])) {
          numStr += str[i];
          i++;
        }
        // 과학적 표기법 지원 (e.g. 1e+5, 2e-3)
        if (i < len && (str[i] === 'e' || str[i] === 'E') && i + 1 < len && /[0-9+-]/.test(str[i + 1])) {
          numStr += str[i];
          i++;
          if (str[i] === '+' || str[i] === '-') {
            numStr += str[i];
            i++;
          }
          while (i < len && /[0-9]/.test(str[i])) {
            numStr += str[i];
            i++;
          }
        }
        rawTokens.push({ type: TokenType.NUMBER, value: parseFloat(numStr), raw: numStr });
        continue;
      }

      // 2. 괄호
      if (ch === '(') {
        rawTokens.push({ type: TokenType.LPAREN, value: '(', raw: '(' });
        i++;
        continue;
      }
      if (ch === ')') {
        rawTokens.push({ type: TokenType.RPAREN, value: ')', raw: ')' });
        i++;
        continue;
      }

      // 3. 쉼표 (다중 인자 함수용)
      if (ch === ',') {
        rawTokens.push({ type: TokenType.COMMA, value: ',', raw: ',' });
        i++;
        continue;
      }

      // 4. 단일 기호 루트 (√)
      if (ch === '√') {
        rawTokens.push({ type: TokenType.FUNCTION, value: 'sqrt', raw: '√' });
        i++;
        continue;
      }

      // 5. 연산자 (+, -, *, /, ^, %)
      if (['+', '-', '*', '/', '^', '%'].includes(ch)) {
        rawTokens.push({ type: TokenType.OPERATOR, value: ch, raw: ch });
        i++;
        continue;
      }

      // 6. 식별자 (함수명, 상수, 변수 x)
      if (/[a-zA-Zπ]/.test(ch)) {
        let ident = '';
        while (i < len && /[a-zA-Z0-9_π]/.test(str[i])) {
          ident += str[i];
          i++;
        }

        const lower = ident.toLowerCase();
        if (KNOWN_CONSTS[lower] !== undefined || KNOWN_CONSTS[ident] !== undefined) {
          rawTokens.push({
            type: TokenType.CONSTANT,
            value: KNOWN_CONSTS[lower] !== undefined ? KNOWN_CONSTS[lower] : KNOWN_CONSTS[ident],
            raw: ident
          });
        } else if (KNOWN_FUNCS.has(lower)) {
          rawTokens.push({ type: TokenType.FUNCTION, value: lower, raw: ident });
        } else if (lower === 'x') {
          rawTokens.push({ type: TokenType.VARIABLE, value: 'x', raw: ident });
        } else {
          // 알 수 없는 식별자는 함수로 가정하거나 에러 처리
          rawTokens.push({ type: TokenType.FUNCTION, value: lower, raw: ident });
        }
        continue;
      }

      // 기타 특수문자
      i++;
    }

    // [어휘 후처리 1] 단항 음수(Unary Minus 'u-') 판별
    // 규칙: 맨 처음 '-' 이거나, 앞선 토큰이 OPERATOR, LPAREN, COMMA 인 경우 뒤의 '-'는 단항 음수
    const refinedTokens = [];
    for (let j = 0; j < rawTokens.length; j++) {
      const token = rawTokens[j];
      if (token.type === TokenType.OPERATOR && token.value === '-') {
        const prev = j > 0 ? rawTokens[j - 1] : null;
        if (!prev || prev.type === TokenType.OPERATOR || prev.type === TokenType.LPAREN || prev.type === TokenType.COMMA) {
          refinedTokens.push({ type: TokenType.OPERATOR, value: 'u-', raw: '(-)' });
          continue;
        }
      }
      refinedTokens.push(token);
    }

    // [어휘 후처리 2] 암시적 곱셈(Implicit Multiplication) 자동 삽입
    // e.g. 2pi -> 2 * pi, 2(3) -> 2 * (3), (2)(3) -> (2) * (3), 3sin(30) -> 3 * sin(30), 2x -> 2 * x
    const finalizedTokens = [];
    for (let k = 0; k < refinedTokens.length; k++) {
      const curr = refinedTokens[k];
      finalizedTokens.push(curr);

      if (k + 1 < refinedTokens.length) {
        const next = refinedTokens[k + 1];
        const needMult =
          (curr.type === TokenType.NUMBER && (next.type === TokenType.LPAREN || next.type === TokenType.FUNCTION || next.type === TokenType.CONSTANT || next.type === TokenType.VARIABLE)) ||
          (curr.type === TokenType.RPAREN && (next.type === TokenType.LPAREN || next.type === TokenType.NUMBER || next.type === TokenType.FUNCTION || next.type === TokenType.CONSTANT || next.type === TokenType.VARIABLE)) ||
          (curr.type === TokenType.CONSTANT && (next.type === TokenType.LPAREN || next.type === TokenType.NUMBER || next.type === TokenType.FUNCTION || next.type === TokenType.VARIABLE)) ||
          (curr.type === TokenType.VARIABLE && (next.type === TokenType.LPAREN || next.type === TokenType.NUMBER || next.type === TokenType.FUNCTION || next.type === TokenType.CONSTANT));

        if (needMult) {
          finalizedTokens.push({ type: TokenType.OPERATOR, value: '*', raw: '*' });
        }
      }
    }

    return finalizedTokens;
  }

  return {
    TokenType,
    tokenize
  };
})();


/* ==========================================================================
   3. Shunting-yard 알고리즘 (중위 표기법 -> 후위 표기법 RPN 변환)
   ========================================================================== */
const ShuntingYard = (() => {
  // 연산자 우선순위(Precedence) 및 결합성(Associativity)
  const OP_INFO = {
    '+':  { prec: 1, assoc: 'L' },
    '-':  { prec: 1, assoc: 'L' },
    '*':  { prec: 2, assoc: 'L' },
    '/':  { prec: 2, assoc: 'L' },
    '%':  { prec: 2, assoc: 'L' },
    'u-': { prec: 3, assoc: 'R' }, // 단항 마이너스
    '^':  { prec: 4, assoc: 'R' }  // 거듭제곱
  };

  /**
   * 중위 표기식 토큰 리스트를 다익스트라 Shunting-yard 알고리즘으로 RPN 리스트로 변환
   */
  function toRPN(tokens) {
    const outputQueue = [];
    const operatorStack = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      switch (token.type) {
        case Lexer.TokenType.NUMBER:
        case Lexer.TokenType.CONSTANT:
        case Lexer.TokenType.VARIABLE:
          outputQueue.push(token);
          break;

        case Lexer.TokenType.FUNCTION:
          operatorStack.push(token);
          break;

        case Lexer.TokenType.COMMA:
          while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type !== Lexer.TokenType.LPAREN) {
            outputQueue.push(operatorStack.pop());
          }
          if (operatorStack.length === 0) {
            throw new Error('함수 인자 구분 쉼표(,)의 괄호 매칭 오류입니다.');
          }
          break;

        case Lexer.TokenType.OPERATOR: {
          const o1 = token;
          const info1 = OP_INFO[o1.value];

          while (operatorStack.length > 0) {
            const top = operatorStack[operatorStack.length - 1];
            if (top.type === Lexer.TokenType.FUNCTION) {
              outputQueue.push(operatorStack.pop());
              continue;
            }
            if (top.type === Lexer.TokenType.OPERATOR) {
              const info2 = OP_INFO[top.value];
              if (
                (info1.assoc === 'L' && info1.prec <= info2.prec) ||
                (info1.assoc === 'R' && info1.prec < info2.prec)
              ) {
                outputQueue.push(operatorStack.pop());
                continue;
              }
            }
            break;
          }
          operatorStack.push(o1);
          break;
        }

        case Lexer.TokenType.LPAREN:
          operatorStack.push(token);
          break;

        case Lexer.TokenType.RPAREN:
          while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type !== Lexer.TokenType.LPAREN) {
            outputQueue.push(operatorStack.pop());
          }
          if (operatorStack.length === 0) {
            throw new Error('닫는 괄호 ) 에 대응하는 여는 괄호가 없습니다.');
          }
          // 여는 괄호 pop
          operatorStack.pop();

          // 괄호 앞이 함수였으면 출력 큐로 이동
          if (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type === Lexer.TokenType.FUNCTION) {
            outputQueue.push(operatorStack.pop());
          }
          break;

        default:
          break;
      }
    }

    // 남아있는 모든 연산자를 출력 큐로 이동
    while (operatorStack.length > 0) {
      const top = operatorStack.pop();
      if (top.type === Lexer.TokenType.LPAREN || top.type === Lexer.TokenType.RPAREN) {
        throw new Error('수식 내 괄호의 짝이 맞지 않습니다.');
      }
      outputQueue.push(top);
    }

    return outputQueue;
  }

  return {
    toRPN
  };
})();


/* ==========================================================================
   4. 스택 기반 연산 평가 엔진 (Stack-based RPN Evaluator)
   ========================================================================== */
const RPNEvaluator = (() => {
  /**
   * RPN 후위 표기 토큰 배열을 스택 자료구조를 통해 평가
   * @param {Array} rpnTokens 후위 표기 토큰 리스트
   * @param {Object} options { angleMode: 'DEG'|'RAD', variables: { x: 5 } }
   * @returns {Object} { result: number, steps: Array }
   */
  function evaluate(rpnTokens, options = {}) {
    const angleMode = options.angleMode || 'DEG';
    const vars = options.variables || {};
    const stack = [];
    const executionTrace = [];

    // 각도 변환 보조함수 (삼각함수 입력용)
    const toRadians = (angle) => {
      if (angleMode === 'DEG') {
        return angle * (NumericalEngine.PI / 180);
      }
      return angle;
    };

    const fromRadians = (rad) => {
      if (angleMode === 'DEG') {
        return rad * (180 / NumericalEngine.PI);
      }
      return rad;
    };

    for (let i = 0; i < rpnTokens.length; i++) {
      const token = rpnTokens[i];

      if (token.type === Lexer.TokenType.NUMBER) {
        stack.push(token.value);
      } else if (token.type === Lexer.TokenType.CONSTANT) {
        stack.push(token.value);
      } else if (token.type === Lexer.TokenType.VARIABLE) {
        const val = vars[token.value];
        if (val === undefined) {
          throw new Error(`변수 '${token.value}'의 값이 정의되지 않았습니다.`);
        }
        stack.push(val);
      } else if (token.type === Lexer.TokenType.OPERATOR) {
        if (token.value === 'u-') {
          if (stack.length < 1) throw new Error('단항 음수 연산자에 필요한 피연산자가 부족합니다.');
          const a = stack.pop();
          const res = -a;
          stack.push(res);
          executionTrace.push({ op: `-${a}`, result: res, stackSnapshot: [...stack] });
        } else {
          if (stack.length < 2) throw new Error(`연산자 '${token.value}'에 필요한 피연산자가 부족합니다.`);
          const b = stack.pop();
          const a = stack.pop();
          let res = 0;

          switch (token.value) {
            case '+': res = a + b; break;
            case '-': res = a - b; break;
            case '*': res = a * b; break;
            case '/':
              if (Math.abs(b) < 1e-15) throw new Error('0으로 나눌 수 없습니다.');
              res = a / b;
              break;
            case '%': res = a % b; break;
            case '^': res = Math.pow(a, b); break;
            default:
              throw new Error(`알 수 없는 연산자: ${token.value}`);
          }
          stack.push(res);
          executionTrace.push({ op: `${a} ${token.value} ${b}`, result: res, stackSnapshot: [...stack] });
        }
      } else if (token.type === Lexer.TokenType.FUNCTION) {
        if (stack.length < 1) throw new Error(`함수 '${token.value}'에 필요한 인자가 부족합니다.`);
        const arg = stack.pop();
        let res = 0;

        switch (token.value) {
          case 'sin': {
            const rad = toRadians(arg);
            // 특수각 보정 (DEG 모드 180도 배수 등)
            if (angleMode === 'DEG' && arg % 180 === 0) res = 0;
            else if (angleMode === 'DEG' && (arg - 90) % 360 === 0) res = 1;
            else if (angleMode === 'DEG' && (arg - 270) % 360 === 0) res = -1;
            else res = NumericalEngine.sin(rad);
            break;
          }
          case 'cos': {
            const rad = toRadians(arg);
            if (angleMode === 'DEG' && (arg - 90) % 180 === 0) res = 0;
            else if (angleMode === 'DEG' && arg % 360 === 0) res = 1;
            else if (angleMode === 'DEG' && (arg - 180) % 360 === 0) res = -1;
            else res = NumericalEngine.cos(rad);
            break;
          }
          case 'tan': {
            const rad = toRadians(arg);
            if (angleMode === 'DEG' && (arg - 90) % 180 === 0) {
              throw new Error(`tan(${arg}°)는 정의되지 않는 무한대(Infinity) 값입니다.`);
            }
            if (angleMode === 'DEG' && arg % 180 === 0) res = 0;
            else res = NumericalEngine.tan(rad);
            break;
          }
          case 'asin': {
            if (arg < -1 || arg > 1) throw new Error('asin 함수의 정의역은 [-1, 1]입니다.');
            res = fromRadians(Math.asin(arg));
            break;
          }
          case 'acos': {
            if (arg < -1 || arg > 1) throw new Error('acos 함수의 정의역은 [-1, 1]입니다.');
            res = fromRadians(Math.acos(arg));
            break;
          }
          case 'atan': {
            res = fromRadians(Math.atan(arg));
            break;
          }
          case 'sinh': res = Math.sinh(arg); break;
          case 'cosh': res = Math.cosh(arg); break;
          case 'tanh': res = Math.tanh(arg); break;
          case 'exp':  res = NumericalEngine.exp(arg); break;
          case 'ln': {
            if (arg <= 0) throw new Error('ln(자연로그)의 진수는 0보다 커야 합니다.');
            res = NumericalEngine.ln(arg);
            break;
          }
          case 'log': {
            if (arg <= 0) throw new Error('log(상용로그)의 진수는 0보다 커야 합니다.');
            res = NumericalEngine.log10(arg);
            break;
          }
          case 'sqrt': {
            if (arg < 0) throw new Error('음수의 제곱근은 실수 범위에서 계산할 수 없습니다.');
            res = NumericalEngine.sqrt(arg);
            break;
          }
          case 'cbrt': res = Math.cbrt(arg); break;
          case 'sqr':  res = arg * arg; break;
          case 'inv':
            if (Math.abs(arg) < 1e-15) throw new Error('0의 역수는 존재하지 않습니다.');
            res = 1 / arg;
            break;
          case 'fact': {
            const n = Math.round(arg);
            if (n < 0 || Math.abs(arg - n) > 1e-10) throw new Error('팩토리얼은 0 이상의 정수만 가능합니다.');
            res = NumericalEngine.factorial(n);
            break;
          }
          case 'abs': res = Math.abs(arg); break;
          case 'neg': res = -arg; break;
          default:
            throw new Error(`지원하지 않는 함수입니다: ${token.value}`);
        }

        stack.push(res);
        executionTrace.push({ op: `${token.value}(${arg})`, result: res, stackSnapshot: [...stack] });
      }
    }

    if (stack.length !== 1) {
      throw new Error('수식의 피연산자와 연산자의 균형이 맞지 않습니다.');
    }

    return {
      result: stack[0],
      steps: executionTrace
    };
  }

  return {
    evaluate
  };
})();


/* ==========================================================================
   5. Calculator 메인 컨트롤러 및 UI 브릿지
   ========================================================================== */
const Calculator = (() => {
  let currentInput = '0';
  let expression = '';
  let history = [];
  let isResultEvaluated = false;
  let angleMode = 'DEG'; // 'DEG' 또는 'RAD'
  let isScientificMode = false;
  let lastAnalysis = null; // 마지막 수식의 4단계 알고리즘 분석 데이터

  // DOM 엘리먼트 참조
  let displayEl = null;
  let historyDisplayEl = null;
  let historyListEl = null;
  let historyCountEl = null;

  function init() {
    displayEl = document.getElementById('calcDisplay');
    historyDisplayEl = document.getElementById('calcHistory');
    historyListEl = document.getElementById('historyList');
    historyCountEl = document.getElementById('historyCount');

    setupKeypadEvents();
    setupSciKeypadEvents();
    setupModeToggleEvents();
    setupKeyboardEvents();
    setupAlgorithmInspectorUI();
    setupNewtonRaphsonModalUI();
    updateDisplay();
  }

  /**
   * 모드 토글 (기본 / 공학용, DEG / RAD)
   */
  function setupModeToggleEvents() {
    const btnBasic = document.getElementById('btnModeBasic');
    const btnSci = document.getElementById('btnModeSci');
    const sciKeypad = document.getElementById('sciKeypad');
    const angleModeSwitch = document.getElementById('angleModeSwitch');
    const btnDeg = document.getElementById('btnAngleDeg');
    const btnRad = document.getElementById('btnAngleRad');
    const inspectorToggleBtn = document.getElementById('btnToggleInspector');

    if (btnBasic && btnSci && sciKeypad) {
      btnBasic.addEventListener('click', () => {
        btnBasic.classList.add('active');
        btnSci.classList.remove('active');
        sciKeypad.style.display = 'none';
        if (angleModeSwitch) angleModeSwitch.style.display = 'none';
        if (inspectorToggleBtn) inspectorToggleBtn.style.display = 'none';
        isScientificMode = false;
      });

      btnSci.addEventListener('click', () => {
        btnSci.classList.add('active');
        btnBasic.classList.remove('active');
        sciKeypad.style.display = 'grid';
        if (angleModeSwitch) angleModeSwitch.style.display = 'flex';
        if (inspectorToggleBtn) inspectorToggleBtn.style.display = 'inline-flex';
        isScientificMode = true;
      });
    }

    if (btnDeg && btnRad) {
      btnDeg.addEventListener('click', () => {
        btnDeg.classList.add('active');
        btnRad.classList.remove('active');
        angleMode = 'DEG';
      });

      btnRad.addEventListener('click', () => {
        btnRad.classList.add('active');
        btnDeg.classList.remove('active');
        angleMode = 'RAD';
      });
    }
  }

  /**
   * 공학용 전용 키패드 이벤트
   */
  function setupSciKeypadEvents() {
    const sciKeypad = document.getElementById('sciKeypad');
    if (!sciKeypad) return;

    sciKeypad.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (!button) return;

      if (button.dataset.func) {
        handleScientificFunction(button.dataset.func);
      } else if (button.dataset.const) {
        handleConstant(button.dataset.const);
      } else if (button.dataset.input) {
        inputRawCharacter(button.dataset.input);
      } else if (button.dataset.op) {
        inputOperator(button.dataset.op);
      } else if (button.dataset.action === 'solve-modal') {
        openNewtonModal();
      }
    });
  }

  /**
   * 기본 키패드 이벤트
   */
  function setupKeypadEvents() {
    const keypad = document.getElementById('calcKeypad');
    if (!keypad) return;

    keypad.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (!button) return;

      if (button.dataset.num !== undefined) {
        inputNumber(button.dataset.num);
      } else if (button.dataset.op !== undefined) {
        inputOperator(button.dataset.op);
      } else if (button.dataset.action) {
        const action = button.dataset.action;
        if (action === 'clear') clearAll();
        if (action === 'backspace') deleteLast();
        if (action === 'percent') inputPercent();
        if (action === 'calculate') calculateResult();
      }
    });

    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        history = [];
        renderHistory();
      });
    }
  }

  /**
   * 키보드 단축키
   */
  function setupKeyboardEvents() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return;
      }

      if ((e.key >= '0' && e.key <= '9') || e.key === '.') {
        inputNumber(e.key);
      } else if (e.key === '+') {
        inputOperator('+');
      } else if (e.key === '-') {
        inputOperator('-');
      } else if (e.key === '*' || e.key === 'x' || e.key === 'X') {
        inputOperator('×');
      } else if (e.key === '/') {
        e.preventDefault();
        inputOperator('÷');
      } else if (e.key === '^') {
        inputOperator('^');
      } else if (e.key === '(' || e.key === ')') {
        inputRawCharacter(e.key);
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        calculateResult();
      } else if (e.key === 'Backspace') {
        deleteLast();
      } else if (e.key === 'Escape') {
        clearAll();
      } else if (e.key === '%') {
        inputPercent();
      }
    });
  }

  function inputNumber(num) {
    if (isResultEvaluated) {
      currentInput = (num === '.') ? '0.' : num;
      expression = '';
      isResultEvaluated = false;
    } else {
      if (num === '.') {
        const lastNumMatch = currentInput.match(/[0-9.]*$/);
        if (lastNumMatch && lastNumMatch[0].includes('.')) return;
        currentInput += '.';
      } else if (num === '00') {
        if (currentInput === '0') return;
        currentInput += '00';
      } else {
        if (currentInput === '0') {
          currentInput = num;
        } else {
          currentInput += num;
        }
      }
    }
    updateDisplay();
  }

  function inputRawCharacter(char) {
    if (isResultEvaluated) {
      expression = '';
      currentInput = char;
      isResultEvaluated = false;
    } else {
      if (currentInput === '0' && char !== ')') {
        currentInput = char;
      } else {
        currentInput += char;
      }
    }
    updateDisplay();
  }

  function inputOperator(op) {
    if (isResultEvaluated) {
      expression = `${currentInput} ${op} `;
      currentInput = '0';
      isResultEvaluated = false;
    } else {
      if (expression.endsWith(' ') && currentInput === '0') {
        expression = expression.slice(0, -3) + ` ${op} `;
      } else {
        expression += `${currentInput} ${op} `;
        currentInput = '0';
      }
    }
    updateDisplay();
  }

  function handleConstant(constType) {
    const symbol = constType === 'pi' ? 'π' : 'e';
    if (isResultEvaluated || currentInput === '0') {
      currentInput = symbol;
      isResultEvaluated = false;
    } else {
      currentInput += symbol;
    }
    updateDisplay();
  }

  function handleScientificFunction(funcName) {
    if (isResultEvaluated) {
      expression = '';
      isResultEvaluated = false;
    }

    if (funcName === 'pow') {
      inputOperator('^');
      return;
    }

    if (funcName === 'sqr') {
      if (currentInput === '0' || currentInput === '') {
        currentInput = 'sqr(';
      } else {
        currentInput = `sqr(${currentInput})`;
      }
      updateDisplay();
      return;
    }

    if (funcName === 'sqrt') {
      if (currentInput === '0' || currentInput === '') {
        currentInput = 'sqrt(';
      } else {
        currentInput = `sqrt(${currentInput})`;
      }
      updateDisplay();
      return;
    }

    const funcPrefixes = {
      sin: 'sin(',
      cos: 'cos(',
      tan: 'tan(',
      log: 'log(',
      ln: 'ln(',
      exp: 'exp(',
      fact: 'fact(',
      inv: 'inv('
    };

    if (funcPrefixes[funcName]) {
      const prefix = funcPrefixes[funcName];
      if (currentInput === '0' || currentInput === '') {
        currentInput = prefix;
      } else if (currentInput.endsWith('(') || currentInput.endsWith('+') || currentInput.endsWith('-') || currentInput.endsWith('*') || currentInput.endsWith('/')) {
        currentInput += prefix;
      } else {
        currentInput = `${prefix}${currentInput})`;
      }
    } else if (funcName === 'neg') {
      if (currentInput.startsWith('-')) {
        currentInput = currentInput.slice(1);
      } else if (currentInput !== '0') {
        currentInput = '-' + currentInput;
      }
    }
    updateDisplay();
  }

  function inputPercent() {
    const val = parseFloat(currentInput);
    if (!isNaN(val)) {
      currentInput = (val / 100).toString();
      updateDisplay();
    }
  }

  function deleteLast() {
    if (isResultEvaluated) {
      clearAll();
      return;
    }

    const prefixes = ['sin(', 'cos(', 'tan(', 'sqrt(', 'sqr(', 'log(', 'ln(', 'exp(', 'fact(', 'inv('];
    for (const p of prefixes) {
      if (currentInput.endsWith(p)) {
        currentInput = currentInput.slice(0, -p.length);
        if (currentInput === '') currentInput = '0';
        updateDisplay();
        return;
      }
    }

    if (currentInput.length > 1) {
      currentInput = currentInput.slice(0, -1);
    } else {
      currentInput = '0';
    }
    updateDisplay();
  }

  function clearAll() {
    currentInput = '0';
    expression = '';
    isResultEvaluated = false;
    updateDisplay();
  }

  /**
   * 핵심: 4단계 알고리즘 파이프라인을 통한 정밀 계산 실행
   */
  function calculateResult() {
    let fullExpr = (expression + currentInput).trim();
    if (!fullExpr || (fullExpr === '0' && !expression)) return;

    // 끝에 연산자만 남아있는 경우 제거
    if (/[+\-*\/^]$/.test(fullExpr)) {
      fullExpr = fullExpr.slice(0, -1).trim();
    }

    // 괄호 자동 완성 (열린 괄호 수 > 닫힌 괄호 수)
    const openCount = (fullExpr.match(/\(/g) || []).length;
    const closeCount = (fullExpr.match(/\)/g) || []).length;
    if (openCount > closeCount) {
      fullExpr += ')'.repeat(openCount - closeCount);
    }

    try {
      // 1. 어휘 분석 (Lexing)
      const tokens = Lexer.tokenize(fullExpr);

      // 2. Shunting-yard 알고리즘 (RPN 후위 표기 변환)
      const rpnTokens = ShuntingYard.toRPN(tokens);

      // 3. 스택 기반 연산 평가 (RPN Stack Evaluation)
      const evalResult = RPNEvaluator.evaluate(rpnTokens, { angleMode });

      const evaluatedValue = evalResult.result;

      if (!isFinite(evaluatedValue) || isNaN(evaluatedValue)) {
        currentInput = '계산 불가 (범위 초과)';
        isResultEvaluated = true;
      } else {
        const cleaned = cleanFloat(evaluatedValue);
        const formattedResult = cleaned.toString();

        // 알고리즘 추적 데이터 저장
        lastAnalysis = {
          expression: fullExpr,
          angleMode,
          tokens,
          rpnTokens,
          steps: evalResult.steps,
          result: formattedResult
        };

        addHistory(fullExpr, formattedResult);
        expression = fullExpr + ' =';
        currentInput = formattedResult;
        isResultEvaluated = true;

        // 인스펙터 UI 업데이트
        renderAlgorithmInspector(lastAnalysis);
      }
    } catch (err) {
      console.error('Calculation error:', err);
      currentInput = err.message.length < 30 ? err.message : '수식 오류';
      isResultEvaluated = true;
    }
    updateDisplay();
  }

  /**
   * 부동소수점 오차 정밀 정규화
   */
  function cleanFloat(num) {
    if (isNaN(num)) return NaN;
    if (!isFinite(num)) return num;
    const fixed = parseFloat(num.toPrecision(14));
    if (Math.abs(fixed) < 1e-14) return 0;
    return fixed;
  }

  function addHistory(expr, result) {
    history.unshift({ expr, result, time: new Date() });
    if (history.length > 20) history.pop();
    renderHistory();
  }

  function renderHistory() {
    if (!historyListEl || !historyCountEl) return;
    historyCountEl.textContent = history.length;

    if (history.length === 0) {
      historyListEl.innerHTML = '<div class="empty-history">계산 기록이 여기에 표시됩니다.</div>';
      return;
    }

    historyListEl.innerHTML = history.map((item, index) => `
      <div class="history-item" data-index="${index}" title="클릭하여 결과값 불러오기">
        <span class="hist-exp">${item.expr} =</span>
        <span class="hist-res">${formatNumber(item.result)}</span>
      </div>
    `).join('');

    historyListEl.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = el.dataset.index;
        if (history[idx]) {
          currentInput = history[idx].result;
          expression = '';
          isResultEvaluated = true;
          updateDisplay();
        }
      });
    });
  }

  function updateDisplay() {
    if (displayEl) {
      displayEl.textContent = formatDisplay(currentInput);
    }
    if (historyDisplayEl) {
      historyDisplayEl.textContent = expression || '-';
    }
  }

  function formatDisplay(val) {
    if (val.includes('오류') || val.includes('불가') || val.includes('정의') || val.includes('진수')) return val;
    if (/[a-zA-Z(]/.test(val)) return val;
    if (val.includes('.')) {
      const parts = val.split('.');
      return formatNumber(parts[0]) + '.' + parts[1];
    }
    return formatNumber(val);
  }

  function formatNumber(numStr) {
    const num = parseFloat(numStr);
    if (isNaN(num)) return numStr;
    return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }


  /* ==========================================================================
     6. 알고리즘 인스펙터 (4단계 실행 과정 시각화 UI)
     ========================================================================== */
  function setupAlgorithmInspectorUI() {
    const toggleBtn = document.getElementById('btnToggleInspector');
    const panel = document.getElementById('algorithmInspectorPanel');
    if (!toggleBtn || !panel) return;

    toggleBtn.addEventListener('click', () => {
      const isHidden = panel.style.display === 'none' || panel.style.display === '';
      panel.style.display = isHidden ? 'block' : 'none';
      toggleBtn.classList.toggle('active', isHidden);
      if (isHidden && lastAnalysis) {
        renderAlgorithmInspector(lastAnalysis);
      }
    });
  }

  function renderAlgorithmInspector(data) {
    const panel = document.getElementById('algorithmInspectorPanel');
    if (!panel || !data) return;

    const tokenBadges = data.tokens.map(t => {
      let badgeClass = 'tok-num';
      if (t.type === 'OPERATOR') badgeClass = 'tok-op';
      else if (t.type === 'FUNCTION') badgeClass = 'tok-fn';
      else if (t.type === 'LPAREN' || t.type === 'RPAREN') badgeClass = 'tok-paren';
      else if (t.type === 'CONSTANT') badgeClass = 'tok-const';
      else if (t.type === 'VARIABLE') badgeClass = 'tok-var';
      return `<span class="tok-badge ${badgeClass}" title="${t.type}">${t.raw || t.value}</span>`;
    }).join(' ');

    const rpnBadges = data.rpnTokens.map(t => {
      return `<span class="rpn-badge">${t.raw || t.value}</span>`;
    }).join(' ');

    const stepsRows = (data.steps || []).map((step, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><code>${step.op}</code></td>
        <td><strong>${cleanFloat(step.result)}</strong></td>
        <td><small>[${step.stackSnapshot.map(s => cleanFloat(s)).join(', ')}]</small></td>
      </tr>
    `).join('');

    panel.innerHTML = `
      <div class="inspector-card">
        <div class="inspector-header">
          <h4><i data-lucide="cpu"></i> 공학용 계산기 알고리즘 파이프라인 분석</h4>
          <span class="inspector-tag">각도 단위: ${data.angleMode}</span>
        </div>
        
        <div class="inspector-sections">
          <!-- Step 1: Lexical Analysis -->
          <div class="insp-block">
            <div class="insp-title">
              <span class="insp-num">1</span>
              <strong>어휘 분석 (Lexical Analysis & Tokenizer)</strong>
            </div>
            <p class="insp-desc">수식을 의미 단위 토큰(숫자, 연산자, 함수, 상수)으로 분리 및 단항 음수/암시적 곱셈 보정</p>
            <div class="token-container">${tokenBadges}</div>
          </div>

          <!-- Step 2: Shunting-yard Algorithm -->
          <div class="insp-block">
            <div class="insp-title">
              <span class="insp-num">2</span>
              <strong>중위식 &rarr; 후위식 변환 (Shunting-yard Algorithm)</strong>
            </div>
            <p class="insp-desc">연산자 우선순위와 결합법칙을 반영하여 스택 연산에 최적화된 RPN(Reverse Polish Notation) 생성</p>
            <div class="rpn-container">${rpnBadges}</div>
          </div>

          <!-- Step 3: Stack-based Evaluation Trace -->
          <div class="insp-block">
            <div class="insp-title">
              <span class="insp-num">3</span>
              <strong>스택 기반 연산 (Stack Evaluation Trace)</strong>
            </div>
            <p class="insp-desc">후위 표기 토큰을 순서대로 스택에 Push/Pop하며 실행한 연산 흐름</p>
            <div class="table-responsive">
              <table class="insp-table">
                <thead>
                  <tr>
                    <th>단계</th>
                    <th>연산 내용</th>
                    <th>중간 결과</th>
                    <th>스택 상태 Snapshot</th>
                  </tr>
                </thead>
                <tbody>
                  ${stepsRows || '<tr><td colspan="4">단일 값 수식입니다.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Step 4: Taylor Series & Numerical Engine Info -->
          <div class="insp-block">
            <div class="insp-title">
              <span class="insp-num">4</span>
              <strong>초월함수 & 수치해석 엔진 (Taylor Series)</strong>
            </div>
            <p class="insp-desc">
              $\sin(x)$, $\cos(x)$, $e^x$, $\ln(x)$, $\sqrt{x}$ 등은 고차 테일러 급수(Taylor Series) 및 뉴턴 반복법을 통해 오차 1e-15 이내의 수렴 근사값 도출
            </p>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) {
      lucide.createIcons({ root: panel });
    }
  }


  /* ==========================================================================
     7. 뉴턴-라프슨 (Newton-Raphson) 방정식 실근 Solver 모달
     ========================================================================== */
  function setupNewtonRaphsonModalUI() {
    const modal = document.getElementById('newtonModal');
    const closeBtn = document.getElementById('closeNewtonModal');
    const solveBtn = document.getElementById('btnRunNewtonSolve');
    const exprInput = document.getElementById('newtonExprInput');
    const guessInput = document.getElementById('newtonGuessInput');
    const resultBox = document.getElementById('newtonResultBox');

    if (!modal) return;

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });

    if (solveBtn) {
      solveBtn.addEventListener('click', () => {
        const rawFormula = exprInput.value.trim();
        const guess = parseFloat(guessInput.value) || 1.0;

        if (!rawFormula) {
          resultBox.innerHTML = '<div class="alert error">방정식 $f(x) = 0$의 수식을 입력해주세요. (예: x^2 - 4)</div>';
          return;
        }

        try {
          // f(x) 평가 함수 생성
          const tokens = Lexer.tokenize(rawFormula);
          const rpnTokens = ShuntingYard.toRPN(tokens);

          const evalFunction = (xVal) => {
            const evalRes = RPNEvaluator.evaluate(rpnTokens, {
              angleMode: 'RAD', // 방정식 풀이는 통상 라디안 기준
              variables: { x: xVal }
            });
            return evalRes.result;
          };

          // 뉴턴-라프슨 풀이 실행
          const solveResult = NumericalEngine.solveNewtonRaphson(evalFunction, guess, 1e-11, 50);

          if (solveResult.success) {
            const historyRows = solveResult.history.map(h => `
              <tr>
                <td>${h.iter}</td>
                <td><code>${h.x.toFixed(8)}</code></td>
                <td>${h.fx.toExponential(4)}</td>
                <td>${h.error.toExponential(4)}</td>
              </tr>
            `).join('');

            resultBox.innerHTML = `
              <div class="solve-success-card">
                <div class="solve-root-display">
                  <span class="root-label">방정식 $f(x) = 0$의 실근:</span>
                  <span class="root-value">x = ${cleanFloat(solveResult.root)}</span>
                  <button class="btn-use-root" id="btnUseRoot" data-val="${cleanFloat(solveResult.root)}">계산기로 가져오기</button>
                </div>
                <div class="solve-iter-count">수렴 반복 횟수: <strong>${solveResult.iterations}회</strong> (허용 오차: 1e-11)</div>
                <div class="table-responsive">
                  <table class="insp-table">
                    <thead>
                      <tr>
                        <th>반복(n)</th>
                        <th>x<sub>n</sub></th>
                        <th>f(x<sub>n</sub>)</th>
                        <th>오차 |f(x<sub>n</sub>)|</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${historyRows}
                    </tbody>
                  </table>
                </div>
              </div>
            `;

            const btnUse = document.getElementById('btnUseRoot');
            if (btnUse) {
              btnUse.addEventListener('click', () => {
                currentInput = btnUse.dataset.val;
                expression = '';
                isResultEvaluated = true;
                updateDisplay();
                modal.style.display = 'none';
              });
            }
          } else {
            resultBox.innerHTML = `
              <div class="alert error">
                <strong>방정식 풀이 실패:</strong> ${solveResult.error}
              </div>
            `;
          }
        } catch (err) {
          resultBox.innerHTML = `
            <div class="alert error">
              <strong>수식 오류:</strong> ${err.message}
            </div>
          `;
        }
      });
    }
  }

  function openNewtonModal() {
    const modal = document.getElementById('newtonModal');
    if (modal) {
      modal.style.display = 'flex';
      const exprInput = document.getElementById('newtonExprInput');
      if (exprInput && currentInput !== '0' && currentInput.includes('x')) {
        exprInput.value = currentInput;
      }
    }
  }

  return {
    init,
    getCurrentValue: () => {
      const clean = currentInput.replace(/,/g, '');
      const val = parseFloat(clean);
      return isNaN(val) ? 0 : val;
    },
    setValue: (val) => {
      currentInput = val.toString();
      expression = '';
      isResultEvaluated = true;
      updateDisplay();
    },
    // 외부 모듈 및 디버깅용 공개 API
    Lexer,
    ShuntingYard,
    RPNEvaluator,
    NumericalEngine,
    openNewtonModal
  };
})();
