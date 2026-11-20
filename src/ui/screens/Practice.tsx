import { MAX_LESSON } from '../../core/koch';
import { progress } from '../../state/store';
import { TopBar } from '../components/common';
import { navigate } from '../router';

const ITEMS: { path: string; title: string; desc: string; tag?: (lesson: number) => string | null }[] = [
  { path: '/koch', title: 'Koch 法 講座', desc: '2 文字から始めて 1 文字ずつ増やす。基礎はここ。' },
  { path: '/icr', title: '瞬時認識ドリル', desc: '1 文字を聞いた瞬間に答える。反応時間を計測。' },
  {
    path: '/words',
    title: '単語・略語',
    desc: 'CQ・DE・TNX・QTH など交信に出る語の音の形に慣れる。',
    tag: (l) => (l < 8 ? 'もう少し文字を覚えてから' : null),
  },
  { path: '/calls', title: 'コールサイン', desc: 'JA・海外局のコールサインを聞き取る。速度が自動で変化。', tag: (l) => (l < MAX_LESSON ? '数字を覚えてから' : null) },
  { path: '/qso', title: '交信 (QSO)', desc: 'CQ・定型 QSO・コンテストを聞いて内容を取る。', tag: (l) => (l < MAX_LESSON ? '全文字を覚えてから' : null) },
  { path: '/free', title: '自由に再生', desc: '好きな文をモールスで聞く。自分のコールサインなど。' },
];

export function Practice() {
  const lesson = progress.value.kochLesson;
  return (
    <div>
      <TopBar title="練習メニュー" />
      <div class="menu-grid">
        {ITEMS.map((it) => {
          const tag = it.tag?.(lesson) ?? null;
          return (
            <button key={it.path} class="menu-item" onClick={() => navigate(it.path === '/koch' ? `/koch?lesson=${lesson}` : it.path)}>
              <strong>{it.title}</strong>
              <span>{it.desc}</span>
              {tag && <span class="tag">おすすめ: {tag}</span>}
            </button>
          );
        })}
      </div>
      <p class="muted small">
        おすすめの順番: Koch 法講座で文字を覚える → 瞬時認識で反射を速く → 単語・略語 → コールサイン → 交信。受信環境 (ノイズ・フェージング・混信) は設定で変えられます。
      </p>
    </div>
  );
}
