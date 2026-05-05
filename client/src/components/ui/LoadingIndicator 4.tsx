import { Loader2 } from "lucide-react";

type LoadingSpinnerProps = {
  className?: string;
};

type LoadingStateProps = {
  label?: string;
  className?: string;
};

export function LoadingSpinner({ className = "w-4 h-4" }: LoadingSpinnerProps) {
  return <Loader2 className={`${className} animate-spin shrink-0`} aria-hidden="true" />;
}

export function LoadingState({
  label = "טוען...",
  className = "p-8",
}: LoadingStateProps) {
  return (
    <div
      className={`${className} flex items-center justify-center gap-2 text-center text-sm text-slate-500`}
      role="status"
      aria-live="polite"
    >
      <LoadingSpinner className="w-4 h-4 text-[#1d5c8b]" />
      <span>{label}</span>
    </div>
  );
}
