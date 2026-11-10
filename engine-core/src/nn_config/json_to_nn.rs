use crate::neural_network::neural_network::*;
use crate::nn_config::csv_to_json::process_csv;
use crate::{EngineError, Matrix};
use pyo3::prelude::*;
use rand::seq::SliceRandom;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};

// Formato correcto para el JSON de model_data:
// {
//   "layers": [{"size": 16, "activation": "Tanh"}],
//   "loss_fn": "mse_loss",
//   "lr": 0.01,
//   "epochs": 100,
//   "training_split": 0.8,
//   "seed": 42
// }

#[derive(Debug, Serialize)]
pub struct SplitInfo {
    pub train_rows: usize,
    pub test_rows: usize,
}

#[derive(Debug, Serialize)]
pub struct TrainingOutcome {
    network: NetworkSendInformation,
    mse_loss: f32,
    r_square: f32,
    accuracy: f32,
    split: SplitInfo,
}

#[derive(Debug, Serialize)]
struct MetricsOut {
    mse_loss: f32,
    r_square: f32,
    accuracy: f32,
}

#[derive(Deserialize, Debug)]
struct NeuralNetworkIn {
    #[serde(rename = "layers")]
    topology: Vec<LayerTopology>,
    loss_fn: String,
    lr: f32,
    epochs: usize,
    training_split: f32,
    seed: u64,
}

#[derive(Deserialize, Debug)]
struct TrainingDataIn {
    inputs: Vec<Vec<f32>>,
    expects: Vec<Vec<f32>>,
}

pub enum TrainingSource {
    Json(String),
    Csv {
        content: String,
        input_columns: usize,
    },
}

fn loss_from_name(name: &str) -> Result<Box<dyn LossFn + Send + Sync>, EngineError> {
    match name {
        "mse_loss" | "MSELoss" => Ok(Box::from(MSELoss {})),
        "bce_loss" | "BCELoss" => Ok(Box::from(BCELoss {})),
        "mae_loss" | "MAELoss" => Ok(Box::from(MAELoss {})),
        other => Err(EngineError::Config(format!(
            "Función de pérdida no admitida: {other}"
        ))),
    }
}

fn ensure_trainable(topology: &[LayerTopology]) -> Result<(), EngineError> {
    if topology
        .iter()
        .skip(1)
        .any(|layer| layer.activation == Activation::SoftMax)
    {
        return Err(EngineError::SoftmaxNotImplemented);
    }
    Ok(())
}

fn parse_training_data(source_data: TrainingSource) -> Result<Vec<(Vec<f32>, Vec<f32>)>, EngineError> {
    let training_data: TrainingDataIn = match source_data {
        TrainingSource::Json(json_str) => serde_json::from_str(&json_str).map_err(|e| {
            EngineError::Dataset(format!(
                "Error al analizar los datos de entrenamiento JSON: {e}"
            ))
        })?,

        TrainingSource::Csv {
            content,
            input_columns,
        } => {
            let values = process_csv(&content, input_columns)?;
            let (inputs, expects): (Vec<Vec<f32>>, Vec<Vec<f32>>) = values.into_iter().unzip();
            TrainingDataIn { inputs, expects }
        }
    };

    if training_data.inputs.len() != training_data.expects.len() {
        return Err(EngineError::Dataset(
            "Número de casos de entrada no coincide con los de salida".to_string(),
        ));
    }

    Ok(training_data
        .inputs
        .into_iter()
        .zip(training_data.expects)
        .collect())
}

pub struct TrainingCore {
    config: NeuralNetworkIn,
    loss_fn: Box<dyn LossFn + Send + Sync>,
    model: Network,
    rng: ChaCha8Rng,
    data: Vec<(Vec<f32>, Vec<f32>)>,
    train_indexes: Vec<usize>,
    test_indexes: Vec<usize>,
    eval_test_each_epoch: bool,
}

impl TrainingCore {
    pub fn new(
        model_data: &str,
        source_data: TrainingSource,
        eval_test_each_epoch: bool,
    ) -> Result<TrainingCore, EngineError> {
        let config: NeuralNetworkIn = serde_json::from_str(model_data).map_err(|e| {
            EngineError::Config(format!("Error al deserializar el json del modelo: {e}"))
        })?;

        let loss_fn = loss_from_name(&config.loss_fn)?;
        ensure_trainable(&config.topology)?;

        let mut rng = ChaCha8Rng::seed_from_u64(config.seed);
        let model = Network::random(&mut rng, &config.topology).map_err(EngineError::Config)?;

        let data = parse_training_data(source_data)?;

        let split_point = (data.len() as f32 * config.training_split) as usize;
        if split_point == 0 || split_point >= data.len() {
            return Err(EngineError::EmptySplit);
        }

        let mut indexes_list: Vec<usize> = (0..data.len()).collect();
        indexes_list.shuffle(&mut rng);

        let (train_indexes, test_indexes) = indexes_list.split_at(split_point);

        Ok(TrainingCore {
            config,
            loss_fn,
            model,
            rng,
            data,
            train_indexes: train_indexes.to_vec(),
            test_indexes: test_indexes.to_vec(),
            eval_test_each_epoch,
        })
    }

    pub fn epochs(&self) -> usize {
        self.config.epochs
    }

    pub fn train_rows(&self) -> usize {
        self.train_indexes.len()
    }

    pub fn test_rows(&self) -> usize {
        self.test_indexes.len()
    }

    pub fn epoch(&mut self, epoch_index: usize) -> Result<(f32, Option<f32>), EngineError> {
        self.train_indexes.shuffle(&mut self.rng);

        let mut train_loss_mean: f32 = 0.0;
        let mut examples_seen: usize = 0;

        for &index in self.train_indexes.iter() {
            let (input, target) = &self.data[index];

            let example_loss = self
                .model
                .train(input, target, self.loss_fn.as_ref(), self.config.lr)
                .map_err(EngineError::Shape)?;

            train_loss_mean += (example_loss - train_loss_mean) / (examples_seen + 1) as f32;
            examples_seen += 1;
        }

        if !self.model.parameters_are_finite() {
            return Err(EngineError::Divergence(epoch_index + 1));
        }

        let test_loss = if self.eval_test_each_epoch {
            Some(self.mean_loss_on(&self.test_indexes)?)
        } else {
            None
        };

        Ok((train_loss_mean, test_loss))
    }

    fn mean_loss_on(&self, indexes: &[usize]) -> Result<f32, EngineError> {
        let mut mean: f32 = 0.0;
        let mut seen: usize = 0;

        for &index in indexes {
            let (input, target) = &self.data[index];
            let input_matrix =
                Matrix::from_slice(input.len(), 1, input).map_err(EngineError::Shape)?;
            let (result, _) = self.model.forward(&input_matrix).map_err(EngineError::Shape)?;
            let expected_matrix =
                Matrix::from_slice(target.len(), 1, target).map_err(EngineError::Shape)?;

            let example_loss = self
                .loss_fn
                .get_loss(&result, &expected_matrix)
                .map_err(EngineError::Shape)?;

            if !example_loss.is_finite() {
                return Err(EngineError::Unexpected(
                    "La pérdida de test dejó de ser finita".to_string(),
                ));
            }

            mean += (example_loss - mean) / (seen + 1) as f32;
            seen += 1;
        }

        Ok(mean)
    }

    pub fn outcome(&self) -> Result<TrainingOutcome, EngineError> {
        let test_data: Vec<(&Vec<f32>, &Vec<f32>)> = self
            .test_indexes
            .iter()
            .map(|&index| (&self.data[index].0, &self.data[index].1))
            .collect();

        let (mse_loss, r_square, accuracy) = evaluate_training_results(&self.model, &test_data)?;

        Ok(TrainingOutcome {
            network: self.model.to_layer_send_information(),
            mse_loss,
            r_square,
            accuracy,
            split: SplitInfo {
                train_rows: self.train_indexes.len(),
                test_rows: self.test_indexes.len(),
            },
        })
    }
}

pub fn create_and_train(
    model_data: String,
    source_data: TrainingSource,
) -> Result<TrainingOutcome, EngineError> {
    let mut core = TrainingCore::new(&model_data, source_data, false)?;

    for epoch in 0..core.epochs() {
        core.epoch(epoch)?;
    }

    core.outcome()
}

fn evaluate_training_results(
    model: &Network,
    test_data: &[(&Vec<f32>, &Vec<f32>)],
) -> Result<(f32, f32, f32), EngineError> {
    if test_data.is_empty() {
        return Err(EngineError::Dataset(
            "No hay ejemplos de test para evaluar".to_string(),
        ));
    }

    let mut mse_mean: f32 = 0.0;
    let mut examples_seen: usize = 0;
    let mut ss_res: f32 = 0.0;
    let mut expected_mean: f32 = 0.0;
    let mut expected_m2: f32 = 0.0;
    let mut expected_count: usize = 0;
    let mut correct_predictions: usize = 0;

    for (input, target) in test_data.iter() {
        let input_matrix = Matrix::from_slice(input.len(), 1, input).map_err(EngineError::Shape)?;
        let (result, _) = model.forward(&input_matrix).map_err(EngineError::Shape)?;
        let expected_matrix =
            Matrix::from_slice(target.len(), 1, target).map_err(EngineError::Shape)?;

        if result.rows() != target.len() {
            return Err(EngineError::Shape(
                "El numero de valores del output no coincide con el numero de neuronas de la capa de salida"
                    .to_string(),
            ));
        }

        let example_mse = MSELoss
            .get_loss(&result, &expected_matrix)
            .map_err(EngineError::Shape)?;

        if !example_mse.is_finite() {
            return Err(EngineError::Unexpected(
                "La pérdida de test dejó de ser finita".to_string(),
            ));
        }

        mse_mean += (example_mse - mse_mean) / (examples_seen + 1) as f32;
        examples_seen += 1;

        for (predicted_value, expected_value) in
            result.values.iter().zip(expected_matrix.values.iter())
        {
            let residual = predicted_value - expected_value;
            ss_res += residual * residual;

            expected_count += 1;
            let delta = expected_value - expected_mean;
            expected_mean += delta / expected_count as f32;
            expected_m2 += delta * (expected_value - expected_mean);
        }

        correct_predictions += classify(&result.values, target);
    }

    let examples = test_data.len() as f32;

    let r_square = if expected_m2 == 0.0 {
        if ss_res == 0.0 {
            1.0
        } else {
            0.0
        }
    } else {
        1.0 - ss_res / expected_m2
    };

    let accuracy = correct_predictions as f32 / examples;

    Ok((mse_mean, r_square, accuracy))
}

fn classify(predicted: &[f32], target: &[f32]) -> usize {
    if target.len() == 1 {
        let predicted_class = predicted[0] >= 0.5;
        let expected_class = target[0] >= 0.5;
        usize::from(predicted_class == expected_class)
    } else {
        usize::from(argmax(predicted) == argmax(target))
    }
}

fn argmax(values: &[f32]) -> usize {
    let mut best_index = 0;
    let mut best_value = f32::NEG_INFINITY;

    for (index, value) in values.iter().enumerate() {
        if *value > best_value {
            best_value = *value;
            best_index = index;
        }
    }

    best_index
}

fn predict_network(network_json: &str, input: &[f32]) -> Result<Vec<f32>, EngineError> {
    let info: NetworkSendInformation = serde_json::from_str(network_json)
        .map_err(|e| EngineError::Unexpected(format!("Error al deserializar la red: {e}")))?;

    let model = Network::from_send_information(&info).map_err(EngineError::Unexpected)?;

    let output = model.forward_vector(input).map_err(EngineError::Shape)?;

    if output.iter().any(|value| !value.is_finite()) {
        return Err(EngineError::Shape(
            "La predicción contiene valores no finitos".to_string(),
        ));
    }

    Ok(output)
}

fn evaluate_network(network_json: &str, dataset_json: &str) -> Result<MetricsOut, EngineError> {
    let info: NetworkSendInformation = serde_json::from_str(network_json)
        .map_err(|e| EngineError::Unexpected(format!("Error al deserializar la red: {e}")))?;

    let model = Network::from_send_information(&info).map_err(EngineError::Unexpected)?;

    let pairs = parse_training_data(TrainingSource::Json(dataset_json.to_string()))?;

    if pairs.is_empty() {
        return Err(EngineError::Dataset(
            "El dataset no contiene filas".to_string(),
        ));
    }

    let data: Vec<(&Vec<f32>, &Vec<f32>)> = pairs.iter().map(|(input, target)| (input, target)).collect();

    let (mse_loss, r_square, accuracy) = evaluate_training_results(&model, &data)?;

    Ok(MetricsOut {
        mse_loss,
        r_square,
        accuracy,
    })
}

#[pyfunction]
pub fn train_json(
    py: Python<'_>,
    model_data: String,
    training_data: String,
) -> PyResult<String> {
    let outcome =
        py.detach(move || create_and_train(model_data, TrainingSource::Json(training_data)))?;

    serde_json::to_string(&outcome)
        .map_err(|e| EngineError::Unexpected(e.to_string()).into_py_err())
}

#[pyfunction]
pub fn train_csv(
    py: Python<'_>,
    model_data: String,
    csv_content: String,
    input_columns: usize,
) -> PyResult<String> {
    let outcome = py.detach(move || {
        create_and_train(
            model_data,
            TrainingSource::Csv {
                content: csv_content,
                input_columns,
            },
        )
    })?;

    serde_json::to_string(&outcome)
        .map_err(|e| EngineError::Unexpected(e.to_string()).into_py_err())
}

#[pyfunction]
pub fn parse_csv(csv_content: &str, input_columns: usize) -> PyResult<Vec<(Vec<f32>, Vec<f32>)>> {
    Ok(process_csv(csv_content, input_columns)?)
}

#[pyfunction]
pub fn predict_json(network_json: String, input: Vec<f32>) -> PyResult<Vec<f32>> {
    Ok(predict_network(&network_json, &input)?)
}

#[pyfunction]
pub fn evaluate_json(
    py: Python<'_>,
    network_json: String,
    dataset_json: String,
) -> PyResult<String> {
    let metrics = py.detach(move || evaluate_network(&network_json, &dataset_json))?;

    serde_json::to_string(&metrics)
        .map_err(|e| EngineError::Unexpected(e.to_string()).into_py_err())
}

#[cfg(test)]
mod tests {
    use super::*;

    const XOR_INPUTS: &str = r#"{
        "inputs": [
            [0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [1.0, 1.0],
            [0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [1.0, 1.0],
            [0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [1.0, 1.0],
            [0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [1.0, 1.0]
        ],
        "expects": [
            [0.0], [1.0], [1.0], [0.0],
            [0.0], [1.0], [1.0], [0.0],
            [0.0], [1.0], [1.0], [0.0],
            [0.0], [1.0], [1.0], [0.0]
        ]
    }"#;

    fn xor_config(seed: u64, epochs: usize, training_split: f32) -> String {
        format!(
            r#"{{
                "layers": [
                    {{ "size": 2, "activation": "Linear" }},
                    {{ "size": 4, "activation": "Tanh" }},
                    {{ "size": 1, "activation": "Tanh" }}
                ],
                "loss_fn": "mse_loss",
                "lr": 0.1,
                "epochs": {epochs},
                "training_split": {training_split},
                "seed": {seed}
            }}"#
        )
    }

    #[test]
    fn test_create_and_train_xor_json() {
        let result = create_and_train(xor_config(42, 500, 0.8), TrainingSource::Json(XOR_INPUTS.to_string()));

        let outcome = result.expect("El entrenamiento falló");
        assert!(!outcome.network.topology.is_empty());
        assert_eq!(outcome.split.train_rows, 12);
        assert_eq!(outcome.split.test_rows, 4);
        assert!(outcome.mse_loss.is_finite());
        assert!(outcome.r_square.is_finite());
        assert!(outcome.accuracy.is_finite());
    }

    #[test]
    fn test_create_and_train_xor_csv() {
        let csv_content = "0.0,0.0,0.0
            0.0,1.0,1.0
            1.0,0.0,1.0
            1.0,1.0,0.0
            0.0,0.0,0.0
            0.0,1.0,1.0
            1.0,0.0,1.0
            1.0,1.0,0.0";

        let source = TrainingSource::Csv {
            content: csv_content.to_string(),
            input_columns: 2,
        };

        let outcome = create_and_train(xor_config(42, 100, 0.8), source)
            .expect("El entrenamiento con CSV falló");

        assert_eq!(outcome.split.train_rows, 6);
        assert_eq!(outcome.split.test_rows, 2);
        assert!(outcome.mse_loss.is_finite());
    }

    #[test]
    fn test_create_and_train_dimension_mismatch() {
        let model_config_json = r#"{
            "layers": [{ "size": 2, "activation": "Tanh" }],
            "loss_fn": "mse_loss",
            "lr": 0.01,
            "epochs": 1,
            "training_split": 0.8,
            "seed": 1
        }"#
        .to_string();

        let training_data_json = r#"{
            "inputs": [[0.0, 0.0], [0.1, 0.2]],
            "expects": [[1.0]]
        }"#
        .to_string();

        let result = create_and_train(model_config_json, TrainingSource::Json(training_data_json));

        match result {
            Err(EngineError::Config(message)) => {
                assert_eq!(
                    message,
                    "La topología necesita al menos una capa de entrada y una de salida"
                );
            }
            other => panic!("Se esperaba EngineError::Config, llegó: {other:?}"),
        }
    }

    #[test]
    fn test_seed_is_required() {
        let model_config_json = r#"{
            "layers": [
                { "size": 2, "activation": "Linear" },
                { "size": 1, "activation": "Tanh" }
            ],
            "loss_fn": "mse_loss",
            "lr": 0.1,
            "epochs": 1,
            "training_split": 0.8
        }"#
        .to_string();

        let result = create_and_train(model_config_json, TrainingSource::Json(XOR_INPUTS.to_string()));

        match result {
            Err(EngineError::Config(message)) => assert!(message.contains("seed")),
            other => panic!("Se esperaba EngineError::Config, llegó: {other:?}"),
        }
    }

    #[test]
    fn test_same_seed_is_deterministic() {
        let first = create_and_train(xor_config(123, 30, 0.8), TrainingSource::Json(XOR_INPUTS.to_string()))
            .expect("Primera corrida falló");
        let second = create_and_train(xor_config(123, 30, 0.8), TrainingSource::Json(XOR_INPUTS.to_string()))
            .expect("Segunda corrida falló");

        let first_json = serde_json::to_string(&first).unwrap();
        let second_json = serde_json::to_string(&second).unwrap();

        assert_eq!(first_json, second_json);
    }

    #[test]
    fn test_different_seeds_differ() {
        let first = create_and_train(xor_config(1, 5, 0.8), TrainingSource::Json(XOR_INPUTS.to_string()))
            .expect("Primera corrida falló");
        let second = create_and_train(xor_config(2, 5, 0.8), TrainingSource::Json(XOR_INPUTS.to_string()))
            .expect("Segunda corrida falló");

        assert_ne!(first.network.weights, second.network.weights);
    }

    #[test]
    fn test_empty_split_is_rejected() {
        let no_test = create_and_train(xor_config(1, 1, 1.0), TrainingSource::Json(XOR_INPUTS.to_string()));
        assert!(matches!(no_test, Err(EngineError::EmptySplit)));

        let four_rows = r#"{
            "inputs": [[0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [1.0, 1.0]],
            "expects": [[0.0], [1.0], [1.0], [0.0]]
        }"#
        .to_string();

        let no_train = create_and_train(xor_config(1, 1, 0.1), TrainingSource::Json(four_rows));
        assert!(matches!(no_train, Err(EngineError::EmptySplit)));
    }

    #[test]
    fn test_softmax_topology_is_rejected() {
        let model_config_json = xor_config(1, 1, 0.8).replace("\"Tanh\" }", "\"SoftMax\" }");

        let result = create_and_train(model_config_json, TrainingSource::Json(XOR_INPUTS.to_string()));

        assert!(matches!(result, Err(EngineError::SoftmaxNotImplemented)));
    }

    #[test]
    fn test_divergence_is_detected() {
        let model_config_json = r#"{
            "layers": [
                { "size": 1, "activation": "Linear" },
                { "size": 1, "activation": "Linear" }
            ],
            "loss_fn": "mse_loss",
            "lr": 100.0,
            "epochs": 200,
            "training_split": 0.8,
            "seed": 1
        }"#
        .to_string();

        let training_data_json = r#"{
            "inputs": [[1.0], [1.0], [1.0], [1.0], [1.0], [1.0], [1.0], [1.0]],
            "expects": [[0.0], [0.0], [0.0], [0.0], [0.0], [0.0], [0.0], [0.0]]
        }"#
        .to_string();

        let result = create_and_train(model_config_json, TrainingSource::Json(training_data_json));

        match result {
            Err(EngineError::Divergence(epoch)) => assert!(epoch >= 1),
            other => panic!("Se esperaba EngineError::Divergence, llegó: {other:?}"),
        }
    }

    #[test]
    fn test_evaluate_json_reproduces_run_metrics() {
        let model_config_json = xor_config(7, 20, 0.8);
        let identical_rows = r#"{
            "inputs": [
                [0.0, 1.0], [0.0, 1.0], [0.0, 1.0], [0.0, 1.0], [0.0, 1.0],
                [0.0, 1.0], [0.0, 1.0], [0.0, 1.0], [0.0, 1.0], [0.0, 1.0]
            ],
            "expects": [
                [1.0], [1.0], [1.0], [1.0], [1.0],
                [1.0], [1.0], [1.0], [1.0], [1.0]
            ]
        }"#
        .to_string();

        let outcome = create_and_train(model_config_json, TrainingSource::Json(identical_rows.clone()))
            .expect("El entrenamiento falló");

        let network_json = serde_json::to_string(&outcome.network).unwrap();
        let metrics = evaluate_network(&network_json, &identical_rows).expect("La evaluación falló");

        assert_eq!(metrics.mse_loss, outcome.mse_loss);
        assert_eq!(metrics.r_square, outcome.r_square);
        assert_eq!(metrics.accuracy, outcome.accuracy);
    }

    #[test]
    fn test_predict_roundtrip() {
        let outcome = create_and_train(xor_config(42, 100, 0.8), TrainingSource::Json(XOR_INPUTS.to_string()))
            .expect("El entrenamiento falló");

        let network_json = serde_json::to_string(&outcome.network).unwrap();

        for input in [[0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [1.0, 1.0]] {
            let output = predict_network(&network_json, &input).expect("La predicción falló");
            assert_eq!(output.len(), 1);
            assert!(output[0].is_finite());
        }
    }

    #[test]
    fn test_predict_rejects_bad_input() {
        let outcome = create_and_train(xor_config(42, 5, 0.8), TrainingSource::Json(XOR_INPUTS.to_string()))
            .expect("El entrenamiento falló");
        let network_json = serde_json::to_string(&outcome.network).unwrap();

        assert!(predict_network(&network_json, &[1.0]).is_err());
        assert!(predict_network(&network_json, &[f32::NAN, 0.0]).is_err());
    }

    #[test]
    fn test_from_send_information_rejects_truncated_weights() {
        let outcome = create_and_train(xor_config(42, 5, 0.8), TrainingSource::Json(XOR_INPUTS.to_string()))
            .expect("El entrenamiento falló");

        let mut info = outcome.network;
        info.weights.pop();

        assert!(Network::from_send_information(&info).is_err());
    }
}
