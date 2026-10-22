use crate::*;

struct Network {
    layers: Vec<Layer>,
}

struct Layer {
    weights: Matrix,
    bias: Vec<f32>,
}

impl Network {
    //pub fn forward(self, input: &Matrix) -> Result<Matrix, String> {
    //    Ok(self
    //        .layers
    //        .iter()
    //        .map(|layer| match layer.forward(input) {
    //            Ok(matrix) => return Ok(matrix),
    //            Err(err) => return Err(err),
    //        })
    //        .collect())
    //}
}

impl Layer {
    pub fn forward(&mut self, input: &Matrix) -> Result<Matrix, String> {
        let new_matrix = match self.weights.multiply(input) {
            Ok(matrix) => matrix,
            Err(err) => return Err(err),
        };

        Ok(new_matrix)
    }
}
