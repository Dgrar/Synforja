use crate::neural_network::neural_network::*;
use serde::Serialize;
// formato para el json:
// {layers:{[size: 16, activation: Tanh]},loss_fn: "MSELoss", }

#[derive(Debug, Serialize)]
struct TrainingOutcome {
    network: NetworkSendInformation,
    loss_by_epoch: Vec<f32>,
    validation_by_epoch: Vec<f32>,
    mse_loss: f32,
    mae_loss: f32,
    R_square_loss: f32,
}

pub fn create_and_train() {}
