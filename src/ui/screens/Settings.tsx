import { useState } from 'preact/hooks';
import { audio } from '../../audio/engine';
import { spacing } from '../../core/timing';
import {
  PRESETS,
  exportBackup,
  importBackup,
  resetProgress,
  settings,
  today,
  updateSettings,
  type ConditionsPreset,
} from '../../state/store';
import { Card, Segmented, SliderField, ToggleField, TopBar } from '../components/common';
import { timingOf, toneOf } from '../hooks';
import { checkForUpdate } from '../../pwa';

export function Settings() {
  const s = settings.value;
  const [msg, setMsg] = useState<string | null>(null);
  const [updMsg, setUpdMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const checkUpdate = async () => {
    setChecking(true);
    setUpdMsg(null);
    const r = await checkForUpdate();
    setChecking(false);
    setUpdMsg(
      r === 'found'
        ? '新しいバージョンを見つけました。ダウンロードが終わると自動で読み込み直します。'
        : r === 'latest'
          ? 'これが最新版です。'
          : r === 'offline'
            ? 'オフラインのため確認できませんでした。'
            : 'この環境ではアップデートの確認ができません。',
    );
  };
  const sp = spacing(timingOf(s));

  const setPreset = (p: ConditionsPreset) => {
    if (p === 'custom') updateSettings({ conditionsPreset: p });
    else updateSettings({ conditionsPreset: p, conditions: PRESETS[p] });
  };
  const setCond = (patch: Partial<typeof s.conditions>) => updateSettings({ conditionsPreset: 'custom', conditions: { ...s.conditions, ...patch } });

  const test = () => void audio.play([{ text: 'CQ DE JA1ABC K', timing: timingOf() }], { tone: toneOf() });
  const testConditions = () =>
    void audio.play([{ text: 'CQ CQ DE JA1ABC JA1ABC K', timing: timingOf() }], { tone: toneOf(), conditions: settings.value.conditions });

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportBackup(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study-morse-backup-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg('バックアップを書き出しました。');
  };

  const doImport = (file: File | undefined) => {
    if (!file) return;
    file
      .text()
      .then((t) => {
        importBackup(JSON.parse(t));
        setMsg('バックアップを読み込みました。');
      })
      .catch((e: unknown) => setMsg(`読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`));
  };

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div>
      <TopBar title="設定" />
      {msg && <div class="notice">{msg}</div>}

      <Card title="速度">
        <SliderField
          label="文字速度"
          value={s.charWpm}
          min={5}
          max={50}
          format={(v) => `${v} WPM`}
          desc={`1 文字の中の速さ。短点 ${Math.round(sp.unit * 1000)} ms。音の形を保つため 18〜20 WPM 以上がおすすめ。`}
          onChange={(v) => updateSettings({ charWpm: v, effWpm: Math.min(s.effWpm, v) })}
        />
        <SliderField
          label="実効速度"
          value={s.effWpm}
          min={3}
          max={s.charWpm}
          format={(v) => `${v} WPM`}
          desc={`文字間・語間を広げた全体の速さ (Farnsworth)。現在の文字間 ${Math.round(sp.charGap * 1000)} ms、語間 ${Math.round(sp.wordGap * 1000)} ms。`}
          onChange={(v) => updateSettings({ effWpm: v })}
        />
        <button class="btn block" onClick={test}>
          ▶ この速さで試聴
        </button>
      </Card>

      <Card title="音">
        <SliderField label="音の高さ" value={s.toneHz} min={300} max={1000} step={10} format={(v) => `${v} Hz`} desc="400〜800 Hz が聞きやすい人が多いです。" onChange={(v) => updateSettings({ toneHz: v })} />
        <SliderField label="音量" value={s.volume} min={0.05} max={1} step={0.05} format={pct} onChange={(v) => updateSettings({ volume: v })} />
        <SliderField
          label="立ち上がり時間"
          value={s.riseMs}
          min={2}
          max={10}
          format={(v) => `${v} ms`}
          desc="短いと硬い音、長いと柔らかい音。短すぎるとクリック音が出ます。"
          onChange={(v) => updateSettings({ riseMs: v })}
        />
      </Card>

      <Card title="Koch 講座">
        <SliderField label="1 グループの文字数" value={s.groupLen} min={2} max={8} format={(v) => `${v} 文字`} onChange={(v) => updateSettings({ groupLen: v })} />
        <SliderField
          label="1 回のグループ数"
          value={s.groupsPerSession}
          min={5}
          max={60}
          step={5}
          format={(v) => `${v} 回`}
          desc={`1 回で ${s.groupLen * s.groupsPerSession} 文字。合格判定には 25 文字以上が必要です。`}
          onChange={(v) => updateSettings({ groupsPerSession: v })}
        />
        <ToggleField label="答え合わせのあと自動で次へ" checked={s.autoAdvance} onChange={(v) => updateSettings({ autoAdvance: v })} />
        <ToggleField
          label="新しい文字の符号 (・－) を表示"
          desc="Koch 法では音だけで覚えるのが基本なので、最初は OFF をおすすめします。"
          checked={s.showCodes}
          onChange={(v) => updateSettings({ showCodes: v })}
        />
      </Card>

      <Card title="受信環境 (ノイズ・フェージング・混信)">
        <p class="muted small" style={{ marginTop: 0 }}>
          実際のバンドに近い条件で練習します。どの練習で使うかは各練習画面で切り替えられます (初期設定では交信の練習のみ ON)。
        </p>
        <Segmented
          value={s.conditionsPreset}
          options={[
            { value: 'clear', label: 'なし' },
            { value: 'normal', label: '普通' },
            { value: 'hard', label: '厳しい' },
            { value: 'custom', label: 'カスタム' },
          ]}
          onChange={setPreset}
        />
        <SliderField label="ノイズ (QRN)" value={s.conditions.noise} min={0} max={1} step={0.05} format={pct} desc="受信機の CW フィルタを通したようなバンドノイズ。" onChange={(v) => setCond({ noise: v })} />
        <SliderField label="フェージング (QSB)" value={s.conditions.qsb} min={0} max={1} step={0.05} format={pct} desc="信号がゆっくり強くなったり弱くなったりします。" onChange={(v) => setCond({ qsb: v })} />
        <SliderField label="混信 (QRM)" value={s.conditions.qrm} min={0} max={1} step={0.05} format={pct} desc="少し離れた周波数で別の局が送信しています。" onChange={(v) => setCond({ qrm: v })} />
        <SliderField label="手送りのクセ" value={s.conditions.fist} min={0} max={1} step={0.05} format={pct} desc="長点・短点の比や間隔の揺らぎ。" onChange={(v) => setCond({ fist: v })} />
        <button class="btn block" onClick={testConditions}>
          ▶ この条件で試聴
        </button>
      </Card>

      <Card title="その他">
        <div class="field">
          <label for="mycall" style={{ fontWeight: 600 }}>
            自分のコールサイン (任意)
          </label>
          <input
            id="mycall"
            type="text"
            value={s.myCall}
            placeholder="例: JA1ABC"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => updateSettings({ myCall: (e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9/]/g, '') })}
          />
          <p class="muted small">「自分の CQ に応答が来る」練習と、自由再生で使います。端末の中だけに保存されます。</p>
        </div>
        <ToggleField label="練習中は画面を消さない" checked={s.keepAwake} onChange={(v) => updateSettings({ keepAwake: v })} />
        <div class="field">
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>表示</div>
          <Segmented
            value={s.theme}
            options={[
              { value: 'system', label: '端末に合わせる' },
              { value: 'dark', label: 'ダーク' },
              { value: 'light', label: 'ライト' },
            ]}
            onChange={(v) => updateSettings({ theme: v })}
          />
        </div>
      </Card>

      <Card title="データ">
        <p class="muted small" style={{ marginTop: 0 }}>
          成績はこの端末のブラウザ内に保存されています。ブラウザのデータを消すと失われるので、ときどきバックアップしてください。
        </p>
        <div class="btn-row">
          <button class="btn" onClick={doExport}>
            バックアップを書き出す
          </button>
          <label class="btn" style={{ textAlign: 'center' }}>
            バックアップを読み込む
            <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => doImport((e.target as HTMLInputElement).files?.[0])} />
          </label>
        </div>
        <button
          class="btn block danger"
          style={{ marginTop: '10px' }}
          onClick={() => {
            if (confirm('学習の記録 (レッスンの進み具合・成績) をすべて消します。よろしいですか？')) {
              resetProgress();
              setMsg('学習の記録を消しました。');
            }
          }}
        >
          学習の記録をリセット
        </button>
      </Card>
      <div class="center" style={{ margin: '8px 0 16px' }}>
        <p class="muted small" style={{ margin: '0 0 8px' }}>
          モールス受信トレーナー v{__APP_VERSION__}
        </p>
        <button class="btn" onClick={() => void checkUpdate()} disabled={checking}>
          {checking ? '確認中…' : 'アップデートを確認'}
        </button>
        {updMsg && (
          <p class="small" role="status" style={{ margin: '8px 0 0' }}>
            {updMsg}
          </p>
        )}
      </div>
    </div>
  );
}
