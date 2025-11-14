export function callWindowHandler(handlerName, ...args) {
  if (typeof window === "undefined") return;
  const handler = window?.[handlerName];
  if (typeof handler === "function") {
    handler(...args);
  }
}
