use rand::prelude::Rng;
use serde::Serialize;
use std::rc::Rc;

use crate::{Initialization, Matrix};
#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum Activation {
    Linear,
    ReLu,
    Sigmoid,
    Tanh,
    SoftMax,
}

impl Activation {
    fn apply(&self, input: &Matrix) -> Matrix {
        match self {
            Activation::Linear => input.clone(),
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
    fn derive(&self, post_activation: &Matrix, mat_created: &Matrix) -> Result<Matrix, String> {
        match self {
            Activation::Linear => Ok(mat_created.clone()),
            Activation::ReLu => Ok(post_activation.map_with(
                mat_created,
                |activated_value, created_val| {
                    if activated_value > 0.0 {
                        created_val
                    } else {
                        0.0
                    }
                },
            )?),
            // Derivada: valor creado * valor de la matriz activada * (1.0 - y)
            Activation::Sigmoid => Ok(post_activation.map_with(
                mat_created,
                |activated_value, created_val| {
                    created_val * activated_value * (1.0 - activated_value)
                },
            )?),
            // Derivada: valor creado * (1.0 - (valor de la matriz activada)^2)
            Activation::Tanh => Ok(post_activation
                .map_with(mat_created, |activated_value, created_val| {
                    created_val * (1.0 - activated_value.powi(2))
                })?),
            Activation::SoftMax => todo!(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Network {
    layers: Vec<Layer>,
    topology: Vec<LayerTopology>,
}
#[derive(Debug, Clone)]
pub struct Layer {
    weights: Matrix,
    bias: Vec<f32>,
    activation: Activation,
}

impl Network {
    pub fn random(rng: &mut dyn Rng, topology: &[LayerTopology]) -> Result<Network, String> {
        if topology.len() < 2 {
            return Err(
                "La topología necesita al menos una capa de entrada y una de salida".to_string(),
            );
        }

        let layers = topology
            .windows(2)
            .map(|layer_topology| {
                let adjusted_topology = LayerTopology {
                    size: layer_topology[0].size,
                    activation: layer_topology[1].activation.clone(),
                };
                Layer::random(rng, adjusted_topology, layer_topology[1].size)
            })
            .collect::<Result<Vec<Layer>, String>>()?;

        Ok(Network {
            layers,
            topology: topology.to_vec(),
        })
    }

    pub fn forward(&self, input: &Matrix) -> Result<(Matrix, Vec<LayerCache>), String> {
        let mut current_signal = input.clone();
        let mut caches = Vec::with_capacity(self.layers.len());

        for layer in &self.layers {
            let (next_signal, cache) = layer
                .forward(&current_signal)
                .map_err(|e| format!("Error en forward de la capa: {}", e))?;

            current_signal = next_signal;
            caches.push(cache);
        }

        let predictions = caches
            .last()
            .map(|last_cache| last_cache.post_activation.clone())
            .ok_or_else(|| "Hubo un error al obtener las predicciones finales".to_string())?;

        Ok((predictions, caches))
    }

    pub fn backward(
        &mut self,
        caches: &[LayerCache],
        expected: &Matrix,
        loss: &dyn LossFn,
        lr: f32,
    ) -> Result<f32, String> {
        if caches.is_empty() || caches.len() != self.layers.len() {
            return Err("Número de caches no corresponde con el número de capas".to_string());
        };

        let predictions = &caches.last().unwrap().post_activation;

        let loss_value = loss.get_loss(predictions, expected)?;

        let mut grad = loss.derivative(predictions, expected)?;

        for (layer, cache) in self.layers.iter_mut().zip(caches).rev() {
            grad = layer.backward(cache, &grad, lr)?;
        }

        Ok(loss_value)
    }

    pub fn train(
        &mut self,
        input: &[f32],
        target: &[f32],
        loss: &dyn LossFn,
        lr: f32,
    ) -> Result<f32, String> {
        if self.layers[0].weights.cols() != input.len() {
            return Err(
                "El numero de valores del input no coincide con el numero de neuronas de la capa de entrada".to_string(),
            );
        }

        let input_matrix = Matrix::new(input.len(), 1, input.to_vec())?;
        let (result, caches) = self.forward(&input_matrix)?;

        if result.rows() != target.len() {
            return Err(
                "El numero de valores del output no coincide con el numero de neuronas de la capa de salida".to_string(),
            );
        }

        let target_matrix = Matrix::new(target.len(), 1, target.to_vec())?;

        let error = self.backward(&caches, &target_matrix, loss, lr)?;

        Ok(error)
    }

    pub fn to_layer_send_information(&self) -> NetworkSendInformation {
        let weights: Vec<f32> = self
            .layers
            .iter()
            .flat_map(|layer| layer.weights.values.to_vec())
            .collect();

        let biases: Vec<f32> = self
            .layers
            .iter()
            .flat_map(|layer| layer.bias.clone())
            .collect();

        NetworkSendInformation {
            weights,
            biases,
            topology: self.topology.clone(),
        }
    }
}

impl Layer {
    pub fn random(
        rng: &mut dyn Rng,
        topology: LayerTopology,
        output_size: usize,
    ) -> Result<Layer, String> {
        if topology.size == 0 || output_size == 0 {
            return Err(
                "Dimensiones incorrectas al crear la red neuronal de forma aleatoria".to_string(),
            );
        }

        let initialization = match topology.activation {
            Activation::ReLu => Initialization::He,
            _ => Initialization::Xavier,
        };

        let weights = Matrix::from_random(rng, output_size, topology.size, initialization)?;
        let bias = vec![0.0; output_size];

        Ok(Layer {
            weights,
            bias,
            activation: topology.activation,
        })
    }

    pub fn forward(&self, input: &Matrix) -> Result<(Matrix, LayerCache), String> {
        let multiplied_matrix: Matrix = self.weights.multiply(input)?;
        let new_matrix = multiplied_matrix.broadcast_vec(&self.bias)?;

        let activated = self.activation.apply(&new_matrix);

        let layer_cache = LayerCache::new(input.clone(), new_matrix, activated.clone());

        Ok((activated, layer_cache))
    }

    pub fn backward(
        &mut self,
        cache: &LayerCache,
        grad_from_above: &Matrix,
        lr: f32,
    ) -> Result<Matrix, String> {
        if self.activation == Activation::SoftMax {
            return Err("Softmax aun no creado".to_string());
        }

        let delta = self
            .activation
            .derive(&cache.post_activation, grad_from_above)?;

        // delta va de derecha a izquierda, entonces hay que trasponer la matriz que va de izquierda a derecha
        let delta_weights = delta.multiply(&cache.input_matrix.transpose())?;

        // Obtenemos los nuevos bias
        let delta_bias = delta.row_sums();

        // Obtenemos la matriz ya cambiada
        let raw_prev = self.weights.transpose().multiply(&delta)?;

        if self.bias.len() != delta_bias.len() {
            return Err(
                "Las dimensiones de la matriz delta no coincide con la original".to_string(),
            );
        }

        // Actualizamos valores de los weights y los bias
        self.bias = self
            .bias
            .iter()
            .zip(&delta_bias)
            .map(|(value, delta_value)| value - delta_value * lr)
            .collect();
        self.weights = self.weights.sub(&delta_weights.multiply_scalar(lr))?;

        Ok(raw_prev)
    }
}
#[derive(Debug)]
pub struct LayerCache {
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

#[derive(Debug, Clone, Serialize)]
pub struct LayerTopology {
    pub size: usize,
    pub activation: Activation,
}

#[derive(Serialize, Debug)]
pub struct NetworkSendInformation {
    weights: Vec<f32>,
    biases: Vec<f32>,
    topology: Vec<LayerTopology>,
}

pub trait LossFn {
    fn get_loss(&self, predicted: &Matrix, expected: &Matrix) -> Result<f32, String>;
    fn derivative(&self, predicted: &Matrix, expected: &Matrix) -> Result<Matrix, String>;
}

pub struct MSELoss;

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

    fn derivative(&self, predicted: &Matrix, expected: &Matrix) -> Result<Matrix, String> {
        if predicted.cols() != expected.cols() || predicted.rows() != expected.rows() {
            return Err("Dimensiones incorrectas".to_string());
        }

        let size = (predicted.rows() * predicted.cols()) as f32;

        Ok(predicted.sub(expected)?.multiply_scalar(2.0 / size))
    }
}

#[cfg(test)]
mod test_activations_and_network {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

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
            println!("{:?}", activated);
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
            let network = Network {
                layers: vec![],
                topology: vec![LayerTopology {
                    size: 1,
                    activation: Activation::Linear,
                }],
            };
            let input = Matrix::new(2, 2, vec![1.0; 4]).unwrap();

            let result = network.forward(&input);
            assert!(result.is_err());
            assert_eq!(
                result.unwrap_err(),
                "Hubo un error al obtener las predicciones finales"
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
            let network = Network {
                layers,
                topology: vec![LayerTopology {
                    size: 1,
                    activation: Activation::Linear,
                }],
            };
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

    mod backward {
        use super::*;

        fn single_neuron_net() -> Network {
            Network {
                layers: vec![Layer {
                    weights: Matrix::new(1, 1, vec![2.0]).unwrap(),
                    bias: vec![0.0],
                    activation: Activation::ReLu,
                }],
                topology: vec![LayerTopology {
                    size: 1,
                    activation: Activation::Linear,
                }],
            }
        }

        fn hidden_net() -> Network {
            Network {
                layers: vec![
                    Layer {
                        weights: Matrix::new(2, 2, vec![0.5, 0.3, 0.2, 0.4]).unwrap(),
                        bias: vec![0.1, 0.1],
                        activation: Activation::ReLu,
                    },
                    Layer {
                        weights: Matrix::new(1, 2, vec![0.3, 0.6]).unwrap(),
                        bias: vec![0.1],
                        activation: Activation::ReLu,
                    },
                ],
                topology: vec![LayerTopology {
                    size: 1,
                    activation: Activation::Linear,
                }],
            }
        }

        fn loss_of(net: &Network, input: &Matrix, expected: &Matrix) -> f32 {
            let (predicted, _) = net.forward(input).unwrap();
            MSELoss.get_loss(&predicted, expected).unwrap()
        }

        #[test]
        fn mse_derivative_matches_hand_computation() {
            let predicted = Matrix::new(1, 2, vec![1.0, 2.0]).unwrap();
            let expected = Matrix::new(1, 2, vec![0.0, 0.0]).unwrap();

            let gradient = MSELoss.derivative(&predicted, &expected).unwrap();

            assert_eq!(gradient.rows(), 1);
            assert_eq!(gradient.cols(), 2);
            assert_eq!(&*gradient.values, &[1.0, 2.0]);
        }

        #[test]
        fn mse_derivative_rejects_incompatible_shapes() {
            let predicted = Matrix::new(1, 2, vec![1.0, 2.0]).unwrap();
            let expected = Matrix::new(2, 1, vec![0.0, 0.0]).unwrap();

            assert!(MSELoss.derivative(&predicted, &expected).is_err());
        }

        #[test]
        fn single_neuron_updates_weight_and_bias() {
            let input = Matrix::new(1, 1, vec![1.0]).unwrap();
            let expected = Matrix::new(1, 1, vec![3.0]).unwrap();
            let mut net = single_neuron_net();

            let (_, caches) = net.forward(&input).unwrap();
            let loss = net.backward(&caches, &expected, &MSELoss, 0.1).unwrap();

            // z = 2*1 + 0 = 2, a = relu(2) = 2, L = (2-3)^2 = 1
            assert!((loss - 1.0).abs() < 1e-6, "loss antes del update: {loss}");

            // delta = 2(a-y) = -2, dW = -2*1 = -2, db = -2
            // w' = 2 - 0.1*(-2) = 2.2
            // b' = 0 - 0.1*(-2) = 0.2
            let weight = net.layers[0].weights.get(0, 0).unwrap();
            assert!(
                (weight - 2.2).abs() < 1e-5,
                "peso esperado 2.2, obtenido {weight}"
            );

            let bias = net.layers[0].bias[0];
            assert!(
                (bias - 0.2).abs() < 1e-5,
                "bias esperado 0.2, obtenido {bias}"
            );

            // z' = 2.2*1 + 0.2 = 2.4, L' = (2.4-3)^2 = 0.36
            let loss_after = loss_of(&net, &input, &expected);
            assert!(
                loss_after < loss,
                "la pérdida debe bajar: {loss} -> {loss_after}"
            );
        }

        #[test]
        fn softmax_backward_is_rejected() {
            let mut net = Network {
                layers: vec![Layer {
                    weights: Matrix::new(1, 1, vec![1.0]).unwrap(),
                    bias: vec![0.0],
                    activation: Activation::SoftMax,
                }],
                topology: vec![LayerTopology {
                    size: 1,
                    activation: Activation::Linear,
                }],
            };
            let input = Matrix::new(1, 1, vec![1.0]).unwrap();
            let expected = Matrix::new(1, 1, vec![1.0]).unwrap();

            let (_, caches) = net.forward(&input).unwrap();

            assert!(net.backward(&caches, &expected, &MSELoss, 0.1).is_err());
        }

        #[test]
        fn gradient_check_weights() {
            let input = Matrix::new(2, 1, vec![1.0, 2.0]).unwrap();
            let expected = Matrix::new(1, 1, vec![1.0]).unwrap();
            let net = hidden_net();

            let (predicted, caches) = net.forward(&input).unwrap();
            let initial_loss = MSELoss.get_loss(&predicted, &expected).unwrap();
            assert!(
                (initial_loss - 0.0144).abs() < 1e-6,
                "pérdida inicial inesperada: {initial_loss}"
            );

            let eps = 1e-2;
            let checks = [(0usize, 0usize, 0usize), (0, 1, 1), (1, 0, 0), (1, 0, 1)];

            for (layer, row, col) in checks {
                let original = net.layers[layer].weights.get(row, col).unwrap();

                let mut plus = net.clone();
                plus.layers[layer].weights.set(row, col, original + eps);
                let loss_plus = loss_of(&plus, &input, &expected);

                let mut minus = net.clone();
                minus.layers[layer].weights.set(row, col, original - eps);
                let loss_minus = loss_of(&minus, &input, &expected);

                let numeric = (loss_plus - loss_minus) / (2.0 * eps);

                // Con lr = 1 el paso aplicado es exactamente -dW
                let mut trained = net.clone();
                trained.backward(&caches, &expected, &MSELoss, 1.0).unwrap();
                let analytic = original - trained.layers[layer].weights.get(row, col).unwrap();

                let relative_error =
                    (numeric - analytic).abs() / (numeric.abs() + analytic.abs()).max(1e-8);

                assert!(
                    relative_error < 1e-2,
                    "capa {layer}, [{row},{col}]: numeric={numeric}, analytic={analytic}, error={relative_error}"
                );
            }
        }
    }
    #[test]
    fn test_network_random_initialization() {
        let seed = [42; 32];
        let mut rng = ChaCha8Rng::from_seed(seed);

        let topology = vec![
            LayerTopology {
                size: 4,
                activation: Activation::ReLu,
            },
            LayerTopology {
                size: 3,
                activation: Activation::Tanh,
            },
            LayerTopology {
                size: 2,
                activation: Activation::Sigmoid,
            },
        ];

        let network_res = Network::random(&mut rng, &topology);

        assert!(
            network_res.is_ok(),
            "La creación de la red falló inesperadamente"
        );
        let network = network_res.unwrap();

        assert_eq!(
            network.layers.len(),
            2,
            "La red debería tener exactamente 2 capas"
        );

        let layer_1 = &network.layers[0];
        assert_eq!(
            layer_1.weights.rows(),
            3,
            "La capa 1 debe tener 3 filas (salidas)"
        );
        assert_eq!(
            layer_1.weights.cols(),
            4,
            "La capa 1 debe tener 4 columnas (entradas)"
        );
        assert_eq!(
            layer_1.bias.len(),
            3,
            "La capa 1 debe tener un vector de bias de tamaño 3"
        );
        assert_eq!(
            layer_1.activation,
            Activation::Tanh,
            "La capa 1 debe heredar la activación Tanh"
        );

        let layer_2 = &network.layers[1];
        assert_eq!(
            layer_2.weights.rows(),
            2,
            "La capa 2 debe tener 2 filas (salidas)"
        );
        assert_eq!(
            layer_2.weights.cols(),
            3,
            "La capa 2 debe tener 3 columnas (entradas)"
        );
        assert_eq!(
            layer_2.bias.len(),
            2,
            "La capa 2 debe tener un vector de bias de tamaño 2"
        );
        assert_eq!(
            layer_2.activation,
            Activation::Sigmoid,
            "La capa 2 debe heredar la activación Sigmoid"
        );

        for layer in &network.layers {
            for &weight_value in layer.weights.values.iter() {
                assert!(
                    weight_value.is_finite(),
                    "Se detectó un peso que no es finito (NaN o Inf)"
                );
            }
        }

        assert_eq!(
            *layer_1.weights.values,
            [
                -0.3544336,
                -0.78365654,
                0.6645522,
                0.49479198,
                0.50934315,
                -0.092546165,
                -0.42321765,
                -0.46464965,
                0.33785284,
                0.5437852,
                -0.88719916,
                0.7682097
            ]
        )
    }
}
