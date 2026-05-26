export function calculateSavings(latestData, inputs) {
  if (!latestData || latestData.matched_hours === 0) return null;

  const matchedCons = latestData.matched_consumption || 0;
  const baseSpotEur = latestData.base_spot_cost_eur || 0;
  const durationMonths = latestData.duration_months || 0;

  const taxMultiplier = inputs.inputsAreNet ? 1.0 + inputs.taxRate / 100.0 : 1.0;
  
  // baseSpotEur is always net from the API. If user entered gross values, convert baseSpotEur to gross too.
  const baseSpotEurAdjusted = inputs.inputsAreNet ? baseSpotEur : baseSpotEur * (1.0 + inputs.taxRate / 100.0);

  const grossFixPrice = inputs.inputsAreNet ? inputs.fixPrice * taxMultiplier : inputs.fixPrice;
  const grossFixBase = inputs.inputsAreNet ? inputs.fixBase * taxMultiplier : inputs.fixBase;
  const grossMarkup = inputs.inputsAreNet ? inputs.markup * taxMultiplier : inputs.markup;
  const grossSpotBase = inputs.inputsAreNet ? inputs.spotBase * taxMultiplier : inputs.spotBase;

  const costFixEur = (matchedCons * grossFixPrice) / 100.0 + durationMonths * grossFixBase;
  const costSpotEur = baseSpotEurAdjusted + (matchedCons * grossMarkup) / 100.0 + durationMonths * grossSpotBase;
  const savingsEur = costFixEur - costSpotEur;

  return {
    savingsEur,
    costFixEur,
    costSpotEur
  };
}
