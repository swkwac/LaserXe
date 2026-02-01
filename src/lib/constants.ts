/**
 * UI constants; change here to affect labels app-wide.
 */

/** Set to false when advanced algorithm is stable to hide "(beta)" label everywhere. */
export const SHOW_ADVANCED_BETA_LABEL = true;

/** Label for advanced algorithm: "Zaawansowany (beta)" or "Zaawansowany". */
export function getAdvancedAlgorithmLabel(): string {
  return SHOW_ADVANCED_BETA_LABEL ? "Zaawansowany (beta)" : "Zaawansowany";
}
