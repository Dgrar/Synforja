pub mod errors;
pub mod matrix;
pub mod neural_network;
pub mod nn_config;

pub use errors::EngineError;
pub use matrix::operations::{Initialization, Matrix};

use pyo3::prelude::*;
use pyo3::types::PyModule;

#[pymodule]
fn _engine(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(nn_config::json_to_nn::train_json, m)?)?;
    m.add_function(wrap_pyfunction!(nn_config::json_to_nn::train_csv, m)?)?;
    m.add_function(wrap_pyfunction!(nn_config::json_to_nn::parse_csv, m)?)?;
    m.add_function(wrap_pyfunction!(nn_config::json_to_nn::predict_json, m)?)?;
    m.add_function(wrap_pyfunction!(nn_config::json_to_nn::evaluate_json, m)?)?;
    Ok(())
}
