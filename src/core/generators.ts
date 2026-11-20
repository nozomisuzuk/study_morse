import { tokenize } from './morse';
import { pick, pickWeighted, randInt, type Rng } from './rng';
import { ANTENNAS, DX_ENTITIES, JA_AREA_CITIES, JA_NAMES, POWERS, RIGS, WEATHERS } from './data/qso';

/* ------------------------------------------------------------------ */
/* ランダム文字グループ (Koch 練習)                                     */
/* ------------------------------------------------------------------ */

export function randomGroup(rng: Rng, chars: readonly string[], weights: readonly number[], length: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < length; i++) {
    let c = pickWeighted(rng, chars, weights);
    // 同じ文字が 3 連続しないようにする (聞き取りの練習として不自然なため)
    if (out.length >= 2 && out[out.length - 1] === c && out[out.length - 2] === c && chars.length > 1) {
      c = pickWeighted(rng, chars.filter((x) => x !== c), weights.filter((_, k) => chars[k] !== c));
    }
    out.push(c);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 単語の絞り込み                                                        */
/* ------------------------------------------------------------------ */

/** 習得済みの文字だけでできている語を選ぶ */
export function wordsWithin(words: readonly string[], chars: readonly string[]): string[] {
  const set = new Set(chars);
  return words.filter((w) => tokenize(w).every((t) => t === ' ' || set.has(t)));
}

/* ------------------------------------------------------------------ */
/* コールサイン                                                          */
/* ------------------------------------------------------------------ */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function letters(rng: Rng, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += LETTERS[Math.floor(rng.next() * 26)];
  return s;
}

export interface JaCall {
  call: string;
  area: string;
}

/** 日本のアマチュア局らしいコールサイン (JA1ABC, JH3XYZ, 7K1ABC など) */
export function jaCallsign(rng: Rng): JaCall {
  const r = rng.next();
  if (r < 0.1) {
    const prefix = pick(rng, ['7K', '7L', '7M', '7N']);
    const area = String(randInt(rng, 1, 4));
    return { call: `${prefix}${area}${letters(rng, 3)}`, area };
  }
  const prefix = pickWeighted(
    rng,
    ['JA', 'JE', 'JF', 'JG', 'JH', 'JI', 'JJ', 'JK', 'JL', 'JM', 'JN', 'JO', 'JP', 'JQ', 'JR', 'JS'],
    [4, 2, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 2],
  );
  const area = String(pickWeighted(rng, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [3, 10, 4, 5, 2, 2, 3, 3, 3, 2]));
  const suffixLen = prefix === 'JA' && rng.next() < 0.3 ? 2 : 3;
  return { call: `${prefix}${area}${letters(rng, suffixLen)}`, area };
}

export interface DxCall {
  call: string;
  entity: (typeof DX_ENTITIES)[number];
}

export function dxCallsign(rng: Rng): DxCall {
  const entity = pick(rng, DX_ENTITIES);
  const pattern = pick(rng, entity.prefixes);
  const digits = entity.digits ?? '0123456789';
  const prefix = pattern.includes('#') ? pattern.replace('#', digits[Math.floor(rng.next() * digits.length)]) : pattern;
  return { call: prefix + letters(rng, pick(rng, entity.suffixLens)), entity };
}

export type CallKind = 'ja' | 'dx' | 'mixed';

export interface CallOptions {
  kind: CallKind;
  /** 移動運用の表記 (/1, /P など) を混ぜる */
  portable?: boolean;
}

export function callsign(rng: Rng, opts: CallOptions): string {
  const useJa = opts.kind === 'ja' || (opts.kind === 'mixed' && rng.next() < 0.55);
  let call = useJa ? jaCallsign(rng).call : dxCallsign(rng).call;
  if (opts.portable && rng.next() < 0.25) {
    call += useJa ? `/${pick(rng, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'P'])}` : pick(rng, ['/P', '/M', '/QRP']);
  }
  return call;
}

/* ------------------------------------------------------------------ */
/* 交信 (QSO) の生成                                                    */
/* ------------------------------------------------------------------ */

export type QsoKind = 'cq' | 'reply' | 'ragchew' | 'contest' | 'dx';

export interface Station {
  call: string;
  name: string;
  qth: string;
  rig: string;
  pwr: string;
  ant: string;
  wx: string;
  wxJa: string;
  temp: number;
  dx: boolean;
}

export interface QsoLine {
  /** 送信している局 */
  station: 'A' | 'B';
  /** モールスで送る文 (略符号は '<AR>' 形式) */
  text: string;
  /** 日本語の意味 */
  ja: string;
  /** 再生しない (自分の送信として文字だけ見せる) */
  silent?: boolean;
}

export interface QsoQuestion {
  id: string;
  label: string;
  /** 表示用の正解 */
  answer: string;
  /** 正解として認める表記 (正規化前) */
  accept: string[];
  /** 数字項目 (カットナンバーを数字に戻して比較する) */
  numeric?: boolean;
}

export interface Qso {
  kind: QsoKind;
  lines: QsoLine[];
  questions: QsoQuestion[];
  stations: { A: Station; B: Station };
  /** 画面に出す状況説明 */
  intro: string;
}

export interface QsoOptions {
  /** 自分のコールサイン (reply で使う。空ならランダム) */
  myCall?: string;
  /** 挨拶 (GM/GA/GE) を決める時刻 (0-23) */
  hour?: number;
}

const QSO_KIND_LABEL: Record<QsoKind, string> = {
  cq: 'CQ を聞き取る',
  reply: '自分の CQ に応答が来る',
  ragchew: '定型 QSO を聞く',
  contest: 'コンテストの交換',
  dx: '海外局との QSO',
};

export function qsoKindLabel(kind: QsoKind): string {
  return QSO_KIND_LABEL[kind];
}

function jaStation(rng: Rng, call?: string): Station {
  const c = call ? { call, area: call.match(/\d/)?.[0] ?? '1' } : jaCallsign(rng);
  const wx = pick(rng, WEATHERS);
  return {
    call: c.call,
    name: pick(rng, JA_NAMES),
    qth: pick(rng, JA_AREA_CITIES[c.area] ?? JA_AREA_CITIES['1']),
    rig: pick(rng, RIGS),
    pwr: pick(rng, POWERS),
    ant: pick(rng, ANTENNAS),
    wx: wx.en,
    wxJa: wx.ja,
    temp: randInt(rng, wx.tempMin, wx.tempMax),
    dx: false,
  };
}

function dxStation(rng: Rng): Station {
  const d = dxCallsign(rng);
  const wx = pick(rng, WEATHERS);
  return {
    call: d.call,
    name: pick(rng, d.entity.names),
    qth: pick(rng, d.entity.qths),
    rig: pick(rng, RIGS),
    pwr: pick(rng, ['100W', '100W', '500W', '1KW', '5W']),
    ant: pick(rng, ANTENNAS),
    wx: wx.en,
    wxJa: wx.ja,
    temp: randInt(rng, wx.tempMin, wx.tempMax),
    dx: true,
  };
}

function greeting(hour: number): { en: string; ja: string } {
  if (hour >= 4 && hour < 10) return { en: 'GM', ja: 'おはようございます' };
  if (hour >= 10 && hour < 17) return { en: 'GA', ja: 'こんにちは' };
  return { en: 'GE', ja: 'こんばんは' };
}

function rstReport(rng: Rng): string {
  return pickWeighted(rng, ['599', '579', '589', '569', '559', '449', '5NN'], [5, 3, 3, 2, 2, 1, 2]);
}

function tempText(t: number): string {
  return t < 0 ? `MINUS ${-t}C` : `${t}C`;
}

/** 文と日本語訳を同時に組み立てる小さなビルダー */
class LineBuilder {
  private en: string[] = [];
  private ja: string[] = [];
  add(en: string, ja = ''): this {
    if (en) this.en.push(en);
    if (ja) this.ja.push(ja);
    return this;
  }
  /** 区切り BT (=) */
  bt(): this {
    this.en.push('=');
    return this;
  }
  build(station: 'A' | 'B', silent = false): QsoLine {
    return { station, text: this.en.join(' '), ja: this.ja.join(''), silent };
  }
}

function q(id: string, label: string, answer: string, extra: string[] = [], numeric = false): QsoQuestion {
  return { id, label, answer, accept: [answer, ...extra], numeric };
}

function qthQuestion(id: string, label: string, qth: string): QsoQuestion {
  return q(id, label, qth, [`${qth} CITY`]);
}

export function generateQso(kind: QsoKind, rng: Rng, opts: QsoOptions = {}): Qso {
  const hour = opts.hour ?? new Date().getHours();
  switch (kind) {
    case 'cq':
      return cqQso(rng);
    case 'reply':
      return replyQso(rng, opts.myCall, hour);
    case 'ragchew':
      return ragchewQso(rng, hour);
    case 'contest':
      return contestQso(rng);
    case 'dx':
      return dxQso(rng, hour);
  }
}

function cqQso(rng: Rng): Qso {
  const isDx = rng.next() < 0.3;
  const A = isDx ? dxStation(rng) : jaStation(rng);
  const B = jaStation(rng);
  const style = randInt(rng, 0, 2);
  let line: QsoLine;
  if (style === 0) {
    line = new LineBuilder().add(`CQ CQ CQ DE ${A.call} ${A.call} ${A.call} K`, `各局 各局 各局、こちらは ${A.call}。どうぞ。`).build('A');
  } else if (style === 1) {
    line = new LineBuilder().add(`CQ CQ DE ${A.call} ${A.call} PSE K`, `各局 各局、こちらは ${A.call}。どうぞお願いします。`).build('A');
  } else {
    line = new LineBuilder().add(`CQ CQ CQ DE ${A.call} ${A.call} <AR> K`, `各局 各局 各局、こちらは ${A.call}。以上、どうぞ。`).build('A');
  }
  return {
    kind: 'cq',
    lines: [line],
    questions: [q('callA', 'CQ を出している局のコールサイン', A.call)],
    stations: { A, B },
    intro: 'ある局が CQ (不特定の局への呼び出し) を出しています。コールサインを聞き取りましょう。',
  };
}

function replyQso(rng: Rng, myCall: string | undefined, hour: number): Qso {
  const me = jaStation(rng, myCall && /^[A-Z0-9/]+$/i.test(myCall) ? myCall.toUpperCase() : undefined);
  const B = jaStation(rng);
  const g = greeting(hour);
  const rstToMe = rstReport(rng);
  const rstToB = rstReport(rng);
  const lines: QsoLine[] = [];
  lines.push(new LineBuilder().add(`CQ CQ CQ DE ${me.call} ${me.call} ${me.call} PSE K`, `(あなたの送信) 各局、こちらは ${me.call}。どうぞ。`).build('A', true));
  lines.push(new LineBuilder().add(`${me.call} DE ${B.call} ${B.call} K`, `${me.call} へ、こちらは ${B.call}。どうぞ。`).build('B'));
  lines.push(
    new LineBuilder()
      .add(`${B.call} DE ${me.call} ${g.en} TNX FER CALL`, `(あなたの送信) ${B.call} へ、こちらは ${me.call}。${g.ja}。呼んでくれてありがとう。`)
      .bt()
      .add(`UR RST ${rstToB} ${rstToB}`, `RST は ${rstToB}。`)
      .bt()
      .add(`NAME ${me.name} ${me.name}`, `名前は ${me.name}。`)
      .bt()
      .add(`QTH ${me.qth} ${me.qth}`, `QTH は ${me.qth}。`)
      .bt()
      .add(`HW? <AR> ${B.call} DE ${me.call} K`, 'どうですか？ どうぞ。')
      .build('A', true),
  );
  const b = new LineBuilder()
    .add(`R ${me.call} DE ${B.call}`, `了解。${me.call} へ、こちらは ${B.call}。`)
    .add(`${g.en} ${me.name} SAN TNX FER FB RPT`, `${me.name} さん、${g.ja}。良いレポートをありがとう。`)
    .bt()
    .add(`UR RST ${rstToMe} ${rstToMe}`, `あなたの RST は ${rstToMe}。`)
    .bt()
    .add(`NAME ${B.name} ${B.name}`, `名前は ${B.name}。`)
    .bt()
    .add(`QTH ${B.qth} ${B.qth}`, `QTH は ${B.qth}。`)
    .bt()
    .add(`PWR ${B.pwr}`, `出力は ${B.pwr}。`)
    .bt()
    .add(`HW? <AR> ${me.call} DE ${B.call} K`, 'どうですか？ どうぞ。');
  lines.push(b.build('B'));

  return {
    kind: 'reply',
    lines,
    questions: [
      q('callB', 'あなたを呼んできた局のコールサイン', B.call),
      q('rst', 'あなたへの RST レポート', rstToMe, [], true),
      q('nameB', '相手局の名前', B.name),
      qthQuestion('qthB', '相手局の QTH', B.qth),
      q('pwrB', '相手局の出力', B.pwr, [B.pwr.replace('W', '')], true),
    ],
    stations: { A: me, B },
    intro: `あなた (${me.call}) が CQ を出したところ、ある局が応答してきました。相手局の情報を聞き取りましょう (あなた自身の送信は再生されません)。`,
  };
}

function ragchewQso(rng: Rng, hour: number): Qso {
  const A = jaStation(rng);
  let B = jaStation(rng);
  while (B.call === A.call) B = jaStation(rng);
  const g = greeting(hour);
  const rstAB = rstReport(rng);
  const rstBA = rstReport(rng);
  const lines: QsoLine[] = [];

  lines.push(
    rng.next() < 0.5
      ? new LineBuilder().add(`CQ CQ CQ DE ${A.call} ${A.call} ${A.call} PSE K`, `各局 各局 各局、こちらは ${A.call}。どうぞ。`).build('A')
      : new LineBuilder().add(`CQ CQ DE ${A.call} ${A.call} K`, `各局 各局、こちらは ${A.call}。どうぞ。`).build('A'),
  );
  lines.push(new LineBuilder().add(`${A.call} DE ${B.call} ${B.call} ${rng.next() < 0.5 ? 'K' : '<AR>'}`, `${A.call} へ、こちらは ${B.call}。どうぞ。`).build('B'));
  lines.push(
    new LineBuilder()
      .add(`${B.call} DE ${A.call} ${g.en} OM TNX FER UR CALL`, `${B.call} へ、こちらは ${A.call}。${g.ja}。呼んでくれてありがとう。`)
      .bt()
      .add(`UR RST ${rstAB} ${rstAB}`, `あなたの RST は ${rstAB}。`)
      .bt()
      .add(`MY NAME IS ${A.name} ${A.name}`, `私の名前は ${A.name}。`)
      .bt()
      .add(`QTH IS ${A.qth} ${A.qth}`, `QTH は ${A.qth}。`)
      .bt()
      .add(`HW? <AR> ${B.call} DE ${A.call} K`, '受信状態はどうですか？ どうぞ。')
      .build('A'),
  );
  lines.push(
    new LineBuilder()
      .add(`R ${A.call} DE ${B.call}`, `了解。${A.call} へ、こちらは ${B.call}。`)
      .add(`${g.en} ${A.name} SAN TNX FER FB RPT`, `${A.name} さん、${g.ja}。良いレポートをありがとう。`)
      .bt()
      .add(`UR RST ${rstBA} ${rstBA}`, `あなたの RST は ${rstBA}。`)
      .bt()
      .add(`MY NAME IS ${B.name} ${B.name}`, `私の名前は ${B.name}。`)
      .bt()
      .add(`QTH IS ${B.qth} ${B.qth}`, `QTH は ${B.qth}。`)
      .bt()
      .add(`RIG IS ${B.rig} ${B.pwr} ES ANT IS ${B.ant}`, `無線機は ${B.rig}、出力 ${B.pwr}、アンテナは ${B.ant}。`)
      .bt()
      .add(`WX ${B.wx} TEMP ${tempText(B.temp)}`, `天気は${B.wxJa}、気温は ${B.temp}℃。`)
      .bt()
      .add(`HW? <AR> ${A.call} DE ${B.call} K`, 'どうですか？ どうぞ。')
      .build('B'),
  );
  lines.push(
    new LineBuilder()
      .add(`R ${B.call} DE ${A.call}`, `了解。${B.call} へ、こちらは ${A.call}。`)
      .add(`TNX FER FB QSO ${B.name} SAN`, `${B.name} さん、楽しい交信をありがとう。`)
      .bt()
      .add(`PSE QSL VIA BURO`, 'QSL カードはビューロー経由でお願いします。')
      .bt()
      .add(`73 ES CU AGN <AR> ${B.call} DE ${A.call} <SK>`, '73、またお会いしましょう。交信終了。')
      .build('A'),
  );
  lines.push(
    new LineBuilder()
      .add(`R ${A.call} DE ${B.call} QSL OK VIA BURO`, `了解。QSL カードはビューロー経由で OK。`)
      .add(`TNX FER NICE QSO 73 GL <SK> E E`, '楽しい交信をありがとう。73、幸運を。交信終了。(最後の E E はあいさつ)')
      .build('B'),
  );

  const optional: QsoQuestion[] = [
    q('rstAB', `${A.call} が ${B.call} に送った RST`, rstAB, [], true),
    q('nameA', `${A.call} の名前`, A.name),
    qthQuestion('qthA', `${A.call} の QTH`, A.qth),
    q('nameB', `${B.call} の名前`, B.name),
    qthQuestion('qthB', `${B.call} の QTH`, B.qth),
    q('pwrB', `${B.call} の出力`, B.pwr, [B.pwr.replace('W', '')], true),
    q('wxB', `${B.call} の天気 (英語)`, B.wx),
  ];
  const chosen = sample(rng, optional, 3);
  return {
    kind: 'ragchew',
    lines,
    questions: [q('callA', 'CQ を出した局のコールサイン', A.call), q('callB', '応答した局のコールサイン', B.call), ...chosen],
    stations: { A, B },
    intro: '国内局どうしの、いわゆる「ラバースタンプ QSO」(定型の交信) です。誰が何を送ったかを聞き取りましょう。',
  };
}

/** 国内コンテスト風のナンバー: 都府県支庁ナンバー (2〜3 桁) + 空中線電力の記号 */
function domesticNumber(rng: Rng): string {
  const num = rng.next() < 0.85 ? String(randInt(rng, 2, 48)).padStart(2, '0') : String(randInt(rng, 101, 114));
  return num + pick(rng, ['P', 'L', 'M', 'M', 'H']);
}

/** シリアルナンバー。ときどきカットナンバー (0→T, 9→N) で送る */
function serialNumber(rng: Rng): { sent: string; value: string } {
  const value = String(randInt(rng, 1, 350)).padStart(3, '0');
  const cut = rng.next() < 0.5;
  return { sent: cut ? value.replace(/0/g, 'T').replace(/9/g, 'N') : value, value };
}

function contestQso(rng: Rng): Qso {
  const A = jaStation(rng);
  let B = jaStation(rng);
  while (B.call === A.call) B = jaStation(rng);
  const serial = rng.next() < 0.35;
  const exA = serial ? serialNumber(rng) : { sent: domesticNumber(rng), value: '' };
  const exB = serial ? serialNumber(rng) : { sent: domesticNumber(rng), value: '' };
  if (!serial) {
    exA.value = exA.sent;
    exB.value = exB.sent;
  }
  const rst = rng.next() < 0.75 ? '5NN' : '599';
  const lines: QsoLine[] = [
    new LineBuilder().add(`CQ TEST ${A.call} ${A.call} TEST`, `コンテストの呼び出し。こちらは ${A.call}。`).build('A'),
    new LineBuilder().add(rng.next() < 0.6 ? B.call : `${B.call} ${B.call}`, '(コンテストではコールサインだけで応答する)').build('B'),
    new LineBuilder().add(`${B.call} ${rst} ${exA.sent}`, `${B.call} へ。RST 599、ナンバー ${exA.value}。`).build('A'),
    new LineBuilder().add(`${rng.next() < 0.5 ? 'TU' : 'R'} ${rst} ${exB.sent}`, `了解。RST 599、ナンバー ${exB.value}。`).build('B'),
    new LineBuilder().add(`TU ${A.call} TEST`, `ありがとう。こちらは ${A.call}、コンテスト中です。`).build('A'),
  ];
  return {
    kind: 'contest',
    lines,
    questions: [
      q('callA', 'CQ TEST を出した局のコールサイン', A.call),
      q('callB', '応答した局のコールサイン', B.call),
      q('exA', `${A.call} が送ったナンバー (RST を除く)`, exA.value, serial ? [exA.sent, String(Number(exA.value))] : [exA.sent], true),
      q('exB', `${B.call} が送ったナンバー (RST を除く)`, exB.value, serial ? [exB.sent, String(Number(exB.value))] : [exB.sent], true),
    ],
    stations: { A, B },
    intro: serial
      ? 'コンテストの交信です。RST に続けてシリアルナンバー (通し番号) を交換します。0 を T、9 を N と略す「カットナンバー」が混ざることがあります。'
      : 'コンテストの交信です。RST に続けて「都府県支庁ナンバー + 空中線電力を表す英字」(例: 東京 10、千葉 12) を交換します。',
  };
}

function dxQso(rng: Rng, hour: number): Qso {
  const A = dxStation(rng);
  const B = jaStation(rng);
  const g = greeting((hour + randInt(rng, 0, 23)) % 24); // 相手の現地時刻はわからないので適当に
  const rstAB = rstReport(rng);
  const rstBA = rstReport(rng);
  const qsl = pick(rng, ['LOTW', 'BURO', 'LOTW ES BURO']);
  const lines: QsoLine[] = [
    new LineBuilder().add(`CQ CQ DE ${A.call} ${A.call} K`, `各局、こちらは ${A.call}。どうぞ。`).build('A'),
    new LineBuilder().add(`${A.call} DE ${B.call} ${B.call} K`, `${A.call} へ、こちらは ${B.call}。どうぞ。`).build('B'),
    new LineBuilder()
      .add(`${B.call} DE ${A.call} ${g.en} TNX FER CALL`, `${B.call} へ、こちらは ${A.call}。${g.ja}。呼んでくれてありがとう。`)
      .bt()
      .add(`UR RST ${rstAB} ${rstAB}`, `あなたの RST は ${rstAB}。`)
      .bt()
      .add(`NAME ${A.name} ${A.name}`, `名前は ${A.name}。`)
      .bt()
      .add(`QTH ${A.qth} ${A.qth}`, `QTH は ${A.qth}。`)
      .bt()
      .add(`HW? <AR> ${B.call} DE ${A.call} K`, 'どうですか？ どうぞ。')
      .build('A'),
    new LineBuilder()
      .add(`R ${A.call} DE ${B.call} TNX ${A.name}`, `了解。${A.call} へ、こちらは ${B.call}。${A.name} さん、ありがとう。`)
      .bt()
      .add(`UR RST ${rstBA} ${rstBA}`, `あなたの RST は ${rstBA}。`)
      .bt()
      .add(`NAME ${B.name} ${B.name}`, `名前は ${B.name}。`)
      .bt()
      .add(`QTH ${B.qth} ${B.qth}`, `QTH は ${B.qth}。`)
      .bt()
      .add(`HW? <AR> ${A.call} DE ${B.call} K`, 'どうですか？ どうぞ。')
      .build('B'),
    new LineBuilder()
      .add(`R TNX ${B.name} FER QSO`, `了解。${B.name} さん、交信ありがとう。`)
      .bt()
      .add(`QSL VIA ${qsl}`, `QSL は ${qsl === 'BURO' ? 'ビューロー' : qsl === 'LOTW' ? 'LoTW' : 'LoTW とビューロー'} 経由で。`)
      .bt()
      .add(`73 GL <SK> ${B.call} DE ${A.call} TU`, '73、幸運を。交信終了。ありがとう。')
      .build('A'),
  ];
  return {
    kind: 'dx',
    lines,
    questions: [
      q('callA', '海外局のコールサイン', A.call),
      q('rstAB', `${B.call} が受け取った RST`, rstAB, [], true),
      q('nameA', '海外局の名前', A.name),
      qthQuestion('qthA', '海外局の QTH', A.qth),
    ],
    stations: { A, B },
    intro: '海外 (DX) 局が CQ を出し、日本の局が応答しました。海外局の情報を聞き取りましょう。',
  };
}

function sample<T>(rng: Rng, items: readonly T[], n: number): T[] {
  const pool = items.slice();
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  }
  return out;
}

/** 質問への答えが正しいか */
export function checkAnswer(question: QsoQuestion, input: string, normalize: (s: string) => string, uncut: (s: string) => string): boolean {
  const f = question.numeric ? uncut : normalize;
  const given = f(input);
  if (!given) return false;
  return question.accept.some((a) => f(a) === given);
}
