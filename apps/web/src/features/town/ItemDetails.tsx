import { count, itemTypeLabel } from '@bxvtt/shared/text';
import { useTextContext } from '@/app';
import { Badge, Button, Icon } from '@/ui';
import { describeItem, itemIcon, weightCoins, type ShopItem } from './equipment';
import styles from './ItemDetails.module.css';

export interface ItemDetailsProps {
  item: ShopItem | null;
  lots: number;
  onAdd: () => void;
  buyerName: string | null;
  disabled: boolean;
}

/** What a buyer needs to know about one item, with a button that puts a lot in the cart. */
export function ItemDetails({ item, lots, onAdd, buyerName, disabled }: ItemDetailsProps) {
  const ctx = useTextContext();
  if (item === null) {
    return (
      <div className={styles.empty}>
        <Icon name="search" size={20} />
        <p>Choose an item to see its damage, armour class, weight, and what a lot holds.</p>
      </div>
    );
  }
  const facts = describeItem(item, ctx);
  const weight = weightCoins(item);
  return (
    <article className={styles.details} aria-label={`${item.summary.name}, details`}>
      <header className={styles.head}>
        <span className={styles.icon}>
          <Icon name={itemIcon(item.summary)} size={24} />
        </span>
        <div className={styles.headText}>
          <h3 className={styles.name}>{item.summary.name}</h3>
          <div className={styles.badges}>
            <Badge tone="neutral">{itemTypeLabel(item.summary.item_type)}</Badge>
            <Badge tone="gold" icon="coins">{`${item.summary.cost_gp} gp`}</Badge>
            {weight !== null && <Badge tone="neutral">{count(weight, 'coin')}</Badge>}
          </div>
        </div>
      </header>
      {facts.facts.length > 0 && (
        <dl className={styles.facts}>
          {facts.facts.map((fact) => (
            <div key={fact.label} className={styles.fact}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {facts.qualities.length > 0 && (
        <ul className={styles.qualities} aria-label="Qualities">
          {facts.qualities.map((quality) => (
            <li key={quality.label}>
              <strong>{`${quality.label}:`}</strong>
              {quality.meaning !== '' && <span>{` ${quality.meaning}`}</span>}
            </li>
          ))}
        </ul>
      )}
      {facts.notes.map((note) => (
        <p key={note} className={styles.note}>
          {note}
        </p>
      ))}
      <Button variant="secondary" icon="plus" disabled={disabled} onClick={onAdd}>
        {lots > 0
          ? `Add another to ${buyerName ?? 'the'} cart`
          : `Add to ${buyerName ? `${buyerName}'s` : 'the'} cart`}
      </Button>
    </article>
  );
}
