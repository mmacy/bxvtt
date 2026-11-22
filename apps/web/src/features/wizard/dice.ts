/**
 * Faces for the ability roll animation.
 *
 * bxapi's ability roll returns each score as a total and keeps the three dice behind it to itself. The wizard
 * still plays the 3d6 tumble, so it shows three faces that add up to the score the server rolled. The total is
 * always the server's. Only the split between the three dice is chosen here.
 */

/**
 * Three d6 faces that add up to a score from 3 to 18.
 *
 * @param score - The rolled score.
 * @param salt - Varies the split between rolls, such as the ability's index.
 */
export function facesForScore(score: number, salt: number): [number, number, number] {
  const total = Math.max(3, Math.min(18, Math.round(score)));
  const faces: [number, number, number] = [0, 0, 0];
  let remaining = total;
  for (let i = 0; i < 3; i += 1) {
    const diceLeft = 2 - i;
    const low = Math.max(1, remaining - diceLeft * 6);
    const high = Math.min(6, remaining - diceLeft);
    // Pick within the range that keeps the rest possible, spread by the salt so rolls don't look alike.
    const span = high - low + 1;
    const face = low + ((salt * 7 + i * 3 + total) % span);
    faces[i] = face;
    remaining -= face;
  }
  return faces;
}
