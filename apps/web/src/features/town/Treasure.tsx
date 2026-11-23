/** The treasure buyers: every gem and piece of jewellery in the party, with its value, to sell in one go. */
import { describeEvents, formatCoins, formatGold } from '@bxvtt/shared/text';
import { useMemo, useState } from 'react';
import { useParty, usePlayerView, useSendCommand, useTextContext } from '@/app';
import { Badge, Banner, Button, Checkbox, CoinPurse, EmptyState, Panel } from '@/ui';
import { usePartyAccess } from './hooks';
import { readInventory, totalValue, type Valuable } from './inventory';
import { MemberToken, PlaceHeader, classLine } from './parts';
import { placeName } from './services';
import styles from './Treasure.module.css';

interface Holder {
  id: string;
  name: string;
  detail: string;
  valuables: Valuable[];
}

export function Treasure() {
  const view = usePlayerView();
  const party = useParty();
  const ctx = useTextContext();
  const access = usePartyAccess('sell_treasure');
  const { send, pending } = useSendCommand();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [outcome, setOutcome] = useState<{ tone: 'success' | 'warning'; lines: string[] } | null>(null);

  const holders: Holder[] = useMemo(
    () =>
      party
        .map((member) => ({
          id: member.id,
          name: member.name,
          detail: classLine(member),
          valuables: readInventory(member).valuables,
        }))
        .filter((holder) => holder.valuables.length > 0),
    [party],
  );
  const all = holders.flatMap((holder) => holder.valuables);
  const live = new Set(all.map((valuable) => valuable.instanceId));
  const chosen = all.filter((valuable) => picked.has(valuable.instanceId) && live.has(valuable.instanceId));
  const who = placeName('treasure', view?.town_services ?? []);

  const toggle = (id: string, on: boolean) =>
    setPicked((previous) => {
      const next = new Set(previous);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const sell = async (valuables: readonly Valuable[]) => {
    if (valuables.length === 0) return;
    setOutcome(null);
    const result = await send(
      { command_type: 'sell_treasure', item_ids: valuables.map((valuable) => valuable.instanceId) },
      { display: 'inline' },
    );
    if (result.status === 'accepted') {
      const lines = describeEvents(result.result.events, ctx, {
        messages: result.result.messages,
        only: 'player',
      }).map((line) => line.text);
      setPicked(new Set());
      setOutcome({ tone: 'success', lines: lines.length > 0 ? lines : ['Treasure sold.'] });
    } else if (result.status === 'refused' || result.status === 'error' || result.status === 'skipped') {
      setOutcome({ tone: 'warning', lines: [result.message] });
    }
  };

  return (
    <div className={styles.treasure}>
      <PlaceHeader
        icon="gem"
        title={who ?? 'Treasure buyers'}
        lead="Sell gems and jewellery for their full gold value. Each character receives the gold for the items they carry."
      />

      {!access.allowed && <Banner tone="info">{access.explanation}</Banner>}

      {outcome !== null && (
        <Banner
          tone={outcome.tone}
          title={outcome.tone === 'success' ? 'Treasure sold' : "Couldn't sell treasure"}
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

      {holders.length === 0 ? (
        <EmptyState
          icon="gem"
          title="No gems or jewellery to sell"
          description="Valuables you bring back from the dungeon appear here."
        />
      ) : (
        <div className={styles.layout}>
          <div className={styles.holders}>
            {holders.map((holder) => {
              const member = party.find((candidate) => candidate.id === holder.id);
              const ids = holder.valuables.map((valuable) => valuable.instanceId);
              const count = ids.filter((id) => picked.has(id)).length;
              return (
                <Panel
                  key={holder.id}
                  title={
                    <span className={styles.holderTitle}>
                      {member && <MemberToken member={member} size={24} />}
                      {holder.name}
                    </span>
                  }
                  meta={`${formatCoins({ gp: totalValue(holder.valuables) })} in treasure`}
                  actions={
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setPicked((previous) => {
                          const next = new Set(previous);
                          for (const id of ids) {
                            if (count === ids.length) next.delete(id);
                            else next.add(id);
                          }
                          return next;
                        })
                      }
                    >
                      {count === ids.length ? 'Clear' : 'Select all'}
                    </Button>
                  }
                >
                  <ul className={styles.valuables}>
                    {holder.valuables.map((valuable) => (
                      <li key={valuable.instanceId} className={styles.valuable}>
                        <Checkbox
                          label={valuable.name}
                          checked={picked.has(valuable.instanceId)}
                          onCheckedChange={(on) => toggle(valuable.instanceId, on)}
                        />
                        <Badge tone={valuable.kind === 'gem' ? 'info' : 'magic'}>
                          {valuable.kind === 'gem' ? 'Gem' : 'Jewellery'}
                        </Badge>
                        <span className={styles.value}>{formatGold(valuable.valueGp)}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              );
            })}
          </div>

          <aside className={styles.summary} aria-label="Sale">
            <Panel title="Sale summary">
              <div className={styles.totals}>
                <div className={styles.total}>
                  <span>Selected</span>
                  <span className={styles.big}>
                    {chosen.length === 0
                      ? 'None selected'
                      : `${chosen.length} for ${formatGold(totalValue(chosen))}`}
                  </span>
                </div>
                <div className={styles.total}>
                  <span>Everything</span>
                  <span className={styles.big}>{`${all.length} for ${formatGold(totalValue(all))}`}</span>
                </div>
              </div>
              <div className={styles.buttons}>
                <Button
                  variant="primary"
                  icon="coins"
                  loading={pending}
                  disabled={chosen.length === 0 || !access.allowed}
                  onClick={() => void sell(chosen)}
                >
                  Sell selected
                </Button>
                <Button
                  variant="secondary"
                  loading={pending}
                  disabled={all.length === 0 || !access.allowed}
                  onClick={() => void sell(all)}
                >
                  Sell everything
                </Button>
              </div>
            </Panel>
            <Panel title="Party purses">
              <ul className={styles.purses}>
                {party.map((member) => (
                  <li key={member.id} className={styles.purseLine}>
                    <span>{member.name}</span>
                    <CoinPurse coins={readInventory(member).purse} />
                  </li>
                ))}
              </ul>
            </Panel>
          </aside>
        </div>
      )}
    </div>
  );
}
