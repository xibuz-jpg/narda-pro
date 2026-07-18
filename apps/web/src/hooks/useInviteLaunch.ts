import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/auth.store';
import { useGameStore } from '../store/game.store';
import { getStartParam } from '../lib/telegram';

/**
 * When the app is opened from a friend-invite deep link
 * (`t.me/<bot>?startapp=<code>`), auto-redeem the code once the player is signed
 * in and idle. Consumed once so a later manual navigation doesn't re-trigger it.
 */
export function useInviteLaunch(): void {
  const status = useAuthStore((s) => s.status);
  // Wait until the profile is ready with a display name, so a first-run friend
  // finishes the name prompt before we pull them into the game.
  const hasName = useAuthStore((s) => Boolean(s.user?.displayName));
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current || status !== 'authed' || !hasName) return;
    const code = getStartParam();
    if (!code) return;
    consumed.current = true;
    if (useGameStore.getState().status === 'idle') {
      useGameStore.getState().joinFriendByCode(code);
    }
  }, [status, hasName]);
}
