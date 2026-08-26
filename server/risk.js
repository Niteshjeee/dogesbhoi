export function distanceKm(aLat, aLng, bLat, bLng) {
  const r = 6371;

  const dLat =
    (bLat - aLat) *
    Math.PI / 180;

  const dLng =
    (bLng - aLng) *
    Math.PI / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * Math.PI / 180) *
    Math.cos(bLat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;

  return 2 * r *
    Math.asin(Math.sqrt(x));
}


export function assessSighting({
  latitude,
  longitude,
  accuracy,
  previous,
  corroborator
}) {
  const reasons = [];

  /*
    IMPORTANT:
    No admin approval is required anymore.

    Every valid sighting is immediately accepted
    and becomes part of public location history.
  */
  const status = 'accepted';

  let confidence =
    accuracy <= 20
      ? 'high'
      : 'medium';


  /*
    We can still FLAG unusual movement,
    but it does NOT hold the location
    for admin approval.
  */
  if (previous) {
    const km =
      distanceKm(
        Number(previous.latitude),
        Number(previous.longitude),
        latitude,
        longitude
      );

    const hours =
      Math.max(
        (
          Date.now() -
          Number(previous.created_at)
        ) / 3_600_000,
        1 / 60
      );

    const speed =
      km / hours;


    if (
      hours < 1 &&
      km > 15
    ) {
      reasons.push(
        'large_location_jump'
      );
    }


    if (
      speed > 120
    ) {
      reasons.push(
        'improbable_speed'
      );
    }


    if (reasons.length) {
      confidence = 'low';
    }
  }


  if (
    !reasons.length &&
    corroborator &&
    accuracy <= 50
  ) {
    confidence = 'high';
  }


  return {
    status,
    confidence,
    reasons
  };
}
