use crate::nn_config::json_to_nn::{TrainingCore, TrainingSource};
use crate::EngineError;
use pyo3::prelude::*;
use serde::Serialize;

#[derive(Serialize)]
struct StartInfo {
    epochs: usize,
    train_rows: usize,
    test_rows: usize,
}

#[derive(Serialize)]
struct EpochReport {
    epoch: usize,
    loss_train: f32,
    loss_test: Option<f32>,
}

#[pyclass]
pub struct LiveTrainer {
    core: TrainingCore,
    epochs_planned: usize,
    epoch_done: usize,
    finished: bool,
}

impl LiveTrainer {
    pub(crate) fn from_model_and_source(
        model_data: &str,
        source: TrainingSource,
    ) -> Result<LiveTrainer, EngineError> {
        let core = TrainingCore::new(model_data, source, true)?;

        Ok(LiveTrainer {
            epochs_planned: core.epochs(),
            core,
            epoch_done: 0,
            finished: false,
        })
    }

    pub(crate) fn start_info_json(&self) -> Result<String, EngineError> {
        serde_json::to_string(&StartInfo {
            epochs: self.epochs_planned,
            train_rows: self.core.train_rows(),
            test_rows: self.core.test_rows(),
        })
        .map_err(|e| EngineError::Unexpected(e.to_string()))
    }

    pub(crate) fn next_epoch_json(&mut self) -> Result<Option<String>, EngineError> {
        if self.finished {
            return Ok(None);
        }

        if self.epoch_done >= self.epochs_planned {
            self.finished = true;
            return Ok(None);
        }

        let (loss_train, loss_test) = self.core.epoch(self.epoch_done)?;
        self.epoch_done += 1;

        let report = EpochReport {
            epoch: self.epoch_done,
            loss_train,
            loss_test,
        };

        serde_json::to_string(&report)
            .map(Some)
            .map_err(|e| EngineError::Unexpected(e.to_string()))
    }

    pub(crate) fn result_json(&self) -> Result<String, EngineError> {
        if !self.finished {
            return Err(EngineError::Config(
                "El resultado solo está disponible al agotar la iteración".to_string(),
            ));
        }

        let outcome = self.core.outcome()?;

        serde_json::to_string(&outcome).map_err(|e| EngineError::Unexpected(e.to_string()))
    }

    fn build(
        model_data: String,
        training_data: String,
        input_columns: Option<usize>,
    ) -> PyResult<LiveTrainer> {
        let source = match input_columns {
            Some(columns) => TrainingSource::Csv {
                content: training_data,
                input_columns: columns,
            },
            None => TrainingSource::Json(training_data),
        };

        Ok(LiveTrainer::from_model_and_source(&model_data, source)?)
    }

    fn build_detached(
        py: Python<'_>,
        model_data: String,
        training_data: String,
        input_columns: Option<usize>,
    ) -> PyResult<LiveTrainer> {
        Ok(py.detach(move || LiveTrainer::build(model_data, training_data, input_columns))?)
    }
}

#[pymethods]
impl LiveTrainer {
    #[new]
    #[pyo3(signature = (model_data, training_data, input_columns=None))]
    fn new(
        py: Python<'_>,
        model_data: String,
        training_data: String,
        input_columns: Option<usize>,
    ) -> PyResult<LiveTrainer> {
        LiveTrainer::build_detached(py, model_data, training_data, input_columns)
    }

    #[staticmethod]
    fn new_from_json(
        py: Python<'_>,
        model_data: String,
        training_data: String,
    ) -> PyResult<LiveTrainer> {
        LiveTrainer::build_detached(py, model_data, training_data, None)
    }

    #[staticmethod]
    fn new_from_csv(
        py: Python<'_>,
        model_data: String,
        csv: String,
        input_columns: usize,
    ) -> PyResult<LiveTrainer> {
        LiveTrainer::build_detached(py, model_data, csv, Some(input_columns))
    }

    fn start_info(&self, py: Python<'_>) -> PyResult<String> {
        Ok(py.detach(|| self.start_info_json())?)
    }

    fn next_epoch(&mut self, py: Python<'_>) -> PyResult<Option<String>> {
        Ok(py.detach(|| self.next_epoch_json())?)
    }

    fn result(&self, py: Python<'_>) -> PyResult<String> {
        Ok(py.detach(|| self.result_json())?)
    }
}
