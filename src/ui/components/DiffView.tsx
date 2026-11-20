import type { AlignOp } from '../../core/scoring';
import { Tok } from './common';

/** 送信された文字 (上段) と、間違えた入力 (下段, 取り消し線) を並べて表示する */
export function DiffView(props: { ops: readonly AlignOp[] }) {
  return (
    <div class="diff" aria-label="答え合わせ">
      {props.ops.map((op, i) => (
        <div key={i} class={`cell ${op.type}`}>
          <span class="ref">{op.type === 'ins' ? '·' : <Tok t={op.ref} />}</span>
          <span class="hyp">{op.type === 'sub' || op.type === 'ins' ? <Tok t={op.hyp} /> : op.type === 'del' ? '―' : ''}</span>
        </div>
      ))}
    </div>
  );
}
