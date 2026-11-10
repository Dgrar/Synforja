#[cfg(test)]
mod live_trainer {
    use crate::nn_config::json_to_nn::{create_and_train, TrainingSource};
    use crate::nn_config::live_trainer::LiveTrainer;
    use crate::EngineError;
    use serde_json::Value;

    const XOR_DATA: &str = r#"{
        "inputs": [
            [0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [1.0, 1.0],
            [0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [1.0, 1.0],
            [0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [1.0, 1.0],
            [0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [1.0, 1.0]
        ],
        "expects": [
            [0.0], [1.0], [1.0], [0.0],
            [0.0], [1.0], [1.0], [0.0],
            [0.0], [1.0], [1.0], [0.0],
            [0.0], [1.0], [1.0], [0.0]
        ]
    }"#;

    const MODEL: &str = r#"{
        "layers": [
            {"size": 2, "activation": "linear"},
            {"size": 4, "activation": "tanh"},
            {"size": 1, "activation": "tanh"}
        ],
        "loss_fn": "mse_loss",
        "lr": 0.2,
        "epochs": 25,
        "training_split": 0.75,
        "seed": 42
    }"#;

    const DIVERGENT_MODEL: &str = r#"{
        "layers": [
            {"size": 1, "activation": "linear"},
            {"size": 1, "activation": "linear"}
        ],
        "loss_fn": "mse_loss",
        "lr": 1.0,
        "epochs": 3,
        "training_split": 0.5,
        "seed": 7
    }"#;

    const DIVERGENT_DATA: &str = r#"{
        "inputs": [
            [1000000.0], [1000000.0], [1000000.0], [1000000.0],
            [1000000.0], [1000000.0], [1000000.0], [1000000.0]
        ],
        "expects": [[0.0], [0.0], [0.0], [0.0], [0.0], [0.0], [0.0], [0.0]]
    }"#;

    fn drain(trainer: &mut LiveTrainer) -> Vec<Value> {
        let mut reports = Vec::new();

        while let Some(json) = trainer.next_epoch_json().unwrap() {
            reports.push(serde_json::from_str(&json).unwrap());
        }

        reports
    }

    #[test]
    fn start_info_reports_epochs_and_actual_split() {
        let trainer = LiveTrainer::from_model_and_source(
            MODEL,
            TrainingSource::Json(XOR_DATA.to_string()),
        )
        .unwrap();

        let start: Value = serde_json::from_str(&trainer.start_info_json().unwrap()).unwrap();

        assert_eq!(start["epochs"], 25);
        assert_eq!(start["train_rows"], 12);
        assert_eq!(start["test_rows"], 4);
    }

    #[test]
    fn next_epoch_yields_every_epoch_once_in_order() {
        let mut trainer = LiveTrainer::from_model_and_source(
            MODEL,
            TrainingSource::Json(XOR_DATA.to_string()),
        )
        .unwrap();

        let reports = drain(&mut trainer);

        let epochs: Vec<u64> = reports.iter().map(|r| r["epoch"].as_u64().unwrap()).collect();
        let expected: Vec<u64> = (1..=25).collect();
        assert_eq!(epochs, expected);

        for report in &reports {
            let loss_train = report["loss_train"].as_f64().unwrap();
            let loss_test = report["loss_test"].as_f64().unwrap();
            assert!(loss_train.is_finite());
            assert!(loss_test.is_finite());
        }

        assert!(trainer.next_epoch_json().unwrap().is_none());
    }

    #[test]
    fn iterated_trainer_matches_one_shot_bit_for_bit() {
        let one_shot = create_and_train(
            MODEL.to_string(),
            TrainingSource::Json(XOR_DATA.to_string()),
        )
        .unwrap();
        let expected = serde_json::to_string(&one_shot).unwrap();

        let mut trainer = LiveTrainer::from_model_and_source(
            MODEL,
            TrainingSource::Json(XOR_DATA.to_string()),
        )
        .unwrap();
        drain(&mut trainer);

        let result = trainer.result_json().unwrap();

        assert_eq!(result, expected);
    }

    #[test]
    fn result_is_rejected_before_exhaustion() {
        let mut trainer = LiveTrainer::from_model_and_source(
            MODEL,
            TrainingSource::Json(XOR_DATA.to_string()),
        )
        .unwrap();

        assert!(matches!(trainer.result_json(), Err(EngineError::Config(_))));

        let _ = trainer.next_epoch_json().unwrap();
        assert!(matches!(trainer.result_json(), Err(EngineError::Config(_))));
    }

    #[test]
    fn divergence_is_reported_as_typed_error_on_pull() {
        let mut trainer = LiveTrainer::from_model_and_source(
            DIVERGENT_MODEL,
            TrainingSource::Json(DIVERGENT_DATA.to_string()),
        )
        .unwrap();

        let mut pulls = 0;
        let error = loop {
            pulls += 1;
            assert!(pulls <= 3, "la divergencia no llegó dentro de las épocas");

            match trainer.next_epoch_json() {
                Ok(Some(_)) => continue,
                Ok(None) => panic!("el entrenamiento terminó sin divergir"),
                Err(error) => break error,
            }
        };

        assert!(
            matches!(error, EngineError::Divergence(epoch) if epoch >= 1 && epoch <= 3),
            "error inesperado: {error:?}"
        );
    }

    #[test]
    fn csv_source_is_accepted_and_reports_split() {
        let csv = "0,0,0\n0,1,1\n1,0,1\n1,1,0\n".repeat(4);
        let mut trainer = LiveTrainer::from_model_and_source(
            MODEL,
            TrainingSource::Csv {
                content: csv,
                input_columns: 2,
            },
        )
        .unwrap();

        let start: Value = serde_json::from_str(&trainer.start_info_json().unwrap()).unwrap();
        assert_eq!(start["train_rows"], 12);
        assert_eq!(start["test_rows"], 4);

        let reports = drain(&mut trainer);
        assert_eq!(reports.len(), 25);
        assert!(trainer.result_json().is_ok());
    }
}
