use pyo3::{exceptions::PyValueError, PyErr};

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("{0}")]
    Config(String),
    #[error("{0}")]
    Shape(String),
    #[error("La partición de entrenamiento o de test quedó vacía; revisa training_split y el número de filas")]
    EmptySplit,
    #[error("Los parámetros dejaron de ser finitos en la época {0}")]
    Divergence(usize),
    #[error("La activación SoftMax no se puede entrenar con retropropagación en esta versión")]
    SoftmaxNotImplemented,
    #[error("{0}")]
    Dataset(String),
    #[error("{0}")]
    Unexpected(String),
}

impl EngineError {
    pub fn code(&self) -> &'static str {
        match self {
            EngineError::Config(_) => "config",
            EngineError::Shape(_) => "shape",
            EngineError::EmptySplit => "empty_split",
            EngineError::Divergence(_) => "divergence",
            EngineError::SoftmaxNotImplemented => "softmax",
            EngineError::Dataset(_) => "dataset",
            EngineError::Unexpected(_) => "unexpected",
        }
    }

    pub fn into_py_err(self) -> PyErr {
        PyValueError::new_err(format!("engine::{}: {}", self.code(), self))
    }
}

impl From<EngineError> for PyErr {
    fn from(err: EngineError) -> PyErr {
        err.into_py_err()
    }
}
