/**
 * The app layer: identity, API access, the table store and its hooks, commands, text, rules catalogs, the map
 * interaction bus, preferences, shell overlays, and keyboard shortcuts. Features import everything from `@/app`.
 * `apps/web/src/features/README.md` documents each export with an example.
 */
export { describeProblem, displayStringProblem, getApi, isNetworkError, reportError, setApi } from './api';
export type { ProblemMessage } from './api';
export { isRetiredToken, useCurrentUser, useIdentity } from './identity';
export type { IdentityState, IdentityStatus } from './identity';
export { DEFAULT_PREFERENCES, usePreferences, useReduceMotion } from './preferences';
export { AppKitProvider } from './AppKitProvider';
export type { DockTabId, MapThemeName, MotionPreference, Preferences } from './preferences';
export {
  canActForParty,
  canControlMember,
  canDeclare,
  canResolveRound,
  canSendCommand,
  isReferee,
  seatedMemberIds,
} from './permissions';
export type { Permission, PermissionContext } from './permissions';
export { TableProvider, useTableStore, useTableStoreApi } from './table/context';
export { NoTableProvider } from './table/NoTableProvider';
export * from './table/hooks';
export { useAdventureDocument } from './table/referee';
export { PING_LIFETIME_MS, RESYNC_INTERVAL_MS, announceNotice, useTableSession } from './table/session';
export { createTableStore, dataFromSnapshot, levelKey, newerGame, reduceServerMessage } from './table/store';
export type {
  RemovedReason,
  TableConnectionStatus,
  TableData,
  TableNotice,
  TablePing,
  TableState,
  TableStore,
} from './table/store';
export {
  COMMANDS_PER_SECOND,
  MAX_QUEUED_COMMANDS,
  QUEUED_COMMAND_MAX_WAIT_MS,
  useApiAction,
  useSendCommand,
  useSendDeclaration,
  useSendRefereeCommand,
} from './commands';
export type {
  DeclarationResult,
  ErrorResult,
  GameCommand,
  RefusalDisplay,
  ResolveResult,
  SendOptions,
  SendResult,
  SkipReason,
} from './commands';
export { useTextContext } from './text';
export * from './rules';
export { resetMyCharacters, useMyCharacters, useStoredCharacter } from './characters';
export { useMapBus } from './mapBus';
export type {
  CellPick,
  EdgePick,
  FocusRequest,
  FocusTarget,
  MapBusState,
  MapDirection,
  MapToolId,
  PickOptions,
  PickRequest,
  PickTarget,
} from './mapBus';
export { useTableUi } from './ui';
export type { CompendiumEntry, SheetTab, TableUiState } from './ui';
export {
  ShortcutLayer,
  formatShortcut,
  matchesShortcut,
  useAction,
  useRegisteredShortcuts,
  useShortcut,
} from './shortcuts';
export type { ActionDefinition, ShortcutDefinition } from './shortcuts';
export { tokenClass } from './display';
export { STORAGE_KEYS, readStored, scopedStorage, writeStored } from './storage';
export type { ScopedStorage, StorageArea } from './storage';
export { toParamMap } from './params';
export { useCombatStage } from './combatStage';
export { battleRound, useBattleRound } from './battle';
export {
  cancelRejoin,
  cancelRejoinOnLeave,
  isTransientFailure,
  useDecideRejoin,
  useRejoinRequests,
} from './rejoin';
export {
  DARKNESS_TEXT,
  NO_LIGHT_TEXT,
  lightLine,
  lightTimeLeft,
  partyLightFrom,
  usePartyLight,
} from './light';
export type { MemberLight, PartyLight } from './light';
export { END_GRACE_MS, END_MAX_HOLD_MS, ShownModeProvider, useHeldMode, useShownMode } from './shownMode';
export type { CombatStageState, PlaybackMemberState, PlaybackMoment } from './combatStage';
export { lazyPart, type LazyPart } from './lazyPart';
