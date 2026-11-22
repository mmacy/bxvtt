import { Accordion as AccordionPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { cx } from '../lib/cx';
import styles from './Accordion.module.css';

export interface AccordionItem {
  value: string;
  title: ReactNode;
  /** Text at the trailing edge of the header, such as a count. */
  meta?: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

interface AccordionBaseProps {
  items: AccordionItem[];
  className?: string;
}

export type AccordionProps = AccordionBaseProps &
  (
    | { type?: 'single'; value?: string; defaultValue?: string; onValueChange?: (value: string) => void }
    | {
        type: 'multiple';
        value?: string[];
        defaultValue?: string[];
        onValueChange?: (value: string[]) => void;
      }
  );

/** Stacked sections that expand in place, such as spell levels or equipment categories. */
export function Accordion(props: AccordionProps) {
  const { items, className } = props;
  const children = items.map((item) => (
    <AccordionPrimitive.Item
      key={item.value}
      value={item.value}
      disabled={item.disabled}
      className={styles.item}
    >
      <AccordionPrimitive.Header className={styles.header}>
        <AccordionPrimitive.Trigger className={styles.trigger}>
          <Icon name="chevron-right" size={14} className={styles.chevron} />
          <span className={styles.title}>{item.title}</span>
          {item.meta !== undefined && <span className={styles.meta}>{item.meta}</span>}
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className={styles.content}>
        <div className={styles.inner}>{item.content}</div>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  ));
  if (props.type === 'multiple') {
    return (
      <AccordionPrimitive.Root
        type="multiple"
        value={props.value}
        defaultValue={props.defaultValue}
        onValueChange={props.onValueChange}
        className={cx(styles.root, className)}
      >
        {children}
      </AccordionPrimitive.Root>
    );
  }
  return (
    <AccordionPrimitive.Root
      type="single"
      collapsible
      value={props.value}
      defaultValue={props.defaultValue}
      onValueChange={props.onValueChange}
      className={cx(styles.root, className)}
    >
      {children}
    </AccordionPrimitive.Root>
  );
}
