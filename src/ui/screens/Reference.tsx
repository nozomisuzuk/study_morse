import { useMemo, useState } from 'preact/hooks';
import { audio } from '../../audio/engine';
import { ABBREVIATIONS, type AbbrevCategory } from '../../core/data/abbreviations';
import { generateQso } from '../../core/generators';
import { DIGITS, LETTERS, MORSE, displayText, prettyCode, tokenLabel, tokenize } from '../../core/morse';
import { createRng } from '../../core/rng';
import { settings } from '../../state/store';
import { Card, Segmented, TopBar } from '../components/common';
import { toneOf } from '../hooks';
import { navigate, route } from '../router';

type Tab = 'codes' | 'abbr' | 'qso' | 'guide';

const PUNCT: { t: string; name: string }[] = [
  { t: '.', name: 'ピリオド' },
  { t: ',', name: 'カンマ' },
  { t: '?', name: '疑問符' },
  { t: '/', name: '斜線' },
  { t: '-', name: 'ハイフン' },
  { t: ':', name: 'コロン' },
  { t: "'", name: 'アポストロフィ' },
  { t: '"', name: '引用符' },
  { t: ')', name: '閉じ括弧' },
  { t: '@', name: 'アットマーク' },
];
const PROSIGNS: { t: string; name: string }[] = [
  { t: '+', name: '送信終わり' },
  { t: '=', name: '区切り' },
  { t: '(', name: '指定局どうぞ' },
  { t: '<SK>', name: '交信終了' },
  { t: '<AS>', name: '待て' },
  { t: '<BK>', name: 'ブレーク' },
  { t: '<HH>', name: '訂正' },
  { t: '<KA>', name: '開始' },
  { t: '<SN>', name: '了解' },
];

function playToken(t: string) {
  const s = settings.value;
  void audio.playText(t, { charWpm: s.charWpm, effWpm: s.charWpm }, toneOf());
}

export function Reference() {
  // タブは URL (#/ref?tab=...) から決める。ほかの画面のリンクから開いたときも同期させるため
  const q = route.value.query.get('tab');
  const tab: Tab = q === 'abbr' || q === 'qso' || q === 'guide' ? q : 'codes';
  const select = (t: Tab) => navigate(`/ref?tab=${t}`);
  return (
    <div>
      <TopBar title="資料" />
      <Segmented
        value={tab}
        options={[
          { value: 'codes', label: '符号表' },
          { value: 'abbr', label: '略語' },
          { value: 'qso', label: '交信の流れ' },
          { value: 'guide', label: '学習ガイド' },
        ]}
        onChange={select}
      />
      {tab === 'codes' && <Codes />}
      {tab === 'abbr' && <Abbr />}
      {tab === 'qso' && <QsoFlow />}
      {tab === 'guide' && <Guide />}
    </div>
  );
}

function CodeCell(props: { t: string; name?: string }) {
  return (
    <button class="code-cell" onClick={() => playToken(props.t)} aria-label={`${tokenLabel(props.t)} を聞く`}>
      <b class={props.t.length > 1 || ['+', '=', '('].includes(props.t) ? 'prosign' : ''}>{tokenLabel(props.t)}</b>
      <span>{prettyCode(MORSE[props.t])}</span>
      {props.name && <div class="muted" style={{ fontSize: '0.7rem' }}>{props.name}</div>}
    </button>
  );
}

function Codes() {
  return (
    <>
      <p class="muted small">タップすると文字速度で再生します。練習中は表を見ずに、音のリズムで覚えるのがおすすめです。</p>
      <Card title="英字">
        <div class="code-grid">
          {LETTERS.map((c) => (
            <CodeCell key={c} t={c} />
          ))}
        </div>
      </Card>
      <Card title="数字">
        <div class="code-grid">
          {DIGITS.map((c) => (
            <CodeCell key={c} t={c} />
          ))}
        </div>
      </Card>
      <Card title="記号">
        <div class="code-grid">
          {PUNCT.map((p) => (
            <CodeCell key={p.t} t={p.t} name={p.name} />
          ))}
        </div>
      </Card>
      <Card title="略符号 (2 文字を間を空けずに続けて送る)">
        <div class="code-grid">
          {PROSIGNS.map((p) => (
            <CodeCell key={p.t} t={p.t} name={p.name} />
          ))}
        </div>
        <p class="muted small">AR は「+」、BT は「=」、KN は「(」と同じ符号です。</p>
      </Card>
    </>
  );
}

const CAT_LABEL: Record<AbbrevCategory, string> = { q: 'Q 符号', abbr: '略語', prosign: '略符号' };

function Abbr() {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const k = q.trim().toUpperCase();
    return ABBREVIATIONS.filter((a) => !k || a.label.includes(k) || a.meaning.includes(q.trim()) || (a.en ?? '').toUpperCase().includes(k));
  }, [q]);
  const s = settings.value;
  return (
    <>
      <div style={{ margin: '12px 0' }}>
        <input type="text" placeholder="検索 (例: QTH、ありがとう)" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="略語を検索" />
      </div>
      {(['abbr', 'q', 'prosign'] as AbbrevCategory[]).map((cat) => {
        const items = list.filter((a) => a.category === cat);
        if (!items.length) return null;
        return (
          <Card key={cat} title={CAT_LABEL[cat]}>
            {items.map((a) => (
              <button
                key={a.label}
                class="list-item"
                onClick={() => void audio.playText(a.code, { charWpm: s.charWpm, effWpm: s.effWpm }, toneOf())}
              >
                <span class={`code ${a.category === 'prosign' ? 'prosign' : ''}`}>{a.label}</span>
                <span class="small">
                  {a.meaning}
                  {a.en && <span class="muted"> ({a.en})</span>}
                </span>
              </button>
            ))}
          </Card>
        );
      })}
    </>
  );
}

function QsoFlow() {
  // 毎回同じ例を見せるため、乱数の種を固定する
  const qso = useMemo(() => generateQso('ragchew', createRng(20260101), { hour: 20 }), []);
  const s = settings.value;
  return (
    <>
      <Card title="CW の交信 (QSO) の基本形">
        <p class="small" style={{ marginTop: 0 }}>
          国内の CW 交信の多くは、決まった順番で情報を交換する定型の形 (ラバースタンプ QSO) です。流れを知っておくと、次に何が来るか予想しながら聞けるので、聞き取りがずっと楽になります。
        </p>
        <ol class="small" style={{ paddingLeft: '1.3em' }}>
          <li>
            <b>CQ</b>: 「CQ CQ DE (自局) (自局) K」で相手を募集
          </li>
          <li>
            <b>応答</b>: 「(相手) DE (自局) K」でコールサインを送る
          </li>
          <li>
            <b>レポート交換</b>: RST・名前・QTH (所在地) を 2 回ずつ送ることが多い
          </li>
          <li>
            <b>設備・天気</b>: RIG (無線機)・出力・ANT・WX など (省略されることも)
          </li>
          <li>
            <b>終わり</b>: QSL の確認、73 (さようなら)、SK (交信終了)
          </li>
        </ol>
      </Card>
      <Card title="例 (タップで再生)">
        <div class="transcript">
          {qso.lines.map((line, i) => (
            <div key={i} class={`line ${line.station}`}>
              <div class="row">
                <span class="who spacer">{line.station === 'A' ? qso.stations.A.call : qso.stations.B.call}</span>
                <button
                  class="btn"
                  style={{ minHeight: '32px', padding: '2px 10px' }}
                  onClick={() => void audio.playText(line.text, { charWpm: s.charWpm, effWpm: s.effWpm }, toneOf())}
                  aria-label="この行を再生"
                >
                  ▶
                </button>
              </div>
              <div class="en">{displayText(tokenize(line.text))}</div>
              <div class="ja">{line.ja}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="RST レポート">
        <p class="small" style={{ marginTop: 0 }}>
          相手の信号の状態を 3 桁の数字で伝えます。<b>R</b> = 了解度 (1〜5)、<b>S</b> = 信号の強さ (1〜9)、<b>T</b> = 音調 (1〜9)。599
          は「完全に了解でき、非常に強く、きれいな音」。
        </p>
        <p class="small">
          コンテストなどでは数字を文字で略す <b>カットナンバー</b> がよく使われます。代表的なのは <span class="mono">N = 9</span>、
          <span class="mono">T = 0</span>、<span class="mono">A = 1</span>、<span class="mono">E = 5</span> で、599 は <span class="mono">5NN</span> と送られます。
        </p>
      </Card>
    </>
  );
}

function Guide() {
  return (
    <Card class="guide">
      <h3 style={{ marginTop: 0 }}>Koch 法のしくみ</h3>
      <p>
        遅い速度で「・－ は A」のように符号の形で覚えると、頭の中で短点・長点を数えて表と照らし合わせる癖がつきます。この変換は速度が上がると追いつかなくなるため、10 WPM
        前後で伸び悩む原因になります。
      </p>
      <p>
        Koch 法は、最初から実用的な文字速度 (20 WPM 前後) で聞きます。数える余裕がないので、音のリズム全体を 1 つの「音の形」として覚えることになります。2
        文字から始め、正答率 90% を超えたら 1 文字ずつ増やすので、常に「少しだけ難しい」状態で練習が続きます。
      </p>

      <h3>文字速度と実効速度</h3>
      <ul>
        <li>
          <b>WPM</b>: 1 分間に送れる語数。標準語 "PARIS" (50 単位) を基準にし、20 WPM で短点 60 ms。欧文では 1 WPM ≒ 5 字/分です。
        </li>
        <li>
          <b>文字速度</b>: 1 文字の中の短点・長点の速さ。音の形が崩れないよう、下げずに保つのがコツです (初期値 20 WPM)。
        </li>
        <li>
          <b>実効速度</b>: 文字と文字の間・語と語の間を広げた、全体としての速さ (Farnsworth 方式)。考える時間が増えるので、最初はこちらを下げます (初期値 12
          WPM)。慣れてきたら 1〜2 WPM ずつ上げ、最終的に文字速度と同じにします。
        </li>
      </ul>

      <h3>毎日の進め方</h3>
      <ul>
        <li>1 回 10〜20 分を毎日。長時間を週 1 回より、短時間を毎日のほうが定着します。</li>
        <li>間違えても止まらないこと。分からない文字は飛ばして、次の文字に集中します (実際の受信でも同じです)。</li>
        <li>練習中に符号表を見ない。見たくなったら、その文字を「資料 → 符号表」で何度か聞いて音で確認します。</li>
        <li>合格しても不安定なら、同じレッスンを繰り返して構いません。</li>
        <li>レッスンの合間に「瞬時認識ドリル」で、聞いた瞬間に文字が浮かぶ反射を鍛えます (目標 0.5 秒以内)。</li>
      </ul>

      <h3>全文字を覚えたら — 実際の交信へ</h3>
      <ol>
        <li>
          <b>単語・略語</b>: CQ・DE・TNX・UR・RST・5NN・QTH・73 などを、文字の並びではなく「語の音」として覚えます。
        </li>
        <li>
          <b>コールサイン</b>: 交信でもコンテストでも、まず取るのはコールサインです。速度可変モードで限界速度を伸ばします。
        </li>
        <li>
          <b>交信 (QSO)</b>: CQ → 呼ばれる → 定型 QSO → コンテスト の順に。最初は「見ながら聞く」で流れをつかみ、慣れたら文を隠して聞きます。
        </li>
        <li>
          <b>受信環境</b>: 実際のバンドにはノイズ、フェージング (QSB)、混信 (QRM)、手送りのクセがあります。設定の「受信環境」を強くして練習します。
        </li>
        <li>
          <b>実際の電波を聞く</b>: 無線機や受信機で CW の交信をワッチ (聞くだけ) すると、最高の練習になります。最初はコールサインと RST だけ取れれば十分です。
        </li>
      </ol>

      <h3>このアプリのデータ</h3>
      <p>
        音の合成や採点はすべてスマホの中で行い、成績などのデータを外部に送ることはありません。一度読み込めばオフラインでも動作します (ネットにつながっているときは、アプリの更新だけを確認します)。成績は端末のブラウザ内に保存されるので、機種変更の前などは「設定 → バックアップ」で書き出してください。
      </p>
    </Card>
  );
}
