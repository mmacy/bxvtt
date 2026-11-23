/** The outfitter: a catalog, item details, and a cart per party member, for buying a whole party's gear quickly. */
import { count, formatGold } from '@bxvtt/shared/text';
import { useMemo, useRef, useState } from 'react';
import { Badge, Banner, Button, EmptyState, Icon, Panel } from '@/ui';
import { CartPanel, PurchaseCard } from './Cart';
import { Catalog } from './Catalog';
import { cartCount } from './cartLines';
import { useShopItems } from './equipment';
import { useShoppers } from './hooks';
import { usePlayerView } from '@/app';
import { ChecklistPanel } from './Glance';
import { ItemDetails } from './ItemDetails';
import { readInventory } from './inventory';
import { memberStatus } from './members';
import { MemberChooser, PlaceHeader } from './parts';
import { placeName } from './services';
import { usePurchase } from './purchase';
import { useTownUi } from './townUi';
import styles from './Outfitter.module.css';

export function Outfitter() {
  const view = usePlayerView();
  const shoppers = useShoppers();
  const { items, loading, error, retry } = useShopItems();
  const buyerId = useTownUi((s) => s.buyerId);
  const setBuyerId = useTownUi((s) => s.setBuyerId);
  const carts = useTownUi((s) => s.carts);
  const setLots = useTownUi((s) => s.setLots);
  const clearCart = useTownUi((s) => s.clearCart);
  const copyCart = useTownUi((s) => s.copyCart);
  const search = useTownUi((s) => s.outfitterSearch);
  const setSearch = useTownUi((s) => s.setOutfitterSearch);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const { buy, pending, reports, problems, dismiss, clearProblem } = usePurchase(items);

  const buyer = shoppers.find((member) => member.id === buyerId) ?? shoppers[0] ?? null;
  const cart = buyer ? (carts[buyer.id] ?? {}) : {};
  const selected = items.find((item) => item.summary.id === selectedId) ?? null;
  const others = shoppers.filter((member) => member.id !== buyer?.id);
  // A dead member can't shop, so a copied cart skips them. bxapi still decides what any purchase may do.
  const copyTargets = others.filter((member) => !memberStatus(member).dead);
  const skipped = others.filter((member) => memberStatus(member).dead).map((member) => member.name);
  const othersWithCarts = others.filter((member) => cartCount(carts[member.id] ?? {}) > 0);
  const carrying = useMemo(() => (buyer ? readInventory(buyer).items : []), [buyer]);

  if (shoppers.length === 0 || buyer === null) {
    return (
      <EmptyState
        icon="user"
        title="No character assigned"
        description="Ask the referee to assign you a character seat before shopping."
      />
    );
  }

  return (
    <div className={styles.outfitter}>
      <PlaceHeader
        icon="chest"
        dense
        title={placeName('outfitter', view?.town_services ?? []) ?? 'Outfitter'}
        lead="Buy weapons, armour, and adventuring gear for each character."
      />
      <div className={styles.buyers}>
        <span className={styles.buyersLabel}>Shopping for</span>
        <MemberChooser
          label="Shopping for"
          members={shoppers}
          value={buyer.id}
          onChange={setBuyerId}
          meta={(member) => {
            const gold = readGold(member);
            return gold;
          }}
          description={(member) => {
            const n = cartCount(carts[member.id] ?? {});
            return `${readGold(member)}${n > 0 ? `, ${n} in cart` : ''}`;
          }}
          badge={(member) => {
            const n = cartCount(carts[member.id] ?? {});
            return n > 0 ? <Badge tone="accent" appearance="solid">{`${n} in cart`}</Badge> : null;
          }}
        />
        <Button
          className={styles.toCart}
          variant="secondary"
          size="sm"
          icon="chest"
          onClick={() => asideRef.current?.scrollIntoView({ block: 'start' })}
        >
          {`View cart (${cartCount(cart)})`}
        </Button>
      </div>
      <div className={styles.grid}>
        <Catalog
          items={items}
          loading={loading}
          error={error}
          retry={retry}
          search={search}
          onSearch={setSearch}
          cart={cart}
          onLots={(itemId, lots) => setLots(buyer.id, itemId, lots)}
          selectedId={selectedId}
          onSelect={setSelectedId}
          disabled={false}
        />
        <aside ref={asideRef} className={styles.aside} aria-label="Cart and item details">
          {reports.map((report) => (
            <PurchaseCard key={report.id} report={report} onDismiss={() => dismiss(report.memberId)} />
          ))}
          {problems
            .filter((problem) => problem.memberId !== buyer.id)
            .map((problem) => (
              <Banner
                key={problem.memberId}
                tone="warning"
                title={`${problem.memberName} can't buy that`}
                onDismiss={() => clearProblem(problem.memberId)}
                dismissLabel="Dismiss"
              >
                {`${problem.message} Items remain in ${problem.memberName}'s cart.`}
              </Banner>
            ))}
          <Panel title="Cart" meta={`For ${buyer.name}`}>
            <CartPanel
              buyer={buyer}
              items={items}
              cart={cart}
              onLots={(itemId, lots) => setLots(buyer.id, itemId, lots)}
              onClear={() => clearCart(buyer.id)}
              onBuy={() => void buy([buyer.id])}
              pending={pending}
              problem={problems.find((problem) => problem.memberId === buyer.id) ?? null}
              onDismissProblem={() => clearProblem(buyer.id)}
              othersWithCarts={othersWithCarts.length}
              onBuyEveryone={() =>
                void buy([
                  ...(cartCount(cart) > 0 ? [buyer.id] : []),
                  ...othersWithCarts.map((member) => member.id),
                ])
              }
              copyTargets={copyTargets.length}
              skipped={skipped}
              onCopy={() =>
                copyCart(
                  buyer.id,
                  copyTargets.map((member) => member.id),
                )
              }
            />
          </Panel>
          <Panel title="Details">
            <ItemDetails
              item={selected}
              lots={selected ? (cart[selected.summary.id] ?? 0) : 0}
              buyerName={buyer.name}
              disabled={false}
              onAdd={() =>
                selected && setLots(buyer.id, selected.summary.id, (cart[selected.summary.id] ?? 0) + 1)
              }
            />
          </Panel>
          <ChecklistPanel onShop={setSearch} />
          <Panel
            title={`${buyer.name}'s pack`}
            meta={count(carrying.length, 'item')}
            collapsible
            defaultOpen={false}
          >
            {carrying.length === 0 ? (
              <p className={styles.nothing}>No gear carried.</p>
            ) : (
              <ul className={styles.carrying}>
                {carrying.map((item) => (
                  <li key={`${item.id}-${item.name}`} className={styles.carried}>
                    <span>{item.quantity > 1 ? `${item.quantity} × ${item.name}` : item.name}</span>
                    {item.equipped && (
                      <Badge tone="success" icon="check">
                        Equipped
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <p className={styles.tip}>
            <Icon name="info" size={14} /> Press <kbd>O</kbd> anywhere in town to open the outfitter.
          </p>
        </aside>
      </div>
    </div>
  );
}

function readGold(member: Parameters<typeof readInventory>[0]): string {
  const purse = readInventory(member).purse;
  return formatGold(purse.gp);
}
