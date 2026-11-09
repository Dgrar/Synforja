use std::time::Instant;

use engine_core::neural_network::neural_network::{
    Activation, LayerTopology, MSELoss, Network, NetworkSendInformation,
};

fn pseudo_random(seed: u64, count: usize) -> Vec<f32> {
    let mut state = seed;
    (0..count)
        .map(|_| {
            state = state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            ((state >> 33) as f32 / (1u64 << 31) as f32) - 0.5
        })
        .collect()
}

#[test]
#[ignore = "benchmark manual: cargo test --release --test train_bench -- --ignored --nocapture"]
fn bench_train_step_7_64_64_1() {
    let topology = vec![
        LayerTopology { size: 7, activation: Activation::Linear },
        LayerTopology { size: 64, activation: Activation::ReLu },
        LayerTopology { size: 64, activation: Activation::ReLu },
        LayerTopology { size: 1, activation: Activation::Linear },
    ];

    let weights = pseudo_random(7, 7 * 64 + 64 * 64 + 64 * 1);
    let biases = vec![0.01; 64 + 64 + 1];
    let info = NetworkSendInformation { weights, biases, topology };
    let mut network = Network::from_send_information(&info).unwrap();

    let input = pseudo_random(99, 7);
    let target = vec![0.25];
    let loss = MSELoss;

    let steps = 20_000;
    let start = Instant::now();
    let mut error = 0.0;
    for step in 0..steps {
        let offset = (step % 64) as f32 * 0.001;
        let mut sample = input.clone();
        sample[0] += offset;
        error = network.train(&sample, &target, &loss, 0.0001).unwrap();
    }
    let elapsed = start.elapsed();

    println!(
        "steps={steps} total_ms={:.1} us_per_step={:.2} last_error={error}",
        elapsed.as_secs_f64() * 1000.0,
        elapsed.as_secs_f64() * 1_000_000.0 / steps as f64,
    );
}
