// The bxvtt design system. Import components from '@/ui' and global styles once from main.tsx.

export * from './tokens';
export { cx } from './lib/cx';
export { colorIdForName, hashString, initialsForName } from './lib/identity';
export { useControllableState, useMediaQuery, useReducedMotion } from './lib/hooks';
export { MotionProvider, useKitReducedMotion } from './lib/motion';
export type { MotionProviderProps } from './lib/motion';

// Icons
export { Icon, iconNames, classIconNames } from './icons/Icon';
export type { IconName, IconProps, IconSize, CharacterClassKey } from './icons/Icon';

// Actions
export { Button, IconButton } from './components/Button';
export type { ButtonProps, ButtonSize, ButtonVariant, IconButtonProps } from './components/Button';
export { Link, LinkButton } from './components/Link';
export type { LinkButtonProps, LinkProps } from './components/Link';

// Form controls
export { Field, useFieldContext } from './components/Field';
export type { FieldProps } from './components/Field';
export { TextInput, SearchInput, Textarea } from './components/TextInput';
export type { TextInputProps, SearchInputProps, TextareaProps, InputSize } from './components/TextInput';
export { NumberInput } from './components/NumberInput';
export type { NumberInputProps } from './components/NumberInput';
export { Select } from './components/Select';
export type { SelectProps, SelectOption, SelectGroup } from './components/Select';
export { Combobox, defaultComboboxFilter } from './components/Combobox';
export type { ComboboxProps, ComboboxOption } from './components/Combobox';
export { Checkbox, Switch, RadioGroup, SegmentedControl, Slider } from './components/Choice';
export type {
  CheckboxProps,
  SwitchProps,
  RadioGroupProps,
  RadioOption,
  SegmentedControlProps,
  SegmentedOption,
  SliderProps,
} from './components/Choice';

// Navigation and overlays
export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/Tabs';
export type { TabsProps, TabsListProps, TabsTriggerProps, TabsContentProps } from './components/Tabs';
export { Dialog, DialogClose, ConfirmDialog, Drawer } from './components/Dialog';
export type { DialogProps, ConfirmDialogProps, DrawerProps, InitialFocus } from './components/Dialog';
export { Popover, Tooltip, TooltipProvider } from './components/Popover';
export type { PopoverProps, TooltipProps } from './components/Popover';
export { DropdownMenu, ContextMenu } from './components/Menu';
export type { DropdownMenuProps, ContextMenuProps, MenuEntry } from './components/Menu';
export { toast } from './components/toastStore';
export type { ToastOptions, ToastTone, ToastAction } from './components/toastStore';
export { Toaster, ToastProvider } from './components/Toast';
export { CommandPalette, useCommandPaletteShortcut } from './components/CommandPalette';
export type { CommandAction, CommandPaletteProps } from './components/CommandPalette';
export { Accordion } from './components/Accordion';
export type { AccordionProps, AccordionItem } from './components/Accordion';
export { Stepper } from './components/Stepper';
export type { StepperProps, StepperStep } from './components/Stepper';
export { KitProvider } from './components/KitProvider';
export type { KitProviderProps } from './components/KitProvider';

// Display
export { Badge, Tag } from './components/Badge';
export type { BadgeProps, BadgeTone, TagProps } from './components/Badge';
export { Avatar, AvatarStack, resolveColor } from './components/Avatar';
export type { AvatarProps, AvatarStackProps, AvatarSize, Presence } from './components/Avatar';
export { Card, Panel, Parchment, ScrollArea } from './components/Surfaces';
export type { CardProps, PanelProps, ParchmentProps, ScrollAreaProps } from './components/Surfaces';
export { DataTable } from './components/DataTable';
export type { DataTableProps, DataColumn, SortDirection } from './components/DataTable';
export { List, ListItem } from './components/List';
export type { ListProps, ListItemProps } from './components/List';
export { Kbd } from './components/Kbd';
export type { KbdProps } from './components/Kbd';
export { Divider } from './components/Divider';
export type { DividerProps } from './components/Divider';
export { ResizablePanels, Splitter } from './components/ResizablePanels';
export type { ResizablePanelsProps, SplitterProps } from './components/ResizablePanels';

// Feedback
export { Spinner } from './components/Spinner';
export type { SpinnerProps } from './components/Spinner';
export { Skeleton, EmptyState, ProgressBar, Banner } from './components/Feedback';
export type {
  SkeletonProps,
  EmptyStateProps,
  ProgressBarProps,
  BannerProps,
  BannerTone,
} from './components/Feedback';
export { ErrorBoundary, ErrorFallback } from './components/ErrorBoundary';
export type { ErrorBoundaryProps, ErrorFallbackProps } from './components/ErrorBoundary';

// Game
export { TokenPortrait, tokenIdentity, tokenPatterns } from './game/TokenPortrait';
export type {
  TokenPortraitProps,
  TokenSize,
  TokenState,
  TokenIdentity,
  TokenPattern,
} from './game/TokenPortrait';
export { StatBox, HpBar, AcShield, CoinPurse, ConditionChip, formatModifier } from './game/StatBlock';
export type {
  StatBoxProps,
  HpBarProps,
  AcShieldProps,
  CoinPurseProps,
  ConditionChipProps,
  ConditionTone,
} from './game/StatBlock';

// Dice
export { Die } from './dice/Die';
export type { DieProps, DieSides } from './dice/Die';
export { DiceRoll, formatDiceFormula, DICE_ROLL_MAX_MS } from './dice/DiceRoll';
export type { DiceRollProps, RolledDie } from './dice/DiceRoll';

// Layout
export {
  TableLayout,
  TableTopBar,
  GameClock,
  ModeBadge,
  ToolRail,
  ToolRailButton,
  ToolRailDivider,
  ActionBar,
  ActionBarItem,
  ActionBarDivider,
  ActionBarMenu,
  Dock,
} from './layout/TableLayout';
export type {
  TableLayoutProps,
  TableTopBarProps,
  GameClockProps,
  GameMode,
  ToolRailProps,
  ToolRailButtonProps,
  ActionBarProps,
  ActionBarMenuProps,
  DockProps,
  DockTab,
} from './layout/TableLayout';
export { PageLayout } from './layout/PageLayout';
export type { PageLayoutProps } from './layout/PageLayout';
export { Wordmark, WordmarkMark } from './layout/Wordmark';
export type { WordmarkProps } from './layout/Wordmark';
