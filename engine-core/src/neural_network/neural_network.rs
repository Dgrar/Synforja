use std::rc::Rc;

use crate::*;
#[derive(Debug)]
enum Activation {
    ReLu,
    Sigmoid,
    Tanh,
    SoftMax,
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
}
