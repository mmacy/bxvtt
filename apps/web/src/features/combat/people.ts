/**
 * Who sits where: each party member's seat owner and color, and which members this user declares for.
 */
import type { Member } from '@bxvtt/shared/protocol';
import { useMemo } from 'react';
import { useIsReferee, useMembers, useSeats, useTableUser } from '@/app';
import { playerColorHex } from '@/ui';
import { seatOwner } from './model';

/** The color of a member whose seat is empty, which the referee controls. */
export const EMPTY_SEAT_COLOR = playerColorHex('slate');

export interface CombatPeople {
  /** The table member in the party member's seat, or `null` for an empty seat. */
  ownerOf: (memberId: string) => Member | null;
  /** The seat owner's color, by party member ID. */
  colors: Record<string, string>;
  /** Whether this user declares for the member: their seat, or an empty seat for a referee. */
  isMine: (memberId: string) => boolean;
  /** The user's name for "waiting for" text. */
  userId: string | null;
}

export function useCombatPeople(): CombatPeople {
  const seats = useSeats();
  const members = useMembers();
  const user = useTableUser();
  const referee = useIsReferee();
  return useMemo(() => {
    const colors: Record<string, string> = {};
    for (const seat of seats)
      colors[seat.member_id] = seatOwner(seats, members, seat.member_id)?.color ?? EMPTY_SEAT_COLOR;
    return {
      ownerOf: (memberId: string) => seatOwner(seats, members, memberId),
      colors,
      isMine: (memberId: string) => {
        const seat = seats.find((s) => s.member_id === memberId);
        if (seat === undefined) return false;
        if (seat.user_id !== null) return seat.user_id === user?.id;
        return referee;
      },
      userId: user?.id ?? null,
    };
  }, [seats, members, user, referee]);
}
