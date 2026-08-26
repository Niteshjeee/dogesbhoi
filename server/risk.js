export function distanceKm(aLat, aLng, bLat, bLng) {
  const r = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * Math.PI / 180) *
    Math.cos(bLat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(x));
}

export function assessSighting({ latitude, longitude, accuracy, previous, corroborator }) {
  const reasons = [];
  let status = 'accepted';
  let confidence = accuracy <= 35 ? 'medium' : 'low';

  if (!previous) {
    status = 'review';
    confidence = 'low';
    reasons.push('first_sighting_requires_review');
  }

  if (accuracy > 150) {
    status = 'review';
    confidence = 'low';
    reasons.push('gps_accuracy_low');
  }

  if (previous) {
    const km = distanceKm(previous.latitude, previous.longitude, latitude, longitude);
    const hours = Math.max((Date.now() - Number(previous.created_at)) / 3_600_000, 1 / 60);
    const speed = km / hours;

    if (hours < 1 && km > 15) reasons.push('large_location_jump');
    if (speed > 120) reasons.push('improbable_speed');

    if (reasons.includes('large_location_jump') || reasons.includes('improbable_speed')) {
      status = 'review';
      confidence = 'low';
    }
  }

  if (status === 'accepted' && corroborator && accuracy <= 60) confidence = 'high';
  return { status, confidence, reasons };
}
