import { Suspense, lazy } from 'react';
import { useBootstrap } from './hooks/useBootstrap';
import { useInviteLaunch } from './hooks/useInviteLaunch';
import { useAuthStore } from './store/auth.store';
import { useUiStore } from './store/ui.store';
import { useGameStore } from './store/game.store';
import { SplashScreen } from './screens/SplashScreen';
import { LoginScreen } from './screens/LoginScreen';
import { NameScreen } from './screens/NameScreen';
import { HomeScreen } from './screens/HomeScreen';
import { InviteScreen } from './screens/InviteScreen';

// The board screens pull in PixiJS (the bulk of the bundle); load them lazily
// so the login/home flow doesn't download the renderer up front.
const GameScreen = lazy(() => import('./screens/GameScreen').then((m) => ({ default: m.GameScreen })));
const BoardPreviewScreen = lazy(() =>
  import('./screens/BoardPreviewScreen').then((m) => ({ default: m.BoardPreviewScreen })),
);

export default function App() {
  useBootstrap();
  useInviteLaunch();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const screen = useUiStore((s) => s.screen);
  const gameStatus = useGameStore((s) => s.status);

  if (status === 'loading') return <SplashScreen />;
  if (status === 'anon') return <LoginScreen />;

  // First run: ask the player to choose the name others will see.
  if (user && !user.displayName) return <NameScreen />;

  // Hosting a friend invite: a lightweight lobby (no Pixi) until they join.
  if (gameStatus === 'inviting') return <InviteScreen />;

  // An active or in-progress game takes over the whole view.
  if (gameStatus !== 'idle') {
    return (
      <Suspense fallback={<SplashScreen />}>
        <GameScreen />
      </Suspense>
    );
  }

  if (screen === 'boardPreview') {
    return (
      <Suspense fallback={<SplashScreen />}>
        <BoardPreviewScreen />
      </Suspense>
    );
  }
  return <HomeScreen />;
}
