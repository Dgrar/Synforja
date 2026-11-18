import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { errorMessage } from "@/lib/api/errors";

export function QueryError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Alert
      tone="error"
      title="No se pudieron cargar los datos"
      actions={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      }
    >
      {errorMessage(error)}
    </Alert>
  );
}
