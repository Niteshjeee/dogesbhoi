export function distanceKm(aLat, aLng, bLat, bLng) {
  const r = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const x = Math.sin(dLat/2) ** 2 + Math.cos(aLat*Math.PI/180) * Math.cos(bLat*Math.PI/180) * Math.sin(dLng/2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(x));
}

export function assessSighting({ latitude, longitude, accuracy, previous, corroborator }) {
  const reasons = [];
  if (accuracy > 150) reasons.push('gps_accuracy_low');
  let confidence = accuracy <= 35 ? 'medium' : 'low';
  let status = accuracy > 500 ? 'review' : 'accepted';

  if (previous) {
    const km = distanceKm(previous.latitude, previous.longitude, latitude, longitude);
    const hours = Math.max((Date.now() - previous.created_at) / 3_600_000, 1 / 60);
    const speed = km / hours;
    if (hours < 1 && km > 15) reasons.push('large_location_jump');
    if (speed > 120) reasons.push('improbable_speed');
    if (reasons.includes('large_location_jump') || reasons.includes('improbable_speed')) status = 'review';
  }

  if (corroborator && accuracy <= 60 && status === 'accepted') confidence = 'high';
  if (status === 'review') confidence = 'low';
  return { status, confidence, reasons };
}
