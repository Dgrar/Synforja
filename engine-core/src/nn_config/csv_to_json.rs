use crate::*;
use csv::ReaderBuilder;

pub fn process_csv(
    content: &str,
    input_columns: usize,
) -> Result<(Vec<Vec<f32>>, Vec<Vec<f32>>), String> {
    let mut file = ReaderBuilder::new()
        .has_headers(true)
        .from_reader(content.as_bytes());

    let mut inputs = Vec::new();
    let mut outputs = Vec::new();

    for result in file.records() {
        let record = result.map_err(|err| format!("Error en el csv: {}", err))?;

        let mut row: Vec<f32> = record
            .iter()
            .map(|field| {
                field.trim().parse::<f32>().map_err(|_| {
                    "Hubo un error al parsear el csv, asegurese de que todo son números".to_string()
                })
            })
            .collect::<Result<Vec<f32>, String>>()?;

        if row.len() < input_columns {
            return Err("El número de columnas no coincide con las indicadas".to_string());
        }

        let output = row.split_off(input_columns);
        let input = row;

        inputs.push(input);
        outputs.push(output);
    }

    Ok((inputs, outputs))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_csv_success() {
        let csv_content = "input1,input2,output\n0.5,1.5,2.0\n-1.0,0.0,1.0";
        let input_columns = 2;

        let result = process_csv(csv_content, input_columns);

        assert!(result.is_ok(), "El procesamiento del CSV falló");

        let (inputs, outputs) = result.unwrap();

        assert_eq!(inputs.len(), 2, "Debería haber 2 muestras de entrada");
        assert_eq!(outputs.len(), 2, "Debería haber 2 muestras de salida");

        assert_eq!(inputs[0], vec![0.5, 1.5]);
        assert_eq!(outputs[0], vec![2.0]);

        assert_eq!(inputs[1], vec![-1.0, 0.0]);
        assert_eq!(outputs[1], vec![1.0]);
    }

    #[test]
    fn test_process_csv_invalid_number() {
        let csv_content = "in,out\n1.0,2.0\n3.0,no_soy_un_numero";
        let input_columns = 1;

        let result = process_csv(csv_content, input_columns);

        assert!(
            result.is_err(),
            "Se esperaba un error debido al valor no numérico"
        );

        let error_msg = result.err().unwrap();
        assert!(
            error_msg.contains("asegurese de que todo son números"),
            "El mensaje de error no es el esperado: {}",
            error_msg
        );
    }
}
