use std::rc::Rc;

use crate::*;
#[derive(Debug)]
enum Activation {
    ReLu,
    Sigmoid,
    Tanh,
    SoftMax,
}

struct NetworkCharacteristics {
    topology: Vec<LayerTopology>,
    loss_fn: Box<dyn LossFn>,
}

impl Activation {
    fn apply(&self, input: &Matrix) -> Matrix {
        match self {
            Activation::ReLu => input.map(|x| if x > 0.0 { x } else { 0.0 }),
            Activation::Sigmoid => input.map(|x| 1.0 / (1.0 + (-x).exp())),
            Activation::Tanh => input.map(|x| x.tanh()),
            Activation::SoftMax => {
                let mut temp = input.clone();
                let rows = temp.rows();
                let cols = temp.cols();

                let mut_data = Rc::make_mut(&mut temp.values);

                for row in 0..rows {
                    let mut max_val = f32::NEG_INFINITY;
                    for col in 0..cols {
                        // Sabemos que el index va a estar siempre dentro del array
                        let val = mut_data[row * cols + col];
                        max_val = if val > max_val { val } else { max_val }
                    }
                    let mut exps_sum = 0.0;
                    let mut exps = vec![0.0; cols];

                    for col in 0..cols {
                        let exp_val = (mut_data[row * cols + col] - max_val).exp();
                        exps[col] = exp_val;
                        exps_sum += exp_val
                    }

                    for col in 0..cols {
                        let probability = if exps_sum > 0.0 {
                            exps[col] / exps_sum
                        } else {
                            0.0
                        };
                        mut_data[row * cols + col] = probability;
                    }
                }
                temp.clone()
            }
        }
    }
    // mat created es la matriz dada del forward pass != a la de 1 capa
    fn derive(&self, post_activation: &Matrix, mat_created: &Matrix) -> Matrix {
        match self {
            Activation::ReLu => {
                post_activation.map_with(mat_created, |activated_value, created_val| {
                    if activated_value > 0.0 {
                        created_val
                    } else {
                        0.0
                    }
                })
            }
            // Derivada: valor creado * valor de la matriz activada * (1.0 - y)
            Activation::Sigmoid => {
                post_activation.map_with(mat_created, |activated_value, created_val| {
                    created_val * activated_value * (1.0 - activated_value)
                })
            }
            // Derivada: valor creado * (1.0 - (valor de la matriz activada)^2)
            Activation::Tanh => post_activation
                .map_with(mat_created, |activated_value, created_val| {
                    created_val * (1.0 - activated_value.powi(2))
                }),
            Activation::SoftMax => {
                post_activation.map_with(mat_created, |activated_value, created_val| {
                    created_val * activated_value * (1.0 - activated_value)
                })
            }
        }
    }
}

#[derive(Debug)]
struct Network {
    layers: Vec<Layer>,
}
#[derive(Debug)]
struct Layer {
    weights: Matrix,
    bias: Vec<f32>,
    activation: Activation,
}

impl Network {
    pub fn forward(self, input: &Matrix) -> Result<(Matrix, Vec<LayerCache>), String> {
        let caches: Vec<LayerCache> = self
            .layers
            .iter()
            .scan(input.clone(), |current_signal, layer| {
                let (next_signal, cache) = match layer.forward(current_signal) {
                    Ok((mat, lc)) => (mat, lc),
                    Err(_) => return None,
                };

                *current_signal = next_signal;

                Some(cache)
            })
            .collect();
        if caches.len() != self.layers.len() {
            return Err("Hubo un error al hacer el forward pass".to_string());
        }
        let predictions = match caches
            .last()
            .map(|last_cache| last_cache.post_activation.clone())
        {
            Some(pred) => pred,
            None => return Err("Hubo un error al hacer el forward pass".to_string()),
        };

        Ok((predictions, caches))
    }
}

impl Layer {
    pub fn forward(&self, input: &Matrix) -> Result<(Matrix, LayerCache), String> {
        let multiplied_matrix: Matrix = self.weights.multiply(input)?;
        let new_matrix = multiplied_matrix.broadcast_vec(&self.bias)?;

        let activated = self.activation.apply(&new_matrix);

        let layer_cache = LayerCache::new(input.clone(), new_matrix, activated.clone());

        Ok((activated, layer_cache))
    }
}
#[derive(Debug)]
struct LayerCache {
    input_matrix: Matrix,
    pre_activation: Matrix,
    post_activation: Matrix,
}

impl LayerCache {
    fn new(input_matrix: Matrix, pre_activation: Matrix, post_activation: Matrix) -> LayerCache {
        LayerCache {
            input_matrix,
            pre_activation,
            post_activation,
        }
    }
}

struct LayerTopology {
    size: usize,
    activation: Activation,
}

trait LossFn {
    fn get_loss(&self, predicted: &Matrix, expected: &Matrix) -> Result<f32, String>;
}

struct MSELoss;

impl LossFn for MSELoss {
    fn get_loss(&self, predicted: &Matrix, expected: &Matrix) -> Result<f32, String> {
        if predicted.cols() != expected.cols() || predicted.rows() != expected.rows() {
            return Err("Dimensiones incorrectas".to_string());
        }

        Ok(predicted
            .values
            .iter()
            .zip(&*expected.values)
            .map(|(pred_val, expected_val)| (pred_val - expected_val).powi(2))
            .sum::<f32>()
            / (predicted.rows() as f32 * predicted.cols() as f32))
    }
}

#[cfg(test)]
mod test_activations_and_network {
    use super::*;

    mod activations {
        use super::*;

        #[test]
        fn test_relu() {
            let input = Matrix::new(2, 2, vec![-1.5, 2.0, 0.0, -0.5]).unwrap();
            let activated = Activation::ReLu.apply(&input);
            // ReLu convierte todo lo negativo en 0.0 y mantiene lo positivo
            assert_eq!(&*activated.values, &[0.0, 2.0, 0.0, 0.0]);
        }

        #[test]
        fn test_sigmoid() {
            let input = Matrix::new(1, 2, vec![0.0, 2.0]).unwrap();
            let activated = Activation::Sigmoid.apply(&input);

            // Sigmoid(0) = 0.5
            // Sigmoid(2) = 1 / (1 + e^-2) = 0.880797 mas o menos
            let res = &*activated.values;
            assert!((res[0] - 0.5).abs() < 1e-5);
            assert!((res[1] - 0.880797).abs() < 1e-5);
        }

        #[test]
        fn test_tanh() {
            let input = Matrix::new(1, 2, vec![0.0, 1.0]).unwrap();
            let activated = Activation::Tanh.apply(&input);

            // Tanh(0) = 0.0
            // Tanh(1) = 0.761594 mas o menos
            let res = &*activated.values;
            assert!((res[0] - 0.0).abs() < 1e-5);
            assert!((res[1] - 0.761594).abs() < 1e-5);
        }

        #[test]
        fn test_softmax_probability_distribution() {
            let input = Matrix::new(2, 3, vec![1.0, 2.0, 3.0, 5.0, 5.0, 5.0]).unwrap();

            let activated = Activation::SoftMax.apply(&input);
            let res = &*activated.values;

            assert!((res[3] - 0.33333333).abs() < 1e-5);
            assert!((res[4] - 0.33333333).abs() < 1e-5);
            assert!((res[5] - 0.33333333).abs() < 1e-5);

            let sum_row_0 = res[0] + res[1] + res[2];
            let sum_row_1 = res[3] + res[4] + res[5];

            assert!((sum_row_0 - 1.0).abs() < 1e-5, "La fila 0 no suma 1.0");
            assert!((sum_row_1 - 1.0).abs() < 1e-5, "La fila 1 no suma 1.0");
        }
    }

    mod layer_forward {
        use super::*;

        #[test]
        fn test_layer_forward_and_cache() {
            let layer = Layer {
                weights: Matrix::new(2, 2, vec![1.0, 0.0, 0.0, 2.0]).unwrap(),
                bias: vec![0.5, -1.0],
                activation: Activation::ReLu,
            };

            let input = Matrix::new(2, 1, vec![2.0, 1.0]).unwrap();

            let (activated, cache) = layer.forward(&input).unwrap();

            assert_eq!(&*activated.values, &[2.5, 1.0]);

            assert_eq!(&*cache.input_matrix.values, &[2.0, 1.0]);
            assert_eq!(&*cache.pre_activation.values, &[2.5, 1.0]);
            assert_eq!(&*cache.post_activation.values, &[2.5, 1.0]);
        }
    }

    mod network_forward {
        use super::*;

        #[test]
        fn test_empty_network_error() {
            let network = Network { layers: vec![] };
            let input = Matrix::new(2, 2, vec![1.0; 4]).unwrap();

            let result = network.forward(&input);
            assert!(result.is_err());
            assert_eq!(
                result.unwrap_err(),
                "Hubo un error al hacer el forward pass"
            );
        }

        #[test]
        fn test_network_dimensions_mismatch() {
            // La capa 1 espera entrada de 2, pero la capa 2 espera entrada de 3 (Deberia soltar error)
            let layers = vec![
                Layer {
                    weights: Matrix::new(2, 2, vec![1.0; 4]).unwrap(),
                    bias: vec![0.0, 0.0],
                    activation: Activation::ReLu,
                },
                Layer {
                    weights: Matrix::new(2, 3, vec![1.0; 6]).unwrap(),
                    bias: vec![0.0, 0.0],
                    activation: Activation::ReLu,
                },
            ];
            let network = Network { layers };
            let input = Matrix::new(2, 2, vec![1.0; 4]).unwrap();

            let result = network.forward(&input);
            println!("{:?}", result);
            assert!(result.is_err());
        }
    }
    mod loss_functions {
        use super::*;
        #[test]
        fn mse_loss_works() {
            let predicted_matrix = Matrix::new(1, 2, vec![1.0, 2.0]).unwrap();
            let expected_matrix = Matrix::new(1, 2, vec![0.0, 0.0]).unwrap();
            // ((1-0)^2 + (2-0) ^2 ) / 2 = 5/2 = 2.5
            let loss = MSELoss
                .get_loss(&predicted_matrix, &expected_matrix)
                .unwrap_or(0.0);

            assert_eq!(loss, 2.5)
        }
        #[test]
        fn is_reversable() {
            let predicted_matrix = Matrix::new(1, 2, vec![1.0, 2.0]).unwrap();
            let expected_matrix = Matrix::new(1, 2, vec![0.0, 0.0]).unwrap();
            // ((0-1)^2 + (0-2) ^2 ) / 2 = 5/2 = 2.5
            // Al elevar al cuadrado no importa el signo
            let loss = MSELoss
                .get_loss(&expected_matrix, &predicted_matrix)
                .unwrap_or(0.0);

            assert_eq!(loss, 2.5)
        }
        #[test]
        fn err_when_incompatible() {
            let predicted_matrix = Matrix::new(1, 2, vec![1.0, 2.0]).unwrap();
            let expected_matrix = Matrix::new(2, 1, vec![0.0, 0.0]).unwrap();

            let loss = MSELoss.get_loss(&predicted_matrix, &expected_matrix);

            match loss {
                Ok(_) => panic!(),
                Err(err) => println!("Success!: {err}"),
            }
        }
    }
}
