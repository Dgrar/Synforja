// Modulo donde se realizaran las operaciones de matrices

use crate::matrix::*;

pub struct Matrix {
    rows: usize,      // Numero de columnas
    cols: usize,      // Numero de filas
    values: Vec<f32>, // Valores, van de izquierda a derecha y de arriba a abajo
}

impl Matrix {
    pub fn new(rows: usize, cols: usize, values: Vec<f32>) -> Self {
        assert_eq!(rows * cols, values.len());
        Self { rows, cols, values }
    }

    pub fn get_row(&self, index: usize) -> &[f32] {
        let start = index * self.cols;
        &self.values[start..start + self.cols]
    }

    pub fn multiply(&self, other_matrix: &Matrix) -> Matrix {
        assert_eq!(self.cols, other_matrix.rows, "Dimensiones incorrectas");

        // Para multiplicar, lo que puedo hacer es dividir el array en nº de filas partes, en la primera matriz sumar 1 y en la segunda sumar cols

        let mut values = vec![0.0; self.rows * other_matrix.cols];

        for i in 0..self.rows {
            // Recorre todas las filas
            for j in 0..self.cols {
                // Por cada fila, recorre la columna
                let first_value = self.get_row(i)[j]; // De la fila i, obtenemos el valor en la posicion j
                for k in 0..other_matrix.cols {
                    // Ahora pasamos en las columnas del otro
                    // El valor en la fila i, posicion k
                    values[i * other_matrix.cols + k] +=
                    // Al primer valor se le multiplica el valor de la fila j, en posicion k
                        first_value * other_matrix.values[j * other_matrix.cols + k]
                }
            }
        }

        Matrix {
            rows: self.rows,
            cols: other_matrix.cols,
            values,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matrix_creation() {
        let matrix = Matrix::new(2, 3, vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
        assert_eq!(matrix.rows, 2);
        assert_eq!(matrix.cols, 3);
    }

    #[test]
    #[should_panic]
    fn test_matrix_creation_wrong_dimensions() {
        // Tiene que fallar ya que deberia haber 2x2=4 valores, y he creado un vector de 3
        Matrix::new(2, 2, vec![1.0, 2.0, 3.0]);
    }

    #[test]
    fn test_get_row() {
        let matrix = Matrix::new(3, 2, vec![10.0, 20.0, 30.0, 40.0, 50.0, 60.0]);
        assert_eq!(matrix.get_row(0), &[10.0, 20.0]);
        assert_eq!(matrix.get_row(1), &[30.0, 40.0]);
        assert_eq!(matrix.get_row(2), &[50.0, 60.0]);
    }

    #[test]
    fn test_square_matrices() {
        // Creamos 2 matrices 2x2
        let matrix_1 = Matrix::new(2, 2, vec![1.0, 2.0, 2.0, 2.0]);
        let matrix_2 = Matrix::new(2, 2, vec![1.0, 2.0, 1.0, 0.0]);

        // (1*1 + 2*1) = 3 | (1*2 + 2*0) = 2
        // (2*1 + 2*1) = 3 | (2*2 + 2*0) = 4
        let result = matrix_1.multiply(&matrix_2);

        assert_eq!(result.rows, 2);
        assert_eq!(result.cols, 2);
        assert_eq!(result.values, vec![3.0, 2.0, 4.0, 4.0]);
    }

    #[test]
    fn test_identity_matrix() {
        let matrix = Matrix::new(2, 2, vec![5.0, 6.0, 7.0, 8.0]);
        let identity = Matrix::new(2, 2, vec![1.0, 0.0, 0.0, 1.0]);

        // Si multiplicamos por la identidad la primera matriz * la identidad debe de ser esa
        let result = matrix.multiply(&identity);
        assert_eq!(result.values, matrix.values);
    }

    #[test]
    fn test_non_square_matrices() {
        // Matriz 2x3
        let matrix_1 = Matrix::new(2, 3, vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
        // Matriz 3x2
        let matrix_2 = Matrix::new(3, 2, vec![7.0, 8.0, 9.0, 1.0, 2.0, 3.0]);

        // El resultado debe ser una matriz 2x2
        let result = matrix_1.multiply(&matrix_2);

        assert_eq!(result.rows, 2);
        assert_eq!(result.cols, 2);

        // (1*7 + 2*9 + 3*2) = 31 | (1*8 + 2*1 + 3*3) = 19
        // (4*7 + 5*9 + 6*2) = 85 | (4*8 + 5*1 + 6*3) = 55
        assert_eq!(result.values, vec![31.0, 19.0, 85.0, 55.0]);
    }

    #[test]
    #[should_panic]
    fn test_multiply_incompatible_dimensions() {
        // Tiene que fallar ya que una matrix 2*2 no se puede multiplicar por una 2*3 (2 != 3)
        let matrix_1 = Matrix::new(2, 2, vec![1.0, 2.0, 3.0, 4.0]);
        let matrix_2 = Matrix::new(3, 2, vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);

        matrix_1.multiply(&matrix_2);
    }
}
