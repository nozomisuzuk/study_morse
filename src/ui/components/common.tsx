import type { ComponentChildren } from 'preact';
import { isProsign, tokenLabel } from '../../core/morse';
import { navigate } from '../router';

export function TopBar(props: { title: string; back?: string | (() => void); right?: ComponentChildren }) {
  const onBack = () => {
    if (typeof props.back === 'function') props.back();
    else if (props.back) navigate(props.back);
  };
  return (
    <header class="topbar">
      {props.back !== undefined && (
        <button class="icon-btn" aria-label="戻る" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}
      <h1>{props.title}</h1>
      {props.right}
    </header>
  );
}

export function Card(props: { title?: ComponentChildren; children: ComponentChildren; class?: string }) {
  return (
    <section class={`card ${props.class ?? ''}`}>
      {props.title && <h2>{props.title}</h2>}
      {props.children}
    </section>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label class="switch" aria-label={props.label}>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)} />
      <span />
    </label>
  );
}

export function ToggleField(props: { label: string; desc?: ComponentChildren; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div class="field">
      <div class="row">
        <div class="spacer">
          <div style={{ fontWeight: 600 }}>{props.label}</div>
          {props.desc && <p class="muted small" style={{ margin: 0 }}>{props.desc}</p>}
        </div>
        <Toggle checked={props.checked} onChange={props.onChange} label={props.label} />
      </div>
    </div>
  );
}

export function Segmented<T extends string>(props: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="segmented" role="radiogroup">
      {props.options.map((o) => (
        <button key={o.value} role="radio" aria-checked={props.value === o.value} class={props.value === o.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SliderField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  desc?: ComponentChildren;
  onChange: (v: number) => void;
}) {
  const id = `s-${props.label}`;
  return (
    <div class="field">
      <div class="field-head">
        <label for={id}>{props.label}</label>
        <output>{props.format ? props.format(props.value) : props.value}</output>
      </div>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onInput={(e) => props.onChange(Number((e.target as HTMLInputElement).value))}
      />
      {props.desc && <p class="muted small">{props.desc}</p>}
    </div>
  );
}

export function Stepper(props: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string }) {
  const step = props.step ?? 1;
  return (
    <div class="stepper">
      <button aria-label={`${props.label}を下げる`} onClick={() => props.onChange(Math.max(props.min, props.value - step))}>
        −
      </button>
      <output aria-label={props.label}>{props.value}</output>
      <button aria-label={`${props.label}を上げる`} onClick={() => props.onChange(Math.min(props.max, props.value + step))}>
        ＋
      </button>
    </div>
  );
}

export function ProgressBar(props: { value: number }) {
  return (
    <div class="progress" role="progressbar" aria-valuenow={Math.round(props.value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.max(0, Math.min(1, props.value)) * 100}%` }} />
    </div>
  );
}

/** トークン 1 つの表示 (略符号は上線つき) */
export function Tok(props: { t: string }) {
  if (isProsign(props.t)) return <span class="prosign">{tokenLabel(props.t)}</span>;
  return <>{props.t}</>;
}

export function TokenText(props: { tokens: readonly string[] }) {
  return (
    <>
      {props.tokens.map((t, i) =>
        t === ' ' ? <span key={i}> </span> : isProsign(t) ? <span key={i} class="prosign"> {tokenLabel(t)} </span> : <span key={i}>{t}</span>,
      )}
    </>
  );
}

export function percent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** 正答率 → 背景色 (赤 → 黄 → 緑) */
export function heatColor(acc: number): string {
  const a = Math.max(0, Math.min(1, acc));
  const hue = a < 0.5 ? 0 : (a - 0.5) * 2 * 140;
  return `hsla(${hue}, 70%, 50%, ${0.18 + 0.12 * (1 - Math.abs(a - 0.5) * 2)})`;
}
