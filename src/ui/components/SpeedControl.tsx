import { settings, updateSettings } from '../../state/store';
import { Stepper } from './common';

/** 練習画面で文字速度・実効速度をその場で変えるための小さな操作部 */
export function SpeedControl() {
  const s = settings.value;
  return (
    <div class="row wrap small" style={{ justifyContent: 'space-between' }}>
      <div class="row">
        <span class="muted">文字</span>
        <Stepper label="文字速度" value={s.charWpm} min={5} max={50} onChange={(v) => updateSettings({ charWpm: v, effWpm: Math.min(s.effWpm, v) })} />
      </div>
      <div class="row">
        <span class="muted">実効</span>
        <Stepper label="実効速度" value={s.effWpm} min={3} max={s.charWpm} onChange={(v) => updateSettings({ effWpm: v })} />
        <span class="muted">WPM</span>
      </div>
    </div>
  );
}
