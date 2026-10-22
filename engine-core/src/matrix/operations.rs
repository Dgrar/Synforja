// Modulo donde se realizaran las operaciones de matrices

use std::vec;

pub struct Matrix {
    rows: usize,      // Numero de columnas
    cols: usize,      // Numero de filas
    values: Vec<f32>, // Valores, van de izquierda a derecha y de arriba a abajo
}

impl Matrix {
    pub fn new(rows: usize, cols: usize, values: Vec<f32>) -> Result<Self, String> {
        if rows * cols != values.len() {
            return Err("Numero de valores no es igual a las dimensiones de la matriz".to_string());
        }
        Ok(Self { rows, cols, values })
    }

    // get_row no necesita result, ya que es solamente llamado por la funcion de multiplicar
    fn get_row(&self, index: usize) -> Result<&[f32], String> {
        if index > self.rows - 1 {
            return Err(format!("No existe la fila {index} en la matrix"));
        }
        let start = index * self.cols;
        Ok(&self.values[start..start + self.cols])
    }

    pub fn multiply(&self, other_matrix: &Matrix) -> Result<Matrix, String> {
        if self.cols != other_matrix.rows {
            return Err("Dimensiones incorrectas, las columnas de la primera matriz no coinciden con las filas de la segunda".to_string());
        }

        // Para multiplicar, lo que puedo hacer es dividir el array en nº de filas partes, en la primera matriz sumar 1 y en la segunda sumar cols

        let mut values = vec![0.0; self.rows * other_matrix.cols];

        for i in 0..self.rows {
            // Recorre todas las filas
            for j in 0..self.cols {
                // Por cada fila, recorre la columna
                let first_value = self.get_row(i).unwrap()[j]; // De la fila i, obtenemos el valor en la posicion j
                for k in 0..other_matrix.cols {
                    // Ahora pasamos en las columnas del otro
                    // El valor en la fila i, posicion k
                    values[i * other_matrix.cols + k] +=
                    // Al primer valor se le multiplica el valor de la fila j, en posicion k
                        first_value * other_matrix.values[j * other_matrix.cols + k]
                }
            }
        }

        Ok(Matrix {
            rows: self.rows,
            cols: other_matrix.cols,
            values,
        })
    }

    pub fn sum(&self, other_matrix: &Matrix) -> Result<Matrix, String> {
        if self.rows != other_matrix.rows || self.cols != other_matrix.cols {
            return Err("Las matrices deben ser de iguales dimensiones".to_string());
        }

        let values = self
            .values
            .iter()
            .zip(&other_matrix.values)
            .map(|(value_1, value_2)| value_1 + value_2)
            .collect();

        Ok(Matrix {
            rows: self.rows,
            cols: self.cols,
            values,
        })
    }

    pub fn sub(&self, other_matrix: &Matrix) -> Result<Matrix, String> {
        if self.rows != other_matrix.rows || self.cols != other_matrix.cols {
            return Err("Las matrices deben ser de iguales dimensiones".to_string());
        }
        let values = self
            .values
            .iter()
            .zip(&other_matrix.values)
            .map(|(value_1, value_2)| value_1 - value_2)
            .collect();

        Ok(Matrix {
            rows: self.rows,
            cols: self.cols,
            values,
        })
    }

    pub fn broadcast_vec(&self, vector: Vec<f32>) -> Result<Matrix, String> {
        if vector.len() != self.rows - 1 {
            return Err("Vector no coincide con el numero de filas".to_string());
        }

        let mut values = vec![0.0; self.rows * self.cols];

        for i in 0..vector.len() {
            for j in 0..self.cols {
                values[self.cols * i + j] = vector[i] + self.values[self.cols * i + j];
            }
        }

        Ok(Matrix {
            rows: self.rows,
            cols: self.cols,
            values,
        })
    }

    pub fn traspose(&self) -> Matrix {
        let mut values: Vec<f32> = vec![0.0; self.values.len()];

        for i in 0..self.rows {
            for j in 0..self.cols {
                values[self.rows * j + i] = self.values[self.cols * i + j]
            }
        }

        Matrix {
            rows: self.cols,
            cols: self.cols,
            values,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matrix_creation() {
        // Podemos hacer unwrap porque sabemos que esta bien creada
        let matrix = Matrix::new(2, 3, vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]).unwrap();
        assert_eq!(matrix.rows, 2);
        assert_eq!(matrix.cols, 3);
    }

    #[test]
    fn test_matrix_creation_wrong_dimensions() {
        // Tiene que fallar ya que deberia haber 2x2=4 valores, y he creado un vector de 3
        let matrix = Matrix::new(2, 2, vec![1.0, 2.0, 3.0]);

        match matrix {
            Ok(_) => panic!(),
            Err(e) => println!("{}", e),
        }
    }

    #[test]
    fn test_get_row() {
        // Sabemos que matriz es correcta, hacemos unwrap, tambien sabemos que las filas existen
        let matrix = Matrix::new(3, 2, vec![10.0, 20.0, 30.0, 40.0, 50.0, 60.0]).unwrap();
        assert_eq!(matrix.get_row(0).unwrap(), &[10.0, 20.0]);
        assert_eq!(matrix.get_row(1).unwrap(), &[30.0, 40.0]);
        assert_eq!(matrix.get_row(2).unwrap(), &[50.0, 60.0]);
    }

    #[test]
    fn test_index_out_of_range() {
        let matrix = Matrix::new(3, 2, vec![10.0, 20.0, 30.0, 40.0, 50.0, 60.0]).unwrap();

        match matrix.get_row(3) {
            Ok(_) => panic!(),
            Err(e) => println!("{e}"),
        }
    }

    mod sum_and_substract {
        use super::*;

        #[test]
        fn test_incompatible_dimentions() {
            let matrix_1 =
                Matrix::new(3, 3, vec![0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]).unwrap();
            let matrix_2 = Matrix::new(3, 2, vec![0.0, 0.0, 0.0, 0.0, 0.0, 0.0]).unwrap();
            let result_matrix = matrix_1.sum(&matrix_2);

            match result_matrix {
                Ok(_) => panic!(),
                Err(e) => println!("{}", e),
            }
        }

        #[test]
        fn test_sum() {
            let matrix_1 = Matrix::new(2, 2, vec![1.0, 3.0, 2.0, 5.0]).unwrap();
            let matrix_2 = Matrix::new(2, 2, vec![3.0, 1.0, 5.0, 1.0]).unwrap();
            // Sabemos que operación esta bien, importa el resultado
            let result = matrix_1.sum(&matrix_2).unwrap();
            // 1+3 = 4 | 3+1 = 4
            // 2+5 = 7 | 5+1 = 6
            assert_eq!(result.values, vec![4.0, 4.0, 7.0, 6.0])
        }

        #[test]
        fn test_sub() {
            let matrix_1 = Matrix::new(2, 2, vec![1.0, 3.0, 2.0, 5.0]).unwrap();
            let matrix_2 = Matrix::new(2, 2, vec![3.0, 1.0, 5.0, 1.0]).unwrap();

            let result = matrix_1.sub(&matrix_2).unwrap();
            // 1-3 = -2 | 3-1 = 2
            // 2-5 = -3 | 5-1 = 4
            assert_eq!(result.values, vec![-2.0, 2.0, -3.0, 4.0])
        }

        #[test]
        fn test_a_minus_a_is_null() {
            let matrix_1 = Matrix::new(2, 2, vec![1.0, 3.0, 2.0, 5.0]).unwrap();

            let result = matrix_1.sub(&matrix_1).unwrap();
            assert_eq!(result.values, vec![0.0, 0.0, 0.0, 0.0])
        }
    }

    mod multiplication {
        use super::*;

        #[test]
        fn test_square_matrices() {
            // Creamos 2 matrices 2x2
            let matrix_1 = Matrix::new(2, 2, vec![1.0, 2.0, 2.0, 2.0]).unwrap();
            let matrix_2 = Matrix::new(2, 2, vec![1.0, 2.0, 1.0, 0.0]).unwrap();

            // (1*1 + 2*1) = 3 | (1*2 + 2*0) = 2
            // (2*1 + 2*1) = 3 | (2*2 + 2*0) = 4
            let result = matrix_1.multiply(&matrix_2).unwrap();

            assert_eq!(result.rows, 2);
            assert_eq!(result.cols, 2);
            assert_eq!(result.values, vec![3.0, 2.0, 4.0, 4.0]);
        }

        #[test]
        fn test_identity_matrix() {
            let matrix = Matrix::new(2, 2, vec![5.0, 6.0, 7.0, 8.0]).unwrap();
            let identity = Matrix::new(2, 2, vec![1.0, 0.0, 0.0, 1.0]).unwrap();

            // Si multiplicamos por la identidad la primera matriz * la identidad debe de ser esa
            let result = matrix.multiply(&identity).unwrap();
            assert_eq!(result.values, matrix.values);
        }
    }

    mod broadcasting {
        use super::*;

        #[test]
        fn test_broadcast_vec_success() {
            // Matriz 3x2 (3 filas, 2 columnas)
            let matrix = Matrix::new(3, 2, vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]).unwrap();
            // El vector debe de medir rows - 1 = 2 elementos
            let vector = vec![10.0, 20.0];

            let result = matrix.broadcast_vec(vector).unwrap();

            // Fila 0 (modificada con 10.0): [1+10, 2+10] = [11.0, 12.0]
            // Fila 1 (modificada con 20.0): [3+20, 4+20] = [23.0, 24.0]
            // Fila 2 (fuera del rango del vector): queda inicializada a 0.0 -> [0.0, 0.0]
            let expected_values = vec![11.0, 12.0, 23.0, 24.0, 0.0, 0.0];

            assert_eq!(result.rows, 3);
            assert_eq!(result.cols, 2);
            assert_eq!(result.values, expected_values);
        }

        #[test]
        fn test_broadcast_vec_wrong_dimensions() {
            let matrix = Matrix::new(3, 2, vec![0.0; 6]).unwrap();
            // Espera tamaño 2 (3 - 1), pasamos 3 para forzar el fallo de dimension
            let vector_incorrecto = vec![1.0, 2.0, 3.0];
            let result = matrix.broadcast_vec(vector_incorrecto);

            match result {
                Ok(_) => panic!(),
                Err(e) => println!("{}", e),
            }
        }

        #[test]
        fn test_broadcast_vec_one_row_edge_case() {
            // Matriz de 1 sola fila implica que rows - 1 = 0 (vector vacío)
            let matrix = Matrix::new(1, 3, vec![5.0, 5.0, 5.0]).unwrap();
            let vector_vacio: Vec<f32> = vec![];

            let result = matrix.broadcast_vec(vector_vacio).unwrap();
            // El bucle no corre, por tanto devuelve el vector de zeros inicializado
            assert_eq!(result.values, vec![0.0, 0.0, 0.0]);
        }
    }
    #[test]
    fn traspose() {
        let test_matrix = Matrix::new(2, 2, vec![1.0, 2.0, 3.0, 1.0]).unwrap();

        let trasposed = test_matrix.traspose();

        // 1.0 | 3.0
        // 2.0 | 1.0

        assert_eq!(trasposed.values, vec![1.0, 3.0, 2.0, 1.0])
    }
}
