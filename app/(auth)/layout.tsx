/**
 * Shell for the unauthenticated routes: a quiet, full-height canvas that lets
 * the login card carry the whole page.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* Soft emerald wash — decoration only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(60rem 32rem at 50% -12%, oklch(0.478 0.098 161 / 0.10), transparent 70%), radial-gradient(40rem 26rem at 88% 108%, oklch(0.755 0.106 79 / 0.09), transparent 70%)",
        }}
      />
      {children}
    </div>
  );
}
