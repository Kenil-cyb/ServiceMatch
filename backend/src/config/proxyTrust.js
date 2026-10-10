export function getTrustedProxyHops(nodeEnvironment = process.env.NODE_ENV) {
  return nodeEnvironment === "production" ? 1 : false;
}
