import {
  useContext,
  useId,
  useState,
  type KeyboardEventHandler,
  type MouseEvent,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Tooltip, TooltipTriggerContext, type TooltipSide } from './Popover';
import styles from './ControlHelp.module.css';

/** The hover help props that every kit control a feature presses takes. */
export interface ControlHelpProps {
  /**
   * What the control does or what happens next, in one short phrase, such as "Search the room for secret doors
   * and traps". It shows on hover and on keyboard focus, and screen readers read it as the control's description.
   * Leave it out when the visible label already says everything.
   */
  tooltip?: ReactNode;
  /**
   * Why the control is unavailable and what would make it available, such as "Add at least one character to the
   * party to start the game." It applies only while `disabled` is true. The control then stays focusable,
   * announces itself with `aria-disabled`, ignores clicks and key presses, shows the reason in its tooltip, and
   * gives the reason to screen readers as its description. Pressing the control shows the reason too, which is
   * how a touch user reads it. Without a reason, a disabled control is natively disabled and can't be focused.
   */
  disabledReason?: ReactNode;
  /** The side of the control where the tooltip opens. Defaults to `'top'`. */
  tooltipSide?: TooltipSide;
}

/** Whether a node has something to show. */
export function hasContent(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== '';
}

/**
 * Whether a button's label is cut off: hidden by a compact action bar, or truncated with an ellipsis.
 *
 * @param button - The button, which marks its label with `data-button-label`.
 */
export function labelIsCut(button: Element | null): boolean {
  const label = button?.querySelector('[data-button-label]');
  if (!(label instanceof HTMLElement)) return false;
  return label.scrollWidth > label.clientWidth + 1;
}

/** Joins `aria-describedby` ID lists, leaving out the empty ones. */
export function joinIds(...ids: Array<string | undefined>): string | undefined {
  const joined = ids.filter((id) => id !== undefined && id !== '').join(' ');
  return joined === '' ? undefined : joined;
}

export interface ControlHelpOptions {
  /** The tooltip while the control is available, or nothing. */
  tooltip: ReactNode;
  /** Whether `tooltip` only repeats the control's accessible name, so screen readers don't hear it twice. */
  tooltipIsName: boolean;
  /** Why the control is unavailable, or `null` when it is available. */
  reason: ReactNode;
  /** For a control with no visible text, the name the tooltip shows above the reason. */
  name?: ReactNode;
  /** Keys the tooltip shows while the control is available. */
  shortcut?: string | string[];
  side?: TooltipSide;
  /** Opens the tooltip of an available control only when this returns true, such as when its label is cut off. */
  when?: () => boolean;
}

export interface ControlHandlers<T extends HTMLElement> {
  onClick?: MouseEventHandler<T>;
  onPointerDown?: PointerEventHandler<T>;
  onKeyDown?: KeyboardEventHandler<T>;
}

export interface ControlHelp {
  /** Whether the control is unavailable: disabled, with a reason. */
  unavailable: boolean;
  /** The ID of the control's description, for its `aria-describedby`. */
  describedBy: string | undefined;
  /**
   * The control's event handlers. While it is unavailable, a click does nothing but show the reason, and Enter,
   * Space, and pointer down never reach the handlers, so a menu, popover, or dialog trigger stays shut too.
   */
  handlers: <T extends HTMLElement>(own: ControlHandlers<T>) => ControlHandlers<T>;
  /** Wraps the control in its tooltip and adds its description. */
  render: (control: ReactElement) => ReactNode;
}

/**
 * The hover help of a kit control: its tooltip, its description for screen readers, and the unavailable state.
 * Kit controls use it. Features pass `tooltip` and `disabledReason` to a control instead.
 */
export function useControlHelp({
  tooltip,
  tooltipIsName,
  reason,
  name,
  shortcut,
  side = 'top',
  when,
}: ControlHelpOptions): ControlHelp {
  const [open, setOpen] = useState(false);
  const outer = useContext(TooltipTriggerContext);
  const descriptionId = useId();
  const unavailable = hasContent(reason);
  const description = unavailable ? reason : tooltipIsName ? null : tooltip;
  const described = hasContent(description);
  const reveal = outer ? outer.reveal : () => setOpen(true);

  const handlers = <T extends HTMLElement>(own: ControlHandlers<T>): ControlHandlers<T> => {
    if (!unavailable) return own;
    return {
      onClick: (event: MouseEvent<T>) => {
        // Stops a submit button from submitting its form, too.
        event.preventDefault();
        reveal();
      },
      onPointerDown: undefined,
      onKeyDown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') return;
        own.onKeyDown?.(event);
      },
    };
  };

  const content = unavailable ? (
    hasContent(name) ? (
      <span className={styles.lines}>
        <span>{name}</span>
        <span className={styles.reason}>{reason}</span>
      </span>
    ) : (
      reason
    )
  ) : (
    tooltip
  );

  const render = (control: ReactElement): ReactNode => {
    const tip = hasContent(content) ? (
      <Tooltip
        content={content}
        shortcut={unavailable ? undefined : shortcut}
        side={side}
        describe={false}
        open={open}
        onOpenChange={(next) => setOpen(next && (unavailable || when === undefined || when()))}
      >
        {control}
      </Tooltip>
    ) : (
      control
    );
    if (!described) return tip;
    return (
      <>
        {tip}
        {createPortal(
          <span id={descriptionId} hidden data-control-description="">
            {description}
          </span>,
          document.body,
        )}
      </>
    );
  };

  return { unavailable, describedBy: described ? descriptionId : undefined, handlers, render };
}
