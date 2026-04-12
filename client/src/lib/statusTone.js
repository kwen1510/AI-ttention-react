export function normalizeChecklistStatus(status) {
  if (status === "green") return "green";
  if (status === "red" || status === "yellow") return "red";
  return "grey";
}

export function getChecklistTone(status) {
  const normalizedStatus = normalizeChecklistStatus(status);
  if (normalizedStatus === "green") return "success";
  if (normalizedStatus === "red") return "danger";
  return "neutral";
}

export function getChecklistStatusLabel(status) {
  const normalizedStatus = normalizeChecklistStatus(status);
  if (normalizedStatus === "green") return "Met";
  if (normalizedStatus === "red") return "Not met";
  return "Pending";
}

export function getChecklistItemClassName(status) {
  const normalizedStatus = normalizeChecklistStatus(status);
  return `checklist-item checklist-item--${normalizedStatus}`;
}

export function getChecklistStatusClassName(status) {
  const normalizedStatus = normalizeChecklistStatus(status);
  return `checklist-item__status checklist-item__status--${normalizedStatus}`;
}
