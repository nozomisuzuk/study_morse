import { useEffect, useRef, useState } from 'preact/hooks';
import { audio } from '../../audio/engine';
import { displayText, tokenize } from '../../core/morse';
import { settings, updateSettings } from '../../state/store';
import { Card, ToggleField, TopBar } from '../components/common';
import { SpeedControl } from '../components/SpeedControl';
import { timingOf, toneOf } from '../hooks';

/** 好きな文を入力してモールスで聞く */
export function Free() {
  const s = settings.value;
  const [text, setText] = useState('CQ CQ DE JA1ABC JA1ABC K');
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [useConditions, setUseConditions] = useState(false);
  // 再生ループの途中で「くり返し」を切り替えられるよう、最新の値を ref で参照する
  const loopRef = useRef(loop);
  loopRef.current = loop;

  useEffect(() => () => audio.stop(), []);

  const play = async () => {
    setPlaying(true);
    let again = true;
    while (again) {
      const done = await audio.play([{ text, timing: timingOf() }], {
        tone: toneOf(),
        conditions: useConditions ? settings.value.conditions : undefined,
      });
      again = done && loopRef.current;
      if (again) await new Promise((r) => setTimeout(r, 800));
    }
    setPlaying(false);
  };

  const presets = [
    { label: 'CQ', text: 'CQ CQ CQ DE JA1ABC JA1ABC JA1ABC PSE K' },
    { label: 'PARIS', text: 'PARIS PARIS PARIS' },
    { label: 'VVV', text: 'VVV VVV VVV' },
    { label: '数字', text: '1234567890' },
    { label: '記号', text: '. , ? / <BT> <AR> <SK> <KN>' },
  ];
  if (s.myCall) presets.unshift({ label: '自分のコール', text: `${s.myCall} ${s.myCall} ${s.myCall}` });

  const tokens = tokenize(text);

  return (
    <div>
      <TopBar title="自由に再生" back="/practice" />
      <Card>
        <label for="free-text" class="muted small">
          再生する文 (英数字と . , ? / など。略符号は &lt;AR&gt; &lt;SK&gt; &lt;BT&gt; &lt;KN&gt; のように書きます)
        </label>
        <textarea
          id="free-text"
          rows={4}
          value={text}
          autocapitalize="characters"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        />
        <p class="small mono" style={{ wordBreak: 'break-word' }}>
          {tokens.length ? displayText(tokens) : <span class="muted">(再生できる文字がありません)</span>}
        </p>
        <div class="chips">
          {presets.map((p) => (
            <button key={p.label} class="chip" style={{ fontFamily: 'var(--sans)', fontSize: '0.85rem' }} onClick={() => setText(p.text)}>
              {p.label}
            </button>
          ))}
        </div>
      </Card>
      <Card>
        <SpeedControl />
        <ToggleField label="くり返し再生" checked={loop} onChange={setLoop} />
        <ToggleField label="ノイズなどの受信環境を使う" checked={useConditions} onChange={setUseConditions} />
        <div class="field">
          <div class="field-head">
            <label>音の高さ</label>
            <output>{s.toneHz} Hz</output>
          </div>
          <input type="range" min={300} max={1000} step={10} value={s.toneHz} onInput={(e) => updateSettings({ toneHz: Number((e.target as HTMLInputElement).value) })} />
        </div>
      </Card>
      {playing ? (
        <button
          class="btn block big"
          onClick={() => {
            setLoop(false);
            audio.stop();
          }}
        >
          ■ 停止
        </button>
      ) : (
        <button class="btn primary block big" disabled={tokens.length === 0} onClick={() => void play()}>
          ▶ 再生
        </button>
      )}
    </div>
  );
}
