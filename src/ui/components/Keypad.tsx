import { useState } from 'preact/hooks';
import { isProsign, tokenLabel } from '../../core/morse';

/**
 * 画面上のキーパッド。スマホの標準キーボードは予測変換や画面の隠れが邪魔なので専用のものを使う。
 *  - keys を渡すと、その文字だけを大きく並べる (Koch の練習中など)
 *  - 渡さないと英数字・記号の全キー
 */
export interface KeypadProps {
  keys?: readonly string[];
  onKey: (token: string) => void;
  onBackspace?: () => void;
  onSpace?: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  disabled?: boolean;
  /** 正解を一瞬光らせるキー */
  flash?: string | null;
}

const FULL_ROWS: readonly (readonly string[])[] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '/'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '.', ',', '?'],
];
const PROSIGN_ROW = ['=', '+', '(', '<SK>'];

export function Keypad(props: KeypadProps) {
  const [pressed, setPressed] = useState<string | null>(null);

  const press = (id: string, action: () => void) => (e: PointerEvent) => {
    e.preventDefault();
    if (props.disabled) return;
    setPressed(id);
    setTimeout(() => setPressed((p) => (p === id ? null : p)), 120);
    action();
  };

  const key = (t: string) => (
    <button
      key={t}
      class={`key ${pressed === t ? 'pressed' : ''} ${props.flash === t ? 'flash-ok' : ''}`}
      aria-label={isProsign(t) ? `略符号 ${tokenLabel(t)}` : t}
      onPointerDown={press(t, () => props.onKey(t))}
      disabled={props.disabled}
    >
      {isProsign(t) ? <span class="prosign">{tokenLabel(t)}</span> : t}
    </button>
  );

  const fnRow = (
    <div class="krow">
      {props.onSpace && (
        <button class="key fn wide" onPointerDown={press('space', props.onSpace)} disabled={props.disabled} aria-label="空白">
          空白
        </button>
      )}
      {props.onBackspace && (
        <button class="key fn" onPointerDown={press('bs', props.onBackspace)} disabled={props.disabled} aria-label="1 文字消す">
          ⌫
        </button>
      )}
      {props.onSubmit && (
        <button class="key fn submit wide" onPointerDown={press('ok', props.onSubmit)} disabled={props.disabled}>
          {props.submitLabel ?? '決定'}
        </button>
      )}
    </div>
  );

  if (props.keys) {
    return (
      <div class="keypad">
        <div class="kgrid">{props.keys.map(key)}</div>
        {fnRow}
      </div>
    );
  }
  return (
    <div class="keypad full">
      {FULL_ROWS.map((row, i) => (
        <div key={i} class="kgrid">
          {row.map(key)}
        </div>
      ))}
      <div class="krow">{PROSIGN_ROW.map(key)}</div>
      {fnRow}
    </div>
  );
}
