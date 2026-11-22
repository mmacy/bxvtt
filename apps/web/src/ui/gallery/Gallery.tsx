import { useEffect, useState } from 'react';
import { SegmentedControl } from '../components/Choice';
import { Wordmark } from '../layout/Wordmark';
import { ActionsSection } from './ActionsSection';
import { DiceSection } from './DiceSection';
import { DisplaySection } from './DisplaySection';
import { FormsSection } from './FormsSection';
import { GameSection } from './GameSection';
import { IconsSection } from './IconsSection';
import { LayoutSection } from './LayoutSection';
import { OverlaysSection } from './OverlaysSection';
import { TokensSection } from './TokensSection';
import styles from './Gallery.module.css';

const contents = [
  { id: 'color', label: 'Color' },
  { id: 'type', label: 'Typography' },
  { id: 'space', label: 'Space and depth' },
  { id: 'motion', label: 'Motion and focus' },
  { id: 'icons', label: 'Icons' },
  { id: 'actions', label: 'Buttons and links' },
  { id: 'forms', label: 'Form controls' },
  { id: 'overlays', label: 'Navigation and overlays' },
  { id: 'display', label: 'Display and surfaces' },
  { id: 'game', label: 'Game pieces' },
  { id: 'dice', label: 'Dice' },
  { id: 'layout', label: 'Layout' },
];

/**
 * The kit gallery: every token and component in its states. Mount it at /kit.
 * It expects KitProvider (or ToastProvider) above it for the toast demos.
 */
export function KitGallery() {
  const [theme, setTheme] = useState('candlelight');
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    return () => {
      delete root.dataset.theme;
    };
  }, [theme]);
  return (
    <div className={styles.gallery}>
      <aside className={styles.index}>
        <div className={styles.indexInner}>
          <Wordmark size="md" />
          <p className={styles.indexTagline}>Design system and component kit</p>
          <nav aria-label="Kit sections">
            <ol className={styles.indexList}>
              {contents.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className={styles.indexLink}>
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className={styles.themeSwitch}>
            <SegmentedControl
              aria-label="Theme"
              size="sm"
              value={theme}
              onValueChange={setTheme}
              options={[
                { value: 'candlelight', label: 'Candlelight', icon: 'moon' },
                { value: 'daylight', label: 'Daylight', icon: 'sun' },
              ]}
            />
          </div>
        </div>
      </aside>
      <main className={styles.content}>
        <header className={styles.hero}>
          <h1 className={styles.heroTitle}>A candlelit table for B/X</h1>
          <p className={styles.heroText}>
            Dark, warm chrome that steps back from the map. Brass for the one thing you should press. Vellum
            for anything that would be paper at a real table. Import components from <code>@/ui</code>, and
            read <code>src/ui/README.md</code> before you build a screen.
          </p>
        </header>
        <TokensSection />
        <IconsSection />
        <ActionsSection />
        <FormsSection />
        <OverlaysSection />
        <DisplaySection />
        <GameSection />
        <DiceSection />
        <LayoutSection />
      </main>
    </div>
  );
}
