// Modulo donde se realizaran las operaciones de matrices

use std::sync::Arc;

use rand::{Rng, RngExt};

pub enum Initialization {
    Xavier,
    He,
}

impl Initialization {
    pub fn get_limits(&self, fan_in: usize, fan_out: usize) -> (f32, f32) {
        let limit = match self {
            Initialization::Xavier => (6.0 / (fan_in + fan_out) as f32).sqrt(),
            Initialization::He => (6.0 / fan_in as f32).sqrt(),
        };
        (-limit, limit)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Matrix {
    rows: usize, // Numero de columnas
    cols: usize, // Numero de filas
    // Como se sabe que vamos a tener que clonar las matrices varias veces, usamos un atomic ref counter para que clonar sea O(1) y que sea thread safe
    pub values: Arc<[f32]>, // Valores, van de izquierda a derecha y de arriba a abajo
}

impl Matrix {
    pub fn new(rows: usize, cols: usize, values: Vec<f32>) -> Result<Self, String> {
        if rows * cols != values.len() {
            return Err("Numero de valores no es igual a las dimensiones de la matriz".to_string());
        }
        Ok(Self {
            rows,
            cols,
            values: Arc::from(values.into_boxed_slice()),
        })
    }

    pub fn from_random(
        rng: &mut dyn Rng,
        rows: usize,
        cols: usize,
        initialization: Initialization,
    ) -> Result<Matrix, String> {
        if rows == 0 || cols == 0 {
            return Err(
                "Dimensiones incorrectas al crear la matriz con weights aleatorias".to_string(),
            );
        }

        let (bottom_limit, top_limit) = initialization.get_limits(cols, rows);
        let values: Vec<f32> = (0..rows * cols)
            .map(|_| rng.random_range(bottom_limit..top_limit))
            .collect();

        Matrix::new(rows, cols, values)
    }
    pub fn from_slice(rows: usize, cols: usize, values: &[f32]) -> Result<Matrix, String> {
        if rows * cols != values.len() {
            return Err("Numero de valores no es igual a las dimensiones de la matriz".to_string());
        }
        Ok(Self {
            rows,
            cols,
            values: Arc::from(values),
        })
    }

    pub fn rows(&self) -> usize {
        self.rows
    }
    pub fn cols(&self) -> usize {
        self.cols
    }

    pub fn get(&self, row: usize, col: usize) -> Result<f32, String> {
        if row >= self.rows || col >= self.cols {
            return Err("Elemento en esa posición no existe".to_string());
        }
        Ok(self.values[row * self.cols + col])
    }

    pub fn set(&mut self, row: usize, col: usize, value: f32) {
        if row >= self.rows || col >= self.cols {
            return;
        }

        let mut_values = Arc::make_mut(&mut self.values);

        mut_values[row * self.cols + col] = value;
    }
    // get_row no necesita result, ya que es solamente llamado por la funcion de multiplicar
    #[cfg(test)]
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

        // Asignamos las dimensiones de la matriz final
        let out_rows = self.rows;
        let out_cols = other_matrix.cols;
        let inner_dim = self.cols;

        // Creamos el vector que almacenará los resultados
        let mut values = vec![0.0; out_rows * out_cols];

        // Obtenemos acceso directo a los arrays de los valores de las 2 matrices
        let self_vals = &*self.values;
        let other_vals = &*other_matrix.values;

        if out_cols == 1 {
            for i in 0..out_rows {
                let self_row_start = i * inner_dim;
                let mut acc = 0.0;

                for k in 0..inner_dim {
                    let a_val = self_vals[self_row_start + k];

                    if a_val != 0.0 {
                        acc += a_val * other_vals[k];
                    }
                }

                values[i] = acc;
            }

            return Ok(Matrix {
                rows: out_rows,
                cols: 1,
                values: Arc::from(values.into_boxed_slice()),
            });
        }

        // Pasamos por cada una de las filas de la primera matriz
        for i in 0..out_rows {
            let self_row_start = i * inner_dim;
            let dest_row_start = i * out_cols;

            // Pasamos por los elementos de la fila actual
            for k in 0..inner_dim {
                let a_val = self_vals[self_row_start + k];

                // Si el valor del elemento que opera es 0 pasamos
                if a_val == 0.0 {
                    continue;
                }

                let other_row_start = k * out_cols;

                // Delimitamos los segmentos de la fila destino y de la fila de la segunda matriz
                let dest_slice = &mut values[dest_row_start..dest_row_start + out_cols];
                let other_slice = &other_vals[other_row_start..other_row_start + out_cols];

                // Multiplicamos el elemento por toda la fila correspondiente de la segunda matriz y lo acumulamos
                for j in 0..out_cols {
                    dest_slice[j] += a_val * other_slice[j];
                }
            }
        }

        Ok(Matrix {
            rows: out_rows,
            cols: out_cols,
            values: Arc::from(values.into_boxed_slice()),
        })
    }

    pub fn multiply_transposed(&self, other_matrix: &Matrix) -> Result<Matrix, String> {
        if self.cols != other_matrix.cols {
            return Err(
                "Dimensiones incorrectas, las columnas de ambas matrices no coinciden".to_string(),
            );
        }

        let out_rows = self.rows;
        let out_cols = other_matrix.rows;
        let inner_dim = self.cols;

        let mut values = vec![0.0; out_rows * out_cols];

        let self_vals = &*self.values;
        let other_vals = &*other_matrix.values;

        for i in 0..out_rows {
            let self_row_start = i * inner_dim;
            let dest_row_start = i * out_cols;

            for k in 0..inner_dim {
                let a_val = self_vals[self_row_start + k];

                if a_val == 0.0 {
                    continue;
                }

                let other_row_start = k * out_cols;
                let dest_slice = &mut values[dest_row_start..dest_row_start + out_cols];
                let other_slice = &other_vals[other_row_start..other_row_start + out_cols];

                for j in 0..out_cols {
                    dest_slice[j] += a_val * other_slice[j];
                }
            }
        }

        Ok(Matrix {
            rows: out_rows,
            cols: out_cols,
            values: Arc::from(values.into_boxed_slice()),
        })
    }

    pub fn transpose_multiply(&self, other_matrix: &Matrix) -> Result<Matrix, String> {
        if self.rows != other_matrix.rows {
            return Err(
                "Dimensiones incorrectas, las filas de ambas matrices no coinciden".to_string(),
            );
        }

        let out_rows = self.cols;
        let out_cols = other_matrix.cols;
        let inner_dim = self.rows;

        let mut values = vec![0.0; out_rows * out_cols];

        let self_vals = &*self.values;
        let other_vals = &*other_matrix.values;

        if out_cols == 1 {
            for i in 0..out_rows {
                let mut acc = 0.0;

                for k in 0..inner_dim {
                    let a_val = self_vals[k * out_rows + i];

                    if a_val != 0.0 {
                        acc += a_val * other_vals[k];
                    }
                }

                values[i] = acc;
            }

            return Ok(Matrix {
                rows: out_rows,
                cols: 1,
                values: Arc::from(values.into_boxed_slice()),
            });
        }

        for i in 0..out_rows {
            let dest_row_start = i * out_cols;

            for k in 0..inner_dim {
                let a_val = self_vals[k * out_rows + i];

                if a_val == 0.0 {
                    continue;
                }

                let other_row_start = k * out_cols;
                let dest_slice = &mut values[dest_row_start..dest_row_start + out_cols];
                let other_slice = &other_vals[other_row_start..other_row_start + out_cols];

                for j in 0..out_cols {
                    dest_slice[j] += a_val * other_slice[j];
                }
            }
        }

        Ok(Matrix {
            rows: out_rows,
            cols: out_cols,
            values: Arc::from(values.into_boxed_slice()),
        })
    }

    pub fn add_bias_in_place(&mut self, bias: &[f32]) -> Result<(), String> {
        if bias.len() != self.rows {
            return Err("El tamaño del bias no coincide con las filas de la matriz".to_string());
        }

        let cols = self.cols;
        let values = Arc::make_mut(&mut self.values);

        for (row, bias_value) in bias.iter().enumerate() {
            let start = row * cols;

            for value in &mut values[start..start + cols] {
                *value += *bias_value;
            }
        }

        Ok(())
    }

    pub fn sub_scaled_in_place(
        &mut self,
        other_matrix: &Matrix,
        scalar: f32,
    ) -> Result<(), String> {
        if self.rows != other_matrix.rows || self.cols != other_matrix.cols {
            return Err("Las matrices deben ser de iguales dimensiones".to_string());
        }

        let values = Arc::make_mut(&mut self.values);

        for (value, delta) in values.iter_mut().zip(&*other_matrix.values) {
            *value -= *delta * scalar;
        }

        Ok(())
    }

    pub fn map_in_place<F>(&mut self, mut f: F)
    where
        F: FnMut(f32) -> f32,
    {
        for value in Arc::make_mut(&mut self.values).iter_mut() {
            *value = f(*value);
        }
    }

    pub fn sum(&self, other_matrix: &Matrix) -> Result<Matrix, String> {
        if self.rows != other_matrix.rows || self.cols != other_matrix.cols {
            return Err("Las matrices deben ser de iguales dimensiones".to_string());
        }

        let values: Vec<f32> = self
            .values
            .iter()
            .zip(&*other_matrix.values)
            .map(|(value_1, value_2)| value_1 + value_2)
            .collect();

        Ok(Matrix {
            rows: self.rows,
            cols: self.cols,
            values: Arc::from(values.into_boxed_slice()),
        })
    }

    pub fn sub(&self, other_matrix: &Matrix) -> Result<Matrix, String> {
        if self.rows != other_matrix.rows || self.cols != other_matrix.cols {
            return Err("Las matrices deben ser de iguales dimensiones".to_string());
        }
        let values: Vec<f32> = self
            .values
            .iter()
            .zip(&*other_matrix.values)
            .map(|(value_1, value_2)| value_1 - value_2)
            .collect();

        Ok(Matrix {
            rows: self.rows,
            cols: self.cols,
            values: Arc::from(values.into_boxed_slice()),
        })
    }

    pub fn broadcast_vec(&self, vector: &Vec<f32>) -> Result<Matrix, String> {
        if vector.len() != self.rows {
            return Err(
                "El tamaño del vector no coincide con el número de filas de la matriz".to_string(),
            );
        }

        let mut values = vec![0.0; self.rows * self.cols];

        for i in 0..self.rows {
            for j in 0..self.cols {
                values[self.cols * i + j] = vector[i] + self.values[self.cols * i + j];
            }
        }

        Ok(Matrix {
            rows: self.rows,
            cols: self.cols,
            values: Arc::from(values.into_boxed_slice()),
        })
    }

    pub fn multiply_scalar(&self, scalar: f32) -> Matrix {
        let values: Vec<f32> = self.values.iter().map(|value| scalar * value).collect();

        Matrix {
            rows: self.rows,
            cols: self.cols,
            values: Arc::from(values.into_boxed_slice()),
        }
    }

    pub fn row_sums(&self) -> Vec<f32> {
        let mut result = Vec::with_capacity(self.rows);
        let self_vals = &*self.values;

        for i in 0..self.rows {
            let start = i * self.cols;
            let end = start + self.cols;

            let sum: f32 = self_vals[start..end].iter().sum();
            result.push(sum);
        }

        result
    }

    pub fn transpose(&self) -> Matrix {
        let mut values: Vec<f32> = vec![0.0; self.values.len()];

        for i in 0..self.rows {
            for j in 0..self.cols {
                values[self.rows * j + i] = self.values[self.cols * i + j]
            }
        }

        Matrix {
            rows: self.cols,
            cols: self.rows,
            values: Arc::from(values.into_boxed_slice()),
        }
    }

    pub fn map<F>(&self, mut f: F) -> Matrix
    where
        F: FnMut(f32) -> f32,
    {
        let values: Vec<f32> = self.values.iter().map(|val| f(*val)).collect();

        Matrix {
            rows: self.rows,
            cols: self.cols,
            values: Arc::from(values.into_boxed_slice()),
        }
    }
    pub fn map_with<F>(&self, other: &Matrix, mut f: F) -> Result<Matrix, String>
    where
        F: FnMut(f32, f32) -> f32,
    {
        if other.rows != self.rows || other.cols != self.cols {
            return Err("Las dimensiones no coinciden".to_string());
        }

        let values: Vec<f32> = self
            .values
            .iter()
            .zip(&*other.values)
            .map(|(self_val, other_val)| f(*self_val, *other_val))
            .collect();

        Ok(Matrix {
            rows: self.rows,
            cols: self.cols,
            values: Arc::from(values.into_boxed_slice()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matrix_creation() {
        let matrix = Matrix::new(2, 3, vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]).unwrap();
        assert_eq!(matrix.rows(), 2);
        assert_eq!(matrix.cols(), 3);
    }

    #[test]
    fn test_matrix_creation_wrong_dimensions() {
        let matrix = Matrix::new(2, 2, vec![1.0, 2.0, 3.0]);
        assert!(matrix.is_err());
    }

    #[test]
    fn test_get_row() {
        let matrix = Matrix::new(3, 2, vec![10.0, 20.0, 30.0, 40.0, 50.0, 60.0]).unwrap();
        assert_eq!(matrix.get_row(0).unwrap(), &[10.0, 20.0]);
        assert_eq!(matrix.get_row(1).unwrap(), &[30.0, 40.0]);
        assert_eq!(matrix.get_row(2).unwrap(), &[50.0, 60.0]);
    }

    #[test]
    fn test_index_out_of_range() {
        let matrix = Matrix::new(3, 2, vec![10.0, 20.0, 30.0, 40.0, 50.0, 60.0]).unwrap();
        assert!(matrix.get_row(3).is_err());
    }

    mod sum_and_substract {
        use super::*;

        #[test]
        fn test_incompatible_dimentions() {
            let matrix_1 = Matrix::new(3, 3, vec![0.0; 9]).unwrap();
            let matrix_2 = Matrix::new(3, 2, vec![0.0; 6]).unwrap();
            assert!(matrix_1.sum(&matrix_2).is_err());
        }

        #[test]
        fn test_sum() {
            let matrix_1 = Matrix::new(2, 2, vec![1.0, 3.0, 2.0, 5.0]).unwrap();
            let matrix_2 = Matrix::new(2, 2, vec![3.0, 1.0, 5.0, 1.0]).unwrap();
            let result = matrix_1.sum(&matrix_2).unwrap();
            assert_eq!(&*result.values, &[4.0, 4.0, 7.0, 6.0]);
        }

        #[test]
        fn test_sub() {
            let matrix_1 = Matrix::new(2, 2, vec![1.0, 3.0, 2.0, 5.0]).unwrap();
            let matrix_2 = Matrix::new(2, 2, vec![3.0, 1.0, 5.0, 1.0]).unwrap();
            let result = matrix_1.sub(&matrix_2).unwrap();
            assert_eq!(&*result.values, &[-2.0, 2.0, -3.0, 4.0]);
        }

        #[test]
        fn test_a_minus_a_is_null() {
            let matrix_1 = Matrix::new(2, 2, vec![1.0, 3.0, 2.0, 5.0]).unwrap();
            let result = matrix_1.sub(&matrix_1).unwrap();
            assert_eq!(&*result.values, &[0.0, 0.0, 0.0, 0.0]);
        }
    }

    mod multiplication {
        use super::*;

        #[test]
        fn test_square_matrices() {
            let matrix_1 = Matrix::new(2, 2, vec![1.0, 2.0, 2.0, 2.0]).unwrap();
            let matrix_2 = Matrix::new(2, 2, vec![1.0, 2.0, 1.0, 0.0]).unwrap();
            let result = matrix_1.multiply(&matrix_2).unwrap();

            // CORREGIDO: La multiplicación matemática correcta da:
            // [1*1 + 2*1, 1*2 + 2*0] -> [3.0, 2.0]
            // [2*1 + 2*1, 2*2 + 2*0] -> [4.0, 4.0]
            assert_eq!(result.rows(), 2);
            assert_eq!(result.cols(), 2);
            assert_eq!(&*result.values, &[3.0, 2.0, 4.0, 4.0]);
        }

        #[test]
        fn test_identity_matrix() {
            let matrix = Matrix::new(2, 2, vec![5.0, 6.0, 7.0, 8.0]).unwrap();
            let identity = Matrix::new(2, 2, vec![1.0, 0.0, 0.0, 1.0]).unwrap();
            let result = matrix.multiply(&identity).unwrap();

            // Comparamos los contenidos apuntados por el Arc
            assert_eq!(result.values, matrix.values);
        }
    }

    mod broadcasting_and_scalar {
        use super::*;

        #[test]
        fn scalar_test() {
            let matrix = Matrix::new(2, 2, vec![1.0, 2.0, 3.0, 4.0]).unwrap();

            let result = matrix.multiply_scalar(0.5);

            assert_eq!(&*result.values, [0.5, 1.0, 1.5, 2.0].as_slice())
        }

        #[test]
        fn test_broadcast_vec_success() {
            // Matriz 3x2 (3 filas, 2 columnas)
            let matrix = Matrix::new(3, 2, vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]).unwrap();
            // CORREGIDO: Ahora el vector tiene tamaño coincidente con las filas (3 filas = 3 elementos)
            let vector = vec![10.0, 20.0, 30.0];

            let result = matrix.broadcast_vec(&vector).unwrap();

            // Fila 0 (+10.0): [1+10, 2+10] -> [11.0, 12.0]
            // Fila 1 (+20.0): [3+20, 4+20] -> [23.0, 24.0]
            // Fila 2 (+30.0): [5+30, 6+30] -> [35.0, 36.0]
            let expected_values = vec![11.0, 12.0, 23.0, 24.0, 35.0, 36.0];

            assert_eq!(result.rows(), 3);
            assert_eq!(result.cols(), 2);
            assert_eq!(&*result.values, expected_values.as_slice());
        }

        #[test]
        fn test_broadcast_vec_wrong_dimensions() {
            let matrix = Matrix::new(3, 2, vec![0.0; 6]).unwrap();
            // Pasamos tamaño 2 cuando la matriz espera tamaño 3 (número de filas)
            let vector_incorrecto = vec![1.0, 2.0];
            let result = matrix.broadcast_vec(&vector_incorrecto);

            assert!(result.is_err());
        }

        #[test]
        fn test_broadcast_vec_one_row() {
            let matrix = Matrix::new(1, 3, vec![5.0, 5.0, 5.0]).unwrap();
            let vector = vec![10.0];

            let result = matrix.broadcast_vec(&vector).unwrap();
            assert_eq!(&*result.values, &[15.0, 15.0, 15.0]);
        }
    }

    #[test]
    fn test_transpose() {
        // Testeamos una matriz no cuadrada (2x3) para asegurar que intercambia filas y columnas correctamente
        let test_matrix = Matrix::new(2, 3, vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]).unwrap();

        let transposed = test_matrix.transpose();

        // Resultado esperado (3x2):
        // 1.0 | 4.0
        // 2.0 | 5.0
        // 3.0 | 6.0
        assert_eq!(transposed.rows(), 3);
        assert_eq!(transposed.cols(), 2);
        assert_eq!(&*transposed.values, &[1.0, 4.0, 2.0, 5.0, 3.0, 6.0]);
    }

    #[test]
    fn test_row_sums() {
        let matrix = Matrix::new(2, 2, vec![1.0, 2.0, 3.0, 4.0]).unwrap();

        let result = matrix.row_sums();

        assert_eq!(result, [3.0, 7.0].as_slice())
    }
}
