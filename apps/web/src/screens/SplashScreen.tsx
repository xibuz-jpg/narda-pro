/** Full-screen loading state shown while the session is bootstrapping. */
export function SplashScreen() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6">
      <div className="anim-pop text-4xl font-bold tracking-tight">
        <span className="text-accent">Narda</span> Pro
      </div>
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10" aria-label="loading">
        <div className="anim-loader h-full w-1/2 rounded-full bg-accent" />
      </div>
    </div>
  );
}
