import { BrandMark } from "@/components/ui/BrandMark";
import { Spinner } from "@/components/ui/Spinner";

export function SessionSplash({ message = "Preparando tu sesión" }: { message?: string }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper-100 px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(31,67,255,0.1),transparent_42%)]" />
      <div className="relative flex flex-col items-center gap-6 text-center">
        <BrandMark />
        <span className="inline-flex items-center gap-3 rounded-[2px] border border-ink-950/15 bg-paper-50 px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-ink-700">
          <Spinner className="size-3.5 text-electric-500" />
          {message}
        </span>
      </div>
    </div>
  );
}
