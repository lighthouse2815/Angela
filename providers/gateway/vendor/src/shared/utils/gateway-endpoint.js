export function gatewayOrigin() {
  return typeof window === "undefined" ? "http://127.0.0.1:1107" : window.location.origin;
}

// Built-in origins belong to Angela. Custom URLs retain their explicit API path.
export function gatewayApiBase(origin = gatewayOrigin()) {
  const url = (origin || "").replace(/\/+$/, "");
  if (!url) return "";
  return /\/(angela1|v1)$/.test(url) ? url : `${url}/angela1`;
}

export function normalizeApiBase(value) {
  const url = (value || "").trim().replace(/\/+$/, "");
  if (!url) return "";
  return /\/(angela1|v1)$/.test(url) ? url : `${url}/v1`;
}
