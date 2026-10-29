use crate::matrix::operations::Matrix;
use crate::neural_network::neural_network::*;

#[cfg(test)]
mod tests {

    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn xor_problem() {
        let seeds: [[u8; 32]; 5] = [[42; 32], [7; 32], [123; 32], [200; 32], [99; 32]];

        // Topología: Entrada (2) -> Oculta (3) -> Salida (1, Sigmoid porque tiene que decir que es 0 o 1)
        let topology = vec![
            LayerTopology {
                size: 2,
                activation: Activation::ReLu,
            },
            LayerTopology {
                size: 8,
                activation: Activation::ReLu,
            },
            LayerTopology {
                size: 1,
                activation: Activation::Sigmoid, // Salida acotada entre 0.0 y 1.0
            },
        ];

        // Dataset XOR completo
        let dataset = vec![
            (vec![0.0, 0.0], vec![0.0]),
            (vec![0.0, 1.0], vec![1.0]),
            (vec![1.0, 0.0], vec![1.0]),
            (vec![1.0, 1.0], vec![0.0]),
        ];

        let epochs = 5000;
        let lr = 0.1;
        let loss_fn = MSELoss;

        for seed in seeds {
            let mut rng = ChaCha8Rng::from_seed(seed);
            let mut model = Network::random(&mut rng, &topology).unwrap();

            // Bucle de entrenamiento
            for epoch in 0..epochs {
                let mut epoch_loss = 0.0;

                for (input, target) in &dataset {
                    // Entrenamos con todas las muestras del dataset
                    let loss_val = model
                        .train(input, target, &loss_fn, lr)
                        .expect("Error matemático o de dimensiones durante el entrenamiento");

                    epoch_loss += loss_val;
                }

                if epoch % 1000 == 0 {
                    println!(
                        "Época {} (semilla {}): Pérdida acumulada del dataset = {}",
                        epoch, seed[0], epoch_loss
                    );
                }
            }

            // FASE DE VERIFICACIÓN
            println!("\n--- Verificación de Predicciones XOR ---");
            let epsilon = 0.15;

            for (input, target) in &dataset {
                // Replicamos la misma lógica matricial de entrada que usa tu función `train`
                let input_matrix = Matrix::new(input.len(), 1, input.to_vec()).unwrap();
                let (result_matrix, _) = model.forward(&input_matrix).unwrap();

                let prediction = result_matrix
                    .get(0, 0)
                    .expect("No se pudo extraer el valor escalar de la matriz de predicción");

                let expected_val = target[0];

                println!(
                    "Input: {:?} -> Esperado: {}, Predicción: {:.4}",
                    input, expected_val, prediction
                );

                assert!(
                    (prediction - expected_val).abs() < epsilon,
                    "La red no logró resolver XOR para la entrada {:?}. Esperado: {}, Obtenido: {}",
                    input,
                    expected_val,
                    prediction
                );
            }
        }
    }
}
