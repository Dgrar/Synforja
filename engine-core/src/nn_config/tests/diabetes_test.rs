#[cfg(test)]
mod diabetes {
    use crate::{
        neural_network::neural_network::{
            Accuracy, Activation, BCELoss, LayerTopology, LossFn, MAELoss, MetricFn, Network,
        },
        nn_config::csv_to_json,
        Matrix,
    };
    use rand::{prelude::SliceRandom, SeedableRng};
    use rand_chacha::ChaCha8Rng;
    use std::fs;

    fn evaluate_metrics(model: &Network, data: &[(Vec<f32>, Vec<f32>)]) -> (f32, f32) {
        let mut predictions = Vec::with_capacity(data.len());
        let mut targets = Vec::with_capacity(data.len());

        for (input, target) in data {
            let input_matrix = Matrix::from_slice(input.len(), 1, input).unwrap();
            let (result, _) = model.forward(&input_matrix).unwrap();
            predictions.push(result.get(0, 0).unwrap());
            targets.push(target[0]);
        }

        let predicted_matrix = Matrix::from_slice(data.len(), 1, &predictions).unwrap();
        let expected_matrix = Matrix::from_slice(data.len(), 1, &targets).unwrap();

        (
            MAELoss
                .get_loss(&predicted_matrix, &expected_matrix)
                .unwrap(),
            Accuracy
                .calculate(&predicted_matrix, &expected_matrix)
                .unwrap(),
        )
    }

    fn normalize(data: &mut [(Vec<f32>, Vec<f32>)], mins: &[f32], maxs: &[f32]) {
        for (input, _) in data.iter_mut() {
            for i in 0..mins.len() {
                let range = maxs[i] - mins[i];
                if range > 0.0 {
                    input[i] = (input[i] - mins[i]) / range;
                }
            }
        }
    }

    #[test]
    fn diabetes_test() {
        let dataset = fs::read_to_string(r"src\nn_config\tests\diabetes.csv").unwrap();
        let mut values = csv_to_json::process_csv(&dataset, 8).unwrap();
        let mut rng = ChaCha8Rng::from_seed(Default::default());

        values.shuffle(&mut rng);

        let dataset_size = values.len();
        let train_end = dataset_size * 70 / 100;
        let validation_end = dataset_size * 85 / 100;

        let mut test_set = values.split_off(validation_end);
        let mut validation_set = values.split_off(train_end);
        let mut train_set = values;

        let num_features = 8;
        let mut mins = vec![f32::INFINITY; num_features];
        let mut maxs = vec![f32::NEG_INFINITY; num_features];

        for (input, _) in train_set.iter() {
            for i in 0..num_features {
                mins[i] = mins[i].min(input[i]);
                maxs[i] = maxs[i].max(input[i]);
            }
        }

        normalize(&mut train_set, &mins, &maxs);
        normalize(&mut validation_set, &mins, &maxs);
        normalize(&mut test_set, &mins, &maxs);

        let topology = [
            LayerTopology {
                activation: Activation::ReLu,
                size: 8,
            },
            LayerTopology {
                activation: Activation::ReLu,
                size: 8,
            },
            LayerTopology {
                activation: Activation::Sigmoid,
                size: 1,
            },
        ];

        let mut model = Network::random(&mut rng, &topology).unwrap();
        let mut best_model = model.clone();

        let loss = BCELoss;
        let learning_rate = 0.005;
        let max_epochs = 2000;
        let patience = 150;

        let mut best_validation_mae = f32::INFINITY;
        let mut epochs_without_improvement = 0;

        for epoch in 0..max_epochs {
            train_set.shuffle(&mut rng);

            for (input, target) in train_set.iter() {
                model.train(input, target, &loss, learning_rate).unwrap();
            }

            let (validation_mae, _) = evaluate_metrics(&model, &validation_set);

            if validation_mae < best_validation_mae - 1e-4 {
                best_validation_mae = validation_mae;
                best_model = model.clone();
                epochs_without_improvement = 0;
            } else {
                epochs_without_improvement += 1;
            }

            if epochs_without_improvement >= patience {
                println!("Early stopping en la época {}", epoch);
                break;
            }
        }

        let (test_mae, test_accuracy) = evaluate_metrics(&best_model, &test_set);

        println!(
            "MAE en test: {:.4} | Accuracy en test: {:.3}",
            test_mae, test_accuracy
        );

        assert!(
            test_accuracy >= 0.70,
            "Accuracy de test demasiado baja: {}",
            test_accuracy
        );
        assert!(
            test_mae <= 0.32,
            "MAE de test demasiado alta: {}",
            test_mae
        );
    }
}
