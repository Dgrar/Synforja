from django.db import transaction

from .models import Network, Run
from .schemas import RunDatasetOut, RunOut


def as_run_out(run: Run) -> RunOut:
    return RunOut(
        id=run.id,
        mse_loss=run.mse_loss,
        r_square=run.r_square,
        accuracy=run.accuracy,
        dataset=RunDatasetOut(
            id=run.dataset_id,
            total_rows=run.total_rows,
            input_cols=run.input_cols,
            output_cols=run.output_cols,
        ),
    )


def mark_training(network: Network) -> None:
    network.state = Network.State.TRAINING
    network.save(update_fields=["state"])


def restore_network(network: Network, state: str, weights: dict | None) -> None:
    network.state = state
    network.weights = weights
    network.save(update_fields=["state", "weights"])


def reset_after_failure(network: Network) -> None:
    restore_network(network, Network.State.DRAFT, None)


def persist_outcome(network: Network, dataset, outcome: dict) -> Run:
    try:
        with transaction.atomic():
            network.state = Network.State.TRAINED
            network.weights = outcome["network"]
            network.save(update_fields=["state", "weights"])
            run = Run.objects.create(
                network=network,
                dataset_id=dataset.id,
                total_rows=dataset.total_rows,
                input_cols=dataset.input_cols,
                output_cols=dataset.output_cols,
                mse_loss=outcome["mse_loss"],
                r_square=outcome["r_square"],
                accuracy=outcome["accuracy"],
            )
    except Exception:
        reset_after_failure(network)
        raise
    return run
