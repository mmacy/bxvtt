import type { LucideIcon } from 'lucide-react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Axe,
  Bell,
  BookOpen,
  BowArrow,
  Castle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  CircleAlert,
  CircleCheck,
  Clock,
  Cloud,
  Coins,
  Command,
  Compass,
  Copy,
  Crosshair,
  Crown,
  Dices,
  DoorClosed,
  DoorClosedLocked,
  DoorOpen,
  Download,
  Ear,
  Ellipsis,
  EllipsisVertical,
  Eraser,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Flag,
  FlaskRound,
  Footprints,
  Gem,
  GripVertical,
  Hand,
  Heart,
  Hourglass,
  House,
  Info,
  Key,
  Link,
  Lock,
  LockOpen,
  LogOut,
  Map,
  Maximize2,
  Menu,
  MessageSquare,
  MessageSquareLock,
  Minimize2,
  Minus,
  Moon,
  MousePointer2,
  NotebookPen,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  PenLine,
  Pencil,
  Play,
  Plus,
  Radar,
  RefreshCw,
  Redo2,
  RotateCw,
  Ruler,
  Save,
  Scroll,
  ScrollText,
  Search,
  Send,
  Settings,
  Shield,
  SkipForward,
  Skull,
  Sparkles,
  StepBack,
  StepForward,
  Sun,
  Sword,
  Swords,
  Tent,
  Trash2,
  TriangleAlert,
  Undo2,
  Upload,
  User,
  Users,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { cx } from '../lib/cx';
import { gameIconNodes, type DrawnGameIconName } from './gameIcons';
import styles from './Icon.module.css';

const lucideIcons = {
  // Interface
  menu: Menu,
  close: X,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevrons-up-down': ChevronsUpDown,
  search: Search,
  plus: Plus,
  minus: Minus,
  settings: Settings,
  user: User,
  users: Users,
  more: Ellipsis,
  'more-vertical': EllipsisVertical,
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
  success: CircleCheck,
  copy: Copy,
  trash: Trash2,
  edit: Pencil,
  send: Send,
  message: MessageSquare,
  whisper: MessageSquareLock,
  bell: Bell,
  'log-out': LogOut,
  'external-link': ExternalLink,
  link: Link,
  upload: Upload,
  download: Download,
  save: Save,
  undo: Undo2,
  redo: Redo2,
  refresh: RefreshCw,
  rotate: RotateCw,
  'eye-off': EyeOff,
  lock: Lock,
  unlock: LockOpen,
  pointer: MousePointer2,
  ruler: Ruler,
  draw: PenLine,
  eraser: Eraser,
  ping: Radar,
  target: Crosshair,
  fog: Cloud,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut,
  maximize: Maximize2,
  minimize: Minimize2,
  'dock-open': PanelRightOpen,
  'dock-close': PanelRightClose,
  grip: GripVertical,
  clock: Clock,
  sun: Sun,
  moon: Moon,
  book: BookOpen,
  journal: NotebookPen,
  feed: ScrollText,
  compass: Compass,
  hourglass: Hourglass,
  play: Play,
  pause: Pause,
  'step-back': StepBack,
  'step-forward': StepForward,
  'skip-forward': SkipForward,
  flag: Flag,
  referee: Crown,
  command: Command,
  filter: Filter,
  sort: ArrowUpDown,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  hand: Hand,
  home: House,
  dice: Dices,
  // Game objects that lucide already draws on the same grid
  'weapon-sword': Sword,
  'weapon-axe': Axe,
  'weapon-bow': BowArrow,
  shield: Shield,
  door: DoorClosed,
  'door-open': DoorOpen,
  'door-locked': DoorClosedLocked,
  potion: FlaskRound,
  scroll: Scroll,
  wand: WandSparkles,
  coins: Coins,
  gem: Gem,
  skull: Skull,
  battle: Swords,
  heart: Heart,
  spell: Sparkles,
  footprints: Footprints,
  eye: Eye,
  ear: Ear,
  key: Key,
  map: Map,
  rest: Tent,
  town: Castle,
} satisfies Record<string, LucideIcon>;

type LucideIconName = keyof typeof lucideIcons;

export type IconName = LucideIconName | DrawnGameIconName;

/** Every icon name, for pickers and the kit gallery. */
export const iconNames = [
  ...(Object.keys(lucideIcons) as LucideIconName[]),
  ...(Object.keys(gameIconNodes) as DrawnGameIconName[]),
] as readonly IconName[];

export const classIconNames = {
  cleric: 'class-cleric',
  dwarf: 'class-dwarf',
  elf: 'class-elf',
  fighter: 'class-fighter',
  halfling: 'class-halfling',
  'magic-user': 'class-magic-user',
  thief: 'class-thief',
} as const satisfies Record<string, IconName>;

export type CharacterClassKey = keyof typeof classIconNames;

export type IconSize = 12 | 14 | 16 | 18 | 20 | 24 | 32 | 40 | 48;

export interface IconProps {
  name: IconName;
  /** Size in pixels. Defaults to 16. */
  size?: IconSize | number;
  /**
   * Accessible name. Leave it out when the icon sits next to text that names the action;
   * the icon is then hidden from assistive technology.
   */
  label?: string;
  /** Stroke width in pixels at the rendered size. Defaults to a weight tuned for the size. */
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

function defaultStroke(size: number): number {
  return size <= 24 ? 1.75 : 1.5;
}

/** Renders an interface or game icon by name. */
export function Icon({ name, size = 16, label, strokeWidth, className, style }: IconProps) {
  const stroke = strokeWidth ?? defaultStroke(size);
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  if (name in gameIconNodes) {
    const node = gameIconNodes[name as DrawnGameIconName];
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={(stroke * 24) / size}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cx(styles.icon, className)}
        style={style}
        focusable="false"
        {...a11y}
      >
        {node}
      </svg>
    );
  }
  const Lucide = lucideIcons[name as LucideIconName];
  return (
    <Lucide
      size={size}
      strokeWidth={stroke}
      absoluteStrokeWidth
      className={cx(styles.icon, className)}
      style={style}
      focusable="false"
      {...a11y}
    />
  );
}
