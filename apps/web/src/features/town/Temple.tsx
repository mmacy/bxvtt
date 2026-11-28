/** The temple: each healing service with its price, who is treated, and who pays. */
import {
  describeEvents,
  formatCoins,
  formatGold,
  healingServiceDescription,
  healingServiceLabel,
} from '@bxvtt/shared/text';
import type { MemberView } from '@bxvtt/shared/bxapi';
import { useMemo, useState } from 'react';
import {
  canSendCommand,
  useIsReferee,
  useParty,
  usePermissionContext,
  usePlayerView,
  useSendCommand,
  useTextContext,
} from '@/app';
import {
  Badge,
  Banner,
  Button,
  CoinPurse,
  ConditionChip,
  EmptyState,
  Field,
  HpBar,
  NumberInput,
  Panel,
} from '@/ui';
import { partyGoldPieces, readPurse } from './inventory';
import { memberStatus, neediestFirst } from './members';
import { MemberChooser, PlaceHeader } from './parts';
import { placeName } from './services';
import { useTownUi } from './townUi';
import styles from './Temple.module.css';

const SERVICE_ORDER = [
  'cure_light_wounds',
  'cure_serious_wounds',
  'cure_disease',
  'neutralize_poison',
  'remove_curse',
  'raise_dead',
];

function orderServices(prices: Record<string, number>, dead: boolean): string[] {
  const known = SERVICE_ORDER.filter((service) => service in prices);
  const others = Object.keys(prices).filter((service) => !SERVICE_ORDER.includes(service));
  const all = [...known, ...others];
  // For a dead patient, raise dead comes first.
  return dead ? [...all.filter((s) => s === 'raise_dead'), ...all.filter((s) => s !== 'raise_dead')] : all;
}

export function Temple() {
  const view = usePlayerView();
  const party = useParty();
  const permissionContext = usePermissionContext();
  const referee = useIsReferee();
  const ctx = useTextContext();
  const { send, pending } = useSendCommand();
  const patientId = useTownUi((s) => s.buyerId);
  const setPatientId = useTownUi((s) => s.setBuyerId);
  const [level, setLevel] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<{
    tone: 'success' | 'warning';
    title: string;
    lines: string[];
  } | null>(null);

  const prices = view?.town_healing_prices ?? {};
  const ordered = useMemo(() => neediestFirst(party), [party]);
  const canAct = (member: MemberView) => canSendCommand(permissionContext, 'purchase_healing', member.id);
  const patient =
    ordered.find((member) => member.id === patientId) ??
    ordered.find((member) => canAct(member).allowed) ??
    ordered[0] ??
    null;
  // With a coin other than gold in any purse, only bxapi can say whether the party can pay, so no Buy button waits on it.
  const partyGold = partyGoldPieces(party.map(readPurse));

  if (patient === null) return <EmptyState icon="heart" title="No party members to treat" />;
  const permission = canAct(patient);
  const status = memberStatus(patient);

  const buy = async (service: string) => {
    setOutcome(null);
    setPatientId(patient.id);
    const command: { command_type: string } & Record<string, unknown> = {
      command_type: 'purchase_healing',
      character_id: patient.id,
      service,
    };
    if (level !== null) command.caster_level = level;
    const result = await send(command, { display: 'inline' });
    if (result.status === 'accepted') {
      const lines = describeEvents(result.result.events, ctx, {
        messages: result.result.messages,
        only: 'player',
      }).map((line) => line.text);
      setOutcome({
        tone: 'success',
        title: `${healingServiceLabel(service)} for ${patient.name}`,
        lines: lines.length > 0 ? lines : ['Service complete.'],
      });
    } else if (result.status === 'refused' || result.status === 'error' || result.status === 'skipped') {
      setOutcome({
        tone: 'warning',
        title: `Couldn't treat ${patient.name}`,
        lines: [result.message],
      });
    }
  };

  return (
    <div className={styles.temple}>
      <PlaceHeader
        icon="heart"
        title={placeName('temple', view?.town_services ?? []) ?? 'Temple'}
        lead="Purchase healing and cures for one character. The whole party shares the cost."
      />
      <div className={styles.patients}>
        <span className={styles.label}>Patient</span>
        <MemberChooser
          label="Patient"
          members={ordered}
          value={patient.id}
          onChange={setPatientId}
          meta={(member) => {
            const s = memberStatus(member);
            if (s.dead) return 'Dead';
            return `${member.current_hp} of ${member.max_hp} hp${s.afflictions.length > 0 ? `, ${s.afflictions.join(', ').toLowerCase()}` : ''}`;
          }}
          description={(member) => {
            const s = memberStatus(member);
            if (s.dead) return 'dead';
            const state = s.afflictions.length > 0 ? ', afflicted' : s.hurt ? ', hurt' : '';
            return `${member.current_hp} of ${member.max_hp} hp${s.afflictions.length > 0 ? `, ${s.afflictions.join(', ').toLowerCase()}` : ''}${state}`;
          }}
          badge={(member) =>
            memberStatus(member).dead ? null : memberStatus(member).afflictions.length > 0 ? (
              <Badge tone="warning">Afflicted</Badge>
            ) : memberStatus(member).hurt ? (
              <Badge tone="warning">Hurt</Badge>
            ) : null
          }
        />
      </div>

      <div className={styles.grid}>
        <Panel title="Temple services" meta={`For ${patient.name}`}>
          <ul className={styles.services}>
            {orderServices(prices, status.dead).map((service) => {
              const price = prices[service] ?? 0;
              const short = partyGold !== null && partyGold < price;
              return (
                <li key={service} className={styles.service}>
                  <div className={styles.serviceText}>
                    <h3 className={styles.serviceName}>{healingServiceLabel(service)}</h3>
                    <p className={styles.serviceDetail}>{healingServiceDescription(service)}</p>
                  </div>
                  <span className={styles.price}>{price === 0 ? 'Free' : formatGold(price)}</span>
                  <Button
                    variant="secondary"
                    icon="heart"
                    loading={pending}
                    disabled={!permission.allowed || short}
                    disabledReason={
                      permission.allowed
                        ? `The party has ${formatGold(partyGold ?? 0)}, and this costs ${formatGold(price)}.`
                        : permission.reason
                    }
                    aria-label={`Buy ${healingServiceLabel(service).toLowerCase()} for ${patient.name}`}
                    onClick={() => void buy(service)}
                  >
                    Buy
                  </Button>
                </li>
              );
            })}
          </ul>
          {referee && (
            <Field
              label="Cleric level (optional)"
              hint="Leave blank to use the minimum caster level for the spell."
            >
              <NumberInput value={level} onChange={setLevel} min={1} width={4} className={styles.level} />
            </Field>
          )}
        </Panel>

        <div className={styles.side}>
          {outcome !== null && (
            <Banner
              tone={outcome.tone}
              title={outcome.title}
              onDismiss={() => setOutcome(null)}
              dismissLabel="Dismiss"
            >
              {outcome.lines.map((line) => (
                <span key={line} className={styles.line}>
                  {line}
                </span>
              ))}
            </Banner>
          )}
          <Panel title={patient.name}>
            <div className={styles.patient}>
              {status.dead ? (
                <div className={styles.deadNote}>
                  <Badge tone="danger">Dead</Badge>
                </div>
              ) : (
                <HpBar
                  current={patient.current_hp}
                  max={patient.max_hp}
                  showValue
                  label={`${patient.name}'s hit points`}
                />
              )}
              {status.afflictions.length > 0 && (
                <div className={styles.chips}>
                  {status.afflictions.map((label) => (
                    <ConditionChip key={label} label={label} tone="harm" />
                  ))}
                </div>
              )}
              <div className={styles.purseRow}>
                <span className={styles.label}>{`${patient.name} carries`}</span>
                <CoinPurse coins={readPurse(patient)} />
              </div>
            </div>
          </Panel>
          <Panel title="Who pays">
            <p className={styles.pays}>The whole party shares temple fees.</p>
            <ul className={styles.purses}>
              {party.map((member) => (
                <li key={member.id} className={styles.purseLine}>
                  <span>{member.name}</span>
                  <span className={styles.gold}>{formatCoins(readPurse(member))}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
