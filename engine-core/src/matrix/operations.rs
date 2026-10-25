// Modulo donde se realizaran las operaciones de matrices

use std::{rc::Rc, slice::Iter};

#[derive(Clone, Debug)]
pub struct Matrix {
    rows: usize, // Numero de columnas
    cols: usize, // Numero de filas
    // Como se sabe que vamos a tener que clonar las matrices varias veces, usamos un ref counter para que clonar sea O(1)
    pub values: Rc<[f32]>, // Valores, van de izquierda a derecha y de arriba a abajo
}

impl Matrix {
    pub fn new(rows: usize, cols: usize, values: Vec<f32>) -> Result<Self, String> {
        if rows * cols != values.len() {
            return Err("Numero de valores no es igual a las dimensiones de la matriz".to_string());
        }
        Ok(Self {
            rows,
            cols,
            values: Rc::from(values.into_boxed_slice()),
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
        if row * self.cols + col > self.rows * self.cols {
            return ();
        }

        let mut_values = Rc::make_mut(&mut self.values);

        mut_values[row * self.cols + col] = value;
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
            values: Rc::from(values.into_boxed_slice()),
        })
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
            values: Rc::from(values.into_boxed_slice()),
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
            values: Rc::from(values.into_boxed_slice()),
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
            values: Rc::from(values.into_boxed_slice()),
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
            cols: self.rows,
            values: Rc::from(values.into_boxed_slice()),
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
            values: Rc::from(values.into_boxed_slice()),
        }
    }
    pub fn map_with<F>(&self, other: &Matrix, mut f: F) -> Matrix
    where
        F: FnMut(f32, f32) -> f32,
    {
        let values: Vec<f32> = self
            .values
            .iter()
            .zip(&*other.values)
            .map(|(self_val, other_val)| f(*self_val, *other_val))
            .collect();

        Matrix {
            rows: self.rows,
            cols: self.cols,
            values: Rc::from(values.into_boxed_slice()),
        }
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

            // Comparamos los contenidos apuntados por el Rc
            assert_eq!(result.values, matrix.values);
        }
    }

    mod broadcasting {
        use super::*;

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
    fn test_traspose() {
        // Testeamos una matriz no cuadrada (2x3) para asegurar que intercambia filas y columnas correctamente
        let test_matrix = Matrix::new(2, 3, vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]).unwrap();

        let trasposed = test_matrix.traspose();

        // Resultado esperado (3x2):
        // 1.0 | 4.0
        // 2.0 | 5.0
        // 3.0 | 6.0
        assert_eq!(trasposed.rows(), 3);
        assert_eq!(trasposed.cols(), 2);
        assert_eq!(&*trasposed.values, &[1.0, 4.0, 2.0, 5.0, 3.0, 6.0]);
    }
}
