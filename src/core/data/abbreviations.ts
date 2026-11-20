/** 交信でよく使う Q 符号・略語・略符号と、その意味。 */
export type AbbrevCategory = 'q' | 'abbr' | 'prosign';

export interface Abbrev {
  /** モールスで送る表記 (略符号は '<AR>' 形式) */
  code: string;
  /** 表示名 */
  label: string;
  meaning: string;
  /** 元の英語 (あれば) */
  en?: string;
  category: AbbrevCategory;
}

const q = (label: string, meaning: string, en?: string): Abbrev => ({ code: label, label, meaning, en, category: 'q' });
const a = (label: string, meaning: string, en?: string): Abbrev => ({ code: label, label, meaning, en, category: 'abbr' });
const p = (code: string, label: string, meaning: string, en?: string): Abbrev => ({ code, label, meaning, en, category: 'prosign' });

export const ABBREVIATIONS: readonly Abbrev[] = [
  // Q 符号 (疑問形で使うと「〜ですか？」になる)
  q('QRL', 'この周波数は使用中ですか？／使用中です'),
  q('QRM', '混信 (他の局による妨害)'),
  q('QRN', '空電・自然雑音'),
  q('QRO', '送信出力を上げる／高出力'),
  q('QRP', '送信出力を下げる／低出力 (CW では一般に 5W 以下)'),
  q('QRQ', 'もっと速く送ってください'),
  q('QRS', 'もっと遅く送ってください'),
  q('QRT', '送信をやめる (閉局する)'),
  q('QRU', '用事はありますか？／用事はありません'),
  q('QRV', '準備ができています'),
  q('QRX', '少し待ってください'),
  q('QRZ', '誰が呼んでいますか？'),
  q('QRK', '了解度 (信号の明瞭さ)'),
  q('QRG', '正確な周波数'),
  q('QSA', '信号の強さ'),
  q('QSB', 'フェージング (信号の強さが変動する)'),
  q('QSL', '受信を確認します／交信証 (QSL カード)'),
  q('QSO', '交信'),
  q('QSY', '周波数を変えます／変えてください'),
  q('QTH', '所在地 (運用場所)'),

  // 略語
  a('CQ', '各局 (不特定の局への呼び出し)'),
  a('DE', 'こちらは (〜から)', 'from'),
  a('K', 'どうぞ (送信してください)'),
  a('R', '了解 (全部受信しました)', 'roger'),
  a('TEST', 'コンテスト (CQ TEST はコンテスト中の呼び出し)', 'contest'),
  a('UR', 'あなたの／あなたは', 'your / you are'),
  a('RST', '信号報告 (了解度 R・強さ S・音調 T)'),
  a('5NN', '599 の略記 (カットナンバー: N=9)'),
  a('TNX', 'ありがとう', 'thanks'),
  a('TKS', 'ありがとう', 'thanks'),
  a('TU', 'ありがとう', 'thank you'),
  a('FER', '〜のために', 'for'),
  a('FB', 'すばらしい・良い', 'fine business'),
  a('OM', '男性オペレーターへの敬称', 'old man'),
  a('YL', '女性オペレーター', 'young lady'),
  a('XYL', '妻', 'ex-young lady'),
  a('OP', 'オペレーター (運用者)', 'operator'),
  a('SAN', 'さん (日本の局どうしで名前に付ける敬称)'),
  a('NAME', '名前'),
  a('HR', 'こちらでは', 'here'),
  a('HW', 'どうですか？ (HW? = 受信状態はどう？)', 'how'),
  a('CPY', '受信する', 'copy'),
  a('ES', 'そして', 'and'),
  a('PSE', 'どうぞ〜してください', 'please'),
  a('AGN', 'もう一度', 'again'),
  a('RPT', '繰り返す／レポート', 'repeat / report'),
  a('SRI', 'すみません', 'sorry'),
  a('VY', 'とても', 'very'),
  a('DR', '親愛なる', 'dear'),
  a('GM', 'おはようございます', 'good morning'),
  a('GA', 'こんにちは', 'good afternoon'),
  a('GE', 'こんばんは', 'good evening'),
  a('GN', 'おやすみなさい', 'good night'),
  a('GL', '幸運を', 'good luck'),
  a('GB', 'さようなら', 'good bye'),
  a('CU', 'また会いましょう', 'see you'),
  a('CUL', 'また後で', 'see you later'),
  a('AGN', 'もう一度', 'again'),
  a('73', 'さようなら (敬意を込めたあいさつ)'),
  a('88', '愛を込めて (主に女性局へのあいさつ)'),
  a('WX', '天気', 'weather'),
  a('TEMP', '気温', 'temperature'),
  a('RIG', '無線機'),
  a('ANT', 'アンテナ', 'antenna'),
  a('PWR', '送信出力', 'power'),
  a('W', 'ワット (出力の単位)', 'watts'),
  a('SIG', '信号', 'signal'),
  a('CFM', '確認する', 'confirm'),
  a('BURO', 'QSL ビューロー (QSL カードを転送する機関)', 'bureau'),
  a('VIA', '〜経由で'),
  a('LOTW', 'ARRL の電子 QSL システム (Logbook of The World)'),
  a('MNI', 'たくさんの', 'many'),
  a('ABT', '約／〜について', 'about'),
  a('NR', '番号', 'number'),
  a('NW', '今', 'now'),
  a('HI', '笑い (ハハハ)'),
  a('BK', 'ブレーク (送信を相手に切り替える)', 'break'),
  a('DX', '遠距離 (主に海外) の局・交信'),
  a('WKD', '交信した', 'worked'),
  a('HPE', '〜を望む', 'hope'),
  a('E E', 'ディ・ディ (交信の最後に交わすあいさつ)'),

  // 略符号 (続けて 1 文字のように送る)
  p('+', 'AR', '送信の終わり (メッセージの終了)'),
  p('(', 'KN', '指定した相手局だけ送信してください'),
  p('<SK>', 'SK', '交信の終了 (VA とも書く)'),
  p('=', 'BT', '区切り (文の切れ目)'),
  p('<AS>', 'AS', '少し待ってください'),
  p('<HH>', 'HH', '訂正 (直前の送信の誤り)'),
  p('<BK>', 'BK', 'ブレーク (略符号として続けて送る場合)'),
].filter((item, i, arr) => arr.findIndex((x) => x.label === item.label) === i);

const BY_LABEL = new Map(ABBREVIATIONS.map((x) => [x.label, x]));

/** 交信文の単語から意味を引く ('HW?' のような末尾の記号は無視) */
export function lookupAbbrev(word: string): Abbrev | undefined {
  const w = word.toUpperCase();
  return BY_LABEL.get(w) ?? BY_LABEL.get(w.replace(/[?.,]+$/, ''));
}
