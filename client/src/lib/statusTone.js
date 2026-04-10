export function getChecklistTone(status) {
  if (status === "green") return "success";
  if (status === "yellow") return "warning";
  if (status === "red") return "danger";
  return "neutral";
}
