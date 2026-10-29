use crate::matrix::operations::Matrix;
use crate::neural_network::neural_network::*;

#[cfg(test)]
mod tests {
    use super::*;
    use rand::seq::SliceRandom;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;
    use std::f32::consts::PI;

    #[test]
    fn sine_problem() {
        let seeds = [[42; 32], [7; 32], [123; 32], [22; 32]];

        let topology = vec![
            LayerTopology {
                size: 1,
                activation: Activation::Tanh,
            },
            LayerTopology {
                size: 32,
                activation: Activation::Tanh,
            },
            LayerTopology {
                size: 1,
                activation: Activation::Linear,
            },
        ];

        let samples = 50;
        let mut dataset: Vec<(Vec<f32>, Vec<f32>)> = (0..samples)
            .map(|i| {
                let x = -PI + (2.0 * PI) * (i as f32) / ((samples - 1) as f32);
                (vec![x], vec![x.sin()])
            })
            .collect();

        let epochs = 2500;
        let lr = 0.05;
        let loss_fn = MSELoss;

        for seed in seeds {
            let mut rng = ChaCha8Rng::from_seed(seed);
            dataset.shuffle(&mut rng);

            let split = dataset.len() * 8 / 10;
            let (train, test) = dataset.split_at_mut(split);

            let mut model = Network::random(&mut rng, &topology).unwrap();

            for _ in 0..epochs {
                train.shuffle(&mut rng);

                for (input, target) in train.iter() {
                    model.train(input, target, &loss_fn, lr).unwrap();
                }
            }

            let mut max_error: f32 = 0.0;

            for (input, target) in test.iter() {
                let input_matrix = Matrix::new(input.len(), 1, input.to_vec()).unwrap();
                let (result, _) = model.forward(&input_matrix).unwrap();
                let error = (result.get(0, 0).unwrap() - target[0]).abs();
                max_error = max_error.max(error);
            }

            assert!(
                max_error < 0.15,
                "semilla {}: error máximo en test {}",
                seed[0],
                max_error
            );
            println!("semilla {}: error máximo en test {}", seed[0], max_error);
        }
    }
}
