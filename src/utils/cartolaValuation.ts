export function calcularValorizacaoEstimada(
  pontos: number,
  precoAtual: number,
  variacaoAnterior: number,
  media: number
): number {
  const variacaoAnt = variacaoAnterior ?? 0;
  const mediaSeg = media ?? 0;

  // 1. Ponto de Equilíbrio
  const PE = (precoAtual * 0.47) + (mediaSeg * 0.07);

  // 2. Variação Base
  const variacaoBase = (pontos - PE) / 4.1;

  // 3. Amortecedores
  let variacaoFinal: number;

  if (precoAtual < 6.0) {
    // Caso C: jogadores baratos — sem amortecedores
    variacaoFinal = variacaoBase;
  } else if (variacaoAnt < 0 && variacaoBase < 0) {
    // Caso A: proteção de queda
    variacaoFinal = variacaoBase * 0.4;
  } else if (variacaoAnt > 1.0 && variacaoBase > 0) {
    // Caso B: freio de alta
    variacaoFinal = variacaoBase * 0.8;
  } else {
    variacaoFinal = variacaoBase;
  }

  return Number(variacaoFinal.toFixed(2));
}
