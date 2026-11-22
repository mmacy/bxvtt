/** Sending purchases and keeping what each one changed. */
import { describeEvents } from '@bxvtt/shared/text';
import type { MemberView } from '@bxvtt/shared/bxapi';
import { useCallback, useState } from 'react';
import { useParty, useSendCommand, useTextContext } from '@/app';
import { cartLines, purchaseItemIds } from './cartLines';
import type { ShopItem } from './equipment';
import { readPurse, type Purse } from './inventory';
import { useTownUi } from './townUi';

/** What one purchase did, kept so the page can show what changed. */
export interface PurchaseReport {
  id: number;
  memberId: string;
  memberName: string;
  /** The sentences that describe the purchase. */
  lines: string[];
  /** What the buyer carried in coins before. */
  purseBefore: Purse;
  /** The items bought, one entry for each kind. */
  bought: Array<{ id: string; name: string; itemType: string; lots: number }>;
}

/** A purchase that bxapi refused or that failed to send. */
export interface PurchaseProblem {
  memberId: string;
  memberName: string;
  message: string;
}

let nextReportId = 1;
const PAUSE_MS = 300;

/**
 * Buys what is in members' carts.
 *
 * @param items - The catalog, to name and price what is in each cart.
 * @returns `buy(memberIds)` to buy for one or more members in turn, the reports, the problems, and `pending`.
 */
export function usePurchase(items: readonly ShopItem[]) {
  const party = useParty();
  const ctx = useTextContext();
  const { send, pending } = useSendCommand();
  const [reports, setReports] = useState<PurchaseReport[]>([]);
  const [problems, setProblems] = useState<PurchaseProblem[]>([]);

  const buyFor = useCallback(
    async (member: MemberView): Promise<void> => {
      const state = useTownUi.getState();
      const lines = cartLines(state.carts[member.id] ?? {}, items);
      if (lines.length === 0) return;
      const purseBefore = readPurse(member);
      const result = await send(
        { command_type: 'purchase_equipment', character_id: member.id, item_ids: purchaseItemIds(lines) },
        { display: 'inline' },
      );
      if (result.status === 'accepted') {
        const sentences = describeEvents(result.result.events, ctx, {
          messages: result.result.messages,
          only: 'player',
        }).map((line) => line.text);
        useTownUi.getState().clearCart(member.id);
        setProblems((previous) => previous.filter((problem) => problem.memberId !== member.id));
        setReports((previous) => [
          {
            id: nextReportId++,
            memberId: member.id,
            memberName: member.name,
            lines: sentences,
            purseBefore,
            bought: lines.map((line) => ({
              id: line.item.summary.id,
              name: line.item.summary.name,
              itemType: line.item.summary.item_type,
              lots: line.lots,
            })),
          },
          ...previous.filter((report) => report.memberId !== member.id),
        ]);
      } else if (result.status === 'refused' || result.status === 'error' || result.status === 'skipped') {
        setProblems((previous) => [
          ...previous.filter((problem) => problem.memberId !== member.id),
          { memberId: member.id, memberName: member.name, message: result.message },
        ]);
      }
    },
    [items, send, ctx],
  );

  const buy = useCallback(
    async (memberIds: readonly string[]): Promise<void> => {
      for (const [index, id] of memberIds.entries()) {
        const member = party.find((candidate) => candidate.id === id);
        if (member === undefined) continue;
        if (index > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
        await buyFor(member);
      }
    },
    [party, buyFor],
  );

  const dismiss = useCallback((memberId: string) => {
    setReports((previous) => previous.filter((report) => report.memberId !== memberId));
  }, []);
  const clearProblem = useCallback((memberId: string) => {
    setProblems((previous) => previous.filter((problem) => problem.memberId !== memberId));
  }, []);

  return { buy, pending, reports, problems, dismiss, clearProblem };
}
