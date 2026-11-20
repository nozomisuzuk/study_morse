/**
 * 国際モールス符号 (ITU-R M.1677-1) と、アマチュア無線でよく使う略符号 (prosign)。
 *
 * テキストは「トークン」の配列として扱う。トークンは
 *   - 1 文字: 'A'..'Z', '0'..'9', 記号 ('.', ',', '?', '/', '=', '+', '(' など)
 *   - 複数文字: '<SK>' のような角括弧つきの略符号
 *   - 語間: ' '
 * のいずれか。
 *
 * ITU に文字が割り当てられている略符号は、その文字で表す:
 *   AR = '+' (.-.-.)   BT = '=' (-...-)   KN = '(' (-.--.)
 */

export const MORSE: Readonly<Record<string, string>> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
  I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....',
  '6': '-....', '7': '--...', '8': '---..', '9': '----.', '0': '-----',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '=': '-...-',
  '+': '.-.-.', '(': '-.--.', ')': '-.--.-', '-': '-....-', '"': '.-..-.',
  "'": '.----.', ':': '---...', '@': '.--.-.',
  '<SK>': '...-.-', // VA: 交信終了 (end of work)
  '<AS>': '.-...', // 待て (wait)
  '<BK>': '-...-.-', // ブレーク
  '<HH>': '........', // 訂正 (error)
  '<KA>': '-.-.-', // 開始信号 (starting signal)
  '<SN>': '...-.', // 了解 (understood) / VE
};

/** 角括弧表記で書ける略符号の別名 → 内部トークン */
const PROSIGN_ALIASES: Readonly<Record<string, string>> = {
  AR: '+', BT: '=', KN: '(',
  SK: '<SK>', VA: '<SK>', AS: '<AS>', BK: '<BK>', HH: '<HH>',
  KA: '<KA>', CT: '<KA>', SN: '<SN>', VE: '<SN>',
};

/** 画面表示で略符号として見せるトークンとその表示名 */
const PROSIGN_DISPLAY: Readonly<Record<string, string>> = {
  '+': 'AR', '=': 'BT', '(': 'KN', '<SK>': 'SK', '<AS>': 'AS', '<BK>': 'BK',
  '<HH>': 'HH', '<KA>': 'KA', '<SN>': 'SN',
};

export function isProsign(token: string): boolean {
  return token in PROSIGN_DISPLAY;
}

/** 表示用ラベル。略符号は 'AR' などの名前、それ以外はそのまま。 */
export function tokenLabel(token: string): string {
  return PROSIGN_DISPLAY[token] ?? token;
}

/** 文字列をトークン列に変換する。未知の文字は捨てる。連続する空白は 1 つの語間にまとめる。 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const s = text.toUpperCase();
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '<') {
      const j = s.indexOf('>', i + 1);
      if (j > i) {
        const name = s.slice(i + 1, j);
        const tok = PROSIGN_ALIASES[name] ?? (MORSE[`<${name}>`] ? `<${name}>` : undefined);
        if (tok) {
          out.push(tok);
          i = j + 1;
          continue;
        }
      }
    }
    if (/\s/.test(ch)) {
      if (out.length > 0 && out[out.length - 1] !== ' ') out.push(' ');
    } else if (MORSE[ch] !== undefined) {
      out.push(ch);
    }
    i++;
  }
  while (out.length > 0 && out[out.length - 1] === ' ') out.pop();
  return out;
}

/** トークン列を文字列に戻す (略符号は '<SK>' 形式のまま)。 */
export function detokenize(tokens: readonly string[]): string {
  return tokens.join('');
}

/** トークン列を人が読む表示用文字列にする ('+' → 'AR' など)。 */
export function displayText(tokens: readonly string[]): string {
  let out = '';
  tokens.forEach((t, i) => {
    if (t === ' ') {
      out += ' ';
      return;
    }
    const label = tokenLabel(t);
    const prevIsChar = i > 0 && tokens[i - 1] !== ' ';
    // 略符号は前後の文字とくっつくと読みにくいので、語の途中なら空白で区切る
    if (isProsign(t) && prevIsChar) out += ' ';
    out += label;
    if (isProsign(t) && i + 1 < tokens.length && tokens[i + 1] !== ' ') out += ' ';
  });
  return out;
}

/** 符号を見やすい形 (・と－) にする */
export function prettyCode(code: string): string {
  return code.replace(/\./g, '・').replace(/-/g, '－');
}

/** PARIS 方式で 1 文字 (語間を除く) が占める単位数。短点1, 長点3, 符号内の間隔1。 */
export function codeUnits(code: string): number {
  let units = 0;
  for (let i = 0; i < code.length; i++) {
    units += code[i] === '.' ? 1 : 3;
    if (i > 0) units += 1;
  }
  return units;
}

/** 練習でよく使う文字の集合 */
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const DIGITS = '1234567890'.split('');
export const PUNCTUATION = ['.', ',', '?', '/', '=', '+', '(', '<SK>'];
