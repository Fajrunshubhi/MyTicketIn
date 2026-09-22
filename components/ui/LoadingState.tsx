export function LoadingState({ label = "Memuat…" }: { label?: string }) {
  return (
    <p role="status" className="text-sm opacity-80">
      {label}
    </p>
  );
}
