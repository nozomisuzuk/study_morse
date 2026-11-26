import { KOCH_ORDER, MAX_LESSON } from '../../core/koch';
import { topConfusions } from '../../core/stats';
import { progress, streakDays, today } from '../../state/store';
import { Card, ProgressBar, Tok, TopBar, heatColor, percent } from '../components/common';

export function Stats() {
  const p = progress.value;
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return { key: today(d), label: `${d.getMonth() + 1}/${d.getDate()}`, sec: p.practiceLog[today(d)] ?? 0 };
  });
  const maxSec = Math.max(60, ...days.map((d) => d.sec));
  const totalMin = Math.round(Object.values(p.practiceLog).reduce((a, b) => a + b, 0) / 60);
  const recent = [...p.kochHistory].reverse().slice(0, 10);
  const conf = topConfusions(p.charStats, 8);
  const lastIcr = p.icrHistory[p.icrHistory.length - 1];
  const qsoRecent = p.qsoHistory.slice(-20);
  const qsoAcc = qsoRecent.length ? qsoRecent.reduce((a, q) => a + q.correct, 0) / qsoRecent.reduce((a, q) => a + q.total, 0) : null;

  return (
    <div>
      <TopBar title="記録" />
      <Card>
        <div class="stat-row">
          <div>
            <b>{totalMin}</b>
            <span>合計 (分)</span>
          </div>
          <div>
            <b>{streakDays(p.practiceLog)}</b>
            <span>連続日数</span>
          </div>
          <div>
            <b>
              {p.kochLesson}/{MAX_LESSON}
            </b>
            <span>Koch レッスン</span>
          </div>
        </div>
      </Card>

      <Card title="この 2 週間の練習時間">
        <div class="bars" aria-label="日ごとの練習時間">
          {days.map((d) => (
            <div key={d.key} class={`bar ${d.sec ? '' : 'empty'}`} title={`${d.label}: ${Math.round(d.sec / 60)} 分`}>
              <div style={{ height: `${(d.sec / maxSec) * 100}%` }} />
              <span>{d.label.split('/')[1]}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="文字ごとの正答率 (最近)">
        <p class="muted small" style={{ marginTop: 0 }}>
          直近の結果を重く見た正答率です (出題が 10 回未満の文字は単純な正答率)。下の数字は瞬時認識ドリルの平均反応時間。
        </p>
        <div class="heat">
          {KOCH_ORDER.map((c) => {
            const s = p.charStats[c];
            // 出題数が少ないうちは移動平均が初期値に引っ張られるので、単純な正答率を見せる
            const acc = s ? (s.seen < 10 ? s.correct / s.seen : s.ema) : 0;
            return (
              <div key={c} class="heat-cell" style={{ background: s ? heatColor(acc) : 'transparent', opacity: s ? 1 : 0.4 }}>
                <b>
                  <Tok t={c} />
                </b>
                <span>{s ? percent(acc) : '—'}</span>
                {s?.rtEma !== undefined && (
                  <span style={{ display: 'block' }} class="muted">
                    {(s.rtEma / 1000).toFixed(2)}s
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {conf.length > 0 && (
        <Card title="よくある聞き間違え">
          {conf.map((c) => (
            <div key={c.ref + c.hyp} class="row small" style={{ padding: '4px 0' }}>
              <span class="mono" style={{ fontWeight: 700, minWidth: '6em' }}>
                <Tok t={c.ref} /> → <Tok t={c.hyp} />
              </span>
              <div class="spacer">
                <ProgressBar value={c.count / conf[0].count} />
              </div>
              <span class="muted">{c.count} 回</span>
            </div>
          ))}
        </Card>
      )}

      <Card title="Koch 講座の履歴">
        {recent.length === 0 ? (
          <p class="muted small">まだ記録がありません。</p>
        ) : (
          recent.map((h, i) => (
            <div key={i} class="row small" style={{ padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ minWidth: '5.5em' }}>{new Date(h.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}</span>
              <span style={{ minWidth: '5em' }}>
                レッスン {h.lesson}
                {h.mode === 'group' && <span class="muted"> (確認用)</span>}
              </span>
              <div class="spacer">
                <ProgressBar value={h.accuracy} />
              </div>
              <span class="mono" style={{ color: h.accuracy >= 0.9 ? 'var(--ok)' : 'var(--text)', minWidth: '3em', textAlign: 'right' }}>
                {percent(h.accuracy)}
              </span>
            </div>
          ))
        )}
      </Card>

      <Card title="その他の練習">
        <div class="stack small">
          <div class="row">
            <span class="spacer">瞬時認識 (前回)</span>
            <b>{lastIcr ? `${percent(lastIcr.accuracy)} / ${(lastIcr.avgRt / 1000).toFixed(2)} 秒` : '—'}</b>
          </div>
          <div class="row">
            <span class="spacer">コールサイン 自己ベスト</span>
            <b>{p.callsignBest ? `${p.callsignBest.score} 点 (${p.callsignBest.maxWpm} WPM)` : '—'}</b>
          </div>
          <div class="row">
            <span class="spacer">交信の聞き取り (直近 20 回)</span>
            <b>{qsoAcc === null ? '—' : percent(qsoAcc)}</b>
          </div>
        </div>
      </Card>
    </div>
  );
}
