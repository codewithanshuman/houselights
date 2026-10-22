export const factors = ['economic', 'weather', 'competition', 'audience'];
export const defaultCorrelation = [
  [1, .15, .2, .45], [.15, 1, .1, .2], [.2, .1, 1, .3], [.45, .2, .3, 1],
];
export function cholesky(matrix = defaultCorrelation) {
  if (!Array.isArray(matrix) || matrix.length !== 4 || matrix.some(row => !Array.isArray(row) || row.length !== 4))
    throw new Error('Correlation matrix must be 4×4 in economic, weather, competition, audience order.');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    if (!Number.isFinite(matrix[i][j]) || Math.abs(matrix[i][j]) > 1 ||
      Math.abs(matrix[i][j] - matrix[j][i]) > 1e-10 || (i === j && Math.abs(matrix[i][j] - 1) > 1e-10))
      throw new Error('Correlation matrix must be finite, symmetric, bounded and have unit diagonal.');
  }
  const lower = Array.from({ length: 4 }, () => Array(4).fill(0));
  for (let i = 0; i < 4; i++) for (let j = 0; j <= i; j++) {
    let value = matrix[i][j];
    for (let k = 0; k < j; k++) value -= lower[i][k] * lower[j][k];
    if (i === j) {
      if (value <= 1e-9) throw new Error('Correlation matrix must be positive definite.');
      lower[i][j] = Math.sqrt(value);
    } else lower[i][j] = value / lower[j][j];
  }
  return lower;
}
export function correlate(lower, independent) {
  return lower.map((row, i) => row.slice(0, i + 1).reduce((total, coefficient, j) => total + coefficient * independent[j], 0));
}
