use crate::neural_network::neural_network::*;
use crate::Matrix;
use rand::{rng, seq::SliceRandom, RngExt};
use serde::{Deserialize, Serialize};

// Formato correcto para el JSON de model_data:
// {
//   "layers": [{"size": 16, "activation": "Tanh"}],
//   "loss_fn": "mse_loss",
//   "lr": 0.01,
//   "epochs": 100,
//   "training_split": 0.8
// }

#[derive(Debug, Serialize)]
pub struct TrainingOutcome {
    network: NetworkSendInformation,
    mse_loss: f32,
}

#[derive(Deserialize, Debug)]
struct NeuralNetworkIn {
    #[serde(rename = "layers")]
    topology: Vec<LayerTopology>,
    loss_fn: String,
    lr: f32,
    epochs: usize,
    training_split: f32,
}

#[derive(Deserialize, Debug)]
struct TrainingDataIn {
    inputs: Vec<Vec<f32>>,
    expects: Vec<Vec<f32>>,
}

pub fn create_and_train(
    model_data: String,
    training_data_str: String,
) -> Result<TrainingOutcome, String> {
    // Deserializar configuración del modelo
    let config: NeuralNetworkIn = serde_json::from_str(&model_data)
        .map_err(|e| format!("Error al deserializar el json del modelo: {}", e))?;

    // Validar función de pérdida
    let loss_fn: Box<dyn LossFn> = match config.loss_fn.as_str() {
        "mse_loss" | "MSELoss" => Box::from(MSELoss {}),
        _ => return Err("Función no admitida".to_string()),
    };

    let topology = config.topology;
    let mut rng = rng();
    let mut model = Network::random(&mut rng, &topology)?;

    // Deserializar datos de entrenamiento
    let training_data: TrainingDataIn = serde_json::from_str(&training_data_str)
        .map_err(|e| format!("Error al analizar los datos de entrenamiento: {}", e))?;

    if training_data.inputs.len() != training_data.expects.len() {
        return Err("Número de casos de entrada no coincide con los de salida".to_string());
    }

    // Separación de datos (Train / Test)
    let split_point: usize = (training_data.expects.len() as f32 * config.training_split) as usize;

    let mut indexes_list: Vec<usize> = (0..training_data.expects.len()).collect();
    indexes_list.shuffle(&mut rng);

    let practice_indexes = &indexes_list[..split_point];
    let test_indexes = &indexes_list[split_point..];

    let mut practice_data: Vec<(&Vec<f32>, &Vec<f32>)> = practice_indexes
        .iter()
        .map(|&i| (&training_data.inputs[i], &training_data.expects[i]))
        .collect();

    let test_data: Vec<(&Vec<f32>, &Vec<f32>)> = test_indexes
        .iter()
        .map(|&i| (&training_data.inputs[i], &training_data.expects[i]))
        .collect();

    let test_interval = match test_data.len() {
        0..=4999 => 1,
        5000..=24999 => 3,
        25000..=49999 => 5,
        _ => 20,
    };

    // Entrenamiento del modelo
    for epoch in 0..config.epochs {
        practice_data.shuffle(&mut rng);
        for (input, target) in practice_data.iter() {
            model.train(input, target, loss_fn.as_ref(), config.lr)?;
        }

        if epoch % test_interval == 0 {
            let _epoch_loss = evaluate_test_loss(&mut model, &test_data, loss_fn.as_ref())?;
        }
    }

    // Testeo final
    let final_max_error = evaluate_test_loss(&mut model, &test_data, loss_fn.as_ref())?;

    Ok(TrainingOutcome {
        network: model.to_layer_send_information(),
        mse_loss: final_max_error,
    })
}

fn evaluate_test_loss(
    model: &mut Network,
    data: &[(&Vec<f32>, &Vec<f32>)],
    loss_fn: &dyn LossFn,
) -> Result<f32, String> {
    let mut max_error: f32 = 0.0;

    for (input, target) in data.iter() {
        let input_matrix = Matrix::new(input.len(), 1, input.to_vec())?;
        let (result, _) = model.forward(&input_matrix)?;

        let expected_matrix = Matrix::new(target.len(), 1, target.to_vec())?;
        let error: f32 = loss_fn.get_loss(&result, &expected_matrix)?;

        max_error = max_error.max(error);
    }

    Ok(max_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_train_xor() {
        // El json que pasara el backend a rust:
        let model_config_json = r#"{
            "layers": [
                { "size": 2, "activation": "Linear" },
                { "size": 4, "activation": "Tanh" },
                { "size": 1, "activation": "Tanh" }
            ],
            "loss_fn": "mse_loss",
            "lr": 0.1,
            "epochs": 500,
            "training_split": 1.0
        }"#
        .to_string();

        // El json de datos que pasara el backend a rust
        let training_data_json = r#"{
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
        }"#
        .to_string();

        // Ejecutamos función principal
        let result = create_and_train(model_config_json, training_data_json);

        // Comprobamos
        assert!(
            result.is_ok(),
            "El entrenamiento falló con el error: {:?}",
            result.err()
        );

        let outcome = result.unwrap();

        println!("Test exitoso. Pérdida final obtenida: {}", outcome.mse_loss);

        assert!(
            !outcome.network.topology.is_empty(),
            "La red neuronal devuelta no tiene capas"
        );
    }

    #[test]
    fn test_create_and_train_dimension_mismatch() {
        // Test para comprobar que el validador de dimensiones funciona correctamente
        let model_config_json = r#"{
            "layers": [{ "size": 2, "activation": "Tanh" }],
            "loss_fn": "mse_loss",
            "lr": 0.01,
            "epochs": 1,
            "training_split": 0.8
        }"#
        .to_string();

        // Enviamos 2 entradas pero solo 1 salida esperada (provoca error)
        let training_data_json = r#"{
            "inputs": [[0.0, 0.0], [0.1, 0.2]],
            "expects": [[1.0]]
        }"#
        .to_string();

        let result = create_and_train(model_config_json, training_data_json);

        assert!(result.is_err());
        assert_eq!(
            result.err().unwrap(),
            "La topología necesita al menos una capa de entrada y una de salida"
        );
    }
}
