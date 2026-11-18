import { BrandMark } from "@/components/ui/BrandMark";
import { Spinner } from "@/components/ui/Spinner";

export function SessionSplash({ message = "Preparando tu sesión" }: { message?: string }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(99,230,182,0.12),transparent_42%)]" />
      <div className="relative flex flex-col items-center gap-6 text-center">
        <BrandMark />
        <span className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-mist-300">
          <Spinner className="size-3.5 text-mint-400" />
          {message}
        </span>
      </div>
    </div>
  );
}
