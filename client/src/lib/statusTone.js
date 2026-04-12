export function getChecklistTone(status) {
  if (status === "green") return "success";
  if (status === "yellow") return "warning";
  if (status === "red") return "danger";
  return "neutral";
}

export function getChecklistStatusLabel(status) {
  if (status === "green") return "Met";
  if (status === "yellow") return "Partially met";
  if (status === "red") return "Not met";
  return "Pending";
}
