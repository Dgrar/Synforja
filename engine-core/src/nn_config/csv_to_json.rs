use csv::ReaderBuilder;

use crate::EngineError;

type CsvOut = Result<Vec<(Vec<f32>, Vec<f32>)>, EngineError>;

pub fn process_csv(content: &str, input_columns: usize) -> CsvOut {
    let mut file = ReaderBuilder::new()
        .has_headers(false)
        .from_reader(content.as_bytes());

    let mut values = Vec::new();

    for result in file.records() {
        let record =
            result.map_err(|err| EngineError::Dataset(format!("Error en el csv: {err}")))?;

        let mut row: Vec<f32> = record
            .iter()
            .map(|field| {
                field.trim().parse::<f32>().map_err(|_| {
                    EngineError::Dataset(
                        "Hubo un error al parsear el csv, asegurese de que todo son números"
                            .to_string(),
                    )
                })
            })
            .collect::<Result<Vec<f32>, EngineError>>()?;

        if row.len() < input_columns {
            return Err(EngineError::Dataset(
                "El número de columnas no coincide con las indicadas".to_string(),
            ));
        }

        let output = row.split_off(input_columns);
        let input = row;

        if output.is_empty() {
            return Err(EngineError::Dataset(
                "Cada fila necesita al menos una columna de salida".to_string(),
            ));
        }

        values.push((input, output));
    }

    Ok(values)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_csv_success() {
        let csv_content = "0.5,1.5,2.0\n-1.0,0.0,1.0";
        let input_columns = 2;

        let result = process_csv(csv_content, input_columns);

        assert!(result.is_ok(), "El procesamiento del CSV falló");

        let values = result.unwrap();

        assert_eq!(values.len(), 2, "Debería haber 2 muestras");
        assert_eq!(values[0].0.len(), 2, "Debería haber 2 valores de entrada");
        assert_eq!(values[0].1.len(), 1, "Debería haber 1 valor de salida");

        assert_eq!(values[0].0, vec![0.5, 1.5]);
        assert_eq!(values[0].1, vec![2.0]);

        assert_eq!(values[1].0, vec![-1.0, 0.0]);
        assert_eq!(values[1].1, vec![1.0]);
    }

    #[test]
    fn test_process_csv_reads_first_row() {
        let csv_content = "1.0,2.0,3.0";
        let input_columns = 2;

        let values = process_csv(csv_content, input_columns).unwrap();

        assert_eq!(values.len(), 1, "La primera fila no debe descartarse");
        assert_eq!(values[0].0, vec![1.0, 2.0]);
        assert_eq!(values[0].1, vec![3.0]);
    }

    #[test]
    fn test_process_csv_invalid_number() {
        let csv_content = "1.0,2.0\n3.0,no_soy_un_numero";
        let input_columns = 1;

        let result = process_csv(csv_content, input_columns);

        assert!(
            result.is_err(),
            "Se esperaba un error debido al valor no numérico"
        );

        let error_msg = result.err().unwrap().to_string();
        assert!(
            error_msg.contains("asegurese de que todo son números"),
            "El mensaje de error no es el esperado: {}",
            error_msg
        );
    }

    #[test]
    fn test_process_csv_rejects_rows_without_output() {
        let csv_content = "1.0,2.0\n3.0,4.0";
        let input_columns = 2;

        assert!(process_csv(csv_content, input_columns).is_err());
    }
}
