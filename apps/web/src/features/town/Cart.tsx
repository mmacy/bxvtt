/** The outfitter's cart for the chosen buyer, and the cards that show what each purchase changed. */
import type { MemberView } from '@bxvtt/shared/bxapi';
import { formatCoins, formatGold, joinList } from '@bxvtt/shared/text';
import { useState } from 'react';
import { usePartyMember, useSendCommand, useTextContext } from '@/app';
import { Badge, Banner, Button, CoinPurse, IconButton } from '@/ui';
import { cartLines, cartTotal } from './cartLines';
import { isEquippable, lotSentence, type ShopItem } from './equipment';
import { goldIn, readInventory, readPurse } from './inventory';
import type { PurchaseProblem, PurchaseReport } from './purchase';
import styles from './Cart.module.css';

export interface CartPanelProps {
  buyer: MemberView | null;
  items: readonly ShopItem[];
  cart: Record<string, number>;
  onLots: (itemId: string, lots: number) => void;
  onClear: () => void;
  onBuy: () => void;
  pending: boolean;
  problem: PurchaseProblem | null;
  onDismissProblem: () => void;
  /** Other members with a full cart, to offer one button that buys for all of them. */
  othersWithCarts: number;
  onBuyEveryone: () => void;
  /** Members this cart could be copied to. */
  copyTargets: number;
  /** Names of members the copy skips because they can't shop. */
  skipped: string[];
  onCopy: () => void;
}

export function CartPanel({
  buyer,
  items,
  cart,
  onLots,
  onClear,
  onBuy,
  pending,
  problem,
  onDismissProblem,
  othersWithCarts,
  onBuyEveryone,
  copyTargets,
  skipped,
  onCopy,
}: CartPanelProps) {
  const ctx = useTextContext();
  const lines = cartLines(cart, items);
  const total = cartTotal(lines);
  const gold = buyer ? goldIn(readPurse(buyer)) : 0;
  const short = buyer !== null && total > gold;
  return (
    <div className={styles.cart}>
      <div className={styles.purse}>
        <span className={styles.purseLabel}>{buyer ? `${buyer.name} carries` : 'No buyer chosen'}</span>
        {buyer && <CoinPurse coins={readPurse(buyer)} showEmpty={false} />}
      </div>
      {lines.length > 0 && (
        <div className={styles.total}>
          <span>Total</span>
          <span className={styles.totalValue}>{formatGold(total)}</span>
        </div>
      )}
      {short && lines.length > 0 && buyer && (
        <p className={styles.hint} role="status">
          {`That is more than the ${formatGold(gold)} ${buyer.name} carries in gold. The shop decides if other coins cover it.`}
        </p>
      )}
      {problem !== null && (
        <Banner
          tone="warning"
          title={`${problem.memberName} can't buy that`}
          onDismiss={onDismissProblem}
          dismissLabel="Dismiss"
        >
          {problem.message}
        </Banner>
      )}
      <div className={styles.actions}>
        <Button
          variant="primary"
          icon="coins"
          loading={pending}
          disabled={lines.length === 0 || buyer === null}
          onClick={onBuy}
        >
          {buyer ? `Buy for ${buyer.name}` : 'Buy'}
        </Button>
        {lines.length > 0 && (
          <Button variant="ghost" onClick={onClear}>
            Empty the cart
          </Button>
        )}
      </div>
      {lines.length === 0 ? (
        <p className={styles.empty}>
          The cart is empty. Add items from the shelves, and each one waits here until you buy.
        </p>
      ) : (
        <ul className={styles.lines} aria-label="Cart">
          {lines.map((line) => {
            const lot = lotSentence(line.item, line.lots, ctx);
            return (
              <li key={line.item.summary.id} className={styles.line}>
                <div className={styles.lineText}>
                  <span className={styles.lineName}>
                    {line.lots > 1 ? `${line.lots} × ` : ''}
                    {line.item.summary.name}
                  </span>
                  {lot && <span className={styles.lineLot}>{lot}</span>}
                </div>
                <span className={styles.linePrice}>{formatGold(line.costGp)}</span>
                <IconButton
                  icon="close"
                  size="sm"
                  label={`Remove ${line.item.summary.name} from the cart`}
                  onClick={() => onLots(line.item.summary.id, 0)}
                />
              </li>
            );
          })}
        </ul>
      )}
      {(copyTargets > 0 && lines.length > 0) || othersWithCarts > 0 ? (
        <div className={styles.party}>
          {copyTargets > 0 && lines.length > 0 && (
            <Button variant="ghost" size="sm" icon="copy" onClick={onCopy}>
              Same for everyone you shop for
            </Button>
          )}
          {copyTargets > 0 && lines.length > 0 && skipped.length > 0 && (
            <p
              className={styles.skipped}
            >{`Skips ${joinList(skipped)}, who ${skipped.length === 1 ? 'is' : 'are'} dead.`}</p>
          )}
          {othersWithCarts > 0 && (
            <Button variant="secondary" size="sm" icon="users" loading={pending} onClick={onBuyEveryone}>
              {`Buy every cart (${othersWithCarts + (lines.length > 0 ? 1 : 0)})`}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function EquipRow({ report, bought }: { report: PurchaseReport; bought: PurchaseReport['bought'][number] }) {
  const member = usePartyMember(report.memberId);
  const { send, pending } = useSendCommand();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const carried = member ? readInventory(member).items.filter((item) => item.id === bought.id) : [];
  const inPack = carried.some((item) => !item.equipped);
  const equipped = done || (!inPack && carried.some((item) => item.equipped));
  const verb = bought.itemType === 'armour' ? 'Wear' : 'Wield';
  const equip = async () => {
    setError(null);
    const result = await send(
      { command_type: 'equip_item', character_id: report.memberId, item_id: bought.id },
      { display: 'inline' },
    );
    if (result.status === 'accepted') setDone(true);
    else if (result.status === 'refused' || result.status === 'error' || result.status === 'skipped') {
      setError(result.message);
    }
  };
  return (
    <li className={styles.equipRow}>
      <span>{bought.name}</span>
      {equipped ? (
        <Badge tone="success" icon="check">
          {bought.itemType === 'armour' ? 'Worn' : 'Wielded'}
        </Badge>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          onClick={equip}
          aria-label={`${verb} ${bought.name} now`}
        >
          {`${verb} it now`}
        </Button>
      )}
      {error !== null && (
        <span className={styles.equipError} role="alert">
          {error}
        </span>
      )}
    </li>
  );
}

/** What one purchase changed: what was bought, the purse before and now, and a way to equip it at once. */
export function PurchaseCard({ report, onDismiss }: { report: PurchaseReport; onDismiss: () => void }) {
  const member = usePartyMember(report.memberId);
  const equippable = report.bought.filter((item) => isEquippable(item.itemType));
  return (
    <section className={styles.report} aria-label={`${report.memberName}'s purchase`}>
      <header className={styles.reportHead}>
        <h3 className={styles.reportTitle}>{`${report.memberName} bought`}</h3>
        <IconButton icon="close" size="sm" label="Dismiss this purchase" onClick={onDismiss} />
      </header>
      <ul className={styles.reportLines}>
        {report.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className={styles.purseChange}>
        <span className={styles.purseWas}>{formatCoins(report.purseBefore)}</span>
        <span aria-hidden="true">→</span>
        <span className="visually-hidden">became</span>
        {member ? <CoinPurse coins={readPurse(member)} showEmpty={false} /> : null}
      </div>
      {equippable.length > 0 && (
        <div>
          <p className={styles.equipTitle}>Ready to use?</p>
          <ul className={styles.equipList}>
            {equippable.map((bought) => (
              <EquipRow key={bought.id} report={report} bought={bought} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
