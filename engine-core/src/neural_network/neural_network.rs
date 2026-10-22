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
                        let val = mut_data[row * rows + col];
                        max_val = if val > max_val { val } else { max_val }
                    }
                    let mut exps_sum = 0.0;
                    let mut exps = vec![0.0; cols];

                    for col in 0..cols {
                        let exp_val = (mut_data[row * rows + col] - max_val).exp();
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
                    Err(err) => return None,
                };

                *current_signal = next_signal;

                Some(cache)
            })
            .collect();

        let predictions = caches
            .last()
            .map(|last_cache| last_cache.post_activation.clone())
            .unwrap_or(input.clone());

        Ok((predictions, caches))
    }
}

impl Layer {
    pub fn forward(&self, input: &Matrix) -> Result<(Matrix, LayerCache), String> {
        let new_matrix: Matrix = self.weights.multiply(input)?;

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
mod tests {
    use super::*;
    mod forward {
        use super::*;
        #[test]
        fn forward_pass() {
            let input = Matrix::new(2, 2, vec![0.23, 1.0, 1.0, 0.2]).unwrap();
            let layers = vec![
                Layer {
                    weights: Matrix::new(2, 2, vec![0.0, 0.30, 1.0, 0.1]).unwrap(),
                    bias: vec![0.04, 0.12],
                    activation: Activation::ReLu,
                },
                Layer {
                    weights: Matrix::new(2, 2, vec![0.3, 0.2, 1.0, 0.4]).unwrap(),
                    bias: vec![0.2, 0.15],
                    activation: Activation::Sigmoid,
                },
            ];
            let network = Network { layers };

            let result = network.forward(&input).unwrap();
            println!("{:?}", result.1);
            assert_eq!(
                result.0.values,
                Rc::new(vec![0.5389211, 0.5552732, 0.6063512, 0.61491024])
            );
        }
    }
}
