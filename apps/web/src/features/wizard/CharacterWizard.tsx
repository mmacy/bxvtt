import type { AbilityTables } from '@bxvtt/shared/bxapi';
import { isProblem } from '@bxvtt/shared/client';
import type {
  CharacterRequest,
  StartingRollRequest,
  StartingRolls,
  StartingRollsStatus,
  StoredCharacter,
} from '@bxvtt/shared/protocol';
import { classLabel, count, emptyContext, resolveItemNoun } from '@bxvtt/shared/text';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  displayStringProblem,
  getApi,
  useClassCatalog,
  useCurrentUser,
  useEquipmentCatalog,
  useLanguageCatalog,
  useRuleTable,
  useSpellCatalog,
  useTableDetail,
} from '@/app';
import { Banner, Button, ConfirmDialog, Dialog, Stepper, type StepperStep } from '@/ui';
import { RuleLinksContext } from '../sheet/RuleLink';
import { StoredSheet } from '../sheet/StoredSheet';
import { ADJUST_GUIDANCE_ID, AdjustStep, type AdjustCheckState, type CheckState } from './AdjustStep';
import { explainAdjustCheck } from './adjustCheck';
import { ClassStep } from './ClassStep';
import {
  STEP_IDS,
  adjustedScores,
  emptyDraft,
  hasAdjustment,
  loadDraft,
  reconcileDraft,
  requestFromDraft,
  saveDraft,
  startingRollRequest,
  type StepId,
  type WizardDraft,
} from './draft';
import { IdentityStep } from './IdentityStep';
import { applyKit, cartPhrase } from './kits';
import { OutfitStep, cartCost, type GoldState } from './OutfitStep';
import { ReviewStep } from './ReviewStep';
import { RollStep } from './RollStep';
import { checkChoices, fetchRoll, explainCreationError, explainInvalid, type WizardProblem } from './server';
import { StartingRollsStep } from './StartingRollsStep';
import {
  casterNextStep,
  classMagic,
  extraLanguageCount,
  headlineModifier,
  readScores,
  spellSlotsAt,
} from './tables';
import styles from './wizard.module.css';
import { useClassDetail } from '../sheet/catalogs';

export interface CharacterWizardProps {
  /** Whether the wizard is open. */
  open: boolean;
  /** Closes the wizard without creating a character. */
  onClose: () => void;
  /**
   * Called once bxapi has stored the new character (`POST /api/characters`). The lobby adds it to the roster,
   * and the home page refreshes the character list. Call `onClose` yourself after it, or keep the wizard open
   * to make another.
   */
  onCreated: (character: StoredCharacter) => void;
}

const STEP_LABELS: Record<StepId, string> = {
  roll: 'Roll abilities',
  class: 'Choose a class',
  adjust: 'Adjust scores',
  identity: 'Identity',
  hp_gold: 'Hit points and gold',
  outfit: 'Outfit',
  review: 'Review',
};

const STEP_DESCRIPTIONS: Record<StepId, string> = {
  roll: 'Roll 3d6 in order for each ability score.',
  class: 'Choose from the classes your ability scores qualify for.',
  adjust: 'Trade points into your prime requisite, or keep your rolled scores.',
  identity: 'Choose a name, alignment, and languages.',
  hp_gold: 'Roll your hit points, then your starting gold.',
  outfit: 'Spend your starting gold on weapons, armour, and gear.',
  review: 'Review your character sheet, then create your character.',
};

/** The steps that show the rolled hit points or gold, so the wizard reads the dice from the server for them. */
const DICE_STEPS: readonly StepId[] = ['hp_gold', 'outfit', 'review'];

/** What the server recorded about the draft's ability roll, or why the wizard couldn't read it. */
type Recorded = { rollId: string; status: StartingRollsStatus } | { rollId: string; failure: string };

/** A draft without its ability roll, for a roll the server says is used or gone. The identity stays. */
function withoutRoll(draft: WizardDraft): WizardDraft {
  return { ...emptyDraft(), name: draft.name, alignment: draft.alignment };
}

/** Debounce for the live checks, in milliseconds. The server allows 60 checks a minute per user. */
const CHECK_DELAY_MS = 600;

function isAbilityTables(value: unknown): value is AbilityTables {
  return typeof value === 'object' && value !== null && 'strength' in value && 'intelligence' in value;
}

function stepIndex(step: StepId): number {
  return STEP_IDS.indexOf(step);
}

/** What the footer's Continue button reads to decide whether the player can go on. */
export interface ContinueFacts {
  step: StepId;
  /** Whether the player has rolled ability scores. */
  rolled: boolean;
  /** The classes the roll qualifies for, from the server's roll. */
  eligible: readonly string[];
  /** Whether the dice of a fresh roll are still landing. */
  revealing: boolean;
  classId: string | null;
  adjust: AdjustCheckState['status'];
  /** Whether the starting gold is rolled. */
  goldRolled: boolean;
  gold: GoldState;
  cart: CheckState['status'];
}

/**
 * Why the player can't continue from the step, or `null` when they can. The reason is `null` while the wizard
 * waits for the server or for the dice, so the button waits without one.
 */
export function continueBlock(facts: ContinueFacts): { reason: string | null } | null {
  const wait = { reason: null };
  switch (facts.step) {
    case 'roll':
      if (!facts.rolled) return wait;
      if (facts.revealing) return wait;
      if (facts.eligible.length === 0)
        return { reason: "These ability scores don't qualify for any class. Roll again." };
      return null;
    case 'class':
      if (facts.classId === null || !facts.eligible.includes(facts.classId))
        return { reason: 'Choose a class first.' };
      return null;
    case 'adjust':
      if (facts.adjust === 'checking') return wait;
      if (facts.adjust === 'invalid')
        return { reason: "This ability trade isn't allowed. Change it, or reset to your rolled scores." };
      return null;
    case 'hp_gold':
      return facts.goldRolled ? null : wait;
    case 'outfit':
      if (facts.gold.status === 'loading') return wait;
      if (facts.gold.status === 'unknown') return { reason: facts.gold.message };
      if (facts.cart === 'checking') return wait;
      if (facts.cart === 'invalid')
        return { reason: 'Your cart breaks a rule. Change it as the note under the cart says.' };
      return null;
    default:
      return null;
  }
}

/** The character wizard: rolls abilities, picks a class and gear, and stores a character for the user. */
export function CharacterWizard({ open, onClose, onCreated }: CharacterWizardProps) {
  return open ? <WizardDialog onClose={onClose} onCreated={onCreated} /> : null;
}

function WizardDialog({ onClose, onCreated }: Omit<CharacterWizardProps, 'open'>) {
  const user = useCurrentUser();
  const userId = user?.id ?? null;
  // TODO(table-ruleset): ability rolls belong to a table, so the wizard rolls at the open table.
  const tableId = useTableDetail()?.id ?? '';
  const [initial] = useState(() => loadDraft(userId));
  const [draft, setDraft] = useState<WizardDraft>(() => initial ?? emptyDraft());
  const [restored, setRestored] = useState(initial !== null);
  const [freshRollId, setFreshRollId] = useState<string | null>(null);
  const [revealedRollId, setRevealedRollId] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<WizardProblem | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [created, setCreated] = useState<StoredCharacter | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [kitNote, setKitNote] = useState<string | null>(null);
  const [tradeAttempts, setTradeAttempts] = useState(0);

  const classes = useClassCatalog();
  const abilityTable = useRuleTable('abilities');
  const tables = isAbilityTables(abilityTable.data) ? abilityTable.data : null;
  const classEntry = useClassDetail(draft.classId ? draft.classId : null);
  const detail = classEntry.data;
  const equipment = useEquipmentCatalog();
  const spellCatalog = useSpellCatalog();
  const languageCatalog = useLanguageCatalog();

  const scores = useMemo(() => readScores(draft.roll?.scores), [draft.roll]);
  const adjusted = useMemo(() => (scores ? adjustedScores(scores, draft.adjustment) : null), [scores, draft]);
  const magic = classMagic(detail);
  const bookSize = magic?.kind === 'arcane' ? (spellSlotsAt(detail, 1)[0] ?? 0) : 0;
  const extraLanguages = tables && adjusted ? extraLanguageCount(tables, adjusted.int) : 0;
  // Keep the draft in this browser, so closing the dialog by accident loses nothing.
  useEffect(() => {
    if (created === null) saveDraft(userId, draft);
  }, [draft, userId, created]);

  const update = useCallback((change: Partial<WizardDraft>) => setDraft((d) => ({ ...d, ...change })), []);

  // The server keeps which starting rolls the player made from the ability roll, and the class and reroll option
  // the hit points fixed. The wizard reads that record when it opens, so a reload never offers a roll again.
  const rollId = draft.roll?.id ?? null;
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const status =
    recorded !== null && recorded.rollId === rollId && 'status' in recorded ? recorded.status : null;
  const statusFailure =
    recorded !== null && recorded.rollId === rollId && 'failure' in recorded ? recorded.failure : null;
  const statusFor = rollId !== null && recorded?.rollId !== rollId ? rollId : null;
  useEffect(() => {
    if (statusFor === null) return;
    let cancelled = false;
    getApi()
      .getStartingRolls(statusFor)
      .then(
        (value) => {
          if (cancelled) return;
          setRecorded({ rollId: statusFor, status: value });
          if (value.used) {
            setDraft(withoutRoll);
            setProblem({
              step: 'roll',
              title: 'You already made a character from these ability scores',
              sentences: [
                'Each roll of ability scores makes one character. Roll new ability scores to make another.',
              ],
            });
            return;
          }
          // The record on the server wins over the draft in this browser.
          setDraft((d) => (d.roll?.id === statusFor ? reconcileDraft(d, value) : d));
        },
        (error: unknown) => {
          if (cancelled) return;
          const explained = explainCreationError(error);
          if (explained.step === 'roll') {
            // The server has no such roll for this user anymore, so the draft starts again from new scores.
            setDraft(withoutRoll);
            setProblem(explained);
            return;
          }
          setRecorded({ rollId: statusFor, failure: `${explained.title}. ${explained.sentences.join(' ')}` });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [statusFor]);
  const hitPointsRolled = status !== null && status.class_id !== null;

  // A draft saved before bxapi returned the dice has the scores but not the dice. The wizard fetches the roll
  // again to fill them in, and the roll step shows placeholders until they arrive. Nothing else needs the dice.
  const diceFor = draft.roll !== null && draft.roll.rolls === undefined ? draft.roll.id : null;
  useEffect(() => {
    if (diceFor === null) return;
    let cancelled = false;
    fetchRoll(getApi(), diceFor).then(
      (fetched) => {
        if (cancelled) return;
        setDraft((d) =>
          d.roll?.id === diceFor && d.roll.rolls === undefined
            ? { ...d, roll: { ...d.roll, rolls: fetched.rolls } }
            : d,
        );
      },
      (error: unknown) => {
        if (cancelled) return;
        const explained = explainCreationError(error);
        if (explained.step === 'roll') {
          // The server has no such roll for this user anymore, so the draft starts again from new scores.
          setDraft((d) => (d.roll?.id === diceFor ? withoutRoll(d) : d));
          setProblem(explained);
        }
        // Any other failure, such as being offline, keeps the draft and the placeholders.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [diceFor]);

  // The dice of the rolls already made. The server returns the same dice every time it's asked.
  const [dice, setDice] = useState<{ rollId: string; rolls: StartingRolls } | null>(null);
  const rolls = dice !== null && dice.rollId === rollId ? dice.rolls : null;
  const [diceAttempt, setDiceAttempt] = useState(0);
  const diceJson =
    rollId !== null &&
    status !== null &&
    hitPointsRolled &&
    DICE_STEPS.includes(draft.step) &&
    (rolls === null || (status.gold_rolled && rolls.gold_roll === null))
      ? JSON.stringify({ rollId, body: startingRollRequest(draft, status) })
      : null;
  const [diceFailure, setDiceFailure] = useState<{ key: string; message: string } | null>(null);
  useEffect(() => {
    if (diceJson === null) return;
    let cancelled = false;
    const { rollId: id, body } = JSON.parse(diceJson) as { rollId: string; body: StartingRollRequest };
    getApi()
      .rollHitPoints(id, body)
      .then(
        (value) => {
          if (!cancelled) setDice({ rollId: id, rolls: value });
        },
        (error: unknown) => {
          if (cancelled) return;
          const explained = explainCreationError(error);
          setDiceFailure({ key: diceJson, message: `${explained.title}. ${explained.sentences.join(' ')}` });
          // A choice that stops the roll, such as a missing first spell, is fixed on its own step.
          if (explained.step !== null && explained.step !== 'review') {
            setProblem(explained);
            setShowErrors(false);
            setDraft((d) => ({ ...d, step: explained.step ?? d.step }));
          }
        },
      );
    return () => {
      cancelled = true;
    };
  }, [diceJson, diceAttempt]);
  const diceError = diceFailure !== null && diceFailure.key === diceJson ? diceFailure.message : null;

  // The rolls the player made while this dialog was open play their dice. Restored rolls land at once.
  const [played, setPlayed] = useState<{ rollId: string; hitPoints: boolean; gold: boolean } | null>(null);
  const [startingRoll, setStartingRoll] = useState<'hit_points' | 'gold' | null>(null);

  const go = useCallback(
    (step: StepId) => {
      setShowErrors(false);
      setTradeAttempts(0);
      setPlayed(null);
      update({ step });
    },
    [update],
  );

  // Step 3: check the trade live. Each answer is stored with the request it answers, so a stale answer shows
  // as "checking" until the current request's answer arrives.
  const adjustJson =
    draft.step === 'adjust' && draft.roll && draft.classId && hasAdjustment(draft.adjustment)
      ? JSON.stringify(requestFromDraft(draft, { withoutOutfit: true, placeholderIdentity: true }))
      : null;
  const [adjustResult, setAdjustResult] = useState<{ key: string; state: AdjustCheckState } | null>(null);
  useEffect(() => {
    if (adjustJson === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const settle = (state: AdjustCheckState) => {
        if (!cancelled) setAdjustResult({ key: adjustJson, state });
      };
      checkChoices(getApi(), JSON.parse(adjustJson) as CharacterRequest).then(
        (result) => {
          if (!result.valid && result.problem) {
            const explained = explainInvalid(result.problem);
            if (explained.step !== null && stepIndex(explained.step) <= stepIndex('adjust')) {
              settle(explainAdjustCheck(result.problem));
              return;
            }
          }
          settle({ status: 'ok' });
        },
        (error: unknown) => settle({ status: 'invalid', sentences: explainCreationError(error).sentences }),
      );
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [adjustJson]);
  const adjustCheck: AdjustCheckState =
    adjustJson === null
      ? { status: 'idle' }
      : adjustResult?.key === adjustJson
        ? adjustResult.state
        : { status: 'checking' };

  // The outfit step spends the rolled gold.
  const gold: GoldState = rolls?.gold_roll
    ? { status: 'known', gp: rolls.gold_roll.total }
    : status !== null && !status.gold_rolled
      ? {
          status: 'unknown',
          message: 'Roll your starting gold on the hit points and gold step before you shop.',
        }
      : diceError !== null
        ? { status: 'unknown', message: diceError }
        : { status: 'loading' };
  const goldLeft = gold.status === 'known' ? gold.gp - cartCost(draft.cart, equipment.data) : null;

  // The outfit step checks the cart live, once the gold is rolled.
  const cartJson =
    draft.step === 'outfit' && draft.cart.length > 0 && gold.status === 'known'
      ? JSON.stringify(requestFromDraft(draft))
      : null;
  const [cartResult, setCartResult] = useState<{ key: string; state: CheckState } | null>(null);
  // Items the wizard put on by itself. When the server says the class can't use one, it comes off again.
  const [autoEquipped, setAutoEquipped] = useState<readonly string[]>([]);
  useEffect(() => {
    if (cartJson === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const settle = (state: CheckState) => {
        if (!cancelled) setCartResult({ key: cartJson, state });
      };
      checkChoices(getApi(), JSON.parse(cartJson) as CharacterRequest).then(
        (result) => {
          const refused = result.problem?.rejections?.[0];
          const named = refused?.params.item;
          // A refusal such as "magic-users can't wear armour" names no item, so it falls on the latest item the
          // wizard put on by itself.
          const item =
            typeof named === 'string'
              ? named
              : [...autoEquipped]
                  .reverse()
                  .find((id) => (JSON.parse(cartJson) as CharacterRequest).equip_item_ids?.includes(id));
          if (!cancelled && refused?.code.startsWith('items.equip.') && item && autoEquipped.includes(item)) {
            const sentence = result.problem ? explainInvalid(result.problem).sentences.join(' ') : '';
            setAutoEquipped((ids) => ids.filter((id) => id !== item));
            setDraft((d) => ({ ...d, equip: d.equip.filter((id) => id !== item) }));
            const noun = resolveItemNoun(item, emptyContext()).one;
            setKitNote(`${sentence} Moved the ${noun} to your pack.`);
            return;
          }
          settle(
            !result.valid && result.problem
              ? { status: 'invalid', sentences: explainInvalid(result.problem).sentences }
              : { status: 'ok' },
          );
        },
        (error: unknown) => settle({ status: 'invalid', sentences: explainCreationError(error).sentences }),
      );
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cartJson, autoEquipped]);
  const cartCheck: CheckState =
    cartJson === null
      ? { status: 'idle' }
      : cartResult?.key === cartJson
        ? cartResult.state
        : { status: 'checking' };

  const roll = async () => {
    setRolling(true);
    setProblem(null);
    try {
      const result = await getApi().rollAbilities(tableId);
      setFreshRollId(result.id);
      setRestored(false);
      // A new roll has no starting rolls yet, so the wizard needn't ask.
      setRecorded({
        rollId: result.id,
        // TODO(table-ruleset): the roll states the rules recorded on it.
        status: { used: false, class_id: null, rules: result.rules, gold_rolled: false },
      });
      setDraft((d) => ({
        ...emptyDraft(),
        name: d.name,
        alignment: d.alignment,
        rolls: d.rolls + 1,
        roll: result,
        step: 'roll',
      }));
    } catch (error) {
      setProblem({ ...explainCreationError(error), step: 'roll' });
    } finally {
      setRolling(false);
    }
  };

  /** Rolls the hit points or the starting gold on the server, which fixes the class and reroll option. */
  const rollStarting = async (which: 'hit_points' | 'gold') => {
    if (rollId === null || status === null) return;
    setStartingRoll(which);
    setProblem(null);
    try {
      const body = startingRollRequest(draft, status);
      const api = getApi();
      const value =
        which === 'hit_points'
          ? await api.rollHitPoints(rollId, body)
          : await api.rollStartingGold(rollId, body);
      setDice({ rollId, rolls: value });
      setRecorded({
        rollId,
        status: {
          ...status,
          class_id: value.class_id,
          rules: value.rules, // TODO(table-ruleset): the recorded rules replace the re-roll option.
          gold_rolled: value.gold_roll !== null,
        },
      });
      setPlayed((p) => ({
        rollId,
        hitPoints: which === 'hit_points' || (p !== null && p.rollId === rollId && p.hitPoints),
        gold: which === 'gold',
      }));
    } catch (error) {
      const explained = explainCreationError(error);
      if (isProblem(error, 'ability_roll_locked')) {
        // Another tab rolled these hit points first. Read the record again, and say so on this step.
        setProblem({ ...explained, step: null });
        setRecorded(null);
        return;
      }
      setProblem(explained);
      if (explained.step !== null && explained.step !== draft.step) go(explained.step);
    } finally {
      setStartingRoll(null);
    }
  };

  /** Asks the server about the choices so far, and blocks when a choice up to `upTo` breaks a rule. */
  const check = async (body: ReturnType<typeof requestFromDraft>, upTo: StepId): Promise<boolean> => {
    setBusy(true);
    try {
      const result = await checkChoices(getApi(), body);
      if (result.valid || !result.problem) return true;
      const explained = explainInvalid(result.problem);
      if (
        explained.step !== null &&
        stepIndex(explained.step) > stepIndex(upTo) &&
        explained.step !== 'review'
      )
        return true;
      setProblem(explained);
      if (explained.step !== null && explained.step !== draft.step) go(explained.step);
      return false;
    } catch (error) {
      const explained = explainCreationError(error);
      setProblem(explained);
      if (explained.step !== null && explained.step !== draft.step) go(explained.step);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const finish = (character: StoredCharacter) => {
    saveDraft(userId, null);
    setCreated(character);
    onCreated(character);
  };

  const create = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const body = requestFromDraft(draft);
      // Checking first keeps a refused choice out of the create route, so the browser logs no error for it.
      const result = await checkChoices(getApi(), body);
      if (!result.valid && result.problem) {
        const explained = explainInvalid(result.problem);
        setProblem(explained);
        if (explained.step !== null && explained.step !== 'review') go(explained.step);
        return;
      }
      finish(await getApi().createCharacter(body));
    } catch (error) {
      const explained = explainCreationError(error);
      setProblem(explained);
      if (explained.step !== null && explained.step !== 'review') go(explained.step);
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    setProblem(null);
    switch (draft.step) {
      case 'roll':
        go('class');
        return;
      case 'class':
        go('adjust');
        return;
      case 'adjust':
        // A trade in progress stays on the step. The step says to finish it or reset it.
        if (adjustCheck.status === 'in_progress') {
          setTradeAttempts((n) => n + 1);
          return;
        }
        if (
          await check(requestFromDraft(draft, { withoutOutfit: true, placeholderIdentity: true }), 'adjust')
        )
          go('identity');
        return;
      case 'identity': {
        setShowErrors(true);
        if (displayStringProblem(draft.name, 100) !== null || draft.alignment === null) return;
        if (magic?.kind === 'arcane' && draft.spells.length !== bookSize) return;
        if (await check(requestFromDraft(draft, { withoutOutfit: true }), 'identity')) go('hp_gold');
        return;
      }
      case 'hp_gold':
        go('outfit');
        return;
      case 'outfit':
        if (await check(requestFromDraft(draft), 'outfit')) go('review');
        return;
      case 'review':
        await create();
        return;
    }
  };

  const back = () => {
    setProblem(null);
    const index = stepIndex(draft.step);
    const previous = STEP_IDS[index - 1];
    if (previous) go(previous);
  };

  const startOver = () => {
    saveDraft(userId, null);
    setDraft(emptyDraft());
    setCreated(null);
    setProblem(null);
    setRestored(false);
    setFreshRollId(null);
  };

  const applyClassKit = () => {
    if (!draft.classId || !equipment.data) return;
    const result = applyKit(draft.classId, equipment.data, gold.status === 'known' ? gold.gp : null);
    update({ cart: result.cart, equip: result.equip });
    setKitNote(
      result.skipped.length > 0
        ? `Added what your gold covers, skipping ${result.skipped
            .map((id) => cartPhrase(id, 1, equipment.data?.find((e) => e.id === id)?.name).toLowerCase())
            .join(', ')}.`
        : 'Added the starter kit. Swap or remove anything you like.',
    );
  };

  const eligible = draft.roll?.eligible_class_ids ?? [];
  const block = continueBlock({
    step: draft.step,
    rolled: draft.roll !== null,
    eligible,
    revealing: draft.roll !== null && draft.roll.id === freshRollId && revealedRollId !== draft.roll.id,
    classId: draft.classId,
    adjust: adjustCheck.status,
    goldRolled: rolls?.gold_roll != null,
    gold,
    cart: cartCheck.status,
  });
  const canContinue = block === null;

  const past = (id: StepId) => stepIndex(draft.step) > stepIndex(id);
  const steps: StepperStep[] = STEP_IDS.map((id) => ({
    id,
    label: STEP_LABELS[id],
    description:
      id === 'class' && draft.classId && past('class')
        ? classLabel(draft.classId)
        : id === 'identity' && draft.name.trim() && past('identity')
          ? draft.name.trim()
          : id === 'hp_gold' && rolls?.gold_roll && past('hp_gold')
            ? `${rolls.hit_point_roll.hit_points} hp, ${rolls.gold_roll.total} gp`
            : id === 'outfit' && goldLeft !== null && past('outfit')
              ? `${goldLeft} gp left`
              : undefined,
  }));

  const title = created ? `${created.name} is ready` : 'Create a character';

  const createdNext = created
    ? casterNextStep(
        created.name,
        detail,
        created.character.spell_book.map((id) => spellCatalog.data?.find((s) => s.id === id)?.name ?? id),
      )
    : null;

  let body;
  if (created) {
    body = (
      <div className={styles.created}>
        <Banner
          tone="success"
          title={`${created.name} is ready for adventure`}
          actions={
            <>
              <Button variant="ghost" size="sm" icon="plus" onClick={startOver}>
                Create another
              </Button>
              <Button variant="primary" size="sm" onClick={onClose}>
                Done
              </Button>
            </>
          }
        >
          {created.name} starts with {count(created.character.max_hp, 'hit point')} and is ready to join any
          table.
          {createdNext && ` ${createdNext}`}
        </Banner>
        <StoredSheet character={created} color={user?.color} />
      </div>
    );
  } else if (!scores && draft.step !== 'roll') {
    body = null;
  } else {
    const step = draft.step;
    body = (
      <>
        <Stepper
          steps={steps}
          current={stepIndex(step)}
          onStepClick={(index) => {
            const target = STEP_IDS[index];
            if (target) {
              setProblem(null);
              go(target);
            }
          }}
          aria-label="Character creation"
          className={styles.stepper}
        />
        <div className={styles.stepHeading}>
          <h3 className={styles.stepTitle}>{STEP_LABELS[step]}</h3>
          <p className={styles.stepDescription}>{STEP_DESCRIPTIONS[step]}</p>
        </div>
        {restored && step !== 'roll' && (
          <Banner
            tone="info"
            title="Resumed your unfinished character"
            onDismiss={() => setRestored(false)}
            dismissLabel="Dismiss"
          >
            Pick up where you left off, or choose Start over below.
          </Banner>
        )}
        {problem && (problem.step === null || problem.step === step) && (
          <Banner
            tone="warning"
            title={problem.title}
            onDismiss={() => setProblem(null)}
            dismissLabel="Dismiss"
          >
            {problem.sentences.join(' ')}
          </Banner>
        )}
        {step === 'roll' && (
          <RollStep
            roll={draft.roll}
            animate={draft.roll !== null && draft.roll.id === freshRollId}
            rolls={draft.rolls}
            rolling={rolling}
            onRoll={() => void roll()}
            onRevealed={setRevealedRollId}
            classes={classes.data}
            tables={tables}
          />
        )}
        {step === 'class' && scores && (
          <ClassStep
            classes={classes.data}
            scores={scores}
            eligible={eligible}
            classId={draft.classId}
            onSelect={(classId) =>
              !hitPointsRolled &&
              classId !== draft.classId &&
              update({ classId, adjustment: { lowered: {}, raised: {} }, spells: [], languages: [] })
            }
            hpReroll={draft.hpReroll}
            onHpReroll={(hpReroll) => !hitPointsRolled && update({ hpReroll })}
            equipment={equipment.data}
            locked={hitPointsRolled}
          />
        )}
        {step === 'adjust' && scores && (
          <AdjustStep
            scores={scores}
            adjustment={draft.adjustment}
            onChange={(adjustment) => {
              setTradeAttempts(0);
              update({ adjustment, languages: [] });
            }}
            detail={detail}
            tables={tables}
            check={adjustCheck}
            continueAttempts={tradeAttempts}
          />
        )}
        {step === 'identity' && adjusted && (
          <IdentityStep
            name={draft.name}
            onName={(name) => update({ name })}
            alignment={draft.alignment}
            onAlignment={(alignment) => update({ alignment })}
            detail={detail}
            extraLanguages={extraLanguages}
            intelligence={adjusted.int}
            languages={draft.languages}
            onLanguages={(languages) => update({ languages })}
            languageCatalog={languageCatalog.data}
            magic={magic}
            bookSize={bookSize}
            spells={draft.spells}
            onSpells={(spells) => update({ spells })}
            spellCatalog={spellCatalog.data}
            showErrors={showErrors}
          />
        )}
        {step === 'hp_gold' && draft.classId && (
          <StartingRollsStep
            classId={draft.classId}
            hitDie={detail?.hit_die ?? null}
            conModifier={tables && adjusted ? headlineModifier(tables, 'con', adjusted.con) : undefined}
            hpReroll={draft.hpReroll}
            rolls={rolls}
            loading={status === null || (hitPointsRolled && rolls === null)}
            rolling={startingRoll}
            animate={played !== null && played.rollId === rollId ? played : { hitPoints: false, gold: false }}
            onRollHitPoints={() => void rollStarting('hit_points')}
            onRollGold={() => void rollStarting('gold')}
            failure={statusFailure ?? diceError}
            onRetry={() => {
              setProblem(null);
              if (statusFailure !== null) setRecorded(null);
              else setDiceAttempt((n) => n + 1);
            }}
          />
        )}
        {step === 'outfit' && (
          <OutfitStep
            equipment={equipment.data}
            cart={draft.cart}
            equip={draft.equip}
            onCart={(cart) => update({ cart })}
            onEquip={(equip) => update({ equip })}
            gold={gold}
            classId={draft.classId}
            onKit={applyClassKit}
            onAutoEquip={(id) => setAutoEquipped((ids) => [...ids, id])}
            kitNote={kitNote}
            check={cartCheck}
          />
        )}
        {step === 'review' && adjusted && (
          <ReviewStep
            draft={draft}
            scores={adjusted}
            detail={detail}
            tables={tables}
            equipment={equipment.data}
            spells={spellCatalog.data}
            goldLeft={goldLeft}
            rolls={rolls}
            onEdit={(target) => {
              setProblem(null);
              go(target);
            }}
          />
        )}
      </>
    );
  }

  const footer = created ? undefined : (
    <>
      {draft.roll !== null && (
        <Button
          variant="ghost"
          icon="undo"
          className={styles.footerStart}
          onClick={() => setConfirmReset(true)}
        >
          Start over
        </Button>
      )}
      {stepIndex(draft.step) > 0 && (
        <Button variant="secondary" icon="arrow-left" onClick={back} disabled={busy}>
          Back
        </Button>
      )}
      {draft.step === 'review' ? (
        <Button variant="primary" icon="check" loading={busy} onClick={() => void next()}>
          Create character
        </Button>
      ) : (
        draft.roll !== null &&
        // The step's own roll buttons lead until both rolls are made.
        !(draft.step === 'hp_gold' && !canContinue) && (
          <Button
            variant="primary"
            iconEnd="arrow-right"
            loading={busy}
            disabled={!canContinue}
            disabledReason={block?.reason}
            aria-describedby={
              draft.step === 'adjust' && adjustCheck.status === 'in_progress' ? ADJUST_GUIDANCE_ID : undefined
            }
            onClick={() => void next()}
          >
            {draft.step === 'adjust' && !hasAdjustment(draft.adjustment) ? 'Skip this step' : 'Continue'}
          </Button>
        )
      )}
    </>
  );

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      size="xl"
      footer={footer}
      className={styles.dialog}
    >
      {/* The lobby and the home page render the rules reference, so names in the wizard open it. */}
      <RuleLinksContext.Provider value={true}>
        <div className={styles.wizard}>{body}</div>
      </RuleLinksContext.Provider>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Start over?"
        description="This clears your rolled scores and all choices so you can roll a new character."
        confirmLabel="Start over"
        tone="danger"
        onConfirm={startOver}
      />
    </Dialog>
  );
}
